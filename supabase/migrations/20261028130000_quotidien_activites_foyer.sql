-- =========================================================================
-- Migration — Quotidien : activités du foyer (ex-Trajets)
--
-- Refonte Quotidien § 5 et § 9.3. L'onglet « Activités » est centré sur le
-- FOYER : les activités récurrentes des enfants et QUI s'en occupe pour
-- l'aller et pour le retour. Le covoiturage avec d'autres familles reste,
-- au second plan.
--
--   - Chaque foyer a un GROUPE PRIVÉ (« Notre foyer »), créé à la demande
--     par groupe_du_foyer(). Il porte les activités qui ne sont pas
--     partagées, ce qui réutilise activites, seances, trajets et la
--     génération des séances hors vacances. On ne peut pas le rejoindre : un
--     code ne peut pas être créé pour lui, et aucun autre foyer ne peut y
--     entrer. Les enfants du foyer (personnes sans compte) y sont ajoutés.
--   - Une activité a des responsables PAR DÉFAUT : aller_par et retour_par
--     (personnes du foyer), et, pour une semaine sur deux, aller_par_alt et
--     retour_par_alt (semaines ISO paires). avance_aller = temps entre le
--     départ de l'aller et le début de l'activité.
--   - Un trajet a un responsable du foyer (responsable_id, une personne). Il
--     peut aussi avoir un conducteur d'une autre famille (conducteur_id,
--     existant, participant d'un groupe partagé).
--   - activite_enfants : les enfants concernés par une activité ; ils sont
--     inscrits d'office sur ses trajets.
--   - definir_responsable : choisir qui s'occupe d'un trajet (un adulte de
--     mon foyer, une autre famille du groupe, ou personne).
--   - modifier_responsables_activite : change les responsables par défaut
--     d'une activité et de ses séances à venir (sans écraser un choix fait
--     à la main).
--   - activites_semaine(lundi) : les séances de la semaine de mes enfants,
--     avec le responsable de chaque trajet. Dans un groupe partagé, les
--     autres familles ne voient que « pris par la famille X », jamais le
--     prénom de l'adulte.
--
-- AJOUT SEULEMENT : colonnes facultatives, nouvelle table, nouvelles
-- fonctions. Le déclencheur qui crée les deux trajets d'une séance est
-- recréé à l'identique pour les activités existantes (aller à l'heure de
-- début, sans responsable). avance_aller vaut 0 par défaut : le formulaire
-- de l'app Famille envoie 20 minutes pour les nouvelles activités.
--
-- Pré-requis : 20261008100000_quotidien_planning.sql (accepter_trajet,
-- propose) et 20261008110000_quotidien_taches_argent.sql (mon_foyer).
-- =========================================================================

begin;

-- -------------------------------------------------------------------------
-- 1. Colonnes et table
-- -------------------------------------------------------------------------

alter table quotidien.groupes
  add column if not exists foyer_prive uuid unique references famille.foyers (id) on delete cascade;

alter table quotidien.activites
  add column if not exists aller_par uuid references famille.personnes (id) on delete set null,
  add column if not exists retour_par uuid references famille.personnes (id) on delete set null,
  add column if not exists aller_par_alt uuid references famille.personnes (id) on delete set null,
  add column if not exists retour_par_alt uuid references famille.personnes (id) on delete set null,
  add column if not exists avance_aller interval not null default '0 minutes'
    check (avance_aller >= interval '0 minutes' and avance_aller <= interval '3 hours');

alter table quotidien.trajets
  add column if not exists responsable_id uuid references famille.personnes (id) on delete set null;

create table if not exists quotidien.activite_enfants (
  activite_id uuid not null references quotidien.activites (id) on delete cascade,
  enfant_id uuid not null references quotidien.enfants (id) on delete cascade,
  primary key (activite_id, enfant_id)
);
create index if not exists activite_enfants_enfant on quotidien.activite_enfants (enfant_id);

alter table quotidien.activite_enfants enable row level security;
grant select, insert, delete on quotidien.activite_enfants to authenticated;
grant all on quotidien.activite_enfants to service_role;

