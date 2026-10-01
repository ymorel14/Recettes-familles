-- =========================================================================
-- Migration — Schéma "souvenirs" de l'app SouvenirsFamille
--
-- La mémoire de la famille, sur le même compte famille que Cuisine,
-- CadeauCommun et VoyageCommun (schéma "famille" : familles, foyers,
-- personnes) :
--   - des souvenirs datés (voyage, naissance, premiers pas, premiers mots,
--     mariage, décès, fête, rentrée…), avec un récit, un lieu, des
--     étiquettes et les personnes concernées ou présentes ;
--   - des médias (photos, vidéos, enregistrements audio, documents) rangés
--     dans l'espace de stockage privé "souvenirs-medias" ;
--   - des commentaires, sur le souvenir ou sur une photo précise ;
--   - une recherche en français, sans accents, qui répond à des questions
--     comme « quand sommes-nous allés en Irlande ? » ou « quand Sybille
--     a-t-elle commencé à marcher ? » (fonction souvenirs.rechercher).
--
-- Qui voit quoi (garanti par les règles RLS) :
--   - "famille"   : toute la famille où le souvenir a été créé ;
--   - "foyer"     : le foyer de son auteur ;
--   - "personnes" : les personnes du souvenir (et, pour un enfant sans
--                   compte, les membres de son foyer) ;
--   - "prive"     : son auteur seul.
--   L'auteur et les membres de son foyer modifient le souvenir (sauf
--   "prive" : l'auteur seul). Toute personne qui voit un souvenir peut y
--   ajouter des photos et des commentaires.
--
-- Photos : chemin "<id du souvenir>/<nom aléatoire>.<ext>" dans l'espace
-- PRIVÉ "souvenirs-medias" (photos d'enfants : pas d'adresse publique).
-- L'app affiche les fichiers par des adresses signées (createSignedUrl /
-- createSignedUrls) et doit supprimer le fichier du stockage AVANT la ligne
-- souvenirs.medias (ou avant le souvenir entier : voir
-- souvenirs.fichiers_du_souvenir).
--
-- Pré-requis : migration socle_famille et migration voyage (lien facultatif
-- d'un souvenir vers un voyage). APRÈS : ajouter "souvenirs" aux schémas
-- exposés (Project Settings > API > Exposed schemas).
-- =========================================================================

begin;

-- Extensions de recherche (déjà présentes sur la plupart des projets).
create extension if not exists unaccent with schema extensions;
create extension if not exists pg_trgm with schema extensions;

create schema if not exists souvenirs;
grant usage on schema souvenirs to authenticated;

-- -------------------------------------------------------------------------
-- 1. Recherche en français sans accents
-- -------------------------------------------------------------------------

-- "Irlande", "irlande" et "IRLANDE" ; "décès" et "deces" ; "marcher" et
-- "marche" donnent les mêmes mots.
create text search configuration souvenirs.fr (copy = pg_catalog.french);
alter text search configuration souvenirs.fr
  alter mapping for hword, hword_part, word with extensions.unaccent, french_stem;

-- Minuscules sans accents (immuable : utilisable dans un index).
create or replace function souvenirs.normaliser(t text)
returns text
language sql immutable parallel safe
set search_path = ''
as $$
  select lower(extensions.unaccent('extensions.unaccent'::regdictionary, coalesce(t, '')));
$$;

-- -------------------------------------------------------------------------
-- 2. Tables
-- -------------------------------------------------------------------------

-- Catégories proposées par l'app. Les mots-clés sont ajoutés à l'index de
-- recherche de chaque souvenir : « marcher » retrouve les premiers pas,
-- « parler » les premiers mots, « enterrement » un décès…
create table souvenirs.categories (
  code text primary key,
  libelle text not null,
  -- Nom d'icône Ionicons (@expo/vector-icons).
  icone text,
  mots_cles text not null default '',
  ordre smallint not null default 100
);

insert into souvenirs.categories (code, libelle, icone, mots_cles, ordre) values
  ('voyage',        'Voyage',              'airplane-outline',     'voyage vacances séjour week-end partir partis allés aller visite visité', 10),
  ('naissance',     'Naissance',           'happy-outline',        'naissance né née naître bébé arrivée accouchement maternité', 20),
  ('premiers_pas',  'Premiers pas',        'footsteps-outline',    'premiers pas marcher marché marche commencé à marcher', 30),
  ('premiers_mots', 'Premiers mots',       'chatbubble-outline',   'premiers mots premier mot parler parlé dire dit', 31),
  ('premiere_dent', 'Première dent',       'sparkles-outline',     'première dent dents percé', 32),
  ('premiere_fois', 'Première fois',       'star-outline',         'première fois premier vélo nager lire écrire propre', 33),
  ('anniversaire',  'Anniversaire',        'gift-outline',         'anniversaire ans gâteau bougies', 40),
  ('fete',          'Fête',                'wine-outline',         'fête noël réveillon pâques nouvel an réunion de famille cousinade', 41),
  ('mariage',       'Mariage, union',      'heart-outline',        'mariage marié mariée mariés noces pacs pacsés fiançailles fiancés', 50),
  ('scolarite',     'École et études',     'school-outline',       'école rentrée crèche maternelle primaire collège lycée bac diplôme études examen', 60),
  ('maison',        'Maison',              'home-outline',         'maison déménagement déménagé emménagé appartement travaux', 70),
  ('travail',       'Travail',             'briefcase-outline',    'travail emploi métier retraite embauche', 75),
  ('animal',        'Animal',              'paw-outline',          'animal chien chat chiot chaton adoption adopté', 80),
  ('loisirs',       'Sport et loisirs',    'trophy-outline',       'sport match compétition concours spectacle concert', 90),
  ('deces',         'Décès',               'flower-outline',       'décès décédé décédée mort morte obsèques enterrement disparu disparue', 100),
  ('evenement',     'Événement',           'calendar-outline',     'événement', 110),
  ('autre',         'Autre',               'ellipsis-horizontal',  '', 999);

create table souvenirs.souvenirs (
  id uuid primary key default gen_random_uuid(),
  famille_id uuid not null references famille.familles (id) on delete cascade,
  -- Foyer de l'auteur (rempli automatiquement) : ses membres co-gèrent le
  -- souvenir et voient ceux en visibilité "foyer".
  foyer_id uuid references famille.foyers (id) on delete set null,
  titre text not null check (length(trim(titre)) > 0),
  recit text,
  categorie text not null default 'evenement' references souvenirs.categories (code),
  -- Date du souvenir (début et fin pour un voyage ou une période). Vide si
  -- inconnue. precision_date dit comment l'afficher : "14 mars 2021",
  -- "mars 2021", "2021" ou "vers 2021".
  date_debut date,
  date_fin date,
  precision_date text not null default 'jour'
    check (precision_date in ('jour', 'mois', 'annee', 'environ')),
  lieu text,
  pays text,
  latitude double precision,
  longitude double precision,
  etiquettes text[] not null default '{}',
  visibilite text not null default 'famille'
    check (visibilite in ('famille', 'foyer', 'personnes', 'prive')),
  -- Voyage de VoyageCommun d'où vient le souvenir (facultatif).
  voyage_id uuid references voyage.voyages (id) on delete set null,
  -- Média mis en avant (sinon : la première photo).
  couverture_id uuid,
  -- Un souvenir reste à la famille si le compte de son auteur disparaît.
  cree_par uuid default auth.uid() references auth.users (id) on delete set null,
  cree_le timestamptz not null default now(),
  maj_le timestamptz not null default now(),
  -- Rempli par déclencheur (ne pas écrire depuis l'app).
  recherche tsvector,
  texte_recherche text,
  check (date_fin is null or date_debut is null or date_fin >= date_debut)
);
create index souvenirs_famille_date on souvenirs.souvenirs (famille_id, date_debut desc);
create index souvenirs_recherche on souvenirs.souvenirs using gin (recherche);
create index souvenirs_texte_trgm on souvenirs.souvenirs using gin (texte_recherche extensions.gin_trgm_ops);
create index souvenirs_etiquettes on souvenirs.souvenirs using gin (etiquettes);
create index souvenirs_voyage on souvenirs.souvenirs (voyage_id) where voyage_id is not null;

comment on table souvenirs.souvenirs is
  'Un souvenir de famille. Recherche : souvenirs.rechercher(question).';

-- Personnes du souvenir (avec ou sans compte) : "principal" = la personne
-- dont on parle (Sybille pour ses premiers pas, le défunt…), "present" =
-- celles qui y étaient.
create table souvenirs.souvenir_personnes (
  souvenir_id uuid not null references souvenirs.souvenirs (id) on delete cascade,
  personne_id uuid not null references famille.personnes (id) on delete cascade,
  role text not null default 'present' check (role in ('principal', 'present')),
  ajoute_par uuid default auth.uid() references auth.users (id) on delete set null,
  ajoute_le timestamptz not null default now(),
  primary key (souvenir_id, personne_id)
);
create index souvenir_personnes_personne on souvenirs.souvenir_personnes (personne_id);

-- Photos, vidéos, enregistrements (premiers mots…) et documents (faire-part).
create table souvenirs.medias (
  id uuid primary key default gen_random_uuid(),
  souvenir_id uuid not null references souvenirs.souvenirs (id) on delete cascade,
  -- Chemin dans l'espace "souvenirs-medias" : "<souvenir_id>/<nom>.<ext>".
  chemin text not null unique,
  type text not null default 'photo' check (type in ('photo', 'video', 'audio', 'document')),
  legende text,
  -- Date de prise de vue (EXIF), si connue.
  pris_le timestamptz,
  largeur integer check (largeur is null or largeur > 0),
  hauteur integer check (hauteur is null or hauteur > 0),
  duree_secondes integer check (duree_secondes is null or duree_secondes >= 0),
  ordre integer not null default 0,
  ajoute_par uuid default auth.uid() references auth.users (id) on delete set null,
  cree_le timestamptz not null default now()
);
create index medias_souvenir on souvenirs.medias (souvenir_id, ordre);

alter table souvenirs.souvenirs
  add constraint souvenirs_couverture_fkey
  foreign key (couverture_id) references souvenirs.medias (id) on delete set null;

-- Commentaires, sur le souvenir ou sur un de ses médias.
create table souvenirs.commentaires (
  id uuid primary key default gen_random_uuid(),
  souvenir_id uuid not null references souvenirs.souvenirs (id) on delete cascade,
  media_id uuid references souvenirs.medias (id) on delete cascade,
  auteur uuid not null default auth.uid() references auth.users (id) on delete cascade,
  texte text not null check (length(trim(texte)) > 0),
  cree_le timestamptz not null default now(),
  maj_le timestamptz not null default now()
);
create index commentaires_souvenir on souvenirs.commentaires (souvenir_id, cree_le);

-- -------------------------------------------------------------------------
-- 3. Fonctions de contrôle (security definer : ne renvoient qu'un oui/non
--    ou des identifiants, sans être filtrées par les règles RLS).
-- -------------------------------------------------------------------------

-- Personnes pour lesquelles je peux agir : moi, et les personnes sans compte
-- de mon foyer ou que je gère.
create or replace function souvenirs.mes_personnes()
returns setof uuid
language sql stable security definer
set search_path = souvenirs, pg_temp
as $$
  select id from famille.personnes where utilisateur_id = auth.uid()
  union
  select id from famille.personnes
  where utilisateur_id is null
    and (gere_par = auth.uid() or foyer_id in (select famille.mes_foyers()));
$$;

-- Personnes que je peux associer à un souvenir : celles de toutes mes familles.
create or replace function souvenirs.personnes_de_mes_familles()
returns setof uuid
language sql stable security definer
set search_path = souvenirs, pg_temp
as $$
  select id from famille.personnes
  where foyer_id in (select famille.foyers_de_mes_familles())
     or utilisateur_id = auth.uid();
$$;

create or replace function souvenirs.peut_voir(id_souvenir uuid)
returns boolean
language sql stable security definer
set search_path = souvenirs, pg_temp
as $$
  select exists (
    select 1 from souvenirs.souvenirs s
    where s.id = id_souvenir
      and (
        s.cree_par = auth.uid()
        or (s.visibilite = 'famille' and s.famille_id in (select famille.mes_familles()))
        or (s.visibilite = 'foyer' and s.foyer_id in (select famille.mes_foyers()))
        or (s.visibilite = 'personnes' and exists (
              select 1 from souvenirs.souvenir_personnes sp
              where sp.souvenir_id = s.id and sp.personne_id in (select souvenirs.mes_personnes())
            ))
      )
  );
$$;

-- L'auteur, ou un membre de son foyer (sauf souvenir privé).
create or replace function souvenirs.peut_modifier(id_souvenir uuid)
returns boolean
language sql stable security definer
set search_path = souvenirs, pg_temp
as $$
  select exists (
    select 1 from souvenirs.souvenirs s
    where s.id = id_souvenir
      and (
        s.cree_par = auth.uid()
        or (s.visibilite <> 'prive' and s.foyer_id in (select famille.mes_foyers()))
      )
  );
$$;

-- Fichier de l'espace "souvenirs-medias" : le premier dossier du chemin est
-- l'identifiant du souvenir.
create or replace function souvenirs.souvenir_du_fichier(nom text)
returns uuid
language plpgsql immutable
set search_path = souvenirs, pg_temp
as $$
begin
  return split_part(nom, '/', 1)::uuid;
exception when others then
  return null;
end;
$$;

-- -------------------------------------------------------------------------
-- 4. Index de recherche
-- -------------------------------------------------------------------------

-- Poids : A titre ; B catégorie et ses mots-clés, lieu, pays, étiquettes,
-- années ; C récit ; D commentaires et légendes des photos. Les prénoms des
-- personnes ne sont pas indexés ici (ils peuvent changer) : rechercher() les
-- reconnaît au moment de la question.
create or replace function souvenirs.document_recherche(s souvenirs.souvenirs)
returns tsvector
language sql stable security definer
set search_path = souvenirs, pg_temp
as $$
  select
       setweight(to_tsvector('souvenirs.fr', coalesce(s.titre, '')), 'A')
    || setweight(to_tsvector('souvenirs.fr', concat_ws(' ',
         (select c.libelle || ' ' || c.mots_cles from souvenirs.categories c where c.code = s.categorie),
         s.lieu, s.pays, array_to_string(s.etiquettes, ' '),
         extract(year from s.date_debut)::int::text,
         extract(year from s.date_fin)::int::text
       )), 'B')
    || setweight(to_tsvector('souvenirs.fr', coalesce(s.recit, '')), 'C')
    || setweight(to_tsvector('souvenirs.fr', concat_ws(' ',
         (select string_agg(co.texte, ' ') from souvenirs.commentaires co where co.souvenir_id = s.id),
         (select string_agg(m.legende, ' ') from souvenirs.medias m where m.souvenir_id = s.id)
       )), 'D');
$$;

-- Texte court pour la recherche approchée (fautes de frappe, début de mot).
create or replace function souvenirs.texte_court(s souvenirs.souvenirs)
returns text
language sql stable
set search_path = souvenirs, pg_temp
as $$
  select souvenirs.normaliser(concat_ws(' ',
    s.titre, s.lieu, s.pays, array_to_string(s.etiquettes, ' '),
    (select c.libelle from souvenirs.categories c where c.code = s.categorie)
  ));
$$;

-- -------------------------------------------------------------------------
-- 5. Déclencheurs
-- -------------------------------------------------------------------------

-- Souvenir : foyer de l'auteur rempli à la création ; auteur, famille et
-- foyer figés ensuite ; seul l'auteur peut rendre un souvenir privé ;
-- couverture choisie parmi ses propres médias ; index de recherche recalculé.
create or replace function souvenirs.regler_souvenir()
returns trigger
language plpgsql security definer
set search_path = souvenirs, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    if new.foyer_id is null then
      new.foyer_id := (
        select fm.foyer_id from famille.foyer_membres fm
        where fm.utilisateur_id = coalesce(new.cree_par, auth.uid()) limit 1
      );
    end if;
  else
    new.cree_par := old.cree_par;
    new.famille_id := old.famille_id;
    new.foyer_id := old.foyer_id;
    new.cree_le := old.cree_le;
    if new.visibilite = 'prive' and old.visibilite <> 'prive'
       and auth.uid() is not null and auth.uid() is distinct from old.cree_par then
      raise exception 'Seul l''auteur peut rendre ce souvenir privé';
    end if;
    if (new.titre, new.recit, new.categorie, new.date_debut, new.date_fin, new.precision_date,
        new.lieu, new.pays, new.latitude, new.longitude, new.etiquettes, new.visibilite,
        new.voyage_id, new.couverture_id)
       is distinct from
       (old.titre, old.recit, old.categorie, old.date_debut, old.date_fin, old.precision_date,
        old.lieu, old.pays, old.latitude, old.longitude, old.etiquettes, old.visibilite,
        old.voyage_id, old.couverture_id) then
      new.maj_le := now();
    end if;
  end if;

  if new.couverture_id is not null and not exists (
    select 1 from souvenirs.medias m where m.id = new.couverture_id and m.souvenir_id = new.id
  ) then
    raise exception 'La couverture doit être un média de ce souvenir';
  end if;

  new.etiquettes := coalesce(
    (select array_agg(distinct trim(e)) from unnest(new.etiquettes) e where trim(e) <> ''),
    '{}'
  );
  new.recherche := souvenirs.document_recherche(new);
  new.texte_recherche := souvenirs.texte_court(new);
  return new;
end;
$$;

create trigger regler_souvenir
before insert or update on souvenirs.souvenirs
for each row execute function souvenirs.regler_souvenir();

-- Médias : rattachement figé, chemin rangé dans le dossier du souvenir.
create or replace function souvenirs.regler_media()
returns trigger
language plpgsql
set search_path = souvenirs, pg_temp
as $$
begin
  if tg_op = 'UPDATE' then
    new.souvenir_id := old.souvenir_id;
    new.chemin := old.chemin;
    new.ajoute_par := old.ajoute_par;
    new.cree_le := old.cree_le;
  elsif souvenirs.souvenir_du_fichier(new.chemin) is distinct from new.souvenir_id then
    raise exception 'Le fichier doit être rangé dans le dossier du souvenir (%/…)', new.souvenir_id;
  end if;
  return new;
end;
$$;

create trigger regler_media
before insert or update on souvenirs.medias
for each row execute function souvenirs.regler_media();

-- Commentaires : rattachement et auteur figés, média du même souvenir.
create or replace function souvenirs.regler_commentaire()
returns trigger
language plpgsql
set search_path = souvenirs, pg_temp
as $$
begin
  if tg_op = 'UPDATE' then
    new.souvenir_id := old.souvenir_id;
    new.media_id := old.media_id;
    new.auteur := old.auteur;
    new.cree_le := old.cree_le;
    new.maj_le := now();
  elsif new.media_id is not null and not exists (
    select 1 from souvenirs.medias m where m.id = new.media_id and m.souvenir_id = new.souvenir_id
  ) then
    raise exception 'Ce média n''appartient pas à ce souvenir';
  end if;
  return new;
end;
$$;

create trigger regler_commentaire
before insert or update on souvenirs.commentaires
for each row execute function souvenirs.regler_commentaire();

-- Un commentaire ou une légende change : on recalcule l'index du souvenir
-- (la mise à jour déclenche regler_souvenir, sans changer maj_le).
create or replace function souvenirs.reindexer_parent()
returns trigger
language plpgsql security definer
set search_path = souvenirs, pg_temp
as $$
declare
  id_souvenir uuid := case when tg_op = 'DELETE' then old.souvenir_id else new.souvenir_id end;
begin
  if tg_op = 'UPDATE' and tg_table_name = 'medias'
     and to_jsonb(new) ->> 'legende' is not distinct from to_jsonb(old) ->> 'legende' then
    return null;
  end if;
  update souvenirs.souvenirs set recherche = null where id = id_souvenir;
  return null;
end;
$$;

create trigger reindexer_parent
after insert or update or delete on souvenirs.commentaires
for each row execute function souvenirs.reindexer_parent();
create trigger reindexer_parent
after insert or update or delete on souvenirs.medias
for each row execute function souvenirs.reindexer_parent();

-- -------------------------------------------------------------------------
-- 6. Règles RLS
-- -------------------------------------------------------------------------

alter table souvenirs.categories enable row level security;
alter table souvenirs.souvenirs enable row level security;
alter table souvenirs.souvenir_personnes enable row level security;
alter table souvenirs.medias enable row level security;
alter table souvenirs.commentaires enable row level security;

create policy "Voir les catégories" on souvenirs.categories
  for select using (true);

-- La condition directe sur cree_par permet de relire le souvenir qu'on vient
-- de créer (peut_voir() ne voit pas encore la ligne en cours d'insertion).
create policy "Voir les souvenirs" on souvenirs.souvenirs
  for select using (cree_par = auth.uid() or souvenirs.peut_voir(id));
create policy "Créer un souvenir dans ses familles" on souvenirs.souvenirs
  for insert with check (famille_id in (select famille.mes_familles()) and cree_par = auth.uid());
create policy "Modifier un souvenir" on souvenirs.souvenirs
  for update using (souvenirs.peut_modifier(id)) with check (souvenirs.peut_modifier(id));
create policy "Supprimer un souvenir" on souvenirs.souvenirs
  for delete using (souvenirs.peut_modifier(id));

-- Personnes : celui qui gère le souvenir les choisit ; chacun peut ajouter
-- « j'y étais » pour soi (ou son enfant) sur un souvenir qu'il voit.
create policy "Voir les personnes d'un souvenir" on souvenirs.souvenir_personnes
  for select using (souvenirs.peut_voir(souvenir_id));
create policy "Ajouter une personne à un souvenir" on souvenirs.souvenir_personnes
  for insert with check (
    (souvenirs.peut_modifier(souvenir_id) and personne_id in (select souvenirs.personnes_de_mes_familles()))
    or (
      souvenirs.peut_voir(souvenir_id)
      and personne_id in (select souvenirs.mes_personnes())
      and role = 'present'
    )
  );
create policy "Changer le rôle d'une personne" on souvenirs.souvenir_personnes
  for update using (souvenirs.peut_modifier(souvenir_id))
  with check (souvenirs.peut_modifier(souvenir_id));
create policy "Retirer une personne d'un souvenir" on souvenirs.souvenir_personnes
  for delete using (
    souvenirs.peut_modifier(souvenir_id) or personne_id in (select souvenirs.mes_personnes())
  );

-- Médias : quiconque voit le souvenir peut en ajouter.
create policy "Voir les médias" on souvenirs.medias
  for select using (souvenirs.peut_voir(souvenir_id));
create policy "Ajouter un média" on souvenirs.medias
  for insert with check (ajoute_par = auth.uid() and souvenirs.peut_voir(souvenir_id));
create policy "Modifier un média" on souvenirs.medias
  for update using (ajoute_par = auth.uid() or souvenirs.peut_modifier(souvenir_id))
  with check (ajoute_par = auth.uid() or souvenirs.peut_modifier(souvenir_id));
create policy "Supprimer un média" on souvenirs.medias
  for delete using (ajoute_par = auth.uid() or souvenirs.peut_modifier(souvenir_id));

-- Commentaires : quiconque voit le souvenir peut commenter.
create policy "Voir les commentaires" on souvenirs.commentaires
  for select using (souvenirs.peut_voir(souvenir_id));
create policy "Commenter" on souvenirs.commentaires
  for insert with check (auteur = auth.uid() and souvenirs.peut_voir(souvenir_id));
create policy "Modifier son commentaire" on souvenirs.commentaires
  for update using (auteur = auth.uid()) with check (auteur = auth.uid());
create policy "Supprimer un commentaire" on souvenirs.commentaires
  for delete using (auteur = auth.uid() or souvenirs.peut_modifier(souvenir_id));

grant select, insert, update, delete on all tables in schema souvenirs to authenticated;
revoke insert, update, delete on souvenirs.categories from authenticated;

-- -------------------------------------------------------------------------
-- 7. Espace de stockage privé des médias
-- -------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'souvenirs-medias', 'souvenirs-medias', false, 52428800,
  array['image/*', 'video/*', 'audio/*', 'application/pdf']
)
on conflict (id) do nothing;

drop policy if exists "Souvenirs : voir un média" on storage.objects;
create policy "Souvenirs : voir un média"
on storage.objects for select
to authenticated
using (bucket_id = 'souvenirs-medias' and souvenirs.peut_voir(souvenirs.souvenir_du_fichier(name)));

drop policy if exists "Souvenirs : ajouter un média" on storage.objects;
create policy "Souvenirs : ajouter un média"
on storage.objects for insert
to authenticated
with check (bucket_id = 'souvenirs-medias' and souvenirs.peut_voir(souvenirs.souvenir_du_fichier(name)));

drop policy if exists "Souvenirs : supprimer un média" on storage.objects;
create policy "Souvenirs : supprimer un média"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'souvenirs-medias'
  and (owner = auth.uid() or souvenirs.peut_modifier(souvenirs.souvenir_du_fichier(name)))
);

-- -------------------------------------------------------------------------
-- 8. Fonctions appelées par l'app
-- -------------------------------------------------------------------------

-- Recherche dans les souvenirs de la famille active (ou id_famille).
--
-- question : texte libre, ex. « quand sommes-nous allés en Irlande ? »,
--   « quand Sybille a-t-elle commencé à marcher ? », « Noël 2019 »,
--   « irl » (début de mot) ou « irelande » (faute de frappe). Les petits
--   mots (quand, nous, est…) sont ignorés, chaque mot restant compte, les
--   prénoms de la famille sont reconnus et favorisent les souvenirs de ces
--   personnes. Vide : tous les souvenirs, du plus récent au plus ancien
--   (fil chronologique, avec les filtres).
-- Filtres facultatifs : catégorie, personne, période.
--
-- Chaque résultat donne ses dates, un extrait du récit, la photo de
-- couverture et les personnes avec leur âge en mois à la date du souvenir
-- (« Sybille, 13 mois »). Respecte les règles RLS (security invoker).
create or replace function souvenirs.rechercher(
  question text default '',
  id_famille uuid default null,
  categorie_code text default null,
  id_personne uuid default null,
  depuis date default null,
  jusqu_a date default null,
  limite integer default 30
)
returns table (
  id uuid, titre text, categorie text, date_debut date, date_fin date, precision_date text,
  lieu text, pays text, extrait text, couverture text, nb_medias integer,
  nb_commentaires integer, personnes jsonb, pertinence real
)
language plpgsql stable
set search_path = souvenirs, pg_temp
as $$
#variable_conflict use_column
declare
  fam uuid := coalesce(id_famille, famille.ma_famille());
  texte_norm text := souvenirs.normaliser(question);
  q tsquery;
  mots text[];
  lexemes text[];
begin
  if auth.uid() is null or fam is null or fam not in (select famille.mes_familles()) then
    raise exception 'Famille introuvable';
  end if;

  -- Mots utiles de la question (hors mots vides du français).
  select array_agg(distinct m.mot) into mots
  from regexp_split_to_table(lower(coalesce(question, '')), '[^[:alnum:]]+') as m(mot)
  where length(m.mot) >= 2
    and to_tsvector('pg_catalog.french', m.mot) <> ''::tsvector;

  -- Requête "un mot OU l'autre" ; la pertinence compte ensuite la part des
  -- mots de la question retrouvés dans chaque souvenir.
  select array_agg(distinct t.lexeme) into lexemes
  from unnest(coalesce(mots, '{}')) as m(mot)
  cross join lateral unnest(to_tsvector('souvenirs.fr', m.mot)) as t;

  if cardinality(lexemes) > 0 then
    select to_tsquery('simple', string_agg(quote_literal(l), ' | '))
      into q
    from unnest(lexemes) as l;
  end if;

  return query
  with prenoms as (
    select p.id as personne_id
    from famille.personnes p
    where p.id in (select souvenirs.personnes_de_mes_familles())
      and length(souvenirs.normaliser(p.prenom)) >= 2
      and texte_norm ~ ('\m' || regexp_replace(souvenirs.normaliser(p.prenom), '([^[:alnum:][:space:]])', '\\\1', 'g') || '\M')
  ),
  candidats as (
    select s.*,
      case when q is null then 0
           else ts_rank(s.recherche, q, 32) end as r_texte,
      case when q is null then 0
           else (select count(*) from unnest(lexemes) as l
                 where s.recherche @@ to_tsquery('simple', quote_literal(l)))::real
                / cardinality(lexemes) end as r_mots,
      exists (
        select 1 from souvenirs.souvenir_personnes sp
        where sp.souvenir_id = s.id and sp.personne_id in (select pr.personne_id from prenoms pr)
      ) as r_personne,
      coalesce((
        select max(extensions.word_similarity(souvenirs.normaliser(m.mot), s.texte_recherche))
        from unnest(coalesce(mots, '{}')) as m(mot)
        where length(m.mot) >= 3
      ), 0) as r_approche
    from souvenirs.souvenirs s
    where s.famille_id = fam
      and (categorie_code is null or s.categorie = categorie_code)
      and (id_personne is null or exists (
            select 1 from souvenirs.souvenir_personnes sp
            where sp.souvenir_id = s.id and sp.personne_id = id_personne))
      and (depuis is null or coalesce(s.date_fin, s.date_debut) >= depuis)
      and (jusqu_a is null or s.date_debut <= jusqu_a)
  )
  select
    c.id, c.titre, c.categorie, c.date_debut, c.date_fin, c.precision_date, c.lieu, c.pays,
    case
      when c.recit is null then null
      when q is not null and c.recherche @@ q then
        ts_headline('souvenirs.fr', c.recit, q, 'MaxWords=30, MinWords=12, StartSel=«, StopSel=»')
      else left(c.recit, 200)
    end,
    coalesce(
      (select m.chemin from souvenirs.medias m where m.id = c.couverture_id),
      (select m.chemin from souvenirs.medias m
        where m.souvenir_id = c.id and m.type = 'photo' order by m.ordre, m.cree_le limit 1)
    ),
    (select count(*)::int from souvenirs.medias m where m.souvenir_id = c.id),
    (select count(*)::int from souvenirs.commentaires co where co.souvenir_id = c.id),
    (select coalesce(jsonb_agg(jsonb_build_object(
        'id', p.id,
        'prenom', p.prenom,
        'role', sp.role,
        'age_mois', case when p.date_naissance is not null and c.date_debut >= p.date_naissance then
                      (extract(year from age(c.date_debut, p.date_naissance)) * 12
                       + extract(month from age(c.date_debut, p.date_naissance)))::int end
      ) order by sp.role desc, p.prenom), '[]'::jsonb)
      from souvenirs.souvenir_personnes sp
      join famille.personnes p on p.id = sp.personne_id
      where sp.souvenir_id = c.id),
    (c.r_mots + c.r_texte * 0.3
      + case when c.r_personne then 0.5 else 0 end
      + case when c.r_approche >= 0.5 then c.r_approche * 0.3 else 0 end)::real
  from candidats c
  where (q is null and not exists (select 1 from prenoms) and coalesce(cardinality(mots), 0) = 0)
     or (q is not null and c.recherche @@ q)
     or c.r_personne
     or c.r_approche >= 0.5
  order by 14 desc, c.date_debut desc nulls last
  limit greatest(1, least(coalesce(limite, 30), 200));
end;
$$;

-- « Ce jour-là » : souvenirs datés au jour près tombant le même jour des
-- années passées (famille active par défaut).
create or replace function souvenirs.ce_jour_la(jour date default current_date, id_famille uuid default null)
returns setof souvenirs.souvenirs
language sql stable
set search_path = souvenirs, pg_temp
as $$
  select s.* from souvenirs.souvenirs s
  where s.famille_id = coalesce(id_famille, famille.ma_famille())
    and s.precision_date = 'jour'
    and s.date_debut < jour
    and extract(month from s.date_debut) = extract(month from jour)
    and extract(day from s.date_debut) = extract(day from jour)
  order by s.date_debut desc;
$$;

-- Créer le souvenir d'un voyage de VoyageCommun (titre, dates, destination,
-- participants présents). Visibilité : "famille" pour un voyage en famille,
-- "personnes" pour un voyage en amoureux ou entre quelques personnes.
-- Renvoie le souvenir existant s'il a déjà été créé.
create or replace function souvenirs.creer_depuis_voyage(id_voyage uuid)
returns uuid
language plpgsql
set search_path = souvenirs, pg_temp
as $$
declare
  v voyage.voyages;
  nouveau uuid;
