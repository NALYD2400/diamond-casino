-- ====================================================================
-- ROUE — abonnements VIP (Silver, Gold, Diamond) à gagner
-- ====================================================================
-- * Nouveau type de lot « vip » (champ vipTier : SILVER / GOLD / DIAMOND).
--   Gagné : la carte est activée tout de suite pour vip_config.durationDays
--   jours, avec la dotation de jetons, exactement comme un achat gratuit.
-- * Tant qu'un joueur a une carte active (gagnée ou achetée), les cases VIP
--   de ce niveau et des niveaux inférieurs sont retirées de SON tirage :
--   la roue ne peut pas s'y arrêter.
-- * wheel_ev compte une carte à son prix d'achat (garde-fou maxRtp).
-- * Trois lots ajoutés : Silver 0,4, Gold 0,2, Diamond 0,09 (poids).
-- ====================================================================

create or replace function public.vip_rank(p_tier text)
returns int
language sql
immutable
set search_path = ''
as $$
  select coalesce(array_position(array['SILVER', 'GOLD', 'DIAMOND'], p_tier), 0);
$$;

-- Carte VIP gagnée à la roue
create or replace function public.wheel_grant_vip(p_profile_id uuid, p_tier text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cfg jsonb := public.vip_config();
  v_profile public.profiles;
  v_active text;
  v_bonus bigint;
  v_days int := coalesce((v_cfg->>'durationDays')::int, 30);
begin
  if public.vip_rank(p_tier) = 0 then
    raise exception 'INVALID_TIER' using errcode = '22023';
  end if;
  select * into v_profile from public.profiles where id = p_profile_id for update;
  v_active := public.active_vip(v_profile.vip_tier, v_profile.vip_expires_at);

  if public.vip_rank(v_active) >= public.vip_rank(p_tier) then
    -- Cas impossible en temps normal (case retirée du tirage) : on prolonge la carte en cours
    update public.profiles set vip_expires_at = vip_expires_at + make_interval(days => v_days) where id = v_profile.id;
    insert into public.casino_transactions (profile_id, type, amount, chips, game, description, status)
    values (v_profile.id, 'VIP_SUBSCRIPTION', 0, 0, v_active,
            'Carte ' || v_active || ' prolongée de ' || v_days || ' jours (Roue de la Fortune)', 'COMPLETED');
  else
    v_bonus := coalesce((v_cfg->p_tier->>'bonus')::bigint, 0);
    update public.profiles
    set vip_tier = p_tier, vip_expires_at = now() + make_interval(days => v_days), chips = chips + v_bonus
    where id = v_profile.id;
    insert into public.casino_transactions (profile_id, type, amount, chips, game, description, status)
    values (v_profile.id, 'VIP_SUBSCRIPTION', 0, 0, p_tier, 'Abonnement VIP ' || p_tier || ' gagné à la Roue de la Fortune', 'COMPLETED');
    if v_bonus > 0 then
      insert into public.casino_transactions (profile_id, type, amount, chips, game, description, status)
      values (v_profile.id, 'VIP_REWARD', 0, v_bonus, p_tier, 'Dotation VIP ' || p_tier, 'COMPLETED');
    end if;
  end if;

  insert into public.admin_logs (action, category, detail, author)
  values ('Abonnement VIP', 'WHEEL',
          v_profile.rp_first_name || ' ' || v_profile.rp_last_name || ' (#' || v_profile.citizen_id || ') a gagné la carte ' || p_tier || ' à la roue',
          'Roue de la Fortune');
end;
$$;
revoke execute on function public.wheel_grant_vip(uuid, text) from public, anon, authenticated;

-- spin_wheel : cases VIP déjà possédées retirées du tirage, gain de la carte
do $$
declare
  v_def text := pg_get_functiondef('public.spin_wheel()'::regprocedure);
  a1 text := $q$  i int;
begin$q$;
  b1 text := $q$  i int;
  v_active_rank int;
begin$q$;
  a2 text := $q$  v_count := jsonb_array_length(v_segments);
$q$;
  b2 text := $q$  v_count := jsonb_array_length(v_segments);

  -- Une carte VIP active (gagnée ou achetée) retire du tirage les cases VIP de ce niveau et en dessous
  v_active_rank := public.vip_rank(public.active_vip(v_profile.vip_tier, v_profile.vip_expires_at));
  if v_active_rank > 0 then
    select jsonb_agg(case when t.e->>'type' = 'vip' and public.vip_rank(t.e->>'vipTier') <= v_active_rank
                          then jsonb_set(t.e, '{dropRate}', '0') else t.e end order by t.o)
    into v_segments
    from jsonb_array_elements(v_segments) with ordinality as t(e, o);
  end if;
$q$;
  a3 text := $q$  if v_type <> 'chips' then
    if v_type = 'vehicle'$q$;
  b3 text := $q$  if v_type = 'vip' then
    perform public.wheel_grant_vip(v_profile.id, v_seg->>'vipTier');
    select * into v_profile from public.profiles where id = v_profile.id;
  elsif v_type <> 'chips' then
    if v_type = 'vehicle'$q$;
begin
  if position(a1 in v_def) = 0 or position(a2 in v_def) = 0 or position(a3 in v_def) = 0 then
    raise exception 'spin_wheel: point d''insertion introuvable';
  end if;
  execute replace(replace(replace(v_def, a1, b1), a2, b2), a3, b3);
end;
$$;

-- wheel_ev : une carte VIP vaut son prix d'achat
do $$
declare
  v_def text := pg_get_functiondef('public.wheel_ev(jsonb)'::regprocedure);
  a1 text := $q$                   when s.e->>'type' in ('clothing', 'mystery')$q$;
  b1 text := $q$                   when s.e->>'type' = 'vip'
                   then coalesce((public.vip_config()->(s.e->>'vipTier')->>'price')::numeric, 0)
                   when s.e->>'type' in ('clothing', 'mystery')$q$;
begin
  if position(a1 in v_def) = 0 then
    raise exception 'wheel_ev: point d''insertion introuvable';
  end if;
  execute replace(v_def, a1, b1);
end;
$$;

-- admin_set_setting : type « vip » accepté dans les segments
do $$
declare
  v_def text := pg_get_functiondef('public.admin_set_setting(text, jsonb)'::regprocedure);
  a1 text := $q$('chips', 'vehicle', 'mystery', 'clothing', 'voucher', 'pack')$q$;
  b1 text := $q$('chips', 'vehicle', 'mystery', 'clothing', 'voucher', 'pack', 'vip')$q$;
  a2 text := $q$                        else to_jsonb(left(coalesce(v_seg->>'value', v_label), 80)) end,$q$;
  b2 text := $q$                        when v_type = 'vip' then to_jsonb('Abonnement VIP ' || case when v_seg->>'vipTier' in ('GOLD', 'DIAMOND') then initcap(v_seg->>'vipTier') else 'Silver' end
                                                          || ' · ' || coalesce((public.vip_config()->>'durationDays'), '30') || ' jours')
                        else to_jsonb(left(coalesce(v_seg->>'value', v_label), 80)) end,$q$;
  a3 text := $q$          'packSet', case when v_type = 'pack'$q$;
  b3 text := $q$          'vipTier', case when v_type = 'vip' then case when v_seg->>'vipTier' in ('GOLD', 'DIAMOND') then v_seg->>'vipTier' else 'SILVER' end end,
          'packSet', case when v_type = 'pack'$q$;
begin
  if position(a1 in v_def) = 0 or position(a2 in v_def) = 0 or position(a3 in v_def) = 0 then
    raise exception 'admin_set_setting: point d''insertion introuvable';
  end if;
  execute replace(replace(replace(v_def, a1, b1), a2, b2), a3, b3);
end;
$$;

-- Les trois lots
update public.casino_settings
set value = value || jsonb_build_array(
      jsonb_build_object('id', 19, 'label', 'CARTE SILVER', 'type', 'vip', 'vipTier', 'SILVER', 'value', 'Abonnement VIP Silver · 30 jours',
                         'dropRate', 0.4, 'color', '#94a3b8', 'textColor', '#ffffff', 'icon', '🥈'),
      jsonb_build_object('id', 20, 'label', 'CARTE GOLD', 'type', 'vip', 'vipTier', 'GOLD', 'value', 'Abonnement VIP Gold · 30 jours',
                         'dropRate', 0.2, 'color', '#d4a017', 'textColor', '#ffffff', 'icon', '👑'),
      jsonb_build_object('id', 21, 'label', 'CARTE DIAMOND', 'type', 'vip', 'vipTier', 'DIAMOND', 'value', 'Abonnement VIP Diamond · 30 jours',
                         'dropRate', 0.09, 'color', '#22d3ee', 'textColor', '#ffffff', 'icon', '💎')),
    updated_at = now()
where key = 'wheel_segments'
  and not exists (select 1 from jsonb_array_elements(value) e where e->>'type' = 'vip');

select public.assert_wheel_profitable();