drop policy if exists "Voir les enfants des activités" on quotidien.activite_enfants;
create policy "Voir les enfants des activités" on quotidien.activite_enfants
  for select using (quotidien.est_membre(quotidien.groupe_d_activite(activite_id)));
drop policy if exists "Inscrire mes enfants à une activité" on quotidien.activite_enfants;
create policy "Inscrire mes enfants à une activité" on quotidien.activite_enfants
  for insert with check (
    quotidien.est_membre(quotidien.groupe_d_activite(activite_id))
    and enfant_id in (select e.id from quotidien.enfants e where e.participant_id in (select quotidien.mes_participants()))
  );
drop policy if exists "Retirer mes enfants d'une activité" on quotidien.activite_enfants;
create policy "Retirer mes enfants d'une activité" on quotidien.activite_enfants
  for delete using (
    enfant_id in (select e.id from quotidien.enfants e where e.participant_id in (select quotidien.mes_participants()))
    or quotidien.est_membre(quotidien.groupe_d_activite(activite_id))
  );

-- -------------------------------------------------------------------------
-- 2. Le groupe privé du foyer
-- -------------------------------------------------------------------------

-- Personne ne peut y entrer : ni code, ni autre foyer, ni invité.
create or replace function quotidien.verifier_groupe_prive_participant()
returns trigger
language plpgsql security definer
set search_path = quotidien, pg_temp
as $$
declare
  prive uuid;
begin
  select foyer_prive into prive from quotidien.groupes where id = new.groupe_id;
  if prive is not null and new.foyer_id is distinct from prive then
    raise exception 'Ce groupe est celui de votre foyer : on ne peut pas y inviter.';
  end if;
  return new;
end;
$$;

drop trigger if exists participants_groupe_prive on quotidien.participants;
create trigger participants_groupe_prive
  before insert on quotidien.participants
  for each row execute function quotidien.verifier_groupe_prive_participant();

create or replace function quotidien.verifier_groupe_prive_code()
returns trigger
language plpgsql security definer
set search_path = quotidien, pg_temp
as $$
begin
  if exists (select 1 from quotidien.groupes where id = new.groupe_id and foyer_prive is not null) then
    raise exception 'Ce groupe est celui de votre foyer : il n''a pas de code.';
  end if;
  return new;
end;
$$;

drop trigger if exists codes_groupe_prive on quotidien.codes_groupe;
create trigger codes_groupe_prive
  before insert on quotidien.codes_groupe
  for each row execute function quotidien.verifier_groupe_prive_code();

-- Crée (ou renvoie) le groupe privé de mon foyer, avec ses enfants.
create or replace function quotidien.groupe_du_foyer()
returns uuid
language plpgsql security definer
set search_path = quotidien, pg_temp
as $$
declare
  f uuid := quotidien.mon_foyer();
  g uuid;
  part uuid;
begin
  if auth.uid() is null then
    raise exception 'Vous devez être connecté';
  end if;
  if f is null then
    raise exception 'Créez ou rejoignez d''abord votre foyer';
  end if;
  select id into g from quotidien.groupes where foyer_prive = f;
  if g is null then
    -- Le déclencheur groupes_participer ajoute le foyer comme participant.
    insert into quotidien.groupes (nom, cree_par, foyer_prive)
    values ('Notre foyer', auth.uid(), f)
    returning id into g;
  end if;
  select id into part from quotidien.participants where groupe_id = g and foyer_id = f;
  if part is not null then
    update quotidien.participants set parti_le = null where id = part and parti_le is not null;
    insert into quotidien.enfants (participant_id, personne_id, prenom)
    select part, p.id, coalesce(nullif(trim(p.prenom), ''), 'Enfant')
    from famille.personnes p
    where p.foyer_id = f and p.utilisateur_id is null
      and not exists (select 1 from quotidien.enfants e where e.participant_id = part and e.personne_id = p.id);
  end if;
  return g;
end;
$$;

-- -------------------------------------------------------------------------
-- 3. Les deux trajets d'une séance : responsables par défaut
-- -------------------------------------------------------------------------

