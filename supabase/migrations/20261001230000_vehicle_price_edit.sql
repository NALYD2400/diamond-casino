-- ====================================================================
-- CATALOGUE VÉHICULES — correction manuelle du prix depuis la console
-- ====================================================================
-- * price_locked : prix corrigé à la main, l'import JSON ne l'écrase plus
-- * admin_set_vehicle_price : change le prix (cartes, roue, collections
--   le lisent directement) et, en option, la valeur des lots déjà gagnés
--   encore en inventaire qui valaient l'ancien prix
-- ====================================================================

alter table public.vehicle_catalog add column if not exists price_locked boolean not null default false;

create or replace function public.admin_import_vehicles(p_rows jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me public.profiles := public.assert_staff();
  v_count integer;
begin
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 3000 then
    raise exception 'INVALID_IMPORT' using errcode = '22023';
  end if;

  insert into public.vehicle_catalog as c (
    model, hash, dlc, manufacturer, class, type, seats, price,
    photo_url, photo_full_url, screenshot_url, updated_at
  )
  select
    left(trim(r.model), 64), left(r.hash, 32), left(r.dlc, 64), left(r.manufacturer, 64),
    left(r.class, 32), left(r.type, 32), r.seats, greatest(coalesce(r.price, 0), 0),
    left(r.photo_url, 500), left(r.photo_full_url, 500), left(r.screenshot_url, 500), now()
  from jsonb_to_recordset(p_rows) as r(
    model text, hash text, dlc text, manufacturer text, class text, type text,
    seats integer, price bigint, photo_url text, photo_full_url text, screenshot_url text
  )
  where r.model is not null and trim(r.model) <> ''
  on conflict (model) do update set
    hash = excluded.hash,
    dlc = excluded.dlc,
    manufacturer = excluded.manufacturer,
    class = excluded.class,
    type = excluded.type,
    seats = excluded.seats,
    price = case when c.price_locked then c.price else excluded.price end,
    photo_url = excluded.photo_url,
    photo_full_url = excluded.photo_full_url,
    screenshot_url = excluded.screenshot_url,
    updated_at = now();
  get diagnostics v_count = row_count;

  insert into public.admin_logs (action, category, detail, author)
  values ('Import catalogue véhicules', 'SYSTEM', v_count || ' véhicules importés / mis à jour',
          coalesce(v_me.rp_first_name || ' ' || v_me.rp_last_name, 'Console Admin'));
  return v_count;
end;
$$;

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

  insert into public.admin_logs (action, category, detail, author)
  values ('Prix véhicule modifié', 'SYSTEM',
          p_model || ' : ' || v_old || ' → ' || p_price || ' (' || v_rewards || ' lot(s) en inventaire mis à jour)',
          coalesce(v_me.rp_first_name || ' ' || v_me.rp_last_name, 'Console Admin'));

  return jsonb_build_object('model', p_model, 'old_price', v_old, 'price', p_price, 'updated_rewards', v_rewards);
end;
$$;

revoke all on function public.admin_set_vehicle_price(text, bigint, boolean) from public, anon;
grant execute on function public.admin_set_vehicle_price(text, bigint, boolean) to authenticated;
