-- ====================================================================
-- COLLECTIONS — plus de limite de boosters achetés par jour
-- ====================================================================
-- dailyPackLimit passe à 0 (illimité) par défaut et dans les réglages ;
-- le réglage reste disponible dans la console (Machines → Collections).
-- ====================================================================

do $$
declare
  v_def text := pg_get_functiondef('public.normalize_games_config(jsonb)'::regprocedure);
  a1 text := $q$'dailyPackLimit', 3, 0, 1000$q$;
begin
  if position(a1 in v_def) = 0 then
    raise exception 'normalize_games_config: point d''insertion introuvable';
  end if;
  execute replace(v_def, a1, $q$'dailyPackLimit', 0, 0, 1000$q$);
end;
$$;

update public.casino_settings
set value = public.normalize_games_config(jsonb_set(value, '{collections,dailyPackLimit}', '0')), updated_at = now()
where key = 'games_config';
