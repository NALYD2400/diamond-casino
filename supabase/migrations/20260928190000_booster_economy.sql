-- ====================================================================
-- BOOSTERS — économie : le casino doit toujours être gagnant
-- ====================================================================
-- * games_config.boosters.maxRtp : retour joueur maximum (en %, 90 par défaut).
--   Valeur moyenne des véhicules d'un booster ≤ prix × maxRtp (1 jeton = 1 $).
-- * La valeur moyenne (EV) est calculée par le serveur, garantie comprise.
-- * Un booster perdant ne peut pas être mis en vente, est caché aux joueurs
--   et ne peut pas être ouvert (même si une carte change de valeur après coup).
-- * bets_history enregistre désormais la valeur des véhicules donnés, pour
--   que les statistiques montrent le vrai bénéfice.
-- * Création en masse : les véhicules sans prix réel (0 $ / 100 $) sont exclus.
-- ====================================================================

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
    'enabled', public.jbool(b, 'enabled', true),
    'maxRtp', public.jnum(b, 'maxRtp', 90, 10, 100)
  );

  return jsonb_build_object('mines', m, 'doghouse', d, 'wanted', w, 'wheel', r, 'boosters', b);
end;
$$;

update public.casino_settings
set value = public.normalize_games_config(value), updated_at = now()
where key = 'games_config';

create or replace function public.booster_max_rtp()
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((public.games_config()->'boosters'->>'maxRtp')::numeric, 90);
$$;

-- Réserve jouable, avec la valeur de chaque carte ('v')
create or replace function public.booster_pack_pool(p_pack public.booster_packs)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with pool as (
    select r.key, r.sort, (p_pack.rarity_weights->>r.key)::numeric as w,
           jsonb_agg(jsonb_build_object('id', c.id, 'w', pc.weight, 'v', coalesce(c.value_override, v.price, 0)) order by c.id) as cards,
           sum(pc.weight) as cw
    from public.booster_rarities r
    join public.booster_cards c on c.rarity = r.key and c.active
    join public.booster_pack_cards pc on pc.card_id = c.id and pc.pack_id = p_pack.id
    left join public.vehicle_catalog v on v.model = c.vehicle_model
    where jsonb_typeof(p_pack.rarity_weights->r.key) = 'number'
      and (p_pack.rarity_weights->>r.key)::numeric > 0
    group by r.key, r.sort
  )
  select jsonb_build_object(
    'n', p_pack.cards_per_pack,
    'g', (select gr.sort from public.booster_rarities gr
          where gr.key = p_pack.guaranteed_rarity
            and exists (select 1 from pool where pool.sort >= gr.sort)),
    'rarities', coalesce((select jsonb_agg(jsonb_build_object('r', key, 's', sort, 'w', w, 'cw', cw, 'cards', cards) order by sort, key) from pool), '[]')
  );
$$;

-- Valeur moyenne des véhicules d'un booster (garantie comprise)
create or replace function public.booster_pool_ev(p_pool jsonb)
returns numeric
language plpgsql
immutable
set search_path = ''
as $$
declare
  n int := (p_pool->>'n')::int;
  g int := (p_pool->>'g')::int;
  tw numeric := 0;
  pg numeric := 0;
  q numeric;
  ev numeric := 0;
  p numeric;
  share numeric;
  avgv numeric;
  r jsonb;
begin
  if n is null or jsonb_array_length(coalesce(p_pool->'rarities', '[]')) = 0 then
    return 0;
  end if;
  for r in select * from jsonb_array_elements(p_pool->'rarities') loop
    tw := tw + (r->>'w')::numeric;
  end loop;
  if tw <= 0 then return 0; end if;
  if g is not null then
    for r in select * from jsonb_array_elements(p_pool->'rarities') loop
      if (r->>'s')::int >= g then pg := pg + (r->>'w')::numeric / tw; end if;
    end loop;
  end if;
  q := case when pg > 0 then power(1 - pg, n - 1) else 0 end;

  for r in select * from jsonb_array_elements(p_pool->'rarities') loop
    p := (r->>'w')::numeric / tw;
    select sum((c->>'w')::numeric * (c->>'v')::numeric) / nullif(sum((c->>'w')::numeric), 0)
    into avgv from jsonb_array_elements(r->'cards') c;
    if pg > 0 then
      share := ((n - 1) * p + (1 - q) * p + q * case when (r->>'s')::int >= g then p / pg else 0 end) / n;
    else
      share := p;
    end if;
    ev := ev + share * coalesce(avgv, 0);
  end loop;
  return round(ev * n);
end;
$$;

-- Retour joueur d'un booster (en %)
create or replace function public.booster_pack_rtp(p_pack public.booster_packs)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select round(public.booster_pool_ev(public.booster_pack_pool(p_pack)) * 100 / greatest(p_pack.price, 1), 2);
$$;

