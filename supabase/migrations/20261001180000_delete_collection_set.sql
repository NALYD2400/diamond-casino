-- ====================================================================
-- COLLECTIONS — suppression d'un album depuis la console
-- ====================================================================
-- Refusée si des joueurs ont déjà ouvert des boosters de l'album (leurs cartes
-- et une éventuelle récompense en dépendent : il faut alors le cacher), ou si
-- un lot de la roue donne encore un booster de cet album.
-- Les boosters offerts encore non ouverts restent utilisables sur les autres albums.
-- ====================================================================

create or replace function public.admin_delete_collection_set(p_id text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me public.profiles := public.assert_staff();
  v_name text;
begin
  select name into v_name from public.collection_sets where id = p_id;
  if v_name is null then
    raise exception 'SET_NOT_FOUND' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.collection_openings where set_id = p_id)
     or exists (select 1 from public.collection_owned o join public.collection_cards c on c.id = o.card_id where c.set_id = p_id) then
    raise exception 'SET_IN_USE' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.casino_settings s, jsonb_array_elements(s.value) e
             where s.key = 'wheel_segments' and jsonb_typeof(s.value) = 'array'
               and e->>'type' = 'pack' and e->>'packSet' = p_id) then
    raise exception 'SET_ON_WHEEL' using errcode = 'P0001';
  end if;

  delete from public.collection_sets where id = p_id;

  insert into public.admin_logs (action, category, detail, author)
  values ('Collection supprimée', 'BOOSTER', v_name,
          coalesce(v_me.rp_first_name || ' ' || v_me.rp_last_name, 'Console Admin'));
end;
$$;

revoke execute on function public.admin_delete_collection_set(text) from public, anon, authenticated;
grant execute on function public.admin_delete_collection_set(text) to authenticated;
