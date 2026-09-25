-- ====================================================================
-- THE DIAMOND CASINO & RESORT — ROUE DE LA FORTUNE PAYANTE
-- ====================================================================
-- Fin du tirage gratuit limité par un délai (24 h / 12 h / 8 h) : chaque
-- tour de roue coûte désormais un prix fixe en jetons, réglable dans la
-- console (games_config.wheel.spinPrice). Plus aucun cooldown côté serveur.
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

  return jsonb_build_object('mines', m, 'doghouse', d, 'wanted', w, 'wheel', r);
end;
$$;

update public.casino_settings
set value = public.normalize_games_config(value), updated_at = now()
where key = 'games_config';

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
  v_reward_id uuid;
  i int;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED' using errcode = '28000';
  end if;
  v_cfg := public.assert_game_open('wheel');
  v_price := greatest(coalesce((v_cfg->>'spinPrice')::numeric, 25000), 1)::bigint;

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
  if v_type = 'cash' then v_type := 'chips'; end if;
  v_label := left(coalesce(v_seg->>'label', 'Lot mystère'), 60);
  v_item := left(coalesce(v_seg->>'value', v_label), 80);

  if v_type = 'chips' and jsonb_typeof(v_seg->'value') = 'number' then
    v_chips := least(greatest((v_seg->>'value')::numeric, 0), 100000000)::bigint;
  end if;

  update public.profiles
  set chips = chips - v_price + v_chips,
      total_wagered = coalesce(total_wagered, 0) + v_price,
      total_won = coalesce(total_won, 0) + v_chips,
      total_spins = coalesce(total_spins, 0) + 1,
      last_wheel_spin = now()
  where id = v_profile.id
  returning * into v_profile;

  if v_type <> 'chips' then
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
  values (v_profile.id, 'lucky_wheel', v_price, v_chips, round(v_chips::numeric / v_price, 4),
          jsonb_build_object('segment_index', v_idx, 'segment', v_label, 'type', v_type, 'value', v_seg->'value'));

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

revoke execute on function public.spin_wheel() from public, anon, authenticated;
grant execute on function public.spin_wheel() to authenticated;
