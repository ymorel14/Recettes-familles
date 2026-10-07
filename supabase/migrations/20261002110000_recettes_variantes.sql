-- =========================================================================
-- Migration — Cuisine : variantes d'un élément de recette
--
-- Un élément (ex. « Curd au citron » d'une tarte au citron) peut avoir une
-- ou plusieurs variantes qui le remplacent au choix (« Appareil à
-- l'orange »), chacune avec ses propres ingrédients et étapes. Une variante
-- est simplement un élément de la même recette dont `variante_de` désigne
-- l'élément qu'elle remplace (l'élément principal). Au moment de cuisiner,
-- on choisit UNE version par élément : la fiche, le mode assistant et la
-- liste de courses ne gardent que celle-là (par défaut, la principale).
--
-- Un seul niveau : on ne fait pas de variante d'une variante.
-- Supprimer l'élément principal supprime ses variantes (et, comme pour tout
-- élément, leurs ingrédients et étapes perdent leur rattachement).
--
-- Pré-requis : table recettes.elements (setup.sql). Les règles RLS des
-- éléments s'appliquent telles quelles aux variantes.
-- =========================================================================

begin;

alter table recettes.elements
  add column if not exists variante_de uuid references recettes.elements (id) on delete cascade;

comment on column recettes.elements.variante_de is
  'Élément principal que cet élément peut remplacer (variante au choix) ; null pour un élément principal.';

create index if not exists elements_variante_de_idx on recettes.elements (variante_de);

-- Une variante remplace un élément principal de la MÊME recette, et n'est
-- pas elle-même la variante d'une variante.
create or replace function recettes.verifier_variante_element()
returns trigger
language plpgsql
as $$
declare
  cible record;
begin
  if new.variante_de is null then
    return new;
  end if;
  if new.variante_de = new.id then
    raise exception 'Un élément ne peut pas être sa propre variante.';
  end if;
  select recette_id, variante_de into cible from recettes.elements where id = new.variante_de;
  -- Cible pas encore visible (enregistrée dans la même requête) : la clé
  -- étrangère vérifiera son existence en fin de requête.
  if found then
    if cible.recette_id <> new.recette_id then
      raise exception 'Une variante doit appartenir à la même recette que son élément principal.';
    end if;
    if cible.variante_de is not null then
      raise exception 'Pas de variante d''une variante : choisir l''élément principal.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists verifier_variante_element on recettes.elements;
create trigger verifier_variante_element
  before insert or update of variante_de, recette_id on recettes.elements
  for each row execute function recettes.verifier_variante_element();

-- Prise en compte immédiate de la nouvelle colonne par l'API.
notify pgrst, 'reload schema';

commit;
