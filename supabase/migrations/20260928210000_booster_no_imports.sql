-- ====================================================================
-- BOOSTERS — pas de véhicules « import »
-- ====================================================================
-- Les véhicules ajoutés par le serveur (DLC « CTG » et « gabz ») sont des
-- imports vendus hors concession : leur prix dans le catalogue ne reflète pas
-- leur vraie valeur en jeu. Ils sont retirés de la concession par défaut (et
-- leurs cartes désactivées). La direction peut en réactiver un à la main dans
-- Boosters → Concession.
-- ====================================================================

create or replace function public.vehicle_default_dealership(p_price bigint, p_class text, p_type text, p_dlc text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(p_price, 0) >= 500
     and coalesce(p_class, '') not in ('EMERGENCY', 'MILITARY', 'SERVICE', 'RAIL', 'INDUSTRIAL')
     and coalesce(p_type, '') in ('CAR', 'BIKE', 'BICYCLE', 'QUADBIKE')
     and lower(coalesce(p_dlc, '')) not in ('ctg', 'gabz');
$$;

create or replace function public.vehicle_catalog_default_dealership()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.in_dealership is null then
    new.in_dealership := public.vehicle_default_dealership(new.price, new.class, new.type, new.dlc);
  end if;
  return new;
end;
$$;

drop function if exists public.vehicle_default_dealership(bigint, text, text);

update public.vehicle_catalog set in_dealership = false, updated_at = now()
where lower(coalesce(dlc, '')) in ('ctg', 'gabz') and in_dealership;

update public.booster_cards c set active = false, updated_at = now()
from public.vehicle_catalog v
where v.model = c.vehicle_model and not coalesce(v.in_dealership, false) and c.active;

revoke execute on function public.vehicle_default_dealership(bigint, text, text, text) from public, anon, authenticated;
