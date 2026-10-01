-- =========================================================================
-- Migration — Schéma "voyage" de l'app VoyageCommun
--
-- Préparer un voyage en famille, sur le même compte famille que Cuisine et
-- CadeauCommun (schéma "famille" : familles, foyers, personnes) :
--   - un calendrier commun où chacun indique, s'il le souhaite, ses
--     disponibilités (le motif peut rester privé) ;
--   - des voyages (destination connue ou non, période), ouverts à toute la
--     famille, en amoureux, ou à quelques personnes choisies ;
--   - un sondage de dates, puis des propositions d'hébergement avec avis,
--     les trajets de chacun (voiture : km, carburant, péages ; train,
--     avion, bateau : prix des billets), les activités sur place et des
--     postes de budget divers.
--
-- Qui voit quoi (garanti par les règles RLS) :
--   - un voyage "famille" est visible de toute la famille où il a été créé ;
--   - un voyage "en amoureux" ou "sélection" n'est visible QUE de ses
--     participants (et des parents d'un enfant sans compte invité) ;
--   - les disponibilités se lisent par la fonction calendrier(), qui masque
--     le motif d'une indisponibilité marquée privée.
--
-- Les montants (budget) sont calculés par l'app à partir de ces tables.
--
-- Pré-requis : migration socle_famille. APRÈS : ajouter "voyage" aux
-- schémas exposés (Project Settings > API > Exposed schemas).
-- =========================================================================

begin;

create schema if not exists voyage;
grant usage on schema voyage to authenticated;

-- -------------------------------------------------------------------------
-- 1. Tables
-- -------------------------------------------------------------------------

-- Calendrier commun : périodes où une personne est disponible ou non.
-- Une personne sans compte (enfant) est renseignée par un membre de son foyer.
create table voyage.disponibilites (
  id uuid primary key default gen_random_uuid(),
  personne_id uuid not null references famille.personnes (id) on delete cascade,
  date_debut date not null,
  date_fin date not null,
  etat text not null default 'indisponible'
    check (etat in ('disponible', 'peut_etre', 'indisponible')),
  motif text,
  -- Motif caché aux autres (ils voient seulement "indisponible").
  prive boolean not null default false,
  cree_par uuid not null default auth.uid() references auth.users (id) on delete cascade,
  cree_le timestamptz not null default now(),
  check (date_fin >= date_debut)
);
create index disponibilites_personne on voyage.disponibilites (personne_id, date_debut);

create table voyage.voyages (
  id uuid primary key default gen_random_uuid(),
  famille_id uuid not null references famille.familles (id) on delete cascade,
  titre text not null check (length(trim(titre)) > 0),
  description text,
  -- Vide tant que la destination n'est pas choisie ("on se retrouve, mais où ?").
  destination text,
  pays text,
  latitude double precision,
  longitude double precision,
  type_sejour text not null default 'vacances'
    check (type_sejour in ('weekend', 'court_sejour', 'vacances', 'etranger', 'autre')),
  periode text not null
    check (periode in ('printemps', 'ete', 'automne', 'toussaint', 'noel', 'hiver', 'autre')),
  annee smallint check (annee between 2000 and 2100),
  participation text not null default 'famille'
    check (participation in ('famille', 'amoureux', 'selection')),
  -- idee : dates en discussion ; organisation : dates fixées ;
  -- confirme : réservations faites ; termine ; annule.
  statut text not null default 'idee'
    check (statut in ('idee', 'organisation', 'confirme', 'termine', 'annule')),
  date_debut date,
  date_fin date,
  -- Estimation avant que les dates soient fixées ; recalculé ensuite.
  nb_nuits smallint check (nb_nuits is null or nb_nuits between 0 and 365),
  mode_transport text
    check (mode_transport in ('voiture', 'train', 'avion', 'bateau', 'bus', 'mixte')),
  -- Répartition des frais communs (hébergement, activités de groupe, divers).
  repartition text not null default 'par_personne'
    check (repartition in ('par_personne', 'par_adulte', 'par_foyer')),
  image text,
  cree_par uuid not null default auth.uid() references auth.users (id) on delete cascade,
  cree_le timestamptz not null default now(),
  maj_le timestamptz not null default now(),
  check (date_fin is null or date_debut is null or date_fin >= date_debut)
);
create index voyages_famille on voyage.voyages (famille_id, statut);

-- Invités. Une personne peut être sans compte (enfant) : un membre de son
-- foyer répond pour elle.
create table voyage.participants (
  voyage_id uuid not null references voyage.voyages (id) on delete cascade,
  personne_id uuid not null references famille.personnes (id) on delete cascade,
  role text not null default 'participant' check (role in ('organisateur', 'participant')),
  reponse text not null default 'invite'
    check (reponse in ('invite', 'partant', 'peut_etre', 'decline')),
  ajoute_par uuid default auth.uid() references auth.users (id) on delete set null,
  ajoute_le timestamptz not null default now(),
  primary key (voyage_id, personne_id)
);
create index participants_personne on voyage.participants (personne_id);

-- Sondage de dates.
create table voyage.propositions_dates (
  id uuid primary key default gen_random_uuid(),
  voyage_id uuid not null references voyage.voyages (id) on delete cascade,
  date_debut date not null,
  date_fin date not null,
  propose_par uuid not null default auth.uid() references auth.users (id) on delete cascade,
  cree_le timestamptz not null default now(),
  check (date_fin >= date_debut),
  unique (voyage_id, date_debut, date_fin)
);

create table voyage.votes_dates (
  proposition_id uuid not null references voyage.propositions_dates (id) on delete cascade,
  personne_id uuid not null references famille.personnes (id) on delete cascade,
  reponse text not null check (reponse in ('oui', 'si_besoin', 'non')),
  maj_le timestamptz not null default now(),
  primary key (proposition_id, personne_id)
);

-- Hébergements proposés.
create table voyage.hebergements (
  id uuid primary key default gen_random_uuid(),
  voyage_id uuid not null references voyage.voyages (id) on delete cascade,
  nom text not null check (length(trim(nom)) > 0),
  type text not null default 'autre' check (type in (
    'airbnb', 'gites_de_france', 'abritel', 'booking', 'hotel', 'camping',
    'location', 'chez_famille', 'autre'
  )),
  lien text,
  image text,
  adresse text,
  ville text,
  latitude double precision,
  longitude double precision,
  capacite smallint check (capacite is null or capacite > 0),
  nb_chambres smallint check (nb_chambres is null or nb_chambres >= 0),
  -- L'un ou l'autre : prix total du séjour, ou prix par nuit.
  prix_total numeric(10, 2) check (prix_total is null or prix_total >= 0),
  prix_nuit numeric(10, 2) check (prix_nuit is null or prix_nuit >= 0),
  -- Ménage, taxe de séjour, caution non comprise…
  frais_annexes numeric(10, 2) check (frais_annexes is null or frais_annexes >= 0),
  description text,
  statut text not null default 'propose' check (statut in ('propose', 'retenu', 'ecarte')),
  propose_par uuid not null default auth.uid() references auth.users (id) on delete cascade,
  cree_le timestamptz not null default now()
);
create index hebergements_voyage on voyage.hebergements (voyage_id);

create table voyage.avis_hebergements (
  hebergement_id uuid not null references voyage.hebergements (id) on delete cascade,
  utilisateur_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  avis text not null check (avis in ('coup_de_coeur', 'pourquoi_pas', 'bof', 'non')),
  commentaire text,
  maj_le timestamptz not null default now(),
  primary key (hebergement_id, utilisateur_id)
);

-- Trajets : en général un par foyer (sa voiture) ou par groupe de voyageurs.
create table voyage.trajets (
  id uuid primary key default gen_random_uuid(),
  voyage_id uuid not null references voyage.voyages (id) on delete cascade,
  mode text not null check (mode in ('voiture', 'train', 'avion', 'bateau', 'bus', 'autre')),
  libelle text,
  foyer_id uuid references famille.foyers (id) on delete set null,
  responsable uuid not null default auth.uid() references auth.users (id) on delete cascade,
  ville_depart text,
  depart_latitude double precision,
  depart_longitude double precision,
  ville_arrivee text,
  aller_retour boolean not null default true,
  -- Voiture (valeurs pour un aller simple).
  distance_km numeric(8, 1) check (distance_km is null or distance_km >= 0),
  duree_minutes integer check (duree_minutes is null or duree_minutes >= 0),
  energie text check (energie in ('gazole', 'sp95', 'sp98', 'e85', 'gpl', 'electrique')),
  -- L/100 km (kWh/100 km en électrique).
  consommation numeric(5, 2) check (consommation is null or consommation >= 0),
  -- €/L (€/kWh en électrique).
  prix_unitaire numeric(6, 3) check (prix_unitaire is null or prix_unitaire >= 0),
  peages numeric(8, 2) check (peages is null or peages >= 0),
  -- Train, avion, bateau, bus : prix total des billets (aller-retour compris
  -- si aller_retour), pour tous les passagers du trajet.
  prix_billets numeric(10, 2) check (prix_billets is null or prix_billets >= 0),
  lien text,
  note text,
  -- Coût total du trajet, aller-retour compris.
  cout_total numeric(10, 2) generated always as (
    case when mode = 'voiture' then
      round((coalesce(distance_km * consommation / 100 * prix_unitaire, 0) + coalesce(peages, 0))
            * case when aller_retour then 2 else 1 end, 2)
    else coalesce(prix_billets, 0) end
  ) stored,
  cree_le timestamptz not null default now()
);
create index trajets_voyage on voyage.trajets (voyage_id);

create table voyage.trajet_passagers (
  trajet_id uuid not null references voyage.trajets (id) on delete cascade,
  personne_id uuid not null references famille.personnes (id) on delete cascade,
  primary key (trajet_id, personne_id)
);

-- Activités, visites, restaurants, parcs…
create table voyage.activites (
  id uuid primary key default gen_random_uuid(),
  voyage_id uuid not null references voyage.voyages (id) on delete cascade,
  titre text not null check (length(trim(titre)) > 0),
  categorie text not null default 'visite' check (categorie in (
    'visite', 'chateau', 'musee', 'parc_attraction', 'parc_animalier', 'restaurant',
    'nature', 'plage', 'sport', 'spectacle', 'marche', 'autre'
  )),
  description text,
  lien text,
  image text,
  adresse text,
  latitude double precision,
  longitude double precision,
  jour date,
  -- Tarifs : par personne (enfant jusqu'à age_max_enfant inclus, gratuit
  -- avant age_gratuit), et/ou un forfait pour le groupe (repas, location…).
  prix_adulte numeric(8, 2) check (prix_adulte is null or prix_adulte >= 0),
  prix_enfant numeric(8, 2) check (prix_enfant is null or prix_enfant >= 0),
  age_max_enfant smallint check (age_max_enfant is null or age_max_enfant between 0 and 25),
  age_gratuit smallint check (age_gratuit is null or age_gratuit between 0 and 25),
  prix_forfait numeric(10, 2) check (prix_forfait is null or prix_forfait >= 0),
  statut text not null default 'propose' check (statut in ('propose', 'retenu', 'ecarte')),
  propose_par uuid not null default auth.uid() references auth.users (id) on delete cascade,
  cree_le timestamptz not null default now()
);
create index activites_voyage on voyage.activites (voyage_id);

-- Avis par personne. Pour le budget, "non" exclut la personne de l'activité ;
-- sans avis, elle est comptée.
create table voyage.avis_activites (
  activite_id uuid not null references voyage.activites (id) on delete cascade,
  personne_id uuid not null references famille.personnes (id) on delete cascade,
  avis text not null check (avis in ('partant', 'pourquoi_pas', 'non')),
  maj_le timestamptz not null default now(),
  primary key (activite_id, personne_id)
);

-- Postes de budget divers (courses, restaurants, assurance, location de
-- matériel…).
create table voyage.postes_budget (
  id uuid primary key default gen_random_uuid(),
  voyage_id uuid not null references voyage.voyages (id) on delete cascade,
  libelle text not null check (length(trim(libelle)) > 0),
  categorie text not null default 'autre'
    check (categorie in ('repas', 'courses', 'assurance', 'location', 'souvenirs', 'autre')),
  montant numeric(10, 2) not null check (montant >= 0),
  -- total : une fois ; par_personne ; par_personne_nuit ; par_nuit.
  base text not null default 'total'
    check (base in ('total', 'par_personne', 'par_personne_nuit', 'par_nuit')),
  cree_par uuid not null default auth.uid() references auth.users (id) on delete cascade,
  cree_le timestamptz not null default now()
);
create index postes_budget_voyage on voyage.postes_budget (voyage_id);

-- -------------------------------------------------------------------------
-- 2. Fonctions de contrôle (security definer : ne renvoient qu'un oui/non
--    ou des identifiants, sans être filtrées par les règles RLS).
-- -------------------------------------------------------------------------

-- Personnes pour lesquelles je peux agir : moi, et les personnes sans compte
-- de mon foyer ou que je gère.
create or replace function voyage.mes_personnes()
returns setof uuid
language sql stable security definer
set search_path = voyage, pg_temp
as $$
  select id from famille.personnes where utilisateur_id = auth.uid()
  union
  select id from famille.personnes
  where utilisateur_id is null
    and (gere_par = auth.uid() or foyer_id in (select famille.mes_foyers()));
$$;

-- Ma propre fiche personne.
create or replace function voyage.ma_personne()
returns uuid
language sql stable security definer
set search_path = voyage, pg_temp
as $$
  select id from famille.personnes where utilisateur_id = auth.uid();
$$;

-- Personnes que je peux inviter : celles des foyers de toutes mes familles.
create or replace function voyage.personnes_invitables()
returns setof uuid
language sql stable security definer
set search_path = voyage, pg_temp
as $$
  select id from famille.personnes
  where foyer_id in (select famille.foyers_de_mes_familles());
$$;

create or replace function voyage.est_participant(id_voyage uuid)
returns boolean
language sql stable security definer
set search_path = voyage, pg_temp
as $$
  select exists (
    select 1 from voyage.participants
    where voyage_id = id_voyage and personne_id in (select voyage.mes_personnes())
  );
$$;

create or replace function voyage.est_organisateur(id_voyage uuid)
returns boolean
language sql stable security definer
set search_path = voyage, pg_temp
as $$
  select exists (select 1 from voyage.voyages where id = id_voyage and cree_par = auth.uid())
      or exists (
        select 1 from voyage.participants
        where voyage_id = id_voyage and role = 'organisateur'
          and personne_id = voyage.ma_personne()
      );
$$;

create or replace function voyage.peut_voir(id_voyage uuid)
returns boolean
language sql stable security definer
set search_path = voyage, pg_temp
as $$
  select exists (
    select 1 from voyage.voyages v
    where v.id = id_voyage
      and (
        v.cree_par = auth.uid()
        or voyage.est_participant(v.id)
        or (v.participation = 'famille' and v.famille_id in (select famille.mes_familles()))
      )
  );
$$;

create or replace function voyage.voyage_de_proposition(id_proposition uuid)
returns uuid language sql stable security definer set search_path = voyage, pg_temp
as $$ select voyage_id from voyage.propositions_dates where id = id_proposition; $$;

create or replace function voyage.voyage_d_hebergement(id_hebergement uuid)
returns uuid language sql stable security definer set search_path = voyage, pg_temp
as $$ select voyage_id from voyage.hebergements where id = id_hebergement; $$;

create or replace function voyage.voyage_de_trajet(id_trajet uuid)
returns uuid language sql stable security definer set search_path = voyage, pg_temp
as $$ select voyage_id from voyage.trajets where id = id_trajet; $$;

create or replace function voyage.voyage_d_activite(id_activite uuid)
returns uuid language sql stable security definer set search_path = voyage, pg_temp
as $$ select voyage_id from voyage.activites where id = id_activite; $$;

-- La personne participe-t-elle à ce voyage ?
create or replace function voyage.personne_participe(id_voyage uuid, id_personne uuid)
returns boolean language sql stable security definer set search_path = voyage, pg_temp
as $$
  select exists (
    select 1 from voyage.participants where voyage_id = id_voyage and personne_id = id_personne
  );
$$;

-- -------------------------------------------------------------------------
-- 3. Déclencheurs
-- -------------------------------------------------------------------------

-- À la création d'un voyage : le créateur devient organisateur (et partant) ;
-- pour un voyage "famille", toutes les personnes des foyers de la famille
-- sont invitées.
create or replace function voyage.inviter_a_la_creation()
returns trigger
language plpgsql security definer
set search_path = voyage, pg_temp
as $$
declare
  moi uuid := (select id from famille.personnes where utilisateur_id = new.cree_par);
begin
  if moi is not null then
    insert into voyage.participants (voyage_id, personne_id, role, reponse, ajoute_par)
    values (new.id, moi, 'organisateur', 'partant', new.cree_par)
    on conflict do nothing;
  end if;

  if new.participation = 'famille' then
    insert into voyage.participants (voyage_id, personne_id, ajoute_par)
    select new.id, p.id, new.cree_par
    from famille.personnes p
    where p.foyer_id in (
      select ff.foyer_id from famille.famille_foyers ff where ff.famille_id = new.famille_id
    )
    on conflict do nothing;
  end if;
  return new;
end;
$$;

create trigger inviter_a_la_creation
after insert on voyage.voyages
for each row execute function voyage.inviter_a_la_creation();

-- Voyage : créateur et famille figés, nombre de nuits recalculé quand les
-- dates sont fixées.
create or replace function voyage.regler_voyage()
returns trigger
language plpgsql
set search_path = voyage, pg_temp
as $$
begin
  if tg_op = 'UPDATE' then
    new.cree_par := old.cree_par;
    new.famille_id := old.famille_id;
    new.cree_le := old.cree_le;
  end if;
  if new.date_debut is not null and new.date_fin is not null then
    new.nb_nuits := new.date_fin - new.date_debut;
  end if;
  new.maj_le := now();
  return new;
end;
$$;

create trigger regler_voyage
before insert or update on voyage.voyages
for each row execute function voyage.regler_voyage();

-- Participants : un invité qui n'organise pas ne peut changer que sa
-- réponse (pas son rôle).
create or replace function voyage.regler_participant()
returns trigger
language plpgsql security definer
set search_path = voyage, pg_temp
as $$
begin
  new.voyage_id := old.voyage_id;
  new.personne_id := old.personne_id;
  new.ajoute_par := old.ajoute_par;
  new.ajoute_le := old.ajoute_le;
  if not voyage.est_organisateur(old.voyage_id) then
    new.role := old.role;
  end if;
  return new;
end;
$$;

create trigger regler_participant
before update on voyage.participants
for each row execute function voyage.regler_participant();

-- Rattachements figés à la modification (on ne déplace pas une ligne d'un
-- voyage à un autre).
create or replace function voyage.figer_voyage_id()
returns trigger
language plpgsql
set search_path = voyage, pg_temp
as $$
begin
  new.voyage_id := old.voyage_id;
  return new;
end;
$$;

create trigger figer_voyage_id before update on voyage.propositions_dates
for each row execute function voyage.figer_voyage_id();
create trigger figer_voyage_id before update on voyage.hebergements
for each row execute function voyage.figer_voyage_id();
create trigger figer_voyage_id before update on voyage.trajets
for each row execute function voyage.figer_voyage_id();
create trigger figer_voyage_id before update on voyage.activites
for each row execute function voyage.figer_voyage_id();
create trigger figer_voyage_id before update on voyage.postes_budget
for each row execute function voyage.figer_voyage_id();

-- -------------------------------------------------------------------------
-- 4. Règles RLS
-- -------------------------------------------------------------------------

alter table voyage.disponibilites enable row level security;
alter table voyage.voyages enable row level security;
alter table voyage.participants enable row level security;
alter table voyage.propositions_dates enable row level security;
alter table voyage.votes_dates enable row level security;
alter table voyage.hebergements enable row level security;
alter table voyage.avis_hebergements enable row level security;
alter table voyage.trajets enable row level security;
alter table voyage.trajet_passagers enable row level security;
alter table voyage.activites enable row level security;
alter table voyage.avis_activites enable row level security;
alter table voyage.postes_budget enable row level security;

-- Disponibilités : lecture directe de ses propres lignes seulement ; les
-- autres passent par voyage.calendrier() (motif masqué si privé).
create policy "Mes disponibilités" on voyage.disponibilites
  for select using (personne_id in (select voyage.mes_personnes()));
create policy "Ajouter mes disponibilités" on voyage.disponibilites
  for insert with check (personne_id in (select voyage.mes_personnes()) and cree_par = auth.uid());
create policy "Modifier mes disponibilités" on voyage.disponibilites
  for update using (personne_id in (select voyage.mes_personnes()))
  with check (personne_id in (select voyage.mes_personnes()));
create policy "Supprimer mes disponibilités" on voyage.disponibilites
  for delete using (personne_id in (select voyage.mes_personnes()));

-- Voyages.
-- La condition directe sur cree_par permet de relire le voyage qu'on vient
-- de créer (peut_voir() ne voit pas encore la ligne en cours d'insertion :
-- même piège que wishlist_listes_creees).
create policy "Voir les voyages" on voyage.voyages
  for select using (cree_par = auth.uid() or voyage.peut_voir(id));
create policy "Créer un voyage dans ses familles" on voyage.voyages
  for insert with check (famille_id in (select famille.mes_familles()) and cree_par = auth.uid());
create policy "Modifier un voyage qu'on organise" on voyage.voyages
  for update using (voyage.est_organisateur(id)) with check (voyage.est_organisateur(id));
create policy "Supprimer son voyage" on voyage.voyages
  for delete using (cree_par = auth.uid());

-- Participants.
create policy "Voir les participants" on voyage.participants
  for select using (voyage.peut_voir(voyage_id));
-- L'organisateur invite des personnes de ses familles ; pour un voyage
-- "famille", chacun peut aussi s'ajouter (ou ajouter son enfant).
create policy "Inviter ou rejoindre" on voyage.participants
  for insert with check (
    (voyage.est_organisateur(voyage_id) and personne_id in (select voyage.personnes_invitables()))
    or (
      personne_id in (select voyage.mes_personnes())
      and role = 'participant'
      and exists (
        select 1 from voyage.voyages v
        where v.id = voyage_id and v.participation = 'famille'
          and v.famille_id in (select famille.mes_familles())
      )
    )
  );
create policy "Répondre ou gérer les invités" on voyage.participants
  for update using (
    voyage.est_organisateur(voyage_id) or personne_id in (select voyage.mes_personnes())
  )
  with check (
    voyage.est_organisateur(voyage_id) or personne_id in (select voyage.mes_personnes())
  );
create policy "Retirer un invité ou se retirer" on voyage.participants
  for delete using (
    voyage.est_organisateur(voyage_id) or personne_id in (select voyage.mes_personnes())
  );

-- Sondage de dates : tout participant propose des dates et vote.
create policy "Voir les dates proposées" on voyage.propositions_dates
  for select using (propose_par = auth.uid() or voyage.peut_voir(voyage_id));
create policy "Proposer des dates" on voyage.propositions_dates
  for insert with check (
    propose_par = auth.uid()
    and (voyage.est_participant(voyage_id) or voyage.est_organisateur(voyage_id))
  );
create policy "Modifier ses dates" on voyage.propositions_dates
  for update using (propose_par = auth.uid()) with check (propose_par = auth.uid());
create policy "Retirer des dates" on voyage.propositions_dates
  for delete using (propose_par = auth.uid() or voyage.est_organisateur(voyage_id));

create policy "Voir les votes" on voyage.votes_dates
  for select using (voyage.peut_voir(voyage.voyage_de_proposition(proposition_id)));
create policy "Voter" on voyage.votes_dates
  for insert with check (
    personne_id in (select voyage.mes_personnes())
    and voyage.personne_participe(voyage.voyage_de_proposition(proposition_id), personne_id)
  );
create policy "Changer son vote" on voyage.votes_dates
  for update using (personne_id in (select voyage.mes_personnes()))
  with check (personne_id in (select voyage.mes_personnes()));
create policy "Retirer son vote" on voyage.votes_dates
  for delete using (personne_id in (select voyage.mes_personnes()));

-- Hébergements : proposés par les organisateurs, commentés par tous.
create policy "Voir les hébergements" on voyage.hebergements
  for select using (propose_par = auth.uid() or voyage.peut_voir(voyage_id));
create policy "Proposer un hébergement" on voyage.hebergements
  for insert with check (propose_par = auth.uid() and voyage.est_organisateur(voyage_id));
create policy "Modifier un hébergement" on voyage.hebergements
  for update using (voyage.est_organisateur(voyage_id)) with check (voyage.est_organisateur(voyage_id));
create policy "Supprimer un hébergement" on voyage.hebergements
  for delete using (voyage.est_organisateur(voyage_id));

create policy "Voir les avis d'hébergement" on voyage.avis_hebergements
  for select using (voyage.peut_voir(voyage.voyage_d_hebergement(hebergement_id)));
create policy "Donner son avis sur un hébergement" on voyage.avis_hebergements
  for insert with check (
    utilisateur_id = auth.uid() and voyage.peut_voir(voyage.voyage_d_hebergement(hebergement_id))
  );
create policy "Changer son avis sur un hébergement" on voyage.avis_hebergements
  for update using (utilisateur_id = auth.uid()) with check (utilisateur_id = auth.uid());
create policy "Retirer son avis sur un hébergement" on voyage.avis_hebergements
  for delete using (utilisateur_id = auth.uid());

-- Trajets : chaque participant déclare le sien ; le responsable ou un
-- organisateur le modifie.
create policy "Voir les trajets" on voyage.trajets
  for select using (responsable = auth.uid() or voyage.peut_voir(voyage_id));
create policy "Ajouter un trajet" on voyage.trajets
  for insert with check (
    responsable = auth.uid()
    and (voyage.est_participant(voyage_id) or voyage.est_organisateur(voyage_id))
  );
create policy "Modifier un trajet" on voyage.trajets
  for update using (responsable = auth.uid() or voyage.est_organisateur(voyage_id))
  with check (responsable = auth.uid() or voyage.est_organisateur(voyage_id));
create policy "Supprimer un trajet" on voyage.trajets
  for delete using (responsable = auth.uid() or voyage.est_organisateur(voyage_id));

create policy "Voir les passagers" on voyage.trajet_passagers
  for select using (voyage.peut_voir(voyage.voyage_de_trajet(trajet_id)));
create policy "Ajouter un passager" on voyage.trajet_passagers
  for insert with check (
    voyage.personne_participe(voyage.voyage_de_trajet(trajet_id), personne_id)
    and (
      personne_id in (select voyage.mes_personnes())
      or exists (select 1 from voyage.trajets t where t.id = trajet_id and t.responsable = auth.uid())
      or voyage.est_organisateur(voyage.voyage_de_trajet(trajet_id))
    )
  );
create policy "Retirer un passager" on voyage.trajet_passagers
  for delete using (
    personne_id in (select voyage.mes_personnes())
    or exists (select 1 from voyage.trajets t where t.id = trajet_id and t.responsable = auth.uid())
    or voyage.est_organisateur(voyage.voyage_de_trajet(trajet_id))
  );

-- Activités : tout participant propose ; l'auteur ou un organisateur modifie.
create policy "Voir les activités" on voyage.activites
  for select using (propose_par = auth.uid() or voyage.peut_voir(voyage_id));
create policy "Proposer une activité" on voyage.activites
  for insert with check (
    propose_par = auth.uid()
    and (voyage.est_participant(voyage_id) or voyage.est_organisateur(voyage_id))
  );
create policy "Modifier une activité" on voyage.activites
  for update using (propose_par = auth.uid() or voyage.est_organisateur(voyage_id))
  with check (propose_par = auth.uid() or voyage.est_organisateur(voyage_id));
create policy "Supprimer une activité" on voyage.activites
  for delete using (propose_par = auth.uid() or voyage.est_organisateur(voyage_id));

create policy "Voir les avis d'activité" on voyage.avis_activites
  for select using (voyage.peut_voir(voyage.voyage_d_activite(activite_id)));
create policy "Donner son avis sur une activité" on voyage.avis_activites
  for insert with check (
    personne_id in (select voyage.mes_personnes())
    and voyage.personne_participe(voyage.voyage_d_activite(activite_id), personne_id)
  );
create policy "Changer son avis sur une activité" on voyage.avis_activites
  for update using (personne_id in (select voyage.mes_personnes()))
  with check (personne_id in (select voyage.mes_personnes()));
create policy "Retirer son avis sur une activité" on voyage.avis_activites
  for delete using (personne_id in (select voyage.mes_personnes()));

-- Postes de budget divers : les organisateurs.
create policy "Voir le budget" on voyage.postes_budget
  for select using (cree_par = auth.uid() or voyage.peut_voir(voyage_id));
create policy "Ajouter un poste de budget" on voyage.postes_budget
  for insert with check (cree_par = auth.uid() and voyage.est_organisateur(voyage_id));
create policy "Modifier un poste de budget" on voyage.postes_budget
  for update using (voyage.est_organisateur(voyage_id)) with check (voyage.est_organisateur(voyage_id));
create policy "Supprimer un poste de budget" on voyage.postes_budget
  for delete using (voyage.est_organisateur(voyage_id));

grant select, insert, update, delete on all tables in schema voyage to authenticated;

-- -------------------------------------------------------------------------
-- 5. Fonctions appelées par l'app
-- -------------------------------------------------------------------------

-- Calendrier commun d'une famille (famille active par défaut) sur une
-- période : disponibilités de toutes les personnes de ses foyers. Le motif
-- d'une ligne privée n'est renvoyé qu'à la personne concernée.
create or replace function voyage.calendrier(debut date, fin date, id_famille uuid default null)
returns table (
  id uuid, personne_id uuid, prenom text, foyer_id uuid,
  date_debut date, date_fin date, etat text, motif text, prive boolean, modifiable boolean
)
language plpgsql stable security definer
set search_path = voyage, pg_temp
as $$
declare
  fam uuid := coalesce(id_famille, famille.ma_famille());
begin
  if auth.uid() is null or fam is null or fam not in (select famille.mes_familles()) then
    raise exception 'Famille introuvable';
  end if;

  return query
  select d.id, d.personne_id, p.prenom, p.foyer_id, d.date_debut, d.date_fin, d.etat,
         case when d.prive and d.personne_id not in (select voyage.mes_personnes())
              then null else d.motif end,
         d.prive,
         d.personne_id in (select voyage.mes_personnes())
  from voyage.disponibilites d
  join famille.personnes p on p.id = d.personne_id
  where p.foyer_id in (
          select ff.foyer_id from famille.famille_foyers ff where ff.famille_id = fam
          union select famille.mes_foyers()
        )
    and d.date_fin >= debut and d.date_debut <= fin
  order by d.date_debut, p.prenom;
end;
$$;

-- Disponibilités des participants d'un voyage (pour suggérer des dates).
create or replace function voyage.disponibilites_participants(id_voyage uuid, debut date, fin date)
returns table (
  personne_id uuid, prenom text, date_debut date, date_fin date, etat text, motif text
)
language plpgsql stable security definer
set search_path = voyage, pg_temp
as $$
begin
  if auth.uid() is null or not voyage.peut_voir(id_voyage) then
    raise exception 'Voyage introuvable';
  end if;

  return query
  select d.personne_id, p.prenom, d.date_debut, d.date_fin, d.etat,
         case when d.prive and d.personne_id not in (select voyage.mes_personnes())
              then null else d.motif end
  from voyage.participants pa
  join voyage.disponibilites d on d.personne_id = pa.personne_id
  join famille.personnes p on p.id = pa.personne_id
  where pa.voyage_id = id_voyage and pa.reponse <> 'decline'
    and d.date_fin >= debut and d.date_debut <= fin
  order by d.date_debut, p.prenom;
end;
$$;

-- Retenir une proposition de dates : fixe les dates du voyage et le fait
-- passer en organisation. Réservé aux organisateurs.
create or replace function voyage.valider_dates(id_proposition uuid)
returns void
language plpgsql security definer
set search_path = voyage, pg_temp
as $$
declare
  pr voyage.propositions_dates;
begin
  select * into pr from voyage.propositions_dates where id = id_proposition;
  if pr.id is null or not voyage.est_organisateur(pr.voyage_id) then
    raise exception 'Seul un organisateur peut fixer les dates';
  end if;

  update voyage.voyages
  set date_debut = pr.date_debut,
      date_fin = pr.date_fin,
      statut = case when statut = 'idee' then 'organisation' else statut end
  where id = pr.voyage_id;
end;
$$;

-- Retenir un hébergement (les autres propositions restent visibles mais
-- passent en "écarté", sauf si garder_autres = true, pour un itinéraire à
-- plusieurs étapes).
create or replace function voyage.retenir_hebergement(id_hebergement uuid, garder_autres boolean default false)
returns void
language plpgsql security definer
set search_path = voyage, pg_temp
as $$
declare
  v uuid := voyage.voyage_d_hebergement(id_hebergement);
begin
  if v is null or not voyage.est_organisateur(v) then
    raise exception 'Seul un organisateur peut retenir un hébergement';
  end if;
  update voyage.hebergements set statut = 'retenu' where id = id_hebergement;
  if not garder_autres then
    update voyage.hebergements set statut = 'ecarte'
    where voyage_id = v and id <> id_hebergement and statut <> 'ecarte';
  end if;
end;
$$;

grant execute on function
  voyage.mes_personnes(), voyage.ma_personne(), voyage.personnes_invitables(),
  voyage.est_participant(uuid), voyage.est_organisateur(uuid), voyage.peut_voir(uuid),
  voyage.calendrier(date, date, uuid), voyage.disponibilites_participants(uuid, date, date),
  voyage.valider_dates(uuid), voyage.retenir_hebergement(uuid, boolean)
to authenticated;
revoke execute on function
  voyage.voyage_de_proposition(uuid), voyage.voyage_d_hebergement(uuid),
  voyage.voyage_de_trajet(uuid), voyage.voyage_d_activite(uuid),
  voyage.personne_participe(uuid, uuid)
from public;
grant execute on function
  voyage.voyage_de_proposition(uuid), voyage.voyage_d_hebergement(uuid),
  voyage.voyage_de_trajet(uuid), voyage.voyage_d_activite(uuid),
  voyage.personne_participe(uuid, uuid)
to authenticated;

notify pgrst, 'reload schema';

commit;
