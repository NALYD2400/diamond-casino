-- Correctifs de l'audit de sécurité du 6 octobre 2026 (docs/AUDIT-SECURITE.md)
--
-- P1 : admin_update_reward — un bon de bonus / booster déjà utilisé ne peut plus être
--      remis en inventaire (rejouable à l'infini), un membre du staff ne peut plus
--      se rendre un lot à lui-même, ni toucher aux lots d'un rang supérieur.
-- P2 : les sauvegardes des remises à zéro quittent le schéma public (exposé par l'API)
--      pour un schéma privé « backups ».
-- P3 : subscribe_events — plafond d'inscriptions par heure (anti-remplissage).
-- P4 : l'historique des parties est conservé 90 jours au lieu de 30.

-- --------------------------------------------------------------------
-- P1
-- --------------------------------------------------------------------
create or replace function public.admin_update_reward(p_reward_id uuid, p_status text, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me public.profiles := public.assert_staff();
  v_owner public.profiles;
  v_old public.player_rewards;
  v_new public.player_rewards;
  v_author text := coalesce(v_me.rp_first_name || ' ' || v_me.rp_last_name, 'Console Admin');
  v_cid text;
begin
  if p_status not in ('IN_INVENTORY', 'DELIVERED', 'REVOKED') then
    raise exception 'INVALID_STATUS' using errcode = '22023';
  end if;
  select * into v_old from public.player_rewards where id = p_reward_id for update;
  if v_old.id is null then
    raise exception 'REWARD_NOT_FOUND' using errcode = 'P0002';
  end if;

  select * into v_owner from public.profiles where id = v_old.profile_id;
  if v_owner.id is not null then
    perform public.assert_can_manage(v_me, v_owner);
  end if;

  if p_status = 'IN_INVENTORY' and v_old.status <> 'IN_INVENTORY' then
    -- Un bon de bonus joué ou un booster ouvert a déjà été consommé : le rendre = le rejouer gratuitement
    if v_old.status = 'USED' then
      raise exception 'REWARD_USED' using errcode = 'P0001';
    end if;
    -- Rendre un lot = créditer : interdit sur son propre compte (sauf FONDATEUR / DÉVELOPPEUR)
    perform public.assert_not_self_credit(v_me, v_old.profile_id);
  end if;

  update public.player_rewards
  set status = p_status,
      note = coalesce(nullif(left(trim(coalesce(p_note, '')), 280), ''), note),
      handled_at = case when p_status = 'IN_INVENTORY' then null else now() end,
      handled_by = case when p_status = 'IN_INVENTORY' then null else v_author end,
      claimed_at = case when p_status = 'IN_INVENTORY' then null else claimed_at end,
      -- Déjà remis en ville : le joueur ne doit pas pouvoir aussi le revendre
      no_resale = no_resale or (p_status = 'IN_INVENTORY' and v_old.status = 'DELIVERED')
  where id = p_reward_id
  returning * into v_new;

  if v_new.kind = 'vehicle' then
    update public.profiles
    set vehicles = case
      when p_status = 'DELIVERED' and not (v_new.label = any(coalesce(vehicles, '{}')))
        then array_append(coalesce(vehicles, '{}'), v_new.label)
      when p_status <> 'DELIVERED'
        then array_remove(coalesce(vehicles, '{}'), v_new.label)
      else vehicles end
    where id = v_new.profile_id;
  end if;

  select citizen_id into v_cid from public.profiles where id = v_new.profile_id;
  insert into public.admin_logs (action, category, detail, author)
  values (case p_status when 'DELIVERED' then 'Lot remis en jeu'
                        when 'REVOKED' then 'Lot retiré'
                        else 'Lot remis en inventaire' end,
          'CITIZEN', v_new.label || ' — #' || coalesce(v_cid, '?') || coalesce(' — ' || nullif(trim(coalesce(p_note, '')), ''), ''),
          v_author);

  return to_jsonb(v_new);
end;
$$;

-- --------------------------------------------------------------------
-- P2
-- --------------------------------------------------------------------
create schema if not exists backups;
revoke all on schema backups from public, anon, authenticated;

do $$
declare
  t text;
begin
  for t in
    select tablename from pg_tables
    where schemaname = 'public' and (tablename like 'bak\_%' or tablename like 'wipe\_backup\_%')
  loop
    execute format('alter table public.%I set schema backups', t);
    execute format('revoke all on backups.%I from anon, authenticated', t);
  end loop;
end;
$$;

-- --------------------------------------------------------------------
-- P3
-- --------------------------------------------------------------------
create or replace function public.subscribe_events(p_email text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(trim(p_email));
begin
  if v_email is null or length(v_email) > 254 or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'INVALID_EMAIL' using errcode = '22023';
  end if;
  if (select count(*) from public.event_subscribers where created_at > now() - interval '1 hour') >= 30
     or (select count(*) from public.event_subscribers) >= 20000 then
    raise exception 'RATE_LIMITED' using errcode = 'P0001';
  end if;
  insert into public.event_subscribers (email) values (v_email)
  on conflict ((lower(email))) do nothing;
end;
$$;

-- --------------------------------------------------------------------
-- P4
-- --------------------------------------------------------------------
do $$
begin
  if exists (select 1 from cron.job where jobname = 'purge-old-history') then
    perform cron.unschedule('purge-old-history');
  end if;
  perform cron.schedule('purge-old-history', '17 4 * * *', 'select public.purge_old_history(90)');
end;
$$;
