-- =========================================================================
-- Migration — Quotidien, Phases 3 et 4 : tâches de la maison et argent de
-- poche virtuel
--
-- Tout reste DANS LE FOYER : seuls ses membres (comptes du foyer) voient et
-- gèrent ses tâches et ses tirelires ; ni la famille, ni les groupes de
-- covoiturage n'y ont accès (règles RLS).
--
-- Tâches :
--   - ponctuelle (affichée jusqu'à ce qu'elle soit faite), quotidienne ou
--     certains jours de la semaine ;
--   - pour une personne, pour plusieurs à tour de rôle (rotation par jour
--     pour une tâche quotidienne, par semaine sinon), ou « qui veut » ;
--   - des points à gagner. Un parent coche « fait » : la réalisation est
--     validée et les points vont dans la tirelire de l'enfant. (L'état
--     « faite, à valider » servira à l'accès enfant, plus tard.)
--
-- Argent de poche : un compteur de POINTS par enfant, affiché avec
-- l'équivalent en euros (10 points = 1 € par défaut, réglable par foyer).
-- AUCUN argent réel : pas de paiement, pas de carte, pas de banque.
--   - versement hebdomadaire automatique (verser_argent_de_poche, appelée
--     par l'app à l'ouverture : rattrape les semaines manquées, 8 au plus) ;
--   - dépenses et bonus saisis par un parent ;
--   - objectif d'épargne facultatif.
-- Le solde est la somme des mouvements (jamais stocké à part).
--
-- Pré-requis : migrations quotidien précédentes.
-- =========================================================================

begin;

-- -------------------------------------------------------------------------
-- 1. Tables
-- -------------------------------------------------------------------------

create table quotidien.reglages_foyer (
  foyer_id uuid primary key references famille.foyers (id) on delete cascade,
  points_par_euro smallint not null default 10 check (points_par_euro between 1 and 1000),
  maj_le timestamptz not null default now()
);

create table quotidien.taches (
  id uuid primary key default gen_random_uuid(),
  foyer_id uuid not null references famille.foyers (id) on delete cascade,
  libelle text not null check (length(trim(libelle)) > 0),
  points integer not null default 0 check (points between 0 and 10000),
  recurrence text not null default 'aucune' check (recurrence in ('aucune', 'quotidienne', 'hebdomadaire')),
  -- Jours ISO (1 = lundi … 7 = dimanche) d'une tâche hebdomadaire.
  jours smallint[] not null default '{}',
  -- Personnes (famille.personnes) à qui elle revient, à tour de rôle ;
  -- vide = « qui veut ».
  personnes uuid[] not null default '{}',
  date_debut date not null default current_date,
  active boolean not null default true,
  cree_par uuid not null default auth.uid() references auth.users (id) on delete cascade,
  cree_le timestamptz not null default now(),
  check (recurrence <> 'hebdomadaire' or cardinality(jours) > 0),
  check (jours <@ array[1, 2, 3, 4, 5, 6, 7]::smallint[])
);
create index taches_foyer on quotidien.taches (foyer_id);

create table quotidien.realisations (
  id uuid primary key default gen_random_uuid(),
  tache_id uuid not null references quotidien.taches (id) on delete cascade,
  date date not null,
  personne_id uuid references famille.personnes (id) on delete set null,
  etat text not null default 'validee' check (etat in ('faite', 'validee')),
  cochee_par uuid references auth.users (id) on delete set null,
  validee_par uuid references auth.users (id) on delete set null,
  cree_le timestamptz not null default now(),
  unique (tache_id, date)
);

create table quotidien.tirelires (
  personne_id uuid primary key references famille.personnes (id) on delete cascade,
  foyer_id uuid not null references famille.foyers (id) on delete cascade,
  hebdomadaire integer not null default 0 check (hebdomadaire between 0 and 10000),
  -- Jour ISO du versement hebdomadaire (6 = samedi).
  jour_versement smallint not null default 6 check (jour_versement between 1 and 7),
  dernier_versement date not null default current_date,
  objectif_libelle text,
  objectif_points integer check (objectif_points is null or objectif_points > 0),
  maj_le timestamptz not null default now()
);
create index tirelires_foyer on quotidien.tirelires (foyer_id);

