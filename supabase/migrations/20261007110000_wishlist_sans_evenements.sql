-- =========================================================================
-- Migration — CadeauCommun : plus de notion d'événement
--
-- CadeauCommun ne gère plus que des listes de souhaits, une par personne.
-- Les événements relèvent de l'app VoyageCommun (la table
-- wishlist.evenements reste en place : VoyageCommun s'y réfère).
--
-- 1. Réserver un cadeau ou participer à un pot ne demande plus d'événement
--    (les colonnes evenement_id restent, facultatives et inutilisées).
-- 2. "Offert" : le donateur coche "offert" une fois le cadeau remis
--    (reservations.offert_le) ; pour un pot, n'importe quel participant le
--    coche (participations.offert_le). Le cadeau disparaît alors de la liste,
--    pour tout le monde. Rien n'est retiré avant : la surprise reste entière.
-- 3. Reprise : les réservations et participations rattachées à un événement
--    déjà passé sont considérées comme offertes.
--
-- Pré-requis : 20261007100000_wishlist_liste_unique.sql.
-- =========================================================================

begin;

-- -------------------------------------------------------------------------
-- 1. "Offert"
-- -------------------------------------------------------------------------

alter table wishlist.reservations add column if not exists offert_le timestamptz;
alter table wishlist.participations add column if not exists offert_le timestamptz;

comment on column wishlist.reservations.offert_le is
  'Coché par le donateur une fois le cadeau remis : le cadeau disparaît alors de la liste.';
comment on column wishlist.participations.offert_le is
  'Coché par un participant une fois le cadeau du pot remis : le cadeau disparaît alors de la liste.';

-- Reprise : ce qui était réservé pour un événement passé a été offert.
update wishlist.reservations r
set offert_le = now()
from wishlist.evenements e
where r.evenement_id = e.id and r.offert_le is null
  and coalesce(e.date_remise, e.date_evenement) < (now() at time zone 'Europe/Paris')::date;

update wishlist.participations p
set offert_le = now()
from wishlist.evenements e
where p.evenement_id = e.id and p.offert_le is null
  and coalesce(e.date_remise, e.date_evenement) < (now() at time zone 'Europe/Paris')::date;

-- -------------------------------------------------------------------------
-- 2. Réservation et participation sans événement
-- -------------------------------------------------------------------------

create or replace function wishlist.controler_reservation()
returns trigger
language plpgsql security definer
set search_path = wishlist, pg_temp
as $$
declare
  s wishlist.souhaits;
  deja integer;
begin
  if tg_op = 'UPDATE' then
    new.souhait_id := old.souhait_id;
    new.reserve_par := old.reserve_par;
    new.option_id := old.option_id;
  end if;
  select * into s from wishlist.souhaits where id = new.souhait_id;

  if wishlist.est_destinataire(s.liste_id) then
    raise exception 'Impossible de réserver un cadeau de sa propre liste';
  end if;
  if s.supprime_le is not null and tg_op = 'INSERT' then
    raise exception 'Ce souhait a été retiré de la liste';
  end if;

  if tg_op = 'INSERT' and s.mode_options is not null then
    if new.option_id is null
       or not exists (select 1 from wishlist.options o where o.id = new.option_id and o.souhait_id = s.id) then
      raise exception 'Choisissez une option de ce cadeau';
    end if;
    new.quantite := 1;
    if s.mode_options = 'un_au_choix'
       and exists (select 1 from wishlist.reservations r where r.souhait_id = s.id and r.id <> new.id) then
      raise exception 'Ce cadeau est déjà réservé';
    end if;
    if s.mode_options = 'toutes'
       and exists (select 1 from wishlist.reservations r where r.option_id = new.option_id and r.id <> new.id) then
      raise exception 'Cette option est déjà réservée';
    end if;
    return new;
  end if;

  if tg_op = 'INSERT' and new.option_id is not null then
    raise exception 'Ce cadeau n''a pas d''options';
  end if;

  if s.mode_options is null then
    select coalesce(sum(quantite), 0) into deja
    from wishlist.reservations
    where souhait_id = new.souhait_id and id <> new.id;
    if deja + new.quantite > s.quantite then
      raise exception 'Ce cadeau est déjà réservé';
    end if;
  end if;
  return new;
end;
$$;

create or replace function wishlist.controler_participation()
returns trigger
language plpgsql security definer
set search_path = wishlist, pg_temp
as $$
declare
  s wishlist.souhaits;
begin
  if tg_op = 'UPDATE' then
    new.souhait_id := old.souhait_id;
    new.participant := old.participant;
    new.cree_le := old.cree_le;
    new.maj_le := now();
  end if;

  select * into s from wishlist.souhaits where id = new.souhait_id;
  if s.id is null then
    raise exception 'Cadeau introuvable';
  end if;
  if wishlist.est_destinataire(s.liste_id) then
    raise exception 'Impossible de participer à un cadeau de sa propre liste';
  end if;
  if tg_op = 'INSERT' and (not s.pot_commun or s.supprime_le is not null) then
    raise exception 'Ce cadeau n''a pas de pot commun';
  end if;
  return new;
end;
$$;

-- -------------------------------------------------------------------------
-- 3. Cadeaux offerts : retirés de la liste
--
-- Un souhait est offert quand tout ce qu'il demandait a été coché "offert" :
-- la quantité (souhait simple), le modèle choisi (un au choix), toutes les
-- options (plusieurs à offrir), ou le pot (une participation cochée). Le
-- destinataire n'apprend rien des idées cachées, même offertes.
-- -------------------------------------------------------------------------

create or replace function wishlist.souhaits_offerts(id_liste uuid)
returns setof uuid
language sql stable security definer
set search_path = wishlist, pg_temp
as $$
  with r as (
    select r.* from wishlist.reservations r where r.offert_le is not null
  )
  select s.id
  from wishlist.souhaits s
  where s.liste_id = id_liste
    and wishlist.peut_voir_liste(id_liste)
    and (not s.secret or not wishlist.est_destinataire(id_liste))
    and (
      (s.pot_commun and exists (
        select 1 from wishlist.participations p where p.souhait_id = s.id and p.offert_le is not null))
      or (not s.pot_commun and s.mode_options is null
          and (select coalesce(sum(r.quantite), 0) from r where r.souhait_id = s.id) >= s.quantite)
      or (not s.pot_commun and s.mode_options = 'un_au_choix'
          and exists (select 1 from r where r.souhait_id = s.id))
      or (s.mode_options = 'toutes'
          and exists (select 1 from wishlist.options o where o.souhait_id = s.id)
          and not exists (
            select 1 from wishlist.options o
            where o.souhait_id = s.id and not exists (select 1 from r where r.option_id = o.id)))
    );
$$;

create or replace function wishlist.options_offertes(id_liste uuid)
returns setof uuid
language sql stable security definer
set search_path = wishlist, pg_temp
as $$
  select o.id
  from wishlist.options o
  join wishlist.souhaits s on s.id = o.souhait_id
  join wishlist.reservations r on r.option_id = o.id
  where s.liste_id = id_liste
    and s.mode_options = 'toutes'
    and r.offert_le is not null
    and wishlist.peut_voir_liste(id_liste)
    and (not s.secret or not wishlist.est_destinataire(id_liste));
$$;

-- Fonctions d'événement de la version précédente, devenues inutiles.
drop function if exists wishlist.evenement_pour_liste(uuid, uuid);

notify pgrst, 'reload schema';

commit;
