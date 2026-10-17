-- =========================================================================
-- Migration — Courses, Phase 3 : bascule de la liste de courses de Recettes
--
-- La liste de courses quitte l'app Recettes pour l'app Courses :
--   - COURSES.CONTRIBUTIONS : pour chaque ingrédient envoyé depuis une
--     recette, la recette, le nombre de parts et la quantité apportée —
--     d'où « cité par : Quiche lorraine, 4 parts » et « Retirer cette
--     recette de la liste » dans Courses (même principe que
--     recettes.liste_courses_contributions) ;
--   - REPRISE : la liste de courses actuelle de chaque foyer (articles,
--     cochés, détail par recette) est recopiée dans la liste principale
--     « Courses » du foyer. Les articles repris sont marqués « rayon à
--     deviner » (articles.rayon_auto) : l'app Courses les range dans leur
--     rayon à la première ouverture (le dictionnaire des produits vit dans
--     l'app). Une liste n'est reprise qu'une fois (courses.reprises_recettes),
--     même si la migration est relancée ;
--   - les tables recettes.listes_courses* restent en place (les anciennes
--     versions de Recettes installées sur les téléphones continuent de
--     fonctionner sans erreur) ; ce qu'on y ajoute après la reprise n'est
--     plus recopié. Une migration séparée les supprimera, plus tard.
--
-- Pré-requis : 20261017110000_courses_avant_de_partir.sql.
-- =========================================================================

begin;

-- -------------------------------------------------------------------------
-- 1. Détail par recette
-- -------------------------------------------------------------------------

create table courses.contributions (
  id uuid primary key default gen_random_uuid(),
  liste_id uuid not null references courses.listes (id) on delete cascade,
  -- Pas de suppression en cascade : si la recette est supprimée, la ligne
  -- reste avec son titre mémorisé.
  recette_id uuid references recettes.recettes (id) on delete set null,
  recette_titre text not null,
  -- Identifiant commun à toutes les lignes d'un même ajout (une même
  -- recette ajoutée deux fois = deux ajouts, retirables séparément).
  ajout_id text not null,
  libelle text not null,
  quantite numeric,
  unite text,
  parts_utilisees numeric not null default 1,
  ajoute_par uuid references auth.users (id) on delete set null default auth.uid(),
  ajoute_le timestamptz not null default now()
);
create index contributions_liste on courses.contributions (liste_id);

grant select, insert, update, delete on courses.contributions to authenticated;
grant all on courses.contributions to service_role;
alter table courses.contributions enable row level security;

create policy "Courses : voir le détail par recette" on courses.contributions
  for select using (courses.peut_voir_liste(liste_id));
create policy "Courses : ajouter le détail par recette" on courses.contributions
  for insert with check (courses.peut_voir_liste(liste_id));
create policy "Courses : modifier le détail par recette" on courses.contributions
  for update using (courses.peut_voir_liste(liste_id)) with check (courses.peut_voir_liste(liste_id));
create policy "Courses : retirer le détail par recette" on courses.contributions
  for delete using (courses.peut_voir_liste(liste_id));

alter table courses.contributions replica identity full;
alter publication supabase_realtime add table courses.contributions;

-- -------------------------------------------------------------------------
-- 2. Articles dont le rayon reste à deviner par l'app
-- -------------------------------------------------------------------------

alter table courses.articles add column if not exists rayon_auto boolean not null default false;

-- -------------------------------------------------------------------------
-- 3. Reprise des listes de Recettes
-- -------------------------------------------------------------------------

create table if not exists courses.reprises_recettes (
  ancienne_liste_id uuid primary key,
  liste_id uuid references courses.listes (id) on delete set null,
  reprise_le timestamptz not null default now()
);
alter table courses.reprises_recettes enable row level security;
grant all on courses.reprises_recettes to service_role;

do $$
declare
  ancienne record;
  id_liste uuid;
  createur uuid;
begin
  -- La liste la plus récente de chaque foyer (celle qu'affichait Recettes).
  for ancienne in
    select distinct on (l.foyer_id) l.id, l.foyer_id
    from recettes.listes_courses l
    where l.foyer_id in (select id from famille.foyers)
      and not exists (select 1 from courses.reprises_recettes r where r.ancienne_liste_id = l.id)
    order by l.foyer_id, l.cree_le desc
  loop
    select id into id_liste from courses.listes where foyer_id = ancienne.foyer_id and principale;
    if id_liste is null then
      select utilisateur_id into createur from famille.foyer_membres where foyer_id = ancienne.foyer_id limit 1;
      if createur is null then
        continue; -- foyer sans membre avec compte : rien à reprendre
      end if;
      insert into courses.listes (foyer_id, nom, icone, portee, principale, cree_par)
      values (ancienne.foyer_id, 'Courses', 'cart-outline', 'foyer', true, createur)
      returning id into id_liste;
    end if;

    insert into courses.articles (liste_id, libelle, quantite, unite, rayon_id, rayon_auto, etat, ajoute_par)
    select id_liste, a.libelle, nullif(a.quantite, 0), nullif(trim(coalesce(a.unite, '')), ''),
           'autres', true,
           case when a.coche then 'caddie' else 'a_acheter' end,
           null
    from recettes.liste_courses_articles a
    where a.liste_id = ancienne.id and length(trim(a.libelle)) > 0
    order by a.ordre;

    insert into courses.contributions (liste_id, recette_id, recette_titre, ajout_id, libelle, quantite, unite, parts_utilisees, ajoute_par, ajoute_le)
    select id_liste, c.recette_id, c.recette_titre, c.ajout_id, c.libelle, c.quantite, c.unite, c.parts_utilisees, null, c.ajoute_le
    from recettes.liste_courses_contributions c
    where c.liste_id = ancienne.id;

    insert into courses.reprises_recettes (ancienne_liste_id, liste_id) values (ancienne.id, id_liste);
  end loop;
end;
$$;

commit;
