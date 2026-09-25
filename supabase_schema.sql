-- ====================================================================
-- THE DIAMOND CASINO & RESORT — SCHÉMA SUPABASE COMPLET
-- ====================================================================
-- Pour un projet Supabase NEUF : exécuter ce fichier en entier dans
-- Dashboard > SQL Editor. Il est idempotent (ré-exécutable sans risque).
--
-- Le projet existant a déjà reçu ces changements via les migrations de
-- supabase/migrations/ (ce fichier = tables de base + migrations + réglages).
-- Catalogue véhicules : après installation, console admin > Lots & Véhicules >
-- « Réimporter le catalogue CTG ».
--
-- Donner les droits de gérance à un compte (après sa 1re connexion Discord
-- et la création de sa fiche citoyen) :
--   update public.profiles set role = 'FONDATEUR' where discord_id = '<ID_DISCORD>';
-- Rôles : FONDATEUR, DÉVELOPPEUR, DIRECTEUR CASINO (gérance) ou MEMBRE.
-- ====================================================================

create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id),
  discord_id text unique,
  rp_first_name text,
  rp_last_name text,
  citizen_id text,
  full_name text,
  rp_name text,
  identifier text unique,
  role text not null default 'MEMBRE',
  vip_level text default 'MEMBRE',
  chips bigint not null default 0,
  cash bigint not null default 0,
  chips_balance bigint default 0,
  cash_balance bigint default 0,
  total_wagered bigint default 0,
  total_won bigint default 0,
  avatar_url text,
  phone_number text,
  email text,
  is_booster boolean default false,
  inventory text[] default '{}',
  vehicles text[] default '{}',
  last_wheel_spin timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.casino_transactions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.profiles(id),
  type text not null,
  amount bigint not null,
  chips bigint not null,
  game text,
  description text,
  status text default 'COMPLETED' check (status in ('COMPLETED', 'PENDING', 'CANCELLED')),
  created_at timestamptz default now()
);

create table if not exists public.bets_history (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.profiles(id),
  game_id text not null,
  bet_amount bigint not null,
  win_amount bigint not null default 0,
  multiplier numeric not null default 0,
  result_data jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

create table if not exists public.jackpot_pool (
  id text primary key,
  current_amount bigint not null default 0,
  seed_amount bigint not null default 1000000,
  last_winner_name text,
  last_win_amount bigint,
  last_win_date timestamptz,
  updated_at timestamptz default now()
);

create table if not exists public.casino_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz default now()
);

create table if not exists public.admin_logs (
  id uuid primary key default gen_random_uuid(),
  action text not null,
  category text not null,
  detail text,
  author text default 'Console Admin',
  created_at timestamptz default now()
);

