-- =========================================================================
-- Migration — Courses : emplacements de la checklist propres au foyer
--
-- La checklist du foyer (courses.a_verifier) est rangée par endroit de la
-- maison. Jusqu'ici la liste des endroits était fixe (Frigo, Congélateur,
-- Placards, Salle de bain, Cellier, Autre) ; chaque foyer peut désormais
-- ajouter les siens (« Garage », « Buanderie », « Cave »…), les renommer,
-- les supprimer (leurs articles passent dans « Autre ») et les ranger dans
-- l'ordre du tour de la maison.
--
--   - courses.emplacements : un emplacement par ligne, son rang ;
--   - les foyers existants reçoivent les endroits de départ, plus ceux déjà
--     utilisés par leur checklist ; un nouveau foyer les reçoit de l'app à
--     la première ouverture de la checklist ;
--   - courses.a_verifier.endroit reste un texte (le nom de l'emplacement).
--
-- Réservé aux membres du foyer.
-- Pré-requis : 20261017110000_courses_avant_de_partir.sql.
-- =========================================================================

begin;

create table if not exists courses.emplacements (
  foyer_id uuid not null references famille.foyers (id) on delete cascade,
  nom text not null check (length(trim(nom)) > 0),
  ordre integer not null default 0,
  primary key (foyer_id, nom)
);

grant select, insert, update, delete on courses.emplacements to authenticated;
grant all on courses.emplacements to service_role;
alter table courses.emplacements enable row level security;

drop policy if exists "Courses : emplacements du foyer" on courses.emplacements;
create policy "Courses : emplacements du foyer" on courses.emplacements
  for all
  using (foyer_id in (select famille.mes_foyers()))
  with check (foyer_id in (select famille.mes_foyers()));

-- Endroits de départ des foyers existants, puis ceux déjà utilisés.
insert into courses.emplacements (foyer_id, nom, ordre)
select f.id, d.nom, d.ordre
from famille.foyers f
cross join (values ('Frigo', 0), ('Congélateur', 1), ('Placards', 2), ('Salle de bain', 3), ('Cellier', 4), ('Autre', 1000)) as d(nom, ordre)
on conflict do nothing;

insert into courses.emplacements (foyer_id, nom, ordre)
select distinct a.foyer_id, a.endroit, 500
from courses.a_verifier a
on conflict do nothing;

notify pgrst, 'reload schema';

commit;