-- --------------------------------------------------------------------
-- Catalogue : EV / RTP par booster ; joueurs = boosters rentables uniquement
-- --------------------------------------------------------------------
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
  v_max numeric := public.booster_max_rtp();
begin
  if p_all then
    perform public.assert_staff();
  end if;

  select coalesce(jsonb_agg(to_jsonb(r) - 'updated_at' order by r.sort, r.key), '[]') into v_rarities
  from public.booster_rarities r;

  select coalesce(jsonb_agg(
    to_jsonb(p) || jsonb_build_object(
      'ev', x.ev,
      'rtp', round(x.ev * 100 / greatest(p.price, 1), 2),
      'cards', coalesce((
        select jsonb_agg(jsonb_build_object('card_id', pc.card_id, 'weight', pc.weight))
        from public.booster_pack_cards pc
        join public.booster_cards c on c.id = pc.card_id
        where pc.pack_id = p.id and (p_all or c.active)
      ), '[]')
    ) order by p.sort_order, p.created_at), '[]') into v_packs
  from public.booster_packs p
  cross join lateral (select public.booster_pool_ev(public.booster_pack_pool(p)) as ev) x
  where p_all or (p.active and x.ev > 0 and x.ev * 100 <= p.price * v_max);

  select coalesce(jsonb_agg(public.booster_card_json(c) order by c.created_at), '[]') into v_cards
  from public.booster_cards c
  where p_all or (c.active and exists (
    select 1 from public.booster_pack_cards pc
    join public.booster_packs p on p.id = pc.pack_id
    where pc.card_id = c.id and p.active
  ));

  return jsonb_build_object('rarities', v_rarities, 'packs', v_packs, 'cards', v_cards, 'max_rtp', v_max);
end;
$$;

