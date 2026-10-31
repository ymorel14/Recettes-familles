-- =========================================================================
-- Migration — App Famille : propositions de voyage faites par l'assistant
--
-- Spécification V1, § 4.5.1 (« Organise-nous un week-end en Bretagne en
-- novembre ») : le brouillon de l'assistant devient des propositions
-- ordinaires (dates du sondage, hébergements, activités), créées par les
-- fonctions et règles existantes, que les invités votent et que
-- l'organisateur retient comme les propositions humaines. Cette table dit
-- seulement lesquelles sont « Proposé par l'assistant », pour l'afficher.
--
-- AJOUT SEULEMENT : une nouvelle table, aucune table existante modifiée.
-- VoyageCommun (l'app actuelle) voit ces propositions sans la mention.
--
-- Lecture : quiconque voit le voyage (voyage.peut_voir, qui applique la
-- règle « surprise »). Écriture : un organisateur du voyage.
-- =========================================================================

begin;

create table if not exists voyage.proposes_assistant (
  objet_id uuid primary key,
  voyage_id uuid not null references voyage.voyages (id) on delete cascade,
  nature text not null check (nature in ('dates', 'hebergement', 'activite')),
  cree_par uuid default auth.uid() references auth.users (id) on delete set null,
  cree_le timestamptz not null default now()
);
create index if not exists proposes_assistant_voyage on voyage.proposes_assistant (voyage_id);

alter table voyage.proposes_assistant enable row level security;

drop policy if exists "Voir les propositions de l'assistant" on voyage.proposes_assistant;
create policy "Voir les propositions de l'assistant" on voyage.proposes_assistant
  for select using (voyage.peut_voir(voyage_id));

-- L'objet doit appartenir au voyage (dates, hébergement ou activité).
drop policy if exists "Marquer une proposition de l'assistant" on voyage.proposes_assistant;
create policy "Marquer une proposition de l'assistant" on voyage.proposes_assistant
  for insert with check (
    voyage.est_organisateur(voyage_id)
    and case nature
      when 'dates' then voyage.voyage_de_proposition(objet_id) = voyage_id
      when 'hebergement' then voyage.voyage_d_hebergement(objet_id) = voyage_id
      when 'activite' then voyage.voyage_d_activite(objet_id) = voyage_id
      else false
    end
  );

drop policy if exists "Retirer la mention de l'assistant" on voyage.proposes_assistant;
create policy "Retirer la mention de l'assistant" on voyage.proposes_assistant
  for delete using (voyage.est_organisateur(voyage_id));

grant select, insert, delete on voyage.proposes_assistant to authenticated;
grant all on voyage.proposes_assistant to service_role;

commit;
