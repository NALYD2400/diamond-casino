-- ====================================================================
-- THE DIAMOND CASINO & RESORT — SÉCURISATION DU BACKEND
-- ====================================================================
-- Avant : toutes les tables étaient lisibles ET modifiables par n'importe
-- quel visiteur (même non connecté) : jetons, rôles, réglages de la roue…
-- Après :
--   * chaque profil est lié à un compte Supabase Auth (Discord OAuth) ;
--   * le client ne peut plus écrire directement dans les tables sensibles ;
--   * tout ce qui touche aux soldes, au cooldown de la roue, au VIP et à
--     l'administration passe par des fonctions SQL (SECURITY DEFINER) qui
--     vérifient l'identité et le rôle côté serveur ;
--   * le tirage de la roue est effectué côté serveur (le client ne choisit
--     plus son lot).
-- ====================================================================

-- --------------------------------------------------------------------
-- 1. PROFILES : nouvelles colonnes, contraintes et normalisation
-- --------------------------------------------------------------------
alter table public.profiles
  add column if not exists vip_tier text,
  add column if not exists discord_tag text,
  add column if not exists admin_note jsonb,
  add column if not exists total_spins integer not null default 0;

alter table public.profiles alter column chips set default 0;
alter table public.profiles alter column cash set default 0;
alter table public.profiles alter column chips_balance set default 0;
alter table public.profiles alter column cash_balance set default 0;
alter table public.profiles alter column role set default 'MEMBRE';
alter table public.profiles alter column vip_level set default 'MEMBRE';

-- Normalisation des rôles hérités (owner / PROPRIÉTAIRE FONDATEUR / …)
update public.profiles set role = case
  when role ilike '%FOND%' or role ilike '%PROPRI%' then 'FONDATEUR'
  when role in ('owner', 'admin') or role ilike '%DÉV%' or role ilike '%DEV%' or vip_level ilike '%DÉV%' then 'DÉVELOPPEUR'
  when role ilike '%DIRECTEUR%' then 'DIRECTEUR CASINO'
  else 'MEMBRE'
end;

