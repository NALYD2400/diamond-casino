-- Achat Wanted Duel at Dawn : le bonus vaut ≈ ×197,3 la mise (5 M d'achats simulés),
-- soit 98,6 % à ×200. Prix porté à ×204 pour revenir à ≈ 96,5 % (RTP affiché de Wanted).
-- Ne touche que les configs encore au prix historique de 200.
update public.casino_settings
set value = jsonb_set(value, '{wanted,buyPrices,duel}', '204'::jsonb), updated_at = now()
where key = 'games_config'
  and (value #>> '{wanted,buyPrices,duel}')::numeric = 200;