begin
  if auth.uid() is null or not voyage.peut_voir(id_voyage) then
    raise exception 'Voyage introuvable';
  end if;

  select s.id into nouveau from souvenirs.souvenirs s where s.voyage_id = id_voyage limit 1;
  if nouveau is not null then
    return nouveau;
  end if;

  select * into v from voyage.voyages where id = id_voyage;

  insert into souvenirs.souvenirs (
    famille_id, titre, recit, categorie, date_debut, date_fin, precision_date,
    lieu, pays, latitude, longitude, visibilite, voyage_id
  ) values (
    v.famille_id, v.titre, v.description, 'voyage',
    coalesce(v.date_debut, case when v.annee is not null then make_date(v.annee, 1, 1) end),
    v.date_fin,
    case when v.date_debut is not null then 'jour' when v.annee is not null then 'annee' else 'jour' end,
    v.destination, v.pays, v.latitude, v.longitude,
    case when v.participation = 'famille' then 'famille' else 'personnes' end,
    v.id
  )
  returning id into nouveau;

  insert into souvenirs.souvenir_personnes (souvenir_id, personne_id, role)
  select nouveau, pa.personne_id, 'present'
  from voyage.participants pa
  where pa.voyage_id = id_voyage and pa.reponse in ('partant', 'peut_etre')
    and pa.personne_id in (select souvenirs.personnes_de_mes_familles())
  on conflict do nothing;

  return nouveau;
end;
$$;

-- Chemins des fichiers d'un souvenir, à supprimer du stockage avant de
-- supprimer le souvenir (la base ne peut pas effacer les fichiers elle-même).
create or replace function souvenirs.fichiers_du_souvenir(id_souvenir uuid)
returns setof text
language sql stable
set search_path = souvenirs, pg_temp
as $$
  select m.chemin from souvenirs.medias m where m.souvenir_id = id_souvenir;
$$;

revoke execute on all functions in schema souvenirs from public, anon;
grant execute on function
  souvenirs.normaliser(text),
  souvenirs.mes_personnes(), souvenirs.personnes_de_mes_familles(),
  souvenirs.peut_voir(uuid), souvenirs.peut_modifier(uuid), souvenirs.souvenir_du_fichier(text),
  souvenirs.document_recherche(souvenirs.souvenirs), souvenirs.texte_court(souvenirs.souvenirs),
  souvenirs.rechercher(text, uuid, text, uuid, date, date, integer),
  souvenirs.ce_jour_la(date, uuid),
  souvenirs.creer_depuis_voyage(uuid),
  souvenirs.fichiers_du_souvenir(uuid)
to authenticated;

notify pgrst, 'reload schema';

commit;