-- Remplace la version de 20261007120000 (même nom de fonction, donc même
-- déclencheur seances_trajets). Pour une activité sans responsable ni
-- enfant ni avance, le résultat est identique à avant.
create or replace function quotidien.creer_trajets_de_seance()
returns trigger
language plpgsql security definer
set search_path = quotidien, pg_temp
as $$
declare
  a quotidien.activites;
  prive boolean;
  paire boolean;
  r_aller uuid;
  r_retour uuid;
  h_aller time;
begin
  select * into a from quotidien.activites where id = new.activite_id;
  select (foyer_prive is not null) into prive from quotidien.groupes where id = a.groupe_id;

  -- Semaine ISO paire : on prend le responsable « une semaine sur deux » s'il existe.
  paire := extract(week from new.date)::int % 2 = 0;
  r_aller := case when paire and a.aller_par_alt is not null then a.aller_par_alt else a.aller_par end;
  r_retour := case when paire and a.retour_par_alt is not null then a.retour_par_alt else a.retour_par end;
  h_aller := case when new.heure_debut > time '00:00' + a.avance_aller then new.heure_debut - a.avance_aller else new.heure_debut end;

  insert into quotidien.trajets (seance_id, sens, heure, responsable_id)
  values (new.id, 'aller', h_aller, r_aller), (new.id, 'retour', new.heure_fin, r_retour)
  on conflict do nothing;

  -- Groupe partagé : la famille du responsable est aussi le conducteur, pour
  -- que les autres familles voient « pris par la famille X ».
  if not coalesce(prive, false) then
    update quotidien.trajets t
    set conducteur_id = (
      select p.id from quotidien.participants p
      join famille.personnes pe on pe.foyer_id = p.foyer_id
      where pe.id = t.responsable_id and p.groupe_id = a.groupe_id and p.parti_le is null
      limit 1)
    where t.seance_id = new.id and t.responsable_id is not null and t.conducteur_id is null;
  end if;

  -- Enfants de l'activité : inscrits d'office sur les deux trajets.
  insert into quotidien.trajet_enfants (trajet_id, enfant_id)
  select t.id, ae.enfant_id
  from quotidien.trajets t
  join quotidien.activite_enfants ae on ae.activite_id = new.activite_id
  where t.seance_id = new.id
  on conflict do nothing;

  return new;
end;
$$;

-- -------------------------------------------------------------------------
-- 4. Choisir qui s'occupe d'un trajet
-- -------------------------------------------------------------------------

-- Trois cas, un seul paramètre renseigné au plus :
--   - id_personne : un adulte (avec compte) de MON foyer ;
--   - id_participant : une famille du groupe. La mienne : je prends le
--     trajet. Une autre : je la propose, elle devra accepter
--     (accepter_trajet, comme pour une proposition du planning) ;
--   - aucun des deux : « personne » (seulement si le trajet n'est pas pris
--     par une autre famille).
create or replace function quotidien.definir_responsable(
  id_trajet uuid,
  id_personne uuid default null,
  id_participant uuid default null
)
returns void
language plpgsql security definer
set search_path = quotidien, pg_temp
as $$
declare
  g uuid := quotidien.groupe_de_trajet(id_trajet);
  moi uuid := quotidien.mon_participant(g);
  prive boolean;
  t quotidien.trajets;
