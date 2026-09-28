-- Bons de bonus offerts (roue, cadeaux) utilisables sur une machine à sous.
--
-- Un bon = un bonus buy GRATUIT sur The Dog House ou Wanted. L'admin règle la valeur
-- (ex. 20 000 jetons) : le serveur en déduit la mise du bonus (valeur / prix du bonus).
-- Le bon apparaît dans l'inventaire du joueur, qui l'utilise dans la machine : le tirage
-- est fait côté serveur, le bon est consommé en même temps que le gain est crédité.

-- 1. Stockage -----------------------------------------------------------
alter table public.player_rewards drop constraint if exists player_rewards_kind_check;
alter table public.player_rewards
  add constraint player_rewards_kind_check check (kind in ('vehicle', 'item', 'voucher'));
alter table public.player_rewards drop constraint if exists player_rewards_status_check;
alter table public.player_rewards
  add constraint player_rewards_status_check
  check (status in ('IN_INVENTORY', 'CLAIMED', 'DELIVERED', 'REVOKED', 'SOLD', 'USED'));
alter table public.player_rewards add column if not exists voucher jsonb;

-- 2. Spécification d'un bon : jeu, type de bonus, mise déduite de la valeur ----
create or replace function public.voucher_spec(p_game text, p_buy text, p_value numeric)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_cfg jsonb;
  v_price numeric;
  v_buy text;
  v_bet numeric;
begin
  if p_game = 'doghouse' then
    v_cfg := public.games_config()->'doghouse';
    v_buy := 'buy';
    v_price := (v_cfg->>'buyPrice')::numeric;
  elsif p_game = 'wanted' then
    v_cfg := public.games_config()->'wanted';
    v_buy := case when p_buy in ('gtr', 'duel', 'dmh') then p_buy else 'gtr' end;
    v_price := (v_cfg->'buyPrices'->>v_buy)::numeric;
  else
    raise exception 'INVALID_SETTING' using errcode = '22023';
  end if;
  if v_price is null or v_price <= 0 then
    raise exception 'INVALID_SETTING' using errcode = '22023';
  end if;
  v_bet := greatest(floor(coalesce(p_value, 0) / v_price), (v_cfg->>'minBet')::numeric);
  v_bet := least(v_bet, (v_cfg->>'maxBet')::numeric);
  return jsonb_build_object('game', p_game, 'buy', v_buy, 'bet', v_bet::bigint, 'cost', ceil(v_bet * v_price)::bigint);
end;
$$;

-- 3. Roue : valeur d'un bon dans le retour de la roue ---------------------------
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
                   when s.e->>'type' = 'voucher'
                   then coalesce((public.voucher_spec(s.e->>'voucherGame', s.e->>'voucherBuy',
                                                     coalesce((s.e->>'voucherValue')::numeric, 0))->>'cost')::numeric, 0)
                   else 0 end)
         ), 0)
  from s, t;
$$;

-- 4. Réglages de la roue : segment « voucher » ---------------------------------
do $$
declare
  v_def text := pg_get_functiondef('public.admin_set_setting(text, jsonb)'::regprocedure);
  a1 text := $q$if v_type not in ('chips', 'vehicle', 'mystery', 'clothing') then$q$;
  b1 text := $q$if v_type not in ('chips', 'vehicle', 'mystery', 'clothing', 'voucher') then$q$;
  a2 text := $q$case when v_type = 'chips' then to_jsonb(public.jnum(v_seg, 'value', 0, 0, 100000000)::bigint)$q$;
  b2 text := $q$case when v_type = 'chips' then to_jsonb(public.jnum(v_seg, 'value', 0, 0, 100000000)::bigint)
                        when v_type = 'voucher' then to_jsonb(left('Bonus offert ' || case when v_seg->>'voucherGame' = 'wanted' then 'Wanted' else 'Dog House' end
                                                                  || ' · ' || public.jnum(v_seg, 'voucherValue', 20000, 1, 100000000)::bigint::text, 80))$q$;
  a3 text := $q$'imageUrl', nullif(left(coalesce(v_seg->>'imageUrl', ''), 500), '')$q$;
  b3 text := $q$'imageUrl', nullif(left(coalesce(v_seg->>'imageUrl', ''), 500), ''),
          'voucherGame', case when v_type = 'voucher' then case when v_seg->>'voucherGame' = 'wanted' then 'wanted' else 'doghouse' end end,
          'voucherBuy', case when v_type = 'voucher' then case when v_seg->>'voucherGame' = 'wanted'
                                                               then case when v_seg->>'voucherBuy' in ('gtr', 'duel', 'dmh') then v_seg->>'voucherBuy' else 'gtr' end
                                                               else 'buy' end end,
          'voucherValue', case when v_type = 'voucher' then public.jnum(v_seg, 'voucherValue', 20000, 1, 100000000)::bigint end$q$;
begin
  if position(a1 in v_def) = 0 or position(a2 in v_def) = 0 or position(a3 in v_def) = 0 then
    raise exception 'admin_set_setting: point d''insertion introuvable';
  end if;
  execute replace(replace(replace(v_def, a1, b1), a2, b2), a3, b3);
