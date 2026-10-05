-- ====================================================================
-- THE DOG HOUSE : bonus plus fréquent, plus petit
-- ====================================================================
-- Moteur (fonction Edge slot-round) : bonus ≈ 1 tour sur 195 au lieu de 1 sur 348
-- (Boost ≈ 1 sur 115), gains des tours gratuits × 0,584 : un bonus vaut ≈ 63x la mise
-- au lieu de ≈ 100x, retour total inchangé. Achat possible jusqu'à la mise 400.
-- Ici : plancher du prix d'achat ramené de ×115 à ×67 (≈ 95 % de retour avec le nouveau
-- bonus), valeur par défaut ×84 (≈ 75 %), et réglage actuel passé à ×84.
-- ====================================================================

do $$
declare
  v_def text := pg_get_functiondef('public.normalize_games_config(jsonb)'::regprocedure);
  a1 text := $q$'buyPrice', public.jnum(d, 'buyPrice', 115, 115, 1000)$q$;
  b1 text := $q$'buyPrice', public.jnum(d, 'buyPrice', 84, 67, 1000)$q$;
begin
  if position(a1 in v_def) = 0 then
    raise exception 'normalize_games_config: point d''insertion introuvable';
  end if;
  execute replace(v_def, a1, b1);
end;
$$;
