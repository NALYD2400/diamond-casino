-- ====================================================================
-- THE DIAMOND CASINO & RESORT — JEU DES MINES (BACKEND SÉCURISÉ)
-- ====================================================================
-- Permet aux joueurs de parier leurs jetons de manière atomique et sécurisée.
-- Le backend valide les fonds, applique le gain ou la perte, et consigne la
-- transaction et le pari dans l'historique d'audit.
-- ====================================================================

create or replace function public.play_mines_game(
  p_bet bigint,
  p_win bigint,
  p_multiplier numeric,
  p_mines integer,
  p_gems integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_profile public.profiles;
  v_net bigint;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED' using errcode = '28000';
  end if;

  select * into v_profile from public.profiles where user_id = v_uid for update;
  if v_profile.id is null then
    raise exception 'PROFILE_REQUIRED' using errcode = 'P0002';
  end if;

  if p_bet < 1 or p_bet > 100000000 then
    raise exception 'INVALID_BET' using errcode = 'P0001';
  end if;

  if p_mines < 1 or p_mines > 24 then
    raise exception 'INVALID_MINES' using errcode = 'P0001';
  end if;

  if p_gems < 0 or p_gems > (25 - p_mines) then
    raise exception 'INVALID_GEMS' using errcode = 'P0001';
  end if;

  if p_win < 0 then
    raise exception 'INVALID_WIN' using errcode = 'P0001';
  end if;

  if p_multiplier < 0 then
    raise exception 'INVALID_MULTIPLIER' using errcode = 'P0001';
  end if;

  if p_gems = 0 and p_win > 0 then
    raise exception 'INVALID_WIN_NO_GEMS' using errcode = 'P0001';
  end if;

  if p_win > 0 and (p_multiplier < 1.0 or p_win > ceil(p_bet * p_multiplier) + 1) then
    raise exception 'INVALID_PAYOUT_AMOUNT' using errcode = 'P0001';
  end if;

  if v_profile.chips < p_bet then
    raise exception 'INSUFFICIENT_FUNDS' using errcode = 'P0001';
  end if;

  v_net := p_win - p_bet;

  update public.profiles
  set chips = chips + v_net,
      total_wagered = coalesce(total_wagered, 0) + p_bet,
      total_won = coalesce(total_won, 0) + greatest(v_net, 0)
  where id = v_profile.id
  returning * into v_profile;

  insert into public.bets_history (profile_id, game_id, bet_amount, win_amount, multiplier, result_data)
  values (
    v_profile.id,
    'mines',
    p_bet,
    p_win,
    p_multiplier,
    jsonb_build_object('mines', p_mines, 'gems', p_gems, 'won', p_win > 0)
  );

  insert into public.casino_transactions (profile_id, type, amount, chips, game, description, status)
  values (
    v_profile.id,
    case when p_win > 0 then 'WIN' else 'BET' end,
    0,
    case when p_win > 0 then v_net else -p_bet end,
    'mines',
    case when p_win > 0
      then 'Mines : gain de ' || p_win || ' jetons (x' || round(p_multiplier, 2) || ' avec ' || p_mines || ' mines)'
      else 'Mines : perte de ' || p_bet || ' jetons (' || p_mines || ' mines)'
    end,
    'COMPLETED'
  );

  return jsonb_build_object(
    'profile', public.profile_payload(v_profile),
    'net', v_net
  );
end;
$$;

revoke execute on function public.play_mines_game(bigint, bigint, numeric, integer, integer) from public, anon;
grant execute on function public.play_mines_game(bigint, bigint, numeric, integer, integer) to authenticated;
