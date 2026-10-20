-- =========================================================================
-- Migration — Quotidien : confier une tâche à une personne d'un autre foyer
--
-- Une tâche peut maintenant être attribuée à n'importe quelle personne de la
-- famille (avec ou sans compte), même si elle vit dans un AUTRE foyer
-- (ex. Mamie, un cousin). Ce que ça change :
--
--   - Le foyer qui crée la tâche reste son propriétaire : lui seul la
--     modifie ou la supprime (règles inchangées).
--   - Le foyer de la personne choisie VOIT la tâche dans ses tâches du jour
--     et son calendrier, quand c'est le tour de cette personne (ou si la
--     tâche est « qui veut »), et peut la cocher « faite ». L'espace enfant
--     de la personne la montre aussi (« J'ai fini », validé par ses parents
--     ou par le foyer de la tâche).
--   - PAS DE POINTS quand la tâche est faite par quelqu'un d'un autre foyer :
--     chaque foyer garde la main sur ses tirelires.
--   - Champs ajoutés aux tâches du jour et au calendrier : foyer_id,
--     confiee (vrai si la tâche vient d'un autre foyer), foyer_nom.
--
-- ÉLARGISSEMENT SEULEMENT : aucune table ni colonne n'est modifiée ou
-- supprimée. Les deux règles d'écriture des tâches sont recréées à
-- l'identique, sauf la liste des personnes autorisées (foyer → famille), et
-- les fonctions gardent leur nom et leurs paramètres : l'app Quotidien
-- actuelle continue de fonctionner (elle verra simplement aussi les tâches
-- confiées à son foyer).
--
-- Pré-requis : 20261019100000_quotidien_taches_calendrier.sql.
-- =========================================================================

begin;

-- -------------------------------------------------------------------------
-- 1. Qui peut recevoir une tâche
-- -------------------------------------------------------------------------

-- Personnes de mes foyers et des foyers de toutes mes familles.
create or replace function quotidien.personnes_de_mes_familles()
returns setof uuid
language sql stable security definer
set search_path = quotidien, pg_temp
as $$
  select p.id from famille.personnes p
  where p.foyer_id in (select famille.mes_foyers())
     or p.foyer_id in (
       select ff.foyer_id from famille.famille_foyers ff
       where ff.famille_id in (select famille.mes_familles()));
$$;

-- Personnes d'un foyer (tableau), pour comparer avec taches.personnes.
create or replace function quotidien.personnes_du_foyer(id_foyer uuid)
returns uuid[]
language sql stable security definer
set search_path = quotidien, pg_temp
as $$
  select coalesce(array_agg(id), '{}') from famille.personnes where foyer_id = id_foyer;
$$;

-- -------------------------------------------------------------------------
-- 2. Règles RLS
-- -------------------------------------------------------------------------

drop policy if exists "Créer une tâche du foyer" on quotidien.taches;
create policy "Créer une tâche du foyer" on quotidien.taches
  for insert with check (
    foyer_id in (select famille.mes_foyers()) and cree_par = auth.uid()
    and personnes <@ array(select quotidien.personnes_de_mes_familles())
  );

drop policy if exists "Modifier une tâche du foyer" on quotidien.taches;
create policy "Modifier une tâche du foyer" on quotidien.taches
  for update using (foyer_id in (select famille.mes_foyers()))
  with check (
    foyer_id in (select famille.mes_foyers())
    and personnes <@ array(select quotidien.personnes_de_mes_familles())
  );

-- Le foyer d'une personne choisie voit la tâche (lecture seule).
drop policy if exists "Voir les tâches confiées à mon foyer" on quotidien.taches;
create policy "Voir les tâches confiées à mon foyer" on quotidien.taches
  for select using (personnes && array(select quotidien.personnes_de_mon_foyer()));

drop policy if exists "Voir les réalisations des tâches confiées" on quotidien.realisations;
create policy "Voir les réalisations des tâches confiées" on quotidien.realisations
  for select using (exists (
    select 1 from quotidien.taches t
    where t.id = tache_id and t.personnes && array(select quotidien.personnes_de_mon_foyer())
  ));

-- -------------------------------------------------------------------------
-- 3. Tâches du jour (parents et espace enfant)
-- -------------------------------------------------------------------------

-- Comme avant, plus les tâches d'autres foyers confiées à une personne de
-- ce foyer (seulement quand c'est son tour, ou « qui veut »).
create or replace function quotidien.taches_du_jour_foyer(id_foyer uuid, jour date)
returns json
language sql stable security definer
set search_path = quotidien, pg_temp
as $$
  with miens as (select quotidien.personnes_du_foyer(id_foyer) as ids),
  candidates as (
    select t.*, o.k as occ_k, o.debut as occ_debut, o.fin as occ_fin, o.suivante as occ_suivante
    from quotidien.taches t
    left join lateral quotidien.occurrence_tache(t, jour) o on true
    where t.active and jour >= t.date_debut
      and (t.foyer_id = id_foyer or t.personnes && quotidien.personnes_du_foyer(id_foyer))
  ),
  dues as (
    select c.*,
      case
        when cardinality(c.personnes) = 0 then null
        when cardinality(c.personnes) = 1 then c.personnes[1]
        when c.recurrence = 'annuelle' then c.personnes[1 + (c.occ_k % cardinality(c.personnes))]
        else c.personnes[1 + (
          ((jour - c.date_debut) / (case when c.recurrence = 'quotidienne' then 1 else 7 end))
          % cardinality(c.personnes))]
      end as pour
    from candidates c
    where
      (c.planif = 'libre' and (
        c.recurrence = 'quotidienne'
        or (c.recurrence = 'hebdomadaire' and extract(isodow from jour)::smallint = any (c.jours))
        or (c.recurrence = 'aucune' and not exists (
              select 1 from quotidien.realisations r where r.tache_id = c.id and r.date < jour))
      ))
      or (c.planif <> 'libre' and c.occ_debut is not null
        and c.occ_fin >= c.date_debut
        and not exists (
          select 1 from quotidien.realisations r
          where r.tache_id = c.id and r.date >= c.occ_debut and r.date < jour
            and (c.occ_suivante is null or r.date < c.occ_suivante))
        and (jour <= c.occ_fin or jour <= current_date))
  ),
  visibles as (
    select d.* from dues d, miens m
    where d.foyer_id = id_foyer or d.pour is null or d.pour = any (m.ids)
  )
  select coalesce(json_agg(json_build_object(
    'id', d.id, 'libelle', d.libelle, 'points', d.points, 'recurrence', d.recurrence,
    'pour', d.pour,
    'pour_prenom', (select nullif(trim(p.prenom), '') from famille.personnes p where p.id = d.pour),
    'candidats', d.personnes,
    'domaine_id', d.domaine_id,
    'domaine', (select dm.nom from quotidien.domaines dm where dm.id = d.domaine_id),
    'domaine_icone', (select dm.icone from quotidien.domaines dm where dm.id = d.domaine_id),
    'planif', d.planif,
    'debut', d.occ_debut,
    'fin', d.occ_fin,
    'en_retard', (d.planif <> 'libre' and jour > d.occ_fin
                  and not exists (select 1 from quotidien.realisations r where r.tache_id = d.id and r.date = jour)),
    'realisation', (
      select json_build_object('id', r.id, 'etat', r.etat, 'personne_id', r.personne_id,
                               'prenom', (select nullif(trim(p.prenom), '') from famille.personnes p where p.id = r.personne_id))
      from quotidien.realisations r where r.tache_id = d.id and r.date = jour),
    'foyer_id', d.foyer_id,
    'confiee', d.foyer_id <> id_foyer,
    'foyer_nom', case when d.foyer_id <> id_foyer then (select f.nom from famille.foyers f where f.id = d.foyer_id) end
  ) order by (d.planif <> 'libre' and jour > d.occ_fin) desc, d.occ_fin nulls last, d.libelle), '[]'::json)
  from visibles d;
$$;

-- -------------------------------------------------------------------------
-- 4. Calendrier
-- -------------------------------------------------------------------------

create or replace function quotidien.taches_calendrier(du date, au date)
returns json
language sql stable security definer
set search_path = quotidien, pg_temp
as $$
  with miens as (select quotidien.personnes_du_foyer(quotidien.mon_foyer()) as ids),
  t as (
    select * from quotidien.taches
    where active and planif <> 'libre'
      and (foyer_id = quotidien.mon_foyer() or personnes && quotidien.personnes_du_foyer(quotidien.mon_foyer()))
  ),
  occ as (
    select t.*, n as occ_k,
      (t.periode_debut + make_interval(years => n))::date as o_debut,
      (t.periode_fin + make_interval(years => n))::date as o_fin,
      case when t.recurrence = 'annuelle' then (t.periode_debut + make_interval(years => n + 1))::date end as o_suivante
    from t
    cross join lateral generate_series(
      case when t.recurrence = 'annuelle'
        then greatest(0, least(extract(year from du), extract(year from current_date))::int - extract(year from t.periode_debut)::int - 1)
        else 0 end,
      case when t.recurrence = 'annuelle'
        then greatest(extract(year from au), extract(year from current_date))::int - extract(year from t.periode_debut)::int + 1
        else 0 end
    ) n
  ),
  avec_fait as (
    select o.*, f.date as fait_le, f.personne_id as fait_par_id,
      case
        when cardinality(o.personnes) = 0 then null
        when o.recurrence = 'annuelle' then o.personnes[1 + (o.occ_k % cardinality(o.personnes))]
        else o.personnes[1] end as pour
    from occ o
    left join lateral (
      select r.date, r.personne_id from quotidien.realisations r
      where r.tache_id = o.id and r.date >= o.o_debut and (o.o_suivante is null or r.date < o.o_suivante)
      order by r.date limit 1
    ) f on true
  ),
  retenues as (
    select a.*,
      (a.fait_le is null and a.o_fin < current_date
       and (a.o_suivante is null or a.o_suivante > current_date)) as retard
    from avec_fait a, miens m
    where a.foyer_id = quotidien.mon_foyer() or a.pour is null or a.pour = any (m.ids)
  )
  select coalesce(json_agg(json_build_object(
    'tache_id', r.id, 'libelle', r.libelle, 'points', r.points, 'recurrence', r.recurrence,
    'planif', r.planif, 'debut', r.o_debut, 'fin', r.o_fin,
    'domaine_id', r.domaine_id,
    'domaine', (select dm.nom from quotidien.domaines dm where dm.id = r.domaine_id),
    'domaine_icone', (select dm.icone from quotidien.domaines dm where dm.id = r.domaine_id),
    'pour', r.pour,
    'candidats', r.personnes,
    'fait_le', r.fait_le,
    'fait_par', (select nullif(trim(p.prenom), '') from famille.personnes p where p.id = r.fait_par_id),
    'en_retard', r.retard,
    'foyer_id', r.foyer_id,
    'confiee', r.foyer_id <> quotidien.mon_foyer(),
    'foyer_nom', case when r.foyer_id <> quotidien.mon_foyer() then (select f.nom from famille.foyers f where f.id = r.foyer_id) end
  ) order by r.o_debut, r.libelle), '[]'::json)
  from retenues r
  where r.o_fin >= r.date_debut and ((r.o_debut <= au and r.o_fin >= du) or r.retard);
$$;

-- -------------------------------------------------------------------------
-- 5. Cocher, annuler, valider
-- -------------------------------------------------------------------------

-- Un parent coche « fait ».
--   - Tâche de mon foyer : la personne est de mon foyer, ou l'une des
--     personnes choisies (même d'un autre foyer).
--   - Tâche confiée à mon foyer : la personne est de mon foyer ET choisie.
-- Points seulement si la personne est du foyer de la tâche.
create or replace function quotidien.marquer_faite(id_tache uuid, jour date, id_personne uuid)
returns uuid
language plpgsql security definer
set search_path = quotidien, pg_temp
as $$
declare
  t quotidien.taches;
  r uuid;
  a_moi boolean;
  miens uuid[] := array(select quotidien.personnes_de_mon_foyer());
begin
  select * into t from quotidien.taches
  where id = id_tache and (foyer_id in (select famille.mes_foyers()) or personnes && miens);
  if t.id is null then
    raise exception 'Tâche introuvable';
  end if;
  a_moi := t.foyer_id in (select famille.mes_foyers());
  if id_personne is null
     or (a_moi and not (id_personne = any (miens) or id_personne = any (t.personnes)))
     or (not a_moi and not (id_personne = any (miens) and id_personne = any (t.personnes))) then
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
  if t.points > 0 and exists (select 1 from famille.personnes p where p.id = id_personne and p.foyer_id = t.foyer_id) then
    insert into quotidien.mouvements (personne_id, points, libelle, origine, realisation_id, cree_par)
    values (id_personne, t.points, 'Tâche : ' || t.libelle, 'tache', r, auth.uid());
  end if;
  return r;
end;
$$;

-- Annuler une réalisation (et ses points) : foyer de la tâche, ou foyer de
-- la personne qui l'a faite.
create or replace function quotidien.annuler_realisation(id_realisation uuid)
returns void
language plpgsql security definer
set search_path = quotidien, pg_temp
as $$
begin
  delete from quotidien.realisations r
  using quotidien.taches t
  where r.id = id_realisation and t.id = r.tache_id
    and (t.foyer_id in (select famille.mes_foyers())
         or r.personne_id in (select quotidien.personnes_de_mon_foyer()));
  if not found then
    raise exception 'Réalisation introuvable';
  end if;
end;
$$;

-- Valider un « J'ai fini » de l'espace enfant : foyer de la tâche ou foyer
-- de l'enfant. Points seulement si l'enfant est du foyer de la tâche.
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
  select * into t from quotidien.taches
  where id = r.tache_id
    and (foyer_id in (select famille.mes_foyers())
         or r.personne_id in (select quotidien.personnes_de_mon_foyer()));
  if r.id is null or t.id is null then
    raise exception 'Réalisation introuvable';
  end if;
  if r.etat = 'validee' then
    return;
  end if;
  update quotidien.realisations set etat = 'validee', validee_par = auth.uid() where id = r.id;
  if t.points > 0 and r.personne_id is not null
     and exists (select 1 from famille.personnes p where p.id = r.personne_id and p.foyer_id = t.foyer_id) then
    insert into quotidien.mouvements (personne_id, points, libelle, origine, realisation_id, cree_par)
    values (r.personne_id, t.points, 'Tâche : ' || t.libelle, 'tache', r.id, auth.uid());
  end if;
end;
$$;

-- « J'ai fini » en attente de validation : tâches de mon foyer, et tâches
-- confiées faites par quelqu'un de mon foyer.
create or replace function quotidien.a_valider()
returns integer
language sql stable security definer
set search_path = quotidien, pg_temp
as $$
  select count(*)::int from quotidien.realisations r
  join quotidien.taches t on t.id = r.tache_id
  where r.etat = 'faite'
    and (t.foyer_id = quotidien.mon_foyer()
         or r.personne_id = any (quotidien.personnes_du_foyer(quotidien.mon_foyer())));
$$;

-- -------------------------------------------------------------------------
-- 6. Droits
-- -------------------------------------------------------------------------

revoke execute on function quotidien.personnes_de_mes_familles(), quotidien.personnes_du_foyer(uuid) from public;
grant execute on function quotidien.personnes_de_mes_familles(), quotidien.personnes_du_foyer(uuid) to authenticated;

notify pgrst, 'reload schema';

commit;
