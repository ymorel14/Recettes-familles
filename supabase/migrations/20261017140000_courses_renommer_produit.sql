-- =========================================================================
-- Migration — Courses : renommer un produit du foyer
--
-- Depuis la fiche produit (onglet « Habituels »), on peut renommer un
-- produit (« Yaourts » → « Yaourt nature »). Le nom d'un produit est aussi
-- sa clé : c'est par elle que l'app relie un article à son rayon retenu, sa
-- photo, son épingle et son historique d'achats. Renommer reporte donc le
-- nouveau nom partout, pour tout le foyer :
--   - courses.produits : nouveau nom et nouvelle clé ; si un produit porte
--     déjà ce nom, les deux sont FUSIONNÉS (achats additionnés, épingle,
--     rayon et photo gardés) ;
--   - courses.passage_articles : l'historique suit (habituels) ;
--   - courses.articles et courses.contributions : les articles du produit
--     sur les listes du foyer prennent le nouveau nom (la précision après une
--     virgule, « origan, émincé », est gardée).
--
-- courses.cle_produit(libelle) refait en SQL la clé calculée par l'app
-- (packages/courses/src/texte.ts, cleProduit) : sans accents, minuscules,
-- ligatures dépliées, pluriel simple retiré, texte après une virgule ignoré.
--
-- Réservé aux membres du foyer.
-- Pré-requis : 20261017130000_courses_photos.sql.
-- =========================================================================

begin;

create or replace function courses.cle_produit(libelle text)
returns text
language sql immutable
set search_path = courses, pg_temp
as $$
  with nom as (
    select coalesce(nullif(trim(split_part(coalesce(libelle, ''), ',', 1)), ''), trim(coalesce(libelle, ''))) as n
  ),
  texte as (
    select translate(
      replace(replace(lower(n), 'œ', 'oe'), 'æ', 'ae'),
      'àâäáãåāçćčéèêëēęíìîïīñńóòôöõøōúùûüūýÿ',
      'aaaaaaaccceeeeeeiiiiinnooooooouuuuuyy'
    ) as t
    from nom
  )
  select coalesce(string_agg(
    case when length(m) > 3 and (right(m, 1) = 's' or right(m, 1) = 'x') then left(m, -1) else m end,
    ' ' order by o), '')
  from texte, regexp_split_to_table(t, '[^a-z0-9]+') with ordinality as mots(m, o)
  where m <> '';
$$;
grant execute on function courses.cle_produit(text) to authenticated;

-- Renomme (ou fusionne) un produit du foyer. Renvoie le chemin d'une photo
-- devenue inutile (fusion de deux produits qui avaient chacun la leur),
-- que l'app supprime de l'espace de stockage ; null sinon.
create or replace function courses.renommer_produit(
  id_foyer uuid,
  ancienne_cle text,
  nouvelle_cle text,
  nouveau_libelle text
)
returns text
language plpgsql
security definer
set search_path = courses, famille, pg_temp
as $$
declare
  ancien courses.produits%rowtype;
  cible courses.produits%rowtype;
  photo_inutile text := null;
begin
  if id_foyer is null or id_foyer not in (select famille.mes_foyers()) then
    raise exception 'Seul le foyer peut renommer ses produits.' using errcode = '42501';
  end if;
  nouveau_libelle := trim(coalesce(nouveau_libelle, ''));
  nouvelle_cle := trim(coalesce(nouvelle_cle, ''));
  if nouveau_libelle = '' or nouvelle_cle = '' then
    raise exception 'Nom vide.' using errcode = '22023';
  end if;

  select * into ancien from courses.produits where foyer_id = id_foyer and cle = ancienne_cle for update;
  if not found then
    raise exception 'Produit introuvable.' using errcode = 'P0002';
  end if;

  if nouvelle_cle = ancienne_cle then
    update courses.produits set libelle = nouveau_libelle where foyer_id = id_foyer and cle = ancienne_cle;
  else
    select * into cible from courses.produits where foyer_id = id_foyer and cle = nouvelle_cle for update;
    if found then
      -- Fusion : on garde le produit qui porte déjà ce nom, enrichi.
      if cible.photo is not null and ancien.photo is not null then
        photo_inutile := ancien.photo;
      end if;
      update courses.produits set
        libelle = nouveau_libelle,
        nb_achats = cible.nb_achats + ancien.nb_achats,
        dernier_achat = greatest(cible.dernier_achat, ancien.dernier_achat),
        rayon_id = coalesce(cible.rayon_id, ancien.rayon_id),
        photo = coalesce(cible.photo, ancien.photo),
        epingle = cible.epingle or ancien.epingle,
        masque = cible.masque and ancien.masque
      where foyer_id = id_foyer and cle = nouvelle_cle;
      delete from courses.produits where foyer_id = id_foyer and cle = ancienne_cle;
    else
      update courses.produits set cle = nouvelle_cle, libelle = nouveau_libelle
      where foyer_id = id_foyer and cle = ancienne_cle;
    end if;

    update courses.passage_articles pa set cle = nouvelle_cle
    from courses.passages p, courses.listes l
    where pa.passage_id = p.id and p.liste_id = l.id and l.foyer_id = id_foyer and pa.cle = ancienne_cle;
  end if;

  -- Articles et détail par recette des listes du foyer.
  update courses.articles a
  set libelle = nouveau_libelle || case when position(',' in a.libelle) > 0 then substr(a.libelle, position(',' in a.libelle)) else '' end
  from courses.listes l
  where a.liste_id = l.id and l.foyer_id = id_foyer and courses.cle_produit(a.libelle) = ancienne_cle;

  update courses.contributions c
  set libelle = nouveau_libelle || case when position(',' in c.libelle) > 0 then substr(c.libelle, position(',' in c.libelle)) else '' end
  from courses.listes l
  where c.liste_id = l.id and l.foyer_id = id_foyer and courses.cle_produit(c.libelle) = ancienne_cle;

  return photo_inutile;
end;
$$;
revoke all on function courses.renommer_produit(uuid, text, text, text) from public;
grant execute on function courses.renommer_produit(uuid, text, text, text) to authenticated;

notify pgrst, 'reload schema';

commit;