create table quotidien.mouvements (
  id uuid primary key default gen_random_uuid(),
  personne_id uuid not null references famille.personnes (id) on delete cascade,
  points integer not null check (points <> 0 and points between -100000 and 100000),
  libelle text not null,
  origine text not null check (origine in ('tache', 'hebdo', 'depense', 'bonus')),
  -- Annuler la réalisation annule ses points.
  realisation_id uuid unique references quotidien.realisations (id) on delete cascade,
  cree_par uuid references auth.users (id) on delete set null,
  cree_le timestamptz not null default now()
);
create index mouvements_personne on quotidien.mouvements (personne_id, cree_le desc);

-- -------------------------------------------------------------------------
-- 2. Fonctions d'accès
-- -------------------------------------------------------------------------

-- Personnes de mon foyer (avec ou sans compte).
create or replace function quotidien.personnes_de_mon_foyer()
returns setof uuid
language sql stable security definer
set search_path = quotidien, pg_temp
as $$
  select id from famille.personnes where foyer_id in (select famille.mes_foyers());
$$;

create or replace function quotidien.mon_foyer()
returns uuid
language sql stable security definer
set search_path = quotidien, pg_temp
as $$
  select famille.mes_foyers() limit 1;
$$;

create or replace function quotidien.points_par_euro()
returns smallint
language sql stable security definer
set search_path = quotidien, pg_temp
as $$
  select coalesce((select points_par_euro from quotidien.reglages_foyer where foyer_id = quotidien.mon_foyer()), 10::smallint);
$$;

-- -------------------------------------------------------------------------
-- 3. Règles RLS (foyer seulement)
-- -------------------------------------------------------------------------

alter table quotidien.reglages_foyer enable row level security;
alter table quotidien.taches enable row level security;
alter table quotidien.realisations enable row level security;
alter table quotidien.tirelires enable row level security;
alter table quotidien.mouvements enable row level security;

grant select on quotidien.reglages_foyer, quotidien.realisations, quotidien.tirelires, quotidien.mouvements to authenticated;
grant select, insert, update, delete on quotidien.taches to authenticated;
grant all on quotidien.reglages_foyer, quotidien.taches, quotidien.realisations, quotidien.tirelires, quotidien.mouvements to service_role;

create policy "Réglages de mon foyer" on quotidien.reglages_foyer
  for select using (foyer_id in (select famille.mes_foyers()));

create policy "Voir les tâches du foyer" on quotidien.taches
  for select using (foyer_id in (select famille.mes_foyers()));
create policy "Créer une tâche du foyer" on quotidien.taches
  for insert with check (
    foyer_id in (select famille.mes_foyers()) and cree_par = auth.uid()
    and personnes <@ array(select quotidien.personnes_de_mon_foyer())
  );
create policy "Modifier une tâche du foyer" on quotidien.taches
  for update using (foyer_id in (select famille.mes_foyers()))
  with check (
    foyer_id in (select famille.mes_foyers())
    and personnes <@ array(select quotidien.personnes_de_mon_foyer())
  );
create policy "Supprimer une tâche du foyer" on quotidien.taches
  for delete using (foyer_id in (select famille.mes_foyers()));

create policy "Voir les réalisations du foyer" on quotidien.realisations
  for select using (exists (
    select 1 from quotidien.taches t where t.id = tache_id and t.foyer_id in (select famille.mes_foyers())
  ));

create policy "Voir les tirelires du foyer" on quotidien.tirelires
  for select using (foyer_id in (select famille.mes_foyers()));

create policy "Voir les mouvements du foyer" on quotidien.mouvements
  for select using (personne_id in (select quotidien.personnes_de_mon_foyer()));

-- -------------------------------------------------------------------------
-- 4. Tâches du jour
-- -------------------------------------------------------------------------

