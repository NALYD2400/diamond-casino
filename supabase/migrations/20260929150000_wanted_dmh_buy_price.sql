-- Achat Wanted Dead Man's Hand : le bonus vaut ≈ ×391,6 la mise (2 M d'achats simulés),
-- soit 97,9 % à ×400. Prix porté à ×406 pour revenir à ≈ 96,4 % (RTP affiché de Wanted).
-- Ne touche que les configs encore au prix historique de 400.
update public.casino_settings
set value = jsonb_set(value, '{wanted,buyPrices,dmh}', '406'::jsonb), updated_at = now()
where key = 'games_config'
  and (value #>> '{wanted,buyPrices,dmh}')::numeric = 400;
