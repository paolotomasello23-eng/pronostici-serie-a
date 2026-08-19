-- ============================================================
-- I pronostici di una giornata si aprono cinque giorni prima.
--
-- Finora l'unico limite era il blocco al calcio d'inizio: si poteva
-- compilare la trentottesima giornata a settembre, quando gli orari non sono
-- fissati e le rose sono un'altra cosa.
--
-- Come per il lock, la regola non vive solo nelle API: sta nelle policy,
-- così vale anche per chi provasse a scrivere scavalcando l'applicazione.
--
-- Da eseguire nell'SQL Editor dopo la 0010. Rieseguibile.
-- ============================================================

create or replace function match_accepts_predictions(p_match uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
      from matches m
      join matchdays d on d.id = m.matchday_id
     where m.id = p_match
       and d.lock_at is not null
       and now() >= d.lock_at - interval '5 days'
       and now() <  d.lock_at
  );
$$;

grant execute on function match_accepts_predictions(uuid) to authenticated, service_role;

-- Le due policy di scrittura ora chiedono che la finestra sia aperta, non
-- soltanto che non sia ancora chiusa.
drop policy if exists predictions_insert on predictions;
create policy predictions_insert on predictions for insert with check (
  player_id = current_player_id()
  and is_league_member(league_id)
  and match_accepts_predictions(match_id)
);

drop policy if exists predictions_update on predictions;
create policy predictions_update on predictions for update
  using      (player_id = current_player_id() and match_accepts_predictions(match_id))
  with check (player_id = current_player_id() and match_accepts_predictions(match_id));
