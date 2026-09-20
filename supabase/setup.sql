-- Mise en place de l'app "Recettes familiales" sur un projet Supabase EXISTANT.
--
-- À exécuter une fois dans l'éditeur SQL du projet (Dashboard > SQL Editor),
-- puis à déclarer le schéma "recettes" comme schéma exposé dans
-- Dashboard > Project Settings > API > "Exposed schemas" (ajouter "recettes"
-- à côté de "public"), sans quoi l'API auto-générée ne le sert pas.
--
-- Objectif : isoler toutes les tables de cette application dans un schéma
-- dédié, pour ne rien casser sur une autre application déjà hébergée sur ce
-- même projet, tout en réutilisant la même base d'utilisateurs (auth.users)
-- pour l'authentification (comme convenu).
--
-- Ce script est ré-exécutable sans risque (if not exists partout, et un
-- "drop policy if exists" précède chaque politique pour pouvoir la recréer
-- sans erreur si une version précédente du script a déjà tourné).

create extension if not exists pgcrypto;
create extension if not exists unaccent;

create schema if not exists recettes;

-- Droits minimaux pour que l'API Supabase (PostgREST) puisse lire/écrire
-- dans ce schéma pour les utilisateurs anonymes et authentifiés.
grant usage on schema recettes to anon, authenticated;
alter default privileges in schema recettes
  grant select, insert, update, delete on tables to anon, authenticated;
alter default privileges in schema recettes
  grant usage, select on sequences to anon, authenticated;

-- =========================================================================
-- Foyers et membres (cahier des charges §3)
-- =========================================================================

create table if not exists recettes.foyers (
  id uuid primary key default gen_random_uuid(),
  nom text not null,
  cree_par uuid not null references auth.users (id),
  cree_le timestamptz not null default now()
);

create table if not exists recettes.foyer_membres (
  foyer_id uuid not null references recettes.foyers (id) on delete cascade,
  utilisateur_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'membre' check (role in ('membre', 'administrateur')),
  rejoint_le timestamptz not null default now(),
  primary key (foyer_id, utilisateur_id)
);

-- Code d'invitation à partager pour rejoindre un foyer (§3 : "invitation par
-- lien ou code"). Un foyer peut avoir plusieurs codes actifs (ex. régénérés).
create table if not exists recettes.invitations (
  id uuid primary key default gen_random_uuid(),
  foyer_id uuid not null references recettes.foyers (id) on delete cascade,
  code text not null unique,
  creee_par uuid not null references auth.users (id),
  creee_le timestamptz not null default now()
);

-- Rattrapage pour une installation antérieure : si "foyers"/"invitations"
-- existaient déjà (créées par une version plus ancienne de ce script, sans
-- ces colonnes), "create table if not exists" ci-dessus ne les a pas
-- ajoutées. On les rajoute ici sans contrainte NOT NULL pour ne pas casser
-- d'éventuelles lignes déjà présentes (les nouvelles lignes créées par
-- l'application renseignent toujours ces colonnes).
alter table recettes.foyers add column if not exists cree_par uuid references auth.users (id);
alter table recettes.invitations add column if not exists creee_par uuid references auth.users (id);

