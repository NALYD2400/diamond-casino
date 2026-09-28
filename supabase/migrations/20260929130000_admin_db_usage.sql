-- Espace disque utilisé par la base (plan gratuit Supabase : 500 Mo) et volume de l'historique.
create or replace function public.admin_db_usage()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.assert_staff();
  return jsonb_build_object(
    'db_bytes', pg_database_size(current_database()),
    'limit_bytes', 524288000,
    'rounds', (select count(*) from public.bets_history),
    'transactions', (select count(*) from public.casino_transactions),
    'logs', (select count(*) from public.admin_logs),
    'oldest_round', (select min(created_at) from public.bets_history),
    'rounds_24h', (select count(*) from public.bets_history where created_at >= now() - interval '24 hours')
  );
end;
$$;

revoke execute on function public.admin_db_usage() from public, anon;
grant execute on function public.admin_db_usage() to authenticated;
