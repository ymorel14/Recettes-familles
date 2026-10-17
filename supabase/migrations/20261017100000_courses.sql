-- =========================================================================
-- Migration — Schéma "courses" de l'app Courses (Phase 1 : listes au
-- quotidien)
--
-- Les listes de courses d'un foyer (cahier des charges : document Claude
-- « Cahier des charges — Courses ») :
--   - un foyer a plusieurs LISTES (supermarché, marché, bricolage…) ; une
--     seule est la « liste principale », qui recevra les ingrédients des
--     recettes (Phase 3) et ne peut pas être supprimée ;
--   - portée d'une liste : 'foyer' (tous les membres du foyer) ou 'moi'
--     (son créateur seul) ; en plus, des INVITÉS choisis un par un parmi les
--     personnes avec compte visibles dans la famille — jamais « toute la
--     famille » d'un coup ;
--   - ARTICLES : libellé, quantité et unité FACULTATIVES, note, rayon, qui
--     l'a ajouté ; état 'a_acheter', 'caddie' (pris au magasin) ou
--     'introuvable' ;
--   - RAYONS : rayons de départ communs (identifiants texte fixes) ; chacun
--     règle SON ordre des rayons, liste par liste (ordres_rayons) ;
--   - PRODUITS : mémoire du foyer par produit (rayon choisi, nombre
--     d'achats, dernier achat), pour deviner le rayon et, en Phase 2,
--     proposer les articles habituels ;
--   - PASSAGES : historique des courses terminées (« Terminer les
--     courses » : courses.terminer_courses).
--
-- Qui voit quoi (garanti par les règles RLS) :
--   - une liste se voit et se modifie (articles compris) par les membres de
--     son foyer si sa portée est 'foyer', par son créateur, et par ses
--     invités ;
--   - seuls le créateur et (portée 'foyer') les membres du foyer modifient
--     la liste elle-même et ses invités ; un invité peut seulement se
--     retirer lui-même ;
--   - produits et historique restent réservés au foyer.
--
-- Pré-requis : toutes les migrations précédentes (dont
-- 20261016100000_famille_visibilite_par_famille.sql).
-- APRÈS : ajouter "courses" aux schémas exposés (Project Settings > API >
-- Exposed schemas), comme pour "quotidien".
-- =========================================================================

begin;

create schema if not exists courses;
grant usage on schema courses to authenticated, service_role;

-- -------------------------------------------------------------------------
-- 1. Tables
-- -------------------------------------------------------------------------

create table courses.listes (
  id uuid primary key default gen_random_uuid(),
  foyer_id uuid not null references famille.foyers (id) on delete cascade,
  nom text not null check (length(trim(nom)) > 0),
  icone text not null default 'cart-outline',
  couleur text,
  portee text not null default 'foyer' check (portee in ('foyer', 'moi')),
  -- Liste principale du foyer (une seule) : reçoit les recettes, ne peut
  -- pas être supprimée.
  principale boolean not null default false,
  cree_par uuid not null default auth.uid() references auth.users (id) on delete cascade,
  cree_le timestamptz not null default now()
);
create unique index listes_une_principale on courses.listes (foyer_id) where principale;
create index listes_foyer on courses.listes (foyer_id);

create table courses.invites (
  liste_id uuid not null references courses.listes (id) on delete cascade,
  utilisateur_id uuid not null references auth.users (id) on delete cascade,
  invite_par uuid references auth.users (id) on delete set null default auth.uid(),
  invite_le timestamptz not null default now(),
  primary key (liste_id, utilisateur_id)
);
create index invites_utilisateur on courses.invites (utilisateur_id);

-- Rayons : ceux de départ (foyer_id vide, identifiants fixes, voir plus
-- bas) et, plus tard, ceux ajoutés par un foyer.
create table courses.rayons (
  id text primary key default gen_random_uuid()::text,
  foyer_id uuid references famille.foyers (id) on delete cascade,
  nom text not null,
  icone text not null default 'pricetag-outline',
  ordre integer not null default 100
);

-- Ordre des rayons propre à chaque personne, pour chaque liste.
create table courses.ordres_rayons (
  utilisateur_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  liste_id uuid not null references courses.listes (id) on delete cascade,
  rayons text[] not null default '{}',
  maj_le timestamptz not null default now(),
  primary key (utilisateur_id, liste_id)
);

create table courses.articles (
  id uuid primary key default gen_random_uuid(),
  liste_id uuid not null references courses.listes (id) on delete cascade,
  libelle text not null check (length(trim(libelle)) > 0),
  -- Quantité et unité toujours facultatives (« pain » suffit).
  quantite numeric check (quantite is null or quantite > 0),
  unite text,
  note text,
  rayon_id text not null default 'autres' references courses.rayons (id) on delete set default,
  etat text not null default 'a_acheter' check (etat in ('a_acheter', 'caddie', 'introuvable')),
  ajoute_par uuid default auth.uid() references auth.users (id) on delete set null,
  ajoute_le timestamptz not null default now(),
  caddie_par uuid references auth.users (id) on delete set null,
  caddie_le timestamptz,
  maj_le timestamptz not null default now()
);
create index articles_liste on courses.articles (liste_id);

-- Mémoire du foyer par produit (clé = libellé normalisé côté app : sans
-- accents, minuscules, pluriel simple retiré).
create table courses.produits (
  foyer_id uuid not null references famille.foyers (id) on delete cascade,
  cle text not null,
  libelle text not null,
  rayon_id text references courses.rayons (id) on delete set null,
  nb_achats integer not null default 0,
  dernier_achat timestamptz,
  epingle boolean not null default false,
  masque boolean not null default false,
  primary key (foyer_id, cle)
);

create table courses.passages (
  id uuid primary key default gen_random_uuid(),
  liste_id uuid not null references courses.listes (id) on delete cascade,
  termine_par uuid references auth.users (id) on delete set null default auth.uid(),
  termine_le timestamptz not null default now()
);
create index passages_liste on courses.passages (liste_id, termine_le desc);

create table courses.passage_articles (
  id uuid primary key default gen_random_uuid(),
  passage_id uuid not null references courses.passages (id) on delete cascade,
  libelle text not null,
  quantite numeric,
  unite text,
  rayon_id text,
  ajoute_par uuid references auth.users (id) on delete set null
);
create index passage_articles_passage on courses.passage_articles (passage_id);

-- -------------------------------------------------------------------------
-- 2. Rayons de départ (cahier des charges, « Classement par rayon »)
-- -------------------------------------------------------------------------

insert into courses.rayons (id, foyer_id, nom, icone, ordre) values
  ('fruits_legumes', null, 'Fruits et légumes', 'nutrition-outline', 10),
  ('boulangerie', null, 'Boulangerie', 'storefront-outline', 20),
  ('boucherie', null, 'Boucherie, poissonnerie, traiteur', 'fish-outline', 30),
  ('cremerie', null, 'Crèmerie et fromages', 'egg-outline', 40),
  ('epicerie_salee', null, 'Épicerie salée', 'basket-outline', 50),
  ('epicerie_sucree', null, 'Épicerie sucrée et petit-déjeuner', 'cafe-outline', 60),
  ('boissons', null, 'Boissons', 'wine-outline', 70),
  ('surgeles', null, 'Surgelés', 'snow-outline', 80),
  ('hygiene', null, 'Hygiène et beauté', 'water-outline', 90),
  ('entretien', null, 'Entretien et maison', 'home-outline', 100),
  ('bebe', null, 'Bébé', 'happy-outline', 110),
  ('animaux', null, 'Animaux', 'paw-outline', 120),
  ('autres', null, 'Autres', 'ellipsis-horizontal-circle-outline', 130)
on conflict (id) do nothing;

-- -------------------------------------------------------------------------
-- 3. Fonctions d'accès
-- -------------------------------------------------------------------------

-- Puis-je voir (et remplir) cette liste ?
create or replace function courses.peut_voir_liste(id_liste uuid)
returns boolean
language sql stable security definer
set search_path = courses, famille, pg_temp
as $$
  select exists (
    select 1 from courses.listes l
    where l.id = id_liste
      and (
        l.cree_par = auth.uid()
        or (l.portee = 'foyer' and l.foyer_id in (select famille.mes_foyers()))
        or exists (select 1 from courses.invites i where i.liste_id = l.id and i.utilisateur_id = auth.uid())
      )
  );
$$;

-- Puis-je modifier la liste elle-même (nom, portée, invités, suppression) ?
create or replace function courses.peut_gerer_liste(id_liste uuid)
returns boolean
language sql stable security definer
set search_path = courses, famille, pg_temp
as $$
  select exists (
    select 1 from courses.listes l
    where l.id = id_liste
      and (
        l.cree_par = auth.uid()
        or (l.portee = 'foyer' and l.foyer_id in (select famille.mes_foyers()))
      )
  );
$$;

-- Comptes que je peux inviter : personnes avec compte que je vois dans la
-- famille (règle de visibilité commune, enfants masqués exclus).
create or replace function courses.peut_inviter(id_utilisateur uuid)
returns boolean
language sql stable security definer
set search_path = courses, famille, pg_temp
as $$
  select exists (
    select 1 from famille.personnes p
    where p.utilisateur_id = id_utilisateur
      and p.id in (select famille.personnes_visibles())
  );
$$;

-- Liste principale du foyer : la crée (« Courses ») si elle n'existe pas
-- encore. Appelée à l'ouverture de l'app ; sans risque si deux téléphones
-- l'appellent en même temps (index unique).
create or replace function courses.assurer_liste_principale(id_foyer uuid)
returns uuid
language plpgsql security definer
set search_path = courses, famille, pg_temp
as $$
declare
  resultat uuid;
begin
  if auth.uid() is null or id_foyer not in (select famille.mes_foyers()) then
    raise exception 'Foyer inaccessible.';
  end if;
  select id into resultat from courses.listes where foyer_id = id_foyer and principale;
  if resultat is null then
    insert into courses.listes (foyer_id, nom, icone, portee, principale, cree_par)
    values (id_foyer, 'Courses', 'cart-outline', 'foyer', true, auth.uid())
    on conflict do nothing
    returning id into resultat;
    if resultat is null then
      select id into resultat from courses.listes where foyer_id = id_foyer and principale;
    end if;
  end if;
  return resultat;
end;
$$;

-- « Terminer les courses » : les articles du caddie quittent la liste et
-- entrent dans l'historique ; la mémoire du foyer (nombre d'achats, dernier
-- achat) est mise à jour. Les articles restants (à acheter, introuvables)
-- restent sur la liste. Renvoie l'identifiant du passage, ou null si le
-- caddie était vide.
create or replace function courses.terminer_courses(id_liste uuid, cles jsonb default '{}'::jsonb)
returns uuid
language plpgsql security definer
set search_path = courses, famille, pg_temp
as $$
declare
  id_passage uuid;
  id_foyer uuid;
  a record;
  cle_produit text;
