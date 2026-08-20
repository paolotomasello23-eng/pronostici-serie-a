-- ============================================================
-- Il pronostico appartiene alla persona, non alla persona-in-una-lega.
--
-- Finora la chiave era (lega, giocatore, partita): la stessa persona in due
-- leghe avrebbe potuto scrivere 2-1 in una e 1-1 nell'altra. Non è così che
-- funziona il gioco — il pronostico è uno, sono le classifiche a essere
-- separate.
--
-- La colonna `league_id` resta, per ora nullable e non più usata dal codice:
-- toglierla adesso spegnerebbe l'app nei minuti fra questa migrazione e la
-- pubblicazione. Si potrà eliminare a mente fredda.
--
-- Da eseguire nell'SQL Editor dopo la 0012. Rieseguibile.
-- ============================================================

alter table predictions
  drop constraint if exists predictions_league_id_player_id_match_id_key;

-- Un pronostico per persona e per partita, punto.
create unique index if not exists predictions_player_match_key
  on predictions (player_id, match_id);

alter table predictions alter column league_id drop not null;

-- ------------------------------------------------------------
-- Chi può vedere il pronostico di chi.
--
-- Senza la lega sulla riga, la domanda cambia: non più "siamo nella stessa
-- lega di questo pronostico", ma "abbiamo una lega in comune". Chi gioca in
-- due gruppi diversi resta invisibile a chi non condivide nulla con lui.
-- ------------------------------------------------------------
create or replace function shares_league_with(p_other uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
      from league_members mio
      join league_members suo on suo.league_id = mio.league_id
     where mio.player_id = current_player_id()
       and suo.player_id = p_other
  );
$$;

grant execute on function shares_league_with(uuid) to authenticated, service_role;

drop policy if exists predictions_select on predictions;
create policy predictions_select on predictions for select using (
  player_id = current_player_id()
  or (match_is_locked(match_id) and shares_league_with(predictions.player_id))
);

-- Scrittura: solo i propri, solo a finestra aperta. L'appartenenza a una
-- lega non c'entra più — il pronostico è tuo, e vale ovunque tu giochi.
drop policy if exists predictions_insert on predictions;
create policy predictions_insert on predictions for insert with check (
  player_id = current_player_id()
  and match_accepts_predictions(match_id)
);

drop policy if exists predictions_update on predictions;
create policy predictions_update on predictions for update
  using      (player_id = current_player_id() and match_accepts_predictions(match_id))
  with check (player_id = current_player_id() and match_accepts_predictions(match_id));
