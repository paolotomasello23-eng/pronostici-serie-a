-- ============================================================
-- Aggiustamenti alla tabella matches per il calendario reale.
-- Da eseguire nell'SQL Editor dopo la 0002. Rieseguibile.
-- ============================================================

-- football-data espone sia il nome completo ("FC Internazionale Milano")
-- sia quello corto ("Inter"). Su un telefono serve il secondo, ma il primo
-- resta utile per non perdere informazione.
alter table matches add column if not exists home_team_short text;
alter table matches add column if not exists away_team_short text;

-- `position` era un ordinamento fisso e univoco per giornata. Non regge:
-- gli orari di Serie A cambiano fino all'ultimo, e a ogni risincronizzazione
-- l'ordine delle partite può cambiare — facendo sbattere il vincolo di
-- unicità a metà aggiornamento. L'ordine vero è il calcio d'inizio.
alter table matches drop constraint if exists matches_matchday_id_position_key;
alter table matches alter column position drop not null;

create index if not exists matches_kickoff_idx on matches (matchday_id, kickoff_at);

-- Le partite rinviate perdono la data: quando l'orario del recupero non è
-- ancora noto, football-data restituisce comunque un utcDate provvisorio,
-- ma il nostro lock deve poterle ignorare.
create index if not exists matches_status_idx on matches (status);
