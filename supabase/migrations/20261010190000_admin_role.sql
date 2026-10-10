-- Nouveau rôle ADMIN (personnel) : mêmes droits que le DIRECTEUR CASINO.
-- Ajouté à la contrainte de la table profiles, puis à chaque fonction qui liste le personnel
-- (assert_staff, is_staff, profile_payload, admin_update_profile). Les définitions sont reprises
-- telles quelles depuis la base : seule la liste des rôles change, les droits d'exécution aussi.
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role = any (array['FONDATEUR'::text, 'DÉVELOPPEUR'::text, 'DIRECTEUR CASINO'::text, 'ADMIN'::text, 'MEMBRE'::text]));

do $$
declare
  r record;
begin
  for r in
    select p.oid as fid
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('assert_staff', 'is_staff', 'profile_payload', 'admin_update_profile')
  loop
    execute replace(pg_get_functiondef(r.fid), '''DIRECTEUR CASINO''', '''DIRECTEUR CASINO'', ''ADMIN''');
  end loop;
end;
$$;
