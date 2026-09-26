-- get_my_profile faisait un UPDATE de profiles à chaque appel, même sans
-- changement. Chaque UPDATE déclenche un événement Realtime, auquel le client
-- répond en rappelant get_my_profile : boucle infinie (~10 req/s par onglet).
-- On n'écrit désormais que si une valeur change réellement.
create or replace function public.get_my_profile()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_profile public.profiles;
  v_identity record;
  v_avatar text;
  v_tag text;
  v_vip text;
  v_vip_expires timestamptz;
begin
  if v_uid is null then
    return null;
  end if;

  select provider_id, identity_data into v_identity
  from auth.identities
  where user_id = v_uid and provider = 'discord'
  limit 1;

  select * into v_profile from public.profiles where user_id = v_uid;

  if v_profile.id is null and v_identity.provider_id is not null then
    update public.profiles
    set user_id = v_uid
    where discord_id = v_identity.provider_id and user_id is null
    returning * into v_profile;
  end if;

  if v_profile.id is null then
    return null;
  end if;

  v_avatar := coalesce(nullif(v_identity.identity_data->>'avatar_url', ''), v_profile.avatar_url);
  v_tag := coalesce(
    nullif(v_identity.identity_data->'custom_claims'->>'global_name', ''),
    nullif(v_identity.identity_data->>'full_name', ''),
    v_profile.discord_tag
  );
  v_vip := public.active_vip(v_profile.vip_tier, v_profile.vip_expires_at);
  v_vip_expires := case when v_vip is null then null else v_profile.vip_expires_at end;

  if (v_avatar, v_tag, v_vip, v_vip_expires)
     is distinct from (v_profile.avatar_url, v_profile.discord_tag, v_profile.vip_tier, v_profile.vip_expires_at) then
    update public.profiles
    set avatar_url = v_avatar,
        discord_tag = v_tag,
        vip_tier = v_vip,
        vip_expires_at = v_vip_expires
    where id = v_profile.id
    returning * into v_profile;
  end if;

  return public.profile_payload(v_profile);
end;
$$;