begin
  if g is null or moi is null then
    raise exception 'Vous ne faites pas partie de ce groupe';
  end if;
  if id_personne is not null and id_participant is not null then
    raise exception 'Choisissez une seule personne.';
  end if;
  select (foyer_prive is not null) into prive from quotidien.groupes where id = g;
  select * into t from quotidien.trajets where id = id_trajet;

  -- Déjà pris par une autre famille (et accepté) : on ne le reprend pas.
  if t.conducteur_id is not null and t.conducteur_id <> moi and not t.propose then
    raise exception 'Quelqu''un d''une autre famille conduit déjà ce trajet.';
  end if;

  if id_personne is not null then
    if not exists (
      select 1 from famille.personnes p
      where p.id = id_personne and p.utilisateur_id is not null and p.foyer_id in (select famille.mes_foyers())
    ) then
      raise exception 'Cette personne n''est pas un adulte de votre foyer.';
    end if;
    update quotidien.trajets
    set responsable_id = id_personne, conducteur_id = case when prive then null else moi end, propose = false
    where id = id_trajet;
  elsif id_participant is not null then
    if prive then
      raise exception 'Ce groupe est celui de votre foyer : choisissez un adulte du foyer.';
    end if;
    if quotidien.groupe_de_participant(id_participant) is distinct from g then
      raise exception 'Cette famille ne fait pas partie du groupe.';
    end if;
    if id_participant = moi then
      update quotidien.trajets set responsable_id = null, conducteur_id = moi, propose = false where id = id_trajet;
    else
      update quotidien.trajets set responsable_id = null, conducteur_id = id_participant, propose = true where id = id_trajet;
    end if;
  else
    update quotidien.trajets set responsable_id = null, conducteur_id = null, propose = false where id = id_trajet;
  end if;
end;
$$;

-- -------------------------------------------------------------------------
-- 5. Changer les responsables par défaut d'une activité
-- -------------------------------------------------------------------------

