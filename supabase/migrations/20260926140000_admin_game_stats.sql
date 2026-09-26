-- ====================================================================
-- Statistiques détaillées par machine (console → Machines)
-- ====================================================================
-- Tout est calculé à partir de bets_history (30 derniers jours max. après
-- la purge nocturne) : résumé, répartition par mode / nombre de mines /
-- lot, distribution des gains, activité par jour et par heure, joueurs
-- gagnants et perdants, plus gros gains.
-- ====================================================================

create or replace function public.admin_game_stats(p_game text, p_days integer default 7)
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
  v_summary jsonb;
  v_breakdown jsonb;
  v_distribution jsonb;
  v_daily jsonb;
  v_hours jsonb;
  v_winners jsonb;
  v_losers jsonb;
  v_biggest jsonb;
begin
  if p_game not in ('mines', 'doghouse', 'wanted', 'lucky_wheel') then
    raise exception 'INVALID_GAME' using errcode = '22023';
  end if;

  select jsonb_build_object(
    'rounds', count(*),
    'players', count(distinct profile_id),
    'wagered', coalesce(sum(bet_amount), 0),
    'paid', coalesce(sum(win_amount), 0),
    'profit', coalesce(sum(bet_amount) - sum(win_amount), 0),
    'rtp', case when sum(bet_amount) > 0 then round(sum(win_amount)::numeric * 100 / sum(bet_amount), 2) end,
    'avg_bet', case when count(*) > 0 then round(avg(bet_amount)) else 0 end,
    'win_rate', case when count(*) > 0 then round(count(*) filter (where win_amount > 0)::numeric * 100 / count(*), 1) end,
    'bonus_rounds', count(*) filter (where result_data->>'bonus' is not null and coalesce(result_data->>'mode', '') <> 'buy'),
    'biggest_win', coalesce(max(win_amount), 0),
    'biggest_multiplier', coalesce(max(multiplier), 0),
    'first_at', min(created_at),
    'last_at', max(created_at)
  ) into v_summary
  from (select * from public.bets_history where game_id = p_game and created_at >= v_since) r;

  -- Répartition : mode de jeu (slots), nombre de mines (Mines) ou lot (roue)
  select coalesce(jsonb_agg(b order by b.wagered desc, b.rounds desc), '[]') into v_breakdown
  from (
    select key, count(*) rounds, count(distinct profile_id) players,
           coalesce(sum(bet_amount), 0) wagered, coalesce(sum(win_amount), 0) paid,
           case when sum(bet_amount) > 0 then round(sum(win_amount)::numeric * 100 / sum(bet_amount), 1) end rtp
    from (
      select *,
             case
               when p_game = 'mines' then coalesce(result_data->>'mines', '?')
               when p_game = 'lucky_wheel' then coalesce(result_data->>'segment', '?')
               when result_data->>'mode' = 'buy' and p_game = 'wanted' then 'buy_' || coalesce(result_data->>'bonus', '?')
               else coalesce(result_data->>'mode', 'spin')
             end as key
      from (select * from public.bets_history where game_id = p_game and created_at >= v_since) r
    ) k
    group by key
  ) b;

  -- Distribution des gains en multiple de la mise
  select coalesce(jsonb_agg(d order by d.ord), '[]') into v_distribution
  from (
    select ord, label, count(*) rounds, coalesce(sum(win_amount), 0) paid
    from (
      select win_amount,
             case
               when win_amount = 0 then 0
               when bet_amount = 0 then 7
               when win_amount::numeric / bet_amount < 1 then 1
               when win_amount::numeric / bet_amount < 2 then 2
               when win_amount::numeric / bet_amount < 5 then 3
               when win_amount::numeric / bet_amount < 20 then 4
               when win_amount::numeric / bet_amount < 100 then 5
               else 6
             end as ord
      from (select * from public.bets_history where game_id = p_game and created_at >= v_since) r
    ) x
    join (values (0, 'Perdu'), (1, '< ×1'), (2, '×1 – ×2'), (3, '×2 – ×5'), (4, '×5 – ×20'),
                 (5, '×20 – ×100'), (6, '×100 et +'), (7, 'Gratuit')) as l(o, label) on l.o = x.ord
    group by ord, label
  ) d;

  select coalesce(jsonb_agg(d order by d.day), '[]') into v_daily
  from (
    select to_char(date_trunc('day', created_at at time zone 'Europe/Paris'), 'YYYY-MM-DD') as day,
           count(*) rounds, count(distinct profile_id) players,
           coalesce(sum(bet_amount), 0) wagered, coalesce(sum(win_amount), 0) paid
    from (select * from public.bets_history where game_id = p_game and created_at >= v_since) r
    group by 1
  ) d;

  select coalesce(jsonb_agg(h order by h.hour), '[]') into v_hours
  from (
    select extract(hour from created_at at time zone 'Europe/Paris')::int as hour, count(*) rounds
    from (select * from public.bets_history where game_id = p_game and created_at >= v_since) r
    group by 1
  ) h;

  select coalesce(jsonb_agg(t order by t.net desc), '[]') into v_winners
  from (
    select p.id, p.rp_first_name || ' ' || p.rp_last_name as name, p.citizen_id, p.role,
           count(*) rounds, sum(g.bet_amount) wagered, sum(g.win_amount) paid, sum(g.win_amount) - sum(g.bet_amount) net
    from (select * from public.bets_history where game_id = p_game and created_at >= v_since) g
    join public.profiles p on p.id = g.profile_id
    group by p.id
    having sum(g.win_amount) - sum(g.bet_amount) > 0
    order by net desc
    limit 5
  ) t;

  select coalesce(jsonb_agg(t order by t.net), '[]') into v_losers
  from (
    select p.id, p.rp_first_name || ' ' || p.rp_last_name as name, p.citizen_id, p.role,
           count(*) rounds, sum(g.bet_amount) wagered, sum(g.win_amount) paid, sum(g.win_amount) - sum(g.bet_amount) net
    from (select * from public.bets_history where game_id = p_game and created_at >= v_since) g
    join public.profiles p on p.id = g.profile_id
    group by p.id
    having sum(g.win_amount) - sum(g.bet_amount) < 0
    order by net
    limit 5
  ) t;

  select coalesce(jsonb_agg(t order by t.win desc), '[]') into v_biggest
  from (
    select g.created_at, g.bet_amount bet, g.win_amount win, g.multiplier, g.result_data,
           p.rp_first_name || ' ' || p.rp_last_name as name, p.citizen_id
    from (select * from public.bets_history where game_id = p_game and created_at >= v_since) g
    left join public.profiles p on p.id = g.profile_id
    where g.win_amount > 0
    order by g.win_amount desc
    limit 5
  ) t;

  return jsonb_build_object(
    'game', p_game, 'days', p_days, 'since', v_since,
    'summary', v_summary, 'breakdown', v_breakdown, 'distribution', v_distribution,
    'daily', v_daily, 'hours', v_hours, 'winners', v_winners, 'losers', v_losers, 'biggest', v_biggest
  );
end;
$$;

revoke execute on function public.admin_game_stats(text, integer) from public, anon;
grant execute on function public.admin_game_stats(text, integer) to authenticated;
create index if not exists bets_history_game_created_idx on public.bets_history (game_id, created_at);
