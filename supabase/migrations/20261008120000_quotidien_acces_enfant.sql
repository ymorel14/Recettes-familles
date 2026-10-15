-- =========================================================================
-- Migration — Quotidien, Phase 5 : accès enfant
--
-- Un enfant (mineur, sans compte ni email) reçoit de ses parents un LIEN
-- personnel (<site>/quotidien/enfant/<jeton>) : il y voit ses tâches du
-- jour, appuie sur « J'ai fini », et suit sa tirelire. Rien d'autre : ni
-- les autres membres du foyer (sauf le prénom de qui a fait une tâche
-- « qui veut »), ni la famille, ni les trajets.
--
-- C'est un parent qui crée le lien (consentement parental), le renvoie ou
-- le retire ; un nouveau lien remplace l'ancien.
--
-- « J'ai fini » enregistre une réalisation « faite » SANS points ; un
-- parent la valide (valider_realisation : points crédités) ou la refuse
-- (annuler_realisation). Les dates de l'enfant sont celles de Paris.
--
-- Pré-requis : migration 20261008110000_quotidien_taches_argent.
-- =========================================================================

begin;

create table quotidien.acces_enfants (
  personne_id uuid primary key references famille.personnes (id) on delete cascade,
  jeton uuid not null unique default gen_random_uuid(),
  cree_par uuid references auth.users (id) on delete set null,
  cree_le timestamptz not null default now()
);
-- Aucune lecture directe : accès par fonctions seulement.
alter table quotidien.acces_enfants enable row level security;
revoke all on quotidien.acces_enfants from anon, authenticated;
grant all on quotidien.acces_enfants to service_role;

-- -------------------------------------------------------------------------
-- 1. Tâches du jour d'un foyer (commun aux parents et à l'enfant)
-- -------------------------------------------------------------------------

create or replace function quotidien.taches_du_jour_foyer(id_foyer uuid, jour date)
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
    where t.foyer_id = id_foyer and t.active and jour >= t.date_debut
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


create or replace function quotidien.taches_du_jour(jour date)
returns json
language sql stable security definer
set search_path = quotidien, pg_temp
as $$
  select quotidien.taches_du_jour_foyer(quotidien.mon_foyer(), jour);
$$;

-- -------------------------------------------------------------------------
-- 2. Lien de l'enfant (côté parent)
-- -------------------------------------------------------------------------

-- Crée le lien de l'enfant, ou en fait un nouveau (l'ancien ne marche plus).
create or replace function quotidien.creer_acces_enfant(id_personne uuid)
returns uuid
language plpgsql security definer
set search_path = quotidien, pg_temp
as $$
declare
  j uuid;
begin
  if id_personne not in (select quotidien.personnes_de_mon_foyer())
     or exists (select 1 from famille.personnes where id = id_personne and utilisateur_id is not null) then
    raise exception 'Seul un enfant sans compte de votre foyer peut avoir un lien';
  end if;
  insert into quotidien.acces_enfants (personne_id, cree_par) values (id_personne, auth.uid())
  on conflict (personne_id) do update set jeton = gen_random_uuid(), cree_par = auth.uid(), cree_le = now()
  returning jeton into j;
  return j;
end;
$$;

create or replace function quotidien.lien_acces_enfant(id_personne uuid)
returns uuid
language sql stable security definer
set search_path = quotidien, pg_temp
as $$
  select a.jeton from quotidien.acces_enfants a
  where a.personne_id = id_personne and id_personne in (select quotidien.personnes_de_mon_foyer());
$$;

create or replace function quotidien.retirer_acces_enfant(id_personne uuid)
returns void
language sql security definer
set search_path = quotidien, pg_temp
as $$
  delete from quotidien.acces_enfants
  where personne_id = id_personne and id_personne in (select quotidien.personnes_de_mon_foyer());
$$;

-- -------------------------------------------------------------------------
-- 3. Ce que voit et fait l'enfant (par son jeton)
-- -------------------------------------------------------------------------

create or replace function quotidien.enfant_du_jeton(jeton_enfant uuid)
returns uuid
language sql stable security definer
set search_path = quotidien, pg_temp
as $$
  select personne_id from quotidien.acces_enfants where jeton = jeton_enfant;
$$;

-- Aujourd'hui à Paris.
create or replace function quotidien.aujourd_hui_paris()
returns date
language sql stable
as $$
  select (now() at time zone 'Europe/Paris')::date;
$$;

-- { prenom, points_par_euro, taches: [...], solde, objectif_libelle,
--   objectif_points, hebdomadaire, mouvements: [...] }
create or replace function quotidien.vue_enfant(jeton_enfant uuid)
returns json
language plpgsql stable security definer
set search_path = quotidien, pg_temp
as $$
declare
  e uuid := quotidien.enfant_du_jeton(jeton_enfant);
  f uuid;
  jour date := quotidien.aujourd_hui_paris();
