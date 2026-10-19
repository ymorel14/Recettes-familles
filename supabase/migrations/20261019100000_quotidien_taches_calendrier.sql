-- =========================================================================
-- Migration — Quotidien : tâches datées (calendrier) et domaines
--
-- Une tâche peut maintenant :
--   - appartenir à un DOMAINE du foyer (Potager, Entretien maison, Voiture…,
--     table quotidien.domaines, réservée au foyer comme les tâches) ;
--   - être placée sur le calendrier (colonne planif) :
--       * 'le'     : à une date précise ;
--       * 'entre'  : sur une période (du … au …) ;
--       * 'avant'  : à faire avant une date (à partir d'une date de début) ;
--       * 'libre'  : sans date (comportement d'avant) ;
--     dates dans periode_debut / periode_fin (identiques pour 'le') ;
--   - revenir CHAQUE ANNÉE (recurrence 'annuelle') aux mêmes dates.
--
-- Une tâche datée apparaît dans les tâches du jour à partir du début de sa
-- période, tant qu'elle n'est pas faite ; passé la fin, elle reste affichée
-- « en retard » jusqu'à aujourd'hui (pour une tâche annuelle : jusqu'au
-- début de l'occurrence de l'année suivante). Une occurrence terminée avant
-- la création de la tâche est ignorée. Les tâches sans date ne changent pas.
--
-- taches_calendrier(du, au) : les occurrences datées d'une période, pour la
-- vue mois de l'app, avec les retards.
--
-- Pré-requis : 20261008110000_quotidien_taches_argent.sql,
-- 20261008120000_quotidien_acces_enfant.sql.
-- =========================================================================

begin;

-- -------------------------------------------------------------------------
-- 1. Domaines
-- -------------------------------------------------------------------------

create table quotidien.domaines (
  id uuid primary key default gen_random_uuid(),
  foyer_id uuid not null references famille.foyers (id) on delete cascade,
  nom text not null check (length(trim(nom)) between 1 and 60),
  -- Nom d'icône Ionicons (facultatif).
  icone text,
  cree_le timestamptz not null default now()
);
create unique index domaines_nom on quotidien.domaines (foyer_id, lower(trim(nom)));

alter table quotidien.domaines enable row level security;
grant select, insert, update, delete on quotidien.domaines to authenticated;
grant all on quotidien.domaines to service_role;

create policy "Foyer : voir" on quotidien.domaines
  for select using (foyer_id in (select famille.mes_foyers()));
create policy "Foyer : ajouter" on quotidien.domaines
  for insert with check (foyer_id in (select famille.mes_foyers()));
create policy "Foyer : modifier" on quotidien.domaines
  for update using (foyer_id in (select famille.mes_foyers()))
  with check (foyer_id in (select famille.mes_foyers()));
create policy "Foyer : supprimer" on quotidien.domaines
  for delete using (foyer_id in (select famille.mes_foyers()));

-- -------------------------------------------------------------------------
-- 2. Nouvelles colonnes des tâches
-- -------------------------------------------------------------------------

-- L'ancienne règle sur recurrence (sans 'annuelle') est remplacée.
do $$
declare
  c text;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'quotidien.taches'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) like '%quotidienne%' and pg_get_constraintdef(oid) like '%aucune%'
  loop
    execute format('alter table quotidien.taches drop constraint %I', c);
  end loop;
end;
$$;

alter table quotidien.taches
  add column domaine_id uuid references quotidien.domaines (id) on delete set null,
  add column planif text not null default 'libre',
  add column periode_debut date,
  add column periode_fin date;

create index taches_domaine on quotidien.taches (domaine_id);

alter table quotidien.taches
  add constraint taches_recurrence_valeurs
    check (recurrence in ('aucune', 'quotidienne', 'hebdomadaire', 'annuelle')),
  add constraint taches_planif_valeurs
    check (planif in ('libre', 'le', 'entre', 'avant')),
  -- Une tâche datée est ponctuelle ou annuelle, avec ses deux dates.
  add constraint taches_planif_dates check (
    planif = 'libre'
    or (recurrence in ('aucune', 'annuelle')
        and periode_debut is not null and periode_fin is not null
        and periode_fin >= periode_debut
        and (planif <> 'le' or periode_fin = periode_debut))
  ),
  -- « Chaque année » demande des dates, sur moins d'un an.
  add constraint taches_annuelle_datee check (
    recurrence <> 'annuelle' or (planif <> 'libre' and periode_fin < periode_debut + interval '1 year')
  );

comment on column quotidien.taches.planif is
  'libre (sans date), le (date précise), entre (période), avant (échéance) ; dates dans periode_debut/periode_fin.';

-- Le domaine doit être celui du foyer de la tâche.
create or replace function quotidien.verifier_domaine_tache()
returns trigger
language plpgsql security definer
set search_path = quotidien, pg_temp
as $$
begin
  if new.domaine_id is not null and not exists (
    select 1 from quotidien.domaines where id = new.domaine_id and foyer_id = new.foyer_id
  ) then
    raise exception 'Ce domaine n''appartient pas à votre foyer.';
  end if;
  return new;
end;
$$;

create trigger taches_verifier_domaine
  before insert or update of domaine_id, foyer_id on quotidien.taches
  for each row execute function quotidien.verifier_domaine_tache();

-- -------------------------------------------------------------------------
-- 3. Occurrence d'une tâche datée pour un jour
-- -------------------------------------------------------------------------

-- Occurrence en cours un jour donné : la dernière qui a commencé.
-- k = rang de l'année (0 pour une tâche ponctuelle) ; suivante = début de
-- l'occurrence suivante (null pour une tâche ponctuelle). Aucune ligne si la
-- tâche n'est pas datée ou n'a pas encore commencé.
create or replace function quotidien.occurrence_tache(t quotidien.taches, jour date)
returns table (k integer, debut date, fin date, suivante date)
language plpgsql immutable
set search_path = quotidien, pg_temp
as $$
declare
  n integer;
begin
  if t.planif = 'libre' or t.periode_debut is null then
    return;
  end if;
  if t.recurrence = 'annuelle' then
    n := extract(year from jour)::int - extract(year from t.periode_debut)::int;
    if (t.periode_debut + make_interval(years => n))::date > jour then
      n := n - 1;
    end if;
    if n < 0 then
      return;
    end if;
    return query select n,
      (t.periode_debut + make_interval(years => n))::date,
      (t.periode_fin + make_interval(years => n))::date,
      (t.periode_debut + make_interval(years => n + 1))::date;
  else
    if jour < t.periode_debut then
      return;
    end if;
    return query select 0, t.periode_debut, t.periode_fin, null::date;
  end if;
end;
$$;

-- -------------------------------------------------------------------------
-- 4. Tâches du jour (parents et espace enfant) : tâches datées et domaines
-- -------------------------------------------------------------------------

-- Même résultat qu'avant, avec en plus : domaine_id, domaine, domaine_icone,
-- planif, debut et fin (occurrence en cours), en_retard.
create or replace function quotidien.taches_du_jour_foyer(id_foyer uuid, jour date)
returns json
language sql stable security definer
set search_path = quotidien, pg_temp
as $$
  with candidates as (
    select t.*, o.k as occ_k, o.debut as occ_debut, o.fin as occ_fin, o.suivante as occ_suivante
    from quotidien.taches t
    left join lateral quotidien.occurrence_tache(t, jour) o on true
    where t.foyer_id = id_foyer and t.active and jour >= t.date_debut
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
        -- Une occurrence finie avant la création de la tâche ne compte pas.
        and c.occ_fin >= c.date_debut
        -- Pas déjà faite plus tôt dans cette occurrence…
        and not exists (
          select 1 from quotidien.realisations r
          where r.tache_id = c.id and r.date >= c.occ_debut and r.date < jour
            and (c.occ_suivante is null or r.date < c.occ_suivante))
        -- … et dans sa période, ou en retard (jusqu'à aujourd'hui seulement).
        and (jour <= c.occ_fin or jour <= current_date))
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
      from quotidien.realisations r where r.tache_id = d.id and r.date = jour)
  ) order by (d.planif <> 'libre' and jour > d.occ_fin) desc, d.occ_fin nulls last, d.libelle), '[]'::json)
  from dues d;
