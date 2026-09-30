-- ====================================================================
-- COLLECTIONS — revente des doublons en % de la valeur, bonus VIP
-- ====================================================================
-- * collection_rarities.sell_value devient la VALEUR d'une carte.
-- * Revente = valeur × taux : 70 % par défaut, +5 pts pour GOLD, +10 pts pour
--   DIAMOND (games_config.collections.sellRate / sellBonusGold / sellBonusDiamond,
--   sellBonusSilver pour SILVER, 0 par défaut).
-- * Seuls les doublons se revendent, cartes secrètes comprises : le premier
--   exemplaire de chaque carte reste dans l'album.
-- * La rentabilité est vérifiée au taux le plus élevé (le meilleur VIP), et
--   à chaque modification de ces réglages.
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
  c jsonb := coalesce(p->'crash', '{}');
  k jsonb := coalesce(p->'collections', '{}');
  wp jsonb := coalesce(w->'buyPrices', '{}');
  v_min numeric;
  v_rate numeric;
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

  -- Taux de revente : le taux + bonus VIP ne dépasse jamais 100 %
  v_rate := public.jnum(k, 'sellRate', 70, 0, 100);
  k := jsonb_build_object(
    'enabled', public.jbool(k, 'enabled', true),
    'maxRtp', public.jnum(k, 'maxRtp', 90, 10, 100),
    'packMaxRtp', public.jnum(k, 'packMaxRtp', 60, 0, 100),
    'sellRate', v_rate,
    'sellBonusSilver', public.jnum(k, 'sellBonusSilver', 0, 0, 100 - v_rate),
    'sellBonusGold', public.jnum(k, 'sellBonusGold', 5, 0, 100 - v_rate),
    'sellBonusDiamond', public.jnum(k, 'sellBonusDiamond', 10, 0, 100 - v_rate)
  );

  return jsonb_build_object('mines', m, 'doghouse', d, 'wanted', w, 'wheel', r, 'boosters', b, 'crash', c, 'collections', k);
end;
$$;

update public.casino_settings
set value = public.normalize_games_config(value), updated_at = now()
where key = 'games_config';

-- Taux de revente (%) d'un joueur selon sa carte VIP active ; null = taux maximum (garde-fou)
create or replace function public.collection_sell_rate(p_tier text)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select (k->>'sellRate')::numeric + case
           when p_tier is null then 0
           when p_tier = 'MAX' then greatest((k->>'sellBonusSilver')::numeric, (k->>'sellBonusGold')::numeric, (k->>'sellBonusDiamond')::numeric)
           when p_tier = 'SILVER' then (k->>'sellBonusSilver')::numeric
           when p_tier = 'GOLD' then (k->>'sellBonusGold')::numeric
           when p_tier = 'DIAMOND' then (k->>'sellBonusDiamond')::numeric
           else 0 end
  from (select public.games_config()->'collections' as k) x;
$$;

-- Valeur des cartes (revendues à 70 % : 700 / 1 400 / 4 900 / 14 000 / 56 000 / 140 000)
update public.collection_rarities set sell_value = v.val, updated_at = now()
from (values ('COMMUNE', 1000), ('RARE', 2000), ('EPIQUE', 7000), ('LEGENDAIRE', 20000), ('MYTHIQUE', 80000), ('SECRETE', 200000)) as v(key, val)
where collection_rarities.key = v.key;

-- --------------------------------------------------------------------
-- Économie : revente comptée au taux maximum (meilleur VIP)
-- --------------------------------------------------------------------
do $$
declare
  v_def text := pg_get_functiondef('public.collection_compute_stats(public.collection_sets)'::regprocedure);
  a1 text := $q$  v_pack_ev := round(v_sell_rate * n);$q$;
  b1 text := $q$  -- Revente = valeur × taux ; on compte le taux du meilleur VIP (cas le plus cher pour le casino)
  v_sell_rate := v_sell_rate * public.collection_sell_rate('MAX') / 100;
  v_keep := v_keep * public.collection_sell_rate('MAX') / 100;
  v_pack_ev := round(v_sell_rate * n);$q$;
