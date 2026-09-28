-- ====================================================================
-- THE DIAMOND CASINO & RESORT — BOOSTERS DE CARTES VÉHICULES
-- ====================================================================
-- Le joueur achète un booster (prix en jetons) et reçoit N cartes tirées
-- côté serveur selon la rareté. Chaque carte est un véhicule du catalogue
-- (vehicle_catalog) : il arrive dans son inventaire (player_rewards,
-- source 'booster'), comme les véhicules gagnés à la roue.
--
-- Tout est piloté depuis la console (onglet Boosters) :
--   * booster_rarities   : niveaux de rareté (libellé, couleur, effet)
--   * booster_cards      : cartes (véhicule + surcharges titre/image/valeur)
--   * booster_packs      : boosters (prix, nb de cartes, poids par rareté)
--   * booster_pack_cards : cartes incluses dans chaque booster (+ poids)
--   * booster_openings   : historique des ouvertures
-- Les tables ne sont lisibles que par le staff ; les joueurs passent par
-- booster_catalog() et open_booster().
-- ====================================================================

-- --------------------------------------------------------------------
-- 1. Tables
-- --------------------------------------------------------------------
create table if not exists public.booster_rarities (
  key text primary key check (key ~ '^[A-Z0-9_]{2,20}$'),
  label text not null check (char_length(label) between 1 and 30),
  color text not null default '#9ca3af' check (color ~ '^#[0-9a-fA-F]{6}$'),
  effect text not null default 'none' check (effect in ('none', 'glow', 'holo', 'rays', 'mythic')),
  sort integer not null default 0,
  updated_at timestamptz not null default now()
);

insert into public.booster_rarities (key, label, color, effect, sort) values
  ('COMMUNE', 'Commune', '#a3a3a3', 'none', 0),
  ('RARE', 'Rare', '#3b82f6', 'glow', 1),
  ('EPIQUE', 'Épique', '#a855f7', 'holo', 2),
  ('LEGENDAIRE', 'Légendaire', '#f59e0b', 'rays', 3),
  ('MYTHIQUE', 'Mythique', '#ef4444', 'mythic', 4)
on conflict (key) do nothing;

