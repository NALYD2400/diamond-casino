-- ====================================================================
-- Temps réel des soldes + index manquant
-- ====================================================================
-- Le site écoute les mises à jour de public.profiles (synchro du solde
-- entre onglets / appareils), mais la table n'était pas publiée :
-- l'abonnement ne recevait jamais rien. Le RLS s'applique au temps réel :
-- un joueur ne reçoit que sa propre ligne, le staff toutes.
-- ====================================================================
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'profiles'
  ) then
    alter publication supabase_realtime add table public.profiles;
  end if;
end $$;

create index if not exists player_rewards_vehicle_model_idx on public.player_rewards (vehicle_model);
