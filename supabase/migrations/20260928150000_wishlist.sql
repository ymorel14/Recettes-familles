-- =========================================================================
-- Migration 2 — Schéma "wishlist" de l'app CadeauCommun
--
-- Listes de souhaits par personne et par événement, idées cachées ajoutées
-- par les proches, réservations anonymes. La surprise est garantie par la
-- base (règles RLS), pas seulement par l'interface :
--   - le destinataire ne voit ni les idées cachées, ni les réservations,
--     ni même qu'un cadeau est réservé ;
--   - un donateur voit qu'un cadeau est réservé, sans savoir par qui ;
--   - seul celui qui a réservé sait ce qu'il offre.
--
-- Pré-requis : migration 1 (schéma famille). APRÈS : ajouter "wishlist" aux
-- schémas exposés (Project Settings > API > Exposed schemas).
-- =========================================================================

begin;

create schema if not exists wishlist;
grant usage on schema wishlist to authenticated;

-- -------------------------------------------------------------------------
-- 1. Tables
-- -------------------------------------------------------------------------

create table wishlist.evenements (
  id uuid primary key default gen_random_uuid(),
  famille_id uuid not null references famille.familles (id) on delete cascade,
  type text not null default 'autre' check (type in (
    'noel', 'anniversaire', 'naissance', 'mariage', 'fete_des_meres', 'fete_des_peres', 'autre'
  )),
  titre text not null check (length(trim(titre)) > 0),
  date_evenement date not null,
  cree_par uuid not null default auth.uid() references auth.users (id) on delete cascade,
  cree_le timestamptz not null default now()
);
create index evenements_famille on wishlist.evenements (famille_id, date_evenement);

-- Une liste = les souhaits d'UNE personne pour UN événement.
create table wishlist.listes (
  id uuid primary key default gen_random_uuid(),
  evenement_id uuid not null references wishlist.evenements (id) on delete cascade,
  destinataire_id uuid not null references famille.personnes (id) on delete cascade,
  statut text not null default 'brouillon' check (statut in ('brouillon', 'publiee', 'archivee')),
  cree_par uuid not null default auth.uid() references auth.users (id) on delete cascade,
  cree_le timestamptz not null default now(),
  unique (evenement_id, destinataire_id)
);

-- Partage d'une liste avec d'autres familles que celle de l'événement
-- (grands-parents : une seule liste de Noël, visible des deux branches).
create table wishlist.liste_familles (
  liste_id uuid not null references wishlist.listes (id) on delete cascade,
  famille_id uuid not null references famille.familles (id) on delete cascade,
  primary key (liste_id, famille_id)
);

-- Souhait du destinataire (secret = false) ou idée cachée d'un proche
-- (secret = true, jamais visible du destinataire).
create table wishlist.souhaits (
  id uuid primary key default gen_random_uuid(),
  liste_id uuid not null references wishlist.listes (id) on delete cascade,
  titre text not null check (length(trim(titre)) > 0),
  description text,
  lien text,
  image text,
  prix numeric(10, 2) check (prix is null or prix >= 0),
  taille text,
  priorite smallint not null default 2 check (priorite between 1 and 3),
  quantite integer not null default 1 check (quantite > 0),
  secret boolean not null default false,
  cree_par uuid not null default auth.uid() references auth.users (id) on delete cascade,
  cree_le timestamptz not null default now(),
  maj_le timestamptz not null default now(),
  -- Suppression "douce" : le souhait disparaît pour le destinataire mais
  -- reste visible des donateurs qui l'avaient réservé.
  supprime_le timestamptz
);
create index souhaits_liste on wishlist.souhaits (liste_id);

create table wishlist.reservations (
  id uuid primary key default gen_random_uuid(),
  souhait_id uuid not null references wishlist.souhaits (id) on delete cascade,
  reserve_par uuid not null default auth.uid() references auth.users (id) on delete cascade,
  quantite integer not null default 1 check (quantite > 0),
  achete boolean not null default false,
  note_privee text,
  cree_le timestamptz not null default now(),
  unique (souhait_id, reserve_par)
);
create index reservations_reserve_par on wishlist.reservations (reserve_par);

