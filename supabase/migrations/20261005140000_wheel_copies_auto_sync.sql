-- ====================================================================
-- ROUE : copies toujours à jour
-- ====================================================================
-- Les lots de la roue gardent des copies faites à l'enregistrement :
--   * véhicule : vehicleValue (prix catalogue) + podium_vehicle.value ;
--   * booster  : value = « Booster <nom de l'album> » ;
--   * carte VIP : value = « Abonnement VIP <Niveau> · <durée> jours ».
-- Elles se décalaient dès qu'on importait le catalogue CTG, renommait un
-- album ou changeait la durée des cartes VIP. Des déclencheurs les
-- resynchronisent maintenant à chaque changement, quel que soit l'écran.
-- ====================================================================

create or replace function public.sync_wheel_vehicle_values(p_model text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_days text := coalesce(public.vip_config()->>'durationDays', '30');
begin
  update public.casino_settings s
  set value = (
        select jsonb_agg(
                 case
                   when t.e->>'type' = 'vehicle' and (p_model is null or t.e->>'vehicleModel' = p_model)
                        and exists (select 1 from public.vehicle_catalog v where v.model = t.e->>'vehicleModel')
                     then jsonb_set(t.e, '{vehicleValue}',
                                    to_jsonb((select coalesce(v.price, 0) from public.vehicle_catalog v where v.model = t.e->>'vehicleModel')))
                   when p_model is null and t.e->>'type' = 'pack'
                        and exists (select 1 from public.collection_sets cs where cs.id = t.e->>'packSet')
                     then jsonb_set(t.e, '{value}',
                                    to_jsonb(left('Booster ' || (select cs.name from public.collection_sets cs where cs.id = t.e->>'packSet'), 80)))
                   when p_model is null and t.e->>'type' = 'vip'
                     then jsonb_set(t.e, '{value}',
                                    to_jsonb('Abonnement VIP ' || case when t.e->>'vipTier' in ('GOLD', 'DIAMOND') then initcap(t.e->>'vipTier') else 'Silver' end
                                             || ' · ' || v_days || ' jours'))
                   else t.e
                 end
                 order by t.o)
        from jsonb_array_elements(s.value) with ordinality as t(e, o)),
      updated_at = now()
  where s.key = 'wheel_segments'
    and jsonb_typeof(s.value) = 'array';

  update public.casino_settings s
  set value = jsonb_set(s.value, '{value}', to_jsonb((select coalesce(v.price, 0) from public.vehicle_catalog v where v.model = s.value->>'model'))),
      updated_at = now()
  where s.key = 'podium_vehicle'
    and (p_model is null or s.value->>'model' = p_model)
    and exists (select 1 from public.vehicle_catalog v where v.model = s.value->>'model')
    and s.value->'value' is distinct from to_jsonb((select coalesce(v.price, 0) from public.vehicle_catalog v where v.model = s.value->>'model'));
end;
$$;

revoke execute on function public.sync_wheel_vehicle_values(text) from public, anon, authenticated;

create or replace function public.trg_sync_wheel_copies()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.sync_wheel_vehicle_values(null);
  return null;
end;
$$;

revoke execute on function public.trg_sync_wheel_copies() from public, anon, authenticated;

-- Prix du catalogue (import CTG, correction manuelle…)
drop trigger if exists sync_wheel_on_catalog on public.vehicle_catalog;
create trigger sync_wheel_on_catalog
after insert or update of price on public.vehicle_catalog
for each statement execute function public.trg_sync_wheel_copies();

-- Nom d'un album
drop trigger if exists sync_wheel_on_collection_sets on public.collection_sets;
create trigger sync_wheel_on_collection_sets
after update of name on public.collection_sets
for each statement execute function public.trg_sync_wheel_copies();

-- Durée des cartes VIP (ne se déclenche que sur la ligne vip_config : pas de boucle)
drop trigger if exists sync_wheel_on_vip_config on public.casino_settings;
create trigger sync_wheel_on_vip_config
after insert or update of value on public.casino_settings
for each row when (new.key = 'vip_config')
execute function public.trg_sync_wheel_copies();

select public.sync_wheel_vehicle_values(null);
