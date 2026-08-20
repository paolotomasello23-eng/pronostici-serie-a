-- ============================================================
-- Chiunque può creare la propria lega.
--
-- Finora esisteva una sola funzione di creazione, e si rifiutava di girare
-- se una lega esisteva già: serviva a impedire che un passante creasse la
-- lega al posto tuo, quando l'app era pensata per un gruppo solo. Con il
-- multi-lega quel vincolo non ha più senso — chi crea una lega vede
-- soltanto la propria, e non tocca le altre.
--
-- Da eseguire nell'SQL Editor dopo la 0011. Rieseguibile.
-- ============================================================

/**
 * Crea una lega per chi è già registrato.
 * Chi la crea ne diventa amministratore.
 */
create or replace function create_league_for_player(
  p_player_id   uuid,
  p_league_name text,
  p_invite_code text,
  p_season      int
) returns table (league_id uuid, league_name text, invite_code text)
language plpgsql security definer set search_path = public as $$
declare
  v_league_id uuid;
  v_username  text;
begin
  select pl.username into v_username from players pl where pl.id = p_player_id;
  if v_username is null then
    raise exception 'PLAYER_NOT_FOUND';
  end if;

  if length(trim(p_league_name)) < 2 then
    raise exception 'NAME_TOO_SHORT';
  end if;

  insert into leagues (name, invite_code, season)
  values (trim(p_league_name), upper(trim(p_invite_code)), p_season)
  returning id into v_league_id;

  insert into league_members (league_id, player_id, display_name, role)
  values (v_league_id, p_player_id, v_username, 'admin');

  return query
    select v_league_id, trim(p_league_name), upper(trim(p_invite_code));
end $$;

/**
 * Registrazione di chi arriva da zero e crea subito la sua lega.
 *
 * Account e lega nascono insieme: se l'inserimento fallisse a metà
 * resterebbe un utente senza lega, che non potrebbe né entrare né essere
 * ripulito.
 */
create or replace function register_and_create_league(
  p_username    text,
  p_pin_hash    text,
  p_league_name text,
  p_invite_code text,
  p_season      int
) returns table (player_id uuid, league_id uuid, username text, invite_code text)
language plpgsql security definer set search_path = public as $$
declare
  v_player_id uuid;
  v_league_id uuid;
begin
  if exists (
    select 1 from players pl where lower(pl.username) = lower(trim(p_username))
  ) then
    raise exception 'USERNAME_TAKEN';
  end if;

  if length(trim(p_league_name)) < 2 then
    raise exception 'NAME_TOO_SHORT';
  end if;

  insert into players (pin_hash, username)
  values (p_pin_hash, trim(p_username))
  returning id into v_player_id;

  insert into leagues (name, invite_code, season)
  values (trim(p_league_name), upper(trim(p_invite_code)), p_season)
  returning id into v_league_id;

  insert into league_members (league_id, player_id, display_name, role)
  values (v_league_id, v_player_id, trim(p_username), 'admin');

  return query
    select v_player_id, v_league_id, trim(p_username), upper(trim(p_invite_code));
end $$;

revoke execute on function create_league_for_player(uuid, text, text, int)
  from public, anon, authenticated;
revoke execute on function register_and_create_league(text, text, text, text, int)
  from public, anon, authenticated;

grant execute on function create_league_for_player(uuid, text, text, int) to service_role;
grant execute on function register_and_create_league(text, text, text, text, int)
  to service_role;
