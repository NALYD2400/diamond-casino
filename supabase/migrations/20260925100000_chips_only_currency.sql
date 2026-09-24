-- ====================================================================
-- MONNAIE UNIQUE : LES JETONS
-- ====================================================================
-- * le cash des profils est converti en jetons (1 pour 1, tracé en transaction)
-- * les segments « cash » de la roue deviennent des segments jetons
-- * spin_wheel ne crédite plus jamais de cash
-- ====================================================================

insert into public.casino_transactions (profile_id, type, amount, chips, game, description, status)
select id, 'ADMIN_ADJUST', -cash, cash, null, 'Conversion du cash en jetons (monnaie unique)', 'COMPLETED'
from public.profiles
where cash > 0;

update public.profiles set chips = chips + cash, cash = 0 where cash > 0;

update public.casino_settings
set value = (
  select jsonb_agg(
    case when seg->>'type' = 'cash' then
      seg || jsonb_build_object(
        'type', 'chips',
        'value', v.new_value,
        'label', replace(to_char(v.new_value, 'FM999,999,999'), ',', ' ') || ' JETONS',
        'color', '#171717',
        'icon', '🪙'
      )
    else seg end
    order by ord
  )
  from jsonb_array_elements(value) with ordinality as e(seg, ord)
  cross join lateral (
    select case (seg->>'value')
      when '50000' then 75000
      when '25000' then 30000
      when '10000' then 5000
      when '15000' then 12000
      else coalesce(nullif(seg->>'value', '')::numeric, 0)::bigint
    end as new_value
  ) v
),
updated_at = now()
where key = 'wheel_segments' and jsonb_typeof(value) = 'array';

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
  -- Monnaie unique : jetons. Un ancien segment « cash » est crédité en jetons.
  if v_type = 'cash' then v_type := 'chips'; end if;
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


revoke execute on function public.spin_wheel() from public, anon, authenticated;
grant execute on function public.spin_wheel() to authenticated;