begin
  if e is null then
    raise exception 'Lien invalide ou expiré';
  end if;
  select foyer_id into f from famille.personnes where id = e;
  return json_build_object(
    'prenom', (select nullif(trim(prenom), '') from famille.personnes where id = e),
    'points_par_euro', coalesce((select points_par_euro from quotidien.reglages_foyer where foyer_id = f), 10),
    'taches', coalesce((
      select json_agg(x)
      from jsonb_array_elements(quotidien.taches_du_jour_foyer(f, jour)::jsonb) x
      where x->>'pour' = e::text
         or (x->>'pour' is null and (jsonb_array_length(x->'candidats') = 0 or x->'candidats' ? e::text))
    ), '[]'::json),
    'solde', coalesce((select sum(points) from quotidien.mouvements where personne_id = e), 0),
    'hebdomadaire', (select hebdomadaire from quotidien.tirelires where personne_id = e),
    'objectif_libelle', (select objectif_libelle from quotidien.tirelires where personne_id = e),
    'objectif_points', (select objectif_points from quotidien.tirelires where personne_id = e),
    'mouvements', coalesce((
      select json_agg(json_build_object('id', m.id, 'points', m.points, 'libelle', m.libelle, 'cree_le', m.cree_le)
                      order by m.cree_le desc)
      from (select * from quotidien.mouvements where personne_id = e order by cree_le desc limit 10) m
    ), '[]'::json)
  );
end;
$$;

-- « J'ai fini » : réalisation à valider par un parent (pas encore de points).
create or replace function quotidien.marquer_faite_enfant(jeton_enfant uuid, id_tache uuid)
returns void
language plpgsql security definer
set search_path = quotidien, pg_temp
as $$
declare
  e uuid := quotidien.enfant_du_jeton(jeton_enfant);
  jour date := quotidien.aujourd_hui_paris();
  f uuid;
begin
  if e is null then
    raise exception 'Lien invalide ou expiré';
  end if;
  select foyer_id into f from famille.personnes where id = e;
  -- La tâche doit être due aujourd'hui et pour cet enfant (ou « qui veut »).
  if not exists (
    select 1 from jsonb_array_elements(quotidien.taches_du_jour_foyer(f, jour)::jsonb) x
    where x->>'id' = id_tache::text
      and (x->>'pour' = e::text
           or (x->>'pour' is null and (jsonb_array_length(x->'candidats') = 0 or x->'candidats' ? e::text)))
  ) then
    raise exception 'Cette tâche n''est pas pour toi aujourd''hui';
  end if;
  begin
    insert into quotidien.realisations (tache_id, date, personne_id, etat)
    values (id_tache, jour, e, 'faite');
  exception when unique_violation then
    raise exception 'Cette tâche est déjà faite';
  end;
end;
$$;

-- L'enfant s'est trompé : il retire son « j'ai fini » tant qu'il n'est pas validé.
create or replace function quotidien.annuler_faite_enfant(jeton_enfant uuid, id_tache uuid)
returns void
language plpgsql security definer
set search_path = quotidien, pg_temp
as $$
declare
  e uuid := quotidien.enfant_du_jeton(jeton_enfant);
begin
  delete from quotidien.realisations
  where tache_id = id_tache and date = quotidien.aujourd_hui_paris()
    and personne_id = e and etat = 'faite' and e is not null;
  if not found then
    raise exception 'Rien à annuler';
  end if;
end;
$$;

-- -------------------------------------------------------------------------
-- 4. Validation par un parent
-- -------------------------------------------------------------------------

create or replace function quotidien.valider_realisation(id_realisation uuid)
returns void
language plpgsql security definer
set search_path = quotidien, pg_temp
as $$
declare
  r quotidien.realisations;
  t quotidien.taches;
begin
  select * into r from quotidien.realisations where id = id_realisation;
  select * into t from quotidien.taches where id = r.tache_id and foyer_id in (select famille.mes_foyers());
  if r.id is null or t.id is null then
    raise exception 'Réalisation introuvable';
  end if;
  if r.etat = 'validee' then
    return;
  end if;
  update quotidien.realisations set etat = 'validee', validee_par = auth.uid() where id = r.id;
  if t.points > 0 and r.personne_id is not null then
    insert into quotidien.mouvements (personne_id, points, libelle, origine, realisation_id, cree_par)
    values (r.personne_id, t.points, 'Tâche : ' || t.libelle, 'tache', r.id, auth.uid());
  end if;
end;
$$;

-- Tâches « faites » en attente de validation, pour mon foyer.
create or replace function quotidien.a_valider()
returns integer
language sql stable security definer
set search_path = quotidien, pg_temp
as $$
  select count(*)::int from quotidien.realisations r
  join quotidien.taches t on t.id = r.tache_id
  where r.etat = 'faite' and t.foyer_id = quotidien.mon_foyer();
$$;

-- -------------------------------------------------------------------------
-- 5. Droits
-- -------------------------------------------------------------------------

revoke execute on function
  quotidien.taches_du_jour_foyer(uuid, date), quotidien.enfant_du_jeton(uuid),
  quotidien.creer_acces_enfant(uuid), quotidien.lien_acces_enfant(uuid), quotidien.retirer_acces_enfant(uuid),
  quotidien.vue_enfant(uuid), quotidien.marquer_faite_enfant(uuid, uuid), quotidien.annuler_faite_enfant(uuid, uuid),
  quotidien.valider_realisation(uuid), quotidien.a_valider()
from public;
grant execute on function
  quotidien.creer_acces_enfant(uuid), quotidien.lien_acces_enfant(uuid), quotidien.retirer_acces_enfant(uuid),
  quotidien.valider_realisation(uuid), quotidien.a_valider()
to authenticated;
grant execute on function
  quotidien.vue_enfant(uuid), quotidien.marquer_faite_enfant(uuid, uuid), quotidien.annuler_faite_enfant(uuid, uuid)
to anon, authenticated;
grant execute on function quotidien.aujourd_hui_paris() to anon, authenticated;

notify pgrst, 'reload schema';

commit;
