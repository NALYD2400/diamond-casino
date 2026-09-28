-- Le staff peut offrir un bon de bonus (bonus buy gratuit) à un joueur, depuis l'admin.
create or replace function public.admin_grant_voucher(
  p_profile_id uuid,
  p_game text,
  p_buy text,
  p_value bigint,
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
  v_spec jsonb;
  v_label text;
  v_reward public.player_rewards;
begin
  select * into v_target from public.profiles where id = p_profile_id;
  if v_target.id is null then
    raise exception 'PROFILE_NOT_FOUND' using errcode = 'P0002';
  end if;
  perform public.assert_not_self_credit(v_me, v_target.id);
  if p_value is null or p_value < 1 or p_value > 100000000 then
    raise exception 'INVALID_REWARD' using errcode = '22023';
  end if;

  v_spec := public.voucher_spec(p_game, p_buy, p_value);
  v_label := 'Bonus offert ' || case when p_game = 'wanted' then 'Wanted' else 'Dog House' end || ' · ' || p_value;

  insert into public.player_rewards (profile_id, kind, label, source, note, value, voucher)
  values (v_target.id, 'voucher', left(v_label, 80), 'admin', left(p_note, 280), (v_spec->>'cost')::bigint, v_spec)
  returning * into v_reward;

  insert into public.admin_logs (action, category, detail, author)
  values ('Bon de bonus attribué', 'CITIZEN', v_label || ' donné à #' || v_target.citizen_id,
          coalesce(v_me.rp_first_name || ' ' || v_me.rp_last_name, 'Console Admin'));

  return to_jsonb(v_reward);
end;
$$;

revoke execute on function public.admin_grant_voucher(uuid, text, text, bigint, text) from public, anon;
grant execute on function public.admin_grant_voucher(uuid, text, text, bigint, text) to authenticated;

-- Lot « Bonus Dog House 20 000 » sur la roue (poids 3), s'il n'y est pas déjà
update public.casino_settings
set value = value || jsonb_build_array(jsonb_build_object(
      'id', jsonb_array_length(value), 'label', 'BONUS DOG HOUSE', 'type', 'voucher',
      'value', 'Bonus offert Dog House · 20000', 'dropRate', 3,
      'color', '#12803a', 'textColor', '#ffffff', 'icon', '🎰',
      'voucherGame', 'doghouse', 'voucherBuy', 'buy', 'voucherValue', 20000)),
    updated_at = now()
where key = 'wheel_segments'
  and jsonb_typeof(value) = 'array'
  and jsonb_array_length(value) < 24
  and not exists (select 1 from jsonb_array_elements(value) e where e->>'type' = 'voucher');
