-- ============================================================
-- L'amministratore dell'app, distinto da quello di una lega.
--
-- Calendario e risultati sono uno solo per tutte le leghe: se Inter-Milan
-- finisce 2-1, finisce 2-1 per tutti. Finché c'era una lega sola, il suo
-- admin era anche chi gestiva il calendario. Da quando chiunque può creare
-- la propria lega, chiunque ne diventa admin — e con il vecchio controllo
-- poteva correggere risultati, spostare orari e riaprire giornate già
-- bloccate in TUTTE le leghe, non solo nella sua.
--
-- Da qui in avanti:
--   admin di lega  ->  i giocatori della propria lega
--   admin dell'app ->  calendario, risultati, blocchi
--
-- Diventa admin dell'app chi ha creato la prima lega, cioè chi l'app l'ha
-- messa in piedi. Altri si aggiungono a mano, dall'SQL Editor:
--   update players set is_app_admin = true where lower(username) = 'nome';
--
-- Da eseguire nell'SQL Editor dopo la 0014. Rieseguibile.
-- ============================================================

alter table players
  add column if not exists is_app_admin boolean not null default false;

-- Solo se non c'è ancora nessuno: rieseguendo la migrazione non si deve
-- rimettere il titolo a chi gli fosse stato tolto di proposito.
update players p
   set is_app_admin = true
 where not exists (select 1 from players x where x.is_app_admin)
   and p.id in (
     select lm.player_id
       from league_members lm
      where lm.role = 'admin'
        and lm.league_id = (select l.id from leagues l order by l.created_at limit 1)
   );

-- ------------------------------------------------------------
-- Ingresso in una lega dove il proprio nome è già occupato.
--
-- Il suffisso veniva attaccato al nome intero: con un nome utente di 18
-- caratteri o più si superava il limite di 20 della colonna, e l'ingresso
-- falliva con un errore generico. Ora il nome si accorcia per far posto
-- al suffisso, e se anche quello fosse occupato se ne prova uno più lungo.
-- ------------------------------------------------------------
create or replace function join_league(
  p_player_id   uuid,
  p_invite_code text
) returns table (league_id uuid, league_name text)
language plpgsql security definer set search_path = public as $$
declare
  v_league_id uuid;
  v_name      text;
  v_username  text;
  v_display   text;
  v_len       int := 2;
begin
  select l.id, l.name into v_league_id, v_name from leagues l
   where upper(l.invite_code) = upper(trim(p_invite_code));

  if v_league_id is null then
    raise exception 'INVITE_CODE_NOT_FOUND';
  end if;

  if exists (
    select 1 from league_members lm
     where lm.league_id = v_league_id and lm.player_id = p_player_id
  ) then
    raise exception 'ALREADY_MEMBER';
  end if;

  select pl.username into v_username from players pl where pl.id = p_player_id;
  if v_username is null then
    raise exception 'PLAYER_NOT_FOUND';
  end if;

  v_display := v_username;

  while exists (
    select 1 from league_members lm
     where lm.league_id = v_league_id
       and lower(lm.display_name) = lower(v_display)
  ) loop
    -- Un uuid ha 32 cifre esadecimali: oltre le 8 c'è qualcosa che non va.
    if v_len > 8 then
      raise exception 'NAME_TAKEN';
    end if;
    v_display := left(v_username, 20 - 1 - v_len)
                 || '-' || substr(replace(p_player_id::text, '-', ''), 1, v_len);
    v_len := v_len + 2;
  end loop;

  insert into league_members (league_id, player_id, display_name, role)
  values (v_league_id, p_player_id, v_display, 'player');

  return query select v_league_id, v_name;
end $$;

revoke execute on function join_league(uuid, text)
  from public, anon, authenticated;
grant execute on function join_league(uuid, text) to service_role;
