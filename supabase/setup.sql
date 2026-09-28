-- ⚠ NE PLUS EXÉCUTER CE SCRIPT une fois la migration
-- supabase/migrations/20260928140000_socle_famille.sql appliquée : le compte
-- famille a quitté le schéma "recettes". Les changements suivants sont dans
-- supabase/migrations (voir LISEZMOI.md).
--
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
--
-- "alter default privileges" ne s'applique qu'aux tables créées APRÈS cette
-- ligne : comme certaines tables de ce schéma existaient déjà (créées par une
-- exécution antérieure du script, avant même que ces lignes n'y figurent),
-- on ajoute aussi un "grant" direct sur les tables déjà existantes, sans quoi
-- l'API renvoie 403 (permission denied) même avec des politiques RLS
-- correctes.
grant usage on schema recettes to anon, authenticated;
grant select, insert, update, delete on all tables in schema recettes to anon, authenticated;
grant usage, select on all sequences in schema recettes to anon, authenticated;
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

-- (La fonction rejoindre_foyer est désormais définie plus bas, dans la
-- section "Familles et parcours de première connexion", où elle délègue à
-- rejoindre_avec_code.)

alter table recettes.foyers enable row level security;
alter table recettes.foyer_membres enable row level security;
alter table recettes.invitations enable row level security;

drop policy if exists "Voir ses foyers" on recettes.foyers;
create policy "Voir ses foyers" on recettes.foyers
  for select using (id in (select recettes.mes_foyers()));

-- La création d'un foyer passe désormais uniquement par la fonction
-- creer_foyer (section "Familles" plus bas), qui le rattache à la famille et
-- vérifie la règle "un seul foyer par utilisateur". On retire donc
-- l'insertion directe depuis l'application.
drop policy if exists "Créer un foyer" on recettes.foyers;

drop policy if exists "Voir les membres de ses foyers" on recettes.foyer_membres;
create policy "Voir les membres de ses foyers" on recettes.foyer_membres
  for select using (foyer_id in (select recettes.mes_foyers()));

-- Devenir automatiquement administrateur du foyer qu'on vient de créer.
-- (Rejoindre le foyer de quelqu'un d'autre passe uniquement par la fonction
-- rejoindre_foyer ci-dessus, qui contourne cette politique en security definer.)
--
-- La vérification "je suis bien le créateur de ce foyer" doit se faire via
-- une fonction security definer : sinon la sous-requête sur recettes.foyers
-- est elle-même filtrée par la politique "Voir ses foyers" (qui exige d'être
-- déjà membre du foyer) — un cercle vicieux qui bloquait la toute première
-- insertion dans foyer_membres juste après la création d'un foyer.
create or replace function recettes.est_createur_du_foyer(id_foyer uuid)
returns boolean
language sql
stable
security definer
set search_path = recettes, pg_temp
as $$
  select exists (
    select 1 from recettes.foyers where id = id_foyer and cree_par = auth.uid()
  );
$$;

grant execute on function recettes.est_createur_du_foyer(uuid) to authenticated;

-- Devenir administrateur de son foyer se fait désormais dans creer_foyer
-- (security definer) : plus d'insertion directe depuis l'application.
drop policy if exists "Devenir admin de son propre foyer" on recettes.foyer_membres;

-- Les politiques des invitations sont définies dans la section "Familles"
-- plus bas (codes famille + codes foyer). Les codes ne sont plus créés
-- depuis l'application mais par obtenir_code_invitation, qui vérifie que
-- l'utilisateur est bien le créateur de la famille / du foyer.
drop policy if exists "Créer une invitation pour son foyer" on recettes.invitations;

-- =========================================================================
-- Familles et parcours de première connexion
--
-- Une famille regroupe plusieurs foyers. Règles (décision utilisateur) :
--   - un utilisateur appartient à UNE seule famille et à UN seul foyer ;
--   - code famille : généré uniquement par le créateur de la famille, il
--     fait rejoindre la famille, puis l'utilisateur crée son propre foyer ;
--   - code foyer : généré uniquement par le créateur du foyer, il fait
--     rejoindre le foyer ET sa famille ;
--   - sans code : l'utilisateur crée une famille, puis son premier foyer ;
--   - les codes sont valables 24 h et réutilisables pendant ce délai.
--
-- Mise à jour (décision utilisateur, sept. 2026) : UN SEUL code, le code
-- famille, que tout membre de la famille peut générer. Après l'avoir saisi,
-- le nouvel arrivant CHOISIT un foyer existant de la famille (fonction
-- choisir_foyer) ou crée le sien. Les codes foyer ne sont plus proposés
-- par l'application ; un ancien code foyer encore valide reste accepté.
-- =========================================================================

create table if not exists recettes.familles (
  id uuid primary key default gen_random_uuid(),
  nom text not null,
  cree_par uuid references auth.users (id),
  cree_le timestamptz not null default now()
);

-- Clé primaire sur utilisateur_id : garantit une seule famille par utilisateur.
create table if not exists recettes.famille_membres (
  utilisateur_id uuid primary key references auth.users (id) on delete cascade,
  famille_id uuid not null references recettes.familles (id) on delete cascade,
  rejoint_le timestamptz not null default now()
);

alter table recettes.foyers add column if not exists famille_id uuid references recettes.familles (id);

-- Les invitations deviennent typées : "famille" (famille_id renseigné,
-- foyer_id vide) ou "foyer" (foyer_id renseigné), avec une date d'expiration.
alter table recettes.invitations alter column foyer_id drop not null;
alter table recettes.invitations add column if not exists type text not null default 'foyer';
alter table recettes.invitations add column if not exists famille_id uuid references recettes.familles (id) on delete cascade;
alter table recettes.invitations add column if not exists expire_le timestamptz;

-- Les anciens codes (sans date d'expiration) sont considérés comme expirés
-- 24 h après leur création : le créateur du foyer en obtiendra un nouveau
-- automatiquement depuis l'écran Profil.
update recettes.invitations set expire_le = creee_le + interval '1 day' where expire_le is null;
alter table recettes.invitations alter column expire_le set default now() + interval '1 day';
alter table recettes.invitations alter column expire_le set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'invitations_type_check' and conrelid = 'recettes.invitations'::regclass
  ) then
    alter table recettes.invitations add constraint invitations_type_check check (
      (type = 'foyer' and foyer_id is not null)
      or (type = 'famille' and famille_id is not null)
    );
  end if;
end $$;

-- Reprise de l'existant : chaque foyer créé avant l'arrivée des familles
-- reçoit sa propre famille (même nom, même créateur), et ses membres y sont
-- rattachés. Ré-exécutable : ne traite que les foyers encore sans famille.
do $$
declare
  f record;
  nouvelle_famille uuid;
begin
  for f in select id, nom, cree_par from recettes.foyers where famille_id is null loop
    insert into recettes.familles (nom, cree_par)
    values (f.nom, f.cree_par)
    returning id into nouvelle_famille;

    update recettes.foyers set famille_id = nouvelle_famille where id = f.id;

    insert into recettes.famille_membres (utilisateur_id, famille_id)
    select utilisateur_id, nouvelle_famille
    from recettes.foyer_membres
    where foyer_id = f.id
    on conflict (utilisateur_id) do nothing;
  end loop;
end $$;

alter table recettes.foyers alter column famille_id set not null;

-- Un seul foyer par utilisateur. Si des données existantes ne respectent
-- pas encore la règle, l'index n'est pas créé (un avertissement s'affiche)
-- plutôt que de faire échouer tout le script.
do $$
begin
  if not exists (
    select 1 from pg_indexes
    where schemaname = 'recettes' and indexname = 'foyer_membres_un_foyer_par_utilisateur'
  ) then
    if exists (
      select 1 from recettes.foyer_membres group by utilisateur_id having count(*) > 1
    ) then
      raise notice 'Certains utilisateurs appartiennent à plusieurs foyers : règle "un seul foyer" non appliquée en base.';
    else
      create unique index foyer_membres_un_foyer_par_utilisateur
        on recettes.foyer_membres (utilisateur_id);
    end if;
  end if;
end $$;

-- La famille de l'utilisateur courant (ou null).
create or replace function recettes.ma_famille()
returns uuid
language sql
stable
security definer
set search_path = recettes, pg_temp
as $$
  select famille_id from recettes.famille_membres where utilisateur_id = auth.uid();
$$;

grant execute on function recettes.ma_famille() to authenticated;

alter table recettes.familles enable row level security;
alter table recettes.famille_membres enable row level security;

drop policy if exists "Voir sa famille" on recettes.familles;
create policy "Voir sa famille" on recettes.familles
  for select using (id = recettes.ma_famille());

drop policy if exists "Voir les membres de sa famille" on recettes.famille_membres;
create policy "Voir les membres de sa famille" on recettes.famille_membres
  for select using (famille_id = recettes.ma_famille());

drop policy if exists "Voir les invitations de ses foyers" on recettes.invitations;
drop policy if exists "Voir les invitations de sa famille et de son foyer" on recettes.invitations;
create policy "Voir les invitations de sa famille et de son foyer" on recettes.invitations
  for select using (
    foyer_id in (select recettes.mes_foyers())
    or famille_id = recettes.ma_famille()
  );

-- Code de 6 caractères, sans caractères ambigus (0/O, 1/I).
create or replace function recettes.generer_code_invitation()
returns text
language plpgsql
volatile
set search_path = recettes, pg_temp
as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  resultat text := '';
begin
  for i in 1..6 loop
    resultat := resultat || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
  end loop;
  return resultat;
end;
$$;

-- Renvoie le code en cours de validité pour la famille ou le foyer de
-- l'utilisateur (ou en crée un nouveau s'il n'y en a pas, ou s'il expire
-- dans moins d'une heure). Code famille : tout membre de la famille.
-- Code foyer (plus utilisé par l'application) : créateur du foyer.
-- Résultat : { "code": "...", "expire_le": "..." }
create or replace function recettes.obtenir_code_invitation(type_code text)
returns json
language plpgsql
security definer
set search_path = recettes, pg_temp
as $$
declare
  id_famille uuid;
  id_foyer uuid;
  invitation recettes.invitations;
begin
  if auth.uid() is null then
    raise exception 'Vous devez être connecté';
  end if;

  if type_code = 'famille' then
    id_famille := recettes.ma_famille();

    if id_famille is null then
      raise exception 'Rejoignez ou créez d''abord une famille';
    end if;

    select * into invitation
    from recettes.invitations i
    where i.type = 'famille' and i.famille_id = id_famille
      and i.expire_le > now() + interval '1 hour'
    order by i.expire_le desc
    limit 1;
  elsif type_code = 'foyer' then
    select f.id, f.famille_id into id_foyer, id_famille
    from recettes.foyers f
    join recettes.foyer_membres m on m.foyer_id = f.id
    where m.utilisateur_id = auth.uid() and f.cree_par = auth.uid()
    limit 1;

    if id_foyer is null then
      raise exception 'Seul le créateur du foyer peut générer un code foyer';
    end if;

    select * into invitation
    from recettes.invitations i
    where i.type = 'foyer' and i.foyer_id = id_foyer
      and i.expire_le > now() + interval '1 hour'
    order by i.expire_le desc
    limit 1;
  else
    raise exception 'Type de code inconnu : %', type_code;
  end if;

  if invitation.id is null then
    loop
      begin
        insert into recettes.invitations (type, famille_id, foyer_id, code, creee_par, expire_le)
        values (type_code, id_famille, id_foyer, recettes.generer_code_invitation(), auth.uid(), now() + interval '1 day')
        returning * into invitation;
        exit;
      exception when unique_violation then
        -- Code déjà pris (collision très rare) : on en tire un autre.
      end;
    end loop;
  end if;

  return json_build_object('code', invitation.code, 'expire_le', invitation.expire_le);
end;
$$;

grant execute on function recettes.obtenir_code_invitation(text) to authenticated;

-- Utiliser un code, quel que soit son type (détecté automatiquement).
-- Code famille : rejoint la famille. Code foyer : rejoint la famille du
-- foyer ET le foyer. Résultat : { "type", "famille_id", "foyer_id" }.
create or replace function recettes.rejoindre_avec_code(code_saisi text)
returns json
language plpgsql
security definer
set search_path = recettes, pg_temp
as $$
declare
  invitation recettes.invitations;
  famille_du_code uuid;
  famille_actuelle uuid;
  foyer_actuel uuid;
begin
  if auth.uid() is null then
    raise exception 'Vous devez être connecté';
  end if;

  select * into invitation
  from recettes.invitations
  where code = upper(trim(code_saisi));

  if invitation.id is null then
    raise exception 'Code d''invitation invalide';
  end if;

  if invitation.expire_le <= now() then
    raise exception 'Ce code a expiré : demandez-en un nouveau';
  end if;

  if invitation.type = 'foyer' then
    select famille_id into famille_du_code from recettes.foyers where id = invitation.foyer_id;
  else
    famille_du_code := invitation.famille_id;
  end if;

  famille_actuelle := recettes.ma_famille();
  select foyer_id into foyer_actuel
  from recettes.foyer_membres
  where utilisateur_id = auth.uid()
  limit 1;

  if famille_actuelle is not null and famille_actuelle <> famille_du_code then
    raise exception 'Vous faites déjà partie d''une autre famille';
  end if;

  if invitation.type = 'foyer' and foyer_actuel is not null and foyer_actuel <> invitation.foyer_id then
    raise exception 'Vous faites déjà partie d''un autre foyer';
  end if;

  insert into recettes.famille_membres (utilisateur_id, famille_id)
  values (auth.uid(), famille_du_code)
  on conflict (utilisateur_id) do nothing;

  if invitation.type = 'foyer' then
    insert into recettes.foyer_membres (foyer_id, utilisateur_id, role)
    values (invitation.foyer_id, auth.uid(), 'membre')
    on conflict (foyer_id, utilisateur_id) do nothing;
  end if;

  return json_build_object(
    'type', invitation.type,
    'famille_id', famille_du_code,
    'foyer_id', invitation.foyer_id
  );
end;
$$;

grant execute on function recettes.rejoindre_avec_code(text) to authenticated;

-- Ancien point d'entrée (versions précédentes de l'application), conservé
-- pour compatibilité : délègue à rejoindre_avec_code.
create or replace function recettes.rejoindre_foyer(code_saisi text)
returns uuid
language plpgsql
security definer
set search_path = recettes, pg_temp
as $$
begin
  return (recettes.rejoindre_avec_code(code_saisi) ->> 'foyer_id')::uuid;
end;
$$;

grant execute on function recettes.rejoindre_foyer(text) to authenticated;

-- Créer sa famille (parcours "sans invitation"). L'utilisateur en devient
-- le créateur, donc le seul à pouvoir générer des codes famille.
create or replace function recettes.creer_famille(nom_famille text)
returns uuid
language plpgsql
security definer
set search_path = recettes, pg_temp
as $$
declare
  nouvelle_famille uuid;
begin
  if auth.uid() is null then
    raise exception 'Vous devez être connecté';
  end if;
  if coalesce(trim(nom_famille), '') = '' then
    raise exception 'Le nom de la famille est obligatoire';
  end if;
  if recettes.ma_famille() is not null then
    raise exception 'Vous faites déjà partie d''une famille';
  end if;

  insert into recettes.familles (nom, cree_par)
  values (trim(nom_famille), auth.uid())
  returning id into nouvelle_famille;

  insert into recettes.famille_membres (utilisateur_id, famille_id)
  values (auth.uid(), nouvelle_famille);

  return nouvelle_famille;
end;
$$;

grant execute on function recettes.creer_famille(text) to authenticated;

-- Créer son foyer dans sa famille. L'utilisateur en devient administrateur
-- et créateur, donc le seul à pouvoir générer des codes foyer.
create or replace function recettes.creer_foyer(nom_foyer text)
returns uuid
language plpgsql
security definer
set search_path = recettes, pg_temp
as $$
declare
  id_famille uuid;
  nouveau_foyer uuid;
begin
  if auth.uid() is null then
    raise exception 'Vous devez être connecté';
  end if;
  if coalesce(trim(nom_foyer), '') = '' then
    raise exception 'Le nom du foyer est obligatoire';
  end if;

  id_famille := recettes.ma_famille();
  if id_famille is null then
    raise exception 'Rejoignez ou créez d''abord une famille';
  end if;
  if exists (select 1 from recettes.foyer_membres where utilisateur_id = auth.uid()) then
    raise exception 'Vous faites déjà partie d''un foyer';
  end if;

  insert into recettes.foyers (nom, cree_par, famille_id)
  values (trim(nom_foyer), auth.uid(), id_famille)
  returning id into nouveau_foyer;

  insert into recettes.foyer_membres (foyer_id, utilisateur_id, role)
  values (nouveau_foyer, auth.uid(), 'administrateur');

  return nouveau_foyer;
end;
$$;

grant execute on function recettes.creer_foyer(text) to authenticated;

-- Foyers existants de la famille de l'utilisateur, pour lui proposer d'en
-- rejoindre un après avoir saisi le code famille. Security definer : un
-- utilisateur sans foyer ne voit pas les membres des autres foyers (RLS),
-- on renvoie donc seulement le nombre de membres et le prénom du créateur.
-- Résultat : [{ "id", "nom", "createur", "nb_membres" }, ...]
create or replace function recettes.foyers_a_rejoindre()
returns json
language sql
stable
security definer
set search_path = recettes, pg_temp
as $$
  select coalesce(json_agg(json_build_object(
    'id', f.id,
    'nom', f.nom,
    'createur', p.prenom,
    'nb_membres', (select count(*) from recettes.foyer_membres m where m.foyer_id = f.id)
  ) order by f.nom), '[]'::json)
  from recettes.foyers f
  left join recettes.profils p on p.utilisateur_id = f.cree_par
  where f.famille_id = recettes.ma_famille();
$$;

grant execute on function recettes.foyers_a_rejoindre() to authenticated;

-- Rejoindre un foyer existant de SA famille (après le code famille).
-- Règle "un seul foyer par utilisateur" vérifiée ici.
create or replace function recettes.choisir_foyer(id_foyer uuid)
returns uuid
language plpgsql
security definer
set search_path = recettes, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'Vous devez être connecté';
  end if;
  if recettes.ma_famille() is null then
    raise exception 'Rejoignez ou créez d''abord une famille';
  end if;
  if not exists (
    select 1 from recettes.foyers where id = id_foyer and famille_id = recettes.ma_famille()
  ) then
    raise exception 'Ce foyer ne fait pas partie de votre famille';
  end if;
  if exists (select 1 from recettes.foyer_membres where utilisateur_id = auth.uid()) then
    raise exception 'Vous faites déjà partie d''un foyer';
  end if;

  insert into recettes.foyer_membres (foyer_id, utilisateur_id, role)
  values (id_foyer, auth.uid(), 'membre');

  return id_foyer;
end;
$$;

grant execute on function recettes.choisir_foyer(uuid) to authenticated;

-- =========================================================================
-- Catégories et tags — liste UNIQUE et GLOBALE à l'application, partagée
-- par tous les foyers (décision utilisateur : évite les doublons proches
-- par l'orthographe). Voir cahier des charges §4 et §11.
-- =========================================================================

-- La fonction unaccent() fournie par l'extension n'est pas déclarée IMMUTABLE
-- par Postgres (seulement STABLE), alors qu'une colonne "generated" exige une
-- expression immutable. On l'enveloppe dans notre propre fonction, marquée
-- immutable nous-mêmes : le dictionnaire "unaccent" utilisé est fixe, donc le
-- résultat est bien déterministe pour un même texte en entrée.
create or replace function recettes.normaliser_texte(valeur text)
returns text
language sql
immutable
parallel safe
as $$
  select lower(unaccent(valeur));
$$;

create table if not exists recettes.categories (
  id uuid primary key default gen_random_uuid(),
  nom text not null,
  nom_normalise text generated always as (recettes.normaliser_texte(trim(nom))) stored,
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
-- Groupes de catégories (niveau de regroupement au-dessus des catégories)
--
-- Liste fixe de groupes (Apéritifs & Entrées, Plats principaux, …). Chaque
-- catégorie appartient à UN groupe (décision utilisateur) ; une recette
-- apparaît dans le(s) groupe(s) de ses catégories. Une catégorie sans groupe
-- (groupe_id vide) apparaît dans "À classer" sur l'écran d'accueil, où
-- n'importe quel utilisateur peut lui choisir un groupe — la liste des
-- catégories étant globale, ce classement est partagé par tous les foyers.
-- =========================================================================

create table if not exists recettes.groupes_categories (
  id text primary key,
  nom text not null,
  description text not null default '',
  ordre integer not null default 0
);

insert into recettes.groupes_categories (id, nom, description, ordre) values
  ('aperitifs-entrees', 'Apéritifs & Entrées', 'Tartinables, feuilletés, verrines, soupes chaudes ou froides', 1),
  ('plats-principaux', 'Plats principaux', '', 2),
  ('salades', 'Salades', '', 3),
  ('tartes-quiches', 'Tartes & Quiches', '', 4),
  ('desserts', 'Desserts', '', 5),
  ('gateaux-patisseries', 'Gâteaux & Pâtisseries', '', 6),
  ('boissons-smoothies', 'Boissons & Smoothies', '', 7)
on conflict (id) do update
  set nom = excluded.nom, description = excluded.description, ordre = excluded.ordre;

alter table recettes.groupes_categories enable row level security;

drop policy if exists "Tout utilisateur connecté voit les groupes" on recettes.groupes_categories;
create policy "Tout utilisateur connecté voit les groupes" on recettes.groupes_categories
  for select to authenticated using (true);

alter table recettes.categories
  add column if not exists groupe_id text references recettes.groupes_categories (id);

-- Groupe proposé d'après le nom d'une catégorie (déjà sans accents et en
-- minuscules : nom_normalise). Les règles sont testées dans l'ordre : les
-- plus précises d'abord ("tarte aux pommes" → Tartes, pas Desserts ;
-- "salade de fruits" → Desserts, pas Salades). Aucun résultat → null,
-- la catégorie ira dans "À classer".
create or replace function recettes.groupe_par_defaut(nom_normalise text)
returns text
language sql
immutable
as $$
  select case
    when nom_normalise ~ '\m(boissons?|smoothies?|cocktails?|jus|sirops?|limonades?|thes?|tisanes?|cafes?|milk ?shakes?|punch|sangria|chocolat chaud|mocktails?)\M'
      then 'boissons-smoothies'
    when nom_normalise ~ '\msalades? de fruits\M'
      then 'desserts'
    when nom_normalise ~ '\m(tartes?|tartelettes?|quiches?|tourtes?|tatin)\M'
      then 'tartes-quiches'
    when nom_normalise ~ '\m(gateaux?|patisseries?|cakes?|biscuits?|cookies?|macarons?|brioches?|viennoiseries?|muffins?|cupcakes?|madeleines?|financiers?|choux|eclairs?|buches?|entremets|pain d.epices|charlottes?|mille.feuilles?|galettes? des rois|sables?)\M'
      then 'gateaux-patisseries'
    when nom_normalise ~ '\m(aperitifs?|aperos?|entrees?|soupes?|veloutes?|potages?|gaspachos?|verrines?|tartinables?|dips?|tapenades?|houmous|feuilletes?|amuse.bouches?|bouchees?|terrines?|toasts?|tapas|rillettes?)\M'
      then 'aperitifs-entrees'
    when nom_normalise ~ '\msalades?\M'
      then 'salades'
    when nom_normalise ~ '\m(desserts?|mousses?|cremes?|glaces?|sorbets?|flans?|tiramisu|compotes?|crepes?|gaufres?|panna cotta|riz au lait|clafoutis|entremets|douceurs?|sucres?)\M'
      then 'desserts'
    when nom_normalise ~ '\m(plats?|viandes?|poissons?|volailles?|poulet|boeuf|porc|veau|agneau|canard|pates|risottos?|gratins?|legumes?|accompagnements?|currys?|pizzas?|burgers?|lasagnes?|ragouts?|mijotes?|rotis?|fruits de mer|oeufs?|vegetariens?|plancha|barbecue)\M'
      then 'plats-principaux'
    else null
  end;
$$;

-- Classement automatique des catégories existantes (ré-exécutable : ne
-- touche qu'aux catégories encore "À classer").
update recettes.categories
set groupe_id = recettes.groupe_par_defaut(nom_normalise)
where groupe_id is null;

-- Même classement automatique pour toute nouvelle catégorie.
create or replace function recettes.classer_nouvelle_categorie()
returns trigger
language plpgsql
as $$
begin
  if new.groupe_id is null then
    new.groupe_id := recettes.groupe_par_defaut(recettes.normaliser_texte(trim(new.nom)));
  end if;
  return new;
end;
$$;

drop trigger if exists classer_nouvelle_categorie on recettes.categories;
create trigger classer_nouvelle_categorie
  before insert on recettes.categories
  for each row execute function recettes.classer_nouvelle_categorie();

-- Choisir le groupe d'une catégorie depuis l'application : seule la colonne
-- groupe_id est modifiable (pas le nom, qui garantit l'absence de doublons).
revoke update on recettes.categories from anon, authenticated;
grant update (groupe_id) on recettes.categories to authenticated;

drop policy if exists "Tout utilisateur connecté peut classer une catégorie" on recettes.categories;
create policy "Tout utilisateur connecté peut classer une catégorie" on recettes.categories
  for update to authenticated using (true) with check (true);

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
  -- Note personnelle de 1 à 4 étoiles (nulle = pas encore notée).
  note smallint check (note between 1 and 4),
  source text not null default 'manuelle' check (source in ('manuelle', 'scan', 'web')),
  source_url text,
  cree_par uuid not null references auth.users (id),
  cree_le timestamptz not null default now(),
  maj_le timestamptz not null default now()
);

-- Ajout rétroactif pour les bases déjà créées avant l'introduction de la
-- notation par étoiles (script ré-exécutable sans risque).
alter table recettes.recettes add column if not exists note smallint;
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'recettes_note_check' and conrelid = 'recettes.recettes'::regclass
  ) then
    alter table recettes.recettes add constraint recettes_note_check check (note between 1 and 4);
  end if;
end $$;

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
  texte text not null,
  -- Lien optionnel vers une autre recette du foyer (ex. l'étape "faire une
  -- pâte brisée" pointe vers la recette de la pâte brisée) — juste un
  -- pointeur, pas de copie des étapes : la sous-recette reste ouvrable et
  -- déroulable indépendamment (mode assistant), retour à l'étape courante
  -- de la recette principale en revenant en arrière. Mise à null si la
  -- recette liée est supprimée (le texte de l'étape reste inchangé).
  recette_liee_id uuid references recettes.recettes (id) on delete set null
);

-- Ajout rétroactif pour les bases déjà créées avant l'introduction du lien
-- vers une sous-recette (script ré-exécutable sans risque).
alter table recettes.etapes add column if not exists recette_liee_id uuid references recettes.recettes (id) on delete set null;

-- Plusieurs photos par recette (retour utilisateur : pouvoir en ajouter
-- plusieurs, pas une seule) — `recettes.photo_url` reste renseigné en plus,
-- toujours synchronisé sur la première photo (ordre 0), pour continuer à
-- servir de vignette de couverture sans changer les écrans qui l'utilisent
-- déjà tel quel (accueil, catégories, liste de recettes, choix assistant).
create table if not exists recettes.photos_recette (
  id uuid primary key default gen_random_uuid(),
  recette_id uuid not null references recettes.recettes (id) on delete cascade,
  url text not null,
  ordre integer not null default 0,
  cree_le timestamptz not null default now()
);

alter table recettes.recettes enable row level security;
alter table recettes.recette_categories enable row level security;
alter table recettes.ingredients enable row level security;
alter table recettes.etapes enable row level security;
alter table recettes.photos_recette enable row level security;

drop policy if exists "Voir/gérer les photos des recettes de son foyer" on recettes.photos_recette;
create policy "Voir/gérer les photos des recettes de son foyer" on recettes.photos_recette
  for all using (
    recette_id in (select id from recettes.recettes where foyer_id in (select recettes.mes_foyers()))
  )
  with check (
    recette_id in (select id from recettes.recettes where foyer_id in (select recettes.mes_foyers()))
  );

-- Voir, créer et modifier une recette : ouvert à tout le foyer (§4, §11).
-- La suppression, elle, est réservée au créateur de la recette (retour
-- utilisateur : "seul le créateur peut le faire") — d'où une politique
-- séparée ci-dessous plutôt qu'un unique "for all", qui aurait autorisé
-- n'importe quel membre du foyer à supprimer.
drop policy if exists "Voir/gérer les recettes de son foyer" on recettes.recettes;
drop policy if exists "Voir les recettes de son foyer" on recettes.recettes;
create policy "Voir les recettes de son foyer" on recettes.recettes
  for select using (foyer_id in (select recettes.mes_foyers()));

drop policy if exists "Créer une recette dans son foyer" on recettes.recettes;
create policy "Créer une recette dans son foyer" on recettes.recettes
  for insert with check (foyer_id in (select recettes.mes_foyers()));

drop policy if exists "Modifier les recettes de son foyer" on recettes.recettes;
create policy "Modifier les recettes de son foyer" on recettes.recettes
  for update using (foyer_id in (select recettes.mes_foyers()))
  with check (foyer_id in (select recettes.mes_foyers()));

drop policy if exists "Supprimer sa propre recette" on recettes.recettes;
create policy "Supprimer sa propre recette" on recettes.recettes
  for delete using (cree_par = auth.uid());

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

-- Détail, pour chaque ingrédient ajouté depuis une recette, de la recette et
-- de la quantité qui a contribué à un article de `liste_courses_articles`
-- (retour utilisateur : voir par article quelles recettes le citent, et
-- pouvoir retirer proprement la contribution d'une seule recette — ex.
-- ajoutée deux fois par erreur — sans toucher au reste de la liste). Pas de
-- `on delete cascade` sur `recette_id` : si la recette source est supprimée,
-- la ligne de contribution reste (avec `recette_titre` mémorisé) plutôt que
-- de disparaître et fausser silencieusement le détail par recette.
create table if not exists recettes.liste_courses_contributions (
  id uuid primary key default gen_random_uuid(),
  liste_id uuid not null references recettes.listes_courses (id) on delete cascade,
  recette_id uuid references recettes.recettes (id) on delete set null,
  recette_titre text not null,
  -- Identifiant partagé par toutes les lignes d'un même clic sur "Ajouter à
  -- la liste de courses" — PAS le même que `recette_id` : si la même recette
  -- est ajoutée deux fois par erreur, chaque ajout a son propre `ajout_id`,
  -- ce qui permet de retirer seulement l'un des deux (retour utilisateur :
  -- "je voudrais en conserver une") plutôt que les deux à la fois.
  ajout_id text not null default gen_random_uuid()::text,
  libelle text not null,
  quantite numeric,
  unite text,
  parts_utilisees numeric not null,
  ajoute_le timestamptz not null default now()
);

-- Au cas où cette table aurait déjà été créée par une version précédente de
-- ce script (sans `ajout_id`) : ajoute la colonne manquante sans tout
-- recréer. Les lignes déjà existantes reçoivent chacune un `ajout_id`
-- distinct (valeur par défaut) — sans conséquence pour une liste de courses,
-- éphémère par nature.
alter table recettes.liste_courses_contributions
  add column if not exists ajout_id text not null default gen_random_uuid()::text;

alter table recettes.liste_courses_contributions enable row level security;

drop policy if exists "Voir/gérer les contributions des listes de son foyer" on recettes.liste_courses_contributions;
create policy "Voir/gérer les contributions des listes de son foyer" on recettes.liste_courses_contributions
  for all using (
    liste_id in (select id from recettes.listes_courses where foyer_id in (select recettes.mes_foyers()))
  )
  with check (
    liste_id in (select id from recettes.listes_courses where foyer_id in (select recettes.mes_foyers()))
  );

-- =========================================================================
-- Aide-mémoire — fiches pratiques transversales (températures à cœur des
-- viandes, congélation, conversions, etc.), non liées à une recette précise
-- (à la différence du champ "notes" d'une recette). Même principe de
-- partage par foyer que le reste de l'app.
-- =========================================================================

create table if not exists recettes.notes_utiles (
  id uuid primary key default gen_random_uuid(),
  foyer_id uuid not null references recettes.foyers (id) on delete cascade,
  titre text not null,
  -- Thème libre (ex. "Viandes & cuissons", "Congélation") plutôt qu'une
  -- liste fermée : l'utilisateur a indiqué vouloir en ajouter au fur et à
  -- mesure des besoins, sans étape de configuration préalable.
  theme text not null default '',
  contenu text not null default '',
  cree_par uuid not null references auth.users (id),
  cree_le timestamptz not null default now(),
  maj_le timestamptz not null default now()
);

alter table recettes.notes_utiles enable row level security;

-- Voir/créer/modifier : ouvert à tout le foyer, comme les recettes (§4, §11
-- appliqué par analogie). Suppression réservée au créateur, même logique
-- que "Supprimer sa propre recette".
drop policy if exists "Voir les fiches pratiques de son foyer" on recettes.notes_utiles;
create policy "Voir les fiches pratiques de son foyer" on recettes.notes_utiles
  for select using (foyer_id in (select recettes.mes_foyers()));

drop policy if exists "Créer une fiche pratique dans son foyer" on recettes.notes_utiles;
create policy "Créer une fiche pratique dans son foyer" on recettes.notes_utiles
  for insert with check (foyer_id in (select recettes.mes_foyers()));

drop policy if exists "Modifier les fiches pratiques de son foyer" on recettes.notes_utiles;
create policy "Modifier les fiches pratiques de son foyer" on recettes.notes_utiles
  for update using (foyer_id in (select recettes.mes_foyers()))
  with check (foyer_id in (select recettes.mes_foyers()));

drop policy if exists "Supprimer sa propre fiche pratique" on recettes.notes_utiles;
create policy "Supprimer sa propre fiche pratique" on recettes.notes_utiles
  for delete using (cree_par = auth.uid());

-- =========================================================================
-- Partage des recettes avec la famille, prénoms, et "Nos essais"
--
-- Décisions utilisateur :
--   - les recettes d'un foyer sont VISIBLES par tous les foyers de la même
--     famille (lecture seule) ; seul le foyer propriétaire peut les modifier ;
--   - chacun peut raconter ses essais d'une recette (visibles par toute la
--     famille, avec le prénom et le foyer de l'auteur) : verdict (après
--     dégustation), difficulté, temps, points "souci → solution/changement"
--     rattachables à une étape, commentaire, photo ;
--   - la note d'une recette devient la moyenne des verdicts des essais.
-- =========================================================================

-- Foyers de la famille de l'utilisateur courant (le sien compris).
create or replace function recettes.foyers_de_ma_famille()
returns setof uuid
language sql
stable
security definer
set search_path = recettes, pg_temp
as $$
  select f.id from recettes.foyers f where f.famille_id = recettes.ma_famille();
$$;

grant execute on function recettes.foyers_de_ma_famille() to authenticated;

-- Lecture étendue à la famille. Ces politiques s'AJOUTENT à celles du foyer
-- (Postgres les combine par "ou") : l'écriture, elle, reste limitée au
-- foyer propriétaire par les politiques existantes.
drop policy if exists "Voir les foyers de sa famille" on recettes.foyers;
create policy "Voir les foyers de sa famille" on recettes.foyers
  for select using (id in (select recettes.foyers_de_ma_famille()));

drop policy if exists "Voir les recettes de sa famille" on recettes.recettes;
create policy "Voir les recettes de sa famille" on recettes.recettes
  for select using (foyer_id in (select recettes.foyers_de_ma_famille()));

drop policy if exists "Voir les ingrédients des recettes de sa famille" on recettes.ingredients;
create policy "Voir les ingrédients des recettes de sa famille" on recettes.ingredients
  for select using (
    recette_id in (select id from recettes.recettes where foyer_id in (select recettes.foyers_de_ma_famille()))
  );

drop policy if exists "Voir les étapes des recettes de sa famille" on recettes.etapes;
create policy "Voir les étapes des recettes de sa famille" on recettes.etapes
  for select using (
    recette_id in (select id from recettes.recettes where foyer_id in (select recettes.foyers_de_ma_famille()))
  );

drop policy if exists "Voir les catégories des recettes de sa famille" on recettes.recette_categories;
create policy "Voir les catégories des recettes de sa famille" on recettes.recette_categories
  for select using (
    recette_id in (select id from recettes.recettes where foyer_id in (select recettes.foyers_de_ma_famille()))
  );

drop policy if exists "Voir les photos des recettes de sa famille" on recettes.photos_recette;
create policy "Voir les photos des recettes de sa famille" on recettes.photos_recette
  for select using (
    recette_id in (select id from recettes.recettes where foyer_id in (select recettes.foyers_de_ma_famille()))
  );

-- Prénom (ou surnom) affiché sur les essais. Un profil par utilisateur,
-- visible par les membres de sa famille.
create table if not exists recettes.profils (
  utilisateur_id uuid primary key references auth.users (id) on delete cascade default auth.uid(),
  prenom text not null check (length(trim(prenom)) > 0),
  maj_le timestamptz not null default now()
);

alter table recettes.profils enable row level security;

drop policy if exists "Voir les profils de sa famille" on recettes.profils;
create policy "Voir les profils de sa famille" on recettes.profils
  for select using (
    utilisateur_id = auth.uid()
    or utilisateur_id in (
      select utilisateur_id from recettes.famille_membres where famille_id = recettes.ma_famille()
    )
  );

drop policy if exists "Gérer son propre profil" on recettes.profils;
create policy "Gérer son propre profil" on recettes.profils
  for all using (utilisateur_id = auth.uid()) with check (utilisateur_id = auth.uid());

-- Un essai = une réalisation d'une recette par quelqu'un. Il peut être
-- rempli en deux temps : juste après la réalisation (difficulté, temps,
-- soucis) puis après dégustation (verdict).
create table if not exists recettes.essais (
  id uuid primary key default gen_random_uuid(),
  recette_id uuid not null references recettes.recettes (id) on delete cascade,
  auteur_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- Foyer de l'auteur au moment de l'essai (affiché avec son prénom).
  foyer_id uuid not null references recettes.foyers (id) on delete cascade,
  realise_le date not null default current_date,
  -- 1 Bof, 2 Correcte, 3 Bonne, 4 À refaire ! (vide = pas encore goûtée)
  verdict smallint check (verdict between 1 and 4),
  difficulte text check (difficulte in ('facile', 'moyenne', 'difficile')),
  temps text check (temps in ('comme_prevu', 'plus_long', 'plus_court')),
  commentaire text,
  photo_url text,
  cree_le timestamptz not null default now(),
  maj_le timestamptz not null default now()
);

create index if not exists essais_recette_idx on recettes.essais (recette_id);

-- Points d'un essai : un souci rencontré, relié à sa réponse (solution
-- trouvée, ou changement apporté à la recette), éventuellement rattaché à
-- une étape — les points rattachés s'affichent sur cette étape dans le
-- mode assistant. Un point peut aussi être une simple astuce (sans souci).
create table if not exists recettes.essai_points (
  id uuid primary key default gen_random_uuid(),
  essai_id uuid not null references recettes.essais (id) on delete cascade,
  souci text,
  reponse text,
  nature_reponse text not null default 'solution' check (nature_reponse in ('solution', 'changement')),
  etape_id uuid references recettes.etapes (id) on delete set null,
  ordre integer not null default 0,
  check (coalesce(trim(souci), '') <> '' or coalesce(trim(reponse), '') <> '')
);

create index if not exists essai_points_essai_idx on recettes.essai_points (essai_id);

alter table recettes.essais enable row level security;
alter table recettes.essai_points enable row level security;

-- Lecture : tous les essais des recettes visibles (celles de la famille).
drop policy if exists "Voir les essais des recettes de sa famille" on recettes.essais;
create policy "Voir les essais des recettes de sa famille" on recettes.essais
  for select using (
    recette_id in (select id from recettes.recettes where foyer_id in (select recettes.foyers_de_ma_famille()))
  );

-- Écriture : uniquement ses propres essais, depuis son foyer, sur une
-- recette de la famille.
drop policy if exists "Ajouter un essai" on recettes.essais;
create policy "Ajouter un essai" on recettes.essais
  for insert with check (
    auteur_id = auth.uid()
    and foyer_id in (select recettes.mes_foyers())
    and recette_id in (select id from recettes.recettes where foyer_id in (select recettes.foyers_de_ma_famille()))
  );

drop policy if exists "Modifier son essai" on recettes.essais;
create policy "Modifier son essai" on recettes.essais
  for update using (auteur_id = auth.uid()) with check (auteur_id = auth.uid());

drop policy if exists "Supprimer son essai" on recettes.essais;
create policy "Supprimer son essai" on recettes.essais
  for delete using (auteur_id = auth.uid());

drop policy if exists "Voir les points des essais visibles" on recettes.essai_points;
create policy "Voir les points des essais visibles" on recettes.essai_points
  for select using (essai_id in (select id from recettes.essais));

drop policy if exists "Gérer les points de ses essais" on recettes.essai_points;
create policy "Gérer les points de ses essais" on recettes.essai_points
  for all using (essai_id in (select id from recettes.essais where auteur_id = auth.uid()))
  with check (essai_id in (select id from recettes.essais where auteur_id = auth.uid()));


-- Un souci peut recevoir PLUSIEURS réponses (astuces : solution trouvée ou
-- changement apporté) — retour utilisateur. Les réponses vivent dans leur
-- propre table ; la colonne essai_points.reponse n'est plus utilisée (son
-- contenu est recopié ci-dessous).
create table if not exists recettes.essai_point_reponses (
  id uuid primary key default gen_random_uuid(),
  point_id uuid not null references recettes.essai_points (id) on delete cascade,
  texte text not null check (length(trim(texte)) > 0),
  nature text not null default 'solution' check (nature in ('solution', 'changement')),
  ordre integer not null default 0
);

create index if not exists essai_point_reponses_point_idx on recettes.essai_point_reponses (point_id);

-- Reprise des réponses déjà saisies (une seule par souci auparavant).
insert into recettes.essai_point_reponses (point_id, texte, nature, ordre)
select p.id, trim(p.reponse), p.nature_reponse, 0
from recettes.essai_points p
where coalesce(trim(p.reponse), '') <> ''
  and not exists (select 1 from recettes.essai_point_reponses r where r.point_id = p.id);

update recettes.essai_points set reponse = null where reponse is not null;

-- L'ancienne contrainte "souci ou réponse obligatoire" n'a plus de sens (la
-- réponse est désormais dans l'autre table) : on la retire.
do $$
declare
  c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'recettes.essai_points'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%souci%reponse%'
  loop
    execute format('alter table recettes.essai_points drop constraint %I', c.conname);
  end loop;
end $$;

alter table recettes.essai_point_reponses enable row level security;

drop policy if exists "Voir les réponses des essais visibles" on recettes.essai_point_reponses;
create policy "Voir les réponses des essais visibles" on recettes.essai_point_reponses
  for select using (point_id in (select id from recettes.essai_points));

drop policy if exists "Gérer les réponses de ses essais" on recettes.essai_point_reponses;
create policy "Gérer les réponses de ses essais" on recettes.essai_point_reponses
  for all using (
    point_id in (
      select p.id from recettes.essai_points p
      join recettes.essais e on e.id = p.essai_id
      where e.auteur_id = auth.uid()
    )
  )
  with check (
    point_id in (
      select p.id from recettes.essai_points p
      join recettes.essais e on e.id = p.essai_id
      where e.auteur_id = auth.uid()
    )
  );


-- =========================================================================
-- Éléments d'une recette (retour utilisateur) : une recette peut être
-- découpée en éléments, chacun avec ses ingrédients et ses étapes — ex.
-- forêt noire = génoise au chocolat + crème chantilly ; quiche lorraine =
-- la pâte + la garniture. Facultatif : une recette sans élément (element_id
-- vide partout) s'affiche comme avant.
-- =========================================================================

create table if not exists recettes.elements (
  id uuid primary key default gen_random_uuid(),
  recette_id uuid not null references recettes.recettes (id) on delete cascade,
  nom text not null default '',
  ordre integer not null default 0
);

create index if not exists elements_recette_idx on recettes.elements (recette_id);

alter table recettes.ingredients
  add column if not exists element_id uuid references recettes.elements (id) on delete set null;
alter table recettes.etapes
  add column if not exists element_id uuid references recettes.elements (id) on delete set null;

alter table recettes.elements enable row level security;

-- Même règle que les ingrédients et les étapes : gestion par le foyer
-- propriétaire, lecture par toute la famille.
drop policy if exists "Voir/gérer les éléments des recettes de son foyer" on recettes.elements;
create policy "Voir/gérer les éléments des recettes de son foyer" on recettes.elements
  for all using (
    recette_id in (select id from recettes.recettes where foyer_id in (select recettes.mes_foyers()))
  )
  with check (
    recette_id in (select id from recettes.recettes where foyer_id in (select recettes.mes_foyers()))
  );

drop policy if exists "Voir les éléments des recettes de sa famille" on recettes.elements;
create policy "Voir les éléments des recettes de sa famille" on recettes.elements
  for select using (
    recette_id in (select id from recettes.recettes where foyer_id in (select recettes.foyers_de_ma_famille()))
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
    where pubname = 'supabase_realtime' and schemaname = 'recettes' and tablename = 'liste_courses_contributions'
  ) then
    alter publication supabase_realtime add table recettes.liste_courses_contributions;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'recettes' and tablename = 'recettes'
  ) then
    alter publication supabase_realtime add table recettes.recettes;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'recettes' and tablename = 'photos_recette'
  ) then
    alter publication supabase_realtime add table recettes.photos_recette;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'recettes' and tablename = 'notes_utiles'
  ) then
    alter publication supabase_realtime add table recettes.notes_utiles;
  end if;
