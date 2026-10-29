-- =========================================================================
-- Migration — Quotidien, refonte (docs/refonte-quotidien.md § 9.1 et § 10) :
-- tâches d'enfant (obligatoires / coups de main), argent en centimes,
-- versement par bilan hebdomadaire.
--
-- PREMIÈRE PARTIE : structure, conversion des données, table des bilans.
-- Les fonctions (semaine_enfant, marquer_aide, preparer_bilans, valider_bilan,
-- annuler_bilan, vue_enfant étendue…) viennent dans la migration suivante.
--
-- AJOUT SEULEMENT : l'ancienne app apps/quotidien continue de fonctionner
-- (elle affichera « 500 points (5,00 €) » après la conversion en centimes).
--
-- Pré-requis : 20261008110000, 20261008120000, 20261019100000, 20261020120000.
-- =========================================================================

begin;

-- -------------------------------------------------------------------------
-- 1. Tâches : type, fois par semaine, validation, attribution
-- -------------------------------------------------------------------------

alter table quotidien.taches
  add column type text not null default 'maison',
  add column fois_par_semaine smallint,
  add column max_un_par_jour boolean not null default true,
  add column validation_parent boolean not null default true,
  add column attribution text not null default 'tour';

-- Reprise des tâches existantes (§ 10), AVANT d'ajouter les contraintes.
-- 1. obligatoire : confiée seulement à des personnes sans compte, qui revient
--    chaque jour ou certains jours.
update quotidien.taches t
set type = 'obligatoire',
    attribution = 'chacun',
    jours = case when t.recurrence = 'quotidienne' then array[1, 2, 3, 4, 5, 6, 7]::smallint[] else t.jours end,
    recurrence = 'hebdomadaire'
where t.recurrence in ('quotidienne', 'hebdomadaire')
  and cardinality(t.personnes) > 0
  and not exists (
    select 1 from famille.personnes p where p.id = any (t.personnes) and p.utilisateur_id is not null
  );

-- 2. coup de main : confiée à des enfants, sans date ni récurrence.
update quotidien.taches t
set type = 'coup_de_main',
    attribution = 'chacun',
    fois_par_semaine = 1
where t.type = 'maison'
  and t.recurrence = 'aucune' and t.planif = 'libre'
  and cardinality(t.personnes) > 0
  and not exists (
    select 1 from famille.personnes p where p.id = any (t.personnes) and p.utilisateur_id is not null
  );

-- 3. maison : tout le reste (valeur par défaut). Les anciennes tâches « à tour
--    de rôle » entre enfants gardent attribution = 'tour' (sinon : obligatoires
--    et coups de main ci-dessus passent en 'chacun' pour la nouvelle règle).
--    Plus de points sur aucune tâche : l'argent vient du bilan de la semaine.
update quotidien.taches set points = 0 where points <> 0;

alter table quotidien.taches
  add constraint taches_type_valeurs check (type in ('maison', 'obligatoire', 'coup_de_main')),
  add constraint taches_attribution_valeurs check (attribution in ('tour', 'chacun')),
  add constraint taches_fois_valeurs check (fois_par_semaine is null or fois_par_semaine between 1 and 14),
  add constraint taches_coup_de_main_fois check (type <> 'coup_de_main' or fois_par_semaine is not null),
  add constraint taches_obligatoire_jours check (type <> 'obligatoire' or cardinality(jours) > 0),
  add constraint taches_max_un_par_jour_fois check (not max_un_par_jour or fois_par_semaine is null or fois_par_semaine <= 7);

comment on column quotidien.taches.type is
  'maison (adultes, rappels), obligatoire (jours précis, chaque fois) ou coup_de_main (N fois par semaine, quand on veut).';
comment on column quotidien.taches.attribution is
  'tour (ancien : à tour de rôle) ou chacun (chaque enfant doit la faire).';

-- -------------------------------------------------------------------------
-- 2. Réalisations : plusieurs par jour et par personne (coups de main)
-- -------------------------------------------------------------------------

alter table quotidien.realisations add column numero smallint not null default 1;
alter table quotidien.realisations drop constraint realisations_tache_id_date_key;
create unique index realisations_unique
  on quotidien.realisations (tache_id, date, coalesce(personne_id, '00000000-0000-0000-0000-000000000000'::uuid), numero);