$$;

-- -------------------------------------------------------------------------
-- 5. Calendrier
-- -------------------------------------------------------------------------

-- Occurrences des tâches datées de mon foyer qui touchent la période
-- [du, au], plus celles en retard (pas faites, fin passée, pas encore
-- remplacées par l'occurrence suivante). Une ligne par occurrence :
-- [{ tache_id, libelle, points, recurrence, planif, debut, fin,
--    domaine_id, domaine, domaine_icone, pour, pour_prenom,
--    fait_le, fait_par, en_retard }, …]
create or replace function quotidien.taches_calendrier(du date, au date)
returns json
language sql stable security definer
set search_path = quotidien, pg_temp
as $$
  with t as (
    select * from quotidien.taches
    where foyer_id = quotidien.mon_foyer() and active and planif <> 'libre'
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
    select o.*, f.date as fait_le, f.personne_id as fait_par_id
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
    from avec_fait a
  )
  select coalesce(json_agg(json_build_object(
    'tache_id', r.id, 'libelle', r.libelle, 'points', r.points, 'recurrence', r.recurrence,
    'planif', r.planif, 'debut', r.o_debut, 'fin', r.o_fin,
    'domaine_id', r.domaine_id,
    'domaine', (select dm.nom from quotidien.domaines dm where dm.id = r.domaine_id),
    'domaine_icone', (select dm.icone from quotidien.domaines dm where dm.id = r.domaine_id),
    'pour', case
      when cardinality(r.personnes) = 0 then null
      when r.recurrence = 'annuelle' then r.personnes[1 + (r.occ_k % cardinality(r.personnes))]
      else r.personnes[1] end,
    'candidats', r.personnes,
    'fait_le', r.fait_le,
    'fait_par', (select nullif(trim(p.prenom), '') from famille.personnes p where p.id = r.fait_par_id),
    'en_retard', r.retard
  ) order by r.o_debut, r.libelle), '[]'::json)
  from retenues r
  where r.o_fin >= r.date_debut and ((r.o_debut <= au and r.o_fin >= du) or r.retard);
$$;

-- -------------------------------------------------------------------------
-- 6. Droits
-- -------------------------------------------------------------------------

revoke execute on function
  quotidien.occurrence_tache(quotidien.taches, date), quotidien.taches_calendrier(date, date),
  quotidien.verifier_domaine_tache()
from public;
grant execute on function quotidien.taches_calendrier(date, date) to authenticated;
grant execute on function quotidien.occurrence_tache(quotidien.taches, date) to authenticated;

notify pgrst, 'reload schema';

commit;