begin
  if not courses.peut_voir_liste(id_liste) then
    raise exception 'Liste inaccessible.';
  end if;
  if not exists (select 1 from courses.articles where liste_id = id_liste and etat = 'caddie') then
    return null;
  end if;
  select foyer_id into id_foyer from courses.listes where id = id_liste;

  insert into courses.passages (liste_id, termine_par) values (id_liste, auth.uid())
  returning id into id_passage;

  for a in
    select * from courses.articles where liste_id = id_liste and etat = 'caddie'
  loop
    insert into courses.passage_articles (passage_id, libelle, quantite, unite, rayon_id, ajoute_par)
    values (id_passage, a.libelle, a.quantite, a.unite, a.rayon_id, a.ajoute_par);
    -- Clé de produit calculée par l'app (même normalisation que la saisie),
    -- transmise article par article ; à défaut, libellé en minuscules.
    cle_produit := coalesce(cles ->> a.id::text, lower(trim(a.libelle)));
    insert into courses.produits (foyer_id, cle, libelle, rayon_id, nb_achats, dernier_achat)
    values (id_foyer, cle_produit, a.libelle, a.rayon_id, 1, now())
    on conflict (foyer_id, cle) do update
      set nb_achats = courses.produits.nb_achats + 1,
          dernier_achat = now(),
          libelle = excluded.libelle;
  end loop;

  delete from courses.articles where liste_id = id_liste and etat = 'caddie';
  return id_passage;
