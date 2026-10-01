-- =========================================================================
-- Migration — VoyageCommun : véhicules des foyers, hébergements proposés
-- par tous, frais communs par personne (enfants gratuits)
--
-- Décisions du 29 septembre 2026 :
--   1. Tout participant peut proposer un hébergement (et modifier ou retirer
--      le sien). Seul un organisateur le retient ou l'écarte.
--   2. Les frais communs se partagent par personne, enfants gratuits :
--      c'est la répartition "par_adulte", qui devient celle par défaut.
--   3. Chaque foyer mémorise ses véhicules (énergie, consommation) pour ne
--      pas les ressaisir à chaque voyage ; un trajet peut en choisir un.
--
-- Pré-requis : migration 20260929100000_voyage.sql.
-- =========================================================================

begin;

-- -------------------------------------------------------------------------
-- 1. Hébergements : proposés par tout participant
-- -------------------------------------------------------------------------

drop policy if exists "Proposer un hébergement" on voyage.hebergements;
create policy "Proposer un hébergement" on voyage.hebergements
  for insert with check (
    propose_par = auth.uid()
    and (voyage.est_participant(voyage_id) or voyage.est_organisateur(voyage_id))
  );

drop policy if exists "Modifier un hébergement" on voyage.hebergements;
create policy "Modifier un hébergement" on voyage.hebergements
  for update using (propose_par = auth.uid() or voyage.est_organisateur(voyage_id))
  with check (propose_par = auth.uid() or voyage.est_organisateur(voyage_id));

drop policy if exists "Supprimer un hébergement" on voyage.hebergements;
create policy "Supprimer un hébergement" on voyage.hebergements
  for delete using (propose_par = auth.uid() or voyage.est_organisateur(voyage_id));

-- L'auteur d'une proposition la modifie, mais seul un organisateur change
-- son statut (retenu, écarté) ; l'auteur reste celui d'origine.
create or replace function voyage.regler_hebergement()
returns trigger
language plpgsql security definer
set search_path = voyage, pg_temp
as $$
begin
  new.propose_par := old.propose_par;
  new.cree_le := old.cree_le;
  if new.statut is distinct from old.statut and not voyage.est_organisateur(old.voyage_id) then
    new.statut := old.statut;
  end if;
  return new;
end;
$$;

create trigger regler_hebergement
before update on voyage.hebergements
for each row execute function voyage.regler_hebergement();

-- Une proposition naît toujours "proposée".
create or replace function voyage.hebergement_propose()
returns trigger
language plpgsql security definer
set search_path = voyage, pg_temp
as $$
begin
  if not voyage.est_organisateur(new.voyage_id) then
    new.statut := 'propose';
  end if;
  return new;
end;
$$;

create trigger hebergement_propose
before insert on voyage.hebergements
for each row execute function voyage.hebergement_propose();

-- -------------------------------------------------------------------------
-- 2. Frais communs : par personne, enfants gratuits, par défaut
-- -------------------------------------------------------------------------

alter table voyage.voyages alter column repartition set default 'par_adulte';
comment on column voyage.voyages.repartition is
  'Frais communs : par_adulte = par personne, enfants gratuits (défaut) ; par_personne = enfants compris ; par_foyer.';

-- -------------------------------------------------------------------------
-- 3. Véhicules des foyers
-- -------------------------------------------------------------------------

create table voyage.vehicules (
  id uuid primary key default gen_random_uuid(),
  foyer_id uuid not null references famille.foyers (id) on delete cascade,
  nom text not null check (length(trim(nom)) > 0),
  energie text not null check (energie in ('gazole', 'sp95', 'sp98', 'e85', 'gpl', 'electrique')),
  -- L/100 km (kWh/100 km en électrique).
  consommation numeric(5, 2) not null check (consommation > 0),
  places smallint check (places is null or places between 1 and 9),
  cree_par uuid not null default auth.uid() references auth.users (id) on delete cascade,
  cree_le timestamptz not null default now()
);
create index vehicules_foyer on voyage.vehicules (foyer_id);

alter table voyage.vehicules enable row level security;

-- La famille voit les véhicules (utile à l'organisateur pour le covoiturage) ;
-- seuls les membres du foyer les gèrent.
create policy "Voir les véhicules de ses familles" on voyage.vehicules
  for select using (foyer_id in (select famille.foyers_de_mes_familles()));
create policy "Ajouter un véhicule à son foyer" on voyage.vehicules
  for insert with check (foyer_id in (select famille.mes_foyers()) and cree_par = auth.uid());
create policy "Modifier un véhicule de son foyer" on voyage.vehicules
  for update using (foyer_id in (select famille.mes_foyers()))
  with check (foyer_id in (select famille.mes_foyers()));
create policy "Retirer un véhicule de son foyer" on voyage.vehicules
  for delete using (foyer_id in (select famille.mes_foyers()));

grant select, insert, update, delete on voyage.vehicules to authenticated;

-- Un trajet peut indiquer le véhicule utilisé. L'app recopie son énergie et
-- sa consommation dans le trajet (modifiables pour ce voyage), pour que le
-- coût d'un voyage passé ne change pas si le véhicule est modifié ensuite.
alter table voyage.trajets
  add column vehicule_id uuid references voyage.vehicules (id) on delete set null;

notify pgrst, 'reload schema';

commit;
