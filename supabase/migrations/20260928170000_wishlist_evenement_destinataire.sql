-- =========================================================================
-- Migration 4 — CadeauCommun : pour qui est un événement
--
-- Un anniversaire, une naissance, une fête des mères… concerne UNE personne.
-- On l'enregistre sur l'événement : l'app affiche "Anniversaire de Claire",
-- crée directement la liste de Claire et ne propose pas "Créer ma liste"
-- aux autres. Vide = événement collectif (Noël) : chacun crée sa liste.
--
-- Aucune règle de sécurité ne change : la surprise repose toujours sur le
-- destinataire de chaque LISTE (wishlist.listes.destinataire_id).
-- =========================================================================

begin;

alter table wishlist.evenements
  add column if not exists destinataire_id uuid references famille.personnes (id) on delete set null;

comment on column wishlist.evenements.destinataire_id is
  'Personne fêtée (anniversaire, naissance…). Vide : événement collectif, comme Noël.';

notify pgrst, 'reload schema';

commit;
