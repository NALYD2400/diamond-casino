-- ====================================================================
-- DIAMOND ORIGINALS : CRASH — 100 % CÔTÉ SERVEUR
-- ====================================================================
-- Même principe que Mines : le navigateur n'annonce jamais un résultat.
--   * Crash : le point de crash est tiré au départ et gardé secret. Le
--     multiplicateur ne dépend que du temps écoulé côté serveur
--     (m = e^(0,00006 × ms)). L'encaissement est jugé avec l'horloge du
--     serveur : un clic arrivé après le crash est perdu. Un objectif
--     d'encaissement automatique est appliqué même si le joueur ferme
--     l'onglet.
-- Équité prouvable : empreinte SHA-256 donnée avant la partie, graine
-- dévoilée à la fin.
-- ====================================================================

-- --------------------------------------------------------------------
-- 1. Réglages des jeux
-- --------------------------------------------------------------------
create or replace function public.normalize_games_config(p jsonb)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  m jsonb := coalesce(p->'mines', '{}');
  d jsonb := coalesce(p->'doghouse', '{}');
  w jsonb := coalesce(p->'wanted', '{}');
  r jsonb := coalesce(p->'wheel', '{}');
  b jsonb := coalesce(p->'boosters', '{}');
  c jsonb := coalesce(p->'crash', '{}');
  wp jsonb := coalesce(w->'buyPrices', '{}');
  v_min numeric;
begin
  v_min := public.jnum(m, 'minBet', 10, 1, 1000000);
  m := jsonb_build_object(
    'enabled', public.jbool(m, 'enabled', true),
    'minBet', v_min,
    'maxBet', greatest(v_min, public.jnum(m, 'maxBet', 100000, 1, 10000000)),
    'rtp', public.jnum(m, 'rtp', 97, 80, 99.5),
    'maxPayout', public.jnum(m, 'maxPayout', 5000000, 1000, 1000000000)
  );

  v_min := public.jnum(d, 'minBet', 20, 1, 1000000);
  d := jsonb_build_object(
    'enabled', public.jbool(d, 'enabled', true),
    'minBet', v_min,
    'maxBet', greatest(v_min, public.jnum(d, 'maxBet', 100000, 1, 10000000)),
    'buyEnabled', public.jbool(d, 'buyEnabled', true),
    'buyPrice', public.jnum(d, 'buyPrice', 115, 115, 1000),
    'boostEnabled', public.jbool(d, 'boostEnabled', true),
    'maxPayout', public.jnum(d, 'maxPayout', 10000000, 1000, 1000000000)
  );

  v_min := public.jnum(w, 'minBet', 10, 1, 1000000);
  w := jsonb_build_object(
    'enabled', public.jbool(w, 'enabled', true),
    'minBet', v_min,
    'maxBet', greatest(v_min, public.jnum(w, 'maxBet', 100000, 1, 10000000)),
    'buyEnabled', public.jbool(w, 'buyEnabled', true),
    'buyPrices', jsonb_build_object(
      'gtr', public.jnum(wp, 'gtr', 80, 80, 5000),
      'duel', public.jnum(wp, 'duel', 200, 200, 5000),
      'dmh', public.jnum(wp, 'dmh', 400, 400, 5000)
    ),
    'maxPayout', public.jnum(w, 'maxPayout', 10000000, 1000, 1000000000)
  );

  r := jsonb_build_object(
    'enabled', public.jbool(r, 'enabled', true),
    'spinPrice', round(public.jnum(r, 'spinPrice', 25000, 1, 100000000)),
    'maxRtp', public.jnum(r, 'maxRtp', 95, 10, 100)
  );

  b := jsonb_build_object(
    'enabled', public.jbool(b, 'enabled', true),
    'maxRtp', public.jnum(b, 'maxRtp', 90, 10, 100),
    'sellRate', public.jnum(b, 'sellRate', 90, 0, 100)
  );

  -- Crash : RTP arrondi au dixième (le calcul du point de crash est entier)
  v_min := public.jnum(c, 'minBet', 10, 1, 1000000);
  c := jsonb_build_object(
    'enabled', public.jbool(c, 'enabled', true),
    'minBet', v_min,
    'maxBet', greatest(v_min, public.jnum(c, 'maxBet', 100000, 1, 10000000)),
    'rtp', round(public.jnum(c, 'rtp', 97, 80, 99), 1),
    'maxMultiplier', round(public.jnum(c, 'maxMultiplier', 1000, 2, 100000)),
    'maxPayout', public.jnum(c, 'maxPayout', 5000000, 1000, 1000000000)
  );

  return jsonb_build_object('mines', m, 'doghouse', d, 'wanted', w, 'wheel', r, 'boosters', b, 'crash', c);
