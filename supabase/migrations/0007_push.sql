-- ============================================================
-- Notifiche push.
--
-- Ogni telefono che dà il permesso produce un "endpoint" a cui si possono
-- mandare notifiche. Ne salviamo uno per dispositivo: la stessa persona può
-- avere il telefono e il computer, e vuole l'avviso su entrambi.
--
-- Da eseguire nell'SQL Editor dopo la 0006. Rieseguibile.
-- ============================================================

create table if not exists push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  player_id  uuid not null references players(id) on delete cascade,
  -- L'indirizzo che il browser ci dà: è anche la chiave naturale, perché
  -- lo stesso dispositivo che si iscrive due volte lo ripete identico.
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_ok_at timestamptz,
  /* Quando un'iscrizione muore (app disinstallata, permesso revocato) il
     servizio di push risponde 404 o 410: la marchiamo invece di riprovare
     all'infinito. */
  failed_at  timestamptz
);

create index if not exists push_subscriptions_player_idx
  on push_subscriptions (player_id);

-- Traccia dei promemoria già inviati, per non svegliare la gente due volte
-- per la stessa giornata. La chiave primaria è la garanzia: un secondo
-- tentativo di inserimento fallisce, e tanto basta.
create table if not exists push_reminders (
  matchday_id uuid not null references matchdays(id) on delete cascade,
  player_id   uuid not null references players(id) on delete cascade,
  kind        text not null,
  sent_at     timestamptz not null default now(),
  primary key (matchday_id, player_id, kind)
);

alter table push_subscriptions enable row level security;
alter table push_reminders     enable row level security;

-- Nessuna policy: si toccano solo dal server. Le iscrizioni contengono le
-- chiavi di cifratura del dispositivo, non c'è motivo perché un browser
-- possa leggerle — nemmeno le proprie.

-- I GRANT della migrazione 0002 valevano per le tabelle che esistevano
-- allora: una tabella nuova nasce senza permessi per nessuno, e il server
-- si vedrebbe rispondere "permission denied" al primo salvataggio.
grant select, insert, update, delete on push_subscriptions to service_role;
grant select, insert, update, delete on push_reminders     to service_role;

-- E perché la stessa dimenticanza non si ripeta alla prossima tabella:
-- da qui in avanti quelle create in questo schema nascono già accessibili
-- al server.
alter default privileges in schema public
  grant select, insert, update, delete on tables to service_role;