end $$;

-- =========================================================================
-- Congélateur — inventaire simple du contenu d'un ou plusieurs congélateurs
-- du foyer : un aliment, un type (qui fixe la durée de conservation
-- conseillée, voir src/services/congelateur.ts) et une date de mise au
-- congélateur. Pas de quantités (choix utilisateur : "que cela reste simple").
--
-- Bloc également disponible seul dans supabase/congelateur.sql.
-- =========================================================================

create table if not exists recettes.congelateurs (
  id uuid primary key default gen_random_uuid(),
  foyer_id uuid not null references recettes.foyers (id) on delete cascade,
  nom text not null,
  cree_par uuid not null references auth.users (id),
  cree_le timestamptz not null default now()
);

create table if not exists recettes.congelateur_aliments (
  id uuid primary key default gen_random_uuid(),
  congelateur_id uuid not null references recettes.congelateurs (id) on delete cascade,
  -- Recopié depuis le congélateur : simplifie les droits d'accès et permet
  -- le filtre de synchronisation temps réel par foyer.
  foyer_id uuid not null references recettes.foyers (id) on delete cascade,
  nom text not null,
  -- Clé du type d'aliment (ex. 'viande', 'volaille', 'plat') : la liste et
  -- les durées conseillées vivent dans l'application, pour pouvoir les
  -- ajuster sans toucher à la base.
  type text not null default 'autre',
  date_stockage date not null default current_date,
  cree_par uuid not null references auth.users (id),
  cree_le timestamptz not null default now()
);