end;
$$;

update public.casino_settings
set value = public.normalize_games_config(value), updated_at = now()
where key = 'games_config';

-- Nombre entier sur 52 bits tiré d'une graine (équité prouvable, recalculable dans le navigateur)
create or replace function public.seed_int52(p_seed text, p_tag text)
returns bigint
language sql
immutable
set search_path = ''
as $$
  select ('x' || substr(encode(extensions.digest(p_seed || ':' || p_tag, 'sha256'), 'hex'), 1, 13))::bit(52)::bigint;
$$;

-- --------------------------------------------------------------------
-- 2. CRASH
-- --------------------------------------------------------------------
create table if not exists public.crash_rounds (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  bet bigint not null check (bet > 0),
  auto_cashout numeric,
  target numeric not null,
  crash_point numeric not null,
  rtp numeric not null,
  max_payout bigint not null,
  server_seed text not null,
  hash text not null,
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'LOST', 'CASHED')),
  cashout_at numeric,
  win bigint not null default 0,
  started_at timestamptz not null default clock_timestamp(),
  ended_at timestamptz
);
create unique index if not exists crash_rounds_one_active on public.crash_rounds (profile_id) where status = 'ACTIVE';
create index if not exists crash_rounds_profile_idx on public.crash_rounds (profile_id, started_at desc);
create index if not exists crash_rounds_active_idx on public.crash_rounds (started_at) where status = 'ACTIVE';
alter table public.crash_rounds enable row level security;
-- Aucune policy : le point de crash ne doit jamais être lisible par le client.

-- Multiplicateur atteint après p_ms millisecondes (arrondi au centième inférieur)
create or replace function public.crash_multiplier_at(p_ms numeric)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select floor(exp(0.00006 * greatest(p_ms, 0)) * 100) / 100;
$$;

create or replace function public.crash_elapsed_ms(r public.crash_rounds)
returns numeric
language sql
volatile
set search_path = ''
as $$
  select greatest(extract(epoch from clock_timestamp() - r.started_at) * 1000, 0);
$$;

create or replace function public.crash_payload(r public.crash_rounds)
returns jsonb
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_ms numeric := case when r.status = 'ACTIVE' then public.crash_elapsed_ms(r)
                       else extract(epoch from coalesce(r.ended_at, clock_timestamp()) - r.started_at) * 1000 end;
  v_done boolean := r.status <> 'ACTIVE';
begin
  return jsonb_build_object(
    'round_id', r.id,
    'status', r.status,
    'bet', r.bet,
    'auto_cashout', r.auto_cashout,
    'target', r.target,
    'rtp', r.rtp,
    'max_payout', r.max_payout,
    'elapsed_ms', round(v_ms),
    'multiplier', case when r.status = 'ACTIVE' then public.crash_multiplier_at(v_ms)
                       when r.status = 'CASHED' then r.cashout_at else 0 end,
    'cashout_at', r.cashout_at,
    'win', r.win,
    'hash', r.hash,
    'crash_point', case when v_done then r.crash_point end,
    'server_seed', case when v_done then r.server_seed end,
    'started_at', r.started_at
  );
end;
$$;

create or replace function public.crash_finish(p_round public.crash_rounds, p_status text, p_mult numeric)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_round public.crash_rounds := p_round;
  v_profile public.profiles;
  v_mode text;
