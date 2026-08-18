-- ============================================================
-- Vista di appoggio per la classifica.
--
-- `prediction_scores` non sa a quale giornata appartenga una riga: lo sa la
-- partita. Senza questa vista, costruire la classifica di stagione
-- significherebbe passare al database la lista di tutti i 380 id delle
-- partite dentro l'URL della query.
--
-- `security_invoker = true` è la parte importante: senza, la vista girerebbe
-- con i permessi di chi l'ha creata e diventerebbe una porta di servizio per
-- leggere i punteggi di leghe altrui, scavalcando le policy RLS.
--
-- Da eseguire nell'SQL Editor dopo la 0004. Rieseguibile.
-- ============================================================

create or replace view v_scores_by_matchday
with (security_invoker = true) as
select
  ps.league_id,
  ps.player_id,
  ps.match_id,
  ps.outcome_correct,
  ps.exact,
  ps.base_points,
  ps.unique_bonus,
  ps.points,
  m.matchday_id,
  d.season,
  d.number as matchday_number
from prediction_scores ps
join matches   m on m.id = ps.match_id
join matchdays d on d.id = m.matchday_id;

grant select on v_scores_by_matchday to authenticated;
