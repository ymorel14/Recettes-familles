-- =========================================================================
-- Migration — Quotidien : inventaires de la maison
--
-- Savoir ce que l'on possède, où c'est rangé, depuis quand, et à qui on l'a
-- prêté. Tout reste DANS LE FOYER (règles RLS), comme les tâches et
-- l'argent de poche : ni la famille, ni les groupes de covoiturage n'y ont
-- accès.
--
--   - inventaires : des domaines au choix (Outils, Livres, Cave à vin,
--     Camping, Décorations de Noël…) ;
--   - lieux : endroits de rangement du foyer (garage, cave, atelier…),
--     communs à tous les inventaires, avec une photo ;
--   - contenants : boîte numérotée, carton, placard, étagère… rangés dans un
--     lieu (ou « sans lieu » le temps d'un déménagement), avec une photo.
--     Déplacer un contenant déplace tout ce qu'il contient ;
--   - objets : nom, description, quantité, photo, rangé soit dans un
--     contenant, soit directement dans un lieu ; « rangé depuis » se remet à
--     la date du jour quand on change l'objet de place ; « possédé depuis »
--     facultatif ;
--   - prets : à une personne de la famille (n'importe quel foyer) ou à un
--     nom libre (voisin, ami), date du prêt, retour prévu, date de retour.
--
-- Photos : espace de stockage PRIVÉ "quotidien-inventaires", chemins
-- « <id du foyer>/<fichier>.jpg », affichées par adresses signées.
--
-- Pré-requis : migrations quotidien précédentes (schéma quotidien).
-- =========================================================================

begin;

-- -------------------------------------------------------------------------
-- 1. Tables
-- -------------------------------------------------------------------------

create table quotidien.inventaires (
  id uuid primary key default gen_random_uuid(),
  foyer_id uuid not null references famille.foyers (id) on delete cascade,
  nom text not null check (length(trim(nom)) between 1 and 80),
  -- Nom d'icône Ionicons (facultatif).
  icone text,
  cree_par uuid default auth.uid() references auth.users (id) on delete set null,
  cree_le timestamptz not null default now()
);
create index inventaires_foyer on quotidien.inventaires (foyer_id);

create table quotidien.lieux (
  id uuid primary key default gen_random_uuid(),
  foyer_id uuid not null references famille.foyers (id) on delete cascade,
  nom text not null check (length(trim(nom)) between 1 and 80),
  photo text,
  cree_le timestamptz not null default now()
);
create index lieux_foyer on quotidien.lieux (foyer_id);

create table quotidien.contenants (
  id uuid primary key default gen_random_uuid(),
  foyer_id uuid not null references famille.foyers (id) on delete cascade,
  -- Lieu où il se trouve ; null = pas de lieu (lieu supprimé, en transit…).
  lieu_id uuid references quotidien.lieux (id) on delete set null,
  nom text not null check (length(trim(nom)) between 1 and 80),
  -- Numéro facultatif : « Boîte » n° 12.
  numero integer check (numero is null or numero between 0 and 100000),
  photo text,
  cree_le timestamptz not null default now()
);
create index contenants_foyer on quotidien.contenants (foyer_id);
create index contenants_lieu on quotidien.contenants (lieu_id);

create table quotidien.objets (
  id uuid primary key default gen_random_uuid(),
  foyer_id uuid not null references famille.foyers (id) on delete cascade,
  inventaire_id uuid not null references quotidien.inventaires (id) on delete cascade,
  nom text not null check (length(trim(nom)) between 1 and 120),
  description text,
  quantite integer not null default 1 check (quantite between 0 and 100000),
  -- Emplacement : un contenant (son lieu fait foi), sinon un lieu, sinon rien.
  lieu_id uuid references quotidien.lieux (id) on delete set null,
  contenant_id uuid references quotidien.contenants (id) on delete set null,
  range_depuis date,
  possede_depuis date,
  photo text,
  cree_par uuid default auth.uid() references auth.users (id) on delete set null,
  cree_le timestamptz not null default now(),
  maj_le timestamptz not null default now()
);
create index objets_foyer on quotidien.objets (foyer_id);
create index objets_inventaire on quotidien.objets (inventaire_id);
create index objets_lieu on quotidien.objets (lieu_id);
create index objets_contenant on quotidien.objets (contenant_id);

create table quotidien.prets (
  id uuid primary key default gen_random_uuid(),
  foyer_id uuid not null references famille.foyers (id) on delete cascade,
  objet_id uuid not null references quotidien.objets (id) on delete cascade,
  -- Personne de la famille (facultatif) ; emprunteur = nom affiché, toujours
  -- renseigné (prénom de la personne au moment du prêt, ou nom libre).
  personne_id uuid references famille.personnes (id) on delete set null,
  emprunteur text not null check (length(trim(emprunteur)) between 1 and 80),
  quantite integer not null default 1 check (quantite between 1 and 100000),
  prete_le date not null default current_date,
  retour_prevu date,
  rendu_le date,
  note text,
  cree_par uuid default auth.uid() references auth.users (id) on delete set null,
  cree_le timestamptz not null default now(),
  check (retour_prevu is null or retour_prevu >= prete_le),
  check (rendu_le is null or rendu_le >= prete_le)
);
create index prets_foyer on quotidien.prets (foyer_id);
create index prets_objet on quotidien.prets (objet_id);
create index prets_en_cours on quotidien.prets (foyer_id) where rendu_le is null;

-- -------------------------------------------------------------------------
-- 2. Cohérence (tout dans le même foyer) et dates automatiques
-- -------------------------------------------------------------------------

create or replace function quotidien.verifier_contenant()
returns trigger
language plpgsql security definer
set search_path = quotidien, pg_temp
as $$
begin
  if new.lieu_id is not null and not exists (
    select 1 from quotidien.lieux where id = new.lieu_id and foyer_id = new.foyer_id
  ) then
    raise exception 'Ce lieu n''appartient pas à votre foyer.';
  end if;
  return new;
end;
$$;

create trigger contenants_verifier
  before insert or update on quotidien.contenants
  for each row execute function quotidien.verifier_contenant();

create or replace function quotidien.verifier_objet()
returns trigger
language plpgsql security definer
set search_path = quotidien, pg_temp
as $$
begin
  if not exists (select 1 from quotidien.inventaires where id = new.inventaire_id and foyer_id = new.foyer_id) then
    raise exception 'Cet inventaire n''appartient pas à votre foyer.';
  end if;
  if new.contenant_id is not null then
    if not exists (select 1 from quotidien.contenants where id = new.contenant_id and foyer_id = new.foyer_id) then
      raise exception 'Ce contenant n''appartient pas à votre foyer.';
    end if;
    -- Dans un contenant : c'est le lieu du contenant qui compte.
    new.lieu_id := null;
  elsif new.lieu_id is not null and not exists (
    select 1 from quotidien.lieux where id = new.lieu_id and foyer_id = new.foyer_id
  ) then
    raise exception 'Ce lieu n''appartient pas à votre foyer.';
  end if;

  if tg_op = 'INSERT' then
    if new.range_depuis is null and (new.lieu_id is not null or new.contenant_id is not null) then
      new.range_depuis := current_date;
    end if;
  else
    -- Changé de place sans nouvelle date : rangé depuis aujourd'hui.
    if (new.lieu_id is distinct from old.lieu_id or new.contenant_id is distinct from old.contenant_id)
       and new.range_depuis is not distinct from old.range_depuis then
      new.range_depuis := case when new.lieu_id is null and new.contenant_id is null then null else current_date end;
    end if;
    new.maj_le := now();
  end if;
  return new;
end;
$$;

create trigger objets_verifier
  before insert or update on quotidien.objets
  for each row execute function quotidien.verifier_objet();

create or replace function quotidien.verifier_pret()
returns trigger
language plpgsql security definer
set search_path = quotidien, pg_temp
as $$
begin
  if not exists (select 1 from quotidien.objets where id = new.objet_id and foyer_id = new.foyer_id) then
    raise exception 'Cet objet n''appartient pas à votre foyer.';
  end if;
  if new.personne_id is not null
     and (tg_op = 'INSERT' or new.personne_id is distinct from old.personne_id)
     and not famille.peut_voir_personne(new.personne_id) then
    raise exception 'Cette personne ne fait pas partie de votre famille.';
  end if;
  return new;
end;
$$;

create trigger prets_verifier
  before insert or update on quotidien.prets
  for each row execute function quotidien.verifier_pret();

-- -------------------------------------------------------------------------
-- 3. Règles RLS (foyer seulement)
-- -------------------------------------------------------------------------

alter table quotidien.inventaires enable row level security;
alter table quotidien.lieux enable row level security;
alter table quotidien.contenants enable row level security;
alter table quotidien.objets enable row level security;
alter table quotidien.prets enable row level security;

grant select, insert, update, delete on
  quotidien.inventaires, quotidien.lieux, quotidien.contenants, quotidien.objets, quotidien.prets
to authenticated;
grant all on
  quotidien.inventaires, quotidien.lieux, quotidien.contenants, quotidien.objets, quotidien.prets
to service_role;

do $$
declare
  t text;
begin
  foreach t in array array['inventaires', 'lieux', 'contenants', 'objets', 'prets'] loop
    execute format(
      'create policy "Foyer : voir" on quotidien.%I for select using (foyer_id in (select famille.mes_foyers()))', t);
    execute format(
      'create policy "Foyer : ajouter" on quotidien.%I for insert with check (foyer_id in (select famille.mes_foyers()))', t);
    execute format(
      'create policy "Foyer : modifier" on quotidien.%I for update using (foyer_id in (select famille.mes_foyers())) '
      || 'with check (foyer_id in (select famille.mes_foyers()))', t);
    execute format(
      'create policy "Foyer : supprimer" on quotidien.%I for delete using (foyer_id in (select famille.mes_foyers()))', t);
  end loop;
end;
$$;

-- -------------------------------------------------------------------------
-- 4. Espace de stockage privé des photos
-- -------------------------------------------------------------------------

-- Foyer d'un fichier de "quotidien-inventaires" : premier dossier du chemin.
create or replace function quotidien.foyer_du_fichier(nom text)
returns uuid
language plpgsql immutable
set search_path = quotidien, pg_temp
as $$
begin
  return split_part(nom, '/', 1)::uuid;
exception when others then
  return null;
end;
$$;

grant execute on function quotidien.foyer_du_fichier(text) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('quotidien-inventaires', 'quotidien-inventaires', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

drop policy if exists "Quotidien : voir une photo d'inventaire" on storage.objects;
create policy "Quotidien : voir une photo d'inventaire"
on storage.objects for select
to authenticated
using (bucket_id = 'quotidien-inventaires' and quotidien.foyer_du_fichier(name) in (select famille.mes_foyers()));

drop policy if exists "Quotidien : ajouter une photo d'inventaire" on storage.objects;
create policy "Quotidien : ajouter une photo d'inventaire"
on storage.objects for insert
to authenticated
with check (bucket_id = 'quotidien-inventaires' and quotidien.foyer_du_fichier(name) in (select famille.mes_foyers()));

drop policy if exists "Quotidien : supprimer une photo d'inventaire" on storage.objects;
create policy "Quotidien : supprimer une photo d'inventaire"
on storage.objects for delete
to authenticated
using (bucket_id = 'quotidien-inventaires' and quotidien.foyer_du_fichier(name) in (select famille.mes_foyers()));

notify pgrst, 'reload schema';

commit;
