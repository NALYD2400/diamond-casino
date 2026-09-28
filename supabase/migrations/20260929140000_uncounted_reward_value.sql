-- Bénéfice du casino : un véhicule gagné est compté à sa valeur complète dans les gains
-- payés au moment du tirage. S'il est ensuite revendu (le joueur reçoit un pourcentage en
-- jetons) ou retiré par le staff, la part jamais versée est retranchée des gains payés,
-- pour que le bénéfice affiché corresponde à ce que le casino paie réellement.
create or replace function public.uncounted_reward_value(p_game text, p_since timestamptz)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(
           case when status = 'SOLD' then greatest(coalesce(value, 0) - coalesce(sold_for, 0), 0)
                when status = 'REVOKED' then coalesce(value, 0)
                else 0 end), 0)::bigint
  from public.player_rewards
  where kind = 'vehicle'
    and coalesce(value, 0) > 0
    and source = case p_game when 'boosters' then 'booster' when 'lucky_wheel' then 'wheel' end
    and ((status = 'SOLD' and sold_at >= p_since)
         or (status = 'REVOKED' and coalesce(handled_at, created_at) >= p_since));
$$;

revoke execute on function public.uncounted_reward_value(text, timestamptz) from public, anon, authenticated;

do $$
declare
  v_def text := pg_get_functiondef('public.admin_dashboard(integer)'::regprocedure);
  a1 text := $q$coalesce(sum(win_amount), 0) paid, coalesce(max(win_amount), 0) biggest$q$;
  b1 text := $q$coalesce(sum(win_amount), 0) - public.uncounted_reward_value(game_id, v_since) paid, coalesce(max(win_amount), 0) biggest$q$;
begin
  if position(a1 in v_def) = 0 then
    raise exception 'admin_dashboard: point d''insertion introuvable';
  end if;
  execute replace(v_def, a1, b1);
end;
$$;

do $$
declare
  v_def text := pg_get_functiondef('public.admin_game_stats(text, integer)'::regprocedure);
  a1 text := $q$'paid', coalesce(sum(win_amount), 0),$q$;
  b1 text := $q$'paid', coalesce(sum(win_amount), 0) - public.uncounted_reward_value(p_game, v_since),$q$;
  a2 text := $q$'profit', coalesce(sum(bet_amount) - sum(win_amount), 0),$q$;
  b2 text := $q$'profit', coalesce(sum(bet_amount) - sum(win_amount), 0) + public.uncounted_reward_value(p_game, v_since),$q$;
  a3 text := $q$'rtp', case when sum(bet_amount) > 0 then round(sum(win_amount)::numeric * 100 / sum(bet_amount), 2) end,$q$;
  b3 text := $q$'rtp', case when sum(bet_amount) > 0 then round((sum(win_amount) - public.uncounted_reward_value(p_game, v_since))::numeric * 100 / sum(bet_amount), 2) end,$q$;
begin
  if position(a1 in v_def) = 0 or position(a2 in v_def) = 0 or position(a3 in v_def) = 0 then
    raise exception 'admin_game_stats: point d''insertion introuvable';
  end if;
  execute replace(replace(replace(v_def, a1, b1), a2, b2), a3, b3);
end;
$$;
