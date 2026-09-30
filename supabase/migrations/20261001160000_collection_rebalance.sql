-- ====================================================================
-- COLLECTIONS — rééquilibrage : l'argent vient surtout de l'album complet
-- ====================================================================
-- * Valeur des cartes baissée (revente à 70 / 75 / 80 % selon le VIP) :
--   Commune 500, Rare 1 000, Épique 3 000, Légendaire 8 000, Mythique 30 000.
--   Les secrètes (hors album) restent le jackpot : 100 000.
-- * Album un peu plus accessible : Légendaire 4,9 %, Mythique 1 % par carte.
-- Simulation (taux Diamond) : ~75 boosters pour les autos, ~68 pour la mode ;
-- la récompense de 1 000 000 pèse ~75 % de ce que le joueur récupère.
-- ====================================================================

update public.collection_rarities set sell_value = v.val, updated_at = now()
from (values ('COMMUNE', 500), ('RARE', 1000), ('EPIQUE', 3000), ('LEGENDAIRE', 8000), ('MYTHIQUE', 30000), ('SECRETE', 100000)) as v(key, val)
where collection_rarities.key = v.key;

update public.collection_sets
set rarity_weights = '{"COMMUNE": 57, "RARE": 27, "EPIQUE": 10, "LEGENDAIRE": 4.9, "MYTHIQUE": 1.0, "SECRETE": 0.1}'::jsonb,
    updated_at = now()
where id in ('autos', 'mode');

select public.assert_collections_profitable(null);
