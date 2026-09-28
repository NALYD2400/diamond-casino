-- Mines : encaissement automatique au gain maximum de la manche.
--
-- Avant : une fois floor(mise x multiplicateur) au plafond (games_config.mines.maxPayout),
-- le joueur pouvait continuer à retourner des cases sans rien gagner de plus, mais en
-- risquant de tout perdre. Désormais la manche est encaissée dès que le plafond est atteint
-- (comme les machines à sous qui s'arrêtent au gain maximum).

create or replace function public.mines_reveal(p_round_id uuid, p_cell integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_round public.mines_rounds;
  v_gems integer;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED' using errcode = '28000';
  end if;
  select r.* into v_round
  from public.mines_rounds r
  join public.profiles p on p.id = r.profile_id
  where r.id = p_round_id and p.user_id = v_uid and r.status = 'ACTIVE'
  for update of r;
  if v_round.id is null then
    raise exception 'ROUND_NOT_FOUND' using errcode = 'P0002';
  end if;
  if p_cell is null or p_cell < 0 or p_cell > 24 or p_cell = any(v_round.revealed) then
    raise exception 'INVALID_CELL' using errcode = 'P0001';
  end if;

  v_round.revealed := v_round.revealed || p_cell;
  update public.mines_rounds set revealed = v_round.revealed where id = v_round.id;

  if v_round.board[p_cell + 1] then
    return public.mines_finish(v_round, 'LOST') || jsonb_build_object('cell', p_cell, 'hit', true);
  end if;

  v_gems := array_length(v_round.revealed, 1);
  v_round.multiplier := public.mines_multiplier(v_round.mines, v_gems, v_round.rtp);
  update public.mines_rounds set multiplier = v_round.multiplier where id = v_round.id;

  -- Toutes les cases sûres trouvées, ou gain maximum de la manche atteint : encaissement
  if v_gems >= 25 - v_round.mines
     or floor(v_round.bet * v_round.multiplier) >= v_round.max_payout then
    return public.mines_finish(v_round, 'CASHED') || jsonb_build_object('cell', p_cell, 'hit', false);
  end if;

  return public.mines_round_payload(v_round, false) || jsonb_build_object('cell', p_cell, 'hit', false);
end;
$$;
