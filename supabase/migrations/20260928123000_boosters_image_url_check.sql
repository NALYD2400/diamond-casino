-- Correctif : l'expression {1,500} dépasse la limite de répétition des regex
-- Postgres (255) et faisait échouer toute URL d'image. Longueur contrôlée à part.
alter table public.booster_cards drop constraint if exists booster_cards_image_url_check;
alter table public.booster_cards add constraint booster_cards_image_url_check
  check (image_url is null or (char_length(image_url) <= 500 and image_url ~ '^(https://|/)[^\s"''<>]+$'));
alter table public.booster_packs drop constraint if exists booster_packs_cover_image_url_check;
alter table public.booster_packs add constraint booster_packs_cover_image_url_check
  check (cover_image_url is null or (char_length(cover_image_url) <= 500 and cover_image_url ~ '^(https://|/)[^\s"''<>]+$'));
