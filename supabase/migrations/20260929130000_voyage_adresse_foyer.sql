-- =========================================================================
-- Migration — VoyageCommun : adresse du foyer
--
-- Chaque foyer enregistre une fois son adresse ; elle sert de point de
-- départ par défaut à ses trajets (plus de ressaisie à chaque voyage).
--
-- Confidentialité : l'adresse n'est lisible QUE par les membres du foyer.
-- Les autres voient seulement la ville de départ d'un trajet (trajets.
-- ville_depart), jamais l'adresse. Elle vit dans le schéma "voyage" et non
-- dans "famille", pour ne pas l'exposer aux autres apps.
--
-- Pré-requis : migration 20260929100000_voyage.sql.
-- =========================================================================

begin;

create table voyage.adresses_foyers (
  foyer_id uuid primary key references famille.foyers (id) on delete cascade,
  adresse text not null check (length(trim(adresse)) > 0),
  maj_par uuid default auth.uid() references auth.users (id) on delete set null,
  maj_le timestamptz not null default now()
);

alter table voyage.adresses_foyers enable row level security;

create policy "Voir l'adresse de son foyer" on voyage.adresses_foyers
  for select using (foyer_id in (select famille.mes_foyers()));
create policy "Enregistrer l'adresse de son foyer" on voyage.adresses_foyers
  for insert with check (foyer_id in (select famille.mes_foyers()));
create policy "Modifier l'adresse de son foyer" on voyage.adresses_foyers
  for update using (foyer_id in (select famille.mes_foyers()))
  with check (foyer_id in (select famille.mes_foyers()));
create policy "Effacer l'adresse de son foyer" on voyage.adresses_foyers
  for delete using (foyer_id in (select famille.mes_foyers()));

grant select, insert, update, delete on voyage.adresses_foyers to authenticated;

notify pgrst, 'reload schema';

commit;