begin
  if p_status = 'CASHED' then
    v_round.cashout_at := p_mult;
    v_round.win := least(floor(v_round.bet * p_mult), v_round.max_payout)::bigint;
  else
    v_round.cashout_at := null;
    v_round.win := 0;
  end if;

  update public.crash_rounds
  set status = p_status, cashout_at = v_round.cashout_at, win = v_round.win, ended_at = clock_timestamp()
  where id = v_round.id
  returning * into v_round;

  update public.profiles
  set chips = chips + v_round.win,
      total_won = coalesce(total_won, 0) + greatest(v_round.win - v_round.bet, 0)
  where id = v_round.profile_id
  returning * into v_profile;

  v_mode := case when v_round.auto_cashout is null then 'manual'
                 when v_round.auto_cashout < 2 then 'auto_lt2'
                 when v_round.auto_cashout <= 10 then 'auto_2_10'
                 else 'auto_gt10' end;

  insert into public.bets_history (profile_id, game_id, bet_amount, win_amount, multiplier, result_data)
  values (v_round.profile_id, 'crash', v_round.bet, v_round.win, coalesce(v_round.cashout_at, 0),
          jsonb_build_object('round_id', v_round.id, 'crash_point', v_round.crash_point, 'cashout_at', v_round.cashout_at,
                             'auto_cashout', v_round.auto_cashout, 'mode', v_mode, 'won', v_round.win > 0));

  if v_round.win > 0 then
    insert into public.casino_transactions (profile_id, type, amount, chips, game, description, status)
    values (v_round.profile_id, 'WIN', 0, v_round.win, 'crash',
            'Crash : gain de ' || v_round.win || ' jetons (encaissé à x' || v_round.cashout_at || ', crash à x' || v_round.crash_point || ')',
            'COMPLETED');
  end if;

  return public.crash_payload(v_round) || jsonb_build_object('profile', public.profile_payload(v_profile));
end;
$$;

-- Règle la manche si l'heure est passée : objectif atteint (gagné) ou crash (perdu).
-- Renvoie null si la manche continue.
create or replace function public.crash_settle_due(p_round public.crash_rounds)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_m numeric := public.crash_multiplier_at(public.crash_elapsed_ms(p_round));
begin
  if p_round.status <> 'ACTIVE' then
    return null;
  end if;
  -- L'objectif passe avant le crash quand il est atteint au même moment
  if p_round.target <= p_round.crash_point and v_m >= p_round.target then
    return public.crash_finish(p_round, 'CASHED', p_round.target);
  end if;
  if v_m >= p_round.crash_point then
    return public.crash_finish(p_round, 'LOST', 0);
  end if;
  return null;
end;
$$;

-- Manches abandonnées (onglet fermé) : réglées dès qu'un joueur lance une partie
create or replace function public.crash_settle_abandoned()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  rec public.crash_rounds;
begin
  for rec in
    select * from public.crash_rounds
    where status = 'ACTIVE' and started_at < clock_timestamp() - interval '5 seconds'
    order by started_at
    limit 50
    for update skip locked
  loop
    perform public.crash_settle_due(rec);
  end loop;
end;
$$;

