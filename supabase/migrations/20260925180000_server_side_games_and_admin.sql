-- ====================================================================
-- THE DIAMOND CASINO & RESORT — JEUX 100 % CÔTÉ SERVEUR + CONSOLE ADMIN
-- ====================================================================
-- Failles corrigées :
--   * play_mines_game / play_slots_round laissaient le NAVIGATEUR annoncer
--     son propre gain (p_win) : n'importe qui pouvait se créditer des
--     millions de jetons en appelant l'API à la main. Remplacées ici,
--     supprimées par la migration suivante (drop_legacy_game_rpcs).
--   * Mines : la grille était tirée dans le navigateur (mines visibles) et
--     la mise n'était débitée qu'en fin de manche (fermer l'onglet après
--     une mine = aucune perte). Désormais : grille secrète en base, mise
--     débitée au départ, chaque case est révélée par le serveur.
--   * Machines à sous : le tirage est fait par la fonction Edge
--     « slot-round » (service_role) qui appelle settle_slot_round().
--   * casino_settings / admin_logs n'étaient protégés que par « est staff »
--     et sans aucune validation : n'importe quelle valeur pouvait être
--     écrite (drop rate négatif, gain de 10^15…). Écriture via
--     admin_set_setting() uniquement, avec validation et journalisation.
--   * VIP « mensuel » sans date d'expiration, et l'auto-achat remettait le
--     cooldown de la roue à zéro (tirages en boucle). Corrigé.
--   * Un DIRECTEUR CASINO pouvait modifier le solde d'un FONDATEUR.
-- ====================================================================

-- --------------------------------------------------------------------
-- 0. Petits utilitaires de lecture JSON bornée
-- --------------------------------------------------------------------
create or replace function public.jnum(p jsonb, p_key text, p_default numeric, p_min numeric, p_max numeric)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select least(greatest(
    case when jsonb_typeof(p->p_key) = 'number' then (p->>p_key)::numeric else p_default end,
    p_min), p_max);
$$;

create or replace function public.jbool(p jsonb, p_key text, p_default boolean)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case when jsonb_typeof(p->p_key) = 'boolean' then (p->>p_key)::boolean else p_default end;
$$;

-- --------------------------------------------------------------------
-- 1. CONFIGURATION DES JEUX (normalisée côté serveur)
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
    'buyPrice', public.jnum(d, 'buyPrice', 115, 50, 1000),
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
      'gtr', public.jnum(wp, 'gtr', 80, 20, 5000),
      'duel', public.jnum(wp, 'duel', 200, 20, 5000),
      'dmh', public.jnum(wp, 'dmh', 400, 20, 5000)
    ),
    'maxPayout', public.jnum(w, 'maxPayout', 10000000, 1000, 1000000000)
  );

  r := jsonb_build_object('enabled', public.jbool(r, 'enabled', true));

  return jsonb_build_object('mines', m, 'doghouse', d, 'wanted', w, 'wheel', r);
end;
$$;

create or replace function public.normalize_vip_config(p jsonb)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  s jsonb := coalesce(p->'SILVER', '{}');
  g jsonb := coalesce(p->'GOLD', '{}');
  dd jsonb := coalesce(p->'DIAMOND', '{}');
begin
  return jsonb_build_object(
    'durationDays', public.jnum(p, 'durationDays', 30, 1, 365),
    'SILVER', jsonb_build_object(
      'price', public.jnum(s, 'price', 25000, 0, 100000000),
      'bonus', public.jnum(s, 'bonus', 15000, 0, 100000000),
      'wheelCooldownHours', public.jnum(s, 'wheelCooldownHours', 24, 1, 168)),
    'GOLD', jsonb_build_object(
      'price', public.jnum(g, 'price', 75000, 0, 100000000),
      'bonus', public.jnum(g, 'bonus', 60000, 0, 100000000),
      'wheelCooldownHours', public.jnum(g, 'wheelCooldownHours', 12, 1, 168)),
    'DIAMOND', jsonb_build_object(
      'price', public.jnum(dd, 'price', 180000, 0, 100000000),
      'bonus', public.jnum(dd, 'bonus', 150000, 0, 100000000),
      'wheelCooldownHours', public.jnum(dd, 'wheelCooldownHours', 8, 1, 168))
  );
end;
$$;

create or replace function public.games_config()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select public.normalize_games_config((select value from public.casino_settings where key = 'games_config'));
$$;

create or replace function public.vip_config()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select public.normalize_vip_config((select value from public.casino_settings where key = 'vip_config'));
$$;

insert into public.casino_settings (key, value, updated_at)
values ('games_config', public.normalize_games_config('{}'), now())
on conflict (key) do update set value = public.normalize_games_config(public.casino_settings.value), updated_at = now();

insert into public.casino_settings (key, value, updated_at)
values ('vip_config', public.normalize_vip_config('{}'), now())
on conflict (key) do update set value = public.normalize_vip_config(public.casino_settings.value), updated_at = now();

-- L'ancienne économie « coffre / jetons en circulation / cagnotte » n'était
-- qu'un chiffre saisi à la main : on ne garde que la maintenance.
update public.casino_settings
set value = jsonb_build_object(
      'maintenanceMode', coalesce((value->>'maintenanceMode')::boolean, false),
      'maintenanceMessage', coalesce(value->>'maintenanceMessage', 'Le casino est fermé pour maintenance. Revenez bientôt !')
    ),
    updated_at = now()
where key = 'economy_config';

insert into public.casino_settings (key, value)
values ('economy_config', '{"maintenanceMode": false, "maintenanceMessage": "Le casino est fermé pour maintenance. Revenez bientôt !"}')
on conflict (key) do nothing;

-- Vérifie qu'un jeu est ouvert (maintenance générale + interrupteur du jeu)
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
  return v_cfg;
end;
$$;

-- --------------------------------------------------------------------
-- 2. VIP : date d'expiration + paramètres configurables
-- --------------------------------------------------------------------
alter table public.profiles add column if not exists vip_expires_at timestamptz;

update public.profiles
set vip_expires_at = now() + interval '30 days'
where vip_tier is not null and vip_expires_at is null;

create or replace function public.active_vip(p_tier text, p_expires timestamptz)
returns text
language sql
stable
set search_path = ''
as $$
  select case when p_tier is not null and (p_expires is null or p_expires > now()) then p_tier end;
