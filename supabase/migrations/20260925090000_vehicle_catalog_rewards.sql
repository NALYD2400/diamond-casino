-- ====================================================================
-- CATALOGUE VÉHICULES + INVENTAIRE DES LOTS GAGNÉS
-- ====================================================================
-- * vehicle_catalog : véhicules du serveur (import JSON CTG depuis la console)
-- * player_rewards  : lots non monétaires gagnés / donnés, avec suivi
--     IN_INVENTORY (dans l'inventaire du joueur)
--  -> CLAIMED      (le joueur demande la remise en jeu)
--  -> DELIVERED    (la gérance l'a remis en jeu)   | REVOKED (retiré par la gérance)
-- ====================================================================

create table if not exists public.vehicle_catalog (
  model text primary key,
  hash text,
  dlc text,
  manufacturer text,
  class text,
  type text,
  seats integer,
  price bigint,
  photo_url text,
  photo_full_url text,
  screenshot_url text,
  updated_at timestamptz not null default now()
);
create index if not exists vehicle_catalog_manufacturer_idx on public.vehicle_catalog (lower(manufacturer));
alter table public.vehicle_catalog enable row level security;

drop policy if exists "vehicle_catalog_select_public" on public.vehicle_catalog;
create policy "vehicle_catalog_select_public" on public.vehicle_catalog
  for select to anon, authenticated using (true);

create table if not exists public.player_rewards (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('vehicle', 'item')),
  label text not null,
  vehicle_model text references public.vehicle_catalog(model) on delete set null,
  image_url text,
  source text not null default 'wheel' check (source in ('wheel', 'admin')),
  status text not null default 'IN_INVENTORY' check (status in ('IN_INVENTORY', 'CLAIMED', 'DELIVERED', 'REVOKED')),
  note text,
  created_at timestamptz not null default now(),
  claimed_at timestamptz,
  handled_at timestamptz,
  handled_by text
);
create index if not exists player_rewards_profile_idx on public.player_rewards (profile_id, created_at desc);
create index if not exists player_rewards_status_idx on public.player_rewards (status, created_at);
alter table public.player_rewards enable row level security;

drop policy if exists "player_rewards_select_own_or_staff" on public.player_rewards;
create policy "player_rewards_select_own_or_staff" on public.player_rewards
  for select to authenticated
  using (
    (select public.is_staff())
    or profile_id in (select id from public.profiles where user_id = (select auth.uid()))
  );

-- --------------------------------------------------------------------
-- Import du catalogue (gérance)
-- p_rows : [{ model, hash, dlc, manufacturer, class, type, seats, price,
--             photo_url, photo_full_url, screenshot_url }, …]
-- --------------------------------------------------------------------
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
    price = excluded.price,
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

-- --------------------------------------------------------------------
-- Joueur : demander la remise en jeu d'un lot
-- --------------------------------------------------------------------
create or replace function public.claim_reward(p_reward_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile public.profiles;
  v_reward public.player_rewards;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED' using errcode = '28000';
  end if;
  select * into v_profile from public.profiles where user_id = auth.uid();
  if v_profile.id is null then
    raise exception 'PROFILE_REQUIRED' using errcode = 'P0002';
  end if;

  update public.player_rewards
  set status = 'CLAIMED', claimed_at = now()
  where id = p_reward_id and profile_id = v_profile.id and status = 'IN_INVENTORY'
  returning * into v_reward;
  if v_reward.id is null then
    raise exception 'REWARD_NOT_CLAIMABLE' using errcode = 'P0001';
  end if;

  insert into public.admin_logs (action, category, detail, author)
  values ('Réclamation de lot', 'CITIZEN',
          v_profile.rp_first_name || ' ' || v_profile.rp_last_name || ' (#' || v_profile.citizen_id || ') réclame : ' || v_reward.label,
          'Espace Membre');

  return to_jsonb(v_reward);
end;
$$;

-- --------------------------------------------------------------------
-- Gérance : donner un lot / véhicule directement
-- --------------------------------------------------------------------
create or replace function public.admin_grant_reward(
  p_profile_id uuid,
  p_vehicle_model text default null,
  p_label text default null,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me public.profiles := public.assert_staff();
  v_target public.profiles;
  v_vehicle public.vehicle_catalog;
  v_reward public.player_rewards;
  v_label text;
begin
  select * into v_target from public.profiles where id = p_profile_id;
  if v_target.id is null then
    raise exception 'PROFILE_NOT_FOUND' using errcode = 'P0002';
  end if;

  if nullif(trim(coalesce(p_vehicle_model, '')), '') is not null then
    select * into v_vehicle from public.vehicle_catalog where model = trim(p_vehicle_model);
    if v_vehicle.model is null then
      raise exception 'VEHICLE_NOT_FOUND' using errcode = 'P0002';
    end if;
  end if;

  v_label := left(coalesce(
    nullif(trim(coalesce(p_label, '')), ''),
    case when v_vehicle.model is not null
         then trim(coalesce(initcap(v_vehicle.manufacturer) || ' ', '') || v_vehicle.model) end
  ), 80);
  if v_label is null then
    raise exception 'INVALID_REWARD' using errcode = '22023';
  end if;

  insert into public.player_rewards (profile_id, kind, label, vehicle_model, image_url, source, note)
  values (v_target.id,
          case when v_vehicle.model is not null then 'vehicle' else 'item' end,
          v_label, v_vehicle.model, v_vehicle.photo_url, 'admin', left(p_note, 280))
  returning * into v_reward;

  insert into public.admin_logs (action, category, detail, author)
  values ('Lot attribué', 'CITIZEN', v_label || ' donné à #' || v_target.citizen_id,
          coalesce(v_me.rp_first_name || ' ' || v_me.rp_last_name, 'Console Admin'));

  return to_jsonb(v_reward);
end;
$$;

-- --------------------------------------------------------------------
-- Gérance : remettre en jeu (DELIVERED), retirer (REVOKED) ou remettre
-- dans l'inventaire (IN_INVENTORY)
-- --------------------------------------------------------------------
create or replace function public.admin_update_reward(p_reward_id uuid, p_status text, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me public.profiles := public.assert_staff();
  v_old public.player_rewards;
  v_new public.player_rewards;
  v_author text := coalesce(v_me.rp_first_name || ' ' || v_me.rp_last_name, 'Console Admin');
  v_cid text;
begin
  if p_status not in ('IN_INVENTORY', 'DELIVERED', 'REVOKED') then
    raise exception 'INVALID_STATUS' using errcode = '22023';
  end if;
  select * into v_old from public.player_rewards where id = p_reward_id for update;
  if v_old.id is null then
    raise exception 'REWARD_NOT_FOUND' using errcode = 'P0002';
  end if;

  update public.player_rewards
  set status = p_status,
      note = coalesce(nullif(left(trim(coalesce(p_note, '')), 280), ''), note),
      handled_at = case when p_status = 'IN_INVENTORY' then null else now() end,
      handled_by = case when p_status = 'IN_INVENTORY' then null else v_author end,
      claimed_at = case when p_status = 'IN_INVENTORY' then null else claimed_at end
  where id = p_reward_id
  returning * into v_new;

  -- Garage du profil : ajout à la livraison, retrait sinon
  if v_new.kind = 'vehicle' then
    update public.profiles
    set vehicles = case
      when p_status = 'DELIVERED' and not (v_new.label = any(coalesce(vehicles, '{}')))
        then array_append(coalesce(vehicles, '{}'), v_new.label)
      when p_status <> 'DELIVERED'
        then array_remove(coalesce(vehicles, '{}'), v_new.label)
      else vehicles end
    where id = v_new.profile_id;
  end if;

  select citizen_id into v_cid from public.profiles where id = v_new.profile_id;
  insert into public.admin_logs (action, category, detail, author)
  values (case p_status when 'DELIVERED' then 'Lot remis en jeu'
                        when 'REVOKED' then 'Lot retiré'
                        else 'Lot remis en inventaire' end,
          'CITIZEN', v_new.label || ' — #' || coalesce(v_cid, '?') || coalesce(' — ' || nullif(trim(coalesce(p_note, '')), ''), ''),
          v_author);

  return to_jsonb(v_new);
end;
$$;

-- --------------------------------------------------------------------
-- Tirage : les lots non monétaires vont dans player_rewards
-- (segment « vehicle » : champs optionnels vehicleModel / imageUrl)
-- --------------------------------------------------------------------
create or replace function public.spin_wheel()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_profile public.profiles;
  v_economy jsonb;
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
  v_amount bigint := 0;
  v_chips bigint := 0;
  v_cash bigint := 0;
  v_hours numeric;
  v_vehicle public.vehicle_catalog;
  v_reward_id uuid;
  i int;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED' using errcode = '28000';
  end if;

  select * into v_profile from public.profiles where user_id = v_uid for update;
  if v_profile.id is null then
    raise exception 'PROFILE_REQUIRED' using errcode = 'P0002';
  end if;

  select value into v_economy from public.casino_settings where key = 'economy_config';
  if coalesce((v_economy->>'maintenanceMode')::boolean, false) then
    raise exception 'MAINTENANCE' using errcode = 'P0001';
  end if;

  v_hours := public.wheel_cooldown_hours(v_profile.vip_tier);
  if v_profile.last_wheel_spin is not null
     and v_profile.last_wheel_spin + make_interval(secs => v_hours * 3600) > now() then
    raise exception 'COOLDOWN' using errcode = 'P0001';
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

  if v_total <= 0 then
    v_idx := floor(random() * v_count)::int;
  else
    v_rand := random() * v_total;
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
  v_label := left(coalesce(v_seg->>'label', 'Lot mystère'), 60);
  v_item := left(coalesce(v_seg->>'value', v_label), 80);

  if v_type in ('chips', 'cash') and jsonb_typeof(v_seg->'value') = 'number' then
    v_amount := least(greatest((v_seg->>'value')::numeric, 0), 100000000)::bigint;
  end if;
  if v_type = 'chips' then v_chips := v_amount; end if;
  if v_type = 'cash' then v_cash := v_amount; end if;

  update public.profiles
  set chips = chips + v_chips,
      cash = cash + v_cash,
      total_won = coalesce(total_won, 0) + v_chips + v_cash,
      total_spins = coalesce(total_spins, 0) + 1,
      last_wheel_spin = now()
  where id = v_profile.id
  returning * into v_profile;

  if v_type not in ('chips', 'cash') then
    if v_type = 'vehicle' and nullif(v_seg->>'vehicleModel', '') is not null then
      select * into v_vehicle from public.vehicle_catalog where model = v_seg->>'vehicleModel';
    end if;
    insert into public.player_rewards (profile_id, kind, label, vehicle_model, image_url, source)
    values (v_profile.id,
            case when v_type = 'vehicle' then 'vehicle' else 'item' end,
            v_item,
            v_vehicle.model,
            coalesce(nullif(v_seg->>'imageUrl', ''), v_vehicle.photo_url),
            'wheel')
    returning id into v_reward_id;
  end if;

  insert into public.bets_history (profile_id, game_id, bet_amount, win_amount, multiplier, result_data)
  values (v_profile.id, 'lucky_wheel', 0, v_chips + v_cash, 1,
          jsonb_build_object('segment_index', v_idx, 'segment', v_label, 'type', v_type, 'value', v_seg->'value'));

  insert into public.casino_transactions (profile_id, type, amount, chips, game, description, status)
  values (v_profile.id, 'WHEEL', v_cash, v_chips, 'lucky_wheel',
          'Roue de la Fortune : ' || v_label ||
            case when v_type in ('chips', 'cash') then '' else ' (' || v_item || ')' end,
          'COMPLETED');

  return jsonb_build_object(
    'segment_index', v_idx,
    'segment', v_seg,
    'reward_id', v_reward_id,
    'profile', public.profile_payload(v_profile)
  );
end;
$$;

-- --------------------------------------------------------------------
-- Droits
-- --------------------------------------------------------------------
revoke execute on function public.admin_import_vehicles(jsonb) from public, anon, authenticated;
revoke execute on function public.claim_reward(uuid) from public, anon, authenticated;
revoke execute on function public.admin_grant_reward(uuid, text, text, text) from public, anon, authenticated;
revoke execute on function public.admin_update_reward(uuid, text, text) from public, anon, authenticated;
revoke execute on function public.spin_wheel() from public, anon, authenticated;

grant execute on function public.admin_import_vehicles(jsonb) to authenticated;
grant execute on function public.claim_reward(uuid) to authenticated;
grant execute on function public.admin_grant_reward(uuid, text, text, text) to authenticated;
grant execute on function public.admin_update_reward(uuid, text, text) to authenticated;
grant execute on function public.spin_wheel() to authenticated;

revoke truncate on public.vehicle_catalog, public.player_rewards from anon, authenticated;
