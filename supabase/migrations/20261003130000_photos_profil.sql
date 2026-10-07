-- =========================================================================
-- Migration — Compte famille : photos de profil
--
-- Chaque personne de la famille (avec ou sans compte) peut avoir une photo,
-- affichée en petit à côté de son prénom dans toutes les apps (Cuisine,
-- CadeauCommun, VoyageCommun, SouvenirsFamille).
--
--   - famille.personnes.photo : chemin du fichier dans l'espace de stockage
--     PRIVÉ "famille-photos" (« <id de la personne>/<nom>.jpg »). Les apps
--     l'affichent par adresses signées, jamais publiques.
--   - Qui peut changer une photo (famille.peut_modifier_photo) :
--       * chacun la sienne ;
--       * les membres d'un foyer, celle des personnes sans compte de ce
--         foyer (bébé, enfant…) ;
--       * les « gestionnaires des photos » (famille.gestionnaires_photos),
--         celle de n'importe quelle personne de leurs familles. Au départ :
--         le compte ymorel76@gmail.com, qui pose les photos initiales.
--   - Qui peut voir une photo : toute personne qui voit la fiche
--     (familles en commun), comme le prénom.
--
-- Pré-requis : 20260928140000_socle_famille.sql.
-- =========================================================================

begin;

-- -------------------------------------------------------------------------
-- 1. Colonne et gestionnaires
-- -------------------------------------------------------------------------

alter table famille.personnes add column if not exists photo text;

comment on column famille.personnes.photo is
  'Photo de profil : chemin dans l''espace privé "famille-photos" (<id personne>/<fichier>), null sans photo.';

create table if not exists famille.gestionnaires_photos (
  utilisateur_id uuid primary key references auth.users (id) on delete cascade,
  ajoute_le timestamptz not null default now()
);

comment on table famille.gestionnaires_photos is
  'Comptes autorisés à changer la photo de n''importe quelle personne de leurs familles.';

alter table famille.gestionnaires_photos enable row level security;
-- Lecture de sa propre ligne seulement ; ajouts et retraits depuis l'éditeur
-- SQL de Supabase (aucune écriture depuis les apps).
drop policy if exists "Voir si je gère les photos" on famille.gestionnaires_photos;
create policy "Voir si je gère les photos" on famille.gestionnaires_photos
  for select using (utilisateur_id = auth.uid());
revoke insert, update, delete on famille.gestionnaires_photos from authenticated;
grant select on famille.gestionnaires_photos to authenticated;

insert into famille.gestionnaires_photos (utilisateur_id)
select id from auth.users where lower(email) = 'ymorel76@gmail.com'
on conflict (utilisateur_id) do nothing;

-- -------------------------------------------------------------------------
-- 2. Droits
-- -------------------------------------------------------------------------

create or replace function famille.gere_les_photos()
returns boolean
language sql stable security definer
set search_path = famille, pg_temp
as $$
  select exists (select 1 from famille.gestionnaires_photos where utilisateur_id = auth.uid());
$$;

create or replace function famille.peut_voir_personne(id_personne uuid)
returns boolean
language sql stable security definer
set search_path = famille, pg_temp
as $$
  select exists (
    select 1 from famille.personnes p
    where p.id = id_personne
      and (p.utilisateur_id = auth.uid() or p.foyer_id in (select famille.foyers_de_mes_familles()))
  );
$$;

create or replace function famille.peut_modifier_photo(id_personne uuid)
returns boolean
language sql stable security definer
set search_path = famille, pg_temp
as $$
  select exists (
    select 1 from famille.personnes p
    where p.id = id_personne
      and (
        p.utilisateur_id = auth.uid()
        or (p.utilisateur_id is null and p.foyer_id in (select famille.mes_foyers()))
        or (famille.gere_les_photos() and p.foyer_id in (select famille.foyers_de_mes_familles()))
      )
  );
$$;

-- Fichier de l'espace "famille-photos" : le premier dossier du chemin est
-- l'identifiant de la personne.
create or replace function famille.personne_du_fichier(nom text)
returns uuid
language plpgsql immutable
set search_path = famille, pg_temp
as $$
begin
  return split_part(nom, '/', 1)::uuid;
exception when others then
  return null;
end;
$$;

-- Enregistre (ou retire, chemin null) la photo d'une personne. Renvoie le
-- chemin de l'ancienne photo, que l'app supprime ensuite de l'espace.
create or replace function famille.definir_photo_personne(id_personne uuid, chemin text)
returns text
language plpgsql security definer
set search_path = famille, pg_temp
as $$
declare
  ancienne text;
begin
  if not famille.peut_modifier_photo(id_personne) then
    raise exception 'Vous ne pouvez pas changer la photo de cette personne.';
  end if;
  if chemin is not null and famille.personne_du_fichier(chemin) is distinct from id_personne then
    raise exception 'Chemin de photo invalide.';
  end if;
  select photo into ancienne from famille.personnes where id = id_personne;
  update famille.personnes set photo = chemin, maj_le = now() where id = id_personne;
  return ancienne;
end;
$$;

revoke all on function famille.definir_photo_personne(uuid, text) from public;
grant execute on function famille.definir_photo_personne(uuid, text) to authenticated;
grant execute on function famille.gere_les_photos() to authenticated;
grant execute on function famille.peut_modifier_photo(uuid) to authenticated;
grant execute on function famille.peut_voir_personne(uuid) to authenticated;

-- La colonne photo ne se change que par definir_photo_personne (les règles
-- de la table laissent chacun modifier sa fiche : on retire donc le droit
-- d'écrire directement cette colonne).
revoke update on famille.personnes from authenticated;
grant update (foyer_id, prenom, date_naissance, tailles, gere_par, maj_le) on famille.personnes to authenticated;

-- -------------------------------------------------------------------------
-- 3. Espace de stockage privé
-- -------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('famille-photos', 'famille-photos', false, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

drop policy if exists "Famille : voir une photo de profil" on storage.objects;
create policy "Famille : voir une photo de profil"
on storage.objects for select
to authenticated
using (bucket_id = 'famille-photos' and famille.peut_voir_personne(famille.personne_du_fichier(name)));

drop policy if exists "Famille : ajouter une photo de profil" on storage.objects;
create policy "Famille : ajouter une photo de profil"
on storage.objects for insert
to authenticated
with check (bucket_id = 'famille-photos' and famille.peut_modifier_photo(famille.personne_du_fichier(name)));

drop policy if exists "Famille : supprimer une photo de profil" on storage.objects;
create policy "Famille : supprimer une photo de profil"
on storage.objects for delete
to authenticated
using (bucket_id = 'famille-photos' and famille.peut_modifier_photo(famille.personne_du_fichier(name)));

notify pgrst, 'reload schema';

commit;
