-- ====================================================================
-- INVENTAIRE UNIQUE + REVENTE DES LOTS EN JETONS
-- ====================================================================
-- * Un lot (véhicule gagné à la roue ou en booster) peut être revendu contre
--   des jetons au lieu d'être réclamé en jeu : valeur × taux de reprise.
-- * Taux de reprise : games_config.boosters.sellRate (%, 90 par défaut,
--   0 = revente désactivée). Il s'applique à tous les lots véhicules.
-- * player_rewards mémorise la valeur du lot et la carte de booster d'origine.
-- ====================================================================

alter table public.player_rewards add column if not exists value bigint;
alter table public.player_rewards add column if not exists booster_card_id uuid references public.booster_cards(id) on delete set null;
alter table public.player_rewards add column if not exists sold_at timestamptz;
alter table public.player_rewards add column if not exists sold_for bigint;

alter table public.player_rewards drop constraint if exists player_rewards_status_check;
alter table public.player_rewards add constraint player_rewards_status_check
  check (status in ('IN_INVENTORY', 'CLAIMED', 'DELIVERED', 'REVOKED', 'SOLD'));

alter table public.casino_transactions drop constraint if exists casino_transactions_type_check;
alter table public.casino_transactions add constraint casino_transactions_type_check
  check (type in ('DEPOSIT', 'WITHDRAW', 'BET', 'WIN', 'WHEEL', 'VIP_REWARD', 'VIP_REQUEST', 'VIP_SUBSCRIPTION', 'ADMIN_ADJUST', 'REWARD_SALE'));

-- Lots de booster existants : carte et valeur retrouvées depuis l'ouverture
update public.player_rewards r
set booster_card_id = m.card_id, value = m.value
from (
  select distinct on (r2.id) r2.id, (e->>'card_id')::uuid as card_id, (e->>'value')::bigint as value
  from public.player_rewards r2
  join public.booster_openings o on o.profile_id = r2.profile_id and o.created_at = r2.created_at
  cross join lateral jsonb_array_elements(o.cards) e
  where r2.source = 'booster' and e->>'model' = r2.vehicle_model
) m
where r.id = m.id and r.booster_card_id is null;

update public.player_rewards r
set value = coalesce(v.price, 0)
from public.vehicle_catalog v
where r.value is null and r.kind = 'vehicle' and v.model = r.vehicle_model;

-- --------------------------------------------------------------------
-- Réglage : taux de reprise
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
    'enabled', public.jbool(b, 'enabled', true),
    'maxRtp', public.jnum(b, 'maxRtp', 90, 10, 100),
    'sellRate', public.jnum(b, 'sellRate', 90, 0, 100)
  );

  return jsonb_build_object('mines', m, 'doghouse', d, 'wanted', w, 'wheel', r, 'boosters', b);
end;
$$;

update public.casino_settings
set value = public.normalize_games_config(value), updated_at = now()
where key = 'games_config';

-- --------------------------------------------------------------------
-- open_booster : le lot mémorise sa valeur et sa carte
-- --------------------------------------------------------------------
do $$
declare
  v_def text := pg_get_functiondef('public.open_booster(uuid)'::regprocedure);
  a1 text := $q$insert into public.player_rewards (profile_id, kind, label, vehicle_model, image_url, source, note)$q$;
  b1 text := $q$insert into public.player_rewards (profile_id, kind, label, vehicle_model, image_url, source, note, value, booster_card_id)$q$;
  a2 text := $q$      'Booster ' || v_pack.name
    )$q$;
  b2 text := $q$      'Booster ' || v_pack.name,
      coalesce((v_card_json->>'value')::bigint, 0),
      v_card.id
    )$q$;
begin
  if position(a1 in v_def) = 0 or position(a2 in v_def) = 0 then
    raise exception 'open_booster: point d''insertion introuvable';
  end if;
  execute replace(replace(v_def, a1, b1), a2, b2);
end;
$$;