create index if not exists congelateur_aliments_foyer_idx on recettes.congelateur_aliments (foyer_id);
create index if not exists congelateur_aliments_congelateur_idx on recettes.congelateur_aliments (congelateur_id);

alter table recettes.congelateurs enable row level security;
alter table recettes.congelateur_aliments enable row level security;

-- Tout le foyer voit, ajoute, modifie et retire : sortir un aliment du
-- congélateur est un geste partagé, quel que soit celui qui l'y a mis.
drop policy if exists "Voir les congélateurs de son foyer" on recettes.congelateurs;
create policy "Voir les congélateurs de son foyer" on recettes.congelateurs
  for select using (foyer_id in (select recettes.mes_foyers()));

drop policy if exists "Créer un congélateur dans son foyer" on recettes.congelateurs;
create policy "Créer un congélateur dans son foyer" on recettes.congelateurs
  for insert with check (foyer_id in (select recettes.mes_foyers()));

drop policy if exists "Modifier les congélateurs de son foyer" on recettes.congelateurs;
create policy "Modifier les congélateurs de son foyer" on recettes.congelateurs
  for update using (foyer_id in (select recettes.mes_foyers()))
  with check (foyer_id in (select recettes.mes_foyers()));

drop policy if exists "Supprimer un congélateur de son foyer" on recettes.congelateurs;
create policy "Supprimer un congélateur de son foyer" on recettes.congelateurs
  for delete using (foyer_id in (select recettes.mes_foyers()));

