-- ====================================================================
-- BOOSTERS — tirage partagé + simulateur de taux pour la console
-- ====================================================================
-- Le tirage est isolé dans booster_draw() : open_booster() (le vrai jeu) et
-- admin_simulate_booster() (le testeur de la console) appellent EXACTEMENT la
-- même fonction. La simulation ne touche ni aux jetons ni aux inventaires.
-- ====================================================================

-- Réserve jouable d'un booster : raretés (poids > 0 et au moins une carte
-- active) avec leurs cartes, niveau garanti et nombre de cartes par paquet.
create or replace function public.booster_pack_pool(p_pack public.booster_packs)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with pool as (
    select r.key, r.sort, (p_pack.rarity_weights->>r.key)::numeric as w,
           jsonb_agg(jsonb_build_object('id', c.id, 'w', pc.weight) order by c.id) as cards,
           sum(pc.weight) as cw
    from public.booster_rarities r
    join public.booster_cards c on c.rarity = r.key and c.active
    join public.booster_pack_cards pc on pc.card_id = c.id and pc.pack_id = p_pack.id
    where jsonb_typeof(p_pack.rarity_weights->r.key) = 'number'
      and (p_pack.rarity_weights->>r.key)::numeric > 0
    group by r.key, r.sort
  )
  select jsonb_build_object(
    'n', p_pack.cards_per_pack,
    -- Garantie ignorée si aucune carte de ce niveau ou mieux n'est jouable
    'g', (select gr.sort from public.booster_rarities gr
          where gr.key = p_pack.guaranteed_rarity
            and exists (select 1 from pool where pool.sort >= gr.sort)),
    'rarities', coalesce((select jsonb_agg(jsonb_build_object('r', key, 's', sort, 'w', w, 'cw', cw, 'cards', cards) order by sort, key) from pool), '[]')
  );
$$;

-- Tirage d'un paquet : [{id, r, s, forced}]
create or replace function public.booster_draw(p_pool jsonb)
returns jsonb
language plpgsql
volatile
set search_path = ''
as $$
declare
  rs jsonb := p_pool->'rarities';
  nr int := jsonb_array_length(p_pool->'rarities');
  n int := (p_pool->>'n')::int;
  g int := (p_pool->>'g')::int;
  best int := -1;
  out jsonb := '[]'::jsonb;
  slot int;
  i int;
  force boolean;
  total numeric;
  x double precision;
  chosen int;
  w numeric;
  cards jsonb;
  nc int;
  card_id text;
begin
  for slot in 1 .. n loop
    -- Dernière carte : rareté garantie forcée si elle n'est pas encore sortie
    force := slot = n and g is not null and best < g;

    -- 1) rareté
    total := 0;
    for i in 0 .. nr - 1 loop
      if not force or (rs->i->>'s')::int >= g then
        total := total + (rs->i->>'w')::numeric;
      end if;
    end loop;
    x := public.booster_rand() * total;
    chosen := null;
    for i in 0 .. nr - 1 loop
      if not force or (rs->i->>'s')::int >= g then
        chosen := i;
        w := (rs->i->>'w')::numeric;
        exit when x < w;
        x := x - w;
      end if;
    end loop;

    -- 2) carte de cette rareté, selon son poids
    cards := rs->chosen->'cards';
    nc := jsonb_array_length(cards);
    x := public.booster_rand() * (rs->chosen->>'cw')::numeric;
    card_id := null;
    for i in 0 .. nc - 1 loop
      card_id := cards->i->>'id';
      w := (cards->i->>'w')::numeric;
      exit when x < w;
      x := x - w;
    end loop;

    best := greatest(best, (rs->chosen->>'s')::int);
    out := out || jsonb_build_array(jsonb_build_object('id', card_id, 'r', rs->chosen->>'r', 's', (rs->chosen->>'s')::int, 'forced', force));
  end loop;
  return out;
end;
$$;