-- Rattache les foyers déjà créés à leur administrateur d'origine, quand on
-- peut le déduire de foyer_membres (sinon la colonne reste vide, sans impact
-- sur l'application).
update recettes.foyers f
set cree_par = (
  select fm.utilisateur_id
  from recettes.foyer_membres fm
  where fm.foyer_id = f.id and fm.role = 'administrateur'
  order by fm.rejoint_le asc
  limit 1
)
where f.cree_par is null;

-- Fonction utilitaire : les foyers dont l'utilisateur courant est membre.
-- security definer + search_path fixé pour pouvoir être utilisée dans les
-- politiques RLS d'autres tables sans dépendre de leurs propres droits.
create or replace function recettes.mes_foyers()
returns setof uuid
language sql
stable
security definer
set search_path = recettes, pg_temp
as $$
  select foyer_id from recettes.foyer_membres where utilisateur_id = auth.uid();
$$;

grant execute on function recettes.mes_foyers() to authenticated;

-- Rejoindre un foyer par code d'invitation. En security definer car
-- l'utilisateur n'a, avant de rejoindre, aucun droit de lecture sur les
-- invitations ni d'écriture sur foyer_membres pour ce foyer.
create or replace function recettes.rejoindre_foyer(code_saisi text)
returns uuid
language plpgsql
security definer
set search_path = recettes, pg_temp
as $$
declare
  foyer_cible uuid;
begin
  select foyer_id into foyer_cible
  from recettes.invitations
  where code = upper(trim(code_saisi));

  if foyer_cible is null then
    raise exception 'Code d''invitation invalide';
  end if;

  insert into recettes.foyer_membres (foyer_id, utilisateur_id, role)
  values (foyer_cible, auth.uid(), 'membre')
  on conflict (foyer_id, utilisateur_id) do nothing;

  return foyer_cible;
end;
$$;

grant execute on function recettes.rejoindre_foyer(text) to authenticated;

alter table recettes.foyers enable row level security;
alter table recettes.foyer_membres enable row level security;
alter table recettes.invitations enable row level security;

drop policy if exists "Voir ses foyers" on recettes.foyers;
create policy "Voir ses foyers" on recettes.foyers
  for select using (id in (select recettes.mes_foyers()));

drop policy if exists "Créer un foyer" on recettes.foyers;
create policy "Créer un foyer" on recettes.foyers
  for insert with check (cree_par = auth.uid());

drop policy if exists "Voir les membres de ses foyers" on recettes.foyer_membres;
create policy "Voir les membres de ses foyers" on recettes.foyer_membres
  for select using (foyer_id in (select recettes.mes_foyers()));

-- Devenir automatiquement administrateur du foyer qu'on vient de créer.
-- (Rejoindre le foyer de quelqu'un d'autre passe uniquement par la fonction
-- rejoindre_foyer ci-dessus, qui contourne cette politique en security definer.)
drop policy if exists "Devenir admin de son propre foyer" on recettes.foyer_membres;
create policy "Devenir admin de son propre foyer" on recettes.foyer_membres
  for insert with check (
    utilisateur_id = auth.uid()
    and foyer_id in (select id from recettes.foyers where cree_par = auth.uid())
  );

drop policy if exists "Voir les invitations de ses foyers" on recettes.invitations;
create policy "Voir les invitations de ses foyers" on recettes.invitations
  for select using (foyer_id in (select recettes.mes_foyers()));

drop policy if exists "Créer une invitation pour son foyer" on recettes.invitations;
create policy "Créer une invitation pour son foyer" on recettes.invitations
  for insert with check (foyer_id in (select recettes.mes_foyers()));

-- =========================================================================
-- Catégories et tags — liste UNIQUE et GLOBALE à l'application, partagée
-- par tous les foyers (décision utilisateur : évite les doublons proches
-- par l'orthographe). Voir cahier des charges §4 et §11.
-- =========================================================================

create table if not exists recettes.categories (
  id uuid primary key default gen_random_uuid(),
  nom text not null,
  nom_normalise text generated always as (lower(unaccent(trim(nom)))) stored,
  cree_le timestamptz not null default now(),
  unique (nom_normalise)
);

alter table recettes.categories enable row level security;

drop policy if exists "Tout utilisateur connecté voit les catégories" on recettes.categories;
create policy "Tout utilisateur connecté voit les catégories" on recettes.categories
  for select to authenticated using (true);

drop policy if exists "Tout utilisateur connecté peut créer une catégorie" on recettes.categories;
create policy "Tout utilisateur connecté peut créer une catégorie" on recettes.categories
  for insert to authenticated with check (true);

-- =========================================================================
-- Recettes (cahier des charges §4, §11)
-- =========================================================================

create table if not exists recettes.recettes (
  id uuid primary key default gen_random_uuid(),
  foyer_id uuid not null references recettes.foyers (id) on delete cascade,
  titre text not null,
  photo_url text,
  parts_defaut integer not null default 4,
  temps_preparation_minutes integer,
  temps_cuisson_minutes integer,
  notes text,
  source text not null default 'manuelle' check (source in ('manuelle', 'scan', 'web')),
  source_url text,
  cree_par uuid not null references auth.users (id),
  cree_le timestamptz not null default now(),
  maj_le timestamptz not null default now()
);

create table if not exists recettes.recette_categories (
  recette_id uuid not null references recettes.recettes (id) on delete cascade,
  categorie_id uuid not null references recettes.categories (id) on delete cascade,
  primary key (recette_id, categorie_id)
);

-- Un ingrédient de recette : quantité + unité + libellé (§4), utilisé aussi
-- pour le rappel automatique des quantités dans le mode assistant (§8).
create table if not exists recettes.ingredients (
  id uuid primary key default gen_random_uuid(),
  recette_id uuid not null references recettes.recettes (id) on delete cascade,
  libelle text not null,
  quantite numeric,
  unite text,
  ordre integer not null default 0
);

-- Le texte d'une étape peut contenir des jetons {{ingredient:<id>}} résolus
-- côté application en "quantité + unité + libellé" (rappel des quantités, §8).
create table if not exists recettes.etapes (
  id uuid primary key default gen_random_uuid(),
  recette_id uuid not null references recettes.recettes (id) on delete cascade,
  ordre integer not null default 0,
  texte text not null
);

alter table recettes.recettes enable row level security;
alter table recettes.recette_categories enable row level security;
alter table recettes.ingredients enable row level security;
alter table recettes.etapes enable row level security;

drop policy if exists "Voir/gérer les recettes de son foyer" on recettes.recettes;
create policy "Voir/gérer les recettes de son foyer" on recettes.recettes
  for all using (foyer_id in (select recettes.mes_foyers()))
  with check (foyer_id in (select recettes.mes_foyers()));

drop policy if exists "Voir/gérer les catégories des recettes de son foyer" on recettes.recette_categories;
create policy "Voir/gérer les catégories des recettes de son foyer" on recettes.recette_categories
  for all using (
    recette_id in (select id from recettes.recettes where foyer_id in (select recettes.mes_foyers()))
  )
  with check (
    recette_id in (select id from recettes.recettes where foyer_id in (select recettes.mes_foyers()))
  );

drop policy if exists "Voir/gérer les ingrédients des recettes de son foyer" on recettes.ingredients;
create policy "Voir/gérer les ingrédients des recettes de son foyer" on recettes.ingredients
  for all using (
    recette_id in (select id from recettes.recettes where foyer_id in (select recettes.mes_foyers()))
  )
  with check (
    recette_id in (select id from recettes.recettes where foyer_id in (select recettes.mes_foyers()))
  );

drop policy if exists "Voir/gérer les étapes des recettes de son foyer" on recettes.etapes;
create policy "Voir/gérer les étapes des recettes de son foyer" on recettes.etapes
  for all using (
    recette_id in (select id from recettes.recettes where foyer_id in (select recettes.mes_foyers()))
  )
  with check (
    recette_id in (select id from recettes.recettes where foyer_id in (select recettes.mes_foyers()))
  );

-- =========================================================================
-- Liste de courses multi-recettes (cahier des charges §7)
-- =========================================================================

create table if not exists recettes.listes_courses (
  id uuid primary key default gen_random_uuid(),
  foyer_id uuid not null references recettes.foyers (id) on delete cascade,
  nom text not null default 'Liste de courses',
  cree_le timestamptz not null default now()
);

create table if not exists recettes.liste_courses_articles (
  id uuid primary key default gen_random_uuid(),
  liste_id uuid not null references recettes.listes_courses (id) on delete cascade,
  libelle text not null,
  quantite numeric,
  unite text,
  coche boolean not null default false,
  ordre integer not null default 0
);

alter table recettes.listes_courses enable row level security;
alter table recettes.liste_courses_articles enable row level security;

drop policy if exists "Voir/gérer les listes de courses de son foyer" on recettes.listes_courses;
create policy "Voir/gérer les listes de courses de son foyer" on recettes.listes_courses
  for all using (foyer_id in (select recettes.mes_foyers()))
  with check (foyer_id in (select recettes.mes_foyers()));

drop policy if exists "Voir/gérer les articles des listes de son foyer" on recettes.liste_courses_articles;
create policy "Voir/gérer les articles des listes de son foyer" on recettes.liste_courses_articles
  for all using (
    liste_id in (select id from recettes.listes_courses where foyer_id in (select recettes.mes_foyers()))
  )
  with check (
    liste_id in (select id from recettes.listes_courses where foyer_id in (select recettes.mes_foyers()))
  );

-- =========================================================================
-- Temps réel (cahier des charges §9) — la synchronisation entre appareils
-- d'un même foyer passe par les canaux Supabase Realtime sur ces tables.
-- =========================================================================

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'recettes' and tablename = 'listes_courses'
  ) then
    alter publication supabase_realtime add table recettes.listes_courses;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'recettes' and tablename = 'liste_courses_articles'
  ) then
    alter publication supabase_realtime add table recettes.liste_courses_articles;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'recettes' and tablename = 'recettes'
  ) then
    alter publication supabase_realtime add table recettes.recettes;
  end if;
end $$;

-- =========================================================================
-- Stockage des photos de recettes : créer le bucket "recettes-photos" dans
-- Dashboard > Storage (public en lecture, écriture réservée aux utilisateurs
-- connectés) — la création de bucket ne se fait pas depuis ce script SQL.
-- =========================================================================
