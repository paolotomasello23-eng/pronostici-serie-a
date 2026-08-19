-- ============================================================
-- Multi-lega: l'identità passa dalla persona, non dalla lega.
--
-- Finora si entrava con (codice lega + nome + PIN), quindi lo stesso essere
-- umano in due leghe sarebbe stato due account scollegati. Ora il nome
-- utente è unico su tutta l'app e le leghe si aggiungono dopo il login.
--
-- Chi è già registrato non deve accorgersi di niente: il nome che usa oggi
-- diventa il suo nome utente, e il PIN resta quello.
--
-- Da eseguire nell'SQL Editor dopo la 0007. Rieseguibile.
-- ============================================================

alter table players add column if not exists username text;

-- Chi c'è già prende come nome utente quello con cui gioca. Se qualcuno
-- fosse in più leghe con nomi diversi vince il primo in ordine di
-- iscrizione: un caso che oggi non esiste, ma meglio una regola precisa
-- che un risultato casuale.
--
-- I nomi sono unici dentro una lega, non fra leghe diverse: due "Marco" in
-- due leghe separate erano legittimi finora. Al secondo si aggiunge un
-- numero, altrimenti l'indice unico più sotto farebbe fallire l'intera
-- migrazione — e con essa l'accesso di tutti.
with primo as (
  select distinct on (player_id) player_id, display_name
    from league_members
   order by player_id, joined_at
), numerati as (
  select player_id,
         display_name,
         row_number() over (
           partition by lower(display_name) order by player_id
         ) as n
    from primo
)
update players p
   set username = case when numerati.n = 1
                       then numerati.display_name
                       else numerati.display_name || numerati.n::text
                  end
  from numerati
 where numerati.player_id = p.id
   and p.username is null;

-- Unico senza distinzione tra maiuscole e minuscole: "Tomx" e "tomx" sono
-- la stessa persona, e due account simili sarebbero solo un modo per
-- sbagliare login.
create unique index if not exists players_username_key
  on players (lower(username)) where username is not null;

-- ============================================================
-- Registrazione: crea la persona e la mette nella sua prima lega.
-- ============================================================
-- Le colonne sono sempre qualificate con l'alias della tabella: i nomi
-- dichiarati nel `returns table` diventano variabili dentro la funzione, e
-- un `where username = ...` non scritto per esteso lascia a Postgres il
-- dubbio se intendiamo la colonna o il valore da restituire. Il dubbio non
-- se lo tiene: interrompe tutto.
create or replace function register_with_league(
  p_invite_code text,
  p_username    text,
  p_pin_hash    text
) returns table (player_id uuid, league_id uuid, username text)
language plpgsql security definer set search_path = public as $$
declare
  v_league_id uuid;
  v_player_id uuid;
  v_members   int;
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

  select count(*) into v_members from league_members lm where lm.league_id = v_league_id;
  if v_members >= 10 then
    raise exception 'LEAGUE_FULL';
  end if;

  insert into players (pin_hash, username)
  values (p_pin_hash, trim(p_username))
  returning id into v_player_id;

  insert into league_members (league_id, player_id, display_name, role)
  values (v_league_id, v_player_id, trim(p_username), 'player');

  return query select v_player_id, v_league_id, trim(p_username);
end $$;

-- ============================================================
-- Ingresso in una lega ulteriore, da parte di chi è già registrato.
-- ============================================================
create or replace function join_league(
  p_player_id   uuid,
  p_invite_code text
) returns table (league_id uuid, league_name text)
language plpgsql security definer set search_path = public as $$
declare
  v_league_id uuid;
  v_name      text;
  v_username  text;
  v_members   int;
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

  select count(*) into v_members from league_members lm
   where lm.league_id = v_league_id;
  if v_members >= 10 then
    raise exception 'LEAGUE_FULL';
  end if;

  select pl.username into v_username from players pl where pl.id = p_player_id;
  if v_username is null then
    raise exception 'PLAYER_NOT_FOUND';
  end if;

  -- Il nome dentro la lega è il nome utente. Se in quella lega fosse già
  -- occupato da qualcun altro si aggiunge un suffisso: meglio "Marco-2" che
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

-- ============================================================
-- La creazione della lega deve valorizzare anche il nome utente, altrimenti
-- l'admin appena creato non potrebbe più accedere: il login ora cerca per
-- nome utente, e senza quello non lo troverebbe.
-- ============================================================
create or replace function create_league_with_admin(
  p_league_name  text,
  p_season       int,
  p_invite_code  text,
  p_display_name text,
  p_pin_hash     text
) returns table (player_id uuid, league_id uuid, display_name text, role member_role)
language plpgsql security definer set search_path = public as $$
declare
  v_league_id uuid;
  v_player_id uuid;
begin
  if exists (select 1 from leagues) then
    raise exception 'LEAGUE_ALREADY_EXISTS';
  end if;

  if exists (
    select 1 from players pl where lower(pl.username) = lower(trim(p_display_name))
  ) then
    raise exception 'USERNAME_TAKEN';
  end if;

  insert into leagues (name, invite_code, season)
  values (trim(p_league_name), upper(trim(p_invite_code)), p_season)
  returning id into v_league_id;

  insert into players (pin_hash, username)
  values (p_pin_hash, trim(p_display_name))
  returning id into v_player_id;

  insert into league_members (league_id, player_id, display_name, role)
  values (v_league_id, v_player_id, trim(p_display_name), 'admin');

  return query
    select v_player_id, v_league_id, trim(p_display_name), 'admin'::member_role;
end $$;

revoke execute on function register_with_league(text, text, text)
  from public, anon, authenticated;
revoke execute on function join_league(uuid, text)
  from public, anon, authenticated;

grant execute on function register_with_league(text, text, text) to service_role;
grant execute on function join_league(uuid, text)                to service_role;