-- --------------------------------------------------------------------
-- open_booster : même comportement qu'avant, tirage via booster_draw()
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
  v_pool jsonb;
  v_draw jsonb;
  v_card public.booster_cards;
  v_card_json jsonb;
  v_total_value bigint := 0;
  v_results jsonb := '[]'::jsonb;
  v_reward_id uuid;
  d jsonb;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED' using errcode = '28000';
  end if;
  perform public.assert_game_open('boosters');

  select * into v_pack from public.booster_packs where id = p_pack_id and active;
  if v_pack.id is null then
    raise exception 'PACK_NOT_FOUND' using errcode = 'P0002';
  end if;

  v_pool := public.booster_pack_pool(v_pack);
  if jsonb_array_length(v_pool->'rarities') = 0 then
    raise exception 'PACK_EMPTY' using errcode = 'P0001';
  end if;

  select * into v_profile from public.profiles where user_id = v_uid for update;
  if v_profile.id is null then
    raise exception 'PROFILE_REQUIRED' using errcode = 'P0002';
  end if;
  if v_profile.chips < v_pack.price then
    raise exception 'INSUFFICIENT_FUNDS' using errcode = 'P0001';
  end if;

  v_draw := public.booster_draw(v_pool);

  for d in select * from jsonb_array_elements(v_draw) loop
    select * into v_card from public.booster_cards where id = (d->>'id')::uuid;
    v_card_json := public.booster_card_json(v_card);
    v_total_value := v_total_value + coalesce((v_card_json->>'value')::bigint, 0);

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
-- Simulateur (console) : N ouvertures « à blanc », résultats agrégés
-- --------------------------------------------------------------------
create or replace function public.admin_simulate_booster(p_pack_id uuid, p_count integer default 1000)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me public.profiles := public.assert_staff();
  v_pack public.booster_packs;
  v_pool jsonb;
  v_values jsonb;
  v_n int := least(greatest(coalesce(p_count, 1000), 1), 10000);
  v_ids uuid[] := '{}';
  v_pack_values bigint[] := '{}';
  v_forced int := 0;
  v_draw jsonb;
  v_sum bigint;
  v_started timestamptz := clock_timestamp();
  d jsonb;
  k int;
  v_rarities jsonb;
  v_cards jsonb;
  v_stats jsonb;
begin
  select * into v_pack from public.booster_packs where id = p_pack_id;
  if v_pack.id is null then
    raise exception 'PACK_NOT_FOUND' using errcode = 'P0002';
  end if;
  v_pool := public.booster_pack_pool(v_pack);
  if jsonb_array_length(v_pool->'rarities') = 0 then
    raise exception 'PACK_EMPTY' using errcode = 'P0001';
  end if;

  select coalesce(jsonb_object_agg(c.id, coalesce(c.value_override, v.price, 0)), '{}') into v_values
  from public.booster_cards c
  left join public.vehicle_catalog v on v.model = c.vehicle_model
  where c.id in (select (e->>'id')::uuid from jsonb_array_elements(v_pool->'rarities') r, jsonb_array_elements(r->'cards') e);

  for k in 1 .. v_n loop
    v_draw := public.booster_draw(v_pool);
    v_sum := 0;
    for d in select * from jsonb_array_elements(v_draw) loop
      v_ids := array_append(v_ids, (d->>'id')::uuid);
      v_sum := v_sum + coalesce((v_values->>(d->>'id'))::bigint, 0);
      if (d->>'forced')::boolean then v_forced := v_forced + 1; end if;
    end loop;
    v_pack_values := array_append(v_pack_values, v_sum);
  end loop;

  select coalesce(jsonb_agg(jsonb_build_object('rarity', rarity, 'count', cnt) order by rarity), '[]') into v_rarities
  from (select c.rarity, count(*) cnt from unnest(v_ids) u(id) join public.booster_cards c on c.id = u.id group by c.rarity) t;

  select coalesce(jsonb_agg(jsonb_build_object('card_id', id, 'count', cnt) order by cnt desc), '[]') into v_cards
  from (select id, count(*) cnt from unnest(v_ids) u(id) group by id) t;

  select jsonb_build_object(
    'avg', round(avg(v)), 'min', min(v), 'max', max(v),
    'p50', percentile_disc(0.5) within group (order by v),
    'p90', percentile_disc(0.9) within group (order by v),
    'p99', percentile_disc(0.99) within group (order by v)
  ) into v_stats
  from unnest(v_pack_values) u(v);

  return jsonb_build_object(
    'pack_id', v_pack.id,
    'packs', v_n,
    'cards_drawn', cardinality(v_ids),
    'forced', v_forced,
    'rarities', v_rarities,
    'cards', v_cards,
    'value', v_stats,
    'price', v_pack.price,
    'ms', round(extract(epoch from clock_timestamp() - v_started) * 1000)
  );
end;
$$;

revoke execute on function public.booster_pack_pool(public.booster_packs) from public, anon, authenticated;
revoke execute on function public.booster_draw(jsonb) from public, anon, authenticated;
revoke execute on function public.admin_simulate_booster(uuid, integer) from public, anon, authenticated;
grant execute on function public.admin_simulate_booster(uuid, integer) to authenticated;