-- --------------------------------------------------------------------
-- Ouverture : refus d'un booster perdant ; valeur donnée dans l'historique
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
  if public.booster_pool_ev(v_pool) * 100 > v_pack.price * public.booster_max_rtp() then
    raise exception 'PACK_UNPROFITABLE' using errcode = 'P0001';
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

  -- win_amount = valeur des véhicules donnés (1 jeton = 1 $) : bénéfice réel dans les stats
  insert into public.bets_history (profile_id, game_id, bet_amount, win_amount, multiplier, result_data)
  values (v_profile.id, 'boosters', v_pack.price, v_total_value, round(v_total_value::numeric / greatest(v_pack.price, 1), 4),
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

update public.bets_history
set win_amount = coalesce((result_data->>'total_value')::bigint, 0),
    multiplier = round(coalesce((result_data->>'total_value')::numeric, 0) / greatest(bet_amount, 1), 4)
where game_id = 'boosters' and win_amount = 0;

-- --------------------------------------------------------------------
-- Enregistrement d'un booster : refus s'il est en vente et perdant
-- --------------------------------------------------------------------
do $$
declare
  v_def text := pg_get_functiondef('public.admin_save_booster_pack(jsonb)'::regprocedure);
  v_old text := $q$  insert into public.admin_logs (action, category, detail, author)
  values (case when p_pack->>'id' is null$q$;
  v_new text := $q$  -- Le casino doit rester gagnant sur tout booster mis en vente
  if exists (
    select 1 from public.booster_packs p
    where p.id = v_id and p.active
      and public.booster_pool_ev(public.booster_pack_pool(p)) * 100 > p.price * public.booster_max_rtp()
  ) then
    raise exception 'PACK_UNPROFITABLE' using errcode = 'P0001';
  end if;

  insert into public.admin_logs (action, category, detail, author)
  values (case when p_pack->>'id' is null$q$;
begin
  if position(v_old in v_def) = 0 then
    raise exception 'admin_save_booster_pack: point d''insertion introuvable';
  end if;
  execute replace(v_def, v_old, v_new);
end;
$$;

-- --------------------------------------------------------------------
-- Création en masse : jamais de véhicule sans prix réel (0 $ / 100 $)
-- --------------------------------------------------------------------
do $$
declare
  v_def text := pg_get_functiondef('public.admin_bulk_create_booster_cards(jsonb)'::regprocedure);
  v_old text := $q$      and (v_min is null or coalesce(v.price, 0) >= v_min)$q$;
  v_new text := $q$      and coalesce(v.price, 0) >= 500
      and (v_min is null or coalesce(v.price, 0) >= v_min)$q$;
begin
  if position(v_old in v_def) = 0 then
    raise exception 'admin_bulk_create_booster_cards: point d''insertion introuvable';
  end if;
  execute replace(v_def, v_old, v_new);
end;
$$;

revoke execute on function public.booster_max_rtp() from public, anon, authenticated;
revoke execute on function public.booster_pool_ev(jsonb) from public, anon, authenticated;
revoke execute on function public.booster_pack_rtp(public.booster_packs) from public, anon, authenticated;

-- --------------------------------------------------------------------
-- Véhicules vendus en concession : seuls ceux-là peuvent devenir des cartes
-- --------------------------------------------------------------------
-- Le catalogue CTG ne le précise pas : règle par défaut (vrai prix ≥ 500 $,
-- véhicule terrestre civil), corrigeable dans la console. La réimportation du
-- catalogue ne touche pas à cette colonne.
alter table public.vehicle_catalog add column if not exists in_dealership boolean;

create or replace function public.vehicle_default_dealership(p_price bigint, p_class text, p_type text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(p_price, 0) >= 500
     and coalesce(p_class, '') not in ('EMERGENCY', 'MILITARY', 'SERVICE', 'RAIL', 'INDUSTRIAL')
     and coalesce(p_type, '') in ('CAR', 'BIKE', 'BICYCLE', 'QUADBIKE');
$$;

update public.vehicle_catalog
set in_dealership = public.vehicle_default_dealership(price, class, type)
where in_dealership is null;

create or replace function public.vehicle_catalog_default_dealership()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.in_dealership is null then
    new.in_dealership := public.vehicle_default_dealership(new.price, new.class, new.type);
  end if;
  return new;
end;
$$;

drop trigger if exists vehicle_catalog_default_dealership on public.vehicle_catalog;
create trigger vehicle_catalog_default_dealership
  before insert on public.vehicle_catalog
  for each row execute function public.vehicle_catalog_default_dealership();

alter table public.vehicle_catalog alter column in_dealership set default null;

-- Console : activer / retirer des véhicules de la concession
create or replace function public.admin_set_vehicle_dealership(p_models text[], p_value boolean)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me public.profiles := public.assert_staff();
  v_count integer;
begin
  update public.vehicle_catalog set in_dealership = coalesce(p_value, false), updated_at = now()
  where model = any(p_models);
  get diagnostics v_count = row_count;
  -- Une carte dont le véhicule sort de la concession ne peut plus sortir des boosters
  if not coalesce(p_value, false) then
    update public.booster_cards set active = false, updated_at = now()
    where vehicle_model = any(p_models) and active;
  end if;
  insert into public.admin_logs (action, category, detail, author)
  values (case when p_value then 'Véhicules ajoutés à la concession' else 'Véhicules retirés de la concession' end, 'BOOSTER',
          v_count || ' véhicule(s)', coalesce(v_me.rp_first_name || ' ' || v_me.rp_last_name, 'Console Admin'));
  return v_count;
end;
$$;

-- Les cartes existantes dont le véhicule n'est pas en concession sont désactivées
update public.booster_cards c set active = false, updated_at = now()
from public.vehicle_catalog v
where v.model = c.vehicle_model and not coalesce(v.in_dealership, false) and c.active;

-- Carte : véhicule obligatoirement en concession
do $$
declare
  v_def text := pg_get_functiondef('public.admin_save_booster_card(jsonb)'::regprocedure);
  v_old text := $q$    raise exception 'VEHICLE_NOT_FOUND' using errcode = 'P0002';
  end if;$q$;
  v_new text := $q$    raise exception 'VEHICLE_NOT_FOUND' using errcode = 'P0002';
  end if;
  if not exists (select 1 from public.vehicle_catalog where model = p_card->>'vehicle_model' and in_dealership) then
    raise exception 'VEHICLE_NOT_IN_DEALERSHIP' using errcode = 'P0001';
  end if;$q$;
begin
  if position(v_old in v_def) = 0 then
    raise exception 'admin_save_booster_card: point d''insertion introuvable';
  end if;
  execute replace(v_def, v_old, v_new);
end;
$$;

-- Création en masse : concession uniquement
do $$
declare
  v_def text := pg_get_functiondef('public.admin_bulk_create_booster_cards(jsonb)'::regprocedure);
  v_old text := $q$      and coalesce(v.price, 0) >= 500$q$;
  v_new text := $q$      and coalesce(v.price, 0) >= 500
      and v.in_dealership$q$;
begin
  if position(v_old in v_def) = 0 then
    raise exception 'admin_bulk_create_booster_cards: point d''insertion introuvable';
  end if;
  execute replace(v_def, v_old, v_new);
end;
$$;

revoke execute on function public.vehicle_default_dealership(bigint, text, text) from public, anon, authenticated;
revoke execute on function public.vehicle_catalog_default_dealership() from public, anon, authenticated;
revoke execute on function public.admin_set_vehicle_dealership(text[], boolean) from public, anon, authenticated;
grant execute on function public.admin_set_vehicle_dealership(text[], boolean) to authenticated;
