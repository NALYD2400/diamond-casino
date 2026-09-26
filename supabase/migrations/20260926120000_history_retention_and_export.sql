-- ====================================================================
-- Conservation de l'historique : 30 jours + export pour le staff
-- ====================================================================
-- Chaque manche ajoute une ligne dans bets_history et casino_transactions
-- (~0,8 Ko). Sur le plan gratuit (500 Mo), la base serait pleine en
-- quelques mois : on purge chaque nuit les lignes de JEU de plus de 30 jours.
--
-- Ce qui est purgé :
--   * bets_history (toutes les manches)
--   * casino_transactions de type BET / WIN / WHEEL
--   * mines_rounds terminées (jamais une manche ACTIVE)
-- Ce qui est conservé pour toujours : VIP, ajustements admin, dépôts,
-- retraits, journal admin, récompenses.
--
-- Avant la purge, le staff peut télécharger tout l'historique encore en
-- base depuis la console (Système → Historique) via admin_export_history.
-- ====================================================================

create extension if not exists pg_cron with schema pg_catalog;
grant usage on schema cron to postgres;

-- Index pour la purge et l'export (tri chronologique)
create index if not exists bets_history_created_at_idx on public.bets_history (created_at, id);
create index if not exists casino_transactions_created_at_idx on public.casino_transactions (created_at, id);

-- --------------------------------------------------------------------
-- Purge (appelée uniquement par pg_cron, jamais depuis le site)
-- --------------------------------------------------------------------
create or replace function public.purge_old_history(p_days integer default 30)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_before timestamptz := now() - make_interval(days => greatest(coalesce(p_days, 30), 7));
  v_bets bigint;
  v_tx bigint;
  v_mines bigint;
begin
  delete from public.bets_history where created_at < v_before;
  get diagnostics v_bets = row_count;

  delete from public.casino_transactions
  where created_at < v_before and type in ('BET', 'WIN', 'WHEEL');
  get diagnostics v_tx = row_count;

  delete from public.mines_rounds
  where status <> 'ACTIVE' and coalesce(ended_at, created_at) < v_before;
  get diagnostics v_mines = row_count;

  if v_bets + v_tx + v_mines > 0 then
    insert into public.admin_logs (action, category, detail, author)
    values (
      'Purge automatique de l''historique',
      'SYSTEM',
      format('%s manches, %s transactions de jeu et %s manches Mines de plus de %s jours supprimées.',
             v_bets, v_tx, v_mines, greatest(coalesce(p_days, 30), 7)),
      'Système'
    );
  end if;

  return jsonb_build_object('bets', v_bets, 'transactions', v_tx, 'mines', v_mines);
end;
$$;

revoke execute on function public.purge_old_history(integer) from public, anon, authenticated;

-- Tous les jours à 04:17 UTC (heure creuse)
select cron.schedule('purge-old-history', '17 4 * * *', $$select public.purge_old_history(30)$$);

-- --------------------------------------------------------------------
-- Export pour le staff, page par page (pagination par curseur)
-- --------------------------------------------------------------------
create or replace function public.admin_export_history(
  p_kind text,
  p_after_created timestamptz default null,
  p_after_id uuid default null,
  p_limit integer default 2000
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me public.profiles := public.assert_staff();
  v_limit integer := least(greatest(coalesce(p_limit, 2000), 1), 5000);
  v_rows jsonb;
begin
  if p_kind = 'bets' then
    select coalesce(jsonb_agg(r order by r.created_at, r.id), '[]')
    into v_rows
    from (
      select b.id, b.created_at, b.game_id, b.bet_amount, b.win_amount, b.multiplier,
             p.citizen_id, p.rp_first_name, p.rp_last_name
      from public.bets_history b
      left join public.profiles p on p.id = b.profile_id
      where p_after_created is null or (b.created_at, b.id) > (p_after_created, p_after_id)
      order by b.created_at, b.id
      limit v_limit
    ) r;
  elsif p_kind = 'transactions' then
    select coalesce(jsonb_agg(r order by r.created_at, r.id), '[]')
    into v_rows
    from (
      select t.id, t.created_at, t.type, t.game, t.amount, t.chips, t.status, t.description,
             p.citizen_id, p.rp_first_name, p.rp_last_name
      from public.casino_transactions t
      left join public.profiles p on p.id = t.profile_id
      where p_after_created is null or (t.created_at, t.id) > (p_after_created, p_after_id)
      order by t.created_at, t.id
      limit v_limit
    ) r;
  else
    raise exception 'INVALID_KIND' using errcode = '22023';
  end if;

  return v_rows;
end;
$$;

revoke execute on function public.admin_export_history(text, timestamptz, uuid, integer) from public, anon;
grant execute on function public.admin_export_history(text, timestamptz, uuid, integer) to authenticated;
