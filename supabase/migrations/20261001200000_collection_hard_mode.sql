-- ====================================================================
-- COLLECTIONS — mode difficile : un album se complète en plusieurs mois
-- ====================================================================
-- * Taux de tirage durcis : Épique 6 %, Légendaire 0,8 %, Mythique 0,3 % (par carte
--   tirée, à partager entre les cartes de la rareté), Secrète 0,05 %.
-- * Valeurs de revente fortement baissées :
--   Commune 100, Rare 250, Épique 750, Légendaire 2 500, Mythique 10 000,
--   Secrète 50 000 (revendues à 70 / 75 / 80 % selon le VIP).
-- * Limite d'achat : games_config.collections.dailyPackLimit boosters achetés
--   par album et par jour (heure de Paris), 3 par défaut, 0 = illimité.
--   Les boosters offerts (roue, direction) ne comptent pas.
-- * Récompense d'album inchangée : 1 000 000 jetons.
-- Simulation (5 cartes / booster, 3 boosters par jour) :
--   ~276 boosters en moyenne (≈ 6,9 M jetons), soit ~3 mois ;
--   5 % des joueurs les plus chanceux finissent en ~34 jours, 1 % en ~25 jours.
-- ====================================================================

-- 1. Réglage dailyPackLimit
do $$
declare
  v_def text := pg_get_functiondef('public.normalize_games_config(jsonb)'::regprocedure);
  a1 text := $q$    'packMaxRtp', public.jnum(k, 'packMaxRtp', 60, 0, 100),$q$;
  b1 text := $q$    'packMaxRtp', public.jnum(k, 'packMaxRtp', 60, 0, 100),
    'dailyPackLimit', round(public.jnum(k, 'dailyPackLimit', 3, 0, 1000)),$q$;
begin
  if position(a1 in v_def) = 0 then
    raise exception 'normalize_games_config: point d''insertion introuvable';
  end if;
  execute replace(v_def, a1, b1);
end;
$$;

update public.casino_settings
set value = public.normalize_games_config(value), updated_at = now()
where key = 'games_config';

-- Début de la journée en cours (heure de Paris)
create or replace function public.collection_day_start()
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select date_trunc('day', now() at time zone 'Europe/Paris') at time zone 'Europe/Paris';
$$;

create index if not exists collection_openings_buy_idx
  on public.collection_openings (profile_id, set_id, created_at desc) where source = 'buy';

-- 2. Ouverture : refus au-delà de la limite du jour (achats seulement)
do $$
declare
  v_def text := pg_get_functiondef('public.open_collection_pack(text, uuid)'::regprocedure);
  a1 text := $q$    v_price := v_set.pack_price;
    if v_profile.chips < v_price then$q$;
  b1 text := $q$    v_price := v_set.pack_price;
    if coalesce((public.games_config()->'collections'->>'dailyPackLimit')::int, 0) > 0
       and (select count(*) from public.collection_openings o
            where o.profile_id = v_profile.id and o.set_id = v_set.id and o.source = 'buy'
              and o.created_at >= public.collection_day_start())
           >= (public.games_config()->'collections'->>'dailyPackLimit')::int then
      raise exception 'COLLECTION_DAILY_LIMIT' using errcode = 'P0001';
    end if;
    if v_profile.chips < v_price then$q$;
begin
  if position(a1 in v_def) = 0 then
    raise exception 'open_collection_pack: point d''insertion introuvable';
  end if;
  execute replace(v_def, a1, b1);
end;
$$;

-- 3. Albums du joueur : boosters achetés aujourd'hui par album
do $$
declare
  v_def text := pg_get_functiondef('public.my_collections()'::regprocedure);
  a1 text := $q$    'openings', (select count(*) from public.collection_openings where profile_id = v_profile_id)$q$;
  b1 text := $q$    'openings', (select count(*) from public.collection_openings where profile_id = v_profile_id),
    'bought_today', coalesce((select jsonb_object_agg(set_id, n) from (
                       select o.set_id, count(*) n from public.collection_openings o
                       where o.profile_id = v_profile_id and o.source = 'buy' and o.set_id is not null
                         and o.created_at >= public.collection_day_start()
                       group by o.set_id) x), '{}')$q$;
begin
  if position(a1 in v_def) = 0 then
    raise exception 'my_collections: point d''insertion introuvable';
  end if;
  execute replace(v_def, a1, b1);
end;
$$;

-- 4. Économie
update public.collection_rarities set sell_value = v.val, updated_at = now()
from (values ('COMMUNE', 100), ('RARE', 250), ('EPIQUE', 750), ('LEGENDAIRE', 2500), ('MYTHIQUE', 10000), ('SECRETE', 50000)) as v(key, val)
where collection_rarities.key = v.key;

update public.collection_sets
set rarity_weights = '{"COMMUNE": 70.85, "RARE": 22, "EPIQUE": 6, "LEGENDAIRE": 0.8, "MYTHIQUE": 0.3, "SECRETE": 0.05}'::jsonb,
    updated_at = now()
where id in ('autos', 'mode');

select public.assert_collections_profitable(null);