$$;

create or replace function public.wheel_cooldown_hours(p_vip_tier text)
returns numeric
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_raw jsonb;
  v_hours numeric := 24;
  v_vip jsonb;
begin
  select value into v_raw from public.casino_settings where key = 'wheel_cooldown';
  if v_raw is not null and jsonb_typeof(v_raw) = 'number' then
    v_hours := least(greatest((v_raw #>> '{}')::numeric, 1), 168);
  end if;
  if p_vip_tier in ('SILVER', 'GOLD', 'DIAMOND') then
    v_vip := public.vip_config()->p_vip_tier;
    v_hours := least(v_hours, (v_vip->>'wheelCooldownHours')::numeric);
  end if;
  return v_hours;
end;
$$;

create or replace function public.profile_payload(p public.profiles)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_tier text := public.active_vip(p.vip_tier, p.vip_expires_at);
  v_hours numeric := public.wheel_cooldown_hours(v_tier);
begin
  return jsonb_build_object(
    'id', p.id,
    'discord_id', p.discord_id,
    'discord_tag', p.discord_tag,
    'avatar_url', p.avatar_url,
    'rp_first_name', p.rp_first_name,
    'rp_last_name', p.rp_last_name,
    'citizen_id', p.citizen_id,
    'phone_number', p.phone_number,
    'role', p.role,
    'vip_tier', v_tier,
    'vip_expires_at', case when v_tier is not null then p.vip_expires_at end,
    'chips', p.chips,
    'cash', p.cash,
    'inventory', coalesce(to_jsonb(p.inventory), '[]'::jsonb),
    'vehicles', coalesce(to_jsonb(p.vehicles), '[]'::jsonb),
    'total_won', coalesce(p.total_won, 0),
    'total_spins', coalesce(p.total_spins, 0),
    'last_wheel_spin', p.last_wheel_spin,
    'cooldown_hours', v_hours,
    'next_spin_at', case when p.last_wheel_spin is null then null
                         else p.last_wheel_spin + make_interval(secs => v_hours * 3600) end,
    'is_staff', p.role in ('FONDATEUR', 'DÉVELOPPEUR', 'DIRECTEUR CASINO'),
    'created_at', p.created_at
  );
end;
$$;

create or replace function public.buy_vip_with_chips(p_tier text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_profile public.profiles;
  v_new public.profiles;
  v_cfg jsonb := public.vip_config();
  v_price bigint;
  v_bonus bigint;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED' using errcode = '28000';
  end if;
  if p_tier not in ('SILVER', 'GOLD', 'DIAMOND') then
    raise exception 'INVALID_TIER' using errcode = '22023';
  end if;
  v_price := (v_cfg->p_tier->>'price')::bigint;
  v_bonus := (v_cfg->p_tier->>'bonus')::bigint;

  select * into v_profile from public.profiles where user_id = v_uid for update;
  if v_profile.id is null then
    raise exception 'PROFILE_REQUIRED' using errcode = 'P0002';
  end if;
  if public.active_vip(v_profile.vip_tier, v_profile.vip_expires_at) = p_tier then
    raise exception 'VIP_ALREADY_ACTIVE' using errcode = 'P0001';
  end if;
  if v_profile.chips < v_price then
    raise exception 'INSUFFICIENT_CHIPS' using errcode = 'P0001';
  end if;

  -- Pas de remise à zéro du délai de la roue : sinon changer de carte en
  -- boucle permettait d'enchaîner les tirages.
  update public.profiles
  set vip_tier = p_tier,
      vip_expires_at = now() + make_interval(days => (v_cfg->>'durationDays')::int),
      chips = chips - v_price + v_bonus
  where id = v_profile.id
  returning * into v_new;

  update public.casino_transactions
  set status = 'COMPLETED', description = description || ' — auto-achat avec jetons'
  where profile_id = v_profile.id and type = 'VIP_REQUEST' and status = 'PENDING';

  insert into public.casino_transactions (profile_id, type, amount, chips, game, description, status)
  values (v_profile.id, 'VIP_SUBSCRIPTION', 0, -v_price, p_tier, 'Abonnement VIP ' || p_tier, 'COMPLETED');
  if v_bonus > 0 then
    insert into public.casino_transactions (profile_id, type, amount, chips, game, description, status)
    values (v_profile.id, 'VIP_REWARD', 0, v_bonus, p_tier, 'Dotation VIP ' || p_tier, 'COMPLETED');
  end if;

  insert into public.admin_logs (action, category, detail, author)
  values ('Abonnement VIP', 'CITIZEN',
          v_profile.rp_first_name || ' ' || v_profile.rp_last_name || ' (#' || v_profile.citizen_id || ') a acheté la carte ' || p_tier || ' (' || v_price || ' jetons)',
          'Espace Membre');

  return public.profile_payload(v_new);
end;
$$;

-- Hiérarchie : qui a le droit de toucher à la fiche de qui ?
create or replace function public.assert_can_manage(v_me public.profiles, v_target public.profiles)
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if v_target.id = v_me.id then
    return;
  end if;
  if v_target.role = 'FONDATEUR' and v_me.role <> 'FONDATEUR' then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if v_target.role = 'DÉVELOPPEUR' and v_me.role not in ('FONDATEUR', 'DÉVELOPPEUR') then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
end;
$$;

create or replace function public.admin_set_vip(p_profile_id uuid, p_tier text, p_grant_bonus boolean default true)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me public.profiles := public.assert_staff();
  v_cfg jsonb := public.vip_config();
  v_tier text := nullif(p_tier, '');
  v_bonus bigint := 0;
  v_target public.profiles;
  v_new public.profiles;
begin
  if v_tier is not null and v_tier not in ('SILVER', 'GOLD', 'DIAMOND') then
    raise exception 'INVALID_TIER' using errcode = '22023';
  end if;
  select * into v_target from public.profiles where id = p_profile_id for update;
  if v_target.id is null then
    raise exception 'PROFILE_NOT_FOUND' using errcode = 'P0002';
  end if;
  perform public.assert_can_manage(v_me, v_target);

  if v_tier is not null and p_grant_bonus then
    v_bonus := (v_cfg->v_tier->>'bonus')::bigint;
  end if;

  update public.profiles
  set vip_tier = v_tier,
      vip_expires_at = case when v_tier is null then null
                            else now() + make_interval(days => (v_cfg->>'durationDays')::int) end,
      chips = chips + v_bonus
  where id = p_profile_id
  returning * into v_new;

  update public.casino_transactions
  set status = 'COMPLETED', description = description || ' — validée'
  where profile_id = p_profile_id and type = 'VIP_REQUEST' and status = 'PENDING';

  if v_bonus > 0 then
    insert into public.casino_transactions (profile_id, type, amount, chips, game, description, status)
    values (v_new.id, 'VIP_REWARD', 0, v_bonus, v_tier, 'Activation VIP ' || v_tier || ' — dotation', 'COMPLETED');
  end if;

  insert into public.admin_logs (action, category, detail, author)
  values ('Statut VIP', 'CITIZEN',
          coalesce('VIP ' || v_tier || ' activé', 'VIP retiré') || ' pour #' || v_new.citizen_id
            || case when v_bonus > 0 then ' (+' || v_bonus || ' jetons)' else '' end,
          coalesce(v_me.rp_first_name || ' ' || v_me.rp_last_name, 'Console Admin'));

  return to_jsonb(v_new);
end;
$$;

create or replace function public.admin_reject_vip_request(p_transaction_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me public.profiles := public.assert_staff();
  v_tx public.casino_transactions;
begin
  update public.casino_transactions
  set status = 'CANCELLED', description = description || ' — refusée'
  where id = p_transaction_id and type = 'VIP_REQUEST' and status = 'PENDING'
  returning * into v_tx;
  if v_tx.id is not null then
    insert into public.admin_logs (action, category, detail, author)
    values ('Demande VIP refusée', 'CITIZEN',
            'Carte ' || coalesce(v_tx.game, '?') || ' pour #' || coalesce((select citizen_id from public.profiles where id = v_tx.profile_id), '?'),
            coalesce(v_me.rp_first_name || ' ' || v_me.rp_last_name, 'Console Admin'));
  end if;
end;
$$;

create or replace function public.admin_adjust_balance(
  p_profile_id uuid,
  p_chips_delta bigint default 0,
  p_cash_delta bigint default 0,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me public.profiles := public.assert_staff();
  v_old public.profiles;
  v_new public.profiles;
  v_reason text := nullif(left(trim(coalesce(p_reason, '')), 140), '');
begin
  if abs(coalesce(p_chips_delta, 0)) > 1000000000 then
    raise exception 'INVALID_AMOUNT' using errcode = '22023';
  end if;
  select * into v_old from public.profiles where id = p_profile_id for update;
  if v_old.id is null then
    raise exception 'PROFILE_NOT_FOUND' using errcode = 'P0002';
  end if;
  perform public.assert_can_manage(v_me, v_old);

  update public.profiles
  set chips = greatest(chips + coalesce(p_chips_delta, 0), 0)
  where id = p_profile_id
  returning * into v_new;

  insert into public.casino_transactions (profile_id, type, amount, chips, game, description, status)
  values (v_new.id, 'ADMIN_ADJUST', 0, v_new.chips - v_old.chips, null,
          coalesce(v_reason, 'Ajustement par la gérance'), 'COMPLETED');

  insert into public.admin_logs (action, category, detail, author)
  values ('Ajustement solde', 'ECONOMY',
          to_char(v_new.chips - v_old.chips, 'SGFM999G999G999G990') || ' jetons pour #' || v_new.citizen_id || coalesce(' — ' || v_reason, ''),
          coalesce(v_me.rp_first_name || ' ' || v_me.rp_last_name, 'Console Admin'));

  return to_jsonb(v_new);
end;
$$;

create or replace function public.admin_update_profile(p_profile_id uuid, p_patch jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me public.profiles := public.assert_staff();
  v_cfg jsonb := public.vip_config();
  v_old public.profiles;
  v_new public.profiles;
  v_first text;
  v_last text;
  v_cid text;
  v_phone text;
  v_role text;
  v_tier text;
  v_chips bigint;
  v_changes text[] := '{}';
begin
  select * into v_old from public.profiles where id = p_profile_id for update;
  if v_old.id is null then
    raise exception 'PROFILE_NOT_FOUND' using errcode = 'P0002';
  end if;
  perform public.assert_can_manage(v_me, v_old);

  v_first := coalesce(trim(p_patch->>'rp_first_name'), v_old.rp_first_name);
  v_last := coalesce(trim(p_patch->>'rp_last_name'), v_old.rp_last_name);
  v_cid := coalesce(trim(p_patch->>'citizen_id'), v_old.citizen_id);
  v_phone := case when p_patch ? 'phone_number' then nullif(trim(coalesce(p_patch->>'phone_number', '')), '') else v_old.phone_number end;
  v_role := coalesce(p_patch->>'role', v_old.role);
  v_tier := case when p_patch ? 'vip_tier' then nullif(p_patch->>'vip_tier', '') else v_old.vip_tier end;
  v_chips := case when jsonb_typeof(p_patch->'chips') = 'number'
                  then least(greatest((p_patch->>'chips')::numeric, 0), 100000000000)::bigint
                  else v_old.chips end;

  perform public.validate_rp_identity(v_first, v_last, v_cid, v_phone);

  if v_cid is distinct from v_old.citizen_id
     and exists (select 1 from public.profiles where citizen_id = v_cid and id <> v_old.id) then
    raise exception 'CITIZEN_ID_TAKEN' using errcode = '23505';
  end if;
  if v_tier is not null and v_tier not in ('SILVER', 'GOLD', 'DIAMOND') then
    raise exception 'INVALID_TIER' using errcode = '22023';
  end if;
  if v_role not in ('FONDATEUR', 'DÉVELOPPEUR', 'DIRECTEUR CASINO', 'MEMBRE') then
    raise exception 'INVALID_ROLE' using errcode = '22023';
  end if;
  if v_role is distinct from v_old.role then
    if not public.can_manage_roles() then
      raise exception 'FORBIDDEN_ROLE_CHANGE' using errcode = '42501';
    end if;
    if (v_role = 'FONDATEUR' or v_old.role = 'FONDATEUR') and v_me.role <> 'FONDATEUR' then
      raise exception 'FORBIDDEN_ROLE_CHANGE' using errcode = '42501';
    end if;
    if v_old.id = v_me.id then
      raise exception 'FORBIDDEN_ROLE_CHANGE' using errcode = '42501';
    end if;
    v_changes := v_changes || ('rôle ' || v_old.role || ' → ' || v_role);
  end if;

  if v_first is distinct from v_old.rp_first_name or v_last is distinct from v_old.rp_last_name then
    v_changes := v_changes || 'nom RP'::text;
  end if;
  if v_cid is distinct from v_old.citizen_id then v_changes := v_changes || ('matricule #' || v_old.citizen_id || ' → #' || v_cid); end if;
  if v_phone is distinct from v_old.phone_number then v_changes := v_changes || 'téléphone'::text; end if;
  if v_tier is distinct from v_old.vip_tier then v_changes := v_changes || ('VIP ' || coalesce(v_tier, 'aucun')); end if;
  if v_chips <> v_old.chips then v_changes := v_changes || ('solde ' || v_old.chips || ' → ' || v_chips); end if;
  if p_patch ? 'admin_note' then v_changes := v_changes || 'note staff'::text; end if;

  update public.profiles set
    rp_first_name = v_first,
    rp_last_name = v_last,
    citizen_id = v_cid,
    phone_number = v_phone,
    role = v_role,
    vip_tier = v_tier,
    vip_expires_at = case when v_tier is null then null
                          when v_tier is distinct from v_old.vip_tier then now() + make_interval(days => (v_cfg->>'durationDays')::int)
                          else vip_expires_at end,
    chips = v_chips,
    avatar_url = case when p_patch ? 'avatar_url' then nullif(left(p_patch->>'avatar_url', 500), '') else avatar_url end,
    admin_note = case when p_patch ? 'admin_note'
                      then case when jsonb_typeof(p_patch->'admin_note') = 'object' then p_patch->'admin_note' else null end
                      else admin_note end
  where id = p_profile_id
  returning * into v_new;

  if v_new.chips <> v_old.chips then
    insert into public.casino_transactions (profile_id, type, amount, chips, game, description, status)
    values (v_new.id, 'ADMIN_ADJUST', 0, v_new.chips - v_old.chips, null,
            'Solde modifié par la gérance (' || coalesce(v_me.rp_first_name, 'Staff') || ')', 'COMPLETED');
  end if;

  if array_length(v_changes, 1) > 0 then
    insert into public.admin_logs (action, category, detail, author)
    values ('Fiche modifiée', 'CITIZEN',
            '#' || v_new.citizen_id || ' (' || v_new.rp_first_name || ' ' || v_new.rp_last_name || ') : ' || array_to_string(v_changes, ', '),
            coalesce(v_me.rp_first_name || ' ' || v_me.rp_last_name, 'Console Admin'));
  end if;

  return to_jsonb(v_new);
end;
$$;

-- Expiration paresseuse du VIP à la connexion
create or replace function public.get_my_profile()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_profile public.profiles;
  v_identity record;
begin
  if v_uid is null then
    return null;
  end if;

  select provider_id, identity_data into v_identity
  from auth.identities
  where user_id = v_uid and provider = 'discord'
  limit 1;

  select * into v_profile from public.profiles where user_id = v_uid;

  if v_profile.id is null and v_identity.provider_id is not null then
    update public.profiles
    set user_id = v_uid
    where discord_id = v_identity.provider_id and user_id is null
    returning * into v_profile;
  end if;

  if v_profile.id is null then
    return null;
  end if;

  update public.profiles
  set avatar_url = coalesce(nullif(v_identity.identity_data->>'avatar_url', ''), avatar_url),
      discord_tag = coalesce(
        nullif(v_identity.identity_data->'custom_claims'->>'global_name', ''),
        nullif(v_identity.identity_data->>'full_name', ''),
        discord_tag
      ),
      vip_tier = public.active_vip(vip_tier, vip_expires_at),
      vip_expires_at = case when public.active_vip(vip_tier, vip_expires_at) is null then null else vip_expires_at end
  where id = v_profile.id
  returning * into v_profile;

  return public.profile_payload(v_profile);
end;
$$;

-- --------------------------------------------------------------------
-- 3. ROUE : interrupteur du jeu + VIP expiré ignoré
-- --------------------------------------------------------------------
create or replace function public.spin_wheel()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_profile public.profiles;
  v_segments jsonb;
  v_count int;
  v_total numeric := 0;
  v_weight numeric;
  v_rand numeric;
  v_idx int;
  v_seg jsonb;
  v_type text;
  v_label text;
  v_item text;
  v_chips bigint := 0;
  v_hours numeric;
  v_vehicle public.vehicle_catalog;
  v_reward_id uuid;
  i int;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED' using errcode = '28000';
  end if;
  perform public.assert_game_open('wheel');

  select * into v_profile from public.profiles where user_id = v_uid for update;
  if v_profile.id is null then
    raise exception 'PROFILE_REQUIRED' using errcode = 'P0002';
  end if;

  v_hours := public.wheel_cooldown_hours(public.active_vip(v_profile.vip_tier, v_profile.vip_expires_at));
  if v_profile.last_wheel_spin is not null
     and v_profile.last_wheel_spin + make_interval(secs => v_hours * 3600) > now() then
    raise exception 'COOLDOWN' using errcode = 'P0001';
  end if;

  select value into v_segments from public.casino_settings where key = 'wheel_segments';
  if v_segments is null or jsonb_typeof(v_segments) <> 'array' or jsonb_array_length(v_segments) = 0 then
    raise exception 'WHEEL_NOT_CONFIGURED' using errcode = 'P0001';
  end if;
  v_count := jsonb_array_length(v_segments);

  for i in 0 .. v_count - 1 loop
    if jsonb_typeof(v_segments->i->'dropRate') = 'number' then
      v_total := v_total + greatest((v_segments->i->>'dropRate')::numeric, 0);
    end if;
  end loop;

  if v_total <= 0 then
    v_idx := floor(random() * v_count)::int;
  else
    v_rand := random() * v_total;
    v_idx := v_count - 1;
    for i in 0 .. v_count - 1 loop
      v_weight := case when jsonb_typeof(v_segments->i->'dropRate') = 'number'
                       then greatest((v_segments->i->>'dropRate')::numeric, 0) else 0 end;
      if v_weight > 0 and v_rand < v_weight then
        v_idx := i;
        exit;
      end if;
      v_rand := v_rand - v_weight;
    end loop;
  end if;

  v_seg := v_segments->v_idx;
  v_type := coalesce(v_seg->>'type', 'mystery');
  if v_type = 'cash' then v_type := 'chips'; end if;
  v_label := left(coalesce(v_seg->>'label', 'Lot mystère'), 60);
  v_item := left(coalesce(v_seg->>'value', v_label), 80);

  if v_type = 'chips' and jsonb_typeof(v_seg->'value') = 'number' then
    v_chips := least(greatest((v_seg->>'value')::numeric, 0), 100000000)::bigint;
  end if;

  update public.profiles
  set chips = chips + v_chips,
      total_won = coalesce(total_won, 0) + v_chips,
      total_spins = coalesce(total_spins, 0) + 1,
      last_wheel_spin = now()
  where id = v_profile.id
  returning * into v_profile;

  if v_type <> 'chips' then
    if v_type = 'vehicle' and nullif(v_seg->>'vehicleModel', '') is not null then
      select * into v_vehicle from public.vehicle_catalog where model = v_seg->>'vehicleModel';
    end if;
    insert into public.player_rewards (profile_id, kind, label, vehicle_model, image_url, source)
    values (v_profile.id,
            case when v_type = 'vehicle' then 'vehicle' else 'item' end,
            v_item,
            v_vehicle.model,
            coalesce(nullif(v_seg->>'imageUrl', ''), v_vehicle.photo_url),
            'wheel')
    returning id into v_reward_id;
  end if;

  insert into public.bets_history (profile_id, game_id, bet_amount, win_amount, multiplier, result_data)
  values (v_profile.id, 'lucky_wheel', 0, v_chips, 1,
          jsonb_build_object('segment_index', v_idx, 'segment', v_label, 'type', v_type, 'value', v_seg->'value'));

  insert into public.casino_transactions (profile_id, type, amount, chips, game, description, status)
  values (v_profile.id, 'WHEEL', 0, v_chips, 'lucky_wheel',
          'Roue de la Fortune : ' || v_label || case when v_type = 'chips' then '' else ' (' || v_item || ')' end,
          'COMPLETED');

  return jsonb_build_object(
    'segment_index', v_idx,
    'segment', v_seg,
    'reward_id', v_reward_id,
    'profile', public.profile_payload(v_profile)
  );
end;
$$;

-- --------------------------------------------------------------------
-- 4. MINES — manche entièrement gérée par le serveur
-- --------------------------------------------------------------------
create table if not exists public.mines_rounds (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  bet bigint not null check (bet > 0),
  mines integer not null check (mines between 1 and 24),
  rtp numeric not null,
  max_payout bigint not null,
  board boolean[] not null,
  server_seed text not null,
  hash text not null,
  revealed integer[] not null default '{}',
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'LOST', 'CASHED')),
  multiplier numeric not null default 1,
  win bigint not null default 0,
  created_at timestamptz not null default now(),
  ended_at timestamptz
);
create unique index if not exists mines_rounds_one_active on public.mines_rounds (profile_id) where status = 'ACTIVE';
create index if not exists mines_rounds_profile_idx on public.mines_rounds (profile_id, created_at desc);
alter table public.mines_rounds enable row level security;
-- Aucune policy : la grille (board) ne doit jamais être lisible par le client.

create or replace function public.mines_multiplier(p_mines integer, p_gems integer, p_rtp numeric)
returns numeric
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_p numeric := 1;
  v_mult numeric;
  i integer;
begin
  if p_gems <= 0 then
    return 1;
  end if;
  for i in 0 .. p_gems - 1 loop
    v_p := v_p * (25 - p_mines - i)::numeric / (25 - i)::numeric;
  end loop;
  if v_p <= 0 then
    return 0;
  end if;
  v_mult := (p_rtp / 100) / v_p;
  return case when v_mult < 1.05 then round(v_mult, 4) else round(v_mult, 2) end;
end;
$$;

create or replace function public.mines_round_payload(r public.mines_rounds, p_reveal boolean)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_gems integer := coalesce(array_length(r.revealed, 1), 0) - case when r.status = 'LOST' then 1 else 0 end;
begin
  return jsonb_build_object(
    'round_id', r.id,
    'status', r.status,
    'bet', r.bet,
    'mines', r.mines,
    'rtp', r.rtp,
    'revealed', to_jsonb(r.revealed),
    'gems', v_gems,
    'multiplier', r.multiplier,
    'next_multiplier', public.mines_multiplier(r.mines, v_gems + 1, r.rtp),
    'win', r.win,
    'hash', r.hash,
    'board', case when p_reveal then to_jsonb(r.board) end,
    'server_seed', case when p_reveal then r.server_seed end
  );
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
  if exists (select 1 from public.mines_rounds where profile_id = v_profile.id and status = 'ACTIVE') then
    raise exception 'ROUND_IN_PROGRESS' using errcode = 'P0001';
  end if;
  if v_profile.chips < p_bet then
    raise exception 'INSUFFICIENT_FUNDS' using errcode = 'P0001';
  end if;

  -- Tirage cryptographique : on classe les 25 cases selon des octets aléatoires
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
    v_profile.id, p_bet, p_mines, (v_cfg->>'rtp')::numeric, (v_cfg->>'maxPayout')::bigint, v_board, v_seed,
    encode(extensions.digest(v_seed || ':' || array_to_string(
      array(select case when b then 'M' else 'D' end from unnest(v_board) as b), ''), 'sha256'), 'hex')
  )
  returning * into v_round;

  insert into public.casino_transactions (profile_id, type, amount, chips, game, description, status)
  values (v_profile.id, 'BET', 0, -p_bet, 'mines', 'Mines : mise de ' || p_bet || ' jetons (' || p_mines || ' mines)', 'COMPLETED');

  return public.mines_round_payload(v_round, false) || jsonb_build_object('profile', public.profile_payload(v_profile));
end;
$$;

-- Clôture interne (gain crédité, historique)
create or replace function public.mines_finish(p_round public.mines_rounds, p_status text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_round public.mines_rounds := p_round;
  v_gems integer := coalesce(array_length(p_round.revealed, 1), 0);
  v_profile public.profiles;
begin
  if p_status = 'CASHED' then
    v_round.win := least(floor(v_round.bet * v_round.multiplier), v_round.max_payout)::bigint;
  else
    v_round.win := 0;
    v_round.multiplier := 0;
    v_gems := v_gems - 1;
  end if;

  update public.mines_rounds
  set status = p_status, win = v_round.win, multiplier = v_round.multiplier, ended_at = now()
  where id = v_round.id
  returning * into v_round;

  update public.profiles
  set chips = chips + v_round.win,
      total_won = coalesce(total_won, 0) + greatest(v_round.win - v_round.bet, 0)
  where id = v_round.profile_id
  returning * into v_profile;

  insert into public.bets_history (profile_id, game_id, bet_amount, win_amount, multiplier, result_data)
  values (v_round.profile_id, 'mines', v_round.bet, v_round.win, v_round.multiplier,
          jsonb_build_object('round_id', v_round.id, 'mines', v_round.mines, 'gems', v_gems, 'won', v_round.win > 0));

  if v_round.win > 0 then
    insert into public.casino_transactions (profile_id, type, amount, chips, game, description, status)
    values (v_round.profile_id, 'WIN', 0, v_round.win, 'mines',
            'Mines : gain de ' || v_round.win || ' jetons (x' || v_round.multiplier || ', ' || v_round.mines || ' mines)', 'COMPLETED');
  end if;

  return public.mines_round_payload(v_round, true) || jsonb_build_object('profile', public.profile_payload(v_profile));
end;
$$;

create or replace function public.mines_reveal(p_round_id uuid, p_cell integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_round public.mines_rounds;
  v_gems integer;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED' using errcode = '28000';
  end if;
  select r.* into v_round
  from public.mines_rounds r
  join public.profiles p on p.id = r.profile_id
  where r.id = p_round_id and p.user_id = v_uid and r.status = 'ACTIVE'
  for update of r;
  if v_round.id is null then
    raise exception 'ROUND_NOT_FOUND' using errcode = 'P0002';
  end if;
  if p_cell is null or p_cell < 0 or p_cell > 24 or p_cell = any(v_round.revealed) then
    raise exception 'INVALID_CELL' using errcode = 'P0001';
  end if;

  v_round.revealed := v_round.revealed || p_cell;
  update public.mines_rounds set revealed = v_round.revealed where id = v_round.id;

  if v_round.board[p_cell + 1] then
    return public.mines_finish(v_round, 'LOST') || jsonb_build_object('cell', p_cell, 'hit', true);
  end if;

  v_gems := array_length(v_round.revealed, 1);
  v_round.multiplier := public.mines_multiplier(v_round.mines, v_gems, v_round.rtp);
  update public.mines_rounds set multiplier = v_round.multiplier where id = v_round.id;

  if v_gems >= 25 - v_round.mines then
    return public.mines_finish(v_round, 'CASHED') || jsonb_build_object('cell', p_cell, 'hit', false);
  end if;

  return public.mines_round_payload(v_round, false) || jsonb_build_object('cell', p_cell, 'hit', false);
end;
$$;

create or replace function public.mines_cashout(p_round_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_round public.mines_rounds;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED' using errcode = '28000';
  end if;
  select r.* into v_round
  from public.mines_rounds r
  join public.profiles p on p.id = r.profile_id
  where r.id = p_round_id and p.user_id = v_uid and r.status = 'ACTIVE'
  for update of r;
  if v_round.id is null then
    raise exception 'ROUND_NOT_FOUND' using errcode = 'P0002';
  end if;
  if coalesce(array_length(v_round.revealed, 1), 0) = 0 then
    raise exception 'NOTHING_TO_CASHOUT' using errcode = 'P0001';
  end if;
  return public.mines_finish(v_round, 'CASHED');
end;
$$;

-- Reprise d'une manche en cours (onglet fermé / rechargé)
create or replace function public.mines_current()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_round public.mines_rounds;
begin
  if auth.uid() is null then
    return null;
  end if;
  select r.* into v_round
  from public.mines_rounds r
  join public.profiles p on p.id = r.profile_id
  where p.user_id = auth.uid() and r.status = 'ACTIVE';
  if v_round.id is null then
    return null;
  end if;
  return public.mines_round_payload(v_round, false);
end;
$$;

-- --------------------------------------------------------------------
-- 5. MACHINES À SOUS — règlement appelé UNIQUEMENT par la fonction Edge
--    « slot-round » (clé service_role), qui fait le tirage elle-même.
-- --------------------------------------------------------------------
create or replace function public.settle_slot_round(
  p_user_id uuid,
  p_game text,
  p_bet bigint,
  p_cost bigint,
  p_win bigint,
  p_detail jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile public.profiles;
  v_cfg jsonb;
  v_label text := case p_game when 'doghouse' then 'The Dog House' when 'wanted' then 'Wanted Dead or a Wild' else p_game end;
  v_net bigint;
  v_mode text := coalesce(p_detail->>'mode', 'spin');
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

  select * into v_profile from public.profiles where user_id = p_user_id for update;
  if v_profile.id is null then
    raise exception 'PROFILE_REQUIRED' using errcode = 'P0002';
  end if;
  if v_profile.chips < p_cost then
    raise exception 'INSUFFICIENT_FUNDS' using errcode = 'P0001';
  end if;

  v_net := p_win - p_cost;
  update public.profiles
  set chips = chips + v_net,
      total_wagered = coalesce(total_wagered, 0) + p_cost,
      total_won = coalesce(total_won, 0) + greatest(v_net, 0)
  where id = v_profile.id
  returning * into v_profile;

  insert into public.bets_history (profile_id, game_id, bet_amount, win_amount, multiplier, result_data)
  values (v_profile.id, p_game, p_cost, p_win, case when p_cost > 0 then round(p_win::numeric / p_cost, 2) else 0 end,
          jsonb_build_object('mode', v_mode, 'bet', p_bet, 'bonus', p_detail->'bonus', 'won', p_win > 0));

  insert into public.casino_transactions (profile_id, type, amount, chips, game, description, status)
  values (v_profile.id, case when v_net > 0 then 'WIN' else 'BET' end, 0, v_net, p_game,
          v_label || case v_mode when 'buy' then ' (achat bonus)' when 'boost' then ' (boost)' else '' end
            || ' : mise ' || p_cost || ', gain ' || p_win, 'COMPLETED');

  return public.profile_payload(v_profile);
end;
$$;

-- Historique homogène : identifiants de jeu courts
update public.bets_history set game_id = 'doghouse' where game_id = 'The Dog House';
update public.bets_history set game_id = 'wanted' where game_id = 'Wanted Dead or a Wild';
update public.casino_transactions set game = 'doghouse' where game = 'The Dog House';
update public.casino_transactions set game = 'wanted' where game = 'Wanted Dead or a Wild';

-- --------------------------------------------------------------------
-- 6. RÉGLAGES : écriture unique via admin_set_setting (validée + tracée)
-- --------------------------------------------------------------------
create or replace function public.admin_set_setting(p_key text, p_value jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me public.profiles := public.assert_staff();
  v_value jsonb;
  v_seg jsonb;
  v_segs jsonb := '[]';
  v_label text;
  v_type text;
  i int := 0;
  v_detail text;
begin
  case p_key
    when 'games_config' then
      v_value := public.normalize_games_config(p_value);
      v_detail := 'Réglages des jeux mis à jour';
    when 'vip_config' then
      v_value := public.normalize_vip_config(p_value);
      v_detail := 'Tarifs et avantages VIP mis à jour';
    when 'economy_config' then
      v_value := jsonb_build_object(
        'maintenanceMode', public.jbool(p_value, 'maintenanceMode', false),
        'maintenanceMessage', left(coalesce(p_value->>'maintenanceMessage', ''), 200));
      v_detail := case when (v_value->>'maintenanceMode')::boolean then 'Maintenance ACTIVÉE' else 'Maintenance désactivée' end;
    when 'wheel_cooldown' then
      if jsonb_typeof(p_value) <> 'number' then
        raise exception 'INVALID_SETTING' using errcode = '22023';
      end if;
      v_value := to_jsonb(least(greatest((p_value #>> '{}')::numeric, 1), 168));
      v_detail := 'Délai de la roue : ' || (v_value #>> '{}') || ' h';
    when 'podium_vehicle' then
      if jsonb_typeof(p_value) <> 'object' then
        raise exception 'INVALID_SETTING' using errcode = '22023';
      end if;
      v_value := jsonb_build_object(
        'name', left(coalesce(p_value->>'name', 'Véhicule'), 60),
        'model', nullif(left(coalesce(p_value->>'model', ''), 64), ''),
        'value', public.jnum(p_value, 'value', 0, 0, 1000000000),
        'imageUrl', left(coalesce(p_value->>'imageUrl', ''), 500));
      v_detail := 'Véhicule du podium : ' || (v_value->>'name');
    when 'wheel_segments' then
      if jsonb_typeof(p_value) <> 'array' or jsonb_array_length(p_value) < 2 or jsonb_array_length(p_value) > 24 then
        raise exception 'INVALID_SETTING' using errcode = '22023';
      end if;
      for v_seg in select value from jsonb_array_elements(p_value) loop
        v_type := coalesce(v_seg->>'type', 'mystery');
        if v_type = 'cash' then v_type := 'chips'; end if;
        if v_type not in ('chips', 'vehicle', 'mystery', 'clothing') then
          raise exception 'INVALID_SETTING' using errcode = '22023';
        end if;
        v_label := left(coalesce(nullif(trim(v_seg->>'label'), ''), 'Lot'), 30);
        v_segs := v_segs || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
          'id', i,
          'label', v_label,
          'type', v_type,
          'value', case when v_type = 'chips' then to_jsonb(public.jnum(v_seg, 'value', 0, 0, 100000000)::bigint)
                        else to_jsonb(left(coalesce(v_seg->>'value', v_label), 80)) end,
          'dropRate', public.jnum(v_seg, 'dropRate', 0, 0, 100),
          'color', left(coalesce(v_seg->>'color', '#171717'), 20),
          'textColor', left(coalesce(v_seg->>'textColor', '#ffffff'), 20),
          'icon', left(coalesce(v_seg->>'icon', '🎁'), 8),
          'vehicleModel', case when v_type = 'vehicle' then nullif(left(coalesce(v_seg->>'vehicleModel', ''), 64), '') end,
          'imageUrl', nullif(left(coalesce(v_seg->>'imageUrl', ''), 500), '')
        )));
        i := i + 1;
      end loop;
      v_value := v_segs;
      v_detail := 'Segments de la roue mis à jour (' || i || ' lots)';
    when 'announcements' then
      v_value := jsonb_build_object('text', left(coalesce(p_value->>'text', ''), 300), 'active', public.jbool(p_value, 'active', false));
      v_detail := 'Annonce mise à jour';
    else
      raise exception 'INVALID_SETTING' using errcode = '22023';
  end case;

  insert into public.casino_settings (key, value, updated_at)
  values (p_key, v_value, now())
  on conflict (key) do update set value = excluded.value, updated_at = now();

  insert into public.admin_logs (action, category, detail, author)
  values ('Réglage modifié', case when p_key in ('wheel_segments', 'wheel_cooldown', 'podium_vehicle') then 'WHEEL'
                                   when p_key in ('games_config', 'vip_config') then 'ECONOMY'
                                   else 'SYSTEM' end,
          v_detail, coalesce(v_me.rp_first_name || ' ' || v_me.rp_last_name, 'Console Admin'));

  return v_value;
end;
$$;

drop policy if exists "settings_insert_staff" on public.casino_settings;
drop policy if exists "settings_update_staff" on public.casino_settings;
drop policy if exists "admin_logs_insert_staff" on public.admin_logs;
drop policy if exists "jackpot_update_staff" on public.jackpot_pool;

-- --------------------------------------------------------------------
-- 7. TABLEAU DE BORD : chiffres réels calculés en base
-- --------------------------------------------------------------------
create or replace function public.admin_dashboard(p_days integer default 7)
returns jsonb
language plpgsql
stable
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
begin
  select coalesce(jsonb_object_agg(game_id, jsonb_build_object(
           'rounds', rounds, 'players', players, 'wagered', wagered, 'paid', paid,
           'profit', wagered - paid, 'rtp', case when wagered > 0 then round(paid::numeric * 100 / wagered, 1) end,
           'biggest_win', biggest)), '{}')
  into v_games
  from (
    select game_id, count(*) rounds, count(distinct profile_id) players,
           coalesce(sum(bet_amount), 0) wagered, coalesce(sum(win_amount), 0) paid, coalesce(max(win_amount), 0) biggest
    from public.bets_history
    where created_at >= v_since
    group by game_id
  ) g;

  select jsonb_build_object(
    'players', (select count(*) from public.profiles),
    'linked_players', (select count(*) from public.profiles where user_id is not null),
    'active_players', (select count(distinct profile_id) from public.bets_history where created_at >= v_since),
    'chips_in_circulation', (select coalesce(sum(chips), 0) from public.profiles),
    'chips_players_only', (select coalesce(sum(chips), 0) from public.profiles where role = 'MEMBRE'),
    'vip_active', (select count(*) from public.profiles where public.active_vip(vip_tier, vip_expires_at) is not null),
    'admin_injected', (select coalesce(sum(chips), 0) from public.casino_transactions where type = 'ADMIN_ADJUST' and chips > 0 and created_at >= v_since),
    'admin_removed', (select coalesce(-sum(chips), 0) from public.casino_transactions where type = 'ADMIN_ADJUST' and chips < 0 and created_at >= v_since),
    'vip_sales', (select coalesce(-sum(chips), 0) from public.casino_transactions where type = 'VIP_SUBSCRIPTION' and created_at >= v_since),
    'vip_bonuses', (select coalesce(sum(chips), 0) from public.casino_transactions where type = 'VIP_REWARD' and created_at >= v_since),
    'pending_vip', (select count(*) from public.casino_transactions where type = 'VIP_REQUEST' and status = 'PENDING'),
    'pending_rewards', (select count(*) from public.player_rewards where status = 'CLAIMED'),
    'mines_open_rounds', (select count(*) from public.mines_rounds where status = 'ACTIVE'),
    'mines_open_stake', (select coalesce(sum(bet), 0) from public.mines_rounds where status = 'ACTIVE')
  ) into v_totals;

  select coalesce(jsonb_agg(t order by t.net desc), '[]') into v_top
  from (
    select p.id, p.rp_first_name || ' ' || p.rp_last_name as name, p.citizen_id, p.role,
           sum(b.bet_amount) wagered, sum(b.win_amount) paid, sum(b.win_amount) - sum(b.bet_amount) net, count(*) rounds
    from public.bets_history b
    join public.profiles p on p.id = b.profile_id
    where b.created_at >= v_since and b.game_id <> 'lucky_wheel'
    group by p.id
    order by net desc
    limit 8
  ) t;

  select coalesce(jsonb_agg(d order by d.day), '[]') into v_daily
  from (
    select to_char(date_trunc('day', created_at), 'YYYY-MM-DD') as day,
           sum(bet_amount) wagered, sum(win_amount) paid, count(*) rounds
    from public.bets_history
    where created_at >= greatest(v_since, now() - interval '30 days')
    group by 1
  ) d;

  return jsonb_build_object('since', v_since, 'days', p_days, 'games', v_games, 'totals', v_totals, 'top_players', v_top, 'daily', v_daily);
end;
$$;

-- --------------------------------------------------------------------
-- 8. Type de transaction « achat VIP »
-- --------------------------------------------------------------------
alter table public.casino_transactions drop constraint if exists casino_transactions_type_check;
alter table public.casino_transactions add constraint casino_transactions_type_check
  check (type in ('DEPOSIT', 'WITHDRAW', 'BET', 'WIN', 'WHEEL', 'VIP_REWARD', 'VIP_REQUEST', 'VIP_SUBSCRIPTION', 'ADMIN_ADJUST'));

-- --------------------------------------------------------------------
-- 9. DROITS D'EXÉCUTION
-- --------------------------------------------------------------------
do $$
declare
  f text;
begin
  foreach f in array array[
    'public.jnum(jsonb, text, numeric, numeric, numeric)',
    'public.jbool(jsonb, text, boolean)',
    'public.normalize_games_config(jsonb)',
    'public.normalize_vip_config(jsonb)',
    'public.games_config()',
    'public.vip_config()',
    'public.assert_game_open(text)',
    'public.active_vip(text, timestamptz)',
    'public.wheel_cooldown_hours(text)',
    'public.profile_payload(public.profiles)',
    'public.assert_can_manage(public.profiles, public.profiles)',
    'public.buy_vip_with_chips(text)',
    'public.admin_set_vip(uuid, text, boolean)',
    'public.admin_reject_vip_request(uuid)',
    'public.admin_adjust_balance(uuid, bigint, bigint, text)',
    'public.admin_update_profile(uuid, jsonb)',
    'public.get_my_profile()',
    'public.spin_wheel()',
    'public.mines_multiplier(integer, integer, numeric)',
    'public.mines_round_payload(public.mines_rounds, boolean)',
    'public.mines_start(bigint, integer)',
    'public.mines_finish(public.mines_rounds, text)',
    'public.mines_reveal(uuid, integer)',
    'public.mines_cashout(uuid)',
    'public.mines_current()',
    'public.settle_slot_round(uuid, text, bigint, bigint, bigint, jsonb)',
    'public.admin_set_setting(text, jsonb)',
    'public.admin_dashboard(integer)'
  ] loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
  end loop;
end $$;

grant execute on function public.get_my_profile() to authenticated;
grant execute on function public.spin_wheel() to authenticated;
grant execute on function public.buy_vip_with_chips(text) to authenticated;
grant execute on function public.mines_start(bigint, integer) to authenticated;
grant execute on function public.mines_reveal(uuid, integer) to authenticated;
grant execute on function public.mines_cashout(uuid) to authenticated;
grant execute on function public.mines_current() to authenticated;
grant execute on function public.admin_set_vip(uuid, text, boolean) to authenticated;
grant execute on function public.admin_reject_vip_request(uuid) to authenticated;
grant execute on function public.admin_adjust_balance(uuid, bigint, bigint, text) to authenticated;
grant execute on function public.admin_update_profile(uuid, jsonb) to authenticated;
grant execute on function public.admin_set_setting(text, jsonb) to authenticated;
grant execute on function public.admin_dashboard(integer) to authenticated;
-- Règlement des machines à sous : seule la fonction Edge (service_role) peut l'appeler
grant execute on function public.settle_slot_round(uuid, text, bigint, bigint, bigint, jsonb) to service_role;
grant execute on function public.games_config() to service_role;

revoke truncate on public.mines_rounds from anon, authenticated;
