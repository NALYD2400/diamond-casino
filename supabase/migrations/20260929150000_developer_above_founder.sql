-- Hiérarchie : DÉVELOPPEUR > FONDATEUR > DIRECTEUR CASINO > MEMBRE
--   * Le DÉVELOPPEUR gère toutes les fiches, y compris celles des fondateurs.
--   * Le FONDATEUR gère les fiches des fondateurs et en dessous, mais plus celles des développeurs.
--   * Le DÉVELOPPEUR peut se créditer lui-même (comme le FONDATEUR).

create or replace function public.assert_can_manage(v_me public.profiles, v_target public.profiles)
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if v_target.id = v_me.id then
    return;
  end if;
  if v_target.role = 'DÉVELOPPEUR' and v_me.role <> 'DÉVELOPPEUR' then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if v_target.role = 'FONDATEUR' and v_me.role not in ('FONDATEUR', 'DÉVELOPPEUR') then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
end;
$$;

create or replace function public.assert_not_self_credit(v_me public.profiles, p_target_id uuid)
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if v_me.id = p_target_id and v_me.role not in ('FONDATEUR', 'DÉVELOPPEUR') then
    raise exception 'FORBIDDEN_SELF' using errcode = 'P0001';
  end if;
end;
$$;

-- Changement de rôle : toucher au rôle DÉVELOPPEUR est réservé aux développeurs,
-- toucher au rôle FONDATEUR aux fondateurs et développeurs.
do $$
declare
  v_def text;
  v_old text;
  v_new text;
begin
  v_def := pg_get_functiondef('public.admin_update_profile(uuid, jsonb)'::regprocedure);
  v_old := $q$    if (v_role = 'FONDATEUR' or v_old.role = 'FONDATEUR') and v_me.role <> 'FONDATEUR' then$q$;
  v_new := $q$    if (v_role = 'DÉVELOPPEUR' or v_old.role = 'DÉVELOPPEUR') and v_me.role <> 'DÉVELOPPEUR' then
      raise exception 'FORBIDDEN_ROLE_CHANGE' using errcode = '42501';
    end if;
    if (v_role = 'FONDATEUR' or v_old.role = 'FONDATEUR') and v_me.role not in ('FONDATEUR', 'DÉVELOPPEUR') then$q$;
  if position(v_old in v_def) = 0 then
    raise exception 'admin_update_profile: point d''insertion introuvable';
  end if;
  execute replace(v_def, v_old, v_new);
end;
$$;

revoke execute on function public.assert_not_self_credit(public.profiles, uuid) from public, anon, authenticated;
