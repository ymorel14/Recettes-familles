-- =========================================================================
-- Migration — VoyageCommun : repas de famille
--
-- Un "voyage" peut désormais être un repas de famille (nature = 'repas') :
-- mêmes invités, même sondage de dates, mêmes notifications, plus :
--   - le lieu : chez un foyer de la famille (foyer_hote) ou ailleurs
--     (champ destination) ;
--   - un ou plusieurs repas (réveillon du 24 au soir, déjeuner du 25…) ;
--   - pour chaque repas, les plats par étape (apéritif → boissons), qui
--     peuvent renvoyer à une recette de l'app Cuisine ;
--   - qui s'occupe de quoi : par étape (Claire fait les desserts) et par
--     plat (Marc apporte la bûche) ;
--   - le lien vers une ou plusieurs listes de cadeaux (événements de
--     CadeauCommun).
--
-- Droits (RLS) : tout ce qui suit est visible de ceux qui voient le repas.
-- Les organisateurs gèrent les repas, les liens vers les listes et confient
-- les étapes ; tout participant propose un plat (et modifie le sien) et peut
-- se porter volontaire (« je m'en occupe ») pour lui ou ses enfants.
--
-- Pré-requis : migrations voyage précédentes, schémas recettes et wishlist.
-- =========================================================================

begin;

-- -------------------------------------------------------------------------
-- 1. Nature de l'événement et lieu
-- -------------------------------------------------------------------------

alter table voyage.voyages
  add column nature text not null default 'voyage' check (nature in ('voyage', 'repas')),
  add column foyer_hote uuid references famille.foyers (id) on delete set null;

comment on column voyage.voyages.foyer_hote is
  'Repas : foyer qui reçoit (sinon le lieu est dans destination).';

-- -------------------------------------------------------------------------
-- 2. Repas, plats, responsables
-- -------------------------------------------------------------------------

create table voyage.repas (
  id uuid primary key default gen_random_uuid(),
  voyage_id uuid not null references voyage.voyages (id) on delete cascade,
  titre text not null check (length(trim(titre)) > 0),
  jour date,
  moment text not null default 'dejeuner'
    check (moment in ('petit_dejeuner', 'brunch', 'dejeuner', 'gouter', 'apero', 'diner')),
  notes text,
  cree_par uuid not null default auth.uid() references auth.users (id) on delete cascade,
  cree_le timestamptz not null default now()
);
create index repas_voyage on voyage.repas (voyage_id, jour);

create table voyage.plats (
  id uuid primary key default gen_random_uuid(),
  repas_id uuid not null references voyage.repas (id) on delete cascade,
  etape text not null
    check (etape in ('aperitif', 'entree', 'plat', 'accompagnement', 'fromage', 'dessert', 'boissons')),
  titre text not null check (length(trim(titre)) > 0),
  -- Recette de l'app Cuisine (facultatif).
  recette_id uuid references recettes.recettes (id) on delete set null,
  quantite text,
  notes text,
  propose_par uuid not null default auth.uid() references auth.users (id) on delete cascade,
  cree_le timestamptz not null default now()
);
create index plats_repas on voyage.plats (repas_id, etape);

-- Qui s'occupe d'une étape d'un repas (ex. les desserts).
create table voyage.repas_responsables (
  repas_id uuid not null references voyage.repas (id) on delete cascade,
  etape text not null
    check (etape in ('aperitif', 'entree', 'plat', 'accompagnement', 'fromage', 'dessert', 'boissons')),
  personne_id uuid not null references famille.personnes (id) on delete cascade,
  ajoute_par uuid default auth.uid() references auth.users (id) on delete set null,
  primary key (repas_id, etape, personne_id)
);

-- Qui prépare ou apporte un plat.
create table voyage.plat_responsables (
  plat_id uuid not null references voyage.plats (id) on delete cascade,
  personne_id uuid not null references famille.personnes (id) on delete cascade,
  ajoute_par uuid default auth.uid() references auth.users (id) on delete set null,
  primary key (plat_id, personne_id)
);

-- Listes de cadeaux (événements CadeauCommun) liées à l'événement.
create table voyage.listes_cadeaux (
  voyage_id uuid not null references voyage.voyages (id) on delete cascade,
  evenement_id uuid not null references wishlist.evenements (id) on delete cascade,
  ajoute_par uuid default auth.uid() references auth.users (id) on delete set null,
  primary key (voyage_id, evenement_id)
);

-- -------------------------------------------------------------------------
-- 3. Fonctions de contrôle
-- -------------------------------------------------------------------------

create or replace function voyage.voyage_du_repas(id_repas uuid)
returns uuid language sql stable security definer set search_path = voyage, pg_temp
as $$ select voyage_id from voyage.repas where id = id_repas; $$;

create or replace function voyage.repas_du_plat(id_plat uuid)
returns uuid language sql stable security definer set search_path = voyage, pg_temp
as $$ select repas_id from voyage.plats where id = id_plat; $$;

create or replace function voyage.auteur_du_plat(id_plat uuid)
returns uuid language sql stable security definer set search_path = voyage, pg_temp
as $$ select propose_par from voyage.plats where id = id_plat; $$;

-- La personne participe au voyage de ce repas ?
create or replace function voyage.participe_au_repas(id_repas uuid, id_personne uuid)
returns boolean language sql stable security definer set search_path = voyage, pg_temp
as $$ select voyage.personne_participe(voyage.voyage_du_repas(id_repas), id_personne); $$;

-- -------------------------------------------------------------------------
-- 4. Règles RLS
-- -------------------------------------------------------------------------

alter table voyage.repas enable row level security;
alter table voyage.plats enable row level security;
alter table voyage.repas_responsables enable row level security;
alter table voyage.plat_responsables enable row level security;
alter table voyage.listes_cadeaux enable row level security;

-- Repas : organisateurs.
create policy "Voir les repas" on voyage.repas
  for select using (cree_par = auth.uid() or voyage.peut_voir(voyage_id));
create policy "Ajouter un repas" on voyage.repas
  for insert with check (cree_par = auth.uid() and voyage.est_organisateur(voyage_id));
create policy "Modifier un repas" on voyage.repas
  for update using (voyage.est_organisateur(voyage_id)) with check (voyage.est_organisateur(voyage_id));
create policy "Supprimer un repas" on voyage.repas
  for delete using (voyage.est_organisateur(voyage_id));

-- Plats : tout participant propose ; l'auteur ou un organisateur modifie.
create policy "Voir les plats" on voyage.plats
  for select using (propose_par = auth.uid() or voyage.peut_voir(voyage.voyage_du_repas(repas_id)));
create policy "Proposer un plat" on voyage.plats
  for insert with check (
    propose_par = auth.uid()
    and (voyage.est_participant(voyage.voyage_du_repas(repas_id)) or voyage.est_organisateur(voyage.voyage_du_repas(repas_id)))
  );
create policy "Modifier un plat" on voyage.plats
  for update using (propose_par = auth.uid() or voyage.est_organisateur(voyage.voyage_du_repas(repas_id)))
  with check (propose_par = auth.uid() or voyage.est_organisateur(voyage.voyage_du_repas(repas_id)));
create policy "Supprimer un plat" on voyage.plats
  for delete using (propose_par = auth.uid() or voyage.est_organisateur(voyage.voyage_du_repas(repas_id)));

-- Responsables d'une étape : un organisateur confie ; chacun peut se porter
-- volontaire ou se retirer (pour lui ou ses enfants sans compte).
create policy "Voir qui s'occupe des étapes" on voyage.repas_responsables
  for select using (voyage.peut_voir(voyage.voyage_du_repas(repas_id)));
create policy "Confier une étape" on voyage.repas_responsables
  for insert with check (
    voyage.participe_au_repas(repas_id, personne_id)
    and (voyage.est_organisateur(voyage.voyage_du_repas(repas_id)) or personne_id in (select voyage.mes_personnes()))
  );
create policy "Retirer d'une étape" on voyage.repas_responsables
  for delete using (
    voyage.est_organisateur(voyage.voyage_du_repas(repas_id)) or personne_id in (select voyage.mes_personnes())
  );

-- Responsables d'un plat : idem, plus l'auteur du plat.
create policy "Voir qui s'occupe des plats" on voyage.plat_responsables
  for select using (voyage.peut_voir(voyage.voyage_du_repas(voyage.repas_du_plat(plat_id))));
create policy "Confier un plat" on voyage.plat_responsables
  for insert with check (
    voyage.participe_au_repas(voyage.repas_du_plat(plat_id), personne_id)
    and (
      voyage.est_organisateur(voyage.voyage_du_repas(voyage.repas_du_plat(plat_id)))
      or voyage.auteur_du_plat(plat_id) = auth.uid()
      or personne_id in (select voyage.mes_personnes())
    )
  );
create policy "Retirer d'un plat" on voyage.plat_responsables
  for delete using (
    voyage.est_organisateur(voyage.voyage_du_repas(voyage.repas_du_plat(plat_id)))
    or voyage.auteur_du_plat(plat_id) = auth.uid()
    or personne_id in (select voyage.mes_personnes())
  );

-- Listes de cadeaux liées : organisateurs, et seulement des événements de
-- leurs familles.
create policy "Voir les listes liées" on voyage.listes_cadeaux
  for select using (voyage.peut_voir(voyage_id));
create policy "Lier une liste" on voyage.listes_cadeaux
  for insert with check (
    voyage.est_organisateur(voyage_id)
    and evenement_id in (select id from wishlist.evenements where famille_id in (select famille.mes_familles()))
  );
create policy "Délier une liste" on voyage.listes_cadeaux
  for delete using (voyage.est_organisateur(voyage_id));

grant select, insert, update, delete on voyage.repas, voyage.plats to authenticated;
grant select, insert, delete on voyage.repas_responsables, voyage.plat_responsables, voyage.listes_cadeaux to authenticated;
grant execute on function voyage.voyage_du_repas(uuid), voyage.repas_du_plat(uuid), voyage.auteur_du_plat(uuid),
  voyage.participe_au_repas(uuid, uuid) to authenticated;

-- Un plat garde son auteur et son repas.
create or replace function voyage.regler_plat()
returns trigger
language plpgsql
set search_path = voyage, pg_temp
as $$
begin
  new.propose_par := old.propose_par;
  new.repas_id := old.repas_id;
  new.cree_le := old.cree_le;
  return new;
end;
$$;

create trigger regler_plat before update on voyage.plats
for each row execute function voyage.regler_plat();
create trigger figer_voyage_id before update on voyage.repas
for each row execute function voyage.figer_voyage_id();

-- -------------------------------------------------------------------------
-- 5. Notifications
-- -------------------------------------------------------------------------

alter table voyage.notifications drop constraint notifications_type_check;
alter table voyage.notifications add constraint notifications_type_check check (type in (
  'invitation', 'dates_proposees', 'dates_retenues',
  'hebergement_propose', 'hebergement_retenu', 'activite_proposee', 'activite_retenue',
  'plat_propose', 'tache_confiee'
));

create or replace function voyage.libelle_etape(etape text)
returns text language sql immutable
as $$
  select case etape
    when 'aperitif' then 'l’apéritif' when 'entree' then 'l’entrée' when 'plat' then 'le plat'
    when 'accompagnement' then 'l’accompagnement' when 'fromage' then 'le fromage'
    when 'dessert' then 'le dessert' when 'boissons' then 'les boissons' else etape end;
$$;

create or replace function voyage.notif_plat()
returns trigger
language plpgsql security definer
set search_path = voyage, pg_temp
as $$
declare
  r voyage.repas;
begin
  select * into r from voyage.repas where id = new.repas_id;
  perform voyage.notifier(
    r.voyage_id, 'plat_propose',
    voyage.prenom_auteur() || ' propose « ' || new.titre || ' » pour ' || r.titre
      || ' (« ' || voyage.titre_voyage(r.voyage_id) || ' »)',
    'Menu');
  return new;
end;
$$;

create trigger notif_plat after insert on voyage.plats
for each row execute function voyage.notif_plat();

-- « On vous confie… » : à la personne désignée par quelqu'un d'autre.
create or replace function voyage.notif_tache()
returns trigger
language plpgsql security definer
set search_path = voyage, pg_temp
as $$
declare
  destinataire uuid := (select utilisateur_id from famille.personnes where id = new.personne_id);
  r voyage.repas;
  quoi text;
begin
  if destinataire is null or destinataire = auth.uid() then
    return new;
  end if;
  if tg_table_name = 'repas_responsables' then
    select * into r from voyage.repas where id = new.repas_id;
    quoi := voyage.libelle_etape(new.etape);
  else
    select rp.* into r from voyage.repas rp join voyage.plats p on p.repas_id = rp.id where p.id = new.plat_id;
    quoi := '« ' || (select titre from voyage.plats where id = new.plat_id) || ' »';
  end if;
  insert into voyage.notifications (utilisateur_id, voyage_id, type, message, ecran, auteur)
  values (
    destinataire, r.voyage_id, 'tache_confiee',
    voyage.prenom_auteur() || ' vous confie ' || quoi || ' pour ' || r.titre || ' (« ' || voyage.titre_voyage(r.voyage_id) || ' »)',
    'Menu', auth.uid()
  );
  return new;
end;
$$;

create trigger notif_tache_etape after insert on voyage.repas_responsables
for each row execute function voyage.notif_tache();
create trigger notif_tache_plat after insert on voyage.plat_responsables
for each row execute function voyage.notif_tache();

-- Dates d'un seul jour (repas) : « le 25/12/2027 » plutôt que « du 25/12 au 25/12/2027 ».
create or replace function voyage.texte_plage(debut date, fin date)
returns text
language sql immutable
as $$
  select case when debut = fin then 'le ' || to_char(debut, 'DD/MM/YYYY')
              else 'du ' || to_char(debut, 'DD/MM') || ' au ' || to_char(fin, 'DD/MM/YYYY') end
$$;

create or replace function voyage.notif_dates()
returns trigger
language plpgsql security definer
set search_path = voyage, pg_temp
as $$
begin
  if tg_table_name = 'propositions_dates' then
    perform voyage.notifier(
      new.voyage_id, 'dates_proposees',
      voyage.prenom_auteur() || ' propose des dates pour « ' || voyage.titre_voyage(new.voyage_id) || ' » : '
        || voyage.texte_plage(new.date_debut, new.date_fin),
      'Dates');
  elsif new.date_debut is not null and new.date_fin is not null
        and (old.date_debut is distinct from new.date_debut or old.date_fin is distinct from new.date_fin) then
    perform voyage.notifier(
      new.id, 'dates_retenues',
      'Dates retenues pour « ' || new.titre || ' » : ' || voyage.texte_plage(new.date_debut, new.date_fin),
      'Dates');
  end if;
  return new;
end;
$$;

notify pgrst, 'reload schema';

commit;