end;
$$;

-- Tenir maj_le à jour (les modifications faites en direct par plusieurs
-- personnes se départagent par la plus récente).
create or replace function courses.toucher_maj()
returns trigger
language plpgsql
as $$
begin
  new.maj_le := now();
  return new;
end;
$$;

create trigger articles_maj before update on courses.articles
  for each row execute function courses.toucher_maj();

-- Vérifie qu'un article déplacé arrive dans une liste qu'on voit aussi.
create or replace function courses.verifier_article()
returns trigger
language plpgsql security definer
set search_path = courses, pg_temp
as $$
begin
  if tg_op = 'UPDATE' and new.liste_id <> old.liste_id and not courses.peut_voir_liste(new.liste_id) then
    raise exception 'Liste de destination inaccessible.';
  end if;
  if new.etat = 'caddie' and (tg_op = 'INSERT' or old.etat <> 'caddie') then
    new.caddie_par := auth.uid();
    new.caddie_le := now();
  elsif new.etat <> 'caddie' then
    new.caddie_par := null;
    new.caddie_le := null;
  end if;
  return new;
end;
$$;

create trigger articles_verifier before insert or update on courses.articles
  for each row execute function courses.verifier_article();

-- La liste principale ne se supprime pas (elle se vide seulement), sauf
-- quand c'est son foyer entier qui disparaît (suppression en cascade : le
-- foyer n'existe déjà plus).
create or replace function courses.proteger_principale()
returns trigger
language plpgsql security definer
set search_path = courses, famille, pg_temp
as $$
begin
  if old.principale and exists (select 1 from famille.foyers where id = old.foyer_id) then
    raise exception 'La liste principale ne peut pas être supprimée, seulement vidée.';
  end if;
  return old;