-- ATTENTION : les fonctions marquer_faite (… autres_foyers) et marquer_faite_enfant
-- (… acces_enfant) attrapent unique_violation pour dire « Cette tâche est déjà
-- faite ». Avec ce nouvel index, la violation reste levée pour deux
-- réalisations de même numéro (1) : le comportement est conservé pour les
-- tâches maison (une seule réalisation par jour).

-- -------------------------------------------------------------------------
-- 3. Argent en centimes (l'unité interne devient le centime)
-- -------------------------------------------------------------------------

-- Conversion avec l'ancien taux de chaque foyer (10 points = 1 € par défaut),
-- AVANT de passer le taux à 100. Bornes des contraintes existantes respectées ;
-- un mouvement ne devient jamais nul.
update quotidien.mouvements m
set points = (
  case when m.points < 0 then -1 else 1 end
  * greatest(1, round(abs(m.points) * 100.0 / coalesce(
      (select r.points_par_euro from quotidien.reglages_foyer r
         join famille.personnes p on p.foyer_id = r.foyer_id where p.id = m.personne_id), 10)))::integer
);

update quotidien.tirelires t
set hebdomadaire = least(10000, round(t.hebdomadaire * 100.0 / coalesce(
      (select r.points_par_euro from quotidien.reglages_foyer r where r.foyer_id = t.foyer_id), 10))::integer),
    objectif_points = case when t.objectif_points is null then null else greatest(1, round(t.objectif_points * 100.0 / coalesce(
      (select r.points_par_euro from quotidien.reglages_foyer r where r.foyer_id = t.foyer_id), 10))::integer) end;

-- Le taux passe à 100 pour tous les foyers (ligne créée si absente).
insert into quotidien.reglages_foyer (foyer_id, points_par_euro)
select distinct f.foyer_id, 100::smallint
from (
  select foyer_id from quotidien.taches
  union select foyer_id from quotidien.tirelires
) f
on conflict (foyer_id) do nothing;
update quotidien.reglages_foyer set points_par_euro = 100, maj_le = now();
alter table quotidien.reglages_foyer alter column points_par_euro set default 100;

-- Sans ligne de réglage, le défaut est maintenant 100 (centimes).
create or replace function quotidien.points_par_euro()
returns smallint
language sql stable security definer
set search_path = quotidien, pg_temp
as $$
  select coalesce((select points_par_euro from quotidien.reglages_foyer where foyer_id = quotidien.mon_foyer()), 100::smallint);
$$;

-- -------------------------------------------------------------------------
-- 4. Plus de versement automatique : le parent valide le bilan
-- -------------------------------------------------------------------------

alter table quotidien.reglages_foyer
  add column mode_argent text not null default 'bilan' check (mode_argent in ('auto', 'bilan'));

-- Ne fait plus rien en mode « bilan » (la fonction reste : l'ancienne app
-- l'appelle). Corps identique à l'original sinon.
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
    select * from quotidien.tirelires ti
    where ti.foyer_id in (select famille.mes_foyers()) and ti.hebdomadaire > 0
      and coalesce((select r.mode_argent from quotidien.reglages_foyer r where r.foyer_id = ti.foyer_id), 'bilan') = 'auto'
    for update
  loop
    d := greatest(t.dernier_versement, current_date - 56);
    k := 0;
    loop
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

-- -------------------------------------------------------------------------
-- 5. Bilans hebdomadaires
-- -------------------------------------------------------------------------

create table quotidien.bilans (
  personne_id uuid not null references famille.personnes (id) on delete cascade,
  semaine date not null check (extract(isodow from semaine) = 1),   -- lundi
  foyer_id uuid not null references famille.foyers (id) on delete cascade,
  obligatoires_prevues int not null,
  obligatoires_faites int not null,
  aides_prevues int not null,
  aides_faites int not null,
  complete boolean not null,
  montant_prevu int not null,                                         -- centimes
  decision text check (decision in ('verse', 'non_verse')),
  montant_verse int,                                                  -- centimes
  mouvement_id uuid references quotidien.mouvements (id) on delete set null,
  decide_par uuid references auth.users (id) on delete set null,
  decide_le timestamptz,
  primary key (personne_id, semaine)
);
create index bilans_foyer on quotidien.bilans (foyer_id, semaine desc);

alter table quotidien.bilans enable row level security;
grant select on quotidien.bilans to authenticated;
grant all on quotidien.bilans to service_role;

-- Lecture par le foyer ; écriture par les fonctions seulement.
create policy "Voir les bilans du foyer" on quotidien.bilans
  for select using (foyer_id in (select famille.mes_foyers()));

notify pgrst, 'reload schema';

commit;