update public.profiles set
  chips = greatest(coalesce(chips, chips_balance, 0), 0),
  cash = greatest(coalesce(cash, cash_balance, 0), 0),
  total_won = coalesce(total_won, 0),
  total_wagered = coalesce(total_wagered, 0),
  inventory = coalesce(inventory, '{}'),
  vehicles = coalesce(vehicles, '{}');

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_role_check') then
    alter table public.profiles add constraint profiles_role_check
      check (role in ('FONDATEUR', 'DÉVELOPPEUR', 'DIRECTEUR CASINO', 'MEMBRE'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profiles_vip_tier_check') then
    alter table public.profiles add constraint profiles_vip_tier_check
      check (vip_tier is null or vip_tier in ('SILVER', 'GOLD', 'DIAMOND'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profiles_balances_check') then
    alter table public.profiles add constraint profiles_balances_check
      check (chips >= 0 and cash >= 0);
  end if;
end $$;

alter table public.profiles alter column chips set not null;
alter table public.profiles alter column cash set not null;
alter table public.profiles alter column role set not null;

-- Rattache les profils existants à leur compte Discord authentifié
update public.profiles p
set user_id = i.user_id
from auth.identities i
where i.provider = 'discord'
  and i.provider_id = p.discord_id
  and p.user_id is null;

create unique index if not exists profiles_user_id_key on public.profiles(user_id) where user_id is not null;
create unique index if not exists profiles_citizen_id_key on public.profiles(citizen_id) where citizen_id is not null;

-- Garde les colonnes héritées (chips_balance / cash_balance / full_name) synchronisées
create or replace function public.profiles_sync_legacy()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.chips_balance := new.chips;
  new.cash_balance := new.cash;
  new.rp_name := trim(coalesce(new.rp_first_name, '') || ' ' || coalesce(new.rp_last_name, ''));
  new.full_name := new.rp_name || coalesce(' | #' || new.citizen_id, '');
  new.identifier := new.citizen_id;
  new.vip_level := coalesce('VIP ' || new.vip_tier, new.role);
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists profiles_sync_legacy on public.profiles;
create trigger profiles_sync_legacy
  before insert or update on public.profiles
  for each row execute function public.profiles_sync_legacy();

update public.profiles set updated_at = now();

-- --------------------------------------------------------------------
-- 2. HISTORIQUES : types de transaction, rattachement des mises
-- --------------------------------------------------------------------
alter table public.casino_transactions drop constraint if exists casino_transactions_type_check;
alter table public.casino_transactions add constraint casino_transactions_type_check
  check (type in ('DEPOSIT', 'WITHDRAW', 'BET', 'WIN', 'WHEEL', 'VIP_REWARD', 'VIP_REQUEST', 'ADMIN_ADJUST'));

update public.bets_history b
set profile_id = p.id
from public.profiles p
where b.profile_id is null
  and b.result_data->>'identifier' is not null
  and (p.citizen_id = b.result_data->>'identifier' or p.discord_id = b.result_data->>'identifier');

create index if not exists bets_history_profile_idx on public.bets_history(profile_id, created_at desc);
create index if not exists bets_history_game_idx on public.bets_history(game_id, created_at desc);
create index if not exists casino_transactions_profile_idx on public.casino_transactions(profile_id, created_at desc);
create index if not exists admin_logs_created_idx on public.admin_logs(created_at desc);

-- --------------------------------------------------------------------
-- 3. ABONNÉS AUX ALERTES ÉVÉNEMENTS (formulaire de la page d'accueil)
-- --------------------------------------------------------------------
create table if not exists public.event_subscribers (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  created_at timestamptz not null default now()
);
create unique index if not exists event_subscribers_email_key on public.event_subscribers(lower(email));
alter table public.event_subscribers enable row level security;

-- --------------------------------------------------------------------
-- 4. FONCTIONS UTILITAIRES
-- --------------------------------------------------------------------
create or replace function public.current_profile_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select role from public.profiles where user_id = auth.uid();
$$;

create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.current_profile_role() in ('FONDATEUR', 'DÉVELOPPEUR', 'DIRECTEUR CASINO'), false);
$$;

create or replace function public.can_manage_roles()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.current_profile_role() in ('FONDATEUR', 'DÉVELOPPEUR'), false);
$$;

create or replace function public.assert_staff()
returns public.profiles
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me public.profiles;
begin
  select * into v_me from public.profiles where user_id = auth.uid();
  if v_me.id is null or v_me.role not in ('FONDATEUR', 'DÉVELOPPEUR', 'DIRECTEUR CASINO') then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  return v_me;
end;
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
begin
  select value into v_raw from public.casino_settings where key = 'wheel_cooldown';
  if v_raw is not null and jsonb_typeof(v_raw) = 'number' then
    v_hours := least(greatest((v_raw #>> '{}')::numeric, 1), 168);
  end if;
  if p_vip_tier = 'DIAMOND' then
    v_hours := least(v_hours, 8);
  elsif p_vip_tier = 'GOLD' then
    v_hours := least(v_hours, 12);
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
  v_hours numeric := public.wheel_cooldown_hours(p.vip_tier);
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
    'vip_tier', p.vip_tier,
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

create or replace function public.validate_rp_identity(p_first text, p_last text, p_citizen_id text, p_phone text)
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_first is null or p_first !~ '^[A-Za-zÀ-ÖØ-öø-ÿ'' -]{2,25}$' then
    raise exception 'INVALID_FIRST_NAME' using errcode = '22023';
  end if;
  if p_last is null or p_last !~ '^[A-Za-zÀ-ÖØ-öø-ÿ'' -]{2,25}$' then
    raise exception 'INVALID_LAST_NAME' using errcode = '22023';
  end if;
  if p_citizen_id is null or p_citizen_id !~ '^[A-Za-z0-9_-]{1,12}$' then
    raise exception 'INVALID_CITIZEN_ID' using errcode = '22023';
  end if;
  if p_phone is not null and p_phone <> '' and p_phone !~ '^[0-9+() -]{4,20}$' then
    raise exception 'INVALID_PHONE' using errcode = '22023';
  end if;
end;
$$;

-- --------------------------------------------------------------------
-- 5. FONCTIONS JOUEUR
-- --------------------------------------------------------------------

-- Retourne le profil du joueur connecté (et rattache un profil pré-créé
-- par la gérance à son compte Discord lors de la première connexion).
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

  -- Rafraîchit l'avatar / pseudo Discord à chaque connexion
  if v_identity.provider_id is not null then
    update public.profiles
    set avatar_url = coalesce(nullif(v_identity.identity_data->>'avatar_url', ''), avatar_url),
        discord_tag = coalesce(
          nullif(v_identity.identity_data->'custom_claims'->>'global_name', ''),
          nullif(v_identity.identity_data->>'full_name', ''),
          discord_tag
        )
    where id = v_profile.id
    returning * into v_profile;
  end if;

  return public.profile_payload(v_profile);
end;
$$;

create or replace function public.register_profile(
  p_first_name text,
  p_last_name text,
  p_citizen_id text,
  p_phone text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_identity record;
  v_email text;
  v_profile public.profiles;
  v_first text := trim(p_first_name);
  v_last text := trim(p_last_name);
  v_cid text := trim(p_citizen_id);
  v_phone text := nullif(trim(coalesce(p_phone, '')), '');
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED' using errcode = '28000';
  end if;
  if exists (select 1 from public.profiles where user_id = v_uid) then
    raise exception 'PROFILE_EXISTS' using errcode = '23505';
  end if;

  perform public.validate_rp_identity(v_first, v_last, v_cid, v_phone);

  if exists (select 1 from public.profiles where citizen_id = v_cid) then
    raise exception 'CITIZEN_ID_TAKEN' using errcode = '23505';
  end if;

  select provider_id, identity_data into v_identity
  from auth.identities
  where user_id = v_uid and provider = 'discord'
  limit 1;
  select email into v_email from auth.users where id = v_uid;

  if v_identity.provider_id is not null
     and exists (select 1 from public.profiles where discord_id = v_identity.provider_id) then
    raise exception 'PROFILE_EXISTS' using errcode = '23505';
  end if;

  insert into public.profiles (
    user_id, discord_id, discord_tag, avatar_url, email,
    rp_first_name, rp_last_name, citizen_id, phone_number,
    role, chips, cash, inventory, vehicles
  ) values (
    v_uid,
    v_identity.provider_id,
    coalesce(v_identity.identity_data->'custom_claims'->>'global_name', v_identity.identity_data->>'full_name'),
    v_identity.identity_data->>'avatar_url',
    v_email,
    v_first, v_last, v_cid, v_phone,
    'MEMBRE', 0, 0, array['Pass Membre Diamond'], '{}'
  )
  returning * into v_profile;

  return public.profile_payload(v_profile);
end;
$$;

create or replace function public.update_my_profile(
  p_first_name text,
  p_last_name text,
  p_citizen_id text,
  p_phone text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_profile public.profiles;
  v_first text := trim(p_first_name);
  v_last text := trim(p_last_name);
  v_cid text := trim(p_citizen_id);
  v_phone text := nullif(trim(coalesce(p_phone, '')), '');
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED' using errcode = '28000';
  end if;
  perform public.validate_rp_identity(v_first, v_last, v_cid, v_phone);

  if exists (select 1 from public.profiles where citizen_id = v_cid and user_id is distinct from v_uid) then
    raise exception 'CITIZEN_ID_TAKEN' using errcode = '23505';
  end if;

  update public.profiles
  set rp_first_name = v_first, rp_last_name = v_last, citizen_id = v_cid, phone_number = v_phone
  where user_id = v_uid
  returning * into v_profile;

  if v_profile.id is null then
    raise exception 'PROFILE_REQUIRED' using errcode = 'P0002';
  end if;
  return public.profile_payload(v_profile);
end;
$$;

-- Tirage de la Roue de la Fortune — entièrement côté serveur.
create or replace function public.spin_wheel()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_profile public.profiles;
  v_economy jsonb;
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
  v_amount bigint := 0;
  v_chips bigint := 0;
  v_cash bigint := 0;
  v_hours numeric;
  i int;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED' using errcode = '28000';
  end if;

  select * into v_profile from public.profiles where user_id = v_uid for update;
  if v_profile.id is null then
    raise exception 'PROFILE_REQUIRED' using errcode = 'P0002';
  end if;

  select value into v_economy from public.casino_settings where key = 'economy_config';
  if coalesce((v_economy->>'maintenanceMode')::boolean, false) then
    raise exception 'MAINTENANCE' using errcode = 'P0001';
  end if;

  v_hours := public.wheel_cooldown_hours(v_profile.vip_tier);
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

  -- Tirage pondéré (un segment à 0 % ne sort jamais ; si tout est à 0, tirage uniforme)
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
  v_label := left(coalesce(v_seg->>'label', 'Lot mystère'), 60);
  v_item := left(coalesce(v_seg->>'value', v_label), 80);

  if v_type in ('chips', 'cash') and jsonb_typeof(v_seg->'value') = 'number' then
    v_amount := least(greatest((v_seg->>'value')::numeric, 0), 100000000)::bigint;
  end if;
  if v_type = 'chips' then v_chips := v_amount; end if;
  if v_type = 'cash' then v_cash := v_amount; end if;

  update public.profiles
  set chips = chips + v_chips,
      cash = cash + v_cash,
      total_won = coalesce(total_won, 0) + v_chips + v_cash,
      total_spins = coalesce(total_spins, 0) + 1,
      last_wheel_spin = now(),
      vehicles = case when v_type = 'vehicle' and not (v_item = any(coalesce(vehicles, '{}')))
                      then array_append(coalesce(vehicles, '{}'), v_item) else vehicles end,
      inventory = case when v_type not in ('chips', 'cash') and not (v_item = any(coalesce(inventory, '{}')))
                       then array_append(coalesce(inventory, '{}'), v_item) else inventory end
  where id = v_profile.id
  returning * into v_profile;

  insert into public.bets_history (profile_id, game_id, bet_amount, win_amount, multiplier, result_data)
  values (v_profile.id, 'lucky_wheel', 0, v_chips + v_cash, 1,
          jsonb_build_object('segment_index', v_idx, 'segment', v_label, 'type', v_type, 'value', v_seg->'value'));

  insert into public.casino_transactions (profile_id, type, amount, chips, game, description, status)
  values (v_profile.id, 'WHEEL', v_cash, v_chips, 'lucky_wheel',
          'Roue de la Fortune : ' || v_label ||
            case when v_type in ('chips', 'cash') then '' else ' (' || v_item || ')' end,
          'COMPLETED');

  return jsonb_build_object(
    'segment_index', v_idx,
    'segment', v_seg,
    'profile', public.profile_payload(v_profile)
  );
end;
$$;

-- Demande d'abonnement VIP (validée ensuite par la gérance après paiement)
create or replace function public.request_vip(p_tier text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile public.profiles;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED' using errcode = '28000';
  end if;
  if p_tier not in ('SILVER', 'GOLD', 'DIAMOND') then
    raise exception 'INVALID_TIER' using errcode = '22023';
  end if;
  select * into v_profile from public.profiles where user_id = auth.uid();
  if v_profile.id is null then
    raise exception 'PROFILE_REQUIRED' using errcode = 'P0002';
  end if;
  if v_profile.vip_tier = p_tier then
    raise exception 'VIP_ALREADY_ACTIVE' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.casino_transactions
             where profile_id = v_profile.id and type = 'VIP_REQUEST' and status = 'PENDING') then
    raise exception 'VIP_REQUEST_PENDING' using errcode = 'P0001';
  end if;

  insert into public.casino_transactions (profile_id, type, amount, chips, game, description, status)
  values (v_profile.id, 'VIP_REQUEST', 0, 0, p_tier, 'Demande abonnement VIP ' || p_tier, 'PENDING');

  insert into public.admin_logs (action, category, detail, author)
  values ('Demande VIP', 'CITIZEN',
          v_profile.rp_first_name || ' ' || v_profile.rp_last_name || ' (#' || v_profile.citizen_id || ') demande la carte ' || p_tier,
          'Espace Membre');

  return jsonb_build_object('status', 'PENDING', 'tier', p_tier);
end;
$$;

-- Derniers gagnants de la roue (public, noms abrégés uniquement)
create or replace function public.recent_wheel_wins(p_limit int default 8)
returns table (winner text, prize text, won_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select
    coalesce(p.rp_first_name, 'Citoyen') || ' ' || left(coalesce(p.rp_last_name, ''), 1) || '.',
    coalesce(b.result_data->>'segment', 'Lot'),
    b.created_at
  from public.bets_history b
  left join public.profiles p on p.id = b.profile_id
  where b.game_id = 'lucky_wheel'
  order by b.created_at desc
  limit least(greatest(coalesce(p_limit, 8), 1), 20);
$$;

create or replace function public.subscribe_events(p_email text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(trim(p_email));
begin
  if v_email is null or length(v_email) > 254 or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'INVALID_EMAIL' using errcode = '22023';
  end if;
  insert into public.event_subscribers (email) values (v_email)
  on conflict ((lower(email))) do nothing;
end;
$$;

-- --------------------------------------------------------------------
-- 6. FONCTIONS GÉRANCE (staff uniquement)
-- --------------------------------------------------------------------
create or replace function public.admin_update_profile(p_profile_id uuid, p_patch jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me public.profiles := public.assert_staff();
  v_old public.profiles;
  v_new public.profiles;
  v_first text;
  v_last text;
  v_cid text;
  v_phone text;
  v_role text;
  v_tier text;
  v_chips bigint;
  v_cash bigint;
begin
  select * into v_old from public.profiles where id = p_profile_id for update;
  if v_old.id is null then
    raise exception 'PROFILE_NOT_FOUND' using errcode = 'P0002';
  end if;

  v_first := coalesce(trim(p_patch->>'rp_first_name'), v_old.rp_first_name);
  v_last := coalesce(trim(p_patch->>'rp_last_name'), v_old.rp_last_name);
  v_cid := coalesce(trim(p_patch->>'citizen_id'), v_old.citizen_id);
  v_phone := case when p_patch ? 'phone_number' then nullif(trim(coalesce(p_patch->>'phone_number', '')), '') else v_old.phone_number end;
  v_role := coalesce(p_patch->>'role', v_old.role);
  v_tier := case when p_patch ? 'vip_tier' then nullif(p_patch->>'vip_tier', '') else v_old.vip_tier end;
  v_chips := case when jsonb_typeof(p_patch->'chips') = 'number' then greatest((p_patch->>'chips')::numeric, 0)::bigint else v_old.chips end;
  v_cash := case when jsonb_typeof(p_patch->'cash') = 'number' then greatest((p_patch->>'cash')::numeric, 0)::bigint else v_old.cash end;

  perform public.validate_rp_identity(v_first, v_last, v_cid, v_phone);

  if v_cid is distinct from v_old.citizen_id
     and exists (select 1 from public.profiles where citizen_id = v_cid and id <> v_old.id) then
    raise exception 'CITIZEN_ID_TAKEN' using errcode = '23505';
  end if;

  if v_role not in ('FONDATEUR', 'DÉVELOPPEUR', 'DIRECTEUR CASINO', 'MEMBRE') then
    raise exception 'INVALID_ROLE' using errcode = '22023';
  end if;
  if v_role is distinct from v_old.role then
    if not public.can_manage_roles() then
      raise exception 'FORBIDDEN_ROLE_CHANGE' using errcode = '42501';
    end if;
    if v_role = 'FONDATEUR' and v_me.role <> 'FONDATEUR' then
      raise exception 'FORBIDDEN_ROLE_CHANGE' using errcode = '42501';
    end if;
    if v_old.role = 'FONDATEUR' and v_me.role <> 'FONDATEUR' then
      raise exception 'FORBIDDEN_ROLE_CHANGE' using errcode = '42501';
    end if;
  end if;

  update public.profiles set
    rp_first_name = v_first,
    rp_last_name = v_last,
    citizen_id = v_cid,
    phone_number = v_phone,
    role = v_role,
    vip_tier = v_tier,
    chips = v_chips,
    cash = v_cash,
    avatar_url = case when p_patch ? 'avatar_url' then nullif(left(p_patch->>'avatar_url', 500), '') else avatar_url end,
    admin_note = case when p_patch ? 'admin_note'
                      then case when jsonb_typeof(p_patch->'admin_note') = 'object' then p_patch->'admin_note' else null end
                      else admin_note end
  where id = p_profile_id
  returning * into v_new;

  if v_new.chips <> v_old.chips or v_new.cash <> v_old.cash then
    insert into public.casino_transactions (profile_id, type, amount, chips, game, description, status)
    values (v_new.id, 'ADMIN_ADJUST', v_new.cash - v_old.cash, v_new.chips - v_old.chips, null,
            'Ajustement par la gérance (' || coalesce(v_me.rp_first_name, 'Staff') || ')', 'COMPLETED');
  end if;

  insert into public.admin_logs (action, category, detail, author)
  values ('Citoyen modifié', 'CITIZEN',
          'Fiche #' || v_new.citizen_id || ' (' || v_new.rp_first_name || ' ' || v_new.rp_last_name || ') mise à jour',
          coalesce(v_me.rp_first_name || ' ' || v_me.rp_last_name, 'Console Admin'));

  return to_jsonb(v_new);
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
  select * into v_old from public.profiles where id = p_profile_id for update;
  if v_old.id is null then
    raise exception 'PROFILE_NOT_FOUND' using errcode = 'P0002';
  end if;

  update public.profiles
  set chips = greatest(chips + coalesce(p_chips_delta, 0), 0),
      cash = greatest(cash + coalesce(p_cash_delta, 0), 0)
  where id = p_profile_id
  returning * into v_new;

  insert into public.casino_transactions (profile_id, type, amount, chips, game, description, status)
  values (v_new.id, 'ADMIN_ADJUST', v_new.cash - v_old.cash, v_new.chips - v_old.chips, null,
          coalesce(v_reason, 'Ajustement par la gérance'), 'COMPLETED');

  insert into public.admin_logs (action, category, detail, author)
  values ('Ajustement solde', 'ECONOMY',
          'Jetons ' || to_char(v_new.chips - v_old.chips, 'SGFM999G999G999G990') ||
          ' / Cash ' || to_char(v_new.cash - v_old.cash, 'SGFM999G999G999G990') ||
          ' pour #' || v_new.citizen_id || coalesce(' — ' || v_reason, ''),
          coalesce(v_me.rp_first_name || ' ' || v_me.rp_last_name, 'Console Admin'));

  return to_jsonb(v_new);
end;
$$;

create or replace function public.admin_reset_cooldown(p_profile_id uuid default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me public.profiles := public.assert_staff();
  v_count integer;
begin
  update public.profiles
  set last_wheel_spin = null
  where (p_profile_id is null or id = p_profile_id) and last_wheel_spin is not null;
  get diagnostics v_count = row_count;

  insert into public.admin_logs (action, category, detail, author)
  values (case when p_profile_id is null then 'Reset global cooldowns' else 'Reset cooldown roue' end,
          'WHEEL',
          case when p_profile_id is null then 'Tous les joueurs peuvent retourner la roue'
               else 'Délai remis à zéro pour ' || coalesce((select '#' || citizen_id from public.profiles where id = p_profile_id), 'un joueur') end,
          coalesce(v_me.rp_first_name || ' ' || v_me.rp_last_name, 'Console Admin'));
  return v_count;
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
  v_tier text := nullif(p_tier, '');
  v_bonus bigint := 0;
  v_new public.profiles;
begin
  if v_tier is not null and v_tier not in ('SILVER', 'GOLD', 'DIAMOND') then
    raise exception 'INVALID_TIER' using errcode = '22023';
  end if;
  if v_tier is not null and p_grant_bonus then
    v_bonus := case v_tier when 'SILVER' then 15000 when 'GOLD' then 60000 else 150000 end;
  end if;

  update public.profiles
  set vip_tier = v_tier,
      chips = chips + v_bonus,
      last_wheel_spin = case when v_tier is not null then null else last_wheel_spin end
  where id = p_profile_id
  returning * into v_new;
  if v_new.id is null then
    raise exception 'PROFILE_NOT_FOUND' using errcode = 'P0002';
  end if;

  update public.casino_transactions
  set status = 'COMPLETED',
      description = description || ' — validée'
  where profile_id = p_profile_id and type = 'VIP_REQUEST' and status = 'PENDING';

  if v_bonus > 0 then
    insert into public.casino_transactions (profile_id, type, amount, chips, game, description, status)
    values (v_new.id, 'VIP_REWARD', 0, v_bonus, v_tier, 'Activation VIP ' || v_tier || ' — dotation mensuelle', 'COMPLETED');
  end if;

  insert into public.admin_logs (action, category, detail, author)
  values ('Statut VIP', 'CITIZEN',
          coalesce('VIP ' || v_tier || ' activé', 'VIP retiré') || ' pour #' || v_new.citizen_id,
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
begin
  update public.casino_transactions
  set status = 'CANCELLED', description = description || ' — refusée'
  where id = p_transaction_id and type = 'VIP_REQUEST' and status = 'PENDING';
end;
$$;

create or replace function public.admin_delete_profile(p_profile_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me public.profiles := public.assert_staff();
  v_target public.profiles;
begin
  select * into v_target from public.profiles where id = p_profile_id;
  if v_target.id is null then
    raise exception 'PROFILE_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_target.id = v_me.id then
    raise exception 'CANNOT_DELETE_SELF' using errcode = '42501';
  end if;
  if v_target.role <> 'MEMBRE' and not public.can_manage_roles() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if v_target.role = 'FONDATEUR' and v_me.role <> 'FONDATEUR' then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  update public.bets_history set profile_id = null where profile_id = p_profile_id;
  update public.casino_transactions set profile_id = null where profile_id = p_profile_id;
  delete from public.profiles where id = p_profile_id;

  insert into public.admin_logs (action, category, detail, author)
  values ('Citoyen supprimé', 'CITIZEN',
          'Fiche #' || coalesce(v_target.citizen_id, '?') || ' (' || coalesce(v_target.rp_first_name, '') || ' ' || coalesce(v_target.rp_last_name, '') || ') supprimée',
          coalesce(v_me.rp_first_name || ' ' || v_me.rp_last_name, 'Console Admin'));
end;
$$;

-- --------------------------------------------------------------------
-- 7. ROW LEVEL SECURITY — on repart de zéro
-- --------------------------------------------------------------------
do $$
declare
  r record;
begin
  for r in
    select policyname, tablename from pg_policies
    where schemaname = 'public'
      and tablename in ('profiles', 'bets_history', 'casino_transactions', 'admin_logs', 'casino_settings', 'jackpot_pool', 'event_subscribers')
  loop
    execute format('drop policy if exists %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

alter table public.profiles enable row level security;
alter table public.bets_history enable row level security;
alter table public.casino_transactions enable row level security;
alter table public.admin_logs enable row level security;
alter table public.casino_settings enable row level security;
alter table public.jackpot_pool enable row level security;

-- Profils : chacun voit le sien, la gérance voit tout. Aucune écriture directe.
create policy "profiles_select_own_or_staff" on public.profiles
  for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_staff()));

-- Historiques : lecture de ses propres lignes, ou tout pour la gérance.
create policy "bets_select_own_or_staff" on public.bets_history
  for select to authenticated
  using (
    (select public.is_staff())
    or profile_id in (select id from public.profiles where user_id = (select auth.uid()))
  );

create policy "transactions_select_own_or_staff" on public.casino_transactions
  for select to authenticated
  using (
    (select public.is_staff())
    or profile_id in (select id from public.profiles where user_id = (select auth.uid()))
  );

-- Journal d'administration : gérance uniquement.
create policy "admin_logs_select_staff" on public.admin_logs
  for select to authenticated using ((select public.is_staff()));
create policy "admin_logs_insert_staff" on public.admin_logs
  for insert to authenticated with check ((select public.is_staff()));

-- Réglages : lecture publique (roue, économie), écriture gérance.
create policy "settings_select_public" on public.casino_settings
  for select to anon, authenticated using (true);
create policy "settings_insert_staff" on public.casino_settings
  for insert to authenticated with check ((select public.is_staff()));
create policy "settings_update_staff" on public.casino_settings
  for update to authenticated using ((select public.is_staff())) with check ((select public.is_staff()));

-- Jackpot : lecture publique, écriture gérance.
create policy "jackpot_select_public" on public.jackpot_pool
  for select to anon, authenticated using (true);
create policy "jackpot_update_staff" on public.jackpot_pool
  for update to authenticated using ((select public.is_staff())) with check ((select public.is_staff()));

-- event_subscribers : aucune policy → accessible uniquement via subscribe_events().

-- --------------------------------------------------------------------
-- 8. DROITS D'EXÉCUTION
-- --------------------------------------------------------------------
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
-- TRUNCATE n'est pas soumis au RLS : on le retire aux rôles exposés par l'API
revoke truncate on all tables in schema public from anon, authenticated;

do $$
declare
  f text;
begin
  foreach f in array array[
    'public.current_profile_role()',
    'public.is_staff()',
    'public.can_manage_roles()',
    'public.assert_staff()',
    'public.wheel_cooldown_hours(text)',
    'public.profile_payload(public.profiles)',
    'public.validate_rp_identity(text, text, text, text)',
    'public.profiles_sync_legacy()',
    'public.get_my_profile()',
    'public.register_profile(text, text, text, text)',
    'public.update_my_profile(text, text, text, text)',
    'public.spin_wheel()',
    'public.request_vip(text)',
    'public.recent_wheel_wins(integer)',
    'public.subscribe_events(text)',
    'public.admin_update_profile(uuid, jsonb)',
    'public.admin_adjust_balance(uuid, bigint, bigint, text)',
    'public.admin_reset_cooldown(uuid)',
    'public.admin_set_vip(uuid, text, boolean)',
    'public.admin_reject_vip_request(uuid)',
    'public.admin_delete_profile(uuid)'
  ] loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
  end loop;
end $$;

-- Fonctions appelables par les joueurs connectés
grant execute on function public.is_staff() to authenticated;
grant execute on function public.get_my_profile() to authenticated;
grant execute on function public.register_profile(text, text, text, text) to authenticated;
grant execute on function public.update_my_profile(text, text, text, text) to authenticated;
grant execute on function public.spin_wheel() to authenticated;
grant execute on function public.request_vip(text) to authenticated;
-- Fonctions de gérance (le contrôle du rôle est fait à l'intérieur)
grant execute on function public.admin_update_profile(uuid, jsonb) to authenticated;
grant execute on function public.admin_adjust_balance(uuid, bigint, bigint, text) to authenticated;
grant execute on function public.admin_reset_cooldown(uuid) to authenticated;
grant execute on function public.admin_set_vip(uuid, text, boolean) to authenticated;
grant execute on function public.admin_reject_vip_request(uuid) to authenticated;
grant execute on function public.admin_delete_profile(uuid) to authenticated;
-- Fonctions publiques
grant execute on function public.recent_wheel_wins(integer) to anon, authenticated;
grant execute on function public.subscribe_events(text) to anon, authenticated;