drop policy if exists "Voir le contenu des congélateurs de son foyer" on recettes.congelateur_aliments;
create policy "Voir le contenu des congélateurs de son foyer" on recettes.congelateur_aliments
  for select using (foyer_id in (select recettes.mes_foyers()));

drop policy if exists "Ajouter un aliment au congélateur" on recettes.congelateur_aliments;
create policy "Ajouter un aliment au congélateur" on recettes.congelateur_aliments
  for insert with check (
    foyer_id in (select recettes.mes_foyers())
    and congelateur_id in (select id from recettes.congelateurs where foyer_id in (select recettes.mes_foyers()))
  );

drop policy if exists "Modifier un aliment du congélateur" on recettes.congelateur_aliments;
create policy "Modifier un aliment du congélateur" on recettes.congelateur_aliments
  for update using (foyer_id in (select recettes.mes_foyers()))
  with check (
    foyer_id in (select recettes.mes_foyers())
    and congelateur_id in (select id from recettes.congelateurs where foyer_id in (select recettes.mes_foyers()))
  );

drop policy if exists "Retirer un aliment du congélateur" on recettes.congelateur_aliments;
create policy "Retirer un aliment du congélateur" on recettes.congelateur_aliments
  for delete using (foyer_id in (select recettes.mes_foyers()));

