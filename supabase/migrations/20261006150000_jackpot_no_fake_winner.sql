-- Le schéma d'origine (init_diamonds_casino_schema) donnait à jackpot_pool des valeurs par défaut de
-- démonstration (« Tony Montana », 1 450 000) : le jackpot affichait un faux dernier gagnant.
alter table public.jackpot_pool
  alter column last_winner_name drop default,
  alter column last_win_amount drop default,
  alter column last_win_date drop default;

update public.jackpot_pool
set last_winner_name = null, last_win_amount = null, last_win_date = null, updated_at = now()
where id = 'slots'
  and not exists (select 1 from public.casino_transactions where type = 'JACKPOT');