end;
$$;

-- 5. Roue : un segment « voucher » donne un bon dans l'inventaire ---------------
do $$
declare
  v_def text := pg_get_functiondef('public.spin_wheel()'::regprocedure);
  a1 text := E'  v_reward_id uuid;\n  i int;\nbegin';
  b1 text := E'  v_reward_id uuid;\n  v_voucher jsonb;\n  v_voucher_value bigint;\n  i int;\nbegin';
  a2 text := E'    insert into public.player_rewards (profile_id, kind, label, vehicle_model, image_url, source, value)\n    values (v_profile.id,\n            case when v_type = ''vehicle'' then ''vehicle'' else ''item'' end,';
  b2 text := E'    if v_type = ''voucher'' then\n      v_voucher := public.voucher_spec(v_seg->>''voucherGame'', v_seg->>''voucherBuy'', coalesce((v_seg->>''voucherValue'')::numeric, 20000));\n      v_voucher_value := (v_voucher->>''cost'')::bigint;\n    end if;\n    insert into public.player_rewards (profile_id, kind, label, vehicle_model, image_url, source, value, voucher)\n    values (v_profile.id,\n            case when v_type = ''vehicle'' then ''vehicle'' when v_type = ''voucher'' then ''voucher'' else ''item'' end,';
  a3 text := E'            case when v_vehicle.model is not null then v_vehicle_value end)';
  b3 text := E'            case when v_vehicle.model is not null then v_vehicle_value when v_type = ''voucher'' then v_voucher_value end,\n            v_voucher)';
begin
  if position(a1 in v_def) = 0 or position(a2 in v_def) = 0 or position(a3 in v_def) = 0 then
    raise exception 'spin_wheel: point d''insertion introuvable';
  end if;
  execute replace(replace(replace(v_def, a1, b1), a2, b2), a3, b3);
end;
$$;

-- 6. Un bon ne se réclame pas en ville et ne se revend pas ------------------------
do $$
declare
  v_def text := pg_get_functiondef('public.claim_reward(uuid)'::regprocedure);
  a1 text := $q$where id = p_reward_id and profile_id = v_profile.id and status = 'IN_INVENTORY'$q$;
  b1 text := $q$where id = p_reward_id and profile_id = v_profile.id and status = 'IN_INVENTORY' and kind <> 'voucher'$q$;
begin
  if position(a1 in v_def) = 0 then
    raise exception 'claim_reward: point d''insertion introuvable';
  end if;
  execute replace(v_def, a1, b1);
end;
$$;

-- 7. Utilisation d'un bon : consomme le bon et crédite le gain (clé service_role) ---
create or replace function public.settle_voucher_round(
  p_user_id uuid,
  p_reward_id uuid,
  p_win bigint,
  p_detail jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile public.profiles;
  v_rw public.player_rewards;
  v_game text;
  v_cfg jsonb;
  v_label text;
begin
  select * into v_profile from public.profiles where user_id = p_user_id for update;
  if v_profile.id is null then
    raise exception 'PROFILE_REQUIRED' using errcode = 'P0002';
  end if;

  select * into v_rw from public.player_rewards
  where id = p_reward_id and profile_id = v_profile.id and kind = 'voucher' and status = 'IN_INVENTORY'
  for update;
  if v_rw.id is null then
    raise exception 'VOUCHER_NOT_FOUND' using errcode = 'P0001';
  end if;

  v_game := v_rw.voucher->>'game';
  v_cfg := public.assert_game_open(v_game);
  if p_win < 0 or p_win > (v_cfg->>'maxPayout')::numeric then
    raise exception 'INVALID_WIN' using errcode = 'P0001';
  end if;
  v_label := case v_game when 'doghouse' then 'The Dog House' else 'Wanted Dead or a Wild' end;

  update public.player_rewards
  set status = 'USED', handled_at = now(), handled_by = 'Utilisé en jeu'
  where id = v_rw.id;

  update public.profiles
  set chips = chips + p_win,
      total_won = coalesce(total_won, 0) + p_win
  where id = v_profile.id
  returning * into v_profile;

  -- mise = 0 : le bonus est offert, tout le gain est un coût réel pour le casino
  insert into public.bets_history (profile_id, game_id, bet_amount, win_amount, multiplier, result_data)
  values (v_profile.id, v_game, 0, p_win, 0,
          jsonb_build_object('mode', 'voucher', 'bet', (v_rw.voucher->>'bet')::bigint, 'bonus', p_detail->'bonus',
                             'voucher_id', v_rw.id, 'won', p_win > 0));

  if p_win > 0 then
    insert into public.casino_transactions (profile_id, type, amount, chips, game, description, status)
    values (v_profile.id, 'WIN', 0, p_win, v_game,
            v_label || ' (bonus offert) : gain ' || p_win, 'COMPLETED');
  end if;

  return public.profile_payload(v_profile);
end;
$$;

revoke execute on function public.settle_voucher_round(uuid, uuid, bigint, jsonb) from public, anon, authenticated;
grant execute on function public.settle_voucher_round(uuid, uuid, bigint, jsonb) to service_role;
