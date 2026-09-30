-- ====================================================================
-- COLLECTIONS DE MARQUES — cartes à collectionner (autos & mode de GTA V)
-- ====================================================================
-- Deux albums : les marques automobiles et les marques de mode de Los Santos.
-- Le joueur achète un booster (25 000 jetons, 5 cartes tirées côté serveur)
-- ou en ouvre un gagné à la Roue de la Fortune.
--   * Compléter un album (toutes les cartes hors « secrètes ») rapporte une
--     récompense unique (1 000 000 jetons par défaut), créditée automatiquement.
--   * Les cartes secrètes ne comptent pas dans l'album : ce sont des bonus rares.
--   * Les doublons (et les cartes secrètes) se revendent à prix fixe par rareté.
--
-- Garde-fous (le casino doit rester gagnant) — games_config.collections :
--   * packMaxRtp : revente moyenne d'un booster ≤ prix × packMaxRtp (60 %)
--   * maxRtp     : sur un album complet, (récompense + reventes) ≤ coût moyen
--                  des boosters × maxRtp (90 %). Coût moyen calculé exactement
--                  (collectionneur de vignettes à probabilités inégales).
--
-- Tables lisibles par le staff seulement ; les joueurs passent par les
-- fonctions collection_catalog, my_collections, open_collection_pack,
-- sell_collection_cards.
-- ====================================================================

-- --------------------------------------------------------------------
-- 1. Tables
-- --------------------------------------------------------------------
create table if not exists public.collection_rarities (
  key text primary key check (key ~ '^[A-Z0-9_]{2,20}$'),
  label text not null check (char_length(label) between 1 and 30),
  color text not null default '#9ca3af' check (color ~ '^#[0-9a-fA-F]{6}$'),
  effect text not null default 'none' check (effect in ('none', 'glow', 'holo', 'rays', 'mythic')),
  sort integer not null default 0,
  -- Prix de revente d'un exemplaire (jetons)
  sell_value bigint not null default 0 check (sell_value between 0 and 100000000),
  -- false = carte secrète : ne compte pas pour compléter l'album
  in_collection boolean not null default true,
  updated_at timestamptz not null default now()
);

insert into public.collection_rarities (key, label, color, effect, sort, sell_value, in_collection) values
  ('COMMUNE', 'Commune', '#a3a3a3', 'none', 0, 500, true),
  ('RARE', 'Rare', '#3b82f6', 'glow', 1, 1500, true),
  ('EPIQUE', 'Épique', '#a855f7', 'holo', 2, 5000, true),
  ('LEGENDAIRE', 'Légendaire', '#f59e0b', 'rays', 3, 15000, true),
  ('MYTHIQUE', 'Mythique', '#ef4444', 'mythic', 4, 60000, true),
  ('SECRETE', 'Secrète', '#5eead4', 'mythic', 5, 150000, false)
on conflict (key) do nothing;

