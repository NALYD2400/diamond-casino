-- Une fiche joueur exige un compte Discord : un compte créé par e-mail (provider
-- « email » activé dans Supabase Auth) ne peut pas s'inscrire au casino, ce qui
-- empêche les multi-comptes sans Discord.
create or replace function public.register_profile(p_first_name text, p_last_name text, p_citizen_id text, p_phone text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_identity record;
  v_email text;
  v_profile public.profiles;
  v_first text := trim(p_first_name);
  v_last text := trim(p_last_name);
  v_cid text := trim(p_citizen_id);
  v_phone text := nullif(trim(coalesce(p_phone, '')), '');
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED' using errcode = '28000';
  end if;
  if exists (select 1 from public.profiles where user_id = v_uid) then
    raise exception 'PROFILE_EXISTS' using errcode = '23505';
  end if;

  select provider_id, identity_data into v_identity
  from auth.identities
  where user_id = v_uid and provider = 'discord'
  limit 1;
  if v_identity.provider_id is null then
    raise exception 'DISCORD_REQUIRED' using errcode = '28000';
  end if;

  perform public.validate_rp_identity(v_first, v_last, v_cid, v_phone);

  if exists (select 1 from public.profiles where citizen_id = v_cid) then
    raise exception 'CITIZEN_ID_TAKEN' using errcode = '23505';
  end if;

  select email into v_email from auth.users where id = v_uid;

  if exists (select 1 from public.profiles where discord_id = v_identity.provider_id) then
    raise exception 'PROFILE_EXISTS' using errcode = '23505';
  end if;

  insert into public.profiles (
    user_id, discord_id, discord_tag, avatar_url, email,
    rp_first_name, rp_last_name, citizen_id, phone_number,
    role, chips, cash, inventory, vehicles
  ) values (
    v_uid,
    v_identity.provider_id,
    coalesce(v_identity.identity_data->'custom_claims'->>'global_name', v_identity.identity_data->>'full_name'),
    v_identity.identity_data->>'avatar_url',
    v_email,
    v_first, v_last, v_cid, v_phone,
    'MEMBRE', 0, 0, array['Pass Membre Diamond'], '{}'
  )
  returning * into v_profile;

  return public.profile_payload(v_profile);
end;
$$;
