-- ====================================================================
-- CLASSEMENTS (console de gérance)
-- ====================================================================
-- admin_leaderboards(p_days, p_members_only) : tout ce qu'il faut pour la
-- page Classements, en un appel, réservé au staff.
--   * players     : une ligne par joueur actif sur la période (parties,
--                   misé, rendu, net, plus grosse mise, jeu préféré) ;
--                   la console en tire les classements misé / gagné /
--                   perdu / joué.
--   * big_bets / big_wins / big_losses : records sur une seule partie.
--   * richest / lifetime : solde actuel et total misé depuis l'inscription.
--   * collections : par album, les joueurs qui ont le plus de cartes.
-- Les parties ne sont gardées que 30 jours (purge nocturne) : au-delà,
-- seuls « richest », « lifetime » et « collections » remontent plus loin.
-- ====================================================================

create or replace function public.admin_leaderboards(p_days integer default 30, p_members_only boolean default true)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me public.profiles := public.assert_staff();
  v_since timestamptz := case when coalesce(p_days, 0) <= 0 then '-infinity'::timestamptz
                              else now() - make_interval(days => least(p_days, 3650)) end;
  v_players jsonb;
  v_big_bets jsonb;
  v_big_wins jsonb;
  v_big_losses jsonb;
  v_richest jsonb;
  v_lifetime jsonb;
  v_collections jsonb;
begin
  select coalesce(jsonb_agg(t), '[]') into v_players
  from (
    select p.id, p.rp_first_name || ' ' || p.rp_last_name as name, p.citizen_id, p.role, p.avatar_url,
           count(*) as rounds,
           sum(b.bet_amount) as wagered,
           sum(b.win_amount) as paid,
           sum(b.win_amount) - sum(b.bet_amount) as net,
           max(b.bet_amount) as max_bet,
           mode() within group (order by b.game_id) as fav_game,
           max(b.created_at) as last_at
    from public.bets_history b
    join public.profiles p on p.id = b.profile_id
    where b.created_at >= v_since and (not p_members_only or p.role = 'MEMBRE')
    group by p.id
    order by sum(b.bet_amount) desc
    limit 1000
  ) t;

  select coalesce(jsonb_agg(t), '[]') into v_big_bets
  from (
    select p.id, p.rp_first_name || ' ' || p.rp_last_name as name, p.citizen_id, p.role, p.avatar_url,
           b.game_id, b.bet_amount, b.win_amount, b.created_at
    from public.bets_history b
    join public.profiles p on p.id = b.profile_id
    where b.created_at >= v_since and (not p_members_only or p.role = 'MEMBRE')
    order by b.bet_amount desc
    limit 10
  ) t;

  select coalesce(jsonb_agg(t), '[]') into v_big_wins
  from (
    select p.id, p.rp_first_name || ' ' || p.rp_last_name as name, p.citizen_id, p.role, p.avatar_url,
           b.game_id, b.bet_amount, b.win_amount, b.created_at
    from public.bets_history b
    join public.profiles p on p.id = b.profile_id
    where b.created_at >= v_since and b.win_amount > b.bet_amount and (not p_members_only or p.role = 'MEMBRE')
    order by b.win_amount - b.bet_amount desc
    limit 10
  ) t;

  select coalesce(jsonb_agg(t), '[]') into v_big_losses
  from (
    select p.id, p.rp_first_name || ' ' || p.rp_last_name as name, p.citizen_id, p.role, p.avatar_url,
           b.game_id, b.bet_amount, b.win_amount, b.created_at
    from public.bets_history b
    join public.profiles p on p.id = b.profile_id
    where b.created_at >= v_since and b.bet_amount > b.win_amount and (not p_members_only or p.role = 'MEMBRE')
    order by b.bet_amount - b.win_amount desc
    limit 10
  ) t;

  select coalesce(jsonb_agg(t), '[]') into v_richest
  from (
    select p.id, p.rp_first_name || ' ' || p.rp_last_name as name, p.citizen_id, p.role, p.avatar_url, p.chips as value
    from public.profiles p
    where not p_members_only or p.role = 'MEMBRE'
    order by p.chips desc
    limit 10
  ) t;

  select coalesce(jsonb_agg(t), '[]') into v_lifetime
  from (
    select p.id, p.rp_first_name || ' ' || p.rp_last_name as name, p.citizen_id, p.role, p.avatar_url,
           coalesce(p.total_wagered, 0) as value
    from public.profiles p
    where (not p_members_only or p.role = 'MEMBRE') and coalesce(p.total_wagered, 0) > 0
    order by p.total_wagered desc
    limit 10
  ) t;

  select coalesce(jsonb_agg(s order by s.sort_order, s.name), '[]') into v_collections
  from (
    select cs.id, cs.name, cs.sort_order,
           (select count(*) from public.collection_cards c where c.set_id = cs.id and c.active) as total,
           (select coalesce(jsonb_agg(t), '[]')
            from (
              select p.id, p.rp_first_name || ' ' || p.rp_last_name as name, p.citizen_id, p.role, p.avatar_url,
                     count(*) filter (where o.count > 0) as cards,
                     coalesce(sum(o.total_found), 0) as found,
                     exists (select 1 from public.collection_completions cc where cc.profile_id = p.id and cc.set_id = cs.id) as completed
              from public.collection_owned o
              join public.collection_cards c on c.id = o.card_id
              join public.profiles p on p.id = o.profile_id
              where c.set_id = cs.id and c.active and (not p_members_only or p.role = 'MEMBRE')
              group by p.id
              having count(*) filter (where o.count > 0) > 0
              order by count(*) filter (where o.count > 0) desc, sum(o.total_found) desc
              limit 10
            ) t) as top
    from public.collection_sets cs
    where cs.active
  ) s;

  return jsonb_build_object(
    'since', v_since, 'days', p_days, 'members_only', p_members_only,
    'players', v_players, 'big_bets', v_big_bets, 'big_wins', v_big_wins, 'big_losses', v_big_losses,
    'richest', v_richest, 'lifetime', v_lifetime, 'collections', v_collections
  );
end;
$$;

revoke execute on function public.admin_leaderboards(integer, boolean) from public, anon;
grant execute on function public.admin_leaderboards(integer, boolean) to authenticated;
