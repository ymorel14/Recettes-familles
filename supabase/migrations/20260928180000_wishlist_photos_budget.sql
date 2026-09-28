-- =========================================================================
-- Migration 5 — CadeauCommun : photo et budget d'un souhait
--
-- 1. Un souhait indique soit un prix estimé ("environ 24 €"), soit un budget
--    maximum ("jusqu'à 50 €") : colonne type_prix.
-- 2. Les photos des souhaits sont stockées dans l'espace "cadeaux-photos",
--    séparé de celui des recettes. Chaque photo porte un nom aléatoire et
--    n'est lisible que par son adresse exacte, que seuls reçoivent ceux qui
--    voient le souhait : aucune règle ne permet de LISTER les photos, donc le
--    destinataire ne peut pas découvrir celle d'une idée cachée.
-- =========================================================================

begin;

alter table wishlist.souhaits
  add column if not exists type_prix text not null default 'estime';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'souhaits_type_prix_check' and conrelid = 'wishlist.souhaits'::regclass
  ) then
    alter table wishlist.souhaits
      add constraint souhaits_type_prix_check check (type_prix in ('estime', 'budget'));
  end if;
end $$;

comment on column wishlist.souhaits.type_prix is
  'estime : prix indicatif du cadeau ; budget : montant maximum à dépenser.';

-- Espace de stockage des photos (lecture par adresse publique, sans liste).
insert into storage.buckets (id, name, public)
values ('cadeaux-photos', 'cadeaux-photos', true)
on conflict (id) do nothing;

drop policy if exists "Ajouter une photo de cadeau" on storage.objects;
create policy "Ajouter une photo de cadeau"
on storage.objects for insert
to authenticated
with check (bucket_id = 'cadeaux-photos');

notify pgrst, 'reload schema';

commit;
