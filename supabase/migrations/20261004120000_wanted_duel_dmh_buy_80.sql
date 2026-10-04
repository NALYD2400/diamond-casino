-- ====================================================================
-- WANTED — achat de Duel at Dawn et Dead Man's Hand rétabli à ≈ 80 % de retour
-- ====================================================================
-- Simulation des moteurs (500 000 bonus achetés, mise ≤ 100, plafond ×1 000) :
--   Duel at Dawn ≈ ×107,4 la mise · Dead Man's Hand ≈ ×175,5 la mise
--   → prix ×134 et ×219 = retour ≈ 80 %.
-- L'achat de ces deux bonus est limité aux mises ≤ 100 (maxBuyBet dans wantedEngine.ts,
-- fonction Edge slot-round) : au-delà, le plafond de gain coupe leur valeur.
-- Ici : planchers serveur des prix abaissés à ×134 / ×219 et réglage enregistré aligné.
-- ====================================================================

do $$
declare
  v_def text := pg_get_functiondef('public.normalize_games_config(jsonb)'::regprocedure);
  r text[] := array[
    $q$'duel', public.jnum(wp, 'duel', 204, 204, 5000)$q$,
    $q$'dmh', public.jnum(wp, 'dmh', 406, 406, 5000)$q$
  ];
  n text[] := array[
    $q$'duel', public.jnum(wp, 'duel', 134, 134, 5000)$q$,
    $q$'dmh', public.jnum(wp, 'dmh', 219, 219, 5000)$q$
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
      jsonb_set(jsonb_set(value,
        '{wanted,buyPrices,duel}', '134'::jsonb),
        '{wanted,buyPrices,dmh}', '219'::jsonb)),
    updated_at = now()
where key = 'games_config';