-- Droits API (déjà couverts par les "default privileges" de setup.sql pour
-- les nouvelles tables ; répétés ici pour une exécution isolée de ce bloc).
grant select, insert, update, delete on recettes.congelateurs to anon, authenticated;
grant select, insert, update, delete on recettes.congelateur_aliments to anon, authenticated;

-- Synchronisation temps réel entre les appareils du foyer.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'recettes' and tablename = 'congelateurs'
  ) then
    alter publication supabase_realtime add table recettes.congelateurs;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'recettes' and tablename = 'congelateur_aliments'
  ) then
    alter publication supabase_realtime add table recettes.congelateur_aliments;
  end if;
end $$;

-- =========================================================================
-- Stockage des photos de recettes : créer le bucket "recettes-photos" dans
-- Dashboard > Storage (la création de bucket ne se fait pas depuis ce script
-- SQL) — PUIS exécuter les policies ci-dessous, sans quoi tout téléversement
-- échoue avec "new row violates row-level security policy" (storage.objects
-- a RLS activé par défaut, sans aucune policy tant qu'on ne les crée pas).
-- =========================================================================

drop policy if exists "Lecture publique des photos de recettes" on storage.objects;
create policy "Lecture publique des photos de recettes"
on storage.objects for select
using (bucket_id = 'recettes-photos');

drop policy if exists "Utilisateurs connectés peuvent ajouter des photos de recettes" on storage.objects;
create policy "Utilisateurs connectés peuvent ajouter des photos de recettes"
on storage.objects for insert
to authenticated
with check (bucket_id = 'recettes-photos');

drop policy if exists "Utilisateurs connectés peuvent modifier leurs photos de recettes" on storage.objects;
create policy "Utilisateurs connectés peuvent modifier leurs photos de recettes"
on storage.objects for update
to authenticated
using (bucket_id = 'recettes-photos')
with check (bucket_id = 'recettes-photos');

drop policy if exists "Utilisateurs connectés peuvent supprimer des photos de recettes" on storage.objects;
create policy "Utilisateurs connectés peuvent supprimer des photos de recettes"
on storage.objects for delete
to authenticated
using (bucket_id = 'recettes-photos');
