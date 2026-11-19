-- ============================================================
-- I job di Supabase senza chiavi da copiare a mano.
--
-- La 0016 chiedeva di salvare nel Vault l'indirizzo dell'app e il valore
-- di CRON_SECRET. Copiati a mano, sono rimasti i testi d'esempio: i job
-- partivano ogni dieci minuti verso un indirizzo che non era il nostro, e
-- non succedeva niente.
--
-- Qui non c'è niente da sostituire:
--   - l'indirizzo è pubblico (è la homepage del repository su GitHub);
--   - la chiave la genera il database, e l'app la verifica chiedendola al
--     database stesso (funzione `chiave_cron_valida`). Non lascia mai il
--     database se non dentro le chiamate dei job.
--
-- CRON_SECRET resta valida: la usano i workflow di GitHub.
--
-- Rimette inoltre "da ricalcolare" le giornate già chiuse della stagione:
-- il controllo dei risultati le rifà tutte, con il codice corretto, cinque
-- alla volta. Recupera i punti rimasti fuori (come nella giornata 4) e non
-- manda notifiche: per le giornate finite da più di due giorni sono spente.
--
-- Da eseguire nell'SQL Editor dopo la 0016, e DOPO che l'app aggiornata è
-- online (altrimenti l'app non riconosce ancora la nuova chiave e risponde
-- 401). Rieseguibile: ogni volta genera una chiave nuova.
-- ============================================================

-- Via i valori d'esempio, dentro quelli veri.
delete from vault.secrets where name in ('pronostici_app_url', 'pronostici_cron_secret');

select vault.create_secret(
  'https://pronostici-serie-a.vercel.app',
  'pronostici_app_url',
  'Indirizzo dell''app chiamato dai job di pg_cron'
);

-- Due uuid casuali in fila: 64 caratteri esadecimali, senza bisogno di
-- estensioni.
select vault.create_secret(
  replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  'pronostici_cron_secret',
  'Chiave dei job di pg_cron, verificata dall''app con chiave_cron_valida'
);

-- L'app chiede al database se la chiave ricevuta è quella giusta. Solo il
-- server (service_role) può chiederlo: un browser non deve poter provare
-- chiavi a ripetizione.
create or replace function public.chiave_cron_valida(p_chiave text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
      from vault.decrypted_secrets
     where name = 'pronostici_cron_secret'
       and decrypted_secret = p_chiave
  );
$$;

revoke execute on function public.chiave_cron_valida(text) from public, anon, authenticated;
grant execute on function public.chiave_cron_valida(text) to service_role;

-- Tutte le giornate già chiuse della stagione tornano da ricalcolare.
update matchdays
   set status = 'locked'
 where status = 'scored'
   and lock_at <= now()
   and season = (select max(season) from matchdays);

-- Una prova subito: il calendario, che non cambia niente se è già in pari.
-- L'esito si legge dopo qualche secondo con:
--   select created, status_code, left(content, 150) from net._http_response
--    order by created desc limit 3;
select net.http_post(
  url := 'https://pronostici-serie-a.vercel.app/api/cron/matches',
  headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'pronostici_cron_secret')
  ),
  body := '{}'::jsonb,
  timeout_milliseconds := 120000
);

-- La funzione nuova dev'essere subito chiamabile dall'app.
notify pgrst, 'reload schema';
