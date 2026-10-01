-- ====================================================================
-- AUDIT RENTABILITÉ — tous les jeux autour de 90 % de retour joueur
-- ====================================================================
-- Simulation des vrais moteurs avant recalage (retour joueur) :
--   Dog House : spin 94,7 %  boost 92,4 %  achat ×115 → 95,3 %
--   Wanted    : tour ≈ 96 %  GTR ×80 → 96,7 %  Duel ×204 → 97,2 %  DMH ×406 → 94,5 %
-- Les machines sont recalées à ≈ 90 % dans les moteurs (fonction Edge slot-round :
-- npm run sync:edge puis redéploiement), avec un GAIN MAXIMUM SELON LA MISE :
--   mise ≤ 100 : ×1 000 · mise 500 : 100 000 (×200) · mise 10 000 : 290 000 (×29)
--   (maxWinFor dans dogHouseEngine.ts / wantedEngine.ts). Un coefficient de gains par palier
--   de mise compense la perte de retour due au plafond. L'achat de bonus est limité aux
--   mises où il reste équitable (Dog House ≤ 333, Great Train Robbery ≤ 500) ; Duel at Dawn
--   et Dead Man's Hand ne s'achètent plus (leur valeur vient de gains énormes qu'un plafond coupe).
--
-- Ici, côté base :
--  * Mines / Crash : RTP par défaut et réglage enregistré ramenés à 90 %
--    (une valeur déjà plus basse est conservée).
--  * Roue : plafond de retour 90 %. Boosters et collections étaient déjà à 90 %.
--  * Planchers serveur des prix d'achat Wanted alignés sur la console :
--    Duel ×204 et DMH ×406 (le serveur acceptait encore ×200 / ×400).
--  * Les plafonds « retour maximum » (roue, boosters, collections) ne peuvent
--    plus dépasser 98 % (avant : 100 % = aucune marge).
-- ====================================================================

do $$
declare
  v_def text := pg_get_functiondef('public.normalize_games_config(jsonb)'::regprocedure);
  r text[] := array[
    $q$'duel', public.jnum(wp, 'duel', 200, 200, 5000)$q$,
    $q$'dmh', public.jnum(wp, 'dmh', 400, 400, 5000)$q$,
    $q$'maxRtp', public.jnum(r, 'maxRtp', 95, 10, 100)$q$,
    $q$'maxRtp', public.jnum(b, 'maxRtp', 90, 10, 100)$q$,
    $q$'maxRtp', public.jnum(k, 'maxRtp', 90, 10, 100)$q$,
    $q$'rtp', public.jnum(m, 'rtp', 97, 80, 99.5)$q$,
    $q$'rtp', round(public.jnum(c, 'rtp', 97, 80, 99), 1)$q$
  ];
  n text[] := array[
    $q$'duel', public.jnum(wp, 'duel', 204, 204, 5000)$q$,
    $q$'dmh', public.jnum(wp, 'dmh', 406, 406, 5000)$q$,
    $q$'maxRtp', public.jnum(r, 'maxRtp', 90, 10, 98)$q$,
    $q$'maxRtp', public.jnum(b, 'maxRtp', 90, 10, 98)$q$,
    $q$'maxRtp', public.jnum(k, 'maxRtp', 90, 10, 98)$q$,
    $q$'rtp', public.jnum(m, 'rtp', 90, 80, 99.5)$q$,
    $q$'rtp', round(public.jnum(c, 'rtp', 90, 80, 99), 1)$q$
  ];
  i int;
begin
  for i in 1 .. array_length(r, 1) loop
    if position(r[i] in v_def) = 0 then
      raise exception 'normalize_games_config: point d''insertion % introuvable', i;
    end if;
    v_def := replace(v_def, r[i], n[i]);
  end loop;
  execute v_def;
end;
$$;

-- Réglages déjà enregistrés
update public.casino_settings
set value = public.normalize_games_config(
      jsonb_set(jsonb_set(jsonb_set(value,
        '{mines,rtp}', to_jsonb(least(coalesce((value #>> '{mines,rtp}')::numeric, 90), 90))),
        '{crash,rtp}', to_jsonb(least(coalesce((value #>> '{crash,rtp}')::numeric, 90), 90))),
        '{wheel,maxRtp}', to_jsonb(least(coalesce((value #>> '{wheel,maxRtp}')::numeric, 90), 90)))),
    updated_at = now()
where key = 'games_config';