-- --------------------------------------------------------------------
-- Revente
-- --------------------------------------------------------------------
create or replace function public.sell_rewards(p_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_rate numeric := coalesce((public.games_config()->'boosters'->>'sellRate')::numeric, 90);
  v_profile public.profiles;
  v_total bigint := 0;
  v_count int := 0;
  rec record;
  v_price bigint;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED' using errcode = '28000';
  end if;
  if coalesce(((select value from public.casino_settings where key = 'economy_config')->>'maintenanceMode')::boolean, false) then
    raise exception 'MAINTENANCE' using errcode = 'P0001';
  end if;
  if v_rate <= 0 then
    raise exception 'SELL_DISABLED' using errcode = 'P0001';
  end if;
  if p_ids is null or cardinality(p_ids) = 0 or cardinality(p_ids) > 500 then
    raise exception 'NOTHING_TO_SELL' using errcode = 'P0001';
  end if;

  select * into v_profile from public.profiles where user_id = v_uid for update;
  if v_profile.id is null then
    raise exception 'PROFILE_REQUIRED' using errcode = 'P0002';
  end if;

  for rec in
    select r.id, coalesce(r.value, v.price, 0) as value
    from public.player_rewards r
    left join public.vehicle_catalog v on v.model = r.vehicle_model
    where r.id = any(p_ids) and r.profile_id = v_profile.id and r.status = 'IN_INVENTORY' and r.kind = 'vehicle'
    for update of r
  loop
    v_price := floor(rec.value * v_rate / 100);
    if v_price <= 0 then continue; end if;
    update public.player_rewards
    set status = 'SOLD', sold_at = now(), sold_for = v_price, handled_at = now(), handled_by = 'Revente automatique'
    where id = rec.id;
    v_total := v_total + v_price;
    v_count := v_count + 1;
  end loop;

  if v_count = 0 then
    raise exception 'NOTHING_TO_SELL' using errcode = 'P0001';
  end if;

  update public.profiles set chips = chips + v_total where id = v_profile.id returning * into v_profile;

  insert into public.casino_transactions (profile_id, type, amount, chips, game, description, status)
  values (v_profile.id, 'REWARD_SALE', 0, v_total, 'inventory',
          'Revente de ' || v_count || ' lot(s) à ' || v_rate || ' % de leur valeur', 'COMPLETED');

  return jsonb_build_object('sold', v_count, 'chips', v_total, 'profile', public.profile_payload(v_profile));
end;
$$;

-- --------------------------------------------------------------------
-- Inventaire complet du joueur (lots + carte + véhicule + prix de reprise)
-- --------------------------------------------------------------------
create or replace function public.my_inventory()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_profile_id uuid;
  v_rate numeric := coalesce((public.games_config()->'boosters'->>'sellRate')::numeric, 90);
  v_items jsonb;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED' using errcode = '28000';
  end if;
  select id into v_profile_id from public.profiles where user_id = v_uid;
  if v_profile_id is null then
    raise exception 'PROFILE_REQUIRED' using errcode = 'P0002';
  end if;

  select coalesce(jsonb_agg(
    to_jsonb(r) || jsonb_build_object(
      'value', coalesce(r.value, v.price, 0),
      'sell_value', case when r.kind = 'vehicle' and v_rate > 0 then floor(coalesce(r.value, v.price, 0) * v_rate / 100) else 0 end,
      'card', case when c.id is not null then public.booster_card_json(c) end,
      'vehicle', case when v.model is not null then jsonb_build_object(
        'model', v.model, 'manufacturer', v.manufacturer, 'class', v.class, 'type', v.type, 'seats', v.seats,
        'price', v.price, 'photo_url', v.photo_url, 'photo_full_url', v.photo_full_url) end
    ) order by r.created_at desc), '[]')
  into v_items
  from (select * from public.player_rewards where profile_id = v_profile_id order by created_at desc limit 1000) r
  left join public.vehicle_catalog v on v.model = r.vehicle_model
  left join public.booster_cards c on c.id = r.booster_card_id;

  return jsonb_build_object('items', v_items, 'sell_rate', v_rate);
end;
$$;

revoke execute on function public.sell_rewards(uuid[]) from public, anon, authenticated;
grant execute on function public.sell_rewards(uuid[]) to authenticated;
revoke execute on function public.my_inventory() from public, anon, authenticated;
grant execute on function public.my_inventory() to authenticated;

-- --------------------------------------------------------------------
-- Un lot revendu est définitif (le joueur a été payé)
-- --------------------------------------------------------------------
create or replace function public.player_rewards_sold_lock()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status = 'SOLD' and new.status is distinct from 'SOLD' then
    raise exception 'REWARD_SOLD' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists player_rewards_sold_lock on public.player_rewards;
create trigger player_rewards_sold_lock
  before update on public.player_rewards
  for each row execute function public.player_rewards_sold_lock();

revoke execute on function public.player_rewards_sold_lock() from public, anon, authenticated;