-- Tâches dues un jour donné pour mon foyer, avec la personne de service
-- (rotation) et l'éventuelle réalisation.
-- [{ id, libelle, points, recurrence, pour, pour_prenom, candidats,
--    realisation: { id, etat, personne_id, prenom } | null }, …]
create or replace function quotidien.taches_du_jour(jour date)
returns json
language sql stable security definer
set search_path = quotidien, pg_temp
as $$
  with dues as (
    select t.*,
      case
        when cardinality(t.personnes) = 0 then null
        when cardinality(t.personnes) = 1 then t.personnes[1]
        else t.personnes[1 + (
          ((jour - t.date_debut) / (case when t.recurrence = 'quotidienne' then 1 else 7 end))
          % cardinality(t.personnes))]
      end as pour
    from quotidien.taches t
    where t.foyer_id = quotidien.mon_foyer() and t.active and jour >= t.date_debut
      and (
        t.recurrence = 'quotidienne'
        or (t.recurrence = 'hebdomadaire' and extract(isodow from jour)::smallint = any (t.jours))
        or (t.recurrence = 'aucune' and not exists (
              select 1 from quotidien.realisations r where r.tache_id = t.id and r.date < jour))
      )
  )
  select coalesce(json_agg(json_build_object(
    'id', d.id, 'libelle', d.libelle, 'points', d.points, 'recurrence', d.recurrence,
    'pour', d.pour,
    'pour_prenom', (select nullif(trim(p.prenom), '') from famille.personnes p where p.id = d.pour),
    'candidats', d.personnes,
    'realisation', (
      select json_build_object('id', r.id, 'etat', r.etat, 'personne_id', r.personne_id,
                               'prenom', (select nullif(trim(p.prenom), '') from famille.personnes p where p.id = r.personne_id))
      from quotidien.realisations r where r.tache_id = d.id and r.date = jour)
  ) order by d.libelle), '[]'::json)
  from dues d;
$$;

-- Un parent coche « fait » : réalisation validée, points dans la tirelire.
create or replace function quotidien.marquer_faite(id_tache uuid, jour date, id_personne uuid)
returns uuid
language plpgsql security definer
set search_path = quotidien, pg_temp
as $$
declare
  t quotidien.taches;
  r uuid;
begin
  select * into t from quotidien.taches where id = id_tache and foyer_id in (select famille.mes_foyers());
  if t.id is null then
    raise exception 'Tâche introuvable';
  end if;
  if id_personne is null or id_personne not in (select quotidien.personnes_de_mon_foyer()) then
    raise exception 'Choisissez qui a fait la tâche';
  end if;
  if jour > current_date then
    raise exception 'On ne peut pas cocher une tâche à l''avance';
  end if;
  begin
    insert into quotidien.realisations (tache_id, date, personne_id, etat, cochee_par, validee_par)
    values (id_tache, jour, id_personne, 'validee', auth.uid(), auth.uid())
    returning id into r;
  exception when unique_violation then
    raise exception 'Cette tâche est déjà faite';
  end;
  if t.points > 0 then
    insert into quotidien.mouvements (personne_id, points, libelle, origine, realisation_id, cree_par)
    values (id_personne, t.points, 'Tâche : ' || t.libelle, 'tache', r, auth.uid());
  end if;
  return r;
end;
$$;

-- Annuler une réalisation (et ses points).
create or replace function quotidien.annuler_realisation(id_realisation uuid)
returns void
language plpgsql security definer
set search_path = quotidien, pg_temp
as $$
begin
  delete from quotidien.realisations r
  using quotidien.taches t
  where r.id = id_realisation and t.id = r.tache_id and t.foyer_id in (select famille.mes_foyers());
  if not found then
    raise exception 'Réalisation introuvable';
  end if;
end;
$$;

-- -------------------------------------------------------------------------
-- 5. Argent de poche
-- -------------------------------------------------------------------------

create or replace function quotidien.definir_points_par_euro(n smallint)
returns void
language plpgsql security definer
set search_path = quotidien, pg_temp
as $$
declare
  f uuid := quotidien.mon_foyer();
begin
  if f is null then
    raise exception 'Créez ou rejoignez d''abord votre foyer';
  end if;
  insert into quotidien.reglages_foyer (foyer_id, points_par_euro) values (f, n)
  on conflict (foyer_id) do update set points_par_euro = excluded.points_par_euro, maj_le = now();
end;
$$;

-- Crée ou règle la tirelire d'un enfant du foyer.
create or replace function quotidien.definir_tirelire(
  id_personne uuid, points_semaine integer, jour smallint default 6,
  objectif text default null, points_objectif integer default null)
returns void
language plpgsql security definer
set search_path = quotidien, pg_temp
as $$
begin
  if id_personne not in (select quotidien.personnes_de_mon_foyer()) then
    raise exception 'Cette personne ne fait pas partie de votre foyer';
  end if;
  insert into quotidien.tirelires (personne_id, foyer_id, hebdomadaire, jour_versement, objectif_libelle, objectif_points)
  values (id_personne, quotidien.mon_foyer(), points_semaine, jour, nullif(trim(objectif), ''), points_objectif)
  on conflict (personne_id) do update set
    hebdomadaire = excluded.hebdomadaire, jour_versement = excluded.jour_versement,
    objectif_libelle = excluded.objectif_libelle, objectif_points = excluded.objectif_points, maj_le = now();
end;
$$;