end;
$$;

create trigger listes_proteger before delete on courses.listes
  for each row execute function courses.proteger_principale();

-- Une liste reste dans son foyer, et garde son statut de liste principale.
create or replace function courses.verifier_liste()
returns trigger
language plpgsql
as $$
begin
  if new.foyer_id <> old.foyer_id or new.principale <> old.principale or new.cree_par <> old.cree_par then
    raise exception 'Modification non permise.';
  end if;
  return new;
end;
$$;

create trigger listes_verifier before update on courses.listes
  for each row execute function courses.verifier_liste();

-- -------------------------------------------------------------------------
-- 4. Droits et règles RLS
-- -------------------------------------------------------------------------

grant select, insert, update, delete on all tables in schema courses to authenticated;
grant all on all tables in schema courses to service_role;

alter table courses.listes enable row level security;
alter table courses.invites enable row level security;
alter table courses.rayons enable row level security;
alter table courses.ordres_rayons enable row level security;
alter table courses.articles enable row level security;
alter table courses.produits enable row level security;
alter table courses.passages enable row level security;
alter table courses.passage_articles enable row level security;

-- Listes
-- Règle écrite sur les colonnes de la ligne (et non par
-- courses.peut_voir_liste) : sinon la liste qu'on vient de créer ne se
-- relisait pas dans la même requête (insert … returning).
create policy "Courses : voir une liste" on courses.listes
  for select using (
    cree_par = auth.uid()
    or (portee = 'foyer' and foyer_id in (select famille.mes_foyers()))
    or exists (select 1 from courses.invites i where i.liste_id = id and i.utilisateur_id = auth.uid())
  );