-- -------------------------------------------------------------------------
-- 2. Fonctions de contrôle (security definer : lisent sans être filtrées
--    par les règles RLS, et ne renvoient qu'un oui/non).
-- -------------------------------------------------------------------------

-- Familles qui voient une liste : celle de l'événement + partages.
create or replace function wishlist.familles_de_liste(id_liste uuid)
returns setof uuid
language sql stable security definer
set search_path = wishlist, pg_temp
as $$
  select e.famille_id from wishlist.listes l join wishlist.evenements e on e.id = l.evenement_id
  where l.id = id_liste
  union
  select lf.famille_id from wishlist.liste_familles lf where lf.liste_id = id_liste;
$$;

-- Suis-je le destinataire de cette liste ?
create or replace function wishlist.est_destinataire(id_liste uuid)
returns boolean
language sql stable security definer
set search_path = wishlist, pg_temp
as $$
  select exists (
    select 1 from wishlist.listes l join famille.personnes p on p.id = l.destinataire_id
    where l.id = id_liste and p.utilisateur_id = auth.uid()
  );
$$;

-- Puis-je remplir cette liste comme le destinataire ? Oui si c'est la
-- mienne, ou si le destinataire n'a pas de compte (enfant, bébé) et que je
-- le gère ou vis dans son foyer.
create or replace function wishlist.peut_gerer_liste(id_liste uuid)
returns boolean
language sql stable security definer
set search_path = wishlist, pg_temp
as $$
  select exists (
    select 1 from wishlist.listes l join famille.personnes p on p.id = l.destinataire_id
    where l.id = id_liste
      and (
        p.utilisateur_id = auth.uid()
        or (p.utilisateur_id is null
            and (p.gere_par = auth.uid() or p.foyer_id in (select famille.mes_foyers())))
      )
  );
$$;

-- Puis-je voir cette liste ? Il faut appartenir à l'une de ses familles ;
-- un brouillon n'est visible que de son créateur et de ceux qui la gèrent.
create or replace function wishlist.peut_voir_liste(id_liste uuid)
returns boolean
language sql stable security definer
set search_path = wishlist, pg_temp
as $$
  select exists (
    select 1 from wishlist.listes l
    where l.id = id_liste
      and (
        l.cree_par = auth.uid()
        or wishlist.peut_gerer_liste(l.id)
        or (l.statut <> 'brouillon'
            and exists (
              select 1 from wishlist.familles_de_liste(l.id) f
              where f in (select famille.mes_familles())
            ))
      )
  );
$$;

-- Liste d'un souhait (pour les contrôles sur les réservations).
create or replace function wishlist.liste_du_souhait(id_souhait uuid)
returns uuid
language sql stable security definer
set search_path = wishlist, pg_temp
as $$
  select liste_id from wishlist.souhaits where id = id_souhait;
$$;

-- -------------------------------------------------------------------------
-- 3. Déclencheurs
-- -------------------------------------------------------------------------

-- Un souhait ajouté par quelqu'un d'autre que le destinataire (ou son
-- gestionnaire) est TOUJOURS une idée cachée. Le destinataire ne peut pas
-- créer d'idée cachée sur sa propre liste.
create or replace function wishlist.regler_secret()
returns trigger
language plpgsql security definer
set search_path = wishlist, pg_temp
as $$
begin
  if wishlist.est_destinataire(new.liste_id) then
    new.secret := false;
  elsif not wishlist.peut_gerer_liste(new.liste_id) then
    new.secret := true;
  end if;
  if tg_op = 'UPDATE' then
    new.cree_par := old.cree_par;
    new.liste_id := old.liste_id;
    new.maj_le := now();
  end if;
  return new;
end;
$$;

create trigger regler_secret
before insert or update on wishlist.souhaits
for each row execute function wishlist.regler_secret();

-- Réservation : jamais par le destinataire, jamais sur un souhait supprimé,
-- et jamais au-delà de la quantité souhaitée.
create or replace function wishlist.controler_reservation()
returns trigger
language plpgsql security definer
set search_path = wishlist, pg_temp
as $$
declare
  s wishlist.souhaits;
  deja integer;
begin
  select * into s from wishlist.souhaits where id = new.souhait_id;
  if tg_op = 'UPDATE' then
    new.souhait_id := old.souhait_id;
    new.reserve_par := old.reserve_par;
  end if;

  if wishlist.est_destinataire(s.liste_id) then
    raise exception 'Impossible de réserver un cadeau de sa propre liste';
  end if;
  if s.supprime_le is not null and tg_op = 'INSERT' then
    raise exception 'Ce souhait a été retiré de la liste';
  end if;

  select coalesce(sum(quantite), 0) into deja
  from wishlist.reservations
  where souhait_id = new.souhait_id and id <> new.id;

  if deja + new.quantite > s.quantite then
    raise exception 'Ce cadeau est déjà réservé';
  end if;
  return new;
end;
$$;

create trigger controler_reservation
before insert or update on wishlist.reservations
for each row execute function wishlist.controler_reservation();

-- -------------------------------------------------------------------------
-- 4. Règles RLS
-- -------------------------------------------------------------------------

alter table wishlist.evenements enable row level security;
alter table wishlist.listes enable row level security;
alter table wishlist.liste_familles enable row level security;
alter table wishlist.souhaits enable row level security;
alter table wishlist.reservations enable row level security;

-- Événements : ceux de mes familles, ou d'une liste partagée avec moi.
create policy "Voir les événements" on wishlist.evenements
  for select using (
    famille_id in (select famille.mes_familles())
    or exists (select 1 from wishlist.listes l where l.evenement_id = id)
  );
create policy "Créer un événement dans ses familles" on wishlist.evenements
  for insert with check (famille_id in (select famille.mes_familles()) and cree_par = auth.uid());
create policy "Modifier ses événements" on wishlist.evenements
  for update using (cree_par = auth.uid())
  with check (cree_par = auth.uid() and famille_id in (select famille.mes_familles()));
create policy "Supprimer ses événements" on wishlist.evenements
  for delete using (cree_par = auth.uid());

-- Listes.
create policy "Voir les listes" on wishlist.listes
  for select using (wishlist.peut_voir_liste(id));
create policy "Créer une liste" on wishlist.listes
  for insert with check (
    cree_par = auth.uid()
    and evenement_id in (
      select id from wishlist.evenements where famille_id in (select famille.mes_familles())
    )
    and destinataire_id in (
      select id from famille.personnes where foyer_id in (select famille.foyers_de_mes_familles())
    )
  );
create policy "Modifier sa liste" on wishlist.listes
  for update using (cree_par = auth.uid() or wishlist.peut_gerer_liste(id))
  with check (cree_par = auth.uid() or wishlist.peut_gerer_liste(id));
create policy "Supprimer sa liste" on wishlist.listes
  for delete using (cree_par = auth.uid() or wishlist.peut_gerer_liste(id));

-- Partages de liste.
create policy "Voir les partages" on wishlist.liste_familles
  for select using (wishlist.peut_voir_liste(liste_id));
create policy "Partager sa liste avec ses familles" on wishlist.liste_familles
  for insert with check (
    wishlist.peut_gerer_liste(liste_id) and famille_id in (select famille.mes_familles())
  );
create policy "Retirer un partage" on wishlist.liste_familles
  for delete using (wishlist.peut_gerer_liste(liste_id));

-- Souhaits. Le destinataire ne voit que ses propres souhaits non secrets et
-- non supprimés. Les autres voient tout (y compris les idées cachées).
create policy "Voir les souhaits" on wishlist.souhaits
  for select using (
    wishlist.peut_voir_liste(liste_id)
    and (
      not wishlist.est_destinataire(liste_id)
      or (secret = false and supprime_le is null)
    )
  );
create policy "Ajouter un souhait ou une idée" on wishlist.souhaits
  for insert with check (wishlist.peut_voir_liste(liste_id) and cree_par = auth.uid());
-- Le destinataire (ou gestionnaire) modifie les souhaits non secrets ;
-- l'auteur d'une idée cachée modifie son idée.
create policy "Modifier un souhait" on wishlist.souhaits
  for update using (
    (wishlist.peut_gerer_liste(liste_id) and secret = false)
    or (cree_par = auth.uid() and secret = true)
  )
  with check (
    (wishlist.peut_gerer_liste(liste_id) and secret = false)
    or (cree_par = auth.uid() and secret = true)
  );
-- Pas de suppression définitive pour le destinataire (il renseigne
-- supprime_le) ; l'auteur d'une idée cachée peut la supprimer.
create policy "Supprimer son idée cachée" on wishlist.souhaits
  for delete using (cree_par = auth.uid() and secret = true);

-- Réservations : chacun ne voit et ne gère QUE les siennes.
create policy "Mes réservations" on wishlist.reservations
  for select using (reserve_par = auth.uid());
create policy "Réserver" on wishlist.reservations
  for insert with check (
    reserve_par = auth.uid()
    and wishlist.peut_voir_liste(wishlist.liste_du_souhait(souhait_id))
    and not wishlist.est_destinataire(wishlist.liste_du_souhait(souhait_id))
  );
create policy "Modifier ma réservation" on wishlist.reservations
  for update using (reserve_par = auth.uid()) with check (reserve_par = auth.uid());
create policy "Annuler ma réservation" on wishlist.reservations
  for delete using (reserve_par = auth.uid());

grant select, insert, update, delete on all tables in schema wishlist to authenticated;

-- -------------------------------------------------------------------------
-- 5. État des réservations d'une liste, pour les donateurs
--
-- Renvoie pour chaque souhait le nombre d'unités réservées et si c'est moi
-- qui ai réservé, JAMAIS qui d'autre. Refusé au destinataire.
-- -------------------------------------------------------------------------

create or replace function wishlist.etat_reservations(id_liste uuid)
returns table (souhait_id uuid, quantite integer, nb_reserves integer, reserve_par_moi boolean)
language plpgsql stable security definer
set search_path = wishlist, pg_temp
as $$
begin
  if auth.uid() is null or not wishlist.peut_voir_liste(id_liste) then
    raise exception 'Liste introuvable';
  end if;
  if wishlist.est_destinataire(id_liste) then
    raise exception 'Surprise ! Les réservations de votre liste ne vous sont pas montrées';
  end if;

  return query
  select s.id, s.quantite,
         coalesce(sum(r.quantite), 0)::integer,
         coalesce(bool_or(r.reserve_par = auth.uid()), false)
  from wishlist.souhaits s
  left join wishlist.reservations r on r.souhait_id = s.id
  where s.liste_id = id_liste
  group by s.id, s.quantite;
end;
$$;

-- Retirer un souhait de sa liste (suppression douce). Passe par une
-- fonction : une mise à jour directe échouerait, car le souhait retiré
-- n'est plus visible du destinataire. Si personne ne l'avait réservé, il est
-- supprimé pour de bon ; sinon il reste visible du donateur concerné.
create or replace function wishlist.retirer_souhait(id_souhait uuid)
returns void
language plpgsql security definer
set search_path = wishlist, pg_temp
as $$
declare
  s wishlist.souhaits;
begin
  select * into s from wishlist.souhaits where id = id_souhait;
  if s.id is null or s.secret or not wishlist.peut_gerer_liste(s.liste_id) then
    raise exception 'Souhait introuvable';
  end if;

  if exists (select 1 from wishlist.reservations where souhait_id = id_souhait) then
    update wishlist.souhaits set supprime_le = now(), maj_le = now() where id = id_souhait;
  else
    delete from wishlist.souhaits where id = id_souhait;
  end if;
end;
$$;

grant execute on function
  wishlist.est_destinataire(uuid), wishlist.peut_gerer_liste(uuid), wishlist.peut_voir_liste(uuid),
  wishlist.etat_reservations(uuid), wishlist.retirer_souhait(uuid)
to authenticated;
revoke execute on function wishlist.familles_de_liste(uuid), wishlist.liste_du_souhait(uuid) from public;
grant execute on function wishlist.familles_de_liste(uuid), wishlist.liste_du_souhait(uuid) to authenticated;

-- Temps réel : souhaits et réservations (filtrés par les mêmes règles RLS).
alter publication supabase_realtime add table wishlist.souhaits, wishlist.reservations;

notify pgrst, 'reload schema';

commit;
