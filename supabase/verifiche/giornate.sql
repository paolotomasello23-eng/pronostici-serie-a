-- ============================================================
-- Stato delle giornate della stagione in corso.
--
-- Per ognuna: quando si blocca, quando è stata aggiornata l'ultima volta,
-- quante partite sono finite, quanti pronostici e quanti punteggi ci sono.
-- Serve a vedere a colpo d'occhio se il calendario e i risultati si stanno
-- aggiornando: una giornata già giocata con "finite" a zero, o con
-- "ultimo_sync" fermo da giorni, vuol dire che i sync automatici non girano.
--
-- Non modifica niente. Orari in ora italiana.
-- ============================================================

select d.number as giornata,
       d.status as stato,
       to_char(d.lock_at at time zone 'Europe/Rome', 'DD/MM HH24:MI') as blocco,
       to_char(d.last_synced_at at time zone 'Europe/Rome', 'DD/MM HH24:MI') as ultimo_sync,
       count(m.id) as partite,
       count(m.id) filter (where m.status = 'FINISHED') as finite,
       count(m.id) filter (where m.status in ('POSTPONED', 'SUSPENDED', 'CANCELLED')) as rinviate,
       (select count(*)
          from predictions p
          join matches mm on mm.id = p.match_id
         where mm.matchday_id = d.id) as pronostici,
       (select count(*)
          from prediction_scores ps
          join matches mm on mm.id = ps.match_id
         where mm.matchday_id = d.id) as punteggi
  from matchdays d
  left join matches m on m.matchday_id = d.id
 where d.season = (select max(season) from matchdays)
 group by d.id
 order by d.number;
