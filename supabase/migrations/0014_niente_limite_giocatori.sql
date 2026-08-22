-- ============================================================
-- Via il tetto dei dieci giocatori per lega.
--
-- Era una scelta di quando l'app serviva un gruppo solo, e non protegge da
-- niente: una lega più numerosa funziona esattamente allo stesso modo, e chi
-- decide quante persone invitare è chi la lega ce l'ha.
--
-- Una nota sul bonus controcorrente: con molti giocatori diventa più raro
-- che uno o due soli azzecchino un esito, quindi il bonus si assegnerà meno
-- spesso. Il gioco resta corretto, cambia solo il peso di quella regola.
--
-- Da eseguire nell'SQL Editor dopo la 0013. Rieseguibile.
-- ============================================================

create or replace function register_with_league(
  p_invite_code text,
  p_username    text,
  p_pin_hash    text
) returns table (player_id uuid, league_id uuid, username text)
language plpgsql security definer set search_path = public as $$
declare
  v_league_id uuid;
  v_player_id uuid;
begin
  select l.id into v_league_id from leagues l
   where upper(l.invite_code) = upper(trim(p_invite_code));

  if v_league_id is null then
    raise exception 'INVITE_CODE_NOT_FOUND';
  end if;

  if exists (
    select 1 from players pl where lower(pl.username) = lower(trim(p_username))
  ) then
    raise exception 'USERNAME_TAKEN';
  end if;

  insert into players (pin_hash, username)
  values (p_pin_hash, trim(p_username))
  returning id into v_player_id;

  insert into league_members (league_id, player_id, display_name, role)
  values (v_league_id, v_player_id, trim(p_username), 'player');

  return query select v_player_id, v_league_id, trim(p_username);
end $$;

create or replace function join_league(
  p_player_id   uuid,
  p_invite_code text
) returns table (league_id uuid, league_name text)
language plpgsql security definer set search_path = public as $$
declare
  v_league_id uuid;
  v_name      text;
  v_username  text;
begin
  select l.id, l.name into v_league_id, v_name from leagues l
   where upper(l.invite_code) = upper(trim(p_invite_code));

  if v_league_id is null then
    raise exception 'INVITE_CODE_NOT_FOUND';
  end if;

  if exists (
    select 1 from league_members lm
     where lm.league_id = v_league_id and lm.player_id = p_player_id
  ) then
    raise exception 'ALREADY_MEMBER';
  end if;

  select pl.username into v_username from players pl where pl.id = p_player_id;
  if v_username is null then
    raise exception 'PLAYER_NOT_FOUND';
  end if;

  -- Il nome dentro la lega è il nome utente. Se in quella lega fosse già
  -- occupato da qualcun altro si aggiunge un suffisso: meglio "Marco-a3" che
  -- un ingresso rifiutato per un omonimo che nemmeno conosci.
  if exists (
    select 1 from league_members lm
     where lm.league_id = v_league_id
       and lower(lm.display_name) = lower(v_username)
  ) then
    v_username := v_username || '-' || substr(p_player_id::text, 1, 2);
  end if;

  insert into league_members (league_id, player_id, display_name, role)
  values (v_league_id, p_player_id, v_username, 'player');

  return query select v_league_id, v_name;
end $$;

revoke execute on function register_with_league(text, text, text)
  from public, anon, authenticated;
revoke execute on function join_league(uuid, text)
  from public, anon, authenticated;

grant execute on function register_with_league(text, text, text) to service_role;
grant execute on function join_league(uuid, text)                to service_role;