-- Met à jour l'activité et ses séances À VENIR : un trajet change seulement
-- s'il avait encore l'ancien responsable par défaut de sa semaine (un choix
-- fait à la main sur une séance n'est jamais écrasé).
create or replace function quotidien.modifier_responsables_activite(
  id_activite uuid,
  p_aller uuid,
  p_retour uuid,
  p_aller_alt uuid,
  p_retour_alt uuid,
  p_avance interval default null
)
returns void
language plpgsql security definer
set search_path = quotidien, pg_temp
as $$
declare
  a quotidien.activites;
  prive boolean;
  s record;
  paire boolean;
  ancien_a uuid;
  ancien_r uuid;
  nouveau_a uuid;
  nouveau_r uuid;
  t record;
  nouveau uuid;
  ancien uuid;
  moi uuid;
begin
  select * into a from quotidien.activites where id = id_activite;
  if a.id is null or not quotidien.est_membre(a.groupe_id) then
    raise exception 'Activité introuvable';
  end if;
  if exists (
    select 1 from unnest(array[p_aller, p_retour, p_aller_alt, p_retour_alt]) x(id)
    where x.id is not null and not exists (
      select 1 from famille.personnes p
      where p.id = x.id and p.utilisateur_id is not null and p.foyer_id in (select famille.mes_foyers()))
  ) then
    raise exception 'Les responsables doivent être des adultes de votre foyer.';
  end if;
  select (foyer_prive is not null) into prive from quotidien.groupes where id = a.groupe_id;
  moi := quotidien.mon_participant(a.groupe_id);

  update quotidien.activites
  set aller_par = p_aller, retour_par = p_retour, aller_par_alt = p_aller_alt, retour_par_alt = p_retour_alt,
      avance_aller = coalesce(p_avance, avance_aller)
  where id = id_activite;

  for s in
    select se.id, se.date from quotidien.seances se
    where se.activite_id = id_activite and se.date >= quotidien.aujourd_hui_paris() and se.statut = 'prevue'
  loop
    paire := extract(week from s.date)::int % 2 = 0;
    ancien_a := case when paire and a.aller_par_alt is not null then a.aller_par_alt else a.aller_par end;
    ancien_r := case when paire and a.retour_par_alt is not null then a.retour_par_alt else a.retour_par end;
    nouveau_a := case when paire and p_aller_alt is not null then p_aller_alt else p_aller end;
    nouveau_r := case when paire and p_retour_alt is not null then p_retour_alt else p_retour end;
    for t in select id, sens, responsable_id, conducteur_id from quotidien.trajets where seance_id = s.id loop
      ancien := case when t.sens = 'aller' then ancien_a else ancien_r end;
      nouveau := case when t.sens = 'aller' then nouveau_a else nouveau_r end;
      if t.responsable_id is not distinct from ancien and (t.conducteur_id is null or t.conducteur_id = moi) then
        update quotidien.trajets
        set responsable_id = nouveau,
            conducteur_id = case when prive or nouveau is null then null else moi end
        where id = t.id;
      end if;
    end loop;
  end loop;
end;
$$;

-- -------------------------------------------------------------------------
-- 6. La semaine des activités de mes enfants
-- -------------------------------------------------------------------------

create or replace function quotidien.activites_semaine(lundi date)
returns json
language sql stable security definer
set search_path = quotidien, pg_temp
as $$
  with mes_parts as (select quotidien.mes_participants() as id),
  mes_enfants as (
    select e.id from quotidien.enfants e where e.participant_id in (select id from mes_parts)
  ),
  vues as (
    select s.*, a.nom as activite_nom, a.groupe_id, coalesce(s.lieu, a.lieu) as lieu_affiche,
           (g.foyer_prive is null) as partage
    from quotidien.seances s
    join quotidien.activites a on a.id = s.activite_id
    join quotidien.groupes g on g.id = a.groupe_id
    where s.date between lundi and lundi + 6
      and quotidien.est_membre(a.groupe_id)
      and (
        g.foyer_prive is not null
        or exists (
          select 1 from quotidien.trajets t
          join quotidien.trajet_enfants te on te.trajet_id = t.id
          where t.seance_id = s.id and te.enfant_id in (select id from mes_enfants))
        or exists (
          select 1 from quotidien.trajets t
          where t.seance_id = s.id and t.conducteur_id in (select id from mes_parts))
      )
  )
  select coalesce(json_agg(json_build_object(
    'seance_id', v.id,
    'date', v.date,
    'heure_debut', v.heure_debut,
    'heure_fin', v.heure_fin,
    'statut', v.statut,
    'activite_id', v.activite_id,
    'activite', v.activite_nom,
    'lieu', v.lieu_affiche,
    'groupe_id', v.groupe_id,
    'partage', v.partage,
    'enfants', coalesce((
      select json_agg(x.prenom order by x.prenom)
      from (
        select distinct e.prenom
        from quotidien.trajets t
        join quotidien.trajet_enfants te on te.trajet_id = t.id
        join quotidien.enfants e on e.id = te.enfant_id
        where t.seance_id = v.id and e.id in (select id from mes_enfants)
      ) x), '[]'::json),
    'trajets', coalesce((
      select json_agg(json_build_object(
        'id', t.id,
        'sens', t.sens,
        'heure', t.heure,
        'propose', t.propose,
        -- Le prénom de l'adulte n'est donné que pour mon foyer.
        'responsable_id', case when r.foyer_id in (select famille.mes_foyers()) then t.responsable_id end,
        'responsable', case when r.foyer_id in (select famille.mes_foyers()) then nullif(trim(r.prenom), '') end,
        'moi', coalesce(r.utilisateur_id = auth.uid(), false),
        'conducteur_id', t.conducteur_id,
        'conducteur', case when t.conducteur_id is not null and t.conducteur_id not in (select id from mes_parts)
          then (select p.nom_affiche from quotidien.participants p where p.id = t.conducteur_id) end,
        'foyer', t.conducteur_id in (select id from mes_parts) and t.responsable_id is null,
        'vide', t.responsable_id is null and t.conducteur_id is null
      ) order by t.sens)
      from quotidien.trajets t
      left join famille.personnes r on r.id = t.responsable_id
      where t.seance_id = v.id), '[]'::json)
  ) order by v.date, v.heure_debut), '[]'::json)
  from vues v;
$$;

revoke all on function
  quotidien.groupe_du_foyer(),
  quotidien.definir_responsable(uuid, uuid, uuid),
  quotidien.modifier_responsables_activite(uuid, uuid, uuid, uuid, uuid, interval),
  quotidien.activites_semaine(date)
from public, anon;
grant execute on function
  quotidien.groupe_du_foyer(),
  quotidien.definir_responsable(uuid, uuid, uuid),
  quotidien.modifier_responsables_activite(uuid, uuid, uuid, uuid, uuid, interval),
  quotidien.activites_semaine(date)
to authenticated;

commit;