create table if not exists public.booster_cards (
  id uuid primary key default gen_random_uuid(),
  vehicle_model text not null references public.vehicle_catalog(model) on delete cascade,
  rarity text not null references public.booster_rarities(key) on update cascade,
  title text check (title is null or char_length(title) <= 60),
  subtitle text check (subtitle is null or char_length(subtitle) <= 80),
  -- (Postgres limite les répétitions {m,n} à 255 : longueur contrôlée à part)
  image_url text check (image_url is null or (char_length(image_url) <= 500 and image_url ~ '^(https://|/)[^\s"''<>]+$')),
  value_override bigint check (value_override is null or value_override between 0 and 1000000000000),
  accent_color text check (accent_color is null or accent_color ~ '^#[0-9a-fA-F]{6}$'),
  holo boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists booster_cards_rarity_idx on public.booster_cards (rarity);
create index if not exists booster_cards_vehicle_idx on public.booster_cards (vehicle_model);

create table if not exists public.booster_packs (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 40),
  description text check (description is null or char_length(description) <= 200),
  price bigint not null default 10000 check (price between 1 and 1000000000),
  cards_per_pack integer not null default 5 check (cards_per_pack between 1 and 10),
  rarity_weights jsonb not null default '{}'::jsonb,
  guaranteed_rarity text references public.booster_rarities(key) on update cascade on delete set null,
  cover_image_url text check (cover_image_url is null or (char_length(cover_image_url) <= 500 and cover_image_url ~ '^(https://|/)[^\s"''<>]+$')),
  accent_color text not null default '#ffffff' check (accent_color ~ '^#[0-9a-fA-F]{6}$'),
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.booster_pack_cards (
  pack_id uuid not null references public.booster_packs(id) on delete cascade,
  card_id uuid not null references public.booster_cards(id) on delete cascade,
  weight integer not null default 1 check (weight between 1 and 1000),
  primary key (pack_id, card_id)
);
create index if not exists booster_pack_cards_card_idx on public.booster_pack_cards (card_id);

create table if not exists public.booster_openings (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  pack_id uuid references public.booster_packs(id) on delete set null,
  pack_name text,
  price bigint not null,
  total_value bigint not null default 0,
  cards jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists booster_openings_profile_idx on public.booster_openings (profile_id, created_at desc);
create index if not exists booster_openings_pack_idx on public.booster_openings (pack_id);

alter table public.booster_rarities enable row level security;
alter table public.booster_cards enable row level security;
alter table public.booster_packs enable row level security;
alter table public.booster_pack_cards enable row level security;
alter table public.booster_openings enable row level security;

drop policy if exists "booster_rarities_select_all" on public.booster_rarities;
create policy "booster_rarities_select_all" on public.booster_rarities
  for select to anon, authenticated using (true);
drop policy if exists "booster_cards_select_staff" on public.booster_cards;
create policy "booster_cards_select_staff" on public.booster_cards
  for select to authenticated using ((select public.is_staff()));
drop policy if exists "booster_packs_select_staff" on public.booster_packs;
create policy "booster_packs_select_staff" on public.booster_packs
  for select to authenticated using ((select public.is_staff()));
drop policy if exists "booster_pack_cards_select_staff" on public.booster_pack_cards;
create policy "booster_pack_cards_select_staff" on public.booster_pack_cards
  for select to authenticated using ((select public.is_staff()));
drop policy if exists "booster_openings_select_own_or_staff" on public.booster_openings;
create policy "booster_openings_select_own_or_staff" on public.booster_openings
  for select to authenticated
  using (
    (select public.is_staff())
    or profile_id in (select id from public.profiles where user_id = (select auth.uid()))
  );

-- Les véhicules gagnés en booster arrivent dans l'inventaire
alter table public.player_rewards drop constraint if exists player_rewards_source_check;
alter table public.player_rewards add constraint player_rewards_source_check
  check (source in ('wheel', 'admin', 'booster'));

-- --------------------------------------------------------------------
-- 2. Réglages : interrupteur du jeu dans games_config
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

  r := jsonb_build_object(
    'enabled', public.jbool(r, 'enabled', true),
    'spinPrice', round(public.jnum(r, 'spinPrice', 25000, 1, 100000000))
  );

  b := jsonb_build_object(
    'enabled', public.jbool(b, 'enabled', true)
  );

  return jsonb_build_object('mines', m, 'doghouse', d, 'wanted', w, 'wheel', r, 'boosters', b);
end;
$$;

update public.casino_settings
set value = public.normalize_games_config(value), updated_at = now()
where key = 'games_config';

-- --------------------------------------------------------------------
-- 3. Helpers
-- --------------------------------------------------------------------
-- Nombre aléatoire cryptographique dans [0, 1)
create or replace function public.booster_rand()
returns double precision
language sql
volatile
set search_path = ''
as $$
  select (('x' || encode(extensions.gen_random_bytes(7), 'hex'))::bit(56)::bigint)::double precision / 72057594037927936.0;
$$;

-- Carte résolue : surcharges + infos du véhicule
create or replace function public.booster_card_json(c public.booster_cards)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', c.id,
    'vehicle_model', c.vehicle_model,
    'rarity', c.rarity,
    'title', c.title,
    'subtitle', c.subtitle,
    'image_url', c.image_url,
    'value_override', c.value_override,
    'accent_color', c.accent_color,
    'holo', c.holo,
    'active', c.active,
    'created_at', c.created_at,
    'vehicle', case when v.model is null then null else jsonb_build_object(
      'model', v.model,
      'manufacturer', v.manufacturer,
      'class', v.class,
      'type', v.type,
      'seats', v.seats,
      'price', v.price,
      'photo_url', v.photo_url,
      'photo_full_url', v.photo_full_url
    ) end,
    'value', coalesce(c.value_override, v.price, 0)
  )
  from (select 1) one
  left join public.vehicle_catalog v on v.model = c.vehicle_model;
$$;

-- Catalogue complet : raretés + boosters (+ cartes). p_all = console (tout, même inactif)
create or replace function public.booster_catalog(p_all boolean default false)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_rarities jsonb;
  v_packs jsonb;
  v_cards jsonb;
begin
  if p_all then
    perform public.assert_staff();
  end if;

  select coalesce(jsonb_agg(to_jsonb(r) - 'updated_at' order by r.sort, r.key), '[]') into v_rarities
  from public.booster_rarities r;

  select coalesce(jsonb_agg(
    to_jsonb(p) || jsonb_build_object(
      'cards', coalesce((
        select jsonb_agg(jsonb_build_object('card_id', pc.card_id, 'weight', pc.weight))
        from public.booster_pack_cards pc
        join public.booster_cards c on c.id = pc.card_id
        where pc.pack_id = p.id and (p_all or c.active)
      ), '[]')
    ) order by p.sort_order, p.created_at), '[]') into v_packs
  from public.booster_packs p
  where p_all or p.active;

  select coalesce(jsonb_agg(public.booster_card_json(c) order by c.created_at), '[]') into v_cards
  from public.booster_cards c
  where p_all or (c.active and exists (
    select 1 from public.booster_pack_cards pc
    join public.booster_packs p on p.id = pc.pack_id
    where pc.card_id = c.id and p.active
  ));

  return jsonb_build_object('rarities', v_rarities, 'packs', v_packs, 'cards', v_cards);
end;
$$;

-- --------------------------------------------------------------------
-- 4. Ouverture d'un booster (joueur)
-- --------------------------------------------------------------------
create or replace function public.open_booster(p_pack_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_pack public.booster_packs;
  v_profile public.profiles;
  v_guarantee_sort int;
  v_best_sort int := -1;
  v_slot int;
  v_rarity text;
  v_total numeric;
  v_rand double precision;
  v_card public.booster_cards;
  v_card_json jsonb;
  v_value bigint;
  v_total_value bigint := 0;
  v_results jsonb := '[]'::jsonb;
  v_reward_id uuid;
  v_rarity_sort int;
  v_force boolean;
  v_pool jsonb;
  v_card_id uuid;
  rec record;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED' using errcode = '28000';
  end if;
  perform public.assert_game_open('boosters');

  select * into v_pack from public.booster_packs where id = p_pack_id and active;
  if v_pack.id is null then
    raise exception 'PACK_NOT_FOUND' using errcode = 'P0002';
  end if;

  -- Raretés jouables : poids > 0 ET au moins une carte active de cette rareté dans le booster
  select coalesce(jsonb_agg(jsonb_build_object('rarity', r.key, 'sort', r.sort,
                                               'weight', (v_pack.rarity_weights->>r.key)::numeric)
                            order by r.sort, r.key), '[]')
  into v_pool
  from public.booster_rarities r
  where jsonb_typeof(v_pack.rarity_weights->r.key) = 'number'
    and (v_pack.rarity_weights->>r.key)::numeric > 0
    and exists (
      select 1 from public.booster_pack_cards pc
      join public.booster_cards c on c.id = pc.card_id
      where pc.pack_id = v_pack.id and c.active and c.rarity = r.key
    );

  if jsonb_array_length(v_pool) = 0 then
    raise exception 'PACK_EMPTY' using errcode = 'P0001';
  end if;

  select sort into v_guarantee_sort from public.booster_rarities where key = v_pack.guaranteed_rarity;
  -- Garantie impossible (aucune carte de ce niveau ou mieux) : ignorée
  if v_guarantee_sort is not null and not exists (
    select 1 from jsonb_array_elements(v_pool) e where (e->>'sort')::int >= v_guarantee_sort
  ) then
    v_guarantee_sort := null;
  end if;

  select * into v_profile from public.profiles where user_id = v_uid for update;
  if v_profile.id is null then
    raise exception 'PROFILE_REQUIRED' using errcode = 'P0002';
  end if;
  if v_profile.chips < v_pack.price then
    raise exception 'INSUFFICIENT_FUNDS' using errcode = 'P0001';
  end if;

  for v_slot in 1 .. v_pack.cards_per_pack loop
    -- Dernière carte : on force la rareté garantie si elle n'est pas encore sortie
    v_force := v_slot = v_pack.cards_per_pack and v_guarantee_sort is not null and v_best_sort < v_guarantee_sort;

    -- 1) rareté (tirage pondéré)
    select sum((e->>'weight')::numeric) into v_total
    from jsonb_array_elements(v_pool) e
    where not v_force or (e->>'sort')::int >= v_guarantee_sort;
    v_rand := public.booster_rand() * v_total;
    v_rarity := null;
    for rec in select e->>'rarity' as rarity, (e->>'sort')::int as sort, (e->>'weight')::numeric as weight
               from jsonb_array_elements(v_pool) e
               where not v_force or (e->>'sort')::int >= v_guarantee_sort
               order by 2, 1 loop
      v_rarity := rec.rarity;
      v_rarity_sort := rec.sort;
      exit when v_rand < rec.weight;
      v_rand := v_rand - rec.weight;
    end loop;

    -- 2) carte de cette rareté (tirage pondéré par le poids de la carte dans le booster)
    select sum(pc.weight) into v_total
    from public.booster_pack_cards pc
    join public.booster_cards c on c.id = pc.card_id
    where pc.pack_id = v_pack.id and c.active and c.rarity = v_rarity;
    v_rand := public.booster_rand() * v_total;
    v_card_id := null;
    for rec in select c.id, pc.weight
               from public.booster_pack_cards pc
               join public.booster_cards c on c.id = pc.card_id
               where pc.pack_id = v_pack.id and c.active and c.rarity = v_rarity
               order by c.id loop
      v_card_id := rec.id;
      exit when v_rand < rec.weight;
      v_rand := v_rand - rec.weight;
    end loop;
    select * into v_card from public.booster_cards where id = v_card_id;

    v_best_sort := greatest(v_best_sort, v_rarity_sort);
    v_card_json := public.booster_card_json(v_card);
    v_value := coalesce((v_card_json->>'value')::bigint, 0);
    v_total_value := v_total_value + v_value;

    insert into public.player_rewards (profile_id, kind, label, vehicle_model, image_url, source, note)
    values (
      v_profile.id,
      'vehicle',
      left(coalesce(
        nullif(v_card.title, ''),
        nullif(trim(coalesce(initcap(v_card_json->'vehicle'->>'manufacturer'), '') || ' ' || v_card.vehicle_model), ''),
        v_card.vehicle_model
      ), 80),
      v_card.vehicle_model,
      coalesce(nullif(v_card.image_url, ''), v_card_json->'vehicle'->>'photo_url'),
      'booster',
      'Booster ' || v_pack.name
    )
    returning id into v_reward_id;

    v_results := v_results || jsonb_build_array(v_card_json || jsonb_build_object('reward_id', v_reward_id));
  end loop;

  update public.profiles
  set chips = chips - v_pack.price,
      total_wagered = coalesce(total_wagered, 0) + v_pack.price
  where id = v_profile.id
  returning * into v_profile;

  insert into public.booster_openings (profile_id, pack_id, pack_name, price, total_value, cards)
  values (v_profile.id, v_pack.id, v_pack.name, v_pack.price, v_total_value,
          (select coalesce(jsonb_agg(jsonb_build_object('card_id', e->>'id', 'rarity', e->>'rarity', 'model', e->>'vehicle_model', 'value', e->'value')), '[]')
           from jsonb_array_elements(v_results) e));

  insert into public.bets_history (profile_id, game_id, bet_amount, win_amount, multiplier, result_data)
  values (v_profile.id, 'boosters', v_pack.price, 0, 0,
          jsonb_build_object('pack', v_pack.name, 'pack_id', v_pack.id, 'total_value', v_total_value,
                             'cards', (select jsonb_agg(jsonb_build_object('model', e->>'vehicle_model', 'rarity', e->>'rarity'))
                                       from jsonb_array_elements(v_results) e)));

  insert into public.casino_transactions (profile_id, type, amount, chips, game, description, status)
  values (v_profile.id, 'BET', 0, -v_pack.price, 'boosters',
          'Booster ' || v_pack.name || ' : ' || v_pack.cards_per_pack || ' carte(s)', 'COMPLETED');

  return jsonb_build_object(
    'pack_id', v_pack.id,
    'price', v_pack.price,
    'cards', v_results,
    'total_value', v_total_value,
    'profile', public.profile_payload(v_profile)
  );
