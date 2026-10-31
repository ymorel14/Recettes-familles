-- =========================================================================
-- Migration — Quotidien : rappels de la maison et anniversaires
--
-- Refonte Quotidien § 3 et § 9.2.
--
--   - Une tâche de la maison peut revenir TOUS LES N ANS (intervalle_annees,
--     1 par défaut = comportement actuel « chaque année »).
--   - « Me prévenir » : rappel_jours = 0 (le jour même), 1 (la veille),
--     7 (une semaine avant), 30 (un mois avant) ; null = pas de rappel.
--     Le rappel part à 7 h (heure de Paris) vers les personnes « pour qui »
--     qui ont un compte (sinon les adultes du foyer de la tâche).
--   - Rappels AUTOMATIQUES : les anniversaires des personnes visibles
--     (famille.personnes_visibles(), donc masquages par famille respectés),
--     avec « C'est fait » par foyer et par année (rappels_auto_faits) et
--     deux notifications : 7 jours avant et le jour même, pour les adultes
--     de chaque foyer (sauf la personne concernée). Réglage par
--     utilisateur : reglages_quotidien.anniversaires (oui par défaut).
--   - taches_du_jour_foyer et taches_calendrier renvoient en plus
--     intervalle_annees, rappel_jours et suivante (début de l'occurrence
--     suivante : « Prochain rappel »). taches_calendrier ne renvoie plus
--     que les tâches de la maison.
--
-- L'occurrence suivante d'une tâche qui revient n'est pas « créée » : elle
-- est calculée à partir de la période de départ, donc elle existe dès que
-- la précédente est cochée, sans aucune ligne en plus.
--
-- AJOUT SEULEMENT : colonnes avec valeur par défaut, nouvelles tables et
-- fonctions ; les deux fonctions de lecture gardent nom et paramètres.
--
-- Pré-requis : 20261028110000_quotidien_semaine_bilans.sql.
-- =========================================================================

begin;

-- -------------------------------------------------------------------------
-- 1. Colonnes
-- -------------------------------------------------------------------------

alter table quotidien.taches
  add column if not exists intervalle_annees smallint not null default 1
    check (intervalle_annees between 1 and 10),
  add column if not exists rappel_jours smallint
    check (rappel_jours is null or rappel_jours in (0, 1, 7, 30));

comment on column quotidien.taches.intervalle_annees is
  'Avec recurrence = annuelle : revient tous les N ans (1 = chaque année).';
comment on column quotidien.taches.rappel_jours is
  'Prévenir N jours avant l''échéance (0, 1, 7 ou 30) ; null = pas de rappel.';

-- -------------------------------------------------------------------------
-- 2. Occurrence d'une tâche datée, avec un intervalle de N ans
-- -------------------------------------------------------------------------

-- Même résultat qu'avant pour N = 1. k = rang de l'occurrence (0, 1, 2…),
-- l'occurrence k commence N × k ans après periode_debut.
create or replace function quotidien.occurrence_tache(t quotidien.taches, jour date)
returns table (k integer, debut date, fin date, suivante date)
language plpgsql immutable
set search_path = quotidien, pg_temp
as $$
declare
  ecart integer;
  n integer;
begin
  if t.planif = 'libre' or t.periode_debut is null then
    return;
  end if;
  if t.recurrence = 'annuelle' then
    ecart := extract(year from jour)::int - extract(year from t.periode_debut)::int;
    if (t.periode_debut + make_interval(years => ecart))::date > jour then
      ecart := ecart - 1;
    end if;
    if ecart < 0 then
      return;
    end if;
    n := ecart / greatest(t.intervalle_annees, 1);
    return query select n,
      (t.periode_debut + make_interval(years => n * t.intervalle_annees))::date,
      (t.periode_fin + make_interval(years => n * t.intervalle_annees))::date,
      (t.periode_debut + make_interval(years => (n + 1) * t.intervalle_annees))::date;
  else
    if jour < t.periode_debut then
      return;
    end if;
    return query select 0, t.periode_debut, t.periode_fin, null::date;
  end if;
end;
$$;

-- -------------------------------------------------------------------------
-- 3. Tâches du jour et calendrier : champs en plus
-- -------------------------------------------------------------------------

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
    where t.active and jour >= t.date_debut and t.type <> 'coup_de_main'
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
    'type', d.type, 'attribution', d.attribution,
    'intervalle_annees', d.intervalle_annees, 'rappel_jours', d.rappel_jours,
    'suivante', d.occ_suivante,
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
      from quotidien.realisations r where r.tache_id = d.id and r.date = jour
      order by r.cree_le limit 1),
    'foyer_id', d.foyer_id,
    'confiee', d.foyer_id <> id_foyer,
    'foyer_nom', case when d.foyer_id <> id_foyer then (select f.nom from famille.foyers f where f.id = d.foyer_id) end
  ) order by (d.planif <> 'libre' and jour > d.occ_fin) desc, d.occ_fin nulls last, d.libelle), '[]'::json)
  from visibles d;
