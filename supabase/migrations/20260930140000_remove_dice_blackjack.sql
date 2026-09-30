-- ====================================================================
-- Retrait complet de Dice et du Blackjack (Crash est conservé)
-- ====================================================================
-- Aucune manche n'avait été jouée : on supprime les fonctions, la table
-- blackjack_rounds et leurs réglages. Les références dans la console
-- (statistiques, tableau de bord, purge) sont retirées.
-- ====================================================================

-- --------------------------------------------------------------------
-- 1. Console : plus de références à Dice / Blackjack
-- --------------------------------------------------------------------
do $$
declare
  v_def text := pg_get_functiondef('public.admin_dashboard(integer)'::regprocedure);
  v_old text := $q$,
    'blackjack_open_rounds', (select count(*) from public.blackjack_rounds where status = 'ACTIVE'),
    'blackjack_open_stake', (select coalesce(sum(total_bet), 0) from public.blackjack_rounds where status = 'ACTIVE')$q$;
begin
  if position(v_old in v_def) > 0 then
    execute replace(v_def, v_old, '');
  end if;
end;
$$;

do $$
declare
  v_def text := pg_get_functiondef('public.purge_old_history(integer)'::regprocedure);
  v_old text := $q$
  delete from public.blackjack_rounds where status <> 'ACTIVE' and coalesce(ended_at, created_at) < v_before;$q$;
begin
  if position(v_old in v_def) > 0 then
    execute replace(v_def, v_old, '');
  end if;
end;
$$;

do $$
declare
  v_def text := pg_get_functiondef('public.admin_game_stats(text, integer)'::regprocedure);
  v_old text := $q$'boosters', 'crash', 'dice', 'blackjack')$q$;
begin
  if position(v_old in v_def) > 0 then
    execute replace(v_def, v_old, $q$'boosters', 'crash')$q$);
  end if;
end;
$$;

-- --------------------------------------------------------------------
-- 2. Fonctions et table
-- --------------------------------------------------------------------
drop function if exists public.dice_roll(bigint, integer, boolean);
drop function if exists public.bj_start(bigint);
drop function if exists public.bj_action(uuid, text);
drop function if exists public.bj_current();
drop function if exists public.bj_finish(public.blackjack_rounds);
drop function if exists public.bj_payload(public.blackjack_rounds);
drop function if exists public.bj_cards(jsonb);
drop function if exists public.bj_eval(integer[]);
drop function if exists public.bj_card_value(integer);
drop table if exists public.blackjack_rounds;

-- --------------------------------------------------------------------
-- 3. Réglages : dice / blackjack retirés de games_config
-- --------------------------------------------------------------------
create or replace function public.normalize_games_config(p jsonb)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  m jsonb := coalesce(p->'mines', '{}');
  d jsonb := coalesce(p->'doghouse', '{}');
  w jsonb := coalesce(p->'wanted', '{}');
  r jsonb := coalesce(p->'wheel', '{}');
  b jsonb := coalesce(p->'boosters', '{}');
  c jsonb := coalesce(p->'crash', '{}');
  wp jsonb := coalesce(w->'buyPrices', '{}');
  v_min numeric;
begin
  v_min := public.jnum(m, 'minBet', 10, 1, 1000000);
  m := jsonb_build_object(
    'enabled', public.jbool(m, 'enabled', true),
    'minBet', v_min,
    'maxBet', greatest(v_min, public.jnum(m, 'maxBet', 100000, 1, 10000000)),
    'rtp', public.jnum(m, 'rtp', 97, 80, 99.5),
    'maxPayout', public.jnum(m, 'maxPayout', 5000000, 1000, 1000000000)
  );

  v_min := public.jnum(d, 'minBet', 20, 1, 1000000);
  d := jsonb_build_object(
    'enabled', public.jbool(d, 'enabled', true),
    'minBet', v_min,
    'maxBet', greatest(v_min, public.jnum(d, 'maxBet', 100000, 1, 10000000)),
    'buyEnabled', public.jbool(d, 'buyEnabled', true),
    'buyPrice', public.jnum(d, 'buyPrice', 115, 115, 1000),
    'boostEnabled', public.jbool(d, 'boostEnabled', true),
    'maxPayout', public.jnum(d, 'maxPayout', 10000000, 1000, 1000000000)
  );

  v_min := public.jnum(w, 'minBet', 10, 1, 1000000);
  w := jsonb_build_object(
    'enabled', public.jbool(w, 'enabled', true),
    'minBet', v_min,
    'maxBet', greatest(v_min, public.jnum(w, 'maxBet', 100000, 1, 10000000)),
    'buyEnabled', public.jbool(w, 'buyEnabled', true),
    'buyPrices', jsonb_build_object(
      'gtr', public.jnum(wp, 'gtr', 80, 80, 5000),
      'duel', public.jnum(wp, 'duel', 200, 200, 5000),
      'dmh', public.jnum(wp, 'dmh', 400, 400, 5000)
    ),
    'maxPayout', public.jnum(w, 'maxPayout', 10000000, 1000, 1000000000)
  );

  r := jsonb_build_object(
    'enabled', public.jbool(r, 'enabled', true),
    'spinPrice', round(public.jnum(r, 'spinPrice', 25000, 1, 100000000)),
    'maxRtp', public.jnum(r, 'maxRtp', 95, 10, 100)
  );

  b := jsonb_build_object(
    'enabled', public.jbool(b, 'enabled', true),
    'maxRtp', public.jnum(b, 'maxRtp', 90, 10, 100),
    'sellRate', public.jnum(b, 'sellRate', 90, 0, 100)
  );

  v_min := public.jnum(c, 'minBet', 10, 1, 1000000);
  c := jsonb_build_object(
    'enabled', public.jbool(c, 'enabled', true),
    'minBet', v_min,
    'maxBet', greatest(v_min, public.jnum(c, 'maxBet', 100000, 1, 10000000)),
    'rtp', round(public.jnum(c, 'rtp', 97, 80, 99), 1),
    'maxMultiplier', round(public.jnum(c, 'maxMultiplier', 1000, 2, 100000)),
    'maxPayout', public.jnum(c, 'maxPayout', 5000000, 1000, 1000000000)
  );

  return jsonb_build_object('mines', m, 'doghouse', d, 'wanted', w, 'wheel', r, 'boosters', b, 'crash', c);
end;
$$;

update public.casino_settings
set value = public.normalize_games_config(value), updated_at = now()
where key = 'games_config';
