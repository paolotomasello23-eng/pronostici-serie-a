-- ============================================================
-- Immagine del profilo.
--
-- I file vanno in Supabase Storage, in un contenitore pubblico in lettura:
-- gli avatar sono immagini che tutti i membri devono poter vedere, e
-- renderle private significherebbe generare un indirizzo firmato a ogni
-- caricamento di ogni pagina, per proteggere una foto che comunque tutti
-- nella lega vedono.
--
-- La scrittura resta riservata al server: il nostro codice carica con la
-- chiave di servizio, che salta le policy. Nessun browser può caricare
-- direttamente nel contenitore.
--
-- Da eseguire nell'SQL Editor dopo la 0009. Rieseguibile.
-- ============================================================

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

alter table players add column if not exists avatar_url text;

-- ------------------------------------------------------------
-- Nomi squadra più corti.
--
-- football-data restituisce "Como 1907" e "Venezia FC" anche nel nome
-- breve. Su un telefono, accanto allo stemma e a due caselle per i gol,
-- ogni carattere in più toglie spazio.
-- ------------------------------------------------------------
update matches set home_team_short = 'Como'    where home_team_short = 'Como 1907';
update matches set away_team_short = 'Como'    where away_team_short = 'Como 1907';
update matches set home_team_short = 'Venezia' where home_team_short = 'Venezia FC';
update matches set away_team_short = 'Venezia' where away_team_short = 'Venezia FC';

-- ============================================================
-- Vista per leggere gli avatar dei compagni di lega.
--
-- `players` non è leggibile da nessun browser, e deve restare così: contiene
-- gli hash dei PIN. Aprirla per mostrare una fotina significherebbe esporre
-- anche quelli, perché le policy filtrano le righe, non le colonne.
--
-- Questa vista espone soltanto tre campi innocui, e il filtro interno la
-- limita alle leghe di cui chi guarda fa parte. Gira con i privilegi del
-- creatore (nessun security_invoker) proprio perché deve poter leggere una
-- tabella che l'utente non può toccare: è il WHERE qui sotto a fare da
-- guardia, ed è scritto per essere l'unica cosa da controllare.
-- ============================================================
drop view if exists v_member_avatars;
create view v_member_avatars as
select
  lm.league_id,
  lm.player_id,
  p.avatar_url
from league_members lm
join players p on p.id = lm.player_id
where exists (
  select 1
    from league_members me
   where me.league_id = lm.league_id
     and me.player_id = current_player_id()
);

grant select on v_member_avatars to authenticated, service_role;
