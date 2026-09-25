-- ====================================================================
-- Suppression des anciennes fonctions de jeu vulnérables
-- ====================================================================
-- play_mines_game et play_slots_round acceptaient le gain calculé par le
-- navigateur (p_win) : n'importe quel joueur connecté pouvait se créditer
-- le montant de son choix. Remplacées par mines_start / mines_reveal /
-- mines_cashout et par la fonction Edge « slot-round ».
-- ====================================================================
drop function if exists public.play_mines_game(bigint, bigint, numeric, integer, integer);
drop function if exists public.play_slots_round(text, bigint, bigint, numeric);
