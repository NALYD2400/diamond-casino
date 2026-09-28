-- ====================================================================
-- INTÉGRITÉ DU CASINO — le casino doit rester gagnant, partout
-- ====================================================================
-- Audit du 2026-09-28. Corrige :
--   1. Achats de bonus : prix planchers (Dog House ≥ ×115, Wanted ≥ ×80 /
--      ×200 / ×400). En dessous, le bonus rendait jusqu'à 200 % à 1 950 %.
--   2. Roue : les véhicules comptent dans le retour joueur (valeur catalogue),
--      plafonné par games_config.wheel.maxRtp (95 % par défaut). Une roue
--      perdante ne peut ni être enregistrée ni tournée. Tirage cryptographique.
--   3. Revente : seuls les véhicules de concession (ou issus d'un booster) ont
--      une valeur de reprise. Les imports (prix catalogue non fiable) : 0.
--   4. Un lot déjà remis en jeu puis remis en inventaire n'est plus revendable
--      (sinon : voiture en ville + jetons).
--   5. Tableau de bord : reventes de lots comptées ; la roue enregistre la
--      valeur des véhicules donnés (comme les boosters).
--   6. total_won de la roue = gain net (comme les autres jeux).
--   7. Staff : impossible de se créditer soi-même (solde, VIP, lot), sauf
--      FONDATEUR.
--   8. VIP : dotation ≤ prix ; pas de rétrogradation involontaire ; achat
--      refusé pendant la maintenance.
-- ====================================================================

-- --------------------------------------------------------------------
-- 1 + 2. Réglages des jeux : planchers d'achat de bonus + maxRtp de la roue
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

  -- Le bonus Dog House vaut ≈ ×109 la mise : en dessous de ×115 le casino perd
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

  -- Bonus Wanted : ≈ ×77 / ×196 / ×392 la mise
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

  return jsonb_build_object('mines', m, 'doghouse', d, 'wanted', w, 'wheel', r, 'boosters', b);
end;
$$;

update public.casino_settings
set value = public.normalize_games_config(value), updated_at = now()
where key = 'games_config';

-- --------------------------------------------------------------------
-- 8. VIP : la dotation ne peut pas dépasser le prix de la carte
-- --------------------------------------------------------------------
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
  v_ps numeric := public.jnum(s, 'price', 25000, 0, 100000000);
  v_pg numeric := public.jnum(g, 'price', 75000, 0, 100000000);
  v_pd numeric := public.jnum(dd, 'price', 180000, 0, 100000000);
begin
  return jsonb_build_object(
    'durationDays', public.jnum(p, 'durationDays', 30, 1, 365),
    'SILVER', jsonb_build_object(
      'price', v_ps,
      'bonus', least(public.jnum(s, 'bonus', 15000, 0, 100000000), v_ps),
      'wheelCooldownHours', public.jnum(s, 'wheelCooldownHours', 24, 1, 168)),
    'GOLD', jsonb_build_object(
      'price', v_pg,
      'bonus', least(public.jnum(g, 'bonus', 60000, 0, 100000000), v_pg),
      'wheelCooldownHours', public.jnum(g, 'wheelCooldownHours', 12, 1, 168)),
    'DIAMOND', jsonb_build_object(
      'price', v_pd,
      'bonus', least(public.jnum(dd, 'bonus', 150000, 0, 100000000), v_pd),
      'wheelCooldownHours', public.jnum(dd, 'wheelCooldownHours', 8, 1, 168))
  );
end;
$$;

update public.casino_settings
set value = public.normalize_vip_config(value), updated_at = now()
where key = 'vip_config';

-- --------------------------------------------------------------------
-- 2. Roue : valeur moyenne d'un tour (jetons + valeur catalogue des véhicules)
-- --------------------------------------------------------------------
-- Tous les véhicules comptent à leur prix catalogue, imports compris : le
-- casino doit les livrer en ville, même s'ils ne sont pas revendables.
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
                   else 0 end)
         ), 0)
  from s, t;
$$;

-- Garde-fou : refuse une roue ouverte dont le retour dépasse maxRtp
create or replace function public.assert_wheel_profitable()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_cfg jsonb := public.games_config()->'wheel';
  v_ev numeric := public.wheel_ev((select value from public.casino_settings where key = 'wheel_segments'));
begin
  if coalesce((v_cfg->>'enabled')::boolean, false)
     and v_ev * 100 > (v_cfg->>'spinPrice')::numeric * (v_cfg->>'maxRtp')::numeric then
    raise exception 'WHEEL_UNPROFITABLE' using errcode = 'P0001';
  end if;
end;
$$;

