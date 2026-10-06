-- =============================================================================
-- Collections : achat de plusieurs boosters d'un coup (×10)
-- =============================================================================
-- open_collection_packs(set, qty) achète et tire qty boosters (1 à 10) dans une
-- seule transaction : soit tous passent, soit aucun (solde ou limite du jour
-- insuffisants => rien n'est débité). Chaque booster passe par
-- open_collection_pack, donc mêmes taux, même historique, même récompense
-- d'album (créditée dans le booster qui complète l'album).
-- =============================================================================

create or replace function public.open_collection_packs(p_set_id text, p_qty int)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_set public.collection_sets;
  v_profile public.profiles;
  v_limit int;
  v_bought int;
  v_res jsonb;
  v_packs jsonb := '[]'::jsonb;
  i int;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED' using errcode = '28000';
  end if;
  if p_qty is null or p_qty < 1 or p_qty > 10 then
    raise exception 'INVALID_QTY' using errcode = 'P0001';
  end if;
  perform public.assert_game_open('collections');

  select * into v_set from public.collection_sets where id = p_set_id and active;
  if v_set.id is null then
    raise exception 'SET_NOT_FOUND' using errcode = 'P0002';
  end if;

  select * into v_profile from public.profiles where user_id = v_uid for update;
  if v_profile.id is null then
    raise exception 'PROFILE_REQUIRED' using errcode = 'P0002';
  end if;

  -- Vérifications globales avant le premier tirage
  v_limit := coalesce((public.games_config()->'collections'->>'dailyPackLimit')::int, 0);
  if v_limit > 0 then
    select count(*) into v_bought from public.collection_openings o
    where o.profile_id = v_profile.id and o.set_id = v_set.id and o.source = 'buy'
      and o.created_at >= public.collection_day_start();
    if v_bought + p_qty > v_limit then
      raise exception 'COLLECTION_DAILY_LIMIT' using errcode = 'P0001';
    end if;
  end if;
  if v_profile.chips < v_set.pack_price * p_qty then
    raise exception 'INSUFFICIENT_FUNDS' using errcode = 'P0001';
  end if;

  for i in 1..p_qty loop
    v_res := public.open_collection_pack(p_set_id, null);
    v_packs := v_packs || jsonb_build_array(v_res - 'profile');
  end loop;

  return jsonb_build_object(
    'set_id', v_set.id,
    'packs', v_packs,
    'profile', v_res->'profile'
  );
end;
$$;

revoke execute on function public.open_collection_packs(text, int) from public, anon, authenticated;
grant execute on function public.open_collection_packs(text, int) to authenticated;