end;
$$;

-- --------------------------------------------------------------------
-- 5. Console : cartes
-- --------------------------------------------------------------------
create or replace function public.admin_save_booster_card(p_card jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me public.profiles := public.assert_staff();
  v_id uuid := nullif(p_card->>'id', '')::uuid;
  v_card public.booster_cards;
  v_value bigint;
begin
  if not exists (select 1 from public.vehicle_catalog where model = p_card->>'vehicle_model') then
    raise exception 'VEHICLE_NOT_FOUND' using errcode = 'P0002';
  end if;
  if not exists (select 1 from public.booster_rarities where key = p_card->>'rarity') then
    raise exception 'INVALID_RARITY' using errcode = '22023';
  end if;
  if jsonb_typeof(p_card->'value_override') = 'number' then
    v_value := round((p_card->>'value_override')::numeric)::bigint;
  end if;

  if v_id is null then
    insert into public.booster_cards (vehicle_model, rarity, title, subtitle, image_url, value_override, accent_color, holo, active)
    values (p_card->>'vehicle_model', p_card->>'rarity',
            nullif(trim(p_card->>'title'), ''), nullif(trim(p_card->>'subtitle'), ''),
            nullif(trim(p_card->>'image_url'), ''), v_value, nullif(p_card->>'accent_color', ''),
            coalesce((p_card->>'holo')::boolean, false), coalesce((p_card->>'active')::boolean, true))
    returning * into v_card;
  else
    update public.booster_cards set
      vehicle_model = p_card->>'vehicle_model',
      rarity = p_card->>'rarity',
      title = nullif(trim(p_card->>'title'), ''),
      subtitle = nullif(trim(p_card->>'subtitle'), ''),
      image_url = nullif(trim(p_card->>'image_url'), ''),
      value_override = v_value,
      accent_color = nullif(p_card->>'accent_color', ''),
      holo = coalesce((p_card->>'holo')::boolean, false),
      active = coalesce((p_card->>'active')::boolean, true),
      updated_at = now()
    where id = v_id
    returning * into v_card;
    if v_card.id is null then
      raise exception 'CARD_NOT_FOUND' using errcode = 'P0002';
    end if;
  end if;

  insert into public.admin_logs (action, category, detail, author)
  values (case when v_id is null then 'Carte booster créée' else 'Carte booster modifiée' end, 'BOOSTER',
          coalesce(v_card.title, v_card.vehicle_model) || ' (' || v_card.rarity || ')',
          coalesce(v_me.rp_first_name || ' ' || v_me.rp_last_name, 'Console Admin'));

  return public.booster_card_json(v_card);
end;
$$;

create or replace function public.admin_delete_booster_cards(p_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me public.profiles := public.assert_staff();
  v_count integer;
begin
  delete from public.booster_cards where id = any(p_ids);
  get diagnostics v_count = row_count;
  insert into public.admin_logs (action, category, detail, author)
  values ('Cartes booster supprimées', 'BOOSTER', v_count || ' carte(s)',
          coalesce(v_me.rp_first_name || ' ' || v_me.rp_last_name, 'Console Admin'));
  return v_count;
end;
$$;

-- Création en masse : véhicules filtrés (classe / marque / liste) + rareté par tranche de prix
-- p_opts = { classes?: text[], manufacturers?: text[], models?: text[], minPrice?, maxPrice?,
--            thresholds: [{rarity, minPrice}], skipExisting?: bool, packId?: uuid }
create or replace function public.admin_bulk_create_booster_cards(p_opts jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me public.profiles := public.assert_staff();
  v_classes text[] := array(select jsonb_array_elements_text(coalesce(p_opts->'classes', '[]')));
  v_makers text[] := array(select upper(jsonb_array_elements_text(coalesce(p_opts->'manufacturers', '[]'))));
  v_models text[] := array(select jsonb_array_elements_text(coalesce(p_opts->'models', '[]')));
  v_min numeric := nullif(p_opts->>'minPrice', '')::numeric;
  v_max numeric := nullif(p_opts->>'maxPrice', '')::numeric;
  v_skip boolean := coalesce((p_opts->>'skipExisting')::boolean, true);
  v_pack uuid := nullif(p_opts->>'packId', '')::uuid;
  v_count integer;
begin
  if jsonb_typeof(p_opts->'thresholds') <> 'array' or jsonb_array_length(p_opts->'thresholds') = 0 then
    raise exception 'INVALID_THRESHOLDS' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_opts->'thresholds') t
    where not exists (select 1 from public.booster_rarities r where r.key = t->>'rarity')
  ) then
    raise exception 'INVALID_RARITY' using errcode = '22023';
  end if;
  if cardinality(v_classes) = 0 and cardinality(v_makers) = 0 and cardinality(v_models) = 0 then
    raise exception 'EMPTY_FILTER' using errcode = '22023';
  end if;

  with src as (
    select v.model, coalesce(v.price, 0) as price
    from public.vehicle_catalog v
    where (cardinality(v_classes) = 0 or v.class = any(v_classes))
      and (cardinality(v_makers) = 0 or upper(v.manufacturer) = any(v_makers))
      and (cardinality(v_models) = 0 or v.model = any(v_models))
      and (v_min is null or coalesce(v.price, 0) >= v_min)
      and (v_max is null or coalesce(v.price, 0) <= v_max)
      and (not v_skip or not exists (select 1 from public.booster_cards c where c.vehicle_model = v.model))
    order by v.price desc nulls last
    limit 500
  ), ins as (
    insert into public.booster_cards (vehicle_model, rarity)
    select s.model, coalesce((
      select t->>'rarity' from jsonb_array_elements(p_opts->'thresholds') t
      where s.price >= coalesce((t->>'minPrice')::numeric, 0)
      order by coalesce((t->>'minPrice')::numeric, 0) desc limit 1
    ), (select t->>'rarity' from jsonb_array_elements(p_opts->'thresholds') t
        order by coalesce((t->>'minPrice')::numeric, 0) limit 1))
    from src s
    returning id
  ), link as (
    insert into public.booster_pack_cards (pack_id, card_id)
    select v_pack, id from ins where v_pack is not null
    on conflict do nothing
    returning 1
  )
  select count(*) into v_count from ins;

  insert into public.admin_logs (action, category, detail, author)
  values ('Création de cartes en masse', 'BOOSTER', v_count || ' carte(s) créée(s)',
          coalesce(v_me.rp_first_name || ' ' || v_me.rp_last_name, 'Console Admin'));
  return v_count;
end;
$$;

-- --------------------------------------------------------------------
-- 6. Console : boosters
-- --------------------------------------------------------------------
-- p_pack = { id?, name, description, price, cards_per_pack, rarity_weights, guaranteed_rarity,
--            cover_image_url, accent_color, active, sort_order, cards: [{card_id, weight}] }
create or replace function public.admin_save_booster_pack(p_pack jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me public.profiles := public.assert_staff();
  v_id uuid := nullif(p_pack->>'id', '')::uuid;
  v_weights jsonb := '{}'::jsonb;
  v_key text;
  v_val jsonb;
begin
  if jsonb_typeof(p_pack->'rarity_weights') = 'object' then
    for v_key, v_val in select * from jsonb_each(p_pack->'rarity_weights') loop
      if jsonb_typeof(v_val) = 'number' and (v_val #>> '{}')::numeric > 0
         and exists (select 1 from public.booster_rarities where key = v_key) then
        v_weights := v_weights || jsonb_build_object(v_key, least((v_val #>> '{}')::numeric, 1000000));
      end if;
    end loop;
  end if;

  if v_id is null then
    insert into public.booster_packs (name, description, price, cards_per_pack, rarity_weights, guaranteed_rarity,
                                      cover_image_url, accent_color, active, sort_order)
    values (trim(p_pack->>'name'), nullif(trim(p_pack->>'description'), ''),
            round((p_pack->>'price')::numeric)::bigint, (p_pack->>'cards_per_pack')::int, v_weights,
            nullif(p_pack->>'guaranteed_rarity', ''), nullif(trim(p_pack->>'cover_image_url'), ''),
            coalesce(nullif(p_pack->>'accent_color', ''), '#ffffff'),
            coalesce((p_pack->>'active')::boolean, true), coalesce((p_pack->>'sort_order')::int, 0))
    returning id into v_id;
  else
    update public.booster_packs set
      name = trim(p_pack->>'name'),
      description = nullif(trim(p_pack->>'description'), ''),
      price = round((p_pack->>'price')::numeric)::bigint,
      cards_per_pack = (p_pack->>'cards_per_pack')::int,
      rarity_weights = v_weights,
      guaranteed_rarity = nullif(p_pack->>'guaranteed_rarity', ''),
      cover_image_url = nullif(trim(p_pack->>'cover_image_url'), ''),
      accent_color = coalesce(nullif(p_pack->>'accent_color', ''), '#ffffff'),
      active = coalesce((p_pack->>'active')::boolean, true),
      sort_order = coalesce((p_pack->>'sort_order')::int, 0),
      updated_at = now()
    where id = v_id;
    if not found then
      raise exception 'PACK_NOT_FOUND' using errcode = 'P0002';
    end if;
  end if;

  if jsonb_typeof(p_pack->'cards') = 'array' then
    delete from public.booster_pack_cards where pack_id = v_id;
    insert into public.booster_pack_cards (pack_id, card_id, weight)
    select v_id, (e->>'card_id')::uuid, least(greatest(coalesce((e->>'weight')::int, 1), 1), 1000)
    from jsonb_array_elements(p_pack->'cards') e
    where exists (select 1 from public.booster_cards c where c.id = (e->>'card_id')::uuid)
    on conflict (pack_id, card_id) do update set weight = excluded.weight;
  end if;

  insert into public.admin_logs (action, category, detail, author)
  values (case when p_pack->>'id' is null or p_pack->>'id' = '' then 'Booster créé' else 'Booster modifié' end, 'BOOSTER',
          trim(p_pack->>'name') || ' — ' || round((p_pack->>'price')::numeric) || ' jetons',
          coalesce(v_me.rp_first_name || ' ' || v_me.rp_last_name, 'Console Admin'));
  return v_id;
end;
$$;

create or replace function public.admin_delete_booster_pack(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me public.profiles := public.assert_staff();
  v_name text;
begin
  delete from public.booster_packs where id = p_id returning name into v_name;
  if v_name is null then
    raise exception 'PACK_NOT_FOUND' using errcode = 'P0002';
  end if;
  insert into public.admin_logs (action, category, detail, author)
  values ('Booster supprimé', 'BOOSTER', v_name,
          coalesce(v_me.rp_first_name || ' ' || v_me.rp_last_name, 'Console Admin'));
end;
$$;

-- --------------------------------------------------------------------
-- 7. Console : raretés (liste complète remplacée)
-- --------------------------------------------------------------------
-- p_rows = [{key, label, color, effect, sort}]
create or replace function public.admin_save_booster_rarities(p_rows jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me public.profiles := public.assert_staff();
  v_keys text[];
begin
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 or jsonb_array_length(p_rows) > 12 then
    raise exception 'INVALID_RARITIES' using errcode = '22023';
  end if;
  v_keys := array(select upper(e->>'key') from jsonb_array_elements(p_rows) e);

  if exists (select 1 from public.booster_cards where not (rarity = any(v_keys))) then
    raise exception 'RARITY_IN_USE' using errcode = 'P0001';
  end if;

  insert into public.booster_rarities (key, label, color, effect, sort, updated_at)
  select upper(e->>'key'), trim(e->>'label'), e->>'color', coalesce(nullif(e->>'effect', ''), 'none'),
         coalesce((e->>'sort')::int, (ord - 1)::int), now()
  from jsonb_array_elements(p_rows) with ordinality as x(e, ord)
  on conflict (key) do update set
    label = excluded.label, color = excluded.color, effect = excluded.effect,
    sort = excluded.sort, updated_at = now();

  update public.booster_packs set guaranteed_rarity = null where guaranteed_rarity is not null and not (guaranteed_rarity = any(v_keys));
  delete from public.booster_rarities where not (key = any(v_keys));

  insert into public.admin_logs (action, category, detail, author)
  values ('Raretés booster modifiées', 'BOOSTER', array_to_string(v_keys, ', '),
          coalesce(v_me.rp_first_name || ' ' || v_me.rp_last_name, 'Console Admin'));
end;
$$;

-- --------------------------------------------------------------------
-- 8. Statistiques : le jeu 'boosters' (répartition par booster)
-- --------------------------------------------------------------------
do $$
declare
  v_def text := pg_get_functiondef('public.admin_game_stats(text, integer)'::regprocedure);
begin
  v_def := replace(v_def,
    $q$p_game not in ('mines', 'doghouse', 'wanted', 'lucky_wheel')$q$,
    $q$p_game not in ('mines', 'doghouse', 'wanted', 'lucky_wheel', 'boosters')$q$);
  v_def := replace(v_def,
    $q$when p_game = 'lucky_wheel' then coalesce(result_data->>'segment', '?')$q$,
    $q$when p_game = 'lucky_wheel' then coalesce(result_data->>'segment', '?')
               when p_game = 'boosters' then coalesce(result_data->>'pack', '?')$q$);
  execute v_def;
end;
$$;

-- --------------------------------------------------------------------
-- 9. Droits
-- --------------------------------------------------------------------
revoke execute on function public.booster_rand() from public, anon, authenticated;
revoke execute on function public.booster_card_json(public.booster_cards) from public, anon, authenticated;

revoke execute on function public.booster_catalog(boolean) from public;
grant execute on function public.booster_catalog(boolean) to anon, authenticated;

revoke execute on function public.open_booster(uuid) from public, anon, authenticated;
grant execute on function public.open_booster(uuid) to authenticated;

revoke execute on function public.admin_save_booster_card(jsonb) from public, anon, authenticated;
grant execute on function public.admin_save_booster_card(jsonb) to authenticated;
revoke execute on function public.admin_delete_booster_cards(uuid[]) from public, anon, authenticated;
grant execute on function public.admin_delete_booster_cards(uuid[]) to authenticated;
revoke execute on function public.admin_bulk_create_booster_cards(jsonb) from public, anon, authenticated;
grant execute on function public.admin_bulk_create_booster_cards(jsonb) to authenticated;
revoke execute on function public.admin_save_booster_pack(jsonb) from public, anon, authenticated;
grant execute on function public.admin_save_booster_pack(jsonb) to authenticated;
revoke execute on function public.admin_delete_booster_pack(uuid) from public, anon, authenticated;
grant execute on function public.admin_delete_booster_pack(uuid) to authenticated;
revoke execute on function public.admin_save_booster_rarities(jsonb) from public, anon, authenticated;
grant execute on function public.admin_save_booster_rarities(jsonb) to authenticated;
