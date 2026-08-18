-- ============================================================
-- Pronostici Serie A — schema iniziale
--
-- Da incollare nell'SQL Editor di Supabase ed eseguire una volta sola.
-- È scritto per essere rieseguibile: se qualcosa va storto, puoi rilanciarlo.
-- ============================================================

create extension if not exists pgcrypto;

-- ------------------------------------------------------------
-- Tipi
-- ------------------------------------------------------------
do $$ begin
  create type match_status as enum (
    'SCHEDULED','TIMED','IN_PLAY','PAUSED','FINISHED',
    'POSTPONED','SUSPENDED','CANCELLED');
exception when duplicate_object then null; end $$;

do $$ begin
  create type matchday_status as enum ('draft','open','locked','scored');
exception when duplicate_object then null; end $$;

do $$ begin
  create type data_source as enum ('api','manual');
exception when duplicate_object then null; end $$;

do $$ begin
  create type member_role as enum ('admin','player');
exception when duplicate_object then null; end $$;

-- ------------------------------------------------------------
-- Identità
--
-- `players` tiene solo le credenziali; il nome visibile sta su
-- `league_members`, perché è lì che deve essere unico: il login è
-- (codice lega + nome + PIN), quindi due "Marco" nella stessa lega
-- renderebbero il login ambiguo.
-- ------------------------------------------------------------
create table if not exists players (
  id              uuid primary key default gen_random_uuid(),
  pin_hash        text not null,
  failed_attempts int not null default 0,
  locked_until    timestamptz,
  created_at      timestamptz not null default now(),
  last_seen_at    timestamptz
);

create table if not exists leagues (
  id           uuid primary key default gen_random_uuid(),
  name         text not null check (length(trim(name)) between 1 and 60),
  invite_code  text not null unique,
  season       int  not null,
  -- Quanti pronostici servono su una partita perché il bonus "unico"
  -- possa essere assegnato. Da non cambiare a stagione iniziata.
  unique_bonus_min_predictions int not null default 3
                 check (unique_bonus_min_predictions >= 1),
  created_at   timestamptz not null default now()
);

create table if not exists league_members (
  league_id    uuid not null references leagues(id) on delete cascade,
  player_id    uuid not null references players(id) on delete cascade,
  display_name text not null check (length(trim(display_name)) between 2 and 20),
  role         member_role not null default 'player',
  joined_at    timestamptz not null default now(),
  primary key (league_id, player_id)
);

create unique index if not exists league_members_display_name_key
  on league_members (league_id, lower(display_name));

-- ------------------------------------------------------------
-- Calendario e risultati (dati "mondo", non legati a una lega)
-- ------------------------------------------------------------
create table if not exists matchdays (
  id             uuid primary key default gen_random_uuid(),
  season         int not null,
  number         int not null check (number between 1 and 38),
  -- Kickoff della prima partita. Una volta che la giornata passa a
  -- 'locked' questo valore non si tocca più: il lock non si riapre.
  lock_at        timestamptz,
  status         matchday_status not null default 'draft',
  source         data_source not null default 'api',
  last_synced_at timestamptz,
  created_at     timestamptz not null default now(),
  unique (season, number)
);

create table if not exists matches (
  id            uuid primary key default gen_random_uuid(),
  matchday_id   uuid not null references matchdays(id) on delete cascade,
  external_id   text unique,          -- id football-data, NULL se inserita a mano
  home_team     text not null,
  away_team     text not null,
  kickoff_at    timestamptz not null,
  status        match_status not null default 'SCHEDULED',
  home_goals    int check (home_goals between 0 and 20),
  away_goals    int check (away_goals between 0 and 20),
  result_source data_source not null default 'api',
  position      int not null check (position between 1 and 20),
  updated_at    timestamptz not null default now(),
  unique (matchday_id, position),
  -- I gol esistono se e solo se la partita è finita. Così il motore di
  -- punteggio non può nemmeno per sbaglio vedere un risultato parziale.
  constraint goals_only_when_finished check (
    (status = 'FINISHED'  and home_goals is not null and away_goals is not null) or
    (status <> 'FINISHED' and home_goals is null     and away_goals is null)
  )
);

create index if not exists matches_matchday_idx on matches (matchday_id);

