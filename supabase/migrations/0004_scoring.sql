-- ============================================================
-- Riscrittura dei punteggi di una giornata, in una transazione sola.
--
-- Il calcolo vero avviene in TypeScript, nel motore coperto dai test. Qui
-- serve solo che il risultato atterri nel database senza stati intermedi:
-- un ricalcolo che cancellasse le righe vecchie e poi fallisse a metà
-- lascerebbe una classifica con dei buchi, e nessuno se ne accorgerebbe
-- finché non guarda i punti.
--
-- Da eseguire nell'SQL Editor dopo la 0003. Rieseguibile.
-- ============================================================

create or replace function replace_matchday_scores(
  p_league_id   uuid,
  p_matchday_id uuid,
  p_scores      jsonb
) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_inserted int;
begin
  -- Via i punteggi precedenti di questa giornata, compresi quelli di
  -- partite che nel frattempo sono state rinviate e non valgono più.
  delete from prediction_scores ps
   where ps.league_id = p_league_id
     and ps.match_id in (select m.id from matches m where m.matchday_id = p_matchday_id);

  insert into prediction_scores (
    league_id, player_id, match_id,
    outcome_correct, exact, base_points, unique_bonus, points
  )
  select
    p_league_id,
    (e->>'player_id')::uuid,
    (e->>'match_id')::uuid,
    (e->>'outcome_correct')::boolean,
    (e->>'exact')::boolean,
    (e->>'base_points')::int,
    (e->>'unique_bonus')::int,
    (e->>'points')::int
  from jsonb_array_elements(coalesce(p_scores, '[]'::jsonb)) e;

  get diagnostics v_inserted = row_count;
  return v_inserted;
end $$;

revoke execute on function replace_matchday_scores(uuid, uuid, jsonb)
  from public, anon, authenticated;
grant execute on function replace_matchday_scores(uuid, uuid, jsonb)
  to service_role;
