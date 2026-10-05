-- ====================================================================
-- PRIX D'UN VÉHICULE → ROUE
-- ====================================================================
-- La roue garde une copie de la valeur des véhicules : vehicleValue dans
-- chaque lot « véhicule » (wheel_segments) et value du véhicule podium
-- (podium_vehicle). Corriger le prix dans le catalogue ne les touchait pas :
-- la page de la roue affichait l'ancien prix (ex. 35 000 au lieu de
-- 15 000 000) alors que le garde-fou serveur utilisait déjà le bon.
-- * admin_set_vehicle_price resynchronise maintenant ces deux copies.
-- * Rattrapage : toutes les copies existantes reprennent le prix catalogue.
-- ====================================================================

create or replace function public.sync_wheel_vehicle_values(p_model text default null)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.casino_settings s
  set value = (
        select jsonb_agg(
                 case when t.e->>'type' = 'vehicle' and (p_model is null or t.e->>'vehicleModel' = p_model)
                           and exists (select 1 from public.vehicle_catalog v where v.model = t.e->>'vehicleModel')
                      then jsonb_set(t.e, '{vehicleValue}',
                                     to_jsonb((select coalesce(v.price, 0) from public.vehicle_catalog v where v.model = t.e->>'vehicleModel')))
                      else t.e end
                 order by t.o)
        from jsonb_array_elements(s.value) with ordinality as t(e, o)),
      updated_at = now()
  where s.key = 'wheel_segments'
    and jsonb_typeof(s.value) = 'array'
    and exists (select 1 from jsonb_array_elements(s.value) e
                where e->>'type' = 'vehicle' and (p_model is null or e->>'vehicleModel' = p_model));

  update public.casino_settings s
  set value = jsonb_set(s.value, '{value}', to_jsonb((select coalesce(v.price, 0) from public.vehicle_catalog v where v.model = s.value->>'model'))),
      updated_at = now()
  where s.key = 'podium_vehicle'
    and (p_model is null or s.value->>'model' = p_model)
    and exists (select 1 from public.vehicle_catalog v where v.model = s.value->>'model');
$$;

revoke execute on function public.sync_wheel_vehicle_values(text) from public, anon, authenticated;

create or replace function public.admin_set_vehicle_price(p_model text, p_price bigint, p_update_inventory boolean default true)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me public.profiles := public.assert_staff();
  v_old bigint;
  v_rewards integer := 0;
begin
  if p_price is null or p_price < 0 or p_price > 100000000000 then
    raise exception 'INVALID_PRICE' using errcode = '22023';
  end if;

  select coalesce(price, 0) into v_old from public.vehicle_catalog where model = p_model for update;
  if not found then
    raise exception 'VEHICLE_NOT_FOUND' using errcode = 'P0002';
  end if;

  update public.vehicle_catalog
  set price = p_price, price_locked = true, updated_at = now()
  where model = p_model;

  -- Lots déjà gagnés pas encore revendus / livrés, qui valaient l'ancien prix
  -- (les cartes de booster à valeur personnalisée ne sont pas touchées)
  if p_update_inventory then
    update public.player_rewards
    set value = p_price
    where vehicle_model = p_model
      and kind = 'vehicle'
      and status in ('IN_INVENTORY', 'CLAIMED')
      and coalesce(value, v_old) = v_old;
    get diagnostics v_rewards = row_count;
  end if;

  -- Copies de la valeur dans la roue (lots « véhicule » et podium)
  perform public.sync_wheel_vehicle_values(p_model);

  insert into public.admin_logs (action, category, detail, author)
  values ('Prix véhicule modifié', 'SYSTEM',
          p_model || ' : ' || v_old || ' → ' || p_price || ' (' || v_rewards || ' lot(s) en inventaire mis à jour)',
          coalesce(v_me.rp_first_name || ' ' || v_me.rp_last_name, 'Console Admin'));

  return jsonb_build_object('model', p_model, 'old_price', v_old, 'price', p_price, 'updated_rewards', v_rewards);
end;
$$;

-- Rattrapage des copies déjà désynchronisées
select public.sync_wheel_vehicle_values(null);