create or replace function public.crash_start(p_bet bigint, p_auto numeric)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_profile public.profiles;
  v_cfg jsonb;
  v_rtp numeric;
  v_max_mult numeric;
  v_cap numeric;
  v_target numeric;
  v_seed text;
  v_n numeric;
  v_e numeric := 4503599627370496; -- 2^52
  v_crash numeric;
  v_round public.crash_rounds;
  v_done jsonb;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED' using errcode = '28000';
  end if;
  v_cfg := public.assert_game_open('crash');
  perform public.crash_settle_abandoned();

  select * into v_profile from public.profiles where user_id = v_uid for update;
  if v_profile.id is null then
    raise exception 'PROFILE_REQUIRED' using errcode = 'P0002';
  end if;
  if p_bet is null or p_bet < (v_cfg->>'minBet')::numeric or p_bet > (v_cfg->>'maxBet')::numeric then
    raise exception 'INVALID_BET' using errcode = 'P0001';
  end if;
  v_max_mult := (v_cfg->>'maxMultiplier')::numeric;
  if p_auto is not null and (p_auto < 1.01 or p_auto > v_max_mult) then
    raise exception 'INVALID_TARGET' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.crash_rounds where profile_id = v_profile.id and status = 'ACTIVE') then
    raise exception 'ROUND_IN_PROGRESS' using errcode = 'P0001';
  end if;
  if v_profile.chips < p_bet then
    raise exception 'INSUFFICIENT_FUNDS' using errcode = 'P0001';
  end if;

  -- Encaissement forcé au plafond de gain (le joueur ne peut rien gagner au-delà)
  v_cap := greatest(floor((v_cfg->>'maxPayout')::numeric * 100 / p_bet) / 100, 1.01);
  v_target := least(coalesce(floor(p_auto * 100) / 100, v_max_mult), v_max_mult, v_cap);

  -- Point de crash : P(crash ≥ x) = RTP / x. Une part (1 − RTP) crashe à x1,00.
  v_rtp := (v_cfg->>'rtp')::numeric;
  v_seed := encode(extensions.gen_random_bytes(32), 'hex');
  v_n := public.seed_int52(v_seed, 'crash');
  v_crash := div(round(v_rtp * 100) * v_e, (v_e - v_n) * 100) / 100;
  v_crash := least(greatest(v_crash, 1), v_max_mult);

  update public.profiles
  set chips = chips - p_bet,
      total_wagered = coalesce(total_wagered, 0) + p_bet
  where id = v_profile.id
  returning * into v_profile;

  insert into public.crash_rounds (profile_id, bet, auto_cashout, target, crash_point, rtp, max_payout, server_seed, hash)
  values (v_profile.id, p_bet, floor(p_auto * 100) / 100, v_target, v_crash, v_rtp, (v_cfg->>'maxPayout')::bigint, v_seed,
          encode(extensions.digest(v_seed, 'sha256'), 'hex'))
  returning * into v_round;

  insert into public.casino_transactions (profile_id, type, amount, chips, game, description, status)
  values (v_profile.id, 'BET', 0, -p_bet, 'crash',
          'Crash : mise de ' || p_bet || ' jetons' || coalesce(' (objectif x' || v_round.auto_cashout || ')', ''), 'COMPLETED');

  -- Crash immédiat à x1,00
  v_done := public.crash_settle_due(v_round);
  if v_done is not null then
    return v_done;
  end if;
  return public.crash_payload(v_round) || jsonb_build_object('profile', public.profile_payload(v_profile));
end;
$$;

create or replace function public.crash_lock_round(p_round_id uuid)
returns public.crash_rounds
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_round public.crash_rounds;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED' using errcode = '28000';
  end if;
  select r.* into v_round
  from public.crash_rounds r
  join public.profiles p on p.id = r.profile_id
  where r.id = p_round_id and p.user_id = auth.uid()
  for update of r;
  if v_round.id is null then
    raise exception 'ROUND_NOT_FOUND' using errcode = 'P0002';
  end if;
  return v_round;
end;
$$;