create policy "Courses : créer une liste" on courses.listes
  for insert with check (
    foyer_id in (select famille.mes_foyers()) and cree_par = auth.uid() and not principale
  );
create policy "Courses : modifier une liste" on courses.listes
  for update using (courses.peut_gerer_liste(id)) with check (courses.peut_gerer_liste(id));
create policy "Courses : supprimer une liste" on courses.listes
  for delete using (courses.peut_gerer_liste(id));

-- Invités
create policy "Courses : voir les invités" on courses.invites
  for select using (courses.peut_voir_liste(liste_id));
create policy "Courses : inviter" on courses.invites
  for insert with check (
    courses.peut_gerer_liste(liste_id) and courses.peut_inviter(utilisateur_id) and utilisateur_id <> auth.uid()
  );
create policy "Courses : retirer un invité ou se retirer" on courses.invites
  for delete using (courses.peut_gerer_liste(liste_id) or utilisateur_id = auth.uid());

-- Rayons
create policy "Courses : voir les rayons" on courses.rayons
  for select using (foyer_id is null or foyer_id in (select famille.mes_foyers()));
create policy "Courses : rayons du foyer" on courses.rayons
  for all using (foyer_id in (select famille.mes_foyers()))
  with check (foyer_id in (select famille.mes_foyers()));

-- Ordre des rayons : chacun écrit le sien ; ceux des autres personnes de la
-- liste se lisent (« Utiliser l'ordre de Marie »).
create policy "Courses : voir les ordres de rayons" on courses.ordres_rayons
  for select using (courses.peut_voir_liste(liste_id));
create policy "Courses : écrire son ordre de rayons" on courses.ordres_rayons
  for insert with check (utilisateur_id = auth.uid() and courses.peut_voir_liste(liste_id));
create policy "Courses : modifier son ordre de rayons" on courses.ordres_rayons
  for update using (utilisateur_id = auth.uid()) with check (utilisateur_id = auth.uid());
create policy "Courses : supprimer son ordre de rayons" on courses.ordres_rayons
  for delete using (utilisateur_id = auth.uid());

-- Articles
create policy "Courses : voir les articles" on courses.articles
  for select using (courses.peut_voir_liste(liste_id));
create policy "Courses : ajouter un article" on courses.articles
  for insert with check (courses.peut_voir_liste(liste_id) and ajoute_par = auth.uid());
create policy "Courses : modifier un article" on courses.articles
  for update using (courses.peut_voir_liste(liste_id)) with check (courses.peut_voir_liste(liste_id));
create policy "Courses : supprimer un article" on courses.articles
  for delete using (courses.peut_voir_liste(liste_id));

-- Produits : réservés au foyer.
create policy "Courses : produits du foyer" on courses.produits
  for all using (foyer_id in (select famille.mes_foyers()))
  with check (foyer_id in (select famille.mes_foyers()));

-- Historique : lecture par le foyer de la liste ; écriture seulement par
-- courses.terminer_courses.
create policy "Courses : voir les passages" on courses.passages
  for select using (
    liste_id in (select id from courses.listes where foyer_id in (select famille.mes_foyers()))
  );
create policy "Courses : voir les articles d'un passage" on courses.passage_articles
  for select using (
    passage_id in (
      select p.id from courses.passages p
      join courses.listes l on l.id = p.liste_id
      where l.foyer_id in (select famille.mes_foyers())
    )
  );
revoke insert, update, delete on courses.passages, courses.passage_articles from authenticated;

grant execute on function
  courses.peut_voir_liste(uuid),
  courses.peut_gerer_liste(uuid),
  courses.peut_inviter(uuid),
  courses.assurer_liste_principale(uuid),
  courses.terminer_courses(uuid, jsonb)
to authenticated;

-- -------------------------------------------------------------------------
-- 5. Temps réel : articles cochés, ajoutés ou retirés visibles aussitôt
-- -------------------------------------------------------------------------

alter table courses.articles replica identity full;
alter publication supabase_realtime add table courses.articles;

commit;
