-- ====================================================================
-- MACHINES À SOUS : RTP des tours normaux réglable
-- ====================================================================
-- Les moteurs Dog House et Wanted rendent ≈ 90 % sur les tours normaux.
-- Nouveau réglage doghouse.spinRtp / wanted.spinRtp (60 à 90 %) : la
-- fonction Edge slot-round multiplie les gains des tours normaux (et
-- boostés) par spinRtp / 90. Les achats de bonus restent réglés par leur
-- prix. Valeur par défaut 90 : aucun changement tant qu'on n'y touche pas.
-- Nouveau réglage maxBuyBet : mise maximum pour acheter un bonus, en plus
-- de la limite calculée à partir du gain maximum.
-- ====================================================================

do $$
declare
  v_def text := pg_get_functiondef('public.normalize_games_config(jsonb)'::regprocedure);
  a1 text := $q$    'boostEnabled', public.jbool(d, 'boostEnabled', true),$q$;
  b1 text := $q$    'boostEnabled', public.jbool(d, 'boostEnabled', true),
    'spinRtp', public.jnum(d, 'spinRtp', 90, 60, 90),
    'maxBuyBet', round(public.jnum(d, 'maxBuyBet', 100000, 1, 10000000)),$q$;
  a2 text := $q$    'buyEnabled', public.jbool(w, 'buyEnabled', true),$q$;
  b2 text := $q$    'buyEnabled', public.jbool(w, 'buyEnabled', true),
    'spinRtp', public.jnum(w, 'spinRtp', 90, 60, 90),
    'maxBuyBet', round(public.jnum(w, 'maxBuyBet', 100000, 1, 10000000)),$q$;
begin
  if position(a1 in v_def) = 0 or position(a2 in v_def) = 0 then
    raise exception 'normalize_games_config: point d''insertion introuvable';
  end if;
  execute replace(replace(v_def, a1, b1), a2, b2);
end;
$$;

update public.casino_settings
set value = public.normalize_games_config(value), updated_at = now()
where key = 'games_config';
