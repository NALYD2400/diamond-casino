-- ====================================================================
-- Temps réel des réglages (ouverture/fermeture des machines, maintenance…)
-- ====================================================================
-- Les pages des joueurs écoutent casino_settings : une machine fermée depuis
-- la console affiche son bandeau « fermée » immédiatement, sans attendre le
-- rechargement périodique. La table est déjà en lecture publique (RLS).
-- ====================================================================
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'casino_settings'
  ) then
    alter publication supabase_realtime add table public.casino_settings;
  end if;
end $$;