-- Réglages par défaut (ne remplace jamais une configuration existante)
insert into public.casino_settings (key, value) values
  ('wheel_cooldown', '24'::jsonb),
  ('podium_vehicle', '{"name": "Grotti Itali RSX", "imageUrl": "/podium_supercar.jpg", "value": 2850000}'::jsonb),
  ('economy_config', '{"vaultCash": 0, "circulatingChips": 0, "chipToCashRate": 1, "minBet": 100, "maxBet": 500000, "jackpotAmount": 2500000, "maintenanceMode": false}'::jsonb),
  ('wheel_segments', '[{"id": 0, "label": "VÉHICULE PODIUM", "type": "vehicle", "value": "Grotti Itali RSX", "color": "#fbbf24", "textColor": "#000000", "icon": "🏎️", "dropRate": 1.5}, {"id": 1, "label": "50 000 JETONS", "type": "chips", "value": 50000, "color": "#171717", "textColor": "#ffffff", "icon": "🪙", "dropRate": 3.5}, {"id": 2, "label": "75 000 JETONS", "type": "chips", "value": 75000, "color": "#171717", "textColor": "#ffffff", "icon": "🪙", "dropRate": 3.5}, {"id": 3, "label": "MYSTÈRE DIAMOND", "type": "mystery", "value": "Montre Vacheron Royale", "color": "#6d28d9", "textColor": "#ffffff", "icon": "🎁", "dropRate": 4.0}, {"id": 4, "label": "25 000 JETONS", "type": "chips", "value": 25000, "color": "#171717", "textColor": "#ffffff", "icon": "🪙", "dropRate": 8.0}, {"id": 5, "label": "30 000 JETONS", "type": "chips", "value": 30000, "color": "#171717", "textColor": "#ffffff", "icon": "🪙", "dropRate": 8.0}, {"id": 6, "label": "VÊTEMENT VIP", "type": "clothing", "value": "Costume Sur-Mesure Diamond", "color": "#2563eb", "textColor": "#ffffff", "icon": "👔", "dropRate": 6.0}, {"id": 7, "label": "10 000 JETONS", "type": "chips", "value": 10000, "color": "#171717", "textColor": "#ffffff", "icon": "🪙", "dropRate": 14.5}, {"id": 8, "label": "5 000 JETONS", "type": "chips", "value": 5000, "color": "#171717", "textColor": "#ffffff", "icon": "🪙", "dropRate": 14.5}, {"id": 9, "label": "CHAMPAGNE VIP", "type": "mystery", "value": "Bouteille Diamond Reserve", "color": "#b45309", "textColor": "#ffffff", "icon": "🍾", "dropRate": 5.0}, {"id": 10, "label": "35 000 JETONS", "type": "chips", "value": 35000, "color": "#171717", "textColor": "#ffffff", "icon": "🪙", "dropRate": 5.0}, {"id": 11, "label": "20 000 JETONS", "type": "chips", "value": 20000, "color": "#171717", "textColor": "#ffffff", "icon": "🪙", "dropRate": 7.0}, {"id": 12, "label": "PASS HIGH ROLLER", "type": "mystery", "value": "Accès Salon Privé VIP", "color": "#4f46e5", "textColor": "#ffffff", "icon": "🔑", "dropRate": 2.0}, {"id": 13, "label": "15 000 JETONS", "type": "chips", "value": 15000, "color": "#171717", "textColor": "#ffffff", "icon": "🪙", "dropRate": 10.0}, {"id": 14, "label": "12 000 JETONS", "type": "chips", "value": 12000, "color": "#171717", "textColor": "#ffffff", "icon": "🪙", "dropRate": 8.5}, {"id": 15, "label": "BONUS HIGH ROLLER", "type": "chips", "value": 40000, "color": "#374151", "textColor": "#ffffff", "icon": "⭐", "dropRate": 3.0}]'::jsonb)
on conflict (key) do nothing;

-- ====================================================================
-- SÉCURITÉ : RLS, fonctions serveur et droits (contenu de la migration)
-- ====================================================================

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
  check (type in ('DEPOSIT', 'WITHDRAW', 'BET', 'WIN', 'WHEEL', 'VIP_REWARD', 'VIP_REQUEST', 'ADMIN_ADJUST', 'VIP_SUBSCRIPTION'));

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

