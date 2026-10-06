-- Caisse du casino, jackpot progressif et RTP 85 %
--
-- 1. CAISSE CENTRALE (casino_bank) : comme la caisse d'un vrai casino, une seule réserve paie tous
--    les jeux. Elle démarre à 10 000 000. Toutes les mises y entrent, tous les gains en sortent
--    (trigger sur casino_transactions : un seul endroit, aucun jeu ne peut l'oublier).
--    - Gain max d'une manche = maxWinPct (10 %) de la caisse : impossible de la vider d'un coup.
--    - Quand la caisse dépasse son plus haut niveau (peak), keepPct (20 %) du nouveau bénéfice
--      reste dans la caisse (le gain max monte) et le reste (80 %) est le bénéfice du patron.
--    - Caisse vide = jeux fermés (BANK_EMPTY) jusqu'à ce que la direction la recharge.
-- 2. JACKPOT PROGRESSIF (jackpot_pool 'slots') : jackpotPct (1 %) de chaque mise des machines à
--    sous l'alimente ; chaque tour a une chance proportionnelle à sa mise de le remporter.
--    Les machines rendent 84 % + 1 % de jackpot = 85 % : le jackpot est payé par les mises.
-- 3. RTP 85 % : Mines, Crash, machines (84 + 1 jackpot), roue (tour à 16 400), plafonds 85 %.
-- 4. Tableau de bord : statistiques sans les comptes staff (par défaut) et état de la caisse.

-- --------------------------------------------------------------------
-- Réglages : bloc « bank » dans games_config
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
  k jsonb := coalesce(p->'collections', '{}');
  bk jsonb := coalesce(p->'bank', '{}');
  wp jsonb := coalesce(w->'buyPrices', '{}');
  v_min numeric;
  v_rate numeric;
  v_seed numeric;
begin
  v_min := public.jnum(m, 'minBet', 10, 1, 1000000);
  m := jsonb_build_object(
    'enabled', public.jbool(m, 'enabled', true),
    'minBet', v_min,
    'maxBet', greatest(v_min, public.jnum(m, 'maxBet', 100000, 1, 10000000)),
    'rtp', public.jnum(m, 'rtp', 85, 80, 99.5),
    'maxPayout', public.jnum(m, 'maxPayout', 5000000, 1000, 1000000000)
  );

  v_min := public.jnum(d, 'minBet', 20, 1, 1000000);
  d := jsonb_build_object(
    'enabled', public.jbool(d, 'enabled', true),
    'minBet', v_min,
    'maxBet', greatest(v_min, public.jnum(d, 'maxBet', 100000, 1, 10000000)),
    'buyEnabled', public.jbool(d, 'buyEnabled', true),
    'buyPrice', public.jnum(d, 'buyPrice', 76, 67, 1000),
    'boostEnabled', public.jbool(d, 'boostEnabled', true),
    'spinRtp', public.jnum(d, 'spinRtp', 84, 60, 90),
    'maxBuyBet', round(public.jnum(d, 'maxBuyBet', 100000, 1, 10000000)),
    'maxPayout', public.jnum(d, 'maxPayout', 1000000, 1000, 1000000000)
  );

  v_min := public.jnum(w, 'minBet', 10, 1, 1000000);
  w := jsonb_build_object(
    'enabled', public.jbool(w, 'enabled', true),
    'minBet', v_min,
    'maxBet', greatest(v_min, public.jnum(w, 'maxBet', 100000, 1, 10000000)),
    'buyEnabled', public.jbool(w, 'buyEnabled', true),
    'spinRtp', public.jnum(w, 'spinRtp', 84, 60, 90),
    'maxBuyBet', round(public.jnum(w, 'maxBuyBet', 100000, 1, 10000000)),
    'buyPrices', jsonb_build_object(
      'gtr', public.jnum(wp, 'gtr', 92, 80, 5000),
      'duel', public.jnum(wp, 'duel', 134, 134, 5000),
      'dmh', public.jnum(wp, 'dmh', 219, 219, 5000)
    ),
    'maxPayout', public.jnum(w, 'maxPayout', 1000000, 1000, 1000000000)
  );

  r := jsonb_build_object(
    'enabled', public.jbool(r, 'enabled', true),
    'spinPrice', round(public.jnum(r, 'spinPrice', 25000, 1, 100000000)),
    'maxRtp', public.jnum(r, 'maxRtp', 85, 10, 98)
  );

  b := jsonb_build_object(
    'enabled', public.jbool(b, 'enabled', true),
    'maxRtp', public.jnum(b, 'maxRtp', 85, 10, 98),
    'sellRate', public.jnum(b, 'sellRate', 90, 0, 100)
  );

  v_min := public.jnum(c, 'minBet', 10, 1, 1000000);
  c := jsonb_build_object(
    'enabled', public.jbool(c, 'enabled', true),
    'minBet', v_min,
    'maxBet', greatest(v_min, public.jnum(c, 'maxBet', 100000, 1, 10000000)),
    'rtp', round(public.jnum(c, 'rtp', 85, 80, 99), 1),
    'maxMultiplier', round(public.jnum(c, 'maxMultiplier', 1000, 2, 100000)),
    'maxPayout', public.jnum(c, 'maxPayout', 5000000, 1000, 1000000000)
  );

  -- Taux de revente : le taux + bonus VIP ne dépasse jamais 100 %
  v_rate := public.jnum(k, 'sellRate', 70, 0, 100);
  k := jsonb_build_object(
    'enabled', public.jbool(k, 'enabled', true),
    'maxRtp', public.jnum(k, 'maxRtp', 85, 10, 98),
    'packMaxRtp', public.jnum(k, 'packMaxRtp', 60, 0, 100),
    'dailyPackLimit', round(public.jnum(k, 'dailyPackLimit', 0, 0, 1000)),
    'sellRate', v_rate,
    'sellBonusSilver', public.jnum(k, 'sellBonusSilver', 0, 0, 100 - v_rate),
    'sellBonusGold', public.jnum(k, 'sellBonusGold', 5, 0, 100 - v_rate),
    'sellBonusDiamond', public.jnum(k, 'sellBonusDiamond', 10, 0, 100 - v_rate)
  );

  -- Caisse et jackpot : la moyenne d'un jackpot reste au-dessus de sa mise de départ
  v_seed := round(public.jnum(bk, 'jackpotSeed', 100000, 0, 100000000));
  bk := jsonb_build_object(
    'maxWinPct', public.jnum(bk, 'maxWinPct', 10, 1, 50),
    'keepPct', public.jnum(bk, 'keepPct', 20, 0, 100),
    'jackpotPct', public.jnum(bk, 'jackpotPct', 1, 0, 5),
    'jackpotSeed', v_seed,
    'jackpotAverage', greatest(round(public.jnum(bk, 'jackpotAverage', 500000, 1000, 1000000000)), v_seed + 1000)
  );

  return jsonb_build_object('mines', m, 'doghouse', d, 'wanted', w, 'wheel', r, 'boosters', b, 'crash', c,
                            'collections', k, 'bank', bk);
end;
$$;

-- --------------------------------------------------------------------
-- Caisse
-- --------------------------------------------------------------------
create table if not exists public.casino_bank (
  id text primary key default 'main' check (id = 'main'),
  balance bigint not null,
  -- Plus haut niveau atteint : au-dessus, le bénéfice est partagé (keepPct reste, le reste au patron)
  peak bigint not null,
  -- Bénéfice revenant au patron depuis la dernière récupération
  owner_total bigint not null default 0,
  start_amount bigint not null,
  updated_at timestamptz not null default now()
);
alter table public.casino_bank enable row level security;
revoke all on public.casino_bank from anon, authenticated;

insert into public.casino_bank (id, balance, peak, start_amount)
values ('main', 10000000, 10000000, 10000000)
on conflict (id) do nothing;

insert into public.jackpot_pool (id, current_amount, seed_amount, updated_at)
values ('slots', 100000, 100000, now())
on conflict (id) do nothing;

/** Ajoute (ou retire) un montant à la caisse et partage le bénéfice au-dessus du plus haut niveau */
create or replace function public.bank_apply(p_delta bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_bank public.casino_bank;
  v_keep numeric := coalesce((public.games_config()->'bank'->>'keepPct')::numeric, 20);
  v_excess bigint;
  v_kept bigint;
begin
  if coalesce(p_delta, 0) = 0 then
    return;
  end if;
  select * into v_bank from public.casino_bank where id = 'main' for update;
  if v_bank.id is null then
    return;
  end if;
  v_bank.balance := v_bank.balance + p_delta;
  if v_bank.balance > v_bank.peak then
    v_excess := v_bank.balance - v_bank.peak;
    v_kept := floor(v_excess * v_keep / 100);
    v_bank.owner_total := v_bank.owner_total + (v_excess - v_kept);
    v_bank.balance := v_bank.peak + v_kept;
    v_bank.peak := v_bank.balance;
  end if;
  update public.casino_bank
  set balance = v_bank.balance, peak = v_bank.peak, owner_total = v_bank.owner_total, updated_at = now()
  where id = 'main';
end;
$$;

/** Gain maximum d'une manche, fixé par la caisse (0 si elle est vide) */
create or replace function public.bank_max_win()
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select greatest(floor(b.balance * coalesce((public.games_config()->'bank'->>'maxWinPct')::numeric, 10) / 100), 0)::bigint
  from public.casino_bank b where b.id = 'main';
$$;

-- Toutes les mises entrent dans la caisse, tous les gains en sortent.
-- Hors caisse : crédits / retraits du staff (ADMIN_ADJUST), dotation d'une carte VIP payée en ville
-- (admin_set_vip, « Activation VIP … »), jackpot (payé par sa propre réserve), demandes VIP.
create or replace function public.casino_tx_bank()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.type in ('BET', 'WIN', 'WHEEL', 'REWARD_SALE', 'VIP_SUBSCRIPTION', 'VIP_REWARD')
     and not (new.type = 'VIP_REWARD' and coalesce(new.description, '') like 'Activation VIP%') then
    perform public.bank_apply(-coalesce(new.chips, 0));
  end if;
  return new;
end;
$$;

drop trigger if exists casino_tx_bank on public.casino_transactions;
create trigger casino_tx_bank
after insert on public.casino_transactions
for each row execute function public.casino_tx_bank();

/** Public : gain max actuel et jackpot (affichés dans les jeux) */
create or replace function public.casino_limits()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'max_win', public.bank_max_win(),
    'open', (select balance > 0 from public.casino_bank where id = 'main'),
    'jackpot', (select current_amount from public.jackpot_pool where id = 'slots'),
    'jackpot_last_winner', (select last_winner_name from public.jackpot_pool where id = 'slots'),
    'jackpot_last_amount', (select last_win_amount from public.jackpot_pool where id = 'slots'),
    'jackpot_last_date', (select last_win_date from public.jackpot_pool where id = 'slots')
  );
$$;

-- --------------------------------------------------------------------
-- Jeux : caisse vide = fermés, gain max = part de la caisse
-- --------------------------------------------------------------------
create or replace function public.assert_game_open(p_game text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_cfg jsonb := public.games_config()->p_game;
begin
  if coalesce(((select value from public.casino_settings where key = 'economy_config')->>'maintenanceMode')::boolean, false) then
    raise exception 'MAINTENANCE' using errcode = 'P0001';
  end if;
  if v_cfg is null or not coalesce((v_cfg->>'enabled')::boolean, false) then
    raise exception 'GAME_DISABLED' using errcode = 'P0001';
  end if;
  if coalesce((select balance from public.casino_bank where id = 'main'), 1) <= 0 then
    raise exception 'BANK_EMPTY' using errcode = 'P0001';
  end if;
  return v_cfg;
end;
$$;

create or replace function public.mines_start(p_bet bigint, p_mines integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_profile public.profiles;
  v_cfg jsonb;
  v_board boolean[];
  v_seed text;
  v_round public.mines_rounds;
  v_max_payout bigint;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED' using errcode = '28000';
  end if;
  v_cfg := public.assert_game_open('mines');

  select * into v_profile from public.profiles where user_id = v_uid for update;
  if v_profile.id is null then
    raise exception 'PROFILE_REQUIRED' using errcode = 'P0002';
  end if;
  if p_bet is null or p_bet < (v_cfg->>'minBet')::numeric or p_bet > (v_cfg->>'maxBet')::numeric then
    raise exception 'INVALID_BET' using errcode = 'P0001';
  end if;
  if p_mines is null or p_mines < 1 or p_mines > 24 then
    raise exception 'INVALID_MINES' using errcode = 'P0001';
  end if;
  v_max_payout := least((v_cfg->>'maxPayout')::bigint, public.bank_max_win());
  if v_max_payout < p_bet * 2 then
    raise exception 'BANK_LIMIT' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.mines_rounds where profile_id = v_profile.id and status = 'ACTIVE') then
    raise exception 'ROUND_IN_PROGRESS' using errcode = 'P0001';
  end if;
  if v_profile.chips < p_bet then
    raise exception 'INSUFFICIENT_FUNDS' using errcode = 'P0001';
  end if;

  select array_agg(rn <= p_mines order by idx) into v_board
  from (
    select idx, row_number() over (order by extensions.gen_random_bytes(16)) as rn
    from generate_series(0, 24) as idx
  ) s;
  v_seed := encode(extensions.gen_random_bytes(16), 'hex');

  update public.profiles
  set chips = chips - p_bet,
      total_wagered = coalesce(total_wagered, 0) + p_bet
  where id = v_profile.id
  returning * into v_profile;

  insert into public.mines_rounds (profile_id, bet, mines, rtp, max_payout, board, server_seed, hash)
  values (
    v_profile.id, p_bet, p_mines, (v_cfg->>'rtp')::numeric, v_max_payout, v_board, v_seed,
    encode(extensions.digest(v_seed || ':' || array_to_string(
      array(select case when b then 'M' else 'D' end from unnest(v_board) as b), ''), 'sha256'), 'hex')
  )
  returning * into v_round;

  insert into public.casino_transactions (profile_id, type, amount, chips, game, description, status)
  values (v_profile.id, 'BET', 0, -p_bet, 'mines', 'Mines : mise de ' || p_bet || ' jetons (' || p_mines || ' mines)', 'COMPLETED');

  return public.mines_round_payload(v_round, false)
    || jsonb_build_object('max_payout', v_round.max_payout, 'profile', public.profile_payload(v_profile));
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
  v_max_payout bigint;
  v_cap numeric;
  v_target numeric;
  v_seed text;
  v_n numeric;
  v_e numeric := 4503599627370496;
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
  v_max_payout := least((v_cfg->>'maxPayout')::bigint, public.bank_max_win());
  if v_max_payout < p_bet * 2 then
    raise exception 'BANK_LIMIT' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.crash_rounds where profile_id = v_profile.id and status = 'ACTIVE') then
    raise exception 'ROUND_IN_PROGRESS' using errcode = 'P0001';
  end if;
  if v_profile.chips < p_bet then
    raise exception 'INSUFFICIENT_FUNDS' using errcode = 'P0001';
  end if;

  v_cap := greatest(floor(v_max_payout::numeric * 100 / p_bet) / 100, 1.01);
  v_target := least(coalesce(floor(p_auto * 100) / 100, v_max_mult), v_max_mult, v_cap);

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
  values (v_profile.id, p_bet, floor(p_auto * 100) / 100, v_target, v_crash, v_rtp, v_max_payout, v_seed,
          encode(extensions.digest(v_seed, 'sha256'), 'hex'))
  returning * into v_round;

  insert into public.casino_transactions (profile_id, type, amount, chips, game, description, status)
  values (v_profile.id, 'BET', 0, -p_bet, 'crash',
          'Crash : mise de ' || p_bet || ' jetons' || coalesce(' (objectif x' || v_round.auto_cashout || ')', ''), 'COMPLETED');

  v_done := public.crash_settle_due(v_round);
  if v_done is not null then
    return v_done;
  end if;
  return public.crash_payload(v_round) || jsonb_build_object('profile', public.profile_payload(v_profile));
end;
$$;

-- --------------------------------------------------------------------
-- Machines à sous : gain plafonné par la caisse + jackpot progressif
-- --------------------------------------------------------------------
create or replace function public.settle_slot_round(p_user_id uuid, p_game text, p_bet bigint, p_cost bigint, p_win bigint, p_detail jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile public.profiles;
  v_cfg jsonb;
  v_bank_cfg jsonb := public.games_config()->'bank';
  v_label text := case p_game when 'doghouse' then 'The Dog House' when 'wanted' then 'Wanted Dead or a Wild' else p_game end;
  v_win bigint;
  v_net bigint;
  v_mode text := coalesce(p_detail->>'mode', 'spin');
  v_jp_pct numeric := coalesce((v_bank_cfg->>'jackpotPct')::numeric, 0);
  v_jp_seed bigint := coalesce((v_bank_cfg->>'jackpotSeed')::bigint, 100000);
  v_jp_avg numeric := coalesce((v_bank_cfg->>'jackpotAverage')::numeric, 500000);
  v_contrib bigint := 0;
  v_pool public.jackpot_pool;
  v_jp_win bigint := 0;
begin
  if p_game not in ('doghouse', 'wanted') then
    raise exception 'GAME_DISABLED' using errcode = 'P0001';
  end if;
  v_cfg := public.assert_game_open(p_game);
  if p_bet < (v_cfg->>'minBet')::numeric or p_bet > (v_cfg->>'maxBet')::numeric or p_cost < p_bet then
    raise exception 'INVALID_BET' using errcode = 'P0001';
  end if;
  if p_win < 0 or p_win > (v_cfg->>'maxPayout')::numeric then
    raise exception 'INVALID_WIN' using errcode = 'P0001';
  end if;
  -- La caisse peut avoir baissé depuis le tirage : le gain ne dépasse jamais sa part autorisée
  v_win := least(p_win, public.bank_max_win());

  select * into v_profile from public.profiles where user_id = p_user_id for update;
  if v_profile.id is null then
    raise exception 'PROFILE_REQUIRED' using errcode = 'P0002';
  end if;
  if v_profile.chips < p_cost then
    raise exception 'INSUFFICIENT_FUNDS' using errcode = 'P0001';
  end if;

  v_net := v_win - p_cost;
  update public.profiles
  set chips = chips + v_net,
      total_wagered = coalesce(total_wagered, 0) + p_cost,
      total_won = coalesce(total_won, 0) + greatest(v_net, 0)
  where id = v_profile.id
  returning * into v_profile;

  -- Enregistrée en premier : la mise entre dans la caisse avant que la part du jackpot en sorte
  insert into public.casino_transactions (profile_id, type, amount, chips, game, description, status)
  values (v_profile.id, case when v_net > 0 then 'WIN' else 'BET' end, 0, v_net, p_game,
          v_label || case v_mode when 'buy' then ' (achat bonus)' when 'boost' then ' (boost)' else '' end
            || ' : mise ' || p_cost || ', gain ' || v_win, 'COMPLETED');

  -- Jackpot : la part de la mise passe de la caisse au jackpot, puis tirage proportionnel à la mise
  if v_jp_pct > 0 then
    v_contrib := floor(p_cost * v_jp_pct / 100);
    select * into v_pool from public.jackpot_pool where id = 'slots' for update;
    if v_pool.id is not null then
      perform public.bank_apply(-v_contrib);
      v_pool.current_amount := v_pool.current_amount + v_contrib;
      if public.booster_rand() < least(1, p_cost * (v_jp_pct / 100) / greatest(v_jp_avg - v_jp_seed, 1)) then
        v_jp_win := v_pool.current_amount;
        -- Le jackpot repart de sa mise de départ, avancée par la caisse
        perform public.bank_apply(-v_jp_seed);
        update public.jackpot_pool
        set current_amount = v_jp_seed, seed_amount = v_jp_seed,
            last_winner_name = coalesce(v_profile.rp_first_name, 'Citoyen') || ' ' || left(coalesce(v_profile.rp_last_name, ''), 1) || '.',
            last_win_amount = v_jp_win, last_win_date = now(), updated_at = now()
        where id = 'slots';
        update public.profiles
        set chips = chips + v_jp_win, total_won = coalesce(total_won, 0) + v_jp_win
        where id = v_profile.id
        returning * into v_profile;
        insert into public.casino_transactions (profile_id, type, amount, chips, game, description, status)
        values (v_profile.id, 'JACKPOT', 0, v_jp_win, p_game, 'JACKPOT ' || v_label || ' : ' || v_jp_win || ' jetons', 'COMPLETED');
        insert into public.admin_logs (action, category, detail, author)
        values ('Jackpot remporté', 'ECONOMY',
                v_profile.rp_first_name || ' ' || v_profile.rp_last_name || ' (#' || v_profile.citizen_id || ') a remporté le jackpot : '
                  || v_jp_win || ' jetons sur ' || v_label,
                'Jackpot');
      else
        update public.jackpot_pool set current_amount = v_pool.current_amount, updated_at = now() where id = 'slots';
      end if;
    end if;
  end if;

  insert into public.bets_history (profile_id, game_id, bet_amount, win_amount, multiplier, result_data)
  values (v_profile.id, p_game, p_cost, v_win + v_jp_win, case when p_cost > 0 then round((v_win + v_jp_win)::numeric / p_cost, 2) else 0 end,
          jsonb_build_object('mode', v_mode, 'bet', p_bet, 'bonus', p_detail->'bonus', 'won', v_win + v_jp_win > 0,
                             'jackpot', v_jp_win, 'capped', v_win < p_win));

  return public.profile_payload(v_profile)
    || jsonb_build_object('jackpot_win', v_jp_win, 'paid_win', v_win, 'max_win', public.bank_max_win());
end;
$$;

revoke execute on function public.settle_slot_round(uuid, text, bigint, bigint, bigint, jsonb) from public, anon, authenticated;
grant execute on function public.settle_slot_round(uuid, text, bigint, bigint, bigint, jsonb) to service_role;

create or replace function public.settle_voucher_round(p_user_id uuid, p_reward_id uuid, p_win bigint, p_detail jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile public.profiles;
  v_rw public.player_rewards;
  v_game text;
  v_cfg jsonb;
  v_label text;
  v_win bigint;
begin
  select * into v_profile from public.profiles where user_id = p_user_id for update;
  if v_profile.id is null then
    raise exception 'PROFILE_REQUIRED' using errcode = 'P0002';
  end if;

  select * into v_rw from public.player_rewards
  where id = p_reward_id and profile_id = v_profile.id and kind = 'voucher' and status = 'IN_INVENTORY'
  for update;
  if v_rw.id is null then
    raise exception 'VOUCHER_NOT_FOUND' using errcode = 'P0001';
  end if;

  v_game := v_rw.voucher->>'game';
  v_cfg := public.assert_game_open(v_game);
  if p_win < 0 or p_win > (v_cfg->>'maxPayout')::numeric then
    raise exception 'INVALID_WIN' using errcode = 'P0001';
  end if;
  v_win := least(p_win, public.bank_max_win());
  v_label := case v_game when 'doghouse' then 'The Dog House' else 'Wanted Dead or a Wild' end;

  update public.player_rewards
  set status = 'USED', handled_at = now(), handled_by = 'Utilisé en jeu'
  where id = v_rw.id;

  update public.profiles
  set chips = chips + v_win,
      total_won = coalesce(total_won, 0) + v_win
  where id = v_profile.id
  returning * into v_profile;

  insert into public.bets_history (profile_id, game_id, bet_amount, win_amount, multiplier, result_data)
  values (v_profile.id, v_game, 0, v_win, 0,
          jsonb_build_object('mode', 'voucher', 'bet', (v_rw.voucher->>'bet')::bigint, 'bonus', p_detail->'bonus',
                             'voucher_id', v_rw.id, 'won', v_win > 0, 'capped', v_win < p_win));

  if v_win > 0 then
    insert into public.casino_transactions (profile_id, type, amount, chips, game, description, status)
    values (v_profile.id, 'WIN', 0, v_win, v_game,
            v_label || ' (bonus offert) : gain ' || v_win, 'COMPLETED');
  end if;

  return public.profile_payload(v_profile) || jsonb_build_object('paid_win', v_win, 'max_win', public.bank_max_win());
end;
$$;

revoke execute on function public.settle_voucher_round(uuid, uuid, bigint, jsonb) from public, anon, authenticated;
grant execute on function public.settle_voucher_round(uuid, uuid, bigint, jsonb) to service_role;

-- --------------------------------------------------------------------
-- Direction : recharger / retirer / récupérer le bénéfice (FONDATEUR, DÉVELOPPEUR)
-- --------------------------------------------------------------------
create or replace function public.admin_bank_update(p_action text, p_amount bigint, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me public.profiles := public.assert_staff();
  v_bank public.casino_bank;
  v_amount bigint := coalesce(p_amount, 0);
  v_reason text := nullif(left(trim(coalesce(p_reason, '')), 140), '');
  v_detail text;
begin
  if not public.can_manage_roles() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  select * into v_bank from public.casino_bank where id = 'main' for update;
  if v_bank.id is null then
    raise exception 'BANK_NOT_FOUND' using errcode = 'P0002';
  end if;

  if p_action = 'deposit' then
    if v_amount < 1 or v_amount > 1000000000 then
      raise exception 'INVALID_AMOUNT' using errcode = '22023';
    end if;
    -- Le nouveau niveau devient la référence : le dépôt n'est pas compté comme bénéfice
    v_bank.balance := v_bank.balance + v_amount;
    v_bank.peak := v_bank.balance;
    v_detail := 'Caisse rechargée de ' || v_amount || ' jetons';
  elsif p_action = 'withdraw' then
    if v_amount < 1 or v_amount > v_bank.balance then
      raise exception 'INVALID_AMOUNT' using errcode = '22023';
    end if;
    v_bank.balance := v_bank.balance - v_amount;
    v_bank.peak := v_bank.balance;
    v_detail := v_amount || ' jetons retirés de la caisse';
  elsif p_action = 'collect' then
    v_detail := 'Bénéfice récupéré par la direction : ' || v_bank.owner_total || ' jetons';
    v_bank.owner_total := 0;
  else
    raise exception 'INVALID_ACTION' using errcode = '22023';
  end if;

  update public.casino_bank
  set balance = v_bank.balance, peak = v_bank.peak, owner_total = v_bank.owner_total, updated_at = now()
  where id = 'main';

  insert into public.admin_logs (action, category, detail, author)
  values ('Caisse du casino', 'ECONOMY', v_detail || coalesce(' — ' || v_reason, ''),
          coalesce(v_me.rp_first_name || ' ' || v_me.rp_last_name, 'Console Admin'));

  return to_jsonb(v_bank) || jsonb_build_object('max_win', public.bank_max_win());
end;
$$;

-- --------------------------------------------------------------------
-- Tableau de bord : comptes staff exclus par défaut, état de la caisse
-- --------------------------------------------------------------------
/** Parties de la période, sans les comptes staff si demandé (les profils supprimés restent comptés) */
create or replace function public.dashboard_bets(p_since timestamptz, p_members_only boolean)
returns setof public.bets_history
language sql
stable
security definer
set search_path = ''
as $$
  select b.* from public.bets_history b
  left join public.profiles p on p.id = b.profile_id
  where b.created_at >= p_since
    and (not coalesce(p_members_only, true) or coalesce(p.role, 'MEMBRE') = 'MEMBRE');
$$;

drop function if exists public.admin_dashboard(integer);
create or replace function public.admin_dashboard(p_days integer, p_members_only boolean default true)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me public.profiles := public.assert_staff();
  v_since timestamptz := case when coalesce(p_days, 0) <= 0 then '-infinity'::timestamptz
                              else now() - make_interval(days => least(p_days, 3650)) end;
  v_games jsonb;
  v_totals jsonb;
  v_top jsonb;
  v_daily jsonb;
  v_bank jsonb;
begin
  select coalesce(jsonb_object_agg(game_id, jsonb_build_object(
           'rounds', rounds, 'players', players, 'wagered', wagered, 'paid', paid,
           'profit', wagered - paid, 'rtp', case when wagered > 0 then round(paid::numeric * 100 / wagered, 1) end,
           'biggest_win', biggest)), '{}')
  into v_games
  from (
    select game_id, count(*) rounds, count(distinct profile_id) players,
           coalesce(sum(bet_amount), 0) wagered, coalesce(sum(win_amount), 0) - public.uncounted_reward_value(game_id, v_since) paid, coalesce(max(win_amount), 0) biggest
    from public.dashboard_bets(v_since, p_members_only)
    group by game_id
  ) g;

  select jsonb_build_object(
    'players', (select count(*) from public.profiles),
    'linked_players', (select count(*) from public.profiles where user_id is not null),
    'active_players', (select count(distinct profile_id) from public.dashboard_bets(v_since, p_members_only)),
    'chips_in_circulation', (select coalesce(sum(chips), 0) from public.profiles),
    'chips_players_only', (select coalesce(sum(chips), 0) from public.profiles where role = 'MEMBRE'),
    'vip_active', (select count(*) from public.profiles where public.active_vip(vip_tier, vip_expires_at) is not null),
    'admin_injected', (select coalesce(sum(chips), 0) from public.casino_transactions where type = 'ADMIN_ADJUST' and chips > 0 and created_at >= v_since),
    'admin_removed', (select coalesce(-sum(chips), 0) from public.casino_transactions where type = 'ADMIN_ADJUST' and chips < 0 and created_at >= v_since),
    'vip_sales', (select coalesce(-sum(chips), 0) from public.casino_transactions where type = 'VIP_SUBSCRIPTION' and created_at >= v_since),
    'vip_bonuses', (select coalesce(sum(chips), 0) from public.casino_transactions where type = 'VIP_REWARD' and created_at >= v_since),
    'pending_vip', (select count(*) from public.casino_transactions where type = 'VIP_REQUEST' and status = 'PENDING'),
    'reward_sales', (select coalesce(sum(chips), 0) from public.casino_transactions where type = 'REWARD_SALE' and created_at >= v_since),
    'pending_rewards', (select count(*) from public.player_rewards where status = 'CLAIMED'),
    'mines_open_rounds', (select count(*) from public.mines_rounds where status = 'ACTIVE'),
    'mines_open_stake', (select coalesce(sum(bet), 0) from public.mines_rounds where status = 'ACTIVE'),
    'crash_open_rounds', (select count(*) from public.crash_rounds where status = 'ACTIVE'),
    'crash_open_stake', (select coalesce(sum(bet), 0) from public.crash_rounds where status = 'ACTIVE'),
    'jackpots_won', (select coalesce(sum(chips), 0) from public.casino_transactions where type = 'JACKPOT' and created_at >= v_since)
  ) into v_totals;

  select jsonb_build_object(
    'balance', b.balance, 'peak', b.peak, 'owner_total', b.owner_total, 'start_amount', b.start_amount,
    'max_win', public.bank_max_win(), 'updated_at', b.updated_at,
    'jackpot', (select current_amount from public.jackpot_pool where id = 'slots'),
    'jackpot_last_winner', (select last_winner_name from public.jackpot_pool where id = 'slots'),
    'jackpot_last_amount', (select last_win_amount from public.jackpot_pool where id = 'slots'),
    'jackpot_last_date', (select last_win_date from public.jackpot_pool where id = 'slots'))
  into v_bank
  from public.casino_bank b where b.id = 'main';

  select coalesce(jsonb_agg(t order by t.net desc), '[]') into v_top
  from (
    select p.id, p.rp_first_name || ' ' || p.rp_last_name as name, p.citizen_id, p.role,
           sum(b.bet_amount) wagered, sum(b.win_amount) paid, sum(b.win_amount) - sum(b.bet_amount) net, count(*) rounds
    from public.dashboard_bets(v_since, p_members_only) b
    join public.profiles p on p.id = b.profile_id
    group by p.id
    order by net desc
    limit 8
  ) t;

  select coalesce(jsonb_agg(d order by d.day), '[]') into v_daily
  from (
    select to_char(date_trunc('day', created_at), 'YYYY-MM-DD') as day,
           sum(bet_amount) wagered, sum(win_amount) paid, count(*) rounds
    from public.dashboard_bets(v_since, p_members_only)
    where created_at >= now() - interval '30 days'
    group by 1
  ) d;

  return jsonb_build_object('since', v_since, 'days', p_days, 'members_only', coalesce(p_members_only, true),
                            'games', v_games, 'totals', v_totals, 'bank', v_bank, 'top_players', v_top, 'daily', v_daily);
end;
$$;

-- --------------------------------------------------------------------
-- Droits
-- --------------------------------------------------------------------
revoke execute on function public.bank_apply(bigint) from public, anon, authenticated;
revoke execute on function public.bank_max_win() from public, anon, authenticated;
revoke execute on function public.casino_tx_bank() from public, anon, authenticated;
revoke execute on function public.assert_game_open(text) from public, anon, authenticated;
revoke execute on function public.normalize_games_config(jsonb) from public, anon, authenticated;
grant execute on function public.casino_limits() to anon, authenticated;
grant execute on function public.mines_start(bigint, integer) to authenticated;
grant execute on function public.crash_start(bigint, numeric) to authenticated;
revoke execute on function public.mines_start(bigint, integer) from public, anon;
revoke execute on function public.crash_start(bigint, numeric) from public, anon;
revoke execute on function public.admin_bank_update(text, bigint, text) from public, anon;
grant execute on function public.admin_bank_update(text, bigint, text) to authenticated;
revoke execute on function public.dashboard_bets(timestamptz, boolean) from public, anon, authenticated;
revoke execute on function public.admin_dashboard(integer, boolean) from public, anon;
grant execute on function public.admin_dashboard(integer, boolean) to authenticated;

-- --------------------------------------------------------------------
-- Réglages actuels → RTP 85 %, gain max des machines 1 000 000
-- --------------------------------------------------------------------
update public.casino_settings
set value = public.normalize_games_config(
      jsonb_set(jsonb_set(jsonb_set(jsonb_set(jsonb_set(jsonb_set(jsonb_set(jsonb_set(jsonb_set(jsonb_set(jsonb_set(jsonb_set(jsonb_set(
        value,
        '{mines,rtp}', '85'),
        '{crash,rtp}', '85'),
        '{doghouse,spinRtp}', '84'),
        '{doghouse,buyPrice}', '76'),
        '{doghouse,maxPayout}', '1000000'),
        '{wanted,spinRtp}', '84'),
        '{wanted,buyPrices,gtr}', '92'),
        '{wanted,maxPayout}', '1000000'),
        '{wheel,spinPrice}', '16400'),
        '{wheel,maxRtp}', '85'),
        '{boosters,maxRtp}', '85'),
        '{collections,maxRtp}', '85'),
        '{bank}', '{"maxWinPct": 10, "keepPct": 20, "jackpotPct": 1, "jackpotSeed": 100000, "jackpotAverage": 500000}')),
    updated_at = now()
where key = 'games_config';

-- La roue doit rester sous son plafond avec le nouveau prix
select public.assert_wheel_profitable();
