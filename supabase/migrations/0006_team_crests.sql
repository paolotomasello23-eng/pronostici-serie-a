-- ============================================================
-- Stemmi delle squadre.
--
-- Salviamo l'indirizzo dell'immagine, non l'immagine: football-data la
-- serve già, e a noi costa due colonne di testo.
--
-- Restano vuoti per le partite inserite a mano, e la pagina se la cava lo
-- stesso mostrando l'iniziale della squadra.
--
-- Da eseguire nell'SQL Editor dopo la 0005. Rieseguibile.
-- ============================================================

alter table matches add column if not exists home_team_crest text;
alter table matches add column if not exists away_team_crest text;
