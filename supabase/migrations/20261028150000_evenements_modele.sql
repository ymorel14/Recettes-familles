-- =========================================================================
-- Migration — Événements (ex-Voyages) : modèle de données (refonte § 10.1)
--
--   - repas : occasion, personne fêtée, heure ;
--   - dates_validees_le + règle « une date : fixée ; plusieurs : on vote » ;
--   - plus de moyens de transport (moto, vélo…) ;
--   - options de trajet : moyen, lien, prix, VOTE (pour / pourquoi pas / contre) ;
--   - activités : inscription (présence) et date limite de vote ;
--   - plat « proposé par la famille » (étape 'autre') ;
--   - l'assistant peut aussi proposer un trajet ;
--   - nouveaux types de notification (relance, dates rouvertes).
--
-- AJOUT SEULEMENT : aucune colonne ni table existante n'est supprimée ; les
-- contraintes `check` sont élargies (jamais restreintes).
--
-- Pré-requis : migrations voyage (20260929100000 à 20261021110000).
-- =========================================================================

begin;

-- Retire les contraintes `check` d'une table qui mentionnent une colonne
-- (leur nom par défaut n'est pas garanti d'un environnement à l'autre).
create or replace function pg_temp.retirer_checks(tbl regclass, col text)
returns void language plpgsql as $$
declare
  c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = tbl and contype = 'c' and pg_get_constraintdef(oid) ~ ('\m' || col || '\M')
  loop
    execute format('alter table %s drop constraint %I', tbl, c.conname);
  end loop;
end $$;

-- -------------------------------------------------------------------------
-- 1. Repas : occasion, personne fêtée, heure ; dates décidées
-- -------------------------------------------------------------------------

alter table voyage.voyages
  add column if not exists occasion text
    check (occasion is null or occasion in ('repas', 'noel', 'nouvel_an', 'paques', 'anniversaire', 'autre')),
  add column if not exists fete_personne_id uuid references famille.personnes (id) on delete set null,
  add column if not exists heure_debut time,
  add column if not exists dates_validees_le timestamptz;

comment on column voyage.voyages.dates_validees_le is
  'Rempli quand les dates sont décidées (une seule proposition, ou validation après vote).';
comment on column voyage.voyages.fete_personne_id is
  'Repas d''anniversaire : la personne fêtée (sa liste d''envies est liée au repas).';

-- Les événements qui ont déjà des dates : elles sont décidées.
update voyage.voyages set dates_validees_le = coalesce(maj_le, now())
where dates_validees_le is null and date_debut is not null and date_fin is not null;

-- -------------------------------------------------------------------------
-- 2. Plus de moyens de transport
-- -------------------------------------------------------------------------

select pg_temp.retirer_checks('voyage.voyages'::regclass, 'mode_transport');
alter table voyage.voyages add constraint voyages_mode_transport_check
  check (mode_transport is null or mode_transport in ('voiture', 'moto', 'train', 'avion', 'bateau', 'bus', 'velo', 'mixte', 'autre'));

select pg_temp.retirer_checks('voyage.trajets'::regclass, 'mode');
alter table voyage.trajets add constraint trajets_mode_check
  check (mode in ('voiture', 'moto', 'train', 'avion', 'bateau', 'bus', 'velo', 'autre'));

-- -------------------------------------------------------------------------
-- 3. Options de trajet : texte libre ou lien, moyen, prix, vote
-- -------------------------------------------------------------------------

alter table voyage.options_trajet
  add column if not exists mode text
    check (mode is null or mode in ('voiture', 'moto', 'train', 'avion', 'bateau', 'bus', 'velo', 'autre')),
  add column if not exists lien text,
  add column if not exists prix numeric(10, 2) check (prix is null or prix >= 0);

-- Voter pour une option (jusqu'ici : un commentaire seulement).
alter table voyage.avis_options_trajet
  add column if not exists vote text check (vote is null or vote in ('pour', 'pourquoi_pas', 'contre'));
alter table voyage.avis_options_trajet alter column commentaire drop not null;
select pg_temp.retirer_checks('voyage.avis_options_trajet'::regclass, 'commentaire');
alter table voyage.avis_options_trajet add constraint avis_options_trajet_contenu_check
  check (vote is not null or length(trim(coalesce(commentaire, ''))) > 0);

-- -------------------------------------------------------------------------
-- 4. Activités : inscription et clôture du vote
-- -------------------------------------------------------------------------

alter table voyage.activites
  add column if not exists inscription boolean not null default false,
  add column if not exists cloture_le date;

comment on column voyage.activites.inscription is
  'Activité retenue qui demande de s''inscrire : chaque foyer dit « avec nous » ou « sans nous ».';

-- -------------------------------------------------------------------------
-- 5. Plat « proposé par la famille » et assistant
-- -------------------------------------------------------------------------

select pg_temp.retirer_checks('voyage.plats'::regclass, 'etape');
alter table voyage.plats add constraint plats_etape_check
  check (etape in ('aperitif', 'entree', 'plat', 'accompagnement', 'fromage', 'dessert', 'boissons', 'autre'));

select pg_temp.retirer_checks('voyage.repas_responsables'::regclass, 'etape');
alter table voyage.repas_responsables add constraint repas_responsables_etape_check
  check (etape in ('aperitif', 'entree', 'plat', 'accompagnement', 'fromage', 'dessert', 'boissons', 'autre'));

create or replace function voyage.libelle_etape(etape text)
returns text language sql immutable
as $$
  select case etape
    when 'aperitif' then 'l’apéritif' when 'entree' then 'l’entrée' when 'plat' then 'le plat'
    when 'accompagnement' then 'l’accompagnement' when 'fromage' then 'le fromage'
    when 'dessert' then 'le dessert' when 'boissons' then 'les boissons'
    when 'autre' then 'un plat proposé par la famille' else etape end;
$$;

select pg_temp.retirer_checks('voyage.proposes_assistant'::regclass, 'nature');
alter table voyage.proposes_assistant add constraint proposes_assistant_nature_check
  check (nature in ('dates', 'hebergement', 'activite', 'trajet'));

-- -------------------------------------------------------------------------
-- 6. Notifications : relance, vote des dates rouvert
-- -------------------------------------------------------------------------

alter table voyage.notifications drop constraint if exists notifications_type_check;
alter table voyage.notifications add constraint notifications_type_check check (type in (
  'invitation', 'dates_proposees', 'dates_retenues', 'hebergement_propose', 'hebergement_retenu',
  'activite_proposee', 'activite_retenue', 'plat_propose', 'tache_confiee',
  'option_trajet_proposee', 'option_trajet_retenue',
  'relance', 'dates_rouvertes'
));

-- -------------------------------------------------------------------------
-- 7. Une date : fixée ; plusieurs : on vote
-- -------------------------------------------------------------------------

create or replace function voyage.regler_dates_proposees()
returns trigger
language plpgsql security definer
set search_path = voyage, pg_temp
as $$
declare
  v uuid := case tg_op when 'DELETE' then old.voyage_id else new.voyage_id end;
  n integer;
  p voyage.propositions_dates;
  deja timestamptz;
begin
  select count(*) into n from voyage.propositions_dates where voyage_id = v;
  select dates_validees_le into deja from voyage.voyages where id = v;

  if n = 0 then
    -- Plus aucune proposition : les dates sont vides.
    update voyage.voyages set date_debut = null, date_fin = null, dates_validees_le = null where id = v;
  elsif n = 1 then
    -- Une seule date : elle vaut décision (sauf si des dates sont déjà validées).
    if deja is null then
      select * into p from voyage.propositions_dates where voyage_id = v;
      update voyage.voyages
         set date_debut = p.date_debut, date_fin = p.date_fin,
             dates_validees_le = now(),
             statut = case when statut = 'idee' then 'organisation' else statut end
       where id = v;
    end if;
  elsif tg_op = 'INSERT' then
    -- Une deuxième date (ou plus) rouvre le vote.
    update voyage.voyages
       set date_debut = null, date_fin = null, nb_nuits = null, dates_validees_le = null
     where id = v;
    if deja is not null then
      perform voyage.notifier(
        v, 'dates_rouvertes',
        'De nouvelles dates sont proposées pour « ' || voyage.titre_voyage(v) || ' » : votez',
        'Dates');
    end if;
  end if;
  return null;
end $$;

drop trigger if exists regler_dates_proposees on voyage.propositions_dates;
create trigger regler_dates_proposees
after insert or delete on voyage.propositions_dates
for each row execute function voyage.regler_dates_proposees();

-- Fixer les dates après un vote remplit aussi dates_validees_le.
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
      dates_validees_le = now(),
      statut = case when statut = 'idee' then 'organisation' else statut end
  where id = pr.voyage_id;
end;
$$;

notify pgrst, 'reload schema';

commit;
