-- Suppression d'une fiche : même hiérarchie que les autres actions de gérance.
-- Un FONDATEUR ne peut plus supprimer un DÉVELOPPEUR (seul un DÉVELOPPEUR touche un profil DÉVELOPPEUR).
create or replace function public.admin_delete_profile(p_profile_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me public.profiles := public.assert_staff();
  v_target public.profiles;
begin
  select * into v_target from public.profiles where id = p_profile_id;
  if v_target.id is null then
    raise exception 'PROFILE_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_target.id = v_me.id then
    raise exception 'CANNOT_DELETE_SELF' using errcode = '42501';
  end if;
  if v_target.role <> 'MEMBRE' and not public.can_manage_roles() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if v_target.role = 'FONDATEUR' and v_me.role <> 'FONDATEUR' then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  perform public.assert_can_manage(v_me, v_target);

  update public.bets_history set profile_id = null where profile_id = p_profile_id;
  update public.casino_transactions set profile_id = null where profile_id = p_profile_id;
  delete from public.profiles where id = p_profile_id;

  insert into public.admin_logs (action, category, detail, author)
  values ('Citoyen supprimé', 'CITIZEN',
          'Fiche #' || coalesce(v_target.citizen_id, '?') || ' (' || coalesce(v_target.rp_first_name, '') || ' ' || coalesce(v_target.rp_last_name, '') || ') supprimée',
          coalesce(v_me.rp_first_name || ' ' || v_me.rp_last_name, 'Console Admin'));
end;
$$;