-- Achat direct de la carte VIP avec les jetons du compte joueur
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
  v_price bigint;
  v_bonus bigint;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED' using errcode = '28000';
  end if;

  if p_tier not in ('SILVER', 'GOLD', 'DIAMOND') then
    raise exception 'INVALID_TIER' using errcode = '22023';
  end if;

  v_price := case p_tier
    when 'SILVER' then 25000
    when 'GOLD' then 75000
    when 'DIAMOND' then 180000
  end;

  v_bonus := case p_tier
    when 'SILVER' then 15000
    when 'GOLD' then 60000
    when 'DIAMOND' then 150000
  end;

  select * into v_profile from public.profiles where user_id = v_uid for update;
  if v_profile.id is null then
    raise exception 'PROFILE_REQUIRED' using errcode = 'P0002';
  end if;

  if v_profile.vip_tier = p_tier then
    raise exception 'VIP_ALREADY_ACTIVE' using errcode = 'P0001';
  end if;

  if v_profile.chips < v_price then
    raise exception 'INSUFFICIENT_CHIPS' using errcode = 'P0001';
  end if;

  -- Déduction du prix de l'abonnement et attribution de la dotation
  update public.profiles
  set vip_tier = p_tier,
      chips = chips - v_price + v_bonus,
      last_wheel_spin = null
  where id = v_profile.id
  returning * into v_new;

  -- Clôture d'une éventuelle demande en attente
  update public.casino_transactions
  set status = 'COMPLETED',
      description = description || ' — auto-achat avec jetons'
  where profile_id = v_profile.id and type = 'VIP_REQUEST' and status = 'PENDING';

  -- Enregistrement de la transaction d'achat
  insert into public.casino_transactions (profile_id, type, amount, chips, game, description, status)
  values (v_profile.id, 'VIP_SUBSCRIPTION', -v_price, -v_price, p_tier, 'Abonnement VIP ' || p_tier, 'COMPLETED');

  -- Enregistrement de la dotation mensuelle
  if v_bonus > 0 then
    insert into public.casino_transactions (profile_id, type, amount, chips, game, description, status)
    values (v_profile.id, 'VIP_REWARD', 0, v_bonus, p_tier, 'Dotation mensuelle VIP ' || p_tier, 'COMPLETED');
  end if;

  -- Journal d'audit
  insert into public.admin_logs (action, category, detail, author)
  values (
    'Abonnement VIP',
    'CITIZEN',
    v_profile.rp_first_name || ' ' || v_profile.rp_last_name || ' (#' || v_profile.citizen_id || ') a souscrit à l''abonnement VIP ' || p_tier || ' avec ses jetons (' || v_price || ' jetons)',
    'Système Automatique'
  );

  return public.profile_payload(v_new);
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
grant execute on function public.buy_vip_with_chips(text) to authenticated;
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