-- Dépense (points négatifs) ou bonus (positifs), saisis par un parent.
create or replace function quotidien.ajouter_mouvement(id_personne uuid, nb_points integer, texte text)
returns void
language plpgsql security definer
set search_path = quotidien, pg_temp
as $$
begin
  if id_personne not in (select quotidien.personnes_de_mon_foyer()) then
    raise exception 'Cette personne ne fait pas partie de votre foyer';
  end if;
  if coalesce(nb_points, 0) = 0 then
    raise exception 'Indiquez un montant';
  end if;
  insert into quotidien.mouvements (personne_id, points, libelle, origine, cree_par)
  values (id_personne, nb_points, coalesce(nullif(trim(texte), ''), case when nb_points < 0 then 'Dépense' else 'Bonus' end),
          case when nb_points < 0 then 'depense' else 'bonus' end, auth.uid());
end;
$$;

-- Retirer une dépense ou un bonus saisi par erreur (les points d'une tâche
-- s'annulent avec la tâche, ceux de la semaine restent).
create or replace function quotidien.retirer_mouvement(id_mouvement uuid)
returns void
language plpgsql security definer
set search_path = quotidien, pg_temp
as $$
begin
  delete from quotidien.mouvements
  where id = id_mouvement and origine in ('depense', 'bonus')
    and personne_id in (select quotidien.personnes_de_mon_foyer());
  if not found then
    raise exception 'Mouvement introuvable';
  end if;
end;
$$;

-- Versements hebdomadaires dus depuis le dernier (8 semaines au plus).
-- Renvoie le nombre de versements faits. Sans risque à rappeler.
create or replace function quotidien.verser_argent_de_poche()
returns integer
language plpgsql security definer
set search_path = quotidien, pg_temp
as $$
declare
  t quotidien.tirelires;
  d date;
  n integer := 0;
  k integer;
begin
  for t in
    select * from quotidien.tirelires
    where foyer_id in (select famille.mes_foyers()) and hebdomadaire > 0
    for update
  loop
    d := greatest(t.dernier_versement, current_date - 56);
    k := 0;
    loop
      -- Prochain jour de versement après d.
      d := d + 1 + ((t.jour_versement - extract(isodow from d + 1)::int + 7) % 7);
      exit when d > current_date;
      insert into quotidien.mouvements (personne_id, points, libelle, origine, cree_le)
      values (t.personne_id, t.hebdomadaire, 'Argent de poche de la semaine', 'hebdo', d::timestamptz + interval '8 hours');
      update quotidien.tirelires set dernier_versement = d where personne_id = t.personne_id;
      k := k + 1;
      n := n + 1;
      exit when k >= 8;
    end loop;
  end loop;
  return n;
end;
$$;

-- Soldes des personnes de mon foyer : [{ personne_id, solde }].
create or replace function quotidien.soldes()
returns table (personne_id uuid, solde bigint)
language sql stable security definer
set search_path = quotidien, pg_temp
as $$
  select m.personne_id, sum(m.points)
  from quotidien.mouvements m
  where m.personne_id in (select quotidien.personnes_de_mon_foyer())
  group by m.personne_id;
$$;

-- -------------------------------------------------------------------------
-- 6. Droits
-- -------------------------------------------------------------------------

revoke execute on function
  quotidien.personnes_de_mon_foyer(), quotidien.mon_foyer(), quotidien.points_par_euro(),
  quotidien.taches_du_jour(date), quotidien.marquer_faite(uuid, date, uuid), quotidien.annuler_realisation(uuid),
  quotidien.definir_points_par_euro(smallint),
  quotidien.definir_tirelire(uuid, integer, smallint, text, integer),
  quotidien.ajouter_mouvement(uuid, integer, text), quotidien.retirer_mouvement(uuid),
  quotidien.verser_argent_de_poche(), quotidien.soldes()
from public;
grant execute on function
  quotidien.personnes_de_mon_foyer(), quotidien.mon_foyer(), quotidien.points_par_euro(),
  quotidien.taches_du_jour(date), quotidien.marquer_faite(uuid, date, uuid), quotidien.annuler_realisation(uuid),
  quotidien.definir_points_par_euro(smallint),
  quotidien.definir_tirelire(uuid, integer, smallint, text, integer),
  quotidien.ajouter_mouvement(uuid, integer, text), quotidien.retirer_mouvement(uuid),
  quotidien.verser_argent_de_poche(), quotidien.soldes()
to authenticated;

notify pgrst, 'reload schema';

commit;
