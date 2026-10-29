-- =========================================================================
-- Migration — Événements : liste d'envies liée à un repas (refonte § 8.5, 10.2)
--
-- voyage.listes_envies (voyage_id, liste_id) remplace voyage.listes_cadeaux,
-- qui pointait vers wishlist.evenements (abandonnés). L'ancienne table est
-- conservée en lecture seule pour les anciennes apps.
--
-- Confidentialité : la personne fêtée (destinataire de la liste) ne voit
-- jamais le lien, donc jamais la section Cadeau du repas.
--
-- Pré-requis : migrations 20261001120000 (repas) et 20261012110000
-- (listes communes : wishlist.peut_voir_liste, wishlist.est_destinataire).
-- =========================================================================

begin;

create table if not exists voyage.listes_envies (
  voyage_id uuid not null references voyage.voyages (id) on delete cascade,
  liste_id uuid not null references wishlist.listes (id) on delete cascade,
  ajoute_par uuid default auth.uid() references auth.users (id) on delete set null,
  ajoute_le timestamptz not null default now(),
  primary key (voyage_id, liste_id)
);
create index if not exists listes_envies_liste on voyage.listes_envies (liste_id);

alter table voyage.listes_envies enable row level security;

drop policy if exists "Voir les listes d'envies liées" on voyage.listes_envies;
create policy "Voir les listes d'envies liées" on voyage.listes_envies
  for select using (
    voyage.peut_voir(voyage_id)
    and wishlist.peut_voir_liste(liste_id)
    and not wishlist.est_destinataire(liste_id)
  );

drop policy if exists "Lier une liste d'envies" on voyage.listes_envies;
create policy "Lier une liste d'envies" on voyage.listes_envies
  for insert with check (
    voyage.est_organisateur(voyage_id)
    and wishlist.peut_voir_liste(liste_id)
    and not wishlist.est_destinataire(liste_id)
  );

drop policy if exists "Délier une liste d'envies" on voyage.listes_envies;
create policy "Délier une liste d'envies" on voyage.listes_envies
  for delete using (voyage.est_organisateur(voyage_id));

grant select, insert, delete on voyage.listes_envies to authenticated;
grant all on voyage.listes_envies to service_role;

-- Reprise des anciens liens (événement de cadeaux → liste de son
-- destinataire), seulement si les anciennes tables existent encore.
do $$
begin
  if to_regclass('wishlist.evenements') is not null and to_regclass('voyage.listes_cadeaux') is not null then
    execute $q$
      insert into voyage.listes_envies (voyage_id, liste_id, ajoute_par)
      select lc.voyage_id, l.id, lc.ajoute_par
      from voyage.listes_cadeaux lc
      join wishlist.evenements e on e.id = lc.evenement_id
      join wishlist.listes l on l.destinataire_id = e.destinataire_id
      on conflict do nothing
    $q$;
  end if;
exception when undefined_column or undefined_table then
  null; -- schéma wishlist différent : on ne reprend rien, sans bloquer.
end $$;

notify pgrst, 'reload schema';

commit;
