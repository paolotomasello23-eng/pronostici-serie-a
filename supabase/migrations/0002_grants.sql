-- ============================================================
-- Privilegi di tabella e di funzione.
--
-- In Postgres i permessi sono due livelli separati, e servono entrambi:
--   GRANT  -> puoi toccare questa tabella?
--   POLICY -> quali righe puoi vedere o scrivere?
-- La migrazione 0001 scriveva le policy dando per scontati i grant. Senza
-- questi, ogni query risponde "permission denied" prima ancora di arrivare
-- alle policy.
--
-- Da eseguire nell'SQL Editor di Supabase dopo la 0001. Rieseguibile.
-- ============================================================

grant usage on schema public to anon, authenticated, service_role;

-- ------------------------------------------------------------
-- service_role: è il nostro server. Salta RLS per definizione, quindi qui
-- decide tutto il codice delle API route.
-- ------------------------------------------------------------
grant select, insert, update, delete on all tables in schema public to service_role;
grant execute on all functions in schema public to service_role;

-- ------------------------------------------------------------
-- authenticated: i giocatori, con i token che firmiamo noi al login.
-- Concediamo tabella per tabella, e solo le operazioni che hanno senso.
-- Cosa possono effettivamente leggere resta deciso dalle policy RLS.
-- ------------------------------------------------------------
grant select on leagues           to authenticated;
grant select on league_members    to authenticated;
grant select on matchdays         to authenticated;
grant select on matches           to authenticated;
grant select on prediction_scores to authenticated;

-- L'unica tabella che un giocatore può scrivere. Niente DELETE: un
-- pronostico non si cancella, mai.
grant select, insert, update on predictions to authenticated;

-- Volutamente escluse: players (contiene gli hash dei PIN), sync_runs,
-- audit_log. Nessun grant e nessuna policy: irraggiungibili se non dal
-- server.

-- Le funzioni usate dentro le policy devono essere eseguibili da chi viene
-- valutato dalle policy stesse.
grant execute on function current_player_id()      to authenticated;
grant execute on function is_league_member(uuid)   to authenticated;
grant execute on function match_is_locked(uuid)    to authenticated;

-- ------------------------------------------------------------
-- Queste due invece scrivono saltando RLS: solo il nostro server.
-- (La 0001 le revocava a tutti, service_role compreso: era troppo.)
-- ------------------------------------------------------------
revoke execute on function register_and_join(text, text, text)
  from public, anon, authenticated;
revoke execute on function create_league_with_admin(text, int, text, text, text)
  from public, anon, authenticated;

grant execute on function register_and_join(text, text, text) to service_role;
grant execute on function create_league_with_admin(text, int, text, text, text)
  to service_role;
