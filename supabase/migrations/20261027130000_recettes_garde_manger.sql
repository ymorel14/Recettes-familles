-- App Famille, retour de test C-1 étape 1 (27 octobre 2026) : le
-- « Congélateur » devient le « Garde-manger ». Les congélateurs deviennent
-- des emplacements typés : congélateur, frigo, placard, cave, autre.
-- La durée de conservation et les alertes ne concernent que le congélateur
-- et le frigo (calculées dans l'app, d'après ce genre).
--
-- AJOUT SEULEMENT : une colonne facultative, avec « congelateur » par
-- défaut. Les emplacements existants restent des congélateurs ; les règles
-- RLS ne changent pas. L'app Cuisine actuelle ignore la colonne : elle
-- montre tous les emplacements comme des congélateurs.

begin;

alter table recettes.congelateurs
  add column if not exists genre text not null default 'congelateur';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'congelateurs_genre_valide'
  ) then
    alter table recettes.congelateurs
      add constraint congelateurs_genre_valide
      check (genre in ('congelateur', 'frigo', 'placard', 'cave', 'autre'));
  end if;
end $$;

commit;
