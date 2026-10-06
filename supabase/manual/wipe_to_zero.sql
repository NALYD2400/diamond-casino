-- REMISE À ZÉRO du casino (à lancer À LA MAIN dans Supabase > SQL Editor).
-- Ce fichier n'est PAS une migration : il ne s'exécute jamais tout seul.
--
-- Efface : historique des parties (machines, roue, Mines, Crash), transactions, journal admin,
--          ouvertures de boosters, lots / inventaires / bons de bonus, cartes et albums de collection.
-- Remet à zéro : soldes de jetons, gains cumulés, tirages, VIP, véhicules, inventaire des comptes.
-- CONSERVE : les comptes (identité, Discord, rôle staff), les réglages du casino
--            (casino_settings), les albums / cartes / raretés, le catalogue de véhicules.
--
-- Tout est dans UNE transaction : si une ligne échoue, rien n'est modifié.
-- Une copie de sauvegarde est faite avant (tables bak_<date>_*), à supprimer quand tu es sûr.
-- Changer le préfixe ci-dessous (bak_AAAAMMJJ_) à chaque nouvelle remise à zéro.

begin;

-- 1) Sauvegarde (schéma privé « backups », jamais exposé par l'API du site)
create schema if not exists backups;
revoke all on schema backups from public, anon, authenticated;
create table backups.bak_20261005_profiles               as select * from public.profiles;
create table backups.bak_20261005_bets_history           as select * from public.bets_history;
create table backups.bak_20261005_transactions           as select * from public.casino_transactions;
create table backups.bak_20261005_player_rewards         as select * from public.player_rewards;
create table backups.bak_20261005_booster_openings       as select * from public.booster_openings;
create table backups.bak_20261005_admin_logs             as select * from public.admin_logs;
create table backups.bak_20261005_mines_rounds           as select * from public.mines_rounds;
create table backups.bak_20261005_crash_rounds           as select * from public.crash_rounds;
create table backups.bak_20261005_collection_owned       as select * from public.collection_owned;
create table backups.bak_20261005_collection_completions as select * from public.collection_completions;
create table backups.bak_20261005_collection_openings    as select * from public.collection_openings;

-- Les sauvegardes ne doivent pas être lisibles depuis le site
alter table backups.bak_20261005_profiles               enable row level security;
alter table backups.bak_20261005_bets_history           enable row level security;
alter table backups.bak_20261005_transactions           enable row level security;
alter table backups.bak_20261005_player_rewards         enable row level security;
alter table backups.bak_20261005_booster_openings       enable row level security;
alter table backups.bak_20261005_admin_logs             enable row level security;
alter table backups.bak_20261005_mines_rounds           enable row level security;
alter table backups.bak_20261005_crash_rounds           enable row level security;
alter table backups.bak_20261005_collection_owned       enable row level security;
alter table backups.bak_20261005_collection_completions enable row level security;
alter table backups.bak_20261005_collection_openings    enable row level security;

-- 2) Effacement de l'historique, des lots et des collections
delete from public.mines_rounds;
delete from public.crash_rounds;
delete from public.bets_history;
delete from public.casino_transactions;
delete from public.booster_openings;
delete from public.player_rewards;
delete from public.collection_owned;
delete from public.collection_completions;
delete from public.collection_openings;
delete from public.admin_logs;

-- 3) Remise à zéro des comptes (les comptes eux-mêmes sont conservés)
update public.profiles set
  chips           = 0,
  chips_balance   = 0,
  cash            = 0,
  cash_balance    = 0,
  total_wagered   = 0,
  total_won       = 0,
  total_spins     = 0,
  last_wheel_spin = null,
  vip_tier        = null,
  vip_level       = 'MEMBRE',
  vip_expires_at  = null,
  vehicles        = '{}',
  inventory       = '{}';

-- 4) Contrôle : tout doit être à zéro
select
  (select count(*) from public.bets_history)        as parties,
  (select count(*) from public.crash_rounds)        as crash,
  (select count(*) from public.mines_rounds)        as mines,
  (select count(*) from public.casino_transactions) as transactions,
  (select count(*) from public.player_rewards)      as lots,
  (select count(*) from public.collection_owned)    as cartes,
  (select coalesce(sum(chips), 0) from public.profiles) as jetons_total,
  (select count(*) from public.profiles)            as comptes_conserves;

commit;

-- Pour annuler après coup (tant que les copies existent) : recopier depuis bak_20261005_*.
-- Quand tu es sûr, supprime les copies (et celles des remises à zéro précédentes) :
--   drop table backups.bak_20261005_profiles, backups.bak_20261005_bets_history, backups.bak_20261005_transactions,
--              backups.bak_20261005_player_rewards, backups.bak_20261005_booster_openings, backups.bak_20261005_admin_logs,
--              backups.bak_20261005_mines_rounds, backups.bak_20261005_crash_rounds, backups.bak_20261005_collection_owned,
--              backups.bak_20261005_collection_completions, backups.bak_20261005_collection_openings;
