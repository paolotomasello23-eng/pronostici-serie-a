-- ============================================================
-- I sync automatici passano da GitHub Actions a Supabase (pg_cron).
--
-- GitHub non era affidabile per due motivi:
--
-- 1. Disattiva i workflow programmati dopo 60 giorni senza commit. È
--    successo il 21 ottobre 2026: da quel giorno calendario, risultati e
--    promemoria si sono fermati, senza che nessuno se ne accorgesse.
-- 2. Anche quando erano attivi, sotto carico ne eseguiva una piccola parte:
--    i risultati, previsti ogni 15 minuti, giravano tre volte al giorno; i
--    promemoria, ogni 10 minuti, quattro o cinque. Quello di mezz'ora prima
--    del blocco non partiva quasi mai.
--
-- pg_cron gira dentro il database: parte all'orario, ogni volta, e non si
-- spegne per inattività. Chiama gli stessi indirizzi di prima, con la stessa
-- chiave, quindi l'app non cambia. È incluso nel piano gratuito.
--
-- PRIMA di eseguire questo file vanno salvati nel Vault i due valori che
-- prima stavano nei segreti di GitHub (non nel codice: il repository è
-- pubblico). Dall'SQL Editor, con i valori veri:
--
--   select vault.create_secret('https://NOME-PROGETTO.vercel.app', 'pronostici_app_url');
--   select vault.create_secret('VALORE-DI-CRON_SECRET', 'pronostici_cron_secret');
--
-- Per cambiarli in seguito:
--   delete from vault.secrets where name in ('pronostici_app_url', 'pronostici_cron_secret');
-- e poi di nuovo i due `create_secret`.
--
-- Orari in UTC, come prima: l'Italia è avanti di un'ora d'inverno e di due
-- d'estate.
--
-- Da eseguire nell'SQL Editor dopo la 0015. Rieseguibile: un job con lo
-- stesso nome viene sostituito, non duplicato.
-- ============================================================

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

-- Calendario: partite e orari, quindi il momento del blocco.
-- 06:00 e 18:00 UTC.
select cron.schedule(
  'pronostici-calendario',
  '0 6,18 * * *',
  $$
  select net.http_post(
    url := rtrim((select decrypted_secret from vault.decrypted_secrets where name = 'pronostici_app_url'), '/')
           || '/api/cron/matches',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'pronostici_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
  $$
);

-- Risultati e classifica: ogni 15 minuti da venerdì a lunedì, dalle 12 a
-- mezzanotte UTC, quando si gioca il campionato.
select cron.schedule(
  'pronostici-risultati-weekend',
  '*/15 12-23 * * 5,6,0,1',
  $$
  select net.http_post(
    url := rtrim((select decrypted_secret from vault.decrypted_secrets where name = 'pronostici_app_url'), '/')
           || '/api/cron/results',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'pronostici_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 300000
  );
  $$
);

-- Martedì e mercoledì sera: turni infrasettimanali e recuperi.
select cron.schedule(
  'pronostici-risultati-settimana',
  '*/30 18-22 * * 2,3',
  $$
  select net.http_post(
    url := rtrim((select decrypted_secret from vault.decrypted_secrets where name = 'pronostici_app_url'), '/')
           || '/api/cron/results',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'pronostici_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 300000
  );
  $$
);

-- Una passata ogni mattina, per raccogliere quello che si fosse perso.
select cron.schedule(
  'pronostici-risultati-mattina',
  '0 7 * * *',
  $$
  select net.http_post(
    url := rtrim((select decrypted_secret from vault.decrypted_secrets where name = 'pronostici_app_url'), '/')
           || '/api/cron/results',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'pronostici_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 300000
  );
  $$
);

-- Promemoria: ogni 10 minuti dalle 5 alle 23 UTC. È l'endpoint a decidere
-- se è il momento di una delle chiamate, e ognuna parte una volta sola per
-- giornata e per persona.
select cron.schedule(
  'pronostici-promemoria',
  '*/10 5-23 * * *',
  $$
  select net.http_post(
    url := rtrim((select decrypted_secret from vault.decrypted_secrets where name = 'pronostici_app_url'), '/')
           || '/api/cron/reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'pronostici_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
  $$
);

-- Avviso se i segreti mancano: i job ci sono, ma fallirebbero a ogni giro.
do $$
begin
  if (select count(*) from vault.decrypted_secrets
       where name in ('pronostici_app_url', 'pronostici_cron_secret')) < 2 then
    raise warning 'Mancano i segreti nel Vault: i job sono programmati ma non funzioneranno finché non li aggiungi (vedi le istruzioni in cima al file).';
  end if;
end $$;
