-- ============================================================
-- Nuova regola del bonus: 2 punti in palio per partita.
--
--   1 solo indovina l'esito  ->  2 punti a lui
--   in 2 indovinano          ->  1 punto a testa
--   in 3 o più               ->  niente
--
-- Il vincolo scritto nella 0001 ammetteva solo 0 o 1, quindi il database
-- rifiuterebbe il bonus pieno. È una protezione utile — vale la pena
-- allargarla invece di toglierla, così continua a intercettare i valori
-- assurdi.
--
-- Da eseguire nell'SQL Editor dopo la 0008. Rieseguibile.
-- ============================================================

alter table prediction_scores
  drop constraint if exists prediction_scores_unique_bonus_check;

alter table prediction_scores
  add constraint prediction_scores_unique_bonus_check
  check (unique_bonus in (0, 1, 2));