-- ------------------------------------------------------------
-- Pronostici e punteggi (dati "lega")
-- ------------------------------------------------------------
create table if not exists predictions (
  id         uuid primary key default gen_random_uuid(),
  league_id  uuid not null references leagues(id) on delete cascade,
  player_id  uuid not null references players(id) on delete cascade,
  match_id   uuid not null references matches(id) on delete cascade,
  home_goals int not null check (home_goals between 0 and 20),
  away_goals int not null check (away_goals between 0 and 20),
  outcome    char(1) generated always as (
               case when home_goals > away_goals then '1'
                    when home_goals = away_goals then 'X'
                    else '2' end) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (league_id, player_id, match_id)
);

create index if not exists predictions_match_idx on predictions (match_id);

-- Una riga per (giocatore, partita): permette di assegnare i punti man mano
-- che le partite finiscono, e di ricalcolare tutto senza effetti collaterali.
create table if not exists prediction_scores (
  league_id       uuid not null references leagues(id) on delete cascade,
  player_id       uuid not null references players(id) on delete cascade,
  match_id        uuid not null references matches(id) on delete cascade,
  outcome_correct boolean not null,
  exact           boolean not null,
  base_points     int not null check (base_points in (0,1,3)),
  unique_bonus    int not null check (unique_bonus in (0,1)),
  points          int not null,
  computed_at     timestamptz not null default now(),
  primary key (league_id, player_id, match_id)
);

-- ------------------------------------------------------------
-- Tracce per il giorno in cui qualcosa non tornerà
-- ------------------------------------------------------------
create table if not exists sync_runs (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null,           -- 'matches' | 'results'
  matchday_id uuid references matchdays(id) on delete set null,
  status      text not null,           -- 'ok' | 'error'
  http_status int,
  message     text,
  started_at  timestamptz not null default now(),
  finished_at timestamptz
);

create table if not exists audit_log (
  id         uuid primary key default gen_random_uuid(),
  actor_id   uuid references players(id) on delete set null,
  action     text not null,
  entity     text not null,
  entity_id  uuid,
  before     jsonb,
  after      jsonb,
  created_at timestamptz not null default now()
);

-- ============================================================
-- Sicurezza
-- ============================================================

-- Il player_id di chi sta facendo la richiesta, letto dal JWT che firmiamo
-- noi al login. Non dipende da Supabase Auth.
create or replace function current_player_id() returns uuid
language sql stable as $$
  select nullif(current_setting('request.jwt.claims', true)::json->>'sub', '')::uuid;
$$;

-- SECURITY DEFINER per non innescare le policy di league_members mentre le
-- stiamo valutando (si avvitrebbe su sé stessa).
create or replace function is_league_member(p_league uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from league_members lm
    where lm.league_id = p_league and lm.player_id = current_player_id()
  );
$$;

-- La giornata di questa partita è già bloccata?
create or replace function match_is_locked(p_match uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from matches m
    join matchdays d on d.id = m.matchday_id
    where m.id = p_match and d.lock_at is not null and now() >= d.lock_at
  );
$$;

alter table players           enable row level security;
alter table leagues           enable row level security;
alter table league_members    enable row level security;
alter table matchdays         enable row level security;
alter table matches           enable row level security;
alter table predictions       enable row level security;
alter table prediction_scores enable row level security;
alter table sync_runs         enable row level security;
alter table audit_log         enable row level security;

-- Nessuna policy = nessun accesso. Le tabelle senza policy qui sotto
-- (players, sync_runs, audit_log) sono raggiungibili solo dal server con la
-- service_role key, che salta RLS per definizione.

drop policy if exists leagues_select on leagues;
create policy leagues_select on leagues for select
  using (is_league_member(id));

drop policy if exists league_members_select on league_members;
create policy league_members_select on league_members for select
  using (is_league_member(league_id));

-- Calendario e risultati: leggibili da chiunque sia autenticato, non c'è
-- niente di segreto in Milan-Inter delle 20:45. Scritture solo dal server.
drop policy if exists matchdays_select on matchdays;
create policy matchdays_select on matchdays for select
  using (current_player_id() is not null);

drop policy if exists matches_select on matches;
create policy matches_select on matches for select
  using (current_player_id() is not null);

