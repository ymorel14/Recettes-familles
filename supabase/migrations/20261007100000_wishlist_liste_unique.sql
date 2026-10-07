-- =========================================================================
-- Migration — CadeauCommun : une seule liste par personne
--
-- Avant : une liste par personne ET par événement. Après : chaque personne
-- a UNE liste permanente ; c'est en réservant un cadeau (ou en participant
-- à un pot commun) qu'on choisit pour quel événement on l'offre.
--
-- 1. Fusion : les listes d'une même personne sont réunies en une seule
--    (souhaits, idées cachées, options, réservations, participations,
--    partages). Chaque réservation et participation existante est rattachée
--    à l'événement de son ancienne liste.
-- 2. Visibilité : une liste se voit par les familles de son destinataire
--    (et non plus par la famille d'un événement), plus ses partages.
-- 3. Réservation et participation : un événement à venir est obligatoire.
--    Il doit concerner le destinataire (événement collectif de sa famille,
--    ou événement personnel dont il est la personne fêtée). Les
--    participations à un même pot partagent l'événement choisi par la
--    première.
-- 4. Après la fête : le lendemain de la date de remise (ou de l'événement),
--    les cadeaux réservés pour lui sont considérés comme offerts et
--    disparaissent de la liste (fonctions souhaits_offerts /
--    options_offertes). Rien ne change avant la date : la surprise reste
--    entière ; les donateurs gardent leurs réservations dans "À offrir".
--
-- Pré-requis : migrations CadeauCommun précédentes (pot commun, transfert,
-- options).
-- =========================================================================

begin;

-- -------------------------------------------------------------------------
-- 0. Événement des réservations et participations
-- -------------------------------------------------------------------------

alter table wishlist.reservations
  add column if not exists evenement_id uuid references wishlist.evenements (id) on delete set null;
alter table wishlist.participations
  add column if not exists evenement_id uuid references wishlist.evenements (id) on delete set null;

comment on column wishlist.reservations.evenement_id is
  'Événement pour lequel le cadeau est offert (choisi en réservant).';
comment on column wishlist.participations.evenement_id is
  'Événement pour lequel le pot est offert ; le même pour toutes les participations d''un pot.';

-- Rattacher les réservations et participations existantes à l'événement de
-- leur liste actuelle (avant la fusion).
update wishlist.reservations r
set evenement_id = l.evenement_id
from wishlist.souhaits s
join wishlist.listes l on l.id = s.liste_id
where r.souhait_id = s.id and r.evenement_id is null;

update wishlist.participations p
set evenement_id = l.evenement_id
from wishlist.souhaits s
join wishlist.listes l on l.id = s.liste_id
where p.souhait_id = s.id and p.evenement_id is null;

-- -------------------------------------------------------------------------
-- 1. Fusion des listes d'une même personne
-- -------------------------------------------------------------------------

alter table wishlist.listes alter column evenement_id drop not null;
alter table wishlist.listes drop constraint if exists listes_evenement_id_destinataire_id_key;

do $$
declare
  d record;
  gardee uuid;
begin
  -- Le déclencheur des souhaits interdit de changer de liste, sauf pendant
  -- un transfert (drapeau de la migration du transfert de liste).
  perform set_config('wishlist.transfert_en_cours', 'oui', true);

  for d in
    select destinataire_id from wishlist.listes group by destinataire_id having count(*) > 1
  loop
    -- Liste gardée : une liste publiée de préférence, la plus ancienne.
    select id into gardee from wishlist.listes
    where destinataire_id = d.destinataire_id
    order by (statut = 'publiee') desc, cree_le asc
    limit 1;

    update wishlist.souhaits set liste_id = gardee
    where liste_id in (select id from wishlist.listes where destinataire_id = d.destinataire_id and id <> gardee);

    insert into wishlist.liste_familles (liste_id, famille_id)
    select gardee, lf.famille_id
    from wishlist.liste_familles lf
    join wishlist.listes l on l.id = lf.liste_id
    where l.destinataire_id = d.destinataire_id and l.id <> gardee
    on conflict do nothing;

    -- Si l'une des listes était publiée, la liste unique l'est aussi.
    update wishlist.listes set statut = 'publiee'
    where id = gardee
      and exists (select 1 from wishlist.listes where destinataire_id = d.destinataire_id and statut = 'publiee');

    delete from wishlist.listes where destinataire_id = d.destinataire_id and id <> gardee;
  end loop;

  perform set_config('wishlist.transfert_en_cours', 'non', true);
end $$;

update wishlist.listes set evenement_id = null where evenement_id is not null;

create unique index if not exists listes_une_par_personne on wishlist.listes (destinataire_id);

comment on column wishlist.listes.evenement_id is
  'Ancien rattachement à un événement (avant la liste unique) ; toujours vide désormais.';

-- -------------------------------------------------------------------------
-- 2. Visibilité d'une liste : les familles de son destinataire
-- -------------------------------------------------------------------------

create or replace function wishlist.familles_de_liste(id_liste uuid)
returns setof uuid
language sql stable security definer
set search_path = wishlist, pg_temp
as $$
  select ff.famille_id
  from wishlist.listes l
  join famille.personnes p on p.id = l.destinataire_id
  join famille.famille_foyers ff on ff.foyer_id = p.foyer_id
  where l.id = id_liste
  union
  select lf.famille_id from wishlist.liste_familles lf where lf.liste_id = id_liste;
$$;

-- Créer une liste : pour une personne de mes familles, une seule par personne
-- (index unique). Plus de lien à un événement.
drop policy if exists "Créer une liste" on wishlist.listes;
create policy "Créer une liste" on wishlist.listes
  for insert with check (
    cree_par = auth.uid()
    and destinataire_id in (
      select id from famille.personnes where foyer_id in (select famille.foyers_de_mes_familles())
    )
  );

-- La liste d'une personne, créée au besoin : publiée si je la crée pour un
-- proche (la famille peut aussitôt y proposer des idées), en brouillon si
-- c'est la mienne.
create or replace function wishlist.liste_de(id_personne uuid)
returns uuid
language plpgsql security definer
set search_path = wishlist, pg_temp
as $$
declare
  p famille.personnes;
  id_liste uuid;
begin
  if auth.uid() is null then
    raise exception 'Connexion requise';
  end if;
  select * into p from famille.personnes where id = id_personne;
  if p.id is null or p.foyer_id not in (select famille.foyers_de_mes_familles()) then
    raise exception 'Personne introuvable';
  end if;

  select id into id_liste from wishlist.listes where destinataire_id = id_personne;
  if id_liste is null then
    insert into wishlist.listes (destinataire_id, statut, cree_par)
    values (id_personne, case when p.utilisateur_id = auth.uid() then 'brouillon' else 'publiee' end, auth.uid())
    on conflict do nothing
    returning id into id_liste;
    if id_liste is null then
      select id into id_liste from wishlist.listes where destinataire_id = id_personne;
    end if;
  end if;

  if not wishlist.peut_voir_liste(id_liste) then
    raise exception 'La liste de % n''est pas encore publiée', coalesce(nullif(trim(p.prenom), ''), 'cette personne');
  end if;
  return id_liste;
end;
$$;

grant execute on function wishlist.liste_de(uuid) to authenticated;

-- -------------------------------------------------------------------------
-- 3. Événement obligatoire, et qui concerne le destinataire
-- -------------------------------------------------------------------------

-- Date qui compte : la remise des cadeaux si elle est fixée.
create or replace function wishlist.date_cle(e wishlist.evenements)
returns date
language sql immutable
as $$ select coalesce(e.date_remise, e.date_evenement); $$;

-- Aujourd'hui, à l'heure de la France (l'événement "passe" le lendemain).
create or replace function wishlist.aujourdhui()
returns date
language sql stable
as $$ select (now() at time zone 'Europe/Paris')::date; $$;

-- Cet événement peut-il recevoir un cadeau de cette liste ? À venir (ou
-- aujourd'hui), visible de l'appelant, et concernant le destinataire.
create or replace function wishlist.evenement_pour_liste(id_evenement uuid, id_liste uuid)
returns boolean
language sql stable security definer
set search_path = wishlist, pg_temp
as $$
  select exists (
    select 1
    from wishlist.evenements e, wishlist.listes l
    where e.id = id_evenement and l.id = id_liste
      and wishlist.date_cle(e) >= wishlist.aujourdhui()
      and e.famille_id in (select famille.mes_familles())
      and (
        e.destinataire_id = l.destinataire_id
        or (e.destinataire_id is null and e.famille_id in (select wishlist.familles_de_liste(l.id)))
      )
  );
$$;

grant execute on function wishlist.evenement_pour_liste(uuid, uuid) to authenticated;

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

  -- Événement : obligatoire en réservant ; vérifié à chaque changement.
  if tg_op = 'INSERT' or new.evenement_id is distinct from old.evenement_id then
    if new.evenement_id is null then
      raise exception 'Choisissez pour quel événement vous offrez ce cadeau';
    end if;
    if not wishlist.evenement_pour_liste(new.evenement_id, s.liste_id) then
      raise exception 'Cet événement ne concerne pas cette personne, ou il est passé';
    end if;
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
  evenement_du_pot uuid;
begin
  if tg_op = 'UPDATE' then
    new.souhait_id := old.souhait_id;
    new.participant := old.participant;
    new.cree_le := old.cree_le;
    new.evenement_id := old.evenement_id;
    new.maj_le := now();
  end if;

  select * into s from wishlist.souhaits where id = new.souhait_id;
  if s.id is null then
    raise exception 'Cadeau introuvable';
  end if;
  if wishlist.est_destinataire(s.liste_id) then
    raise exception 'Impossible de participer à un cadeau de sa propre liste';
  end if;

  if tg_op = 'INSERT' then
    if not s.pot_commun or s.supprime_le is not null then
      raise exception 'Ce cadeau n''a pas de pot commun';
    end if;
    -- Un pot = un événement : celui de la première participation.
    select evenement_id into evenement_du_pot
    from wishlist.participations
    where souhait_id = s.id and evenement_id is not null and id <> new.id
    order by cree_le
    limit 1;
    if evenement_du_pot is not null then
      new.evenement_id := evenement_du_pot;
    elsif new.evenement_id is null then
      raise exception 'Choisissez pour quel événement ce pot est offert';
    elsif not wishlist.evenement_pour_liste(new.evenement_id, s.liste_id) then
      raise exception 'Cet événement ne concerne pas cette personne, ou il est passé';
    end if;
  end if;
  return new;
end;
$$;

-- -------------------------------------------------------------------------
-- 4. Somme d'un pot, avec son événement (pour les donateurs)
-- -------------------------------------------------------------------------

drop function if exists wishlist.etat_pots(uuid);
create function wishlist.etat_pots(id_liste uuid)
returns table (souhait_id uuid, total numeric, ma_participation numeric, evenement_id uuid)
language plpgsql stable security definer
set search_path = wishlist, pg_temp
as $$
begin
  if auth.uid() is null or not wishlist.peut_voir_liste(id_liste) then
    raise exception 'Liste introuvable';
  end if;
  if wishlist.est_destinataire(id_liste) then
    raise exception 'Surprise ! Les pots communs de votre liste ne vous sont pas montrés';
  end if;

  return query
  select s.id,
         coalesce(sum(p.montant), 0)::numeric,
         max(p.montant) filter (where p.participant = auth.uid()),
         (array_agg(p.evenement_id order by p.cree_le) filter (where p.evenement_id is not null))[1]
  from wishlist.souhaits s
  left join wishlist.participations p on p.souhait_id = s.id
  where s.liste_id = id_liste
    and (s.pot_commun or p.id is not null)
  group by s.id;
end;
$$;
grant execute on function wishlist.etat_pots(uuid) to authenticated;

-- -------------------------------------------------------------------------
-- 5. Cadeaux offerts : après la date de leur événement
--
-- Un souhait est offert quand tout ce qu'il demandait a été réservé pour
-- des événements passés : la quantité (souhait simple), le modèle choisi
-- (un au choix), toutes les options (plusieurs à offrir), ou le pot (une
-- participation pour un événement passé). Aucune information n'est donnée
-- sur un événement à venir : la surprise reste entière jusqu'au lendemain.
-- -------------------------------------------------------------------------

create or replace function wishlist.souhaits_offerts(id_liste uuid)
returns setof uuid
language sql stable security definer
set search_path = wishlist, pg_temp
as $$
  with passes as (
    select e.id from wishlist.evenements e where wishlist.date_cle(e) < wishlist.aujourdhui()
  ),
  r as (
    select r.* from wishlist.reservations r where r.evenement_id in (select id from passes)
  )
  select s.id
  from wishlist.souhaits s
  where s.liste_id = id_liste
    and wishlist.peut_voir_liste(id_liste)
    -- Le destinataire n'apprend rien des idées cachées, même offertes.
    and (not s.secret or not wishlist.est_destinataire(id_liste))
    and (
      (s.pot_commun and exists (
        select 1 from wishlist.participations p
        where p.souhait_id = s.id and p.evenement_id in (select id from passes)))
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

-- Options (plusieurs à offrir) déjà offertes, retirées de la liste.
create or replace function wishlist.options_offertes(id_liste uuid)
returns setof uuid
language sql stable security definer
set search_path = wishlist, pg_temp
as $$
  select o.id
  from wishlist.options o
  join wishlist.souhaits s on s.id = o.souhait_id
  join wishlist.reservations r on r.option_id = o.id
  join wishlist.evenements e on e.id = r.evenement_id
  where s.liste_id = id_liste
    and s.mode_options = 'toutes'
    and wishlist.date_cle(e) < wishlist.aujourdhui()
    and wishlist.peut_voir_liste(id_liste)
    and (not s.secret or not wishlist.est_destinataire(id_liste));
$$;

grant execute on function wishlist.souhaits_offerts(uuid), wishlist.options_offertes(uuid) to authenticated;

notify pgrst, 'reload schema';

commit;
