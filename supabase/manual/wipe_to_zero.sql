-- REMISE À ZÉRO du casino (à lancer À LA MAIN dans Supabase > SQL Editor).
-- Ce fichier n'est PAS une migration : il ne s'exécute jamais tout seul.
--
-- Efface : historique des parties, transactions, journal admin, ouvertures de boosters,
--          lots/inventaires, manches Mines.
-- Remet à zéro : soldes de jetons, gains cumulés, tirages, VIP, véhicules, inventaire des comptes.
-- CONSERVE : les comptes (identité, Discord, rôle staff), les réglages du casino
--            (casino_settings), les packs/cartes/raretés de boosters, le catalogue de véhicules.
--
-- Tout est dans UNE transaction : si une ligne échoue, rien n'est modifié.
-- Une copie de sauvegarde est faite avant (tables wipe_backup_*), à supprimer quand tu es sûr.

begin;

-- 1) Sauvegarde (copie des données qui vont être effacées ou remises à zéro)
create table wipe_backup_profiles          as select * from public.profiles;
create table wipe_backup_bets_history      as select * from public.bets_history;
create table wipe_backup_transactions      as select * from public.casino_transactions;
create table wipe_backup_player_rewards    as select * from public.player_rewards;
create table wipe_backup_booster_openings  as select * from public.booster_openings;
create table wipe_backup_admin_logs        as select * from public.admin_logs;

-- 2) Effacement de l'historique et des lots
delete from public.mines_rounds;
delete from public.bets_history;
delete from public.casino_transactions;
delete from public.booster_openings;
delete from public.player_rewards;
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
  (select count(*) from public.casino_transactions) as transactions,
  (select count(*) from public.player_rewards)      as lots,
  (select coalesce(sum(chips), 0) from public.profiles) as jetons_total;

commit;

-- Pour annuler après coup (tant que les copies existent) : recopier depuis wipe_backup_*.
-- Quand tu es sûr, supprime les copies :
--   drop table wipe_backup_profiles, wipe_backup_bets_history, wipe_backup_transactions,
--              wipe_backup_player_rewards, wipe_backup_booster_openings, wipe_backup_admin_logs;