-- Suivi de la manche (appelé régulièrement pendant la montée)
create or replace function public.crash_status(p_round_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_round public.crash_rounds := public.crash_lock_round(p_round_id);
  v_done jsonb;
begin
  if v_round.status <> 'ACTIVE' then
    return public.crash_payload(v_round);
  end if;
  v_done := public.crash_settle_due(v_round);
  return coalesce(v_done, public.crash_payload(v_round));
end;
$$;

create or replace function public.crash_cashout(p_round_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_round public.crash_rounds := public.crash_lock_round(p_round_id);
  v_done jsonb;
  v_m numeric;
begin
  if v_round.status <> 'ACTIVE' then
    return public.crash_payload(v_round);
  end if;
  -- Objectif déjà atteint ou crash déjà passé : c'est l'horloge du serveur qui tranche
  v_done := public.crash_settle_due(v_round);
  if v_done is not null then
    return v_done;
  end if;
  v_m := public.crash_multiplier_at(public.crash_elapsed_ms(v_round));
  return public.crash_finish(v_round, 'CASHED', v_m);
end;
$$;

-- Reprise d'une manche en cours (onglet rechargé)
create or replace function public.crash_current()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_round public.crash_rounds;
begin
  if auth.uid() is null then
    return null;
  end if;
  select r.* into v_round
  from public.crash_rounds r
  join public.profiles p on p.id = r.profile_id
  where p.user_id = auth.uid() and r.status = 'ACTIVE'
  for update of r;
  if v_round.id is null then
    return null;
  end if;
  if public.crash_settle_due(v_round) is not null then
    return null;
  end if;
  return public.crash_payload(v_round);
end;
$$;

-- Derniers points de crash du joueur (bandeau d'historique)
create or replace function public.crash_history(p_limit integer default 20)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('crash_point', t.crash_point, 'cashout_at', t.cashout_at, 'win', t.win, 'bet', t.bet, 'at', t.ended_at)
                            order by t.ended_at desc), '[]')
  from (
    select r.* from public.crash_rounds r
    join public.profiles p on p.id = r.profile_id
    where p.user_id = auth.uid() and r.status <> 'ACTIVE'
    order by r.ended_at desc
    limit least(greatest(coalesce(p_limit, 20), 1), 50)
  ) t;
$$;

-- --------------------------------------------------------------------
-- 3. Console : statistiques, tableau de bord, purge
-- --------------------------------------------------------------------
do $$
declare
  v_def text := pg_get_functiondef('public.admin_game_stats(text, integer)'::regprocedure);
  v_old text := $q$if p_game not in ('mines', 'doghouse', 'wanted', 'lucky_wheel', 'boosters') then$q$;
  v_new text := $q$if p_game not in ('mines', 'doghouse', 'wanted', 'lucky_wheel', 'boosters', 'crash') then$q$;
begin
  if position(v_old in v_def) = 0 then
    raise exception 'admin_game_stats: point d''insertion introuvable';
  end if;
  execute replace(v_def, v_old, v_new);
end;
$$;

do $$
declare
  v_def text := pg_get_functiondef('public.admin_dashboard(integer)'::regprocedure);
  v_old text := $q$    'mines_open_stake', (select coalesce(sum(bet), 0) from public.mines_rounds where status = 'ACTIVE')$q$;
  v_new text := $q$    'mines_open_stake', (select coalesce(sum(bet), 0) from public.mines_rounds where status = 'ACTIVE'),
    'crash_open_rounds', (select count(*) from public.crash_rounds where status = 'ACTIVE'),
    'crash_open_stake', (select coalesce(sum(bet), 0) from public.crash_rounds where status = 'ACTIVE')$q$;
begin
  if position(v_old in v_def) = 0 then
    raise exception 'admin_dashboard: point d''insertion introuvable';
  end if;
  execute replace(v_def, v_old, v_new);
end;
$$;

do $$
declare
  v_def text := pg_get_functiondef('public.purge_old_history(integer)'::regprocedure);
  v_old text := $q$  get diagnostics v_mines = row_count;$q$;
  v_new text := $q$  get diagnostics v_mines = row_count;

  delete from public.crash_rounds where status <> 'ACTIVE' and coalesce(ended_at, started_at) < v_before;$q$;
begin
  if position(v_old in v_def) = 0 then
    raise exception 'purge_old_history: point d''insertion introuvable';
  end if;
  execute replace(v_def, v_old, v_new);
end;
$$;

-- --------------------------------------------------------------------
-- 4. Droits
-- --------------------------------------------------------------------
revoke truncate on public.crash_rounds from anon, authenticated;

revoke execute on function public.seed_int52(text, text) from public, anon, authenticated;
revoke execute on function public.crash_multiplier_at(numeric) from public, anon;
revoke execute on function public.crash_elapsed_ms(public.crash_rounds) from public, anon, authenticated;
revoke execute on function public.crash_payload(public.crash_rounds) from public, anon, authenticated;
revoke execute on function public.crash_finish(public.crash_rounds, text, numeric) from public, anon, authenticated;
revoke execute on function public.crash_settle_due(public.crash_rounds) from public, anon, authenticated;
revoke execute on function public.crash_settle_abandoned() from public, anon, authenticated;
revoke execute on function public.crash_lock_round(uuid) from public, anon, authenticated;

revoke execute on function public.crash_start(bigint, numeric) from public, anon, authenticated;
revoke execute on function public.crash_status(uuid) from public, anon, authenticated;
revoke execute on function public.crash_cashout(uuid) from public, anon, authenticated;
revoke execute on function public.crash_current() from public, anon, authenticated;
revoke execute on function public.crash_history(integer) from public, anon, authenticated;

grant execute on function public.crash_start(bigint, numeric) to authenticated;
grant execute on function public.crash_status(uuid) to authenticated;
grant execute on function public.crash_cashout(uuid) to authenticated;
grant execute on function public.crash_current() to authenticated;
grant execute on function public.crash_history(integer) to authenticated;
