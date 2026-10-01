-- ====================================================================
-- INVENTAIRE — les objets (bouteille, montre, costume…) se revendent
-- ====================================================================
-- * Un objet de l'inventaire peut être revendu 200 jetons (prix fixe, sans
--   taux ni bonus VIP) au lieu d'être utilisé en jeu.
-- * La roue compte ces 200 jetons dans son retour joueur (garde-fou maxRtp).
-- ====================================================================

create or replace function public.item_resale_price()
returns bigint
language sql
immutable
set search_path = ''
as $$
  select 200::bigint;
$$;

-- Prix de revente d'un lot de l'inventaire
create or replace function public.reward_sell_price(r public.player_rewards, p_rate numeric)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when r.no_resale then 0
    when r.kind = 'item' then public.item_resale_price()
    when p_rate > 0 then floor(public.reward_resale_base(r) * p_rate / 100)::bigint
    else 0
  end;
$$;

-- my_inventory : prix de revente des objets
do $$
declare
  v_def text := pg_get_functiondef('public.my_inventory()'::regprocedure);
  a1 text := $q$'sell_value', case when v_rate > 0 then floor(public.reward_resale_base(r) * v_rate / 100) else 0 end,$q$;
  b1 text := $q$'sell_value', public.reward_sell_price(r, v_rate),$q$;
begin
  if position(a1 in v_def) = 0 then
    raise exception 'my_inventory: point d''insertion introuvable';
  end if;
  execute replace(v_def, a1, b1);
end;
$$;

-- sell_rewards : véhicules et objets
do $$
declare
  v_def text := pg_get_functiondef('public.sell_rewards(uuid[])'::regprocedure);
  a1 text := $q$  if v_rate <= 0 then
    raise exception 'SELL_DISABLED' using errcode = 'P0001';
  end if;
$q$;
  a2 text := $q$and r.status = 'IN_INVENTORY' and r.kind = 'vehicle'$q$;
  b2 text := $q$and r.status = 'IN_INVENTORY' and r.kind in ('vehicle', 'item')$q$;
  a3 text := $q$    v_price := floor(public.reward_resale_base(rec) * v_rate / 100);$q$;
  b3 text := $q$    v_price := public.reward_sell_price(rec, v_rate);$q$;
  a4 text := $q$'Revente de ' || v_count || ' lot(s) à ' || v_rate || ' % de leur valeur'$q$;
  b4 text := $q$'Revente de ' || v_count || ' lot(s) de l''inventaire'$q$;
begin
  if position(a1 in v_def) = 0 or position(a2 in v_def) = 0 or position(a3 in v_def) = 0 or position(a4 in v_def) = 0 then
    raise exception 'sell_rewards: point d''insertion introuvable';
  end if;
  -- Taux à 0 : seuls les véhicules ne se revendent plus, les objets restent à prix fixe
  execute replace(replace(replace(replace(v_def, a1, ''), a2, b2), a3, b3), a4, b4);
end;
$$;

-- wheel_ev : un objet vaut au moins sa revente
do $$
declare
  v_def text := pg_get_functiondef('public.wheel_ev(jsonb)'::regprocedure);
  a1 text := $q$                   else 0 end)$q$;
  b1 text := $q$                   when s.e->>'type' in ('clothing', 'mystery')
                   then public.item_resale_price()
                   else 0 end)$q$;
begin
  if position(a1 in v_def) = 0 then
    raise exception 'wheel_ev: point d''insertion introuvable';
  end if;
  execute replace(v_def, a1, b1);
end;
$$;
