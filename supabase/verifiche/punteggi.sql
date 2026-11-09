-- ============================================================
-- Controllo dei punteggi salvati.
--
-- Ricalcola in SQL, partita per partita e lega per lega, i punti che ogni
-- giocatore dovrebbe avere, con le stesse regole del motore (engine.ts):
--
--   3  risultato esatto
--   1  esito 1/X/2 giusto, risultato sbagliato
--  +2  bonus se l'esito l'ha azzeccato uno solo della lega
--  +1  a testa se l'hanno azzeccato in due
--      (il bonus vale solo con almeno `unique_bonus_min_predictions`
--       pronostici sulla partita, contando solo i membri della lega)
--
-- e li confronta con `prediction_scores`. Non modifica niente: si può
-- lanciare quando si vuole dall'SQL Editor.
--
-- Una riga per lega e giornata:
--   mancanti   punti che dovrebbero esserci e non ci sono
--   sbagliate  punti salvati diversi da quelli attesi
--   in_piu     punti salvati che non dovrebbero esistere
-- ============================================================

with membri as (
  select lm.league_id, lm.player_id, l.unique_bonus_min_predictions as soglia
    from league_members lm
    join leagues l on l.id = lm.league_id
),
finite as (
  select m.id as match_id,
         m.home_goals as gol_casa,
         m.away_goals as gol_trasferta,
         sign(m.home_goals - m.away_goals) as esito
    from matches m
   where m.status = 'FINISHED'
     and m.home_goals is not null
     and m.away_goals is not null
),
pronostici as (
  select mb.league_id,
         mb.soglia,
         p.player_id,
         f.match_id,
         sign(p.home_goals - p.away_goals) = f.esito as esito_ok,
         (p.home_goals = f.gol_casa and p.away_goals = f.gol_trasferta) as esatto
    from predictions p
    join finite f on f.match_id = p.match_id
    join membri mb on mb.player_id = p.player_id
),
per_partita as (
  select league_id,
         match_id,
         count(*) as quanti,
         count(*) filter (where esito_ok) as indovini
    from pronostici
   group by league_id, match_id
),
attesi as (
  select pr.league_id,
         pr.player_id,
         pr.match_id,
         pr.esito_ok,
         pr.esatto,
         case when pr.esatto then 3 when pr.esito_ok then 1 else 0 end as base,
         case
           when pr.esito_ok
            and pp.quanti >= pr.soglia
            and pp.indovini between 1 and 2
           then 2 / pp.indovini
           else 0
         end as bonus
    from pronostici pr
    join per_partita pp using (league_id, match_id)
),
confronto as (
  select coalesce(a.league_id, s.league_id) as league_id,
         coalesce(a.match_id, s.match_id) as match_id,
         a.base + a.bonus as attesi,
         s.points as salvati,
         case
           when s.player_id is null then 'mancante'
           when a.player_id is null then 'in_piu'
           when (s.points, s.base_points, s.unique_bonus, s.exact, s.outcome_correct)
                <> (a.base + a.bonus, a.base, a.bonus, a.esatto, a.esito_ok)
           then 'sbagliato'
           else 'ok'
         end as verdetto
    from attesi a
    full join prediction_scores s
      on s.league_id = a.league_id
     and s.player_id = a.player_id
     and s.match_id = a.match_id
)
select l.name as lega,
       d.season as stagione,
       d.number as giornata,
       d.status as stato,
       count(*) filter (where c.verdetto = 'ok') as righe_ok,
       count(*) filter (where c.verdetto = 'mancante') as mancanti,
       count(*) filter (where c.verdetto = 'sbagliato') as sbagliate,
       count(*) filter (where c.verdetto = 'in_piu') as in_piu,
       coalesce(sum(c.attesi), 0) as punti_attesi,
       coalesce(sum(c.salvati), 0) as punti_salvati,
       case when count(*) filter (where c.verdetto <> 'ok') = 0 then 'ok' else 'DA RICALCOLARE' end as esito
  from confronto c
  join leagues l on l.id = c.league_id
  join matches m on m.id = c.match_id
  join matchdays d on d.id = m.matchday_id
 group by l.id, l.name, d.season, d.number, d.status
 order by l.name, d.season, d.number;