begin
  if position(a1 in v_def) = 0 then
    raise exception 'collection_compute_stats: point d''insertion introuvable';
  end if;
  execute replace(v_def, a1, b1);
end;
$$;

-- --------------------------------------------------------------------
-- Revente : doublons uniquement, au taux du joueur
-- --------------------------------------------------------------------
create or replace function public.sell_collection_cards(p_items jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_profile public.profiles;
  v_rate numeric;
  e jsonb;
  v_qty int;
  v_owned public.collection_owned;
  v_value bigint;
  v_price bigint;
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
  v_rate := public.collection_sell_rate(public.active_vip(v_profile.vip_tier, v_profile.vip_expires_at));
  if v_rate <= 0 then
    raise exception 'SELL_DISABLED' using errcode = 'P0001';
  end if;

  for e in select * from jsonb_array_elements(p_items) loop
    if jsonb_typeof(e->'qty') <> 'number' or (e->>'qty')::numeric < 1 then continue; end if;
    select o.* into v_owned from public.collection_owned o
    where o.profile_id = v_profile.id and o.card_id = (e->>'card_id')::uuid
    for update;
    if v_owned.card_id is null then continue; end if;
    select r.sell_value into v_value
    from public.collection_cards c join public.collection_rarities r on r.key = c.rarity
    where c.id = v_owned.card_id;
    -- Le premier exemplaire reste toujours dans l'album
    v_qty := least(floor((e->>'qty')::numeric)::int, v_owned.count - 1);
    v_price := floor(coalesce(v_value, 0) * v_rate / 100);
    if v_qty <= 0 or v_price <= 0 then continue; end if;
    update public.collection_owned set count = count - v_qty
    where profile_id = v_profile.id and card_id = v_owned.card_id;
    v_total := v_total + v_qty * v_price;
    v_count := v_count + v_qty;
  end loop;

  if v_count = 0 then
    raise exception 'NOTHING_TO_SELL' using errcode = 'P0001';
  end if;

  update public.profiles set chips = chips + v_total where id = v_profile.id returning * into v_profile;

  insert into public.casino_transactions (profile_id, type, amount, chips, game, description, status)
  values (v_profile.id, 'REWARD_SALE', 0, v_total, 'collections',
          'Revente de ' || v_count || ' doublon(s) de collection à ' || v_rate || ' % de leur valeur', 'COMPLETED');

  return jsonb_build_object('sold', v_count, 'chips', v_total, 'rate', v_rate, 'profile', public.profile_payload(v_profile));
end;
$$;

-- Albums du joueur : + son taux de revente
do $$
declare
  v_def text := pg_get_functiondef('public.my_collections()'::regprocedure);
  a1 text := $q$    'openings', (select count(*) from public.collection_openings where profile_id = v_profile_id)$q$;
  b1 text := $q$    'openings', (select count(*) from public.collection_openings where profile_id = v_profile_id),
    'sell_rate', (select public.collection_sell_rate(public.active_vip(p.vip_tier, p.vip_expires_at))
                  from public.profiles p where p.id = v_profile_id)$q$;
begin
  if position(a1 in v_def) = 0 then
    raise exception 'my_collections: point d''insertion introuvable';
  end if;
  execute replace(v_def, a1, b1);
end;
$$;

-- Réglages des jeux : une modification des taux de revente doit garder les albums gagnants
do $$
declare
  v_def text := pg_get_functiondef('public.admin_set_setting(text, jsonb)'::regprocedure);
  a1 text := $q$    perform public.assert_wheel_profitable();
  end if;$q$;
  b1 text := $q$    perform public.assert_wheel_profitable();
  end if;
  if p_key = 'games_config'
     and v_value->'collections' is distinct from public.normalize_games_config(v_old)->'collections' then
    perform public.assert_collections_profitable(null);
  end if;$q$;
begin
  if position(a1 in v_def) = 0 then
    raise exception 'admin_set_setting: point d''insertion introuvable';
  end if;
  execute replace(v_def, a1, b1);
end;
$$;

select public.assert_collections_profitable(null);

revoke execute on function public.collection_sell_rate(text) from public, anon, authenticated;
