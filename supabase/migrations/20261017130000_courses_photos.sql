-- =========================================================================
-- Migration — Courses : photo d'un produit
--
-- On peut photographier un article (la bonne marque, le bon format). La
-- photo n'est pas attachée à l'article de la liste — il disparaît une fois
-- acheté — mais au PRODUIT, dans la mémoire du foyer (courses.produits,
-- même clé que pour le rayon retenu) : elle réapparaît chaque fois que ce
-- produit revient sur une liste du foyer, jusque dans le mode magasin.
--
--   - courses.produits.photo : chemin de la photo dans l'espace privé
--     « courses-photos » (dossier = foyer : <foyer>/<fichier>.jpg) ;
--   - qui voit et change la photo d'un produit : les membres du foyer, et
--     les personnes invitées sur une liste de ce foyer (elles font aussi
--     les courses) — courses.voit_foyer ; photos affichées par adresses
--     signées, jamais publiques.
--
-- Pré-requis : 20261017120000_courses_recettes.sql.
-- =========================================================================

begin;

alter table courses.produits add column if not exists photo text;

-- Puis-je voir les produits (et leurs photos) de ce foyer ? Membre du foyer,
-- ou invité sur l'une de ses listes.
create or replace function courses.voit_foyer(id_foyer uuid)
returns boolean
language sql stable security definer
set search_path = courses, famille, pg_temp
as $$
  select id_foyer in (select famille.mes_foyers())
    or exists (
      select 1 from courses.listes l
      where l.foyer_id = id_foyer and courses.peut_voir_liste(l.id)
    );
$$;
grant execute on function courses.voit_foyer(uuid) to authenticated;

-- Mémoire des produits : lisible et modifiable aussi par les invités d'une
-- liste du foyer (rayon retenu, photo) ; seul le foyer supprime.
drop policy if exists "Courses : produits du foyer" on courses.produits;
create policy "Courses : voir les produits" on courses.produits
  for select using (courses.voit_foyer(foyer_id));
create policy "Courses : ajouter un produit" on courses.produits
  for insert with check (courses.voit_foyer(foyer_id));
create policy "Courses : modifier un produit" on courses.produits
  for update using (courses.voit_foyer(foyer_id)) with check (courses.voit_foyer(foyer_id));
create policy "Courses : supprimer un produit" on courses.produits
  for delete using (foyer_id in (select famille.mes_foyers()));

-- -------------------------------------------------------------------------
-- Espace de stockage privé des photos
-- -------------------------------------------------------------------------

-- Foyer d'un fichier de « courses-photos » : premier dossier du chemin.
create or replace function courses.foyer_du_fichier(nom text)
returns uuid
language plpgsql immutable
set search_path = courses, pg_temp
as $$
begin
  return split_part(nom, '/', 1)::uuid;
exception when others then
  return null;
end;
$$;
grant execute on function courses.foyer_du_fichier(text) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('courses-photos', 'courses-photos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

drop policy if exists "Courses : voir une photo de produit" on storage.objects;
create policy "Courses : voir une photo de produit"
on storage.objects for select
to authenticated
using (bucket_id = 'courses-photos' and courses.voit_foyer(courses.foyer_du_fichier(name)));

drop policy if exists "Courses : ajouter une photo de produit" on storage.objects;
create policy "Courses : ajouter une photo de produit"
on storage.objects for insert
to authenticated
with check (bucket_id = 'courses-photos' and courses.voit_foyer(courses.foyer_du_fichier(name)));

drop policy if exists "Courses : supprimer une photo de produit" on storage.objects;
create policy "Courses : supprimer une photo de produit"
on storage.objects for delete
to authenticated
using (bucket_id = 'courses-photos' and courses.voit_foyer(courses.foyer_du_fichier(name)));

notify pgrst, 'reload schema';

commit;