-- ====================================================================
-- CATALOGUE VÉHICULES + INVENTAIRE DES LOTS GAGNÉS
-- ====================================================================
-- * vehicle_catalog : véhicules du serveur (import JSON CTG depuis la console)
-- * player_rewards  : lots non monétaires gagnés / donnés, avec suivi
--     IN_INVENTORY (dans l'inventaire du joueur)
--  -> CLAIMED      (le joueur demande la remise en jeu)
--  -> DELIVERED    (la gérance l'a remis en jeu)   | REVOKED (retiré par la gérance)
-- ====================================================================

create table if not exists public.vehicle_catalog (
  model text primary key,
  hash text,
  dlc text,
  manufacturer text,
  class text,
  type text,
  seats integer,
  price bigint,
  photo_url text,
  photo_full_url text,
  screenshot_url text,
  updated_at timestamptz not null default now()
);
create index if not exists vehicle_catalog_manufacturer_idx on public.vehicle_catalog (lower(manufacturer));
alter table public.vehicle_catalog enable row level security;

drop policy if exists "vehicle_catalog_select_public" on public.vehicle_catalog;
create policy "vehicle_catalog_select_public" on public.vehicle_catalog
  for select to anon, authenticated using (true);

create table if not exists public.player_rewards (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('vehicle', 'item')),
  label text not null,
  vehicle_model text references public.vehicle_catalog(model) on delete set null,
  image_url text,
  source text not null default 'wheel' check (source in ('wheel', 'admin')),
  status text not null default 'IN_INVENTORY' check (status in ('IN_INVENTORY', 'CLAIMED', 'DELIVERED', 'REVOKED')),
  note text,
  created_at timestamptz not null default now(),
  claimed_at timestamptz,
  handled_at timestamptz,
  handled_by text
);
create index if not exists player_rewards_profile_idx on public.player_rewards (profile_id, created_at desc);
create index if not exists player_rewards_status_idx on public.player_rewards (status, created_at);
alter table public.player_rewards enable row level security;

drop policy if exists "player_rewards_select_own_or_staff" on public.player_rewards;
create policy "player_rewards_select_own_or_staff" on public.player_rewards
  for select to authenticated
  using (
    (select public.is_staff())
    or profile_id in (select id from public.profiles where user_id = (select auth.uid()))
  );

-- --------------------------------------------------------------------
-- Import du catalogue (gérance)
-- p_rows : [{ model, hash, dlc, manufacturer, class, type, seats, price,
--             photo_url, photo_full_url, screenshot_url }, …]
-- --------------------------------------------------------------------
create or replace function public.admin_import_vehicles(p_rows jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me public.profiles := public.assert_staff();
  v_count integer;
begin
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 3000 then
    raise exception 'INVALID_IMPORT' using errcode = '22023';
  end if;

  insert into public.vehicle_catalog as c (
    model, hash, dlc, manufacturer, class, type, seats, price,
    photo_url, photo_full_url, screenshot_url, updated_at
  )
  select
    left(trim(r.model), 64), left(r.hash, 32), left(r.dlc, 64), left(r.manufacturer, 64),
    left(r.class, 32), left(r.type, 32), r.seats, greatest(coalesce(r.price, 0), 0),
    left(r.photo_url, 500), left(r.photo_full_url, 500), left(r.screenshot_url, 500), now()
  from jsonb_to_recordset(p_rows) as r(
    model text, hash text, dlc text, manufacturer text, class text, type text,
    seats integer, price bigint, photo_url text, photo_full_url text, screenshot_url text
  )
  where r.model is not null and trim(r.model) <> ''
  on conflict (model) do update set
    hash = excluded.hash,
    dlc = excluded.dlc,
    manufacturer = excluded.manufacturer,
    class = excluded.class,
    type = excluded.type,
    seats = excluded.seats,
    price = excluded.price,
    photo_url = excluded.photo_url,
    photo_full_url = excluded.photo_full_url,
    screenshot_url = excluded.screenshot_url,
    updated_at = now();
  get diagnostics v_count = row_count;

  insert into public.admin_logs (action, category, detail, author)
  values ('Import catalogue véhicules', 'SYSTEM', v_count || ' véhicules importés / mis à jour',
          coalesce(v_me.rp_first_name || ' ' || v_me.rp_last_name, 'Console Admin'));
  return v_count;
end;
$$;

-- --------------------------------------------------------------------
-- Joueur : demander la remise en jeu d'un lot
-- --------------------------------------------------------------------
create or replace function public.claim_reward(p_reward_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile public.profiles;
  v_reward public.player_rewards;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED' using errcode = '28000';
  end if;
  select * into v_profile from public.profiles where user_id = auth.uid();
  if v_profile.id is null then
    raise exception 'PROFILE_REQUIRED' using errcode = 'P0002';
  end if;

  update public.player_rewards
  set status = 'CLAIMED', claimed_at = now()
  where id = p_reward_id and profile_id = v_profile.id and status = 'IN_INVENTORY'
  returning * into v_reward;
  if v_reward.id is null then
    raise exception 'REWARD_NOT_CLAIMABLE' using errcode = 'P0001';
  end if;

  insert into public.admin_logs (action, category, detail, author)
  values ('Réclamation de lot', 'CITIZEN',
          v_profile.rp_first_name || ' ' || v_profile.rp_last_name || ' (#' || v_profile.citizen_id || ') réclame : ' || v_reward.label,
          'Espace Membre');

  return to_jsonb(v_reward);
end;
$$;

-- --------------------------------------------------------------------
-- Gérance : donner un lot / véhicule directement
-- --------------------------------------------------------------------
create or replace function public.admin_grant_reward(
  p_profile_id uuid,
  p_vehicle_model text default null,
  p_label text default null,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me public.profiles := public.assert_staff();
  v_target public.profiles;
  v_vehicle public.vehicle_catalog;
  v_reward public.player_rewards;
  v_label text;
begin
  select * into v_target from public.profiles where id = p_profile_id;
  if v_target.id is null then
    raise exception 'PROFILE_NOT_FOUND' using errcode = 'P0002';
  end if;

  if nullif(trim(coalesce(p_vehicle_model, '')), '') is not null then
    select * into v_vehicle from public.vehicle_catalog where model = trim(p_vehicle_model);
    if v_vehicle.model is null then
      raise exception 'VEHICLE_NOT_FOUND' using errcode = 'P0002';
    end if;
  end if;

  v_label := left(coalesce(
    nullif(trim(coalesce(p_label, '')), ''),
    case when v_vehicle.model is not null
         then trim(coalesce(initcap(v_vehicle.manufacturer) || ' ', '') || v_vehicle.model) end
  ), 80);
  if v_label is null then
    raise exception 'INVALID_REWARD' using errcode = '22023';
  end if;

  insert into public.player_rewards (profile_id, kind, label, vehicle_model, image_url, source, note)
  values (v_target.id,
          case when v_vehicle.model is not null then 'vehicle' else 'item' end,
          v_label, v_vehicle.model, v_vehicle.photo_url, 'admin', left(p_note, 280))
  returning * into v_reward;

  insert into public.admin_logs (action, category, detail, author)
  values ('Lot attribué', 'CITIZEN', v_label || ' donné à #' || v_target.citizen_id,
          coalesce(v_me.rp_first_name || ' ' || v_me.rp_last_name, 'Console Admin'));

  return to_jsonb(v_reward);
end;
$$;

-- --------------------------------------------------------------------
-- Gérance : remettre en jeu (DELIVERED), retirer (REVOKED) ou remettre
-- dans l'inventaire (IN_INVENTORY)
-- --------------------------------------------------------------------
create or replace function public.admin_update_reward(p_reward_id uuid, p_status text, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me public.profiles := public.assert_staff();
  v_old public.player_rewards;
  v_new public.player_rewards;
  v_author text := coalesce(v_me.rp_first_name || ' ' || v_me.rp_last_name, 'Console Admin');
  v_cid text;
begin
  if p_status not in ('IN_INVENTORY', 'DELIVERED', 'REVOKED') then
    raise exception 'INVALID_STATUS' using errcode = '22023';
  end if;
  select * into v_old from public.player_rewards where id = p_reward_id for update;
  if v_old.id is null then
    raise exception 'REWARD_NOT_FOUND' using errcode = 'P0002';
  end if;

  update public.player_rewards
  set status = p_status,
      note = coalesce(nullif(left(trim(coalesce(p_note, '')), 280), ''), note),
      handled_at = case when p_status = 'IN_INVENTORY' then null else now() end,
      handled_by = case when p_status = 'IN_INVENTORY' then null else v_author end,
      claimed_at = case when p_status = 'IN_INVENTORY' then null else claimed_at end
  where id = p_reward_id
  returning * into v_new;

  -- Garage du profil : ajout à la livraison, retrait sinon
  if v_new.kind = 'vehicle' then
    update public.profiles
    set vehicles = case
      when p_status = 'DELIVERED' and not (v_new.label = any(coalesce(vehicles, '{}')))
        then array_append(coalesce(vehicles, '{}'), v_new.label)
      when p_status <> 'DELIVERED'
        then array_remove(coalesce(vehicles, '{}'), v_new.label)
      else vehicles end
    where id = v_new.profile_id;
  end if;

  select citizen_id into v_cid from public.profiles where id = v_new.profile_id;
  insert into public.admin_logs (action, category, detail, author)
  values (case p_status when 'DELIVERED' then 'Lot remis en jeu'
                        when 'REVOKED' then 'Lot retiré'
                        else 'Lot remis en inventaire' end,
          'CITIZEN', v_new.label || ' — #' || coalesce(v_cid, '?') || coalesce(' — ' || nullif(trim(coalesce(p_note, '')), ''), ''),
          v_author);

  return to_jsonb(v_new);
end;
$$;

-- --------------------------------------------------------------------
-- Tirage : les lots non monétaires vont dans player_rewards
-- (segment « vehicle » : champs optionnels vehicleModel / imageUrl)
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
  v_vehicle public.vehicle_catalog;
  v_reward_id uuid;
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
      last_wheel_spin = now()
  where id = v_profile.id
  returning * into v_profile;

  if v_type not in ('chips', 'cash') then
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
    'reward_id', v_reward_id,
    'profile', public.profile_payload(v_profile)
  );
end;
$$;

-- --------------------------------------------------------------------
-- Droits
-- --------------------------------------------------------------------
revoke execute on function public.admin_import_vehicles(jsonb) from public, anon, authenticated;
revoke execute on function public.claim_reward(uuid) from public, anon, authenticated;
revoke execute on function public.admin_grant_reward(uuid, text, text, text) from public, anon, authenticated;
revoke execute on function public.admin_update_reward(uuid, text, text) from public, anon, authenticated;
revoke execute on function public.spin_wheel() from public, anon, authenticated;

grant execute on function public.admin_import_vehicles(jsonb) to authenticated;
grant execute on function public.claim_reward(uuid) to authenticated;
grant execute on function public.admin_grant_reward(uuid, text, text, text) to authenticated;
grant execute on function public.admin_update_reward(uuid, text, text) to authenticated;
grant execute on function public.spin_wheel() to authenticated;

revoke truncate on public.vehicle_catalog, public.player_rewards from anon, authenticated;

-- ====================================================================
-- MONNAIE UNIQUE : LES JETONS
-- ====================================================================
-- * le cash des profils est converti en jetons (1 pour 1, tracé en transaction)
-- * les segments « cash » de la roue deviennent des segments jetons
-- * spin_wheel ne crédite plus jamais de cash
-- ====================================================================

insert into public.casino_transactions (profile_id, type, amount, chips, game, description, status)
select id, 'ADMIN_ADJUST', -cash, cash, null, 'Conversion du cash en jetons (monnaie unique)', 'COMPLETED'
from public.profiles
where cash > 0;

update public.profiles set chips = chips + cash, cash = 0 where cash > 0;

update public.casino_settings
set value = (
  select jsonb_agg(
    case when seg->>'type' = 'cash' then
      seg || jsonb_build_object(
        'type', 'chips',
        'value', v.new_value,
        'label', replace(to_char(v.new_value, 'FM999,999,999'), ',', ' ') || ' JETONS',
        'color', '#171717',
        'icon', '🪙'
      )
    else seg end
    order by ord
  )
  from jsonb_array_elements(value) with ordinality as e(seg, ord)
  cross join lateral (
    select case (seg->>'value')
      when '50000' then 75000
      when '25000' then 30000
      when '10000' then 5000
      when '15000' then 12000
      else coalesce(nullif(seg->>'value', '')::numeric, 0)::bigint
    end as new_value
  ) v
),
updated_at = now()
where key = 'wheel_segments' and jsonb_typeof(value) = 'array';

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
  v_vehicle public.vehicle_catalog;
  v_reward_id uuid;
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
  -- Monnaie unique : jetons. Un ancien segment « cash » est crédité en jetons.
  if v_type = 'cash' then v_type := 'chips'; end if;
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
      last_wheel_spin = now()
  where id = v_profile.id
  returning * into v_profile;

  if v_type not in ('chips', 'cash') then
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
    'reward_id', v_reward_id,
    'profile', public.profile_payload(v_profile)
  );
end;
$$;


revoke execute on function public.spin_wheel() from public, anon, authenticated;
grant execute on function public.spin_wheel() to authenticated;

-- ====================================================================
-- THE DIAMOND CASINO & RESORT — JEU DES MINES (BACKEND SÉCURISÉ)
-- ====================================================================
create or replace function public.play_mines_game(
  p_bet bigint,
  p_win bigint,
  p_multiplier numeric,
  p_mines integer,
  p_gems integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_profile public.profiles;
  v_net bigint;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED' using errcode = '28000';
  end if;

  select * into v_profile from public.profiles where user_id = v_uid for update;
  if v_profile.id is null then
    raise exception 'PROFILE_REQUIRED' using errcode = 'P0002';
  end if;

  if p_bet < 1 or p_bet > 100000000 then
    raise exception 'INVALID_BET' using errcode = 'P0001';
  end if;

  if p_mines < 1 or p_mines > 24 then
    raise exception 'INVALID_MINES' using errcode = 'P0001';
  end if;

  if p_gems < 0 or p_gems > (25 - p_mines) then
    raise exception 'INVALID_GEMS' using errcode = 'P0001';
  end if;

  if p_win < 0 then
    raise exception 'INVALID_WIN' using errcode = 'P0001';
  end if;

  if p_multiplier < 0 then
    raise exception 'INVALID_MULTIPLIER' using errcode = 'P0001';
  end if;

  if p_gems = 0 and p_win > 0 then
    raise exception 'INVALID_WIN_NO_GEMS' using errcode = 'P0001';
  end if;

  if p_win > 0 and (p_multiplier < 1.0 or p_win > ceil(p_bet * p_multiplier) + 1) then
    raise exception 'INVALID_PAYOUT_AMOUNT' using errcode = 'P0001';
  end if;

  if v_profile.chips < p_bet then
    raise exception 'INSUFFICIENT_FUNDS' using errcode = 'P0001';
  end if;

  v_net := p_win - p_bet;

  update public.profiles
  set chips = chips + v_net,
      total_wagered = coalesce(total_wagered, 0) + p_bet,
      total_won = coalesce(total_won, 0) + greatest(v_net, 0)
  where id = v_profile.id
  returning * into v_profile;

  insert into public.bets_history (profile_id, game_id, bet_amount, win_amount, multiplier, result_data)
  values (
    v_profile.id,
    'mines',
    p_bet,
    p_win,
    p_multiplier,
    jsonb_build_object('mines', p_mines, 'gems', p_gems, 'won', p_win > 0)
  );

  insert into public.casino_transactions (profile_id, type, amount, chips, game, description, status)
  values (
    v_profile.id,
    case when p_win > 0 then 'WIN' else 'BET' end,
    0,
    case when p_win > 0 then v_net else -p_bet end,
    'mines',
    case when p_win > 0
      then 'Mines : gain de ' || p_win || ' jetons (x' || round(p_multiplier, 2) || ' avec ' || p_mines || ' mines)'
      else 'Mines : perte de ' || p_bet || ' jetons (' || p_mines || ' mines)'
    end,
    'COMPLETED'
  );

  return jsonb_build_object(
    'profile', public.profile_payload(v_profile),
    'net', v_net
  );
end;
$$;

revoke execute on function public.play_mines_game(bigint, bigint, numeric, integer, integer) from public, anon;
grant execute on function public.play_mines_game(bigint, bigint, numeric, integer, integer) to authenticated;

-- ====================================================================
-- THE DIAMOND CASINO & RESORT — MACHINES À SOUS (BACKEND SÉCURISÉ)
-- ====================================================================
create or replace function public.play_slots_round(
  p_machine text,
  p_bet bigint,
  p_win bigint,
  p_multiplier numeric
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_profile public.profiles;
  v_net bigint;
  v_machine_name text := coalesce(nullif(trim(p_machine), ''), 'Slots');
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED' using errcode = '28000';
  end if;

  select * into v_profile from public.profiles where user_id = v_uid for update;
  if v_profile.id is null then
    raise exception 'PROFILE_REQUIRED' using errcode = 'P0002';
  end if;

  if p_bet < 0 or p_bet > 100000000 then
    raise exception 'INVALID_BET' using errcode = 'P0001';
  end if;

  if p_win < 0 then
    raise exception 'INVALID_WIN' using errcode = 'P0001';
  end if;

  if p_multiplier < 0 then
    raise exception 'INVALID_MULTIPLIER' using errcode = 'P0001';
  end if;

  if v_profile.chips < p_bet then
    raise exception 'INSUFFICIENT_FUNDS' using errcode = 'P0001';
  end if;

  v_net := p_win - p_bet;

  update public.profiles
  set chips = chips + v_net,
      total_wagered = coalesce(total_wagered, 0) + p_bet,
      total_spins = coalesce(total_spins, 0) + 1,
      total_won = coalesce(total_won, 0) + greatest(v_net, 0)
  where id = v_profile.id
  returning * into v_profile;

  insert into public.bets_history (profile_id, game_id, bet_amount, win_amount, multiplier, result_data)
  values (
    v_profile.id,
    v_machine_name,
    p_bet,
    p_win,
    p_multiplier,
    jsonb_build_object('machine', v_machine_name, 'won', p_win > 0)
  );

  insert into public.casino_transactions (profile_id, type, amount, chips, game, description, status)
  values (
    v_profile.id,
    case when p_win > 0 then 'WIN' else 'BET' end,
    0,
    case when p_win > 0 then v_net else -p_bet end,
    v_machine_name,
    case when p_win > 0
      then v_machine_name || ' : gain de ' || p_win || ' jetons (x' || round(p_multiplier, 2) || ')'
      else v_machine_name || ' : mise de ' || p_bet || ' jetons'
    end,
    'COMPLETED'
  );

  return jsonb_build_object(
    'profile', public.profile_payload(v_profile),
    'net', v_net
  );
end;
$$;

revoke execute on function public.play_slots_round(text, bigint, bigint, numeric) from public, anon;
grant execute on function public.play_slots_round(text, bigint, bigint, numeric) to authenticated;