create table if not exists public.collection_sets (
  id text primary key check (id ~ '^[a-z0-9_-]{2,30}$'),
  name text not null check (char_length(name) between 1 and 40),
  subtitle text check (subtitle is null or char_length(subtitle) <= 60),
  description text check (description is null or char_length(description) <= 300),
  accent_color text not null default '#d9b25f' check (accent_color ~ '^#[0-9a-fA-F]{6}$'),
  pack_price bigint not null default 25000 check (pack_price between 1 and 1000000000),
  cards_per_pack integer not null default 5 check (cards_per_pack between 1 and 10),
  reward bigint not null default 1000000 check (reward between 0 and 10000000000),
  rarity_weights jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  sort_order integer not null default 0,
  -- Calculé par collection_refresh_stats() à chaque modification
  stats jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.collection_cards (
  id uuid primary key default gen_random_uuid(),
  set_id text not null references public.collection_sets(id) on delete cascade on update cascade,
  number integer not null check (number between 1 and 999),
  name text not null check (char_length(name) between 1 and 40),
  tagline text check (tagline is null or char_length(tagline) <= 60),
  rarity text not null references public.collection_rarities(key) on update cascade,
  color text not null default '#d9b25f' check (color ~ '^#[0-9a-fA-F]{6}$'),
  color2 text not null default '#111111' check (color2 ~ '^#[0-9a-fA-F]{6}$'),
  font text not null default 'tight' check (font in ('tight', 'tight-italic', 'serif', 'serif-italic', 'mono', 'oswald', 'lilita', 'luckiest', 'rye')),
  emblem text check (emblem is null or char_length(emblem) between 1 and 3),
  image_url text check (image_url is null or (char_length(image_url) <= 500 and image_url ~ '^(https://|/)[^\s"''<>]+$')),
  weight integer not null default 1 check (weight between 1 and 1000),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (set_id, number)
);
create index if not exists collection_cards_set_idx on public.collection_cards (set_id, rarity);

create table if not exists public.collection_owned (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  card_id uuid not null references public.collection_cards(id) on delete cascade,
  count integer not null default 0 check (count >= 0),
  total_found integer not null default 0,
  first_at timestamptz not null default now(),
  last_at timestamptz not null default now(),
  primary key (profile_id, card_id)
);
create index if not exists collection_owned_card_idx on public.collection_owned (card_id);

create table if not exists public.collection_completions (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  set_id text not null references public.collection_sets(id) on delete cascade on update cascade,
  reward bigint not null,
  packs_opened integer not null default 0,
  completed_at timestamptz not null default now(),
  primary key (profile_id, set_id)
);

create table if not exists public.collection_openings (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  set_id text references public.collection_sets(id) on delete set null on update cascade,
  price bigint not null default 0,
  source text not null default 'buy' check (source in ('buy', 'gift')),
  reward_id uuid,
  cards jsonb not null default '[]'::jsonb,
  completed boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists collection_openings_profile_idx on public.collection_openings (profile_id, created_at desc);

alter table public.collection_rarities enable row level security;
alter table public.collection_sets enable row level security;
alter table public.collection_cards enable row level security;
alter table public.collection_owned enable row level security;
alter table public.collection_completions enable row level security;
alter table public.collection_openings enable row level security;

drop policy if exists "collection_rarities_select_all" on public.collection_rarities;
create policy "collection_rarities_select_all" on public.collection_rarities
  for select to anon, authenticated using (true);
drop policy if exists "collection_sets_select_staff" on public.collection_sets;
create policy "collection_sets_select_staff" on public.collection_sets
  for select to authenticated using ((select public.is_staff()));
-- Les cartes secrètes ne doivent pas fuiter : lecture directe réservée au staff
drop policy if exists "collection_cards_select_staff" on public.collection_cards;
create policy "collection_cards_select_staff" on public.collection_cards
  for select to authenticated using ((select public.is_staff()));
drop policy if exists "collection_owned_select_own_or_staff" on public.collection_owned;
create policy "collection_owned_select_own_or_staff" on public.collection_owned
  for select to authenticated
  using ((select public.is_staff()) or profile_id in (select id from public.profiles where user_id = (select auth.uid())));
drop policy if exists "collection_completions_select_own_or_staff" on public.collection_completions;
create policy "collection_completions_select_own_or_staff" on public.collection_completions
  for select to authenticated
  using ((select public.is_staff()) or profile_id in (select id from public.profiles where user_id = (select auth.uid())));
drop policy if exists "collection_openings_select_own_or_staff" on public.collection_openings;
create policy "collection_openings_select_own_or_staff" on public.collection_openings
  for select to authenticated
  using ((select public.is_staff()) or profile_id in (select id from public.profiles where user_id = (select auth.uid())));

-- Boosters offerts (roue, direction) : un lot « pack » dans l'inventaire
alter table public.player_rewards drop constraint if exists player_rewards_kind_check;
alter table public.player_rewards
  add constraint player_rewards_kind_check check (kind in ('vehicle', 'item', 'voucher', 'pack'));
alter table public.player_rewards add column if not exists pack_set text;

-- --------------------------------------------------------------------
-- 2. Réglages : games_config.collections
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

  v_min := public.jnum(c, 'minBet', 10, 1, 1000000);
  c := jsonb_build_object(
    'enabled', public.jbool(c, 'enabled', true),
    'minBet', v_min,
    'maxBet', greatest(v_min, public.jnum(c, 'maxBet', 100000, 1, 10000000)),
    'rtp', round(public.jnum(c, 'rtp', 97, 80, 99), 1),
    'maxMultiplier', round(public.jnum(c, 'maxMultiplier', 1000, 2, 100000)),
    'maxPayout', public.jnum(c, 'maxPayout', 5000000, 1000, 1000000000)
  );

  k := jsonb_build_object(
    'enabled', public.jbool(k, 'enabled', true),
    'maxRtp', public.jnum(k, 'maxRtp', 90, 10, 100),
    'packMaxRtp', public.jnum(k, 'packMaxRtp', 60, 0, 100)
  );

  return jsonb_build_object('mines', m, 'doghouse', d, 'wanted', w, 'wheel', r, 'boosters', b, 'crash', c, 'collections', k);
end;
$$;

update public.casino_settings
set value = public.normalize_games_config(value), updated_at = now()
where key = 'games_config';

-- --------------------------------------------------------------------
-- 3. Tirage et économie
-- --------------------------------------------------------------------
-- Réserve jouable d'un album : raretés (poids > 0 et au moins une carte active)
-- {n, rarities: [{r, s, w, cw, sell, in, cards: [{id, w}]}]}
create or replace function public.collection_pool(p_set public.collection_sets)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with pool as (
    select r.key, r.sort, r.sell_value, r.in_collection, (p_set.rarity_weights->>r.key)::numeric as w,
           jsonb_agg(jsonb_build_object('id', c.id, 'w', c.weight) order by c.number) as cards,
           sum(c.weight) as cw
    from public.collection_rarities r
    join public.collection_cards c on c.rarity = r.key and c.set_id = p_set.id and c.active
    where jsonb_typeof(p_set.rarity_weights->r.key) = 'number'
      and (p_set.rarity_weights->>r.key)::numeric > 0
    group by r.key, r.sort, r.sell_value, r.in_collection
  )
  select jsonb_build_object(
    'n', p_set.cards_per_pack,
    'rarities', coalesce((select jsonb_agg(jsonb_build_object('r', key, 's', sort, 'w', w, 'cw', cw, 'sell', sell_value,
                                                              'in', in_collection, 'cards', cards) order by sort, key) from pool), '[]')
  );
$$;

-- Tirage d'un booster : [{id, r}]
create or replace function public.collection_draw(p_pool jsonb)
returns jsonb
language plpgsql
volatile
set search_path = ''
as $$
declare
  rs jsonb := p_pool->'rarities';
  nr int := jsonb_array_length(p_pool->'rarities');
  n int := (p_pool->>'n')::int;
  out jsonb := '[]'::jsonb;
  slot int;
  i int;
  total numeric := 0;
  x double precision;
  chosen int;
  w numeric;
  cards jsonb;
  card_id text;
begin
  for i in 0 .. nr - 1 loop
    total := total + (rs->i->>'w')::numeric;
  end loop;
  for slot in 1 .. n loop
    x := public.booster_rand() * total;
    chosen := nr - 1;
    for i in 0 .. nr - 1 loop
      w := (rs->i->>'w')::numeric;
      if x < w then chosen := i; exit; end if;
      x := x - w;
    end loop;

    cards := rs->chosen->'cards';
    x := public.booster_rand() * (rs->chosen->>'cw')::numeric;
    card_id := cards->(jsonb_array_length(cards) - 1)->>'id';
    for i in 0 .. jsonb_array_length(cards) - 1 loop
      w := (cards->i->>'w')::numeric;
      if x < w then card_id := cards->i->>'id'; exit; end if;
      x := x - w;
    end loop;

    out := out || jsonb_build_array(jsonb_build_object('id', card_id, 'r', rs->chosen->>'r'));
  end loop;
  return out;
end;
$$;

-- Économie d'un album, calculée exactement :
--   E[tirages pour tout avoir] = ∫₀^∞ (1 − Π(1 − e^(−pᵢ·t))) dt   (cartes de l'album)
--   copies attendues d'une carte = pᵢ × tirages (identité de Wald)
-- Les boosters s'achètent entiers : + (n − 1) / 2 tirages en moyenne.
create or replace function public.collection_compute_stats(p_set public.collection_sets)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_pool jsonb := public.collection_pool(p_set);
  n int := p_set.cards_per_pack;
  tw numeric;
  v_cards int := 0;
  v_missing int := 0;
  v_pmin double precision;
  v_draws double precision;
  v_pack_ev numeric;
  v_sell_rate numeric;
  v_keep numeric;
  v_resale numeric;
  v_packs numeric;
  v_cost numeric;
  v_dt double precision;
begin
  select coalesce(sum((r->>'w')::numeric), 0) into tw from jsonb_array_elements(v_pool->'rarities') r;

  -- Cartes de l'album actives qui ne peuvent jamais sortir (rareté à 0 %)
  select count(*) into v_missing
  from public.collection_cards cc
  join public.collection_rarities rr on rr.key = cc.rarity and rr.in_collection
  where cc.set_id = p_set.id and cc.active
    and not (coalesce((p_set.rarity_weights->>cc.rarity)::numeric, 0) > 0);

  if tw <= 0 then
    return jsonb_build_object('playable', false, 'cards', 0, 'unreachable', v_missing);
  end if;

  -- Probabilité de chaque carte sur un tirage
  with probs as (
    select ((r->>'w')::numeric / tw * (c->>'w')::numeric / (r->>'cw')::numeric)::double precision as p,
           (r->>'sell')::numeric as sell, (r->>'in')::boolean as in_col
    from jsonb_array_elements(v_pool->'rarities') r, jsonb_array_elements(r->'cards') c
  )
  select count(*) filter (where in_col), min(p) filter (where in_col),
         sum(p::numeric * sell), coalesce(sum(sell) filter (where in_col), 0)
  into v_cards, v_pmin, v_sell_rate, v_keep
  from probs;
  v_pack_ev := round(v_sell_rate * n);

  if v_cards > 0 and v_missing = 0 then
    v_dt := 40.0 / v_pmin / 4000;
    with probs as (
      select ((r->>'w')::numeric / tw * (c->>'w')::numeric / (r->>'cw')::numeric)::double precision as p
      from jsonb_array_elements(v_pool->'rarities') r, jsonb_array_elements(r->'cards') c
      where (r->>'in')::boolean
    )
    -- (exp() borné : Postgres refuse les sous-dépassements)
    select sum(v_dt * (1 - exp(greatest(s, -700)))) into v_draws
    from (
      select k, sum(ln(greatest(1 - exp(greatest(-p * k * v_dt, -700)), 1e-300))) s
      from generate_series(1, 4000) k, probs
      group by k
    ) t;
    -- Les boosters s'achètent entiers
    v_draws := v_draws + (n - 1) / 2.0;
    v_resale := greatest(v_sell_rate * v_draws::numeric - v_keep, 0);
    v_packs := v_draws::numeric / n;
    v_cost := v_packs * p_set.pack_price;
  end if;

  return jsonb_build_object(
    'playable', true,
    'cards', v_cards,
    'unreachable', v_missing,
    'pack_resale_ev', v_pack_ev,
    'pack_rtp', round(v_pack_ev * 100 / greatest(p_set.pack_price, 1), 2),
    'expected_packs', round(v_packs, 1),
    'expected_cost', round(v_cost),
    'completion_resale', round(v_resale),
    'completion_rtp', case when v_cost > 0 then round((p_set.reward + v_resale) * 100 / v_cost, 2) end
  );
end;
$$;

create or replace function public.collection_refresh_stats(p_set_id text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.collection_sets;
begin
  for s in select * from public.collection_sets where p_set_id is null or id = p_set_id loop
    update public.collection_sets set stats = public.collection_compute_stats(s) where id = s.id;
  end loop;
end;
$$;

-- Un album est « vendable » s'il est jouable, complet (aucune carte impossible) et rentable
create or replace function public.collection_set_ok(p_set public.collection_sets)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((p_set.stats->>'playable')::boolean, false)
     and coalesce((p_set.stats->>'unreachable')::int, 0) = 0
     and coalesce((p_set.stats->>'cards')::int, 0) > 0
     and coalesce((p_set.stats->>'pack_rtp')::numeric, 1000) <= (public.games_config()->'collections'->>'packMaxRtp')::numeric
     and coalesce((p_set.stats->>'completion_rtp')::numeric, 1000) <= (public.games_config()->'collections'->>'maxRtp')::numeric;
$$;

-- Garde-fou appelé après toute modification de la console
create or replace function public.assert_collections_profitable(p_set_id text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.collection_sets;
begin
  perform public.collection_refresh_stats(p_set_id);
  for s in select * from public.collection_sets where active and (p_set_id is null or id = p_set_id) loop
    if coalesce((s.stats->>'unreachable')::int, 0) > 0 then
      raise exception 'COLLECTION_UNREACHABLE' using errcode = 'P0001';
    end if;
    if not public.collection_set_ok(s) then
      raise exception 'COLLECTION_UNPROFITABLE' using errcode = 'P0001';
    end if;
  end loop;
end;
$$;

-- Carte en JSON. p_reveal = false : carte secrète masquée (seuls numéro et rareté)
create or replace function public.collection_card_json(c public.collection_cards, p_reveal boolean default true)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select case when p_reveal then jsonb_build_object(
    'id', c.id, 'set_id', c.set_id, 'number', c.number, 'name', c.name, 'tagline', c.tagline,
    'rarity', c.rarity, 'color', c.color, 'color2', c.color2, 'font', c.font, 'emblem', c.emblem,
    'image_url', c.image_url, 'weight', c.weight, 'active', c.active, 'hidden', false)
  else jsonb_build_object('id', c.id, 'set_id', c.set_id, 'number', c.number, 'rarity', c.rarity,
                          'active', c.active, 'hidden', true) end;
$$;

-- --------------------------------------------------------------------
-- 4. Joueurs
-- --------------------------------------------------------------------
-- Catalogue public : raretés, albums vendables, cartes (secrètes masquées)
create or replace function public.collection_catalog()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'rarities', coalesce((select jsonb_agg(to_jsonb(r) - 'updated_at' order by r.sort, r.key) from public.collection_rarities r), '[]'),
    'sets', coalesce((select jsonb_agg(
               jsonb_build_object('id', s.id, 'name', s.name, 'subtitle', s.subtitle, 'description', s.description,
                                  'accent_color', s.accent_color, 'pack_price', s.pack_price, 'cards_per_pack', s.cards_per_pack,
                                  'reward', s.reward, 'rarity_weights', s.rarity_weights, 'sort_order', s.sort_order)
               order by s.sort_order, s.id)
             from public.collection_sets s where s.active and public.collection_set_ok(s)), '[]'),
    'cards', coalesce((select jsonb_agg(public.collection_card_json(c, r.in_collection) order by c.set_id, c.number)
             from public.collection_cards c
             join public.collection_rarities r on r.key = c.rarity
             join public.collection_sets s on s.id = c.set_id
             where c.active and s.active), '[]'),
    'config', public.games_config()->'collections'
  );
$$;

-- Albums du joueur : exemplaires, secrètes trouvées (révélées), albums complétés, boosters offerts
create or replace function public.my_collections()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_profile_id uuid;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED' using errcode = '28000';
  end if;
  select id into v_profile_id from public.profiles where user_id = v_uid;
  if v_profile_id is null then
    raise exception 'PROFILE_REQUIRED' using errcode = 'P0002';
  end if;

  return jsonb_build_object(
    'owned', coalesce((select jsonb_agg(jsonb_build_object('card_id', o.card_id, 'count', o.count, 'total_found', o.total_found,
                                                           'first_at', o.first_at, 'last_at', o.last_at))
                       from public.collection_owned o where o.profile_id = v_profile_id and o.total_found > 0), '[]'),
    -- Les cartes secrètes déjà trouvées sont dévoilées au joueur
    'secrets', coalesce((select jsonb_agg(public.collection_card_json(c, true))
                         from public.collection_owned o
                         join public.collection_cards c on c.id = o.card_id
                         join public.collection_rarities r on r.key = c.rarity and not r.in_collection
                         where o.profile_id = v_profile_id and o.total_found > 0), '[]'),
    'completions', coalesce((select jsonb_agg(to_jsonb(x) - 'profile_id') from public.collection_completions x
                             where x.profile_id = v_profile_id), '[]'),
    'gifts', coalesce((select jsonb_agg(jsonb_build_object('id', w.id, 'set_id', w.pack_set, 'label', w.label, 'source', w.source,
                                                           'created_at', w.created_at) order by w.created_at)
                       from public.player_rewards w
                       where w.profile_id = v_profile_id and w.kind = 'pack' and w.status = 'IN_INVENTORY'), '[]'),
    'openings', (select count(*) from public.collection_openings where profile_id = v_profile_id)
  );
end;
$$;

-- Ouverture d'un booster. p_reward_id = booster offert (roue / direction) à utiliser.
create or replace function public.open_collection_pack(p_set_id text, p_reward_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_set public.collection_sets;
  v_profile public.profiles;
  v_gift public.player_rewards;
  v_price bigint := 0;
  v_pool jsonb;
  v_draw jsonb;
  d jsonb;
  v_card public.collection_cards;
  v_in boolean;
  v_owned public.collection_owned;
  v_results jsonb := '[]'::jsonb;
  v_total int;
  v_have int;
  v_completed boolean := false;
  v_reward bigint := 0;
  v_packs int;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED' using errcode = '28000';
  end if;
  perform public.assert_game_open('collections');

  select * into v_set from public.collection_sets where id = p_set_id and active;
  if v_set.id is null then
    raise exception 'SET_NOT_FOUND' using errcode = 'P0002';
  end if;
  if not public.collection_set_ok(v_set) then
    raise exception 'COLLECTION_UNPROFITABLE' using errcode = 'P0001';
  end if;
  v_pool := public.collection_pool(v_set);

  select * into v_profile from public.profiles where user_id = v_uid for update;
  if v_profile.id is null then
    raise exception 'PROFILE_REQUIRED' using errcode = 'P0002';
  end if;

  if p_reward_id is not null then
    select * into v_gift from public.player_rewards
    where id = p_reward_id and profile_id = v_profile.id and kind = 'pack' and status = 'IN_INVENTORY'
    for update;
    if v_gift.id is null then
      raise exception 'GIFT_NOT_FOUND' using errcode = 'P0001';
    end if;
    -- Un booster offert sans album précis (ou d'un album retiré) s'ouvre sur l'album choisi
    if v_gift.pack_set is not null and v_gift.pack_set <> v_set.id
       and exists (select 1 from public.collection_sets s where s.id = v_gift.pack_set and s.active) then
      raise exception 'GIFT_WRONG_SET' using errcode = 'P0001';
    end if;
    update public.player_rewards set status = 'USED', handled_at = now(), handled_by = 'Ouvert (Collections)'
    where id = v_gift.id;
  else
    v_price := v_set.pack_price;
    if v_profile.chips < v_price then
      raise exception 'INSUFFICIENT_FUNDS' using errcode = 'P0001';
    end if;
  end if;

  v_draw := public.collection_draw(v_pool);

  for d in select * from jsonb_array_elements(v_draw) loop
    select * into v_card from public.collection_cards where id = (d->>'id')::uuid;
    select in_collection into v_in from public.collection_rarities where key = v_card.rarity;

    insert into public.collection_owned as o (profile_id, card_id, count, total_found)
    values (v_profile.id, v_card.id, 1, 1)
    on conflict (profile_id, card_id) do update
      set count = o.count + 1, total_found = o.total_found + 1, last_at = now()
    returning * into v_owned;

    v_results := v_results || jsonb_build_array(public.collection_card_json(v_card, true) || jsonb_build_object(
      'is_new', v_owned.total_found = 1,
      'count', v_owned.count,
      'secret', not v_in));
  end loop;

  if v_price > 0 then
    update public.profiles
    set chips = chips - v_price, total_wagered = coalesce(total_wagered, 0) + v_price
    where id = v_profile.id
    returning * into v_profile;
  end if;

  -- Album complété ? (toutes les cartes actives hors secrètes, au moins une fois)
  if not exists (select 1 from public.collection_completions where profile_id = v_profile.id and set_id = v_set.id) then
    select count(*), count(o.card_id) into v_total, v_have
    from public.collection_cards c
    join public.collection_rarities r on r.key = c.rarity and r.in_collection
    left join public.collection_owned o on o.card_id = c.id and o.profile_id = v_profile.id and o.total_found > 0
    where c.set_id = v_set.id and c.active;
    if v_total > 0 and v_have = v_total then
      v_completed := true;
      v_reward := v_set.reward;
      select count(*) + 1 into v_packs from public.collection_openings where profile_id = v_profile.id and set_id = v_set.id;
      insert into public.collection_completions (profile_id, set_id, reward, packs_opened)
      values (v_profile.id, v_set.id, v_reward, v_packs);
      if v_reward > 0 then
        update public.profiles
        set chips = chips + v_reward, total_won = coalesce(total_won, 0) + v_reward
        where id = v_profile.id
        returning * into v_profile;
        insert into public.casino_transactions (profile_id, type, amount, chips, game, description, status)
        values (v_profile.id, 'WIN', 0, v_reward, 'collections',
                'Collection « ' || v_set.name || ' » complétée : ' || v_reward || ' jetons', 'COMPLETED');
      end if;
      insert into public.admin_logs (action, category, detail, author)
      values ('Collection complétée', 'CITIZEN',
              v_profile.rp_first_name || ' ' || v_profile.rp_last_name || ' (#' || v_profile.citizen_id || ') a complété « '
              || v_set.name || ' » en ' || v_packs || ' booster(s) : ' || v_reward || ' jetons',
              'Collections');
    end if;
  end if;

  insert into public.collection_openings (profile_id, set_id, price, source, reward_id, cards, completed)
  values (v_profile.id, v_set.id, v_price, case when v_gift.id is null then 'buy' else 'gift' end, v_gift.id,
          (select jsonb_agg(jsonb_build_object('card_id', e->>'id', 'rarity', e->>'rarity', 'new', e->'is_new')) from jsonb_array_elements(v_results) e),
          v_completed);

  -- win_amount = récompense d'album (les reventes passent par REWARD_SALE)
  insert into public.bets_history (profile_id, game_id, bet_amount, win_amount, multiplier, result_data)
  values (v_profile.id, 'collections', v_price, v_reward,
          case when v_price > 0 then round(v_reward::numeric / v_price, 4) else 0 end,
          jsonb_build_object('set', v_set.name, 'set_id', v_set.id, 'mode', case when v_gift.id is null then 'buy' else 'gift' end,
                             'completed', v_completed,
                             'cards', (select jsonb_agg(jsonb_build_object('name', e->>'name', 'rarity', e->>'rarity')) from jsonb_array_elements(v_results) e)));

  if v_price > 0 then
    insert into public.casino_transactions (profile_id, type, amount, chips, game, description, status)
    values (v_profile.id, 'BET', 0, -v_price, 'collections',
            'Booster ' || v_set.name || ' : ' || v_set.cards_per_pack || ' carte(s)', 'COMPLETED');
  end if;

  return jsonb_build_object(
    'set_id', v_set.id,
    'price', v_price,
    'gift', v_gift.id is not null,
    'cards', v_results,
    'completed', v_completed,
    'reward', v_reward,
    'profile', public.profile_payload(v_profile)
  );
end;
$$;

-- Revente : p_items = [{card_id, qty}]. Seuls les doublons (et les cartes
-- secrètes) sont revendables : le premier exemplaire d'une carte d'album reste.
create or replace function public.sell_collection_cards(p_items jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_profile public.profiles;
  e jsonb;
  v_qty int;
  v_sellable int;
  v_owned public.collection_owned;
  v_value bigint;
  v_in boolean;
  v_total bigint := 0;
  v_count int := 0;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED' using errcode = '28000';
  end if;
  if coalesce(((select value from public.casino_settings where key = 'economy_config')->>'maintenanceMode')::boolean, false) then
    raise exception 'MAINTENANCE' using errcode = 'P0001';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 or jsonb_array_length(p_items) > 500 then
    raise exception 'NOTHING_TO_SELL' using errcode = 'P0001';
  end if;

  select * into v_profile from public.profiles where user_id = v_uid for update;
  if v_profile.id is null then
    raise exception 'PROFILE_REQUIRED' using errcode = 'P0002';
  end if;

  for e in select * from jsonb_array_elements(p_items) loop
    if jsonb_typeof(e->'qty') <> 'number' or (e->>'qty')::numeric < 1 then continue; end if;
    select o.* into v_owned from public.collection_owned o
    where o.profile_id = v_profile.id and o.card_id = (e->>'card_id')::uuid
    for update;
    if v_owned.card_id is null then continue; end if;
    select r.sell_value, r.in_collection into v_value, v_in
    from public.collection_cards c join public.collection_rarities r on r.key = c.rarity
    where c.id = v_owned.card_id;
    v_sellable := v_owned.count - case when v_in then 1 else 0 end;
    v_qty := least(floor((e->>'qty')::numeric)::int, v_sellable);
    if v_qty <= 0 or v_value <= 0 then continue; end if;
    update public.collection_owned set count = count - v_qty
    where profile_id = v_profile.id and card_id = v_owned.card_id;
    v_total := v_total + v_qty * v_value;
    v_count := v_count + v_qty;
  end loop;

  if v_count = 0 then
    raise exception 'NOTHING_TO_SELL' using errcode = 'P0001';
  end if;

  update public.profiles set chips = chips + v_total where id = v_profile.id returning * into v_profile;

  insert into public.casino_transactions (profile_id, type, amount, chips, game, description, status)
  values (v_profile.id, 'REWARD_SALE', 0, v_total, 'collections',
          'Revente de ' || v_count || ' carte(s) de collection', 'COMPLETED');

  return jsonb_build_object('sold', v_count, 'chips', v_total, 'profile', public.profile_payload(v_profile));
end;
$$;

-- --------------------------------------------------------------------
-- 5. Console
-- --------------------------------------------------------------------
create or replace function public.admin_collection_catalog()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me public.profiles := public.assert_staff();
begin
  perform public.collection_refresh_stats(null);
  return jsonb_build_object(
    'rarities', coalesce((select jsonb_agg(to_jsonb(r) - 'updated_at' order by r.sort, r.key) from public.collection_rarities r), '[]'),
    'sets', coalesce((select jsonb_agg(to_jsonb(s) || jsonb_build_object(
               'ok', public.collection_set_ok(s),
               'players', (select count(distinct o.profile_id) from public.collection_owned o join public.collection_cards c on c.id = o.card_id where c.set_id = s.id),
               'completions', (select count(*) from public.collection_completions x where x.set_id = s.id),
               'openings', (select count(*) from public.collection_openings x where x.set_id = s.id))
             order by s.sort_order, s.id) from public.collection_sets s), '[]'),
    'cards', coalesce((select jsonb_agg(public.collection_card_json(c, true) || jsonb_build_object(
               'owners', (select count(*) from public.collection_owned o where o.card_id = c.id and o.total_found > 0),
               'found', (select coalesce(sum(o.total_found), 0) from public.collection_owned o where o.card_id = c.id))
             order by c.set_id, c.number) from public.collection_cards c), '[]'),
    'config', public.games_config()->'collections'
  );
end;
$$;

-- p_set = {id, name, subtitle, description, accent_color, pack_price, cards_per_pack, reward, rarity_weights, active, sort_order}
create or replace function public.admin_save_collection_set(p_set jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me public.profiles := public.assert_staff();
  v_weights jsonb := '{}'::jsonb;
  v_key text;
  v_val jsonb;
begin
  if jsonb_typeof(p_set->'rarity_weights') = 'object' then
    for v_key, v_val in select * from jsonb_each(p_set->'rarity_weights') loop
      if jsonb_typeof(v_val) = 'number' and (v_val #>> '{}')::numeric > 0
         and exists (select 1 from public.collection_rarities where key = v_key) then
        v_weights := v_weights || jsonb_build_object(v_key, least((v_val #>> '{}')::numeric, 1000000));
      end if;
    end loop;
  end if;

  insert into public.collection_sets (id, name, subtitle, description, accent_color, pack_price, cards_per_pack, reward,
                                      rarity_weights, active, sort_order)
  values (lower(trim(p_set->>'id')), trim(p_set->>'name'), nullif(trim(p_set->>'subtitle'), ''),
          nullif(trim(p_set->>'description'), ''), coalesce(nullif(p_set->>'accent_color', ''), '#d9b25f'),
          round((p_set->>'pack_price')::numeric)::bigint, (p_set->>'cards_per_pack')::int,
          round((p_set->>'reward')::numeric)::bigint, v_weights,
          coalesce((p_set->>'active')::boolean, true), coalesce((p_set->>'sort_order')::int, 0))
  on conflict (id) do update set
    name = excluded.name, subtitle = excluded.subtitle, description = excluded.description,
    accent_color = excluded.accent_color, pack_price = excluded.pack_price, cards_per_pack = excluded.cards_per_pack,
    reward = excluded.reward, rarity_weights = excluded.rarity_weights, active = excluded.active,
    sort_order = excluded.sort_order, updated_at = now();

  perform public.assert_collections_profitable(lower(trim(p_set->>'id')));

  insert into public.admin_logs (action, category, detail, author)
  values ('Collection modifiée', 'BOOSTER',
          trim(p_set->>'name') || ' — booster ' || round((p_set->>'pack_price')::numeric) || ' jetons, récompense ' || round((p_set->>'reward')::numeric),
          coalesce(v_me.rp_first_name || ' ' || v_me.rp_last_name, 'Console Admin'));
end;
$$;

create or replace function public.admin_save_collection_card(p_card jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me public.profiles := public.assert_staff();
  v_id uuid := nullif(p_card->>'id', '')::uuid;
  v_card public.collection_cards;
begin
  if not exists (select 1 from public.collection_sets where id = p_card->>'set_id') then
    raise exception 'SET_NOT_FOUND' using errcode = 'P0002';
  end if;
  if not exists (select 1 from public.collection_rarities where key = p_card->>'rarity') then
    raise exception 'INVALID_RARITY' using errcode = '22023';
  end if;

  if v_id is null then
    insert into public.collection_cards (set_id, number, name, tagline, rarity, color, color2, font, emblem, image_url, weight, active)
    values (p_card->>'set_id',
            coalesce((p_card->>'number')::int, (select coalesce(max(number), 0) + 1 from public.collection_cards where set_id = p_card->>'set_id')),
            trim(p_card->>'name'), nullif(trim(p_card->>'tagline'), ''), p_card->>'rarity',
            coalesce(nullif(p_card->>'color', ''), '#d9b25f'), coalesce(nullif(p_card->>'color2', ''), '#111111'),
            coalesce(nullif(p_card->>'font', ''), 'tight'), nullif(trim(p_card->>'emblem'), ''),
            nullif(trim(p_card->>'image_url'), ''), coalesce((p_card->>'weight')::int, 1),
            coalesce((p_card->>'active')::boolean, true))
    returning * into v_card;
  else
    update public.collection_cards set
      set_id = p_card->>'set_id',
      number = coalesce((p_card->>'number')::int, number),
      name = trim(p_card->>'name'),
      tagline = nullif(trim(p_card->>'tagline'), ''),
      rarity = p_card->>'rarity',
      color = coalesce(nullif(p_card->>'color', ''), color),
      color2 = coalesce(nullif(p_card->>'color2', ''), color2),
      font = coalesce(nullif(p_card->>'font', ''), font),
      emblem = nullif(trim(p_card->>'emblem'), ''),
      image_url = nullif(trim(p_card->>'image_url'), ''),
      weight = coalesce((p_card->>'weight')::int, weight),
      active = coalesce((p_card->>'active')::boolean, active),
      updated_at = now()
    where id = v_id
    returning * into v_card;
    if v_card.id is null then
      raise exception 'CARD_NOT_FOUND' using errcode = 'P0002';
    end if;
  end if;

  perform public.assert_collections_profitable(null);

  insert into public.admin_logs (action, category, detail, author)
  values (case when v_id is null then 'Carte de collection créée' else 'Carte de collection modifiée' end, 'BOOSTER',
          v_card.name || ' (' || v_card.set_id || ', ' || v_card.rarity || ')',
          coalesce(v_me.rp_first_name || ' ' || v_me.rp_last_name, 'Console Admin'));

  return public.collection_card_json(v_card, true);
end;
$$;

create or replace function public.admin_delete_collection_card(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me public.profiles := public.assert_staff();
  v_name text;
begin
  delete from public.collection_cards where id = p_id returning name into v_name;
  if v_name is null then
    raise exception 'CARD_NOT_FOUND' using errcode = 'P0002';
  end if;
  perform public.assert_collections_profitable(null);
  insert into public.admin_logs (action, category, detail, author)
  values ('Carte de collection supprimée', 'BOOSTER', v_name,
          coalesce(v_me.rp_first_name || ' ' || v_me.rp_last_name, 'Console Admin'));
end;
$$;

-- p_rows = [{key, label, color, effect, sort, sell_value, in_collection}] (liste complète)
create or replace function public.admin_save_collection_rarities(p_rows jsonb)
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
  if exists (select 1 from public.collection_cards where not (rarity = any(v_keys))) then
    raise exception 'RARITY_IN_USE' using errcode = 'P0001';
  end if;

  insert into public.collection_rarities (key, label, color, effect, sort, sell_value, in_collection, updated_at)
  select upper(e->>'key'), trim(e->>'label'), e->>'color', coalesce(nullif(e->>'effect', ''), 'none'),
         coalesce((e->>'sort')::int, (ord - 1)::int),
         least(greatest(coalesce(round((e->>'sell_value')::numeric), 0), 0), 100000000)::bigint,
         coalesce((e->>'in_collection')::boolean, true), now()
  from jsonb_array_elements(p_rows) with ordinality as x(e, ord)
  on conflict (key) do update set
    label = excluded.label, color = excluded.color, effect = excluded.effect, sort = excluded.sort,
    sell_value = excluded.sell_value, in_collection = excluded.in_collection, updated_at = now();

  delete from public.collection_rarities where not (key = any(v_keys));

  perform public.assert_collections_profitable(null);

  insert into public.admin_logs (action, category, detail, author)
  values ('Raretés des collections modifiées', 'BOOSTER', array_to_string(v_keys, ', '),
          coalesce(v_me.rp_first_name || ' ' || v_me.rp_last_name, 'Console Admin'));
end;
$$;

-- Offrir des boosters de collection à un joueur
create or replace function public.admin_grant_collection_pack(p_profile_id uuid, p_set_id text, p_qty integer default 1, p_note text default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me public.profiles := public.assert_staff();
  v_target public.profiles;
  v_set public.collection_sets;
  v_qty int := least(greatest(coalesce(p_qty, 1), 1), 50);
begin
  select * into v_target from public.profiles where id = p_profile_id;
  if v_target.id is null then
    raise exception 'PROFILE_NOT_FOUND' using errcode = 'P0002';
  end if;
  perform public.assert_not_self_credit(v_me, v_target.id);
  select * into v_set from public.collection_sets where id = p_set_id;
  if v_set.id is null then
    raise exception 'SET_NOT_FOUND' using errcode = 'P0002';
  end if;

  insert into public.player_rewards (profile_id, kind, label, source, note, value, pack_set)
  select v_target.id, 'pack', left('Booster ' || v_set.name, 80), 'admin', left(p_note, 280), v_set.pack_price, v_set.id
  from generate_series(1, v_qty);

  insert into public.admin_logs (action, category, detail, author)
  values ('Booster de collection offert', 'CITIZEN', v_qty || ' × Booster ' || v_set.name || ' donné(s) à #' || v_target.citizen_id,
          coalesce(v_me.rp_first_name || ' ' || v_me.rp_last_name, 'Console Admin'));
  return v_qty;
end;
$$;

-- Statistiques : le jeu « collections »
do $$
declare
  v_def text := pg_get_functiondef('public.admin_game_stats(text, integer)'::regprocedure);
  a1 text := $q$'lucky_wheel', 'boosters', 'crash')$q$;
  b1 text := $q$'lucky_wheel', 'boosters', 'crash', 'collections')$q$;
  a2 text := $q$               when p_game = 'boosters' then coalesce(result_data->>'pack', '?')$q$;
  b2 text := $q$               when p_game = 'boosters' then coalesce(result_data->>'pack', '?')
               when p_game = 'collections' then coalesce(result_data->>'set', '?') || case when result_data->>'mode' = 'gift' then ' (offert)' else '' end$q$;
begin
  if position(a1 in v_def) = 0 or position(a2 in v_def) = 0 then
    raise exception 'admin_game_stats: point d''insertion introuvable';
  end if;
  execute replace(replace(v_def, a1, b1), a2, b2);
end;
$$;

-- --------------------------------------------------------------------
-- 6. Roue de la Fortune : lot « booster de collection »
-- --------------------------------------------------------------------
-- Valeur comptée dans le retour de la roue = prix du booster (prudent).
create or replace function public.wheel_ev(p_segments jsonb)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  with s as (
    select e,
           case when jsonb_typeof(e->'dropRate') = 'number' then greatest((e->>'dropRate')::numeric, 0) else 0 end as w
    from jsonb_array_elements(case when jsonb_typeof(p_segments) = 'array' then p_segments else '[]'::jsonb end) e
  ), t as (
    select sum(w) as tw, count(*) as n from s
  )
  select coalesce(sum(
           (case when t.tw > 0 then s.w / t.tw else 1.0 / t.n end)
           * (case when coalesce(s.e->>'type', '') in ('chips', 'cash') and jsonb_typeof(s.e->'value') = 'number'
                   then least(greatest((s.e->>'value')::numeric, 0), 100000000)
                   when s.e->>'type' = 'vehicle'
                   then coalesce((select v.price from public.vehicle_catalog v where v.model = s.e->>'vehicleModel'), 0)
                   when s.e->>'type' = 'voucher'
                   then coalesce((public.voucher_spec(s.e->>'voucherGame', s.e->>'voucherBuy',
                                                     coalesce((s.e->>'voucherValue')::numeric, 0))->>'cost')::numeric, 0)
                   when s.e->>'type' = 'pack'
                   then coalesce((select cs.pack_price from public.collection_sets cs where cs.id = s.e->>'packSet'),
                                 (select max(cs.pack_price) from public.collection_sets cs), 0)
                   else 0 end)
         ), 0)
  from s, t;
$$;

do $$
declare
  v_def text := pg_get_functiondef('public.admin_set_setting(text, jsonb)'::regprocedure);
  a1 text := $q$if v_type not in ('chips', 'vehicle', 'mystery', 'clothing', 'voucher') then$q$;
  b1 text := $q$if v_type not in ('chips', 'vehicle', 'mystery', 'clothing', 'voucher', 'pack') then$q$;
  a2 text := $q$                        else to_jsonb(left(coalesce(v_seg->>'value', v_label), 80)) end,$q$;
  b2 text := $q$                        when v_type = 'pack' then to_jsonb(left('Booster ' || coalesce((select cs.name from public.collection_sets cs where cs.id = v_seg->>'packSet'), 'Collection'), 80))
                        else to_jsonb(left(coalesce(v_seg->>'value', v_label), 80)) end,$q$;
  a3 text := $q$          'voucherValue', case when v_type = 'voucher' then public.jnum(v_seg, 'voucherValue', 20000, 1, 100000000)::bigint end$q$;
  b3 text := $q$          'voucherValue', case when v_type = 'voucher' then public.jnum(v_seg, 'voucherValue', 20000, 1, 100000000)::bigint end,
          'packSet', case when v_type = 'pack' then (select cs.id from public.collection_sets cs where cs.id = v_seg->>'packSet') end$q$;
begin
  if position(a1 in v_def) = 0 or position(a2 in v_def) = 0 or position(a3 in v_def) = 0 then
    raise exception 'admin_set_setting: point d''insertion introuvable';
  end if;
  execute replace(replace(replace(v_def, a1, b1), a2, b2), a3, b3);
end;
$$;

do $$
declare
  v_def text := pg_get_functiondef('public.spin_wheel()'::regprocedure);
  a1 text := $q$    insert into public.player_rewards (profile_id, kind, label, vehicle_model, image_url, source, value, voucher)$q$;
  b1 text := $q$    insert into public.player_rewards (profile_id, kind, label, vehicle_model, image_url, source, value, voucher, pack_set)$q$;
  a2 text := $q$            case when v_type = 'vehicle' then 'vehicle' when v_type = 'voucher' then 'voucher' else 'item' end,$q$;
  b2 text := $q$            case when v_type = 'vehicle' then 'vehicle' when v_type = 'voucher' then 'voucher' when v_type = 'pack' then 'pack' else 'item' end,$q$;
  a3 text := $q$            case when v_vehicle.model is not null then v_vehicle_value when v_type = 'voucher' then v_voucher_value end,
            v_voucher)$q$;
  b3 text := $q$            case when v_vehicle.model is not null then v_vehicle_value when v_type = 'voucher' then v_voucher_value
                 when v_type = 'pack' then (select cs.pack_price from public.collection_sets cs where cs.id = v_seg->>'packSet') end,
            v_voucher,
            case when v_type = 'pack' then v_seg->>'packSet' end)$q$;
begin
  if position(a1 in v_def) = 0 or position(a2 in v_def) = 0 or position(a3 in v_def) = 0 then
    raise exception 'spin_wheel: point d''insertion introuvable';
  end if;
  execute replace(replace(replace(v_def, a1, b1), a2, b2), a3, b3);
end;
$$;

-- Un booster offert ne se réclame pas en ville
do $$
declare
  v_def text := pg_get_functiondef('public.claim_reward(uuid)'::regprocedure);
  a1 text := $q$and status = 'IN_INVENTORY' and kind <> 'voucher'$q$;
  b1 text := $q$and status = 'IN_INVENTORY' and kind not in ('voucher', 'pack')$q$;
begin
  if position(a1 in v_def) = 0 then
    raise exception 'claim_reward: point d''insertion introuvable';
  end if;
  execute replace(v_def, a1, b1);
end;
$$;

-- --------------------------------------------------------------------
-- 7. Albums : marques automobiles et marques de mode de GTA V
-- --------------------------------------------------------------------
insert into public.collection_sets (id, name, subtitle, description, accent_color, pack_price, cards_per_pack, reward, rarity_weights, sort_order)
values
  ('autos', 'Marques automobiles', 'Constructeurs de San Andreas',
   'Réunissez les 48 constructeurs de Los Santos, de la Vapid familiale à la Pegassi de légende. Album complet : 1 000 000 jetons.',
   '#d9b25f', 25000, 5, 1000000,
   '{"COMMUNE": 58, "RARE": 27, "EPIQUE": 10, "LEGENDAIRE": 4.2, "MYTHIQUE": 0.7, "SECRETE": 0.1}', 0),
  ('mode', 'Marques de mode', 'Couture, streetwear & joaillerie',
   'Des bonnes affaires de Binco à la haute couture de Didier Sachs : 25 maisons de mode de Los Santos. Album complet : 1 000 000 jetons.',
   '#e879f9', 25000, 5, 1000000,
   '{"COMMUNE": 58, "RARE": 27, "EPIQUE": 10, "LEGENDAIRE": 4.2, "MYTHIQUE": 0.7, "SECRETE": 0.1}', 1)
on conflict (id) do nothing;

insert into public.collection_cards (set_id, number, name, tagline, rarity, color, color2, font, emblem)
select 'autos', row_number() over (order by ord), name, tagline, rarity, color, color2, font, emblem
from (values
  -- Communes
  (1, 'Vapid', 'Utilitaires populaires', 'COMMUNE', '#1565c0', '#ffffff', 'oswald', 'V'),
  (2, 'Willard', 'Berlines familiales', 'COMMUNE', '#6b705c', '#ddbea9', 'serif', 'W'),
  (3, 'Dundreary', 'Le luxe discret', 'COMMUNE', '#495057', '#e9ecef', 'serif', 'D'),
  (4, 'Emperor', 'Berlines de réception', 'COMMUNE', '#8d0801', '#f4d58d', 'serif', 'E'),
  (5, 'Chariot', 'Monospaces & vans', 'COMMUNE', '#3d405b', '#f2cc8f', 'tight', 'C'),
  (6, 'Weeny', 'Citadines', 'COMMUNE', '#ff4d6d', '#fff0f3', 'lilita', 'W'),
  (7, 'Maibatsu', 'Utilitaires japonais', 'COMMUNE', '#118ab2', '#ffffff', 'tight', 'M'),
  (8, 'Zirconium', 'Berlines rétro', 'COMMUNE', '#adb5bd', '#212529', 'mono', 'Z'),
  (9, 'Canis', 'Tout-terrain', 'COMMUNE', '#606c38', '#fefae0', 'oswald', 'C'),
  (10, 'BF', 'Buggys & fun', 'COMMUNE', '#fb8500', '#023047', 'luckiest', 'BF'),
  (11, 'Bollokan', 'Compactes coréennes', 'COMMUNE', '#0077b6', '#caf0f8', 'tight', 'B'),
  (12, 'Fathom', 'SUV urbains', 'COMMUNE', '#14213d', '#fca311', 'tight', 'F'),
  (13, 'Gallivanter', '4x4 de luxe', 'COMMUNE', '#2b2d42', '#edf2f4', 'serif-italic', 'G'),
  (14, 'Schyster', 'Muscle rétro', 'COMMUNE', '#9d0208', '#ffba08', 'lilita', 'S'),
  (15, 'Vulcar', 'Breaks suédois', 'COMMUNE', '#7f5539', '#ede0d4', 'serif', 'V'),
  (16, 'Vysser', 'Sportives néerlandaises', 'COMMUNE', '#003049', '#fcbf49', 'tight-italic', 'V'),
  (17, 'Maxwell', 'Compactes', 'COMMUNE', '#588157', '#dad7cd', 'oswald', 'M'),
  (18, 'Brute', 'Poids lourds', 'COMMUNE', '#343a40', '#ffc300', 'luckiest', 'BR'),
  (19, 'MTL', 'Camions & engins', 'COMMUNE', '#d62828', '#eae2b7', 'mono', 'MTL'),
  (20, 'JoBuilt', 'Engins de chantier', 'COMMUNE', '#ffb703', '#1d3557', 'oswald', 'JB'),
  -- Rares
  (21, 'Bravado', 'Muscle & pick-up', 'RARE', '#c1121f', '#fdf0d5', 'luckiest', 'B'),
  (22, 'Declasse', 'Américaines iconiques', 'RARE', '#1d3557', '#f1faee', 'oswald', 'D'),
  (23, 'Invetero', 'Cabriolets américains', 'RARE', '#264653', '#e9c46a', 'serif-italic', 'I'),
  (24, 'Imponte', 'Muscle cars', 'RARE', '#ff7b00', '#101010', 'luckiest', 'I'),
  (25, 'Dinka', 'Sportives japonaises', 'RARE', '#e63946', '#ffffff', 'tight', 'D'),
  (26, 'Karin', 'Fiabilité japonaise', 'RARE', '#2a9d8f', '#ffffff', 'tight', 'K'),
  (27, 'Obey', 'Berlines allemandes', 'RARE', '#3a3a3a', '#bcbcbc', 'oswald', 'O'),
  (28, 'Hijak', 'Sportives de prestige', 'RARE', '#7209b7', '#f8f8f8', 'tight-italic', 'H'),
  (29, 'Cheval', 'Berlines australiennes', 'RARE', '#6a4c2c', '#f4e1c1', 'serif', 'C'),
  (30, 'Albany', 'Luxe à l''américaine', 'RARE', '#4a0e0e', '#d4af37', 'serif', 'A'),
  (31, 'Principe', 'Motos italiennes', 'RARE', '#008c45', '#cd212a', 'tight-italic', 'P'),
  (32, 'Nagasaki', 'Motos & quads', 'RARE', '#ffcc00', '#111111', 'luckiest', 'N'),
  (33, 'Shitzu', 'Motos japonaises', 'RARE', '#d00000', '#ffffff', 'tight', 'S'),
  (34, 'Western', 'Motos custom', 'RARE', '#5c3a1e', '#e6b566', 'rye', 'W'),
  -- Épiques
  (35, 'Pfister', 'Performance allemande', 'EPIQUE', '#b30000', '#111111', 'tight-italic', 'PF'),
  (36, 'Dewbauchee', 'Grand tourisme', 'EPIQUE', '#0b2545', '#c9a45c', 'serif', 'D'),
  (37, 'Enus', 'Luxe britannique', 'EPIQUE', '#6d6d6d', '#e8d9a8', 'serif', 'E'),
  (38, 'Benefactor', 'Prestige allemand', 'EPIQUE', '#1f3b73', '#d9d9d9', 'tight', 'B'),
  (39, 'Lampadati', 'Dolce vita automobile', 'EPIQUE', '#8c1c13', '#f2e3c6', 'serif-italic', 'L'),
  (40, 'Coil', 'Électrique & futuriste', 'EPIQUE', '#00c2d1', '#0a0a0a', 'mono', 'C'),
  (41, 'Annis', 'Tuning japonais', 'EPIQUE', '#e31b23', '#ffffff', 'tight-italic', 'A'),
  (42, 'Übermacht', 'Berlines sportives', 'EPIQUE', '#1b6fd1', '#f0f0f0', 'oswald', 'Ü'),
  -- Légendaires
  (43, 'Grotti', 'Sportives de légende', 'LEGENDAIRE', '#d11a2a', '#f7d046', 'serif-italic', 'G'),
  (44, 'Progen', 'Ingénierie de course', 'LEGENDAIRE', '#e7e7e7', '#ff6a00', 'tight', 'PR'),
  (45, 'Överflöd', 'Hypercars suédoises', 'LEGENDAIRE', '#1c1c1c', '#c8a2ff', 'oswald', 'Ö'),
  (46, 'Ocelot', 'Élégance britannique', 'LEGENDAIRE', '#0f6b3f', '#e0c27a', 'serif', 'O'),
  -- Mythiques
  (47, 'Pegassi', 'Supercars de légende', 'MYTHIQUE', '#f5b301', '#1a1a1a', 'oswald', 'P'),
  (48, 'Truffade', 'Hypercars d''exception', 'MYTHIQUE', '#2a5bd7', '#e6e6e6', 'serif-italic', 'T'),
  -- Secrètes (hors album)
  (49, 'Pegassi Diamant', 'Édition Diamant · 1 sur 1', 'SECRETE', '#e0fbfc', '#5eead4', 'oswald', 'P'),
  (50, 'Truffade Diamant', 'Édition Diamant · 1 sur 1', 'SECRETE', '#e0fbfc', '#93c5fd', 'serif-italic', 'T'),
  (51, 'Grotti Diamant', 'Édition Diamant · 1 sur 1', 'SECRETE', '#e0fbfc', '#fda4af', 'serif-italic', 'G')
) as v(ord, name, tagline, rarity, color, color2, font, emblem)
where not exists (select 1 from public.collection_cards where set_id = 'autos');

insert into public.collection_cards (set_id, number, name, tagline, rarity, color, color2, font, emblem)
select 'mode', row_number() over (order by ord), name, tagline, rarity, color, color2, font, emblem
from (values
  -- Communes
  (1, 'Binco', 'Les bonnes affaires', 'COMMUNE', '#e63946', '#f1faee', 'luckiest', 'B'),
  (2, 'Discount Store', 'Petits prix', 'COMMUNE', '#ffd60a', '#003566', 'lilita', 'DS'),
  (3, 'Sub Urban', 'Mode urbaine', 'COMMUNE', '#ff4d00', '#111111', 'tight-italic', 'SU'),
  (4, 'Hinterland', 'Plein air', 'COMMUNE', '#386641', '#f2e8cf', 'rye', 'H'),
  (5, 'Yeti', 'Tenues de montagne', 'COMMUNE', '#48cae4', '#ffffff', 'luckiest', 'Y'),
  (6, 'Heat', 'Sportswear', 'COMMUNE', '#f72585', '#ffffff', 'oswald', 'H'),
  (7, 'Prolaps', 'Sport & football', 'COMMUNE', '#ff9f1c', '#2b2d42', 'tight-italic', 'P'),
  -- Rares
  (8, 'Squash', 'Streetwear', 'RARE', '#fb5607', '#ffffff', 'lilita', 'S'),
  (9, 'Manor', 'Prêt-à-porter', 'RARE', '#582f0e', '#ffe8d6', 'serif', 'M'),
  (10, 'Broker', 'Streetwear urbain', 'RARE', '#2d6a4f', '#ffffff', 'oswald', 'B'),
  (11, 'Ponsonbys', 'Grand magasin de luxe', 'RARE', '#240046', '#e9d8a6', 'serif-italic', 'P'),
  (12, 'Dix', 'Bijoux', 'RARE', '#c9ada7', '#22223b', 'serif', 'DIX'),
  (13, 'Crevis', 'Montres', 'RARE', '#6c757d', '#f8f9fa', 'mono', 'C'),
  (14, 'Pendulus', 'Montres de sport', 'RARE', '#1d3557', '#a8dadc', 'tight', 'P'),
  -- Épiques
  (15, 'Sessanta Nove', 'Mode de créateur', 'EPIQUE', '#111111', '#ffffff', 'oswald', '69'),
  (16, 'Le Chien', 'Chic parisien', 'EPIQUE', '#e5383b', '#0b090a', 'serif-italic', 'LC'),
  (17, 'Bigness', 'Streetwear de luxe', 'EPIQUE', '#ff006e', '#ffbe0b', 'luckiest', 'B'),
  (18, 'Blagueurs', 'Streetwear parisien', 'EPIQUE', '#3a86ff', '#ffffff', 'tight-italic', 'BL'),
  (19, 'Kronos', 'Haute horlogerie', 'EPIQUE', '#bfa181', '#1e1e1e', 'serif', 'K'),
  -- Légendaires
  (20, 'Perseus', 'Sur-mesure', 'LEGENDAIRE', '#0d1b2a', '#e0e1dd', 'serif', 'P'),
  (21, 'Güffy', 'Maison de luxe', 'LEGENDAIRE', '#1b4332', '#b7e4c7', 'serif-italic', 'G'),
  (22, 'Santo Capra', 'Couture italienne', 'LEGENDAIRE', '#3c096c', '#e0aaff', 'serif', 'SC'),
  (23, 'Vangelico', 'Haute joaillerie', 'LEGENDAIRE', '#caa73a', '#1b1b1b', 'serif-italic', 'V'),
  -- Mythiques
  (24, 'Didier Sachs', 'Haute couture', 'MYTHIQUE', '#111111', '#d4af37', 'serif-italic', 'DS'),
  (25, 'Enema', 'Luxe italien', 'MYTHIQUE', '#8b0000', '#f5f5f5', 'serif', 'E'),
  -- Secrètes (hors album)
  (26, 'Didier Sachs Diamant', 'Couture Diamant · 1 sur 1', 'SECRETE', '#e0fbfc', '#d4af37', 'serif-italic', 'DS'),
  (27, 'Enema Pièce Unique', 'Défilé privé · 1 sur 1', 'SECRETE', '#e0fbfc', '#fca5a5', 'serif', 'E'),
  (28, 'The Diamond Collector', 'Édition collector du casino', 'SECRETE', '#e0fbfc', '#c4b5fd', 'oswald', 'TD')
) as v(ord, name, tagline, rarity, color, color2, font, emblem)
where not exists (select 1 from public.collection_cards where set_id = 'mode');

select public.collection_refresh_stats(null);

-- Deux lots « booster » sur la roue (si elle reste rentable et a de la place)
do $$
declare
  v_segs jsonb;
  v_new jsonb;
  v_cfg jsonb := public.games_config()->'wheel';
begin
  select value into v_segs from public.casino_settings where key = 'wheel_segments';
  if v_segs is null or jsonb_typeof(v_segs) <> 'array' or jsonb_array_length(v_segs) > 22
     or exists (select 1 from jsonb_array_elements(v_segs) e where e->>'type' = 'pack') then
    return;
  end if;
  v_new := v_segs || jsonb_build_array(
    jsonb_build_object('id', jsonb_array_length(v_segs), 'label', 'BOOSTER AUTOS', 'type', 'pack',
                       'value', 'Booster Marques automobiles', 'dropRate', 2, 'color', '#8a6a1f',
                       'textColor', '#ffffff', 'icon', '🃏', 'packSet', 'autos'),
    jsonb_build_object('id', jsonb_array_length(v_segs) + 1, 'label', 'BOOSTER MODE', 'type', 'pack',
                       'value', 'Booster Marques de mode', 'dropRate', 2, 'color', '#86198f',
                       'textColor', '#ffffff', 'icon', '🃏', 'packSet', 'mode'));
  if public.wheel_ev(v_new) * 100 <= (v_cfg->>'spinPrice')::numeric * (v_cfg->>'maxRtp')::numeric then
    update public.casino_settings set value = v_new, updated_at = now() where key = 'wheel_segments';
  end if;
end;
$$;

-- --------------------------------------------------------------------
-- 8. Droits
-- --------------------------------------------------------------------
revoke execute on function public.collection_pool(public.collection_sets) from public, anon, authenticated;
revoke execute on function public.collection_draw(jsonb) from public, anon, authenticated;
revoke execute on function public.collection_compute_stats(public.collection_sets) from public, anon, authenticated;
revoke execute on function public.collection_refresh_stats(text) from public, anon, authenticated;
revoke execute on function public.collection_set_ok(public.collection_sets) from public, anon, authenticated;
revoke execute on function public.assert_collections_profitable(text) from public, anon, authenticated;
revoke execute on function public.collection_card_json(public.collection_cards, boolean) from public, anon, authenticated;

revoke execute on function public.collection_catalog() from public;
grant execute on function public.collection_catalog() to anon, authenticated;
revoke execute on function public.my_collections() from public, anon, authenticated;
grant execute on function public.my_collections() to authenticated;
revoke execute on function public.open_collection_pack(text, uuid) from public, anon, authenticated;
grant execute on function public.open_collection_pack(text, uuid) to authenticated;
revoke execute on function public.sell_collection_cards(jsonb) from public, anon, authenticated;
grant execute on function public.sell_collection_cards(jsonb) to authenticated;

revoke execute on function public.admin_collection_catalog() from public, anon, authenticated;
grant execute on function public.admin_collection_catalog() to authenticated;
revoke execute on function public.admin_save_collection_set(jsonb) from public, anon, authenticated;
grant execute on function public.admin_save_collection_set(jsonb) to authenticated;
revoke execute on function public.admin_save_collection_card(jsonb) from public, anon, authenticated;
grant execute on function public.admin_save_collection_card(jsonb) to authenticated;
revoke execute on function public.admin_delete_collection_card(uuid) from public, anon, authenticated;
grant execute on function public.admin_delete_collection_card(uuid) to authenticated;
revoke execute on function public.admin_save_collection_rarities(jsonb) from public, anon, authenticated;
grant execute on function public.admin_save_collection_rarities(jsonb) to authenticated;
revoke execute on function public.admin_grant_collection_pack(uuid, text, integer, text) from public, anon, authenticated;
grant execute on function public.admin_grant_collection_pack(uuid, text, integer, text) to authenticated;

-- --------------------------------------------------------------------
-- 9. Fin des boosters véhicules
-- --------------------------------------------------------------------
-- Le jeu « Boosters véhicules » est retiré au profit des collections. Le
-- système véhicules reste (catalogue, concession, lots de la roue, revente) ;
-- les tables booster_* sont gardées pour l'historique et les lots déjà gagnés.
update public.casino_settings
set value = public.normalize_games_config(jsonb_set(value, '{boosters,enabled}', 'false'::jsonb)), updated_at = now()
where key = 'games_config';
update public.booster_packs set active = false, updated_at = now() where active;
