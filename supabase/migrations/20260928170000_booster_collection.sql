-- ====================================================================
-- BOOSTERS — « Ma collection » (Espace Membre)
-- ====================================================================
-- Toutes les cartes obtenues par le joueur connecté (d'après l'historique de
-- ses ouvertures), avec le nombre d'exemplaires et la date d'obtention. Les
-- cartes supprimées depuis par la direction sont ignorées.
-- ====================================================================

create or replace function public.my_booster_collection()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_profile_id uuid;
  v_cards jsonb;
  v_openings int;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED' using errcode = '28000';
  end if;
  select id into v_profile_id from public.profiles where user_id = v_uid;
  if v_profile_id is null then
    raise exception 'PROFILE_REQUIRED' using errcode = 'P0002';
  end if;

  select count(*) into v_openings from public.booster_openings where profile_id = v_profile_id;

  select coalesce(jsonb_agg(public.booster_card_json(c) || jsonb_build_object('count', t.cnt, 'first_at', t.first_at, 'last_at', t.last_at)
                            order by t.last_at desc), '[]')
  into v_cards
  from (
    select (e->>'card_id')::uuid as card_id, count(*) cnt, min(o.created_at) first_at, max(o.created_at) last_at
    from public.booster_openings o, jsonb_array_elements(o.cards) e
    where o.profile_id = v_profile_id and e->>'card_id' is not null
    group by 1
  ) t
  join public.booster_cards c on c.id = t.card_id;

  return jsonb_build_object('openings', v_openings, 'cards', v_cards);
end;
$$;

revoke execute on function public.my_booster_collection() from public, anon, authenticated;
grant execute on function public.my_booster_collection() to authenticated;