$$;

create or replace function quotidien.taches_calendrier(du date, au date)
returns json
language sql stable security definer
set search_path = quotidien, pg_temp
as $$
  with miens as (select quotidien.personnes_du_foyer(quotidien.mon_foyer()) as ids),
  t as (
    select * from quotidien.taches
    where active and planif <> 'libre' and type = 'maison'
      and (foyer_id = quotidien.mon_foyer() or personnes && quotidien.personnes_du_foyer(quotidien.mon_foyer()))
  ),
  occ as (
    select t.*, n as occ_k,
      (t.periode_debut + make_interval(years => n * t.intervalle_annees))::date as o_debut,
      (t.periode_fin + make_interval(years => n * t.intervalle_annees))::date as o_fin,
      case when t.recurrence = 'annuelle' then (t.periode_debut + make_interval(years => (n + 1) * t.intervalle_annees))::date end as o_suivante
    from t
    cross join lateral generate_series(
      case when t.recurrence = 'annuelle'
        then greatest(0, (least(extract(year from du), extract(year from current_date))::int - extract(year from t.periode_debut)::int - 1) / t.intervalle_annees)
        else 0 end,
      case when t.recurrence = 'annuelle'
        then (greatest(extract(year from au), extract(year from current_date))::int - extract(year from t.periode_debut)::int + 1) / t.intervalle_annees + 1
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
    'type', r.type, 'intervalle_annees', r.intervalle_annees, 'rappel_jours', r.rappel_jours,
    'suivante', r.o_suivante,
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
-- 4. Réglage « Anniversaires » et mémoire des rappels
-- -------------------------------------------------------------------------

create table if not exists quotidien.reglages_quotidien (
  utilisateur_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  anniversaires boolean not null default true,
  maj_le timestamptz not null default now()
);
alter table quotidien.reglages_quotidien enable row level security;
drop policy if exists "Mes réglages Quotidien" on quotidien.reglages_quotidien;
create policy "Mes réglages Quotidien" on quotidien.reglages_quotidien
  for all using (utilisateur_id = auth.uid()) with check (utilisateur_id = auth.uid());
grant select, insert, update on quotidien.reglages_quotidien to authenticated;

-- « C'est fait » d'un rappel automatique, pour un foyer.
create table if not exists quotidien.rappels_auto_faits (
  foyer_id uuid not null references famille.foyers (id) on delete cascade,
  cle text not null,   -- 'anniv:<personne_id>:2026'
  fait_par uuid references auth.users (id) on delete set null,
  fait_le timestamptz not null default now(),
  primary key (foyer_id, cle)
);
alter table quotidien.rappels_auto_faits enable row level security;
drop policy if exists "Voir les rappels faits de mon foyer" on quotidien.rappels_auto_faits;
create policy "Voir les rappels faits de mon foyer" on quotidien.rappels_auto_faits
  for select using (foyer_id in (select famille.mes_foyers()));
grant select on quotidien.rappels_auto_faits to authenticated;

-- Notifications déjà créées par les fonctions planifiées (jamais deux fois).
create table if not exists quotidien.notifs_creees (
  cle text primary key,
  cree_le timestamptz not null default now()
);
alter table quotidien.notifs_creees enable row level security;
revoke all on quotidien.notifs_creees from anon, authenticated;

-- -------------------------------------------------------------------------
-- 5. Anniversaires
-- -------------------------------------------------------------------------

-- Date d'anniversaire d'une personne dans une année (29 février → 28).
create or replace function quotidien.anniversaire_en(naissance date, annee integer)
returns date
language sql immutable
as $$
  select (naissance + make_interval(years => annee - extract(year from naissance)::int))::date;
$$;

-- Personnes visibles pour un FOYER (pour les fonctions planifiées, qui
-- n'ont pas d'utilisateur) : celles du foyer, et celles des foyers de ses
-- familles sauf si elles sont masquées dans cette famille.
create or replace function quotidien.personnes_visibles_du_foyer(id_foyer uuid)
returns setof uuid
language sql stable security definer
set search_path = quotidien, pg_temp
as $$
  select p.id from famille.personnes p where p.foyer_id = id_foyer
  union
  select p.id
  from famille.famille_foyers moi
  join famille.famille_foyers ff on ff.famille_id = moi.famille_id
  join famille.personnes p on p.foyer_id = ff.foyer_id
  where moi.foyer_id = id_foyer
    and not exists (
      select 1 from famille.personnes_masquees m
      where m.personne_id = p.id and m.famille_id = ff.famille_id
    );
$$;
revoke all on function quotidien.personnes_visibles_du_foyer(uuid) from public, anon, authenticated;

-- Anniversaires entre deux dates, pour les personnes que JE vois.
create or replace function quotidien.anniversaires(du date, au date)
returns json
language sql stable security definer
set search_path = quotidien, pg_temp
as $$
  with annees as (
    select generate_series(extract(year from du)::int, extract(year from au)::int) as annee
  ),
  gens as (
    select p.id, coalesce(nullif(trim(p.prenom), ''), 'Quelqu''un') as prenom, p.date_naissance, p.utilisateur_id
    from famille.personnes p
    where p.date_naissance is not null
      and p.id in (select famille.personnes_visibles())
  ),
  jours as (
    select g.*, a.annee, quotidien.anniversaire_en(g.date_naissance, a.annee) as jour
    from gens g cross join annees a
  )
  select coalesce(json_agg(json_build_object(
    'personne_id', j.id,
    'prenom', j.prenom,
    'date', j.jour,
    'age', j.annee - extract(year from j.date_naissance)::int,
    'cle', 'anniv:' || j.id || ':' || j.annee,
    'moi', j.utilisateur_id = auth.uid(),
    'fait', exists (
      select 1 from quotidien.rappels_auto_faits f
      where f.foyer_id = quotidien.mon_foyer() and f.cle = 'anniv:' || j.id || ':' || j.annee)
  ) order by j.jour, j.prenom), '[]'::json)
  from jours j
  where j.jour between du and au and j.annee - extract(year from j.date_naissance)::int >= 0;
$$;

create or replace function quotidien.rappel_auto_fait(cle_rappel text)
returns void
language plpgsql security definer
set search_path = quotidien, pg_temp
as $$
declare
  f uuid := quotidien.mon_foyer();
  id_personne uuid;
begin
  if auth.uid() is null or f is null then
    raise exception 'Vous devez être connecté';
  end if;
  if cle_rappel !~ '^anniv:[0-9a-f-]{36}:[0-9]{4}$' then
    raise exception 'Rappel inconnu.';
  end if;
  id_personne := split_part(cle_rappel, ':', 2)::uuid;
  if not exists (select 1 from famille.personnes_visibles() v where v = id_personne) then
    raise exception 'Rappel inconnu.';
  end if;
  insert into quotidien.rappels_auto_faits (foyer_id, cle, fait_par)
  values (f, cle_rappel, auth.uid())
  on conflict do nothing;
end;
$$;

create or replace function quotidien.rappel_auto_annuler(cle_rappel text)
returns void
language plpgsql security definer
set search_path = quotidien, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'Vous devez être connecté';
  end if;
  delete from quotidien.rappels_auto_faits where foyer_id = quotidien.mon_foyer() and cle = cle_rappel;
end;
$$;

-- -------------------------------------------------------------------------
-- 6. Notifications du matin (7 h, heure de Paris)
-- -------------------------------------------------------------------------

-- Une notification pour un utilisateur, une seule fois par clé.
create or replace function quotidien.notifier_une_fois(
  cle_unique text, destinataire uuid, type_notif text, texte text, chemin text)
returns void
language plpgsql security definer
set search_path = quotidien, pg_temp
as $$
begin
  insert into quotidien.notifs_creees (cle) values (cle_unique) on conflict do nothing;
  if not found then
    return;
  end if;
  insert into famille.notifications (utilisateur_id, module, type, message, cible)
  values (destinataire, 'quotidien', type_notif, left(texte, 300), chemin);
end;
$$;
revoke all on function quotidien.notifier_une_fois(text, uuid, text, text, text) from public, anon, authenticated;

-- Appelée par pg_cron (planification_quotidien.sql) à 05 h et 06 h UTC : ne
-- fait quelque chose qu'à 7 h à Paris (été comme hiver). « forcer » sert aux
-- essais à la main.
create or replace function quotidien.creer_rappels_du_jour(forcer boolean default false)
returns void
language plpgsql security definer
set search_path = quotidien, pg_temp
as $$
declare
  aujourdhui date := quotidien.aujourd_hui_paris();
  r record;
begin
  if not forcer and extract(hour from now() at time zone 'Europe/Paris') <> 7 then
    return;
  end if;

  -- 6.1 Tâches de la maison avec « Me prévenir »
  for r in
    with taches_avec_rappel as (
      select t.* from quotidien.taches t
      where t.active and t.type = 'maison' and t.rappel_jours is not null and t.planif <> 'libre'
        and t.periode_debut is not null
    ),
    occ as (
      select t.*, y as ecart,
        (t.periode_debut + make_interval(years => y))::date as o_debut,
        (t.periode_fin + make_interval(years => y))::date as o_fin,
        case when t.recurrence = 'annuelle'
          then (t.periode_debut + make_interval(years => y + t.intervalle_annees))::date end as o_suivante
      from taches_avec_rappel t
      cross join lateral generate_series(
        case when t.recurrence = 'annuelle'
          then greatest(0, extract(year from aujourdhui)::int - extract(year from t.periode_debut)::int - 1) else 0 end,
        case when t.recurrence = 'annuelle'
          then extract(year from aujourdhui)::int - extract(year from t.periode_debut)::int + 1 else 0 end
      ) y
      where (t.recurrence = 'annuelle' and y % t.intervalle_annees = 0) or t.recurrence <> 'annuelle'
    )
    select o.id, o.libelle, o.foyer_id, o.personnes, o.o_debut, o.o_fin, o.planif,
      case when o.planif = 'avant' then o.o_fin else o.o_debut end as echeance
    from occ o
    where (case when o.planif = 'avant' then o.o_fin else o.o_debut end) - o.rappel_jours = aujourdhui
      and not exists (
        select 1 from quotidien.realisations re
        where re.tache_id = o.id and re.date >= o.o_debut and (o.o_suivante is null or re.date < o.o_suivante))
  loop
    perform quotidien.notifier_une_fois(
      'tache:' || r.id || ':' || r.o_debut || ':' || u.utilisateur_id,
      u.utilisateur_id, 'rappel_tache',
      r.libelle || case when r.planif = 'avant' then ' — avant le ' else ' — le ' end
        || (select regexp_replace(famille.jour_en_clair(r.echeance), '^[a-zé]+ ', '')),
      'quotidien/taches')
    from (
      select distinct x.utilisateur_id from (
        select p.utilisateur_id from famille.personnes p
          where p.id = any (r.personnes) and p.utilisateur_id is not null
        union all
        select m.utilisateur_id from famille.foyer_membres m
          where m.foyer_id = r.foyer_id and cardinality(r.personnes) = 0
      ) x where x.utilisateur_id is not null
    ) u;
  end loop;

  -- 6.2 Anniversaires : sept jours avant et le jour même, pour les adultes de
  --     chaque foyer qui a gardé le réglage (sauf la personne concernée).
  for r in
    select f.id as foyer_id, p.id as personne_id, p.utilisateur_id as concerne,
           coalesce(nullif(trim(p.prenom), ''), 'Quelqu''un') as prenom,
           j.jour, j.annee, j.annee - extract(year from p.date_naissance)::int as age
    from famille.foyers f
    cross join lateral quotidien.personnes_visibles_du_foyer(f.id) v(id)
    join famille.personnes p on p.id = v.id and p.date_naissance is not null
    cross join lateral (
      select a as annee, quotidien.anniversaire_en(p.date_naissance, a) as jour
      from generate_series(extract(year from aujourdhui)::int, extract(year from aujourdhui)::int + 1) a
    ) j
    where j.jour in (aujourdhui, aujourdhui + 7)
      and j.annee - extract(year from p.date_naissance)::int >= 0
  loop
    perform quotidien.notifier_une_fois(
      'anniv:' || r.personne_id || ':' || r.jour || ':' || m.utilisateur_id || ':' || (r.jour - aujourdhui),
      m.utilisateur_id, 'anniversaire',
      case when r.jour = aujourdhui
        then 'C''est l''anniversaire de ' || r.prenom || ' aujourd''hui (' || r.age || ' ans)'
        else 'L''anniversaire de ' || r.prenom || ' est dans 7 jours (' || r.age || ' ans)' end,
      'quotidien/taches')
    from famille.foyer_membres m
    where m.foyer_id = r.foyer_id
      and m.utilisateur_id is distinct from r.concerne
      and coalesce((select s.anniversaires from quotidien.reglages_quotidien s where s.utilisateur_id = m.utilisateur_id), true)
      and not exists (
        select 1 from quotidien.rappels_auto_faits f2
        where f2.foyer_id = r.foyer_id and f2.cle = 'anniv:' || r.personne_id || ':' || r.annee);
  end loop;
end;
$$;

-- -------------------------------------------------------------------------
-- 7. Droits
-- -------------------------------------------------------------------------

revoke all on function
  quotidien.anniversaires(date, date),
  quotidien.rappel_auto_fait(text),
  quotidien.rappel_auto_annuler(text),
  quotidien.creer_rappels_du_jour(boolean)
from public, anon;
grant execute on function
  quotidien.anniversaires(date, date),
  quotidien.rappel_auto_fait(text),
  quotidien.rappel_auto_annuler(text)
to authenticated;
grant execute on function quotidien.creer_rappels_du_jour(boolean) to service_role;

commit;
