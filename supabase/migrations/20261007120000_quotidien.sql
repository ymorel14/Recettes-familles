-- =========================================================================
-- Migration — Schéma "quotidien" de l'app Quotidien (Phase 1 : covoiturage)
--
-- Organiser les trajets des activités des enfants entre plusieurs foyers,
-- y compris des foyers HORS de la famille (parents d'une même équipe, d'un
-- même club, d'une même classe) :
--   - un GROUPE (ex. « U11 foot — mercredi ») réunit des PARTICIPANTS ;
--   - un participant est soit un foyer avec compte (schéma "famille"), qui
--     rejoint le groupe avec un code, soit un parent INVITÉ sans compte, qui
--     répond aux trajets par un simple lien secret (jeton) ;
--   - chaque participant déclare ses ENFANTS du groupe (prénom seulement) ;
--   - une ACTIVITÉ récurrente (jour, horaires, lieu, période) produit des
--     SÉANCES, en sautant les vacances scolaires de la zone choisie ;
--   - chaque séance a un trajet ALLER et un trajet RETOUR, avec un
--     conducteur (un participant), ses places libres et les enfants
--     transportés.
--
-- Qui voit quoi (garanti par les règles RLS) :
--   - les membres d'un groupe (foyers participants) voient le groupe, ses
--     participants (nom affiché), les prénoms des enfants, les activités,
--     séances et trajets du groupe — RIEN d'autre de leurs foyers : ni
--     recettes, ni souvenirs, ni famille, ni adresse, ni date de naissance ;
--   - les jetons des invités ne se lisent jamais par les tables : seul le
--     membre qui a créé l'invitation récupère le lien
--     (quotidien.lien_invite) ;
--   - un invité sans compte passe uniquement par les fonctions *_invite,
--     qui vérifient son jeton.
--
-- Prendre ou laisser un trajet passe par des fonctions (prendre_trajet,
-- laisser_trajet) : on ne peut s'inscrire comme conducteur que pour soi.
--
-- Pré-requis : migration socle_famille. APRÈS : ajouter "quotidien" aux
-- schémas exposés (Project Settings > API > Exposed schemas).
-- =========================================================================

begin;

create schema if not exists quotidien;
grant usage on schema quotidien to anon, authenticated, service_role;

-- -------------------------------------------------------------------------
-- 1. Tables
-- -------------------------------------------------------------------------

create table quotidien.groupes (
  id uuid primary key default gen_random_uuid(),
  nom text not null check (length(trim(nom)) > 0),
  -- Zone de vacances scolaires pour générer les séances (A, B, C, Corse ;
  -- vide = ne pas sauter les vacances).
  zone_vacances text check (zone_vacances in ('A', 'B', 'C', 'Corse')),
  cree_par uuid not null default auth.uid() references auth.users (id) on delete cascade,
  cree_le timestamptz not null default now()
);

-- Participants : un foyer avec compte OU un parent invité sans compte.
create table quotidien.participants (
  id uuid primary key default gen_random_uuid(),
  groupe_id uuid not null references quotidien.groupes (id) on delete cascade,
  foyer_id uuid references famille.foyers (id) on delete cascade,
  -- Nom vu par les autres membres (« Famille Martin », « Sophie »).
  nom_affiche text not null check (length(trim(nom_affiche)) > 0),
  -- Invité : membre qui l'a ajouté (lui seul peut retrouver le lien).
  invite_par uuid references auth.users (id) on delete set null,
  ajoute_le timestamptz not null default now(),
  -- Quitte le groupe : garde l'historique d'équité, plus aucun accès.
  parti_le timestamptz
);
create unique index participants_foyer_unique on quotidien.participants (groupe_id, foyer_id)
  where foyer_id is not null;
create index participants_groupe on quotidien.participants (groupe_id);
create index participants_foyer on quotidien.participants (foyer_id);

-- Jetons des invités, à part : aucune règle de lecture, accès par fonctions.
create table quotidien.jetons_invites (
  participant_id uuid primary key references quotidien.participants (id) on delete cascade,
  jeton uuid not null unique default gen_random_uuid(),
  cree_le timestamptz not null default now()
);

-- Codes pour rejoindre un groupe (7 jours).
create table quotidien.codes_groupe (
  code text primary key,
  groupe_id uuid not null references quotidien.groupes (id) on delete cascade,
  cree_par uuid not null default auth.uid() references auth.users (id) on delete cascade,
  cree_le timestamptz not null default now(),
  expire_le timestamptz not null default now() + interval '7 days'
);
create index codes_groupe_groupe on quotidien.codes_groupe (groupe_id);

-- Enfants du groupe : prénom seulement (minimisation). personne_id relie à
-- la fiche famille.personnes pour un foyer avec compte (jamais lisible par
-- les autres membres : la table famille.personnes reste protégée).
create table quotidien.enfants (
  id uuid primary key default gen_random_uuid(),
  participant_id uuid not null references quotidien.participants (id) on delete cascade,
  personne_id uuid references famille.personnes (id) on delete set null,
  prenom text not null check (length(trim(prenom)) > 0),
  cree_le timestamptz not null default now()
);
create index enfants_participant on quotidien.enfants (participant_id);

create table quotidien.activites (
  id uuid primary key default gen_random_uuid(),
  groupe_id uuid not null references quotidien.groupes (id) on delete cascade,
  nom text not null check (length(trim(nom)) > 0),
  -- Lieu d'activité (stade, gymnase), jamais un domicile par défaut.
  lieu text,
  -- 1 = lundi … 7 = dimanche (ISO).
  jour_semaine smallint not null check (jour_semaine between 1 and 7),
  heure_debut time not null,
  heure_fin time not null,
  date_debut date not null,
  date_fin date not null,
  cree_par uuid not null default auth.uid() references auth.users (id) on delete cascade,
  cree_le timestamptz not null default now(),
  check (heure_fin > heure_debut),
  check (date_fin >= date_debut),
  check (date_fin <= date_debut + 400)
);
create index activites_groupe on quotidien.activites (groupe_id);

create table quotidien.seances (
  id uuid primary key default gen_random_uuid(),
  activite_id uuid not null references quotidien.activites (id) on delete cascade,
  date date not null,
  heure_debut time not null,
  heure_fin time not null,
  -- Autre lieu ce jour-là (match à l'extérieur).
  lieu text,
  statut text not null default 'prevue' check (statut in ('prevue', 'annulee')),
  note text,
  unique (activite_id, date),
  check (heure_fin > heure_debut)
);
create index seances_date on quotidien.seances (date);

create table quotidien.trajets (
  id uuid primary key default gen_random_uuid(),
  seance_id uuid not null references quotidien.seances (id) on delete cascade,
  sens text not null check (sens in ('aller', 'retour')),
  -- Heure de départ (aller) ou de prise en charge (retour).
  heure time not null,
  conducteur_id uuid references quotidien.participants (id) on delete set null,
  places smallint not null default 0 check (places between 0 and 8),
  note text,
  unique (seance_id, sens)
);
create index trajets_conducteur on quotidien.trajets (conducteur_id);

create table quotidien.trajet_enfants (
  trajet_id uuid not null references quotidien.trajets (id) on delete cascade,
  enfant_id uuid not null references quotidien.enfants (id) on delete cascade,
  primary key (trajet_id, enfant_id)
);
create index trajet_enfants_enfant on quotidien.trajet_enfants (enfant_id);

-- Vacances scolaires (calendrier officiel, importé ; lisible de tous).
create table quotidien.vacances_scolaires (
  zone text not null check (zone in ('A', 'B', 'C', 'Corse')),
  libelle text not null,
  debut date not null,
  fin date not null,
  primary key (zone, debut),
  check (fin >= debut)
);

-- -------------------------------------------------------------------------
-- 2. Fonctions d'accès
-- -------------------------------------------------------------------------

-- Mes participations (via mon foyer), groupes quittés exclus.
create or replace function quotidien.mes_participants()
returns setof uuid
language sql stable security definer
set search_path = quotidien, pg_temp
as $$
  select p.id from quotidien.participants p
  where p.foyer_id in (select famille.mes_foyers()) and p.parti_le is null;
$$;

create or replace function quotidien.mes_groupes()
returns setof uuid
language sql stable security definer
set search_path = quotidien, pg_temp
as $$
  select p.groupe_id from quotidien.participants p
  where p.id in (select quotidien.mes_participants());
$$;

create or replace function quotidien.est_membre(id_groupe uuid)
returns boolean
language sql stable security definer
set search_path = quotidien, pg_temp
as $$
  select id_groupe in (select quotidien.mes_groupes());
$$;

-- Mon participant dans un groupe (null si non membre).
create or replace function quotidien.mon_participant(id_groupe uuid)
returns uuid
language sql stable security definer
set search_path = quotidien, pg_temp
as $$
  select p.id from quotidien.participants p
  where p.groupe_id = id_groupe and p.id in (select quotidien.mes_participants())
  limit 1;
$$;

create or replace function quotidien.groupe_de_participant(id_participant uuid)
returns uuid language sql stable security definer set search_path = quotidien, pg_temp
as $$ select groupe_id from quotidien.participants where id = id_participant; $$;

create or replace function quotidien.groupe_d_activite(id_activite uuid)
returns uuid language sql stable security definer set search_path = quotidien, pg_temp
as $$ select groupe_id from quotidien.activites where id = id_activite; $$;

create or replace function quotidien.groupe_de_seance(id_seance uuid)
returns uuid language sql stable security definer set search_path = quotidien, pg_temp
as $$
  select a.groupe_id from quotidien.seances s join quotidien.activites a on a.id = s.activite_id
  where s.id = id_seance;
$$;

create or replace function quotidien.groupe_de_trajet(id_trajet uuid)
returns uuid language sql stable security definer set search_path = quotidien, pg_temp
as $$ select quotidien.groupe_de_seance(seance_id) from quotidien.trajets where id = id_trajet; $$;

create or replace function quotidien.groupe_d_enfant(id_enfant uuid)
returns uuid language sql stable security definer set search_path = quotidien, pg_temp
as $$
  select p.groupe_id from quotidien.enfants e join quotidien.participants p on p.id = e.participant_id
  where e.id = id_enfant;
$$;

-- Participant d'un jeton d'invité valide (groupe non quitté).
create or replace function quotidien.participant_du_jeton(jeton_invite uuid)
returns uuid
language sql stable security definer
set search_path = quotidien, pg_temp
as $$
  select j.participant_id from quotidien.jetons_invites j
  join quotidien.participants p on p.id = j.participant_id
  where j.jeton = jeton_invite and p.parti_le is null;
$$;

-- -------------------------------------------------------------------------
-- 3. Déclencheurs
-- -------------------------------------------------------------------------

-- À la création d'un groupe, le foyer du créateur en devient participant.
create or replace function quotidien.participer_a_la_creation()
returns trigger
language plpgsql security definer
set search_path = quotidien, pg_temp
as $$
declare
  mon_foyer uuid := (select famille.mes_foyers() limit 1);
  nom text;
begin
  if mon_foyer is null then
    raise exception 'Créez ou rejoignez d''abord votre foyer';
  end if;
  select coalesce(nullif(trim(pr.prenom), ''), f.nom) into nom
  from famille.foyers f
  left join famille.profils pr on pr.utilisateur_id = auth.uid()
  where f.id = mon_foyer;
  insert into quotidien.participants (groupe_id, foyer_id, nom_affiche)
  values (new.id, mon_foyer, coalesce(nom, 'Moi'));
  return new;
end;
$$;

create trigger groupes_participer
  after insert on quotidien.groupes
  for each row execute function quotidien.participer_a_la_creation();

-- Chaque séance reçoit ses deux trajets (aller à l'heure de début, retour
-- à l'heure de fin).
create or replace function quotidien.creer_trajets_de_seance()
returns trigger
language plpgsql security definer
set search_path = quotidien, pg_temp
as $$
begin
  insert into quotidien.trajets (seance_id, sens, heure)
  values (new.id, 'aller', new.heure_debut), (new.id, 'retour', new.heure_fin)
  on conflict do nothing;
  return new;
end;
$$;

create trigger seances_trajets
  after insert on quotidien.seances
  for each row execute function quotidien.creer_trajets_de_seance();

-- Un conducteur appartient au groupe du trajet ; un enfant transporté aussi.
create or replace function quotidien.verifier_trajet()
returns trigger
language plpgsql security definer
set search_path = quotidien, pg_temp
as $$
begin
  if new.conducteur_id is not null
     and quotidien.groupe_de_participant(new.conducteur_id) is distinct from quotidien.groupe_de_seance(new.seance_id) then
    raise exception 'Le conducteur doit faire partie du groupe';
  end if;
  return new;
end;
$$;

create trigger trajets_verifier
  before insert or update on quotidien.trajets
  for each row execute function quotidien.verifier_trajet();

create or replace function quotidien.verifier_trajet_enfant()
returns trigger
language plpgsql security definer
set search_path = quotidien, pg_temp
as $$
begin
  if quotidien.groupe_d_enfant(new.enfant_id) is distinct from quotidien.groupe_de_trajet(new.trajet_id) then
    raise exception 'Cet enfant ne fait pas partie du groupe';
  end if;
  return new;
end;
$$;

create trigger trajet_enfants_verifier
  before insert or update on quotidien.trajet_enfants
  for each row execute function quotidien.verifier_trajet_enfant();

-- -------------------------------------------------------------------------
-- 4. Règles RLS
-- -------------------------------------------------------------------------

alter table quotidien.groupes enable row level security;
alter table quotidien.participants enable row level security;
alter table quotidien.jetons_invites enable row level security;
alter table quotidien.codes_groupe enable row level security;
alter table quotidien.enfants enable row level security;
alter table quotidien.activites enable row level security;
alter table quotidien.seances enable row level security;
alter table quotidien.trajets enable row level security;
alter table quotidien.trajet_enfants enable row level security;
alter table quotidien.vacances_scolaires enable row level security;

grant select, insert, update, delete on all tables in schema quotidien to authenticated;
-- Jetons : aucune lecture ni écriture directe.
revoke all on quotidien.jetons_invites from anon, authenticated;
-- Vacances : lecture seule (l'import passe par la clé de service).
revoke insert, update, delete on quotidien.vacances_scolaires from authenticated;
grant select on quotidien.vacances_scolaires to anon;
-- Clé de service (fonction Edge importer-vacances) : accès complet.
grant all on all tables in schema quotidien to service_role;

-- Groupes. cree_par permet de relire le groupe qu'on vient de créer.
create policy "Voir ses groupes" on quotidien.groupes
  for select using (cree_par = auth.uid() or quotidien.est_membre(id));
create policy "Créer un groupe" on quotidien.groupes
  for insert with check (cree_par = auth.uid());
create policy "Modifier un groupe dont on est membre" on quotidien.groupes
  for update using (quotidien.est_membre(id)) with check (quotidien.est_membre(id));
create policy "Supprimer son groupe" on quotidien.groupes
  for delete using (cree_par = auth.uid());

-- Participants : lecture par les membres ; ajout par fonctions
-- (rejoindre_groupe, ajouter_invite) ; chacun change son nom affiché.
create policy "Voir les participants de ses groupes" on quotidien.participants
  for select using (quotidien.est_membre(groupe_id));
create policy "Changer son nom affiché" on quotidien.participants
  for update using (id in (select quotidien.mes_participants()))
  with check (id in (select quotidien.mes_participants()));
create policy "Modifier un invité qu'on a ajouté" on quotidien.participants
  for update using (invite_par = auth.uid() and quotidien.est_membre(groupe_id))
  with check (invite_par = auth.uid() and foyer_id is null);
revoke insert, delete on quotidien.participants from authenticated;

-- Codes : lus par les membres (pour les partager), créés par fonction.
create policy "Voir les codes de ses groupes" on quotidien.codes_groupe
  for select using (quotidien.est_membre(groupe_id));
revoke insert, update, delete on quotidien.codes_groupe from authenticated;

-- Enfants : prénoms lisibles des membres ; chacun gère les siens (et ceux
-- des invités qu'il a ajoutés).
create policy "Voir les enfants de ses groupes" on quotidien.enfants
  for select using (quotidien.est_membre(quotidien.groupe_de_participant(participant_id)));
create policy "Ajouter ses enfants" on quotidien.enfants
  for insert with check (
    participant_id in (select quotidien.mes_participants())
    or exists (
      select 1 from quotidien.participants p
      where p.id = participant_id and p.invite_par = auth.uid() and quotidien.est_membre(p.groupe_id)
    )
  );
create policy "Modifier ses enfants" on quotidien.enfants
  for update using (participant_id in (select quotidien.mes_participants()))
  with check (participant_id in (select quotidien.mes_participants()));
create policy "Retirer ses enfants" on quotidien.enfants
  for delete using (participant_id in (select quotidien.mes_participants()));

-- Activités et séances : tout membre du groupe les gère.
create policy "Voir les activités" on quotidien.activites
  for select using (quotidien.est_membre(groupe_id));
create policy "Ajouter une activité" on quotidien.activites
  for insert with check (quotidien.est_membre(groupe_id) and cree_par = auth.uid());
create policy "Modifier une activité" on quotidien.activites
  for update using (quotidien.est_membre(groupe_id)) with check (quotidien.est_membre(groupe_id));
create policy "Supprimer une activité" on quotidien.activites
  for delete using (quotidien.est_membre(groupe_id));

create policy "Voir les séances" on quotidien.seances
  for select using (quotidien.est_membre(quotidien.groupe_d_activite(activite_id)));
create policy "Ajouter une séance" on quotidien.seances
  for insert with check (quotidien.est_membre(quotidien.groupe_d_activite(activite_id)));
create policy "Modifier une séance" on quotidien.seances
  for update using (quotidien.est_membre(quotidien.groupe_d_activite(activite_id)))
  with check (quotidien.est_membre(quotidien.groupe_d_activite(activite_id)));
create policy "Supprimer une séance" on quotidien.seances
  for delete using (quotidien.est_membre(quotidien.groupe_d_activite(activite_id)));

-- Trajets : lus par les membres ; heure, places et note modifiables par
-- les membres ; le conducteur change seulement par prendre_trajet /
-- laisser_trajet (colonne non modifiable directement).
create policy "Voir les trajets" on quotidien.trajets
  for select using (quotidien.est_membre(quotidien.groupe_de_seance(seance_id)));
create policy "Modifier un trajet" on quotidien.trajets
  for update using (quotidien.est_membre(quotidien.groupe_de_seance(seance_id)))
  with check (quotidien.est_membre(quotidien.groupe_de_seance(seance_id)));
revoke insert, delete, update on quotidien.trajets from authenticated;
grant update (heure, places, note) on quotidien.trajets to authenticated;

-- Enfants d'un trajet : chacun inscrit ou retire ses enfants ; le
-- conducteur peut aussi gérer les enfants de son trajet.
create policy "Voir les enfants des trajets" on quotidien.trajet_enfants
  for select using (quotidien.est_membre(quotidien.groupe_de_trajet(trajet_id)));
create policy "Inscrire un enfant à un trajet" on quotidien.trajet_enfants
  for insert with check (
    quotidien.est_membre(quotidien.groupe_de_trajet(trajet_id))
    and (
      enfant_id in (select e.id from quotidien.enfants e where e.participant_id in (select quotidien.mes_participants()))
      or exists (
        select 1 from quotidien.trajets t
        where t.id = trajet_id and t.conducteur_id in (select quotidien.mes_participants())
      )
    )
  );
create policy "Retirer un enfant d'un trajet" on quotidien.trajet_enfants
  for delete using (
    enfant_id in (select e.id from quotidien.enfants e where e.participant_id in (select quotidien.mes_participants()))
    or exists (
      select 1 from quotidien.trajets t
      where t.id = trajet_id and t.conducteur_id in (select quotidien.mes_participants())
    )
  );
revoke update on quotidien.trajet_enfants from authenticated;

create policy "Voir les vacances scolaires" on quotidien.vacances_scolaires
  for select using (true);

-- -------------------------------------------------------------------------
-- 5. Fonctions pour l'app (membres connectés)
-- -------------------------------------------------------------------------

-- Code du groupe en cours de validité (ou nouveau), à partager.
create or replace function quotidien.obtenir_code_groupe(id_groupe uuid)
returns json
language plpgsql security definer
set search_path = quotidien, pg_temp
as $$
declare
  c quotidien.codes_groupe;
begin
  if not quotidien.est_membre(id_groupe) then
    raise exception 'Vous ne faites pas partie de ce groupe';
  end if;
  select * into c from quotidien.codes_groupe
  where groupe_id = id_groupe and expire_le > now() + interval '1 day'
  order by expire_le desc limit 1;
  if c.code is null then
    loop
      begin
        insert into quotidien.codes_groupe (code, groupe_id)
        values (famille.generer_code_invitation(), id_groupe)
        returning * into c;
        exit;
      exception when unique_violation then
        -- code déjà pris : on en tire un autre
      end;
    end loop;
  end if;
  return json_build_object('code', c.code, 'expire_le', c.expire_le);
end;
$$;

-- Rejoindre un groupe avec un code : mon foyer devient participant
-- (ou revient, s'il l'avait quitté).
create or replace function quotidien.rejoindre_groupe(code_saisi text, nom text default null)
returns uuid
language plpgsql security definer
set search_path = quotidien, pg_temp
as $$
declare
  c quotidien.codes_groupe;
  mon_foyer uuid := (select famille.mes_foyers() limit 1);
  nom_par_defaut text;
begin
  if auth.uid() is null then
    raise exception 'Vous devez être connecté';
  end if;
  if mon_foyer is null then
    raise exception 'Créez ou rejoignez d''abord votre foyer';
  end if;
  select * into c from quotidien.codes_groupe
  where code = upper(trim(code_saisi)) and expire_le > now();
  if c.code is null then
    raise exception 'Code invalide ou expiré';
  end if;
  select coalesce(nullif(trim(pr.prenom), ''), f.nom) into nom_par_defaut
  from famille.foyers f
  left join famille.profils pr on pr.utilisateur_id = auth.uid()
  where f.id = mon_foyer;

  insert into quotidien.participants (groupe_id, foyer_id, nom_affiche)
  values (c.groupe_id, mon_foyer, coalesce(nullif(trim(nom), ''), nom_par_defaut, 'Moi'))
  on conflict (groupe_id, foyer_id) where foyer_id is not null
  do update set parti_le = null;
  return c.groupe_id;
end;
$$;

-- Quitter un groupe : plus d'accès, l'historique d'équité reste ; on
-- n'est plus conducteur des trajets à venir.
create or replace function quotidien.quitter_groupe(id_groupe uuid)
returns void
language plpgsql security definer
set search_path = quotidien, pg_temp
as $$
declare
  moi uuid := quotidien.mon_participant(id_groupe);
begin
  if moi is null then
    raise exception 'Vous ne faites pas partie de ce groupe';
  end if;
  update quotidien.trajets t set conducteur_id = null
  from quotidien.seances s
  where s.id = t.seance_id and t.conducteur_id = moi and s.date >= current_date;
  update quotidien.participants set parti_le = now() where id = moi;
end;
$$;

-- Ajouter un parent invité sans compte ; renvoie son jeton (le lien
-- s'écrit <site>/quotidien/invite/<jeton>).
create or replace function quotidien.ajouter_invite(id_groupe uuid, nom text)
returns uuid
language plpgsql security definer
set search_path = quotidien, pg_temp
as $$
declare
  nouvel uuid;
  j uuid;
begin
  if not quotidien.est_membre(id_groupe) then
    raise exception 'Vous ne faites pas partie de ce groupe';
  end if;
  if coalesce(trim(nom), '') = '' then
    raise exception 'Indiquez le nom du parent invité';
  end if;
  insert into quotidien.participants (groupe_id, nom_affiche, invite_par)
  values (id_groupe, trim(nom), auth.uid())
  returning id into nouvel;
  insert into quotidien.jetons_invites (participant_id) values (nouvel) returning jeton into j;
  return j;
end;
$$;

-- Retrouver le lien d'un invité qu'on a ajouté.
create or replace function quotidien.lien_invite(id_participant uuid)
returns uuid
language sql stable security definer
set search_path = quotidien, pg_temp
as $$
  select j.jeton from quotidien.jetons_invites j
  join quotidien.participants p on p.id = j.participant_id
  where p.id = id_participant and p.invite_par = auth.uid() and quotidien.est_membre(p.groupe_id);
$$;

-- Nouveau lien pour un invité (l'ancien ne marche plus).
create or replace function quotidien.renouveler_lien_invite(id_participant uuid)
returns uuid
language plpgsql security definer
set search_path = quotidien, pg_temp
as $$
declare
  j uuid;
begin
  if quotidien.lien_invite(id_participant) is null then
    raise exception 'Seul le membre qui a ajouté cet invité peut renouveler son lien';
  end if;
  update quotidien.jetons_invites set jeton = gen_random_uuid(), cree_le = now()
  where participant_id = id_participant
  returning jeton into j;
  return j;
end;
$$;

-- Retirer un invité qu'on a ajouté (même effet que quitter_groupe pour lui).
create or replace function quotidien.retirer_invite(id_participant uuid)
returns void
language plpgsql security definer
set search_path = quotidien, pg_temp
as $$
begin
  if quotidien.lien_invite(id_participant) is null then
    raise exception 'Seul le membre qui a ajouté cet invité peut le retirer';
  end if;
  update quotidien.trajets t set conducteur_id = null
  from quotidien.seances s
  where s.id = t.seance_id and t.conducteur_id = id_participant and s.date >= current_date;
  update quotidien.participants set parti_le = now() where id = id_participant;
  delete from quotidien.jetons_invites where participant_id = id_participant;
end;
$$;

-- Créer les séances d'une activité, chaque semaine de la période, en
-- sautant les vacances scolaires de la zone du groupe. Renvoie le nombre
-- de séances créées (celles qui existent déjà sont gardées).
create or replace function quotidien.generer_seances(id_activite uuid)
returns integer
language plpgsql security definer
set search_path = quotidien, pg_temp
as $$
declare
  a quotidien.activites;
  z text;
  d date;
  n integer := 0;
  lignes integer;
begin
  select * into a from quotidien.activites where id = id_activite;
  if a.id is null or not quotidien.est_membre(a.groupe_id) then
    raise exception 'Activité introuvable';
  end if;
  select zone_vacances into z from quotidien.groupes where id = a.groupe_id;
  -- Premier jour de la période qui tombe le bon jour de la semaine.
  d := a.date_debut + ((a.jour_semaine - extract(isodow from a.date_debut)::int + 7) % 7);
  while d <= a.date_fin loop
    if z is null or not exists (
      select 1 from quotidien.vacances_scolaires v where v.zone = z and d between v.debut and v.fin
    ) then
      insert into quotidien.seances (activite_id, date, heure_debut, heure_fin)
      values (a.id, d, a.heure_debut, a.heure_fin)
      on conflict (activite_id, date) do nothing;
      get diagnostics lignes = row_count;
      n := n + lignes;
    end if;
    d := d + 7;
  end loop;
  return n;
end;
$$;

-- Je conduis ce trajet (si personne ne le conduit encore).
create or replace function quotidien.prendre_trajet(id_trajet uuid, nb_places smallint default null)
returns void
language plpgsql security definer
set search_path = quotidien, pg_temp
as $$
declare
  moi uuid := quotidien.mon_participant(quotidien.groupe_de_trajet(id_trajet));
begin
  if moi is null then
    raise exception 'Vous ne faites pas partie de ce groupe';
  end if;
  update quotidien.trajets
  set conducteur_id = moi, places = coalesce(nb_places, places)
  where id = id_trajet and (conducteur_id is null or conducteur_id = moi);
  if not found then
    raise exception 'Quelqu''un conduit déjà ce trajet';
  end if;
end;
$$;

-- Je ne peux plus conduire ce trajet : il redevient libre.
create or replace function quotidien.laisser_trajet(id_trajet uuid)
returns void
language plpgsql security definer
set search_path = quotidien, pg_temp
as $$
declare
  moi uuid := quotidien.mon_participant(quotidien.groupe_de_trajet(id_trajet));
begin
  update quotidien.trajets set conducteur_id = null
  where id = id_trajet and conducteur_id = moi and moi is not null;
  if not found then
    raise exception 'Vous ne conduisez pas ce trajet';
  end if;
end;
$$;

-- Équité : trajets assurés par participant (séances passées, non annulées).
create or replace function quotidien.equite(id_groupe uuid)
returns table (participant_id uuid, nom_affiche text, trajets bigint, parti boolean)
language sql stable security definer
set search_path = quotidien, pg_temp
as $$
  select p.id, p.nom_affiche,
         count(t.id) filter (where s.date < current_date and s.statut = 'prevue'),
         p.parti_le is not null
  from quotidien.participants p
  left join quotidien.trajets t on t.conducteur_id = p.id
  left join quotidien.seances s on s.id = t.seance_id
  where p.groupe_id = id_groupe and quotidien.est_membre(id_groupe)
  group by p.id, p.nom_affiche, p.parti_le
  order by p.ajoute_le;
$$;

-- -------------------------------------------------------------------------
-- 6. Fonctions pour un parent invité (sans compte, par jeton)
-- -------------------------------------------------------------------------

-- Ce que voit l'invité : le groupe, les participants, ses enfants et les
-- trajets des 6 prochaines semaines (prénoms seulement).
create or replace function quotidien.vue_invite(jeton_invite uuid)
returns json
language plpgsql stable security definer
set search_path = quotidien, pg_temp
as $$
declare
  moi uuid := quotidien.participant_du_jeton(jeton_invite);
  g uuid;
begin
  if moi is null then
    raise exception 'Lien invalide ou expiré';
  end if;
  g := quotidien.groupe_de_participant(moi);
  return json_build_object(
    'moi', moi,
    'groupe', (select json_build_object('id', id, 'nom', nom) from quotidien.groupes where id = g),
    'participants', coalesce((
      select json_agg(json_build_object('id', p.id, 'nom_affiche', p.nom_affiche) order by p.ajoute_le)
      from quotidien.participants p where p.groupe_id = g and p.parti_le is null), '[]'::json),
    'mes_enfants', coalesce((
      select json_agg(json_build_object('id', e.id, 'prenom', e.prenom) order by e.cree_le)
      from quotidien.enfants e where e.participant_id = moi), '[]'::json),
    'trajets', coalesce((
      select json_agg(json_build_object(
        'id', t.id, 'sens', t.sens, 'heure', t.heure, 'places', t.places, 'note', t.note,
        'conducteur_id', t.conducteur_id,
        'date', s.date, 'statut', s.statut, 'lieu', coalesce(s.lieu, a.lieu), 'activite', a.nom,
        'enfants', coalesce((
          select json_agg(json_build_object('id', e.id, 'prenom', e.prenom))
          from quotidien.trajet_enfants te join quotidien.enfants e on e.id = te.enfant_id
          where te.trajet_id = t.id), '[]'::json)
      ) order by s.date, t.heure)
      from quotidien.trajets t
      join quotidien.seances s on s.id = t.seance_id
      join quotidien.activites a on a.id = s.activite_id
      where a.groupe_id = g and s.date between current_date and current_date + 42), '[]'::json)
  );
end;
$$;

create or replace function quotidien.prendre_trajet_invite(jeton_invite uuid, id_trajet uuid)
returns void
language plpgsql security definer
set search_path = quotidien, pg_temp
as $$
declare
  moi uuid := quotidien.participant_du_jeton(jeton_invite);
begin
  if moi is null or quotidien.groupe_de_participant(moi) is distinct from quotidien.groupe_de_trajet(id_trajet) then
    raise exception 'Lien invalide ou expiré';
  end if;
  update quotidien.trajets set conducteur_id = moi
  where id = id_trajet and (conducteur_id is null or conducteur_id = moi);
  if not found then
    raise exception 'Quelqu''un conduit déjà ce trajet';
  end if;
end;
$$;

create or replace function quotidien.laisser_trajet_invite(jeton_invite uuid, id_trajet uuid)
returns void
language plpgsql security definer
set search_path = quotidien, pg_temp
as $$
declare
  moi uuid := quotidien.participant_du_jeton(jeton_invite);
begin
  update quotidien.trajets set conducteur_id = null
  where id = id_trajet and conducteur_id = moi and moi is not null;
  if not found then
    raise exception 'Vous ne conduisez pas ce trajet';
  end if;
end;
$$;

-- L'invité déclare un enfant (prénom) ; renvoie son identifiant.
create or replace function quotidien.ajouter_enfant_invite(jeton_invite uuid, prenom text)
returns uuid
language plpgsql security definer
set search_path = quotidien, pg_temp
as $$
declare
  moi uuid := quotidien.participant_du_jeton(jeton_invite);
  e uuid;
begin
  if moi is null then
    raise exception 'Lien invalide ou expiré';
  end if;
  if coalesce(trim(prenom), '') = '' then
    raise exception 'Indiquez le prénom';
  end if;
  insert into quotidien.enfants (participant_id, prenom) values (moi, trim(prenom)) returning id into e;
  return e;
end;
$$;

-- L'invité inscrit (ou retire) un de ses enfants sur un trajet.
create or replace function quotidien.inscrire_enfant_invite(jeton_invite uuid, id_trajet uuid, id_enfant uuid, inscrire boolean default true)
returns void
language plpgsql security definer
set search_path = quotidien, pg_temp
as $$
declare
  moi uuid := quotidien.participant_du_jeton(jeton_invite);
begin
  if moi is null or not exists (select 1 from quotidien.enfants where id = id_enfant and participant_id = moi) then
    raise exception 'Lien invalide ou expiré';
  end if;
  if inscrire then
    insert into quotidien.trajet_enfants (trajet_id, enfant_id) values (id_trajet, id_enfant)
    on conflict do nothing;
  else
    delete from quotidien.trajet_enfants where trajet_id = id_trajet and enfant_id = id_enfant;
  end if;
end;
$$;

-- -------------------------------------------------------------------------
-- 7. Droits d'exécution
-- -------------------------------------------------------------------------

revoke execute on all functions in schema quotidien from public;

grant execute on function
  quotidien.mes_participants(), quotidien.mes_groupes(), quotidien.est_membre(uuid),
  quotidien.mon_participant(uuid),
  quotidien.groupe_de_participant(uuid), quotidien.groupe_d_activite(uuid),
  quotidien.groupe_de_seance(uuid), quotidien.groupe_de_trajet(uuid), quotidien.groupe_d_enfant(uuid),
  quotidien.obtenir_code_groupe(uuid), quotidien.rejoindre_groupe(text, text), quotidien.quitter_groupe(uuid),
  quotidien.ajouter_invite(uuid, text), quotidien.lien_invite(uuid),
  quotidien.renouveler_lien_invite(uuid), quotidien.retirer_invite(uuid),
  quotidien.generer_seances(uuid), quotidien.prendre_trajet(uuid, smallint), quotidien.laisser_trajet(uuid),
  quotidien.equite(uuid)
to authenticated;

-- Invités sans compte (clé publique anon) : uniquement ces fonctions-là.
grant execute on function
  quotidien.vue_invite(uuid), quotidien.prendre_trajet_invite(uuid, uuid),
  quotidien.laisser_trajet_invite(uuid, uuid), quotidien.ajouter_enfant_invite(uuid, text),
  quotidien.inscrire_enfant_invite(uuid, uuid, uuid, boolean)
to anon, authenticated;

notify pgrst, 'reload schema';

commit;