-- ------------------------------------------------------------
-- Il cuore: i pronostici sono segreti fino al lock, e immutabili dopo.
-- Questa è la regola che regge tutto il gioco, e vive nel database:
-- vale anche se domani sbagliamo una API route.
-- ------------------------------------------------------------
drop policy if exists predictions_select on predictions;
create policy predictions_select on predictions for select using (
  player_id = current_player_id()
  or (is_league_member(league_id) and match_is_locked(match_id))
);

drop policy if exists predictions_insert on predictions;
create policy predictions_insert on predictions for insert with check (
  player_id = current_player_id()
  and is_league_member(league_id)
  and not match_is_locked(match_id)
);

drop policy if exists predictions_update on predictions;
create policy predictions_update on predictions for update
  using  (player_id = current_player_id() and not match_is_locked(match_id))
  with check (player_id = current_player_id() and not match_is_locked(match_id));

-- Nessuna policy di DELETE: un pronostico non si cancella, mai.

drop policy if exists prediction_scores_select on prediction_scores;
create policy prediction_scores_select on prediction_scores for select
  using (is_league_member(league_id));

-- ============================================================
-- Registrazione e ingresso in lega, in una transazione sola.
--
-- Crea il player e la sua iscrizione insieme: senza questo, un errore a
-- metà lascerebbe in giro un player senza lega, che non potrebbe più né
-- entrare né essere ripulito.
-- ============================================================
create or replace function register_and_join(
  p_invite_code  text,
  p_display_name text,
  p_pin_hash     text
) returns table (player_id uuid, league_id uuid, display_name text, role member_role)
language plpgsql security definer set search_path = public as $$
declare
  v_league_id uuid;
  v_player_id uuid;
  v_members   int;
begin
  select id into v_league_id from leagues
   where upper(invite_code) = upper(trim(p_invite_code));

  if v_league_id is null then
    raise exception 'INVITE_CODE_NOT_FOUND';
  end if;

  select count(*) into v_members from league_members lm where lm.league_id = v_league_id;
  if v_members >= 10 then
    raise exception 'LEAGUE_FULL';
  end if;

  if exists (
    select 1 from league_members lm
    where lm.league_id = v_league_id
      and lower(lm.display_name) = lower(trim(p_display_name))
  ) then
    raise exception 'NAME_TAKEN';
  end if;

  insert into players (pin_hash) values (p_pin_hash) returning id into v_player_id;

  insert into league_members (league_id, player_id, display_name, role)
  values (v_league_id, v_player_id, trim(p_display_name), 'player');

  return query
    select v_player_id, v_league_id, trim(p_display_name), 'player'::member_role;
end $$;

-- ============================================================
-- Creazione della lega insieme al suo admin.
--
-- Vale solo finché non esiste nessuna lega: la prima persona che arriva
-- diventa admin e poi la porta si chiude. In pratica la creerai tu in
-- locale, prima ancora che l'app sia online.
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

  insert into leagues (name, invite_code, season)
  values (trim(p_league_name), upper(trim(p_invite_code)), p_season)
  returning id into v_league_id;

  insert into players (pin_hash) values (p_pin_hash) returning id into v_player_id;

  insert into league_members (league_id, player_id, display_name, role)
  values (v_league_id, v_player_id, trim(p_display_name), 'admin');

  return query
    select v_player_id, v_league_id, trim(p_display_name), 'admin'::member_role;
end $$;

-- Queste due funzioni scrivono saltando RLS, quindi devono essere
-- richiamabili solo dal nostro server (service_role), mai da un browser che
-- punta direttamente all'API di Supabase.
--
-- Il grant esplicito dopo il revoke non è ridondante: in Postgres le
-- funzioni nascono con EXECUTE concesso a PUBLIC, e revocarlo lì lo toglie
-- a tutti — service_role compreso.
revoke execute on function register_and_join(text, text, text)
  from public, anon, authenticated;
revoke execute on function create_league_with_admin(text, int, text, text, text)
  from public, anon, authenticated;

grant execute on function register_and_join(text, text, text) to service_role;
grant execute on function create_league_with_admin(text, int, text, text, text)
  to service_role;

-- I privilegi di tabella stanno nella migrazione 0002: vanno eseguite
-- entrambe, in ordine.