-- --------------------------------------------------------------------
-- admin_set_setting : segments enrichis (valeur véhicule, affichage console)
-- + contrôle de rentabilité de la roue quand elle change
-- --------------------------------------------------------------------
do $$
declare
  v_def text := pg_get_functiondef('public.admin_set_setting(text, jsonb)'::regprocedure);
  a1 text := $q$          'vehicleModel', case when v_type = 'vehicle' then nullif(left(coalesce(v_seg->>'vehicleModel', ''), 64), '') end,$q$;
  b1 text := $q$          'vehicleModel', case when v_type = 'vehicle' then nullif(left(coalesce(v_seg->>'vehicleModel', ''), 64), '') end,
          'vehicleValue', case when v_type = 'vehicle' then (select v.price from public.vehicle_catalog v where v.model = v_seg->>'vehicleModel') end,$q$;
  a2 text := $q$  insert into public.admin_logs (action, category, detail, author)
  values ('Réglage modifié',$q$;
  b2 text := $q$  -- La roue doit rester gagnante (véhicules compris)
  if p_key = 'wheel_segments'
     or (p_key = 'games_config' and v_value->'wheel' is distinct from public.normalize_games_config(v_old)->'wheel') then
    perform public.assert_wheel_profitable();
  end if;

  insert into public.admin_logs (action, category, detail, author)
  values ('Réglage modifié',$q$;
  a3 text := $q$  case p_key
    when 'games_config' then$q$;
  b3 text := $q$  select value into v_old from public.casino_settings where key = p_key;

  case p_key
    when 'games_config' then$q$;
  a4 text := $q$  v_detail text;
begin$q$;
  b4 text := $q$  v_detail text;
  v_old jsonb;
begin$q$;
begin
  if position(a1 in v_def) = 0 or position(a2 in v_def) = 0 or position(a3 in v_def) = 0 or position(a4 in v_def) = 0 then
    raise exception 'admin_set_setting: point d''insertion introuvable';
  end if;
  execute replace(replace(replace(replace(v_def, a1, b1), a2, b2), a3, b3), a4, b4);
end;
$$;

-- Segments déjà enregistrés : ajout de la valeur véhicule (affichage)
update public.casino_settings s
set value = (
  select coalesce(jsonb_agg(
    case when e->>'type' = 'vehicle'
         then e || jsonb_strip_nulls(jsonb_build_object('vehicleValue', (select v.price from public.vehicle_catalog v where v.model = e->>'vehicleModel')))
         else e end order by ord), '[]')
  from jsonb_array_elements(s.value) with ordinality x(e, ord)
), updated_at = now()
where s.key = 'wheel_segments' and jsonb_typeof(s.value) = 'array';

-- --------------------------------------------------------------------
-- 3 + 4. Revente : concession uniquement, lots « déjà livrés » exclus
-- --------------------------------------------------------------------
alter table public.player_rewards add column if not exists no_resale boolean not null default false;

-- Valeur de reprise unitaire (avant taux) d'un lot
create or replace function public.reward_resale_base(r public.player_rewards)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when r.kind <> 'vehicle' or r.no_resale then 0
    when r.source = 'booster' then coalesce(r.value, 0)
    else coalesce((select case when v.in_dealership then coalesce(r.value, v.price, 0) else 0 end
                   from public.vehicle_catalog v where v.model = r.vehicle_model), 0)
  end;
$$;

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
  rec public.player_rewards;
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
    select r.* from public.player_rewards r
    where r.id = any(p_ids) and r.profile_id = v_profile.id and r.status = 'IN_INVENTORY' and r.kind = 'vehicle'
    for update
  loop
    v_price := floor(public.reward_resale_base(rec) * v_rate / 100);
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
      'sell_value', case when v_rate > 0 then floor(public.reward_resale_base(r) * v_rate / 100) else 0 end,
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

-- Lot livré puis remis en inventaire : plus revendable
do $$
declare
  v_def text := pg_get_functiondef('public.admin_update_reward(uuid, text, text)'::regprocedure);
  v_old text := $q$      claimed_at = case when p_status = 'IN_INVENTORY' then null else claimed_at end$q$;
  v_new text := $q$      claimed_at = case when p_status = 'IN_INVENTORY' then null else claimed_at end,
      -- Déjà remis en ville : le joueur ne doit pas pouvoir aussi le revendre
      no_resale = no_resale or (p_status = 'IN_INVENTORY' and v_old.status = 'DELIVERED')$q$;
begin
  if position(v_old in v_def) = 0 then
    raise exception 'admin_update_reward: point d''insertion introuvable';
  end if;
  execute replace(v_def, v_old, v_new);
end;
$$;

-- --------------------------------------------------------------------
-- 2 + 5 + 6. Roue : tirage cryptographique, garde-fou, valeur des véhicules
-- --------------------------------------------------------------------
create or replace function public.spin_wheel()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_cfg jsonb;
  v_price bigint;
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
  v_vehicle public.vehicle_catalog;
  v_vehicle_value bigint := 0;
  v_reward_id uuid;
  i int;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED' using errcode = '28000';
  end if;
  v_cfg := public.assert_game_open('wheel');
  v_price := greatest(coalesce((v_cfg->>'spinPrice')::numeric, 25000), 1)::bigint;
  perform public.assert_wheel_profitable();

  select * into v_profile from public.profiles where user_id = v_uid for update;
  if v_profile.id is null then
    raise exception 'PROFILE_REQUIRED' using errcode = 'P0002';
  end if;
  if v_profile.chips < v_price then
    raise exception 'INSUFFICIENT_FUNDS' using errcode = 'P0001';
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

  -- Aléa cryptographique (comme les mines et les boosters)
  if v_total <= 0 then
    v_idx := least(floor(public.booster_rand() * v_count)::int, v_count - 1);
  else
    v_rand := public.booster_rand()::numeric * v_total;
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
  set chips = chips - v_price + v_chips,
      total_wagered = coalesce(total_wagered, 0) + v_price,
      total_won = coalesce(total_won, 0) + greatest(v_chips - v_price, 0),
      total_spins = coalesce(total_spins, 0) + 1,
      last_wheel_spin = now()
  where id = v_profile.id
  returning * into v_profile;

  if v_type <> 'chips' then
    if v_type = 'vehicle' and nullif(v_seg->>'vehicleModel', '') is not null then
      select * into v_vehicle from public.vehicle_catalog where model = v_seg->>'vehicleModel';
      v_vehicle_value := coalesce(v_vehicle.price, 0);
    end if;
    insert into public.player_rewards (profile_id, kind, label, vehicle_model, image_url, source, value)
    values (v_profile.id,
            case when v_type = 'vehicle' then 'vehicle' else 'item' end,
            v_item,
            v_vehicle.model,
            coalesce(nullif(v_seg->>'imageUrl', ''), v_vehicle.photo_url),
            'wheel',
            case when v_vehicle.model is not null then v_vehicle_value end)
    returning id into v_reward_id;
  end if;

  -- win_amount = jetons + valeur des véhicules donnés : bénéfice réel dans les stats
  insert into public.bets_history (profile_id, game_id, bet_amount, win_amount, multiplier, result_data)
  values (v_profile.id, 'lucky_wheel', v_price, v_chips + v_vehicle_value,
          round((v_chips + v_vehicle_value)::numeric / v_price, 4),
          jsonb_build_object('segment_index', v_idx, 'segment', v_label, 'type', v_type, 'value', v_seg->'value',
                             'vehicle_value', v_vehicle_value));

  insert into public.casino_transactions (profile_id, type, amount, chips, game, description, status)
  values (v_profile.id, 'BET', 0, -v_price, 'lucky_wheel',
          'Roue de la Fortune : tour à ' || v_price || ' jetons', 'COMPLETED');

  insert into public.casino_transactions (profile_id, type, amount, chips, game, description, status)
  values (v_profile.id, 'WHEEL', 0, v_chips, 'lucky_wheel',
          'Roue de la Fortune : ' || v_label || case when v_type = 'chips' then '' else ' (' || v_item || ')' end,
          'COMPLETED');

  return jsonb_build_object(
    'segment_index', v_idx,
    'segment', v_seg,
    'reward_id', v_reward_id,
    'price', v_price,
    'profile', public.profile_payload(v_profile)
  );
end;
$$;

-- --------------------------------------------------------------------
-- 5. Tableau de bord : jetons versés par la revente de lots
-- --------------------------------------------------------------------
do $$
declare
  v_def text := pg_get_functiondef('public.admin_dashboard(integer)'::regprocedure);
  v_old text := $q$    'pending_rewards',$q$;
  v_new text := $q$    'reward_sales', (select coalesce(sum(chips), 0) from public.casino_transactions where type = 'REWARD_SALE' and created_at >= v_since),
    'pending_rewards',$q$;
  -- La roue est payante : elle compte dans les joueurs les plus gagnants
  v_old2 text := $q$ and b.game_id <> 'lucky_wheel'$q$;
begin
  if position(v_old in v_def) = 0 or position(v_old2 in v_def) = 0 then
    raise exception 'admin_dashboard: point d''insertion introuvable';
  end if;
  execute replace(replace(v_def, v_old, v_new), v_old2, '');
end;
$$;

-- --------------------------------------------------------------------
-- 7. Staff : pas de crédit sur son propre compte (sauf FONDATEUR)
-- --------------------------------------------------------------------
create or replace function public.assert_not_self_credit(v_me public.profiles, p_target_id uuid)
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if v_me.id = p_target_id and v_me.role <> 'FONDATEUR' then
    raise exception 'FORBIDDEN_SELF' using errcode = 'P0001';
  end if;
end;
$$;

do $$
declare
  v_def text;
  v_old text;
  v_new text;
begin
  -- Ajustement de solde
  v_def := pg_get_functiondef('public.admin_adjust_balance(uuid, bigint, bigint, text)'::regprocedure);
  v_old := $q$  perform public.assert_can_manage(v_me, v_old);$q$;
  v_new := $q$  perform public.assert_can_manage(v_me, v_old);
  perform public.assert_not_self_credit(v_me, v_old.id);$q$;
  if position(v_old in v_def) = 0 then
    raise exception 'admin_adjust_balance: point d''insertion introuvable';
  end if;
  execute replace(v_def, v_old, v_new);

  -- Fiche : solde ou VIP de soi-même
  v_def := pg_get_functiondef('public.admin_update_profile(uuid, jsonb)'::regprocedure);
  v_old := $q$  perform public.validate_rp_identity(v_first, v_last, v_cid, v_phone);$q$;
  v_new := $q$  if v_chips <> v_old.chips or v_tier is distinct from v_old.vip_tier then
    perform public.assert_not_self_credit(v_me, v_old.id);
  end if;
  perform public.validate_rp_identity(v_first, v_last, v_cid, v_phone);$q$;
  if position(v_old in v_def) = 0 then
    raise exception 'admin_update_profile: point d''insertion introuvable';
  end if;
  execute replace(v_def, v_old, v_new);

  -- VIP (et sa dotation)
  v_def := pg_get_functiondef('public.admin_set_vip(uuid, text, boolean)'::regprocedure);
  v_old := $q$  perform public.assert_can_manage(v_me, v_target);$q$;
  v_new := $q$  perform public.assert_can_manage(v_me, v_target);
  perform public.assert_not_self_credit(v_me, v_target.id);$q$;
  if position(v_old in v_def) = 0 then
    raise exception 'admin_set_vip: point d''insertion introuvable';
  end if;
  execute replace(v_def, v_old, v_new);

  -- Lot / véhicule
  v_def := pg_get_functiondef('public.admin_grant_reward(uuid, text, text, text)'::regprocedure);
  v_old := $q$    raise exception 'PROFILE_NOT_FOUND' using errcode = 'P0002';
  end if;$q$;
  v_new := $q$    raise exception 'PROFILE_NOT_FOUND' using errcode = 'P0002';
  end if;
  perform public.assert_not_self_credit(v_me, v_target.id);$q$;
  if position(v_old in v_def) = 0 then
    raise exception 'admin_grant_reward: point d''insertion introuvable';
  end if;
  execute replace(v_def, v_old, v_new);
end;
$$;

-- --------------------------------------------------------------------
-- 8. Achat VIP : maintenance + pas de rétrogradation
-- --------------------------------------------------------------------
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
  v_active text;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED' using errcode = '28000';
  end if;
  if coalesce(((select value from public.casino_settings where key = 'economy_config')->>'maintenanceMode')::boolean, false) then
    raise exception 'MAINTENANCE' using errcode = 'P0001';
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
  v_active := public.active_vip(v_profile.vip_tier, v_profile.vip_expires_at);
  if v_active = p_tier then
    raise exception 'VIP_ALREADY_ACTIVE' using errcode = 'P0001';
  end if;
  -- Une carte supérieure est encore active : l'achat la ferait perdre
  if array_position(array['SILVER', 'GOLD', 'DIAMOND'], v_active) > array_position(array['SILVER', 'GOLD', 'DIAMOND'], p_tier) then
    raise exception 'VIP_HIGHER_ACTIVE' using errcode = 'P0001';
  end if;
  if v_profile.chips < v_price then
    raise exception 'INSUFFICIENT_CHIPS' using errcode = 'P0001';
  end if;

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

-- --------------------------------------------------------------------
-- Droits
-- --------------------------------------------------------------------
revoke execute on function public.wheel_ev(jsonb) from public, anon, authenticated;
revoke execute on function public.assert_wheel_profitable() from public, anon, authenticated;
revoke execute on function public.reward_resale_base(public.player_rewards) from public, anon, authenticated;
revoke execute on function public.assert_not_self_credit(public.profiles, uuid) from public, anon, authenticated;
revoke execute on function public.sell_rewards(uuid[]) from public, anon, authenticated;
grant execute on function public.sell_rewards(uuid[]) to authenticated;
revoke execute on function public.my_inventory() from public, anon, authenticated;
grant execute on function public.my_inventory() to authenticated;
revoke execute on function public.spin_wheel() from public, anon, authenticated;
grant execute on function public.spin_wheel() to authenticated;
revoke execute on function public.buy_vip_with_chips(text) from public, anon, authenticated;
grant execute on function public.buy_vip_with_chips(text) to authenticated;
