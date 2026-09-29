-- =========================================================================
-- Migration 7 — CadeauCommun : pot commun sur un cadeau
--
-- Un cadeau cher (vélo, voyage…) peut être financé à plusieurs : chaque
-- cadeau de la liste peut devenir un "pot commun" (un pot par cadeau), et
-- chaque proche y promet une somme. L'app ne fait transiter aucun argent :
-- elle compte les promesses de dons.
--
-- Confidentialité, garantie par la base :
--   - le montant d'une participation n'est lisible QUE par son auteur ;
--   - la somme réunie est visible de toute la famille, SAUF du destinataire
--     (fonction etat_pots, refusée au destinataire) ;
--   - personne ne voit qui a participé, ni combien de personnes.
--
-- Pré-requis : migrations 1 à 6.
-- =========================================================================

begin;

-- -------------------------------------------------------------------------
-- 1. Un souhait (ou une idée cachée) peut être un pot commun. Son prix
--    (colonne prix) sert alors de montant à réunir, facultatif.
-- -------------------------------------------------------------------------

alter table wishlist.souhaits
  add column if not exists pot_commun boolean not null default false;

comment on column wishlist.souhaits.pot_commun is
  'Cadeau financé à plusieurs : chacun participe d''une somme (table participations) au lieu de le réserver. prix = montant à réunir.';

-- -------------------------------------------------------------------------
-- 2. Participations : une par personne et par pot, modifiable.
-- -------------------------------------------------------------------------

create table if not exists wishlist.participations (
  id uuid primary key default gen_random_uuid(),
  souhait_id uuid not null references wishlist.souhaits (id) on delete cascade,
  participant uuid not null default auth.uid() references auth.users (id) on delete cascade,
  montant numeric(10, 2) not null check (montant > 0),
  -- Coché par le participant quand il a remis l'argent à l'organisateur.
  verse boolean not null default false,
  cree_le timestamptz not null default now(),
  maj_le timestamptz not null default now(),
  unique (souhait_id, participant)
);
create index if not exists participations_participant on wishlist.participations (participant);

-- Participation : jamais par le destinataire, uniquement sur un pot commun
-- encore présent dans la liste.
create or replace function wishlist.controler_participation()
returns trigger
language plpgsql security definer
set search_path = wishlist, pg_temp
as $$
declare
  s wishlist.souhaits;
begin
  if tg_op = 'UPDATE' then
    new.souhait_id := old.souhait_id;
    new.participant := old.participant;
    new.cree_le := old.cree_le;
    new.maj_le := now();
  end if;

  select * into s from wishlist.souhaits where id = new.souhait_id;
  if s.id is null then
    raise exception 'Cadeau introuvable';
  end if;
  if wishlist.est_destinataire(s.liste_id) then
    raise exception 'Impossible de participer à un cadeau de sa propre liste';
  end if;
  if tg_op = 'INSERT' and (not s.pot_commun or s.supprime_le is not null) then
    raise exception 'Ce cadeau n''a pas de pot commun';
  end if;
  return new;
end;
$$;

drop trigger if exists controler_participation on wishlist.participations;
create trigger controler_participation
before insert or update on wishlist.participations
for each row execute function wishlist.controler_participation();

-- Un pot commun ne se réserve pas : on y participe.
create or replace function wishlist.refuser_reservation_pot()
returns trigger
language plpgsql security definer
set search_path = wishlist, pg_temp
as $$
begin
  if tg_op = 'INSERT' and exists (
    select 1 from wishlist.souhaits where id = new.souhait_id and pot_commun
  ) then
    raise exception 'Ce cadeau est financé en pot commun : participez plutôt que de le réserver';
  end if;
  return new;
end;
$$;

drop trigger if exists refuser_reservation_pot on wishlist.reservations;
create trigger refuser_reservation_pot
before insert on wishlist.reservations
for each row execute function wishlist.refuser_reservation_pot();

-- -------------------------------------------------------------------------
-- 3. Règles RLS : chacun ne voit et ne gère QUE ses participations.
-- -------------------------------------------------------------------------

alter table wishlist.participations enable row level security;

drop policy if exists "Mes participations" on wishlist.participations;
create policy "Mes participations" on wishlist.participations
  for select using (participant = auth.uid());

drop policy if exists "Participer" on wishlist.participations;
create policy "Participer" on wishlist.participations
  for insert with check (
    participant = auth.uid()
    and wishlist.peut_voir_liste(wishlist.liste_du_souhait(souhait_id))
    and not wishlist.est_destinataire(wishlist.liste_du_souhait(souhait_id))
  );

drop policy if exists "Modifier ma participation" on wishlist.participations;
create policy "Modifier ma participation" on wishlist.participations
  for update using (participant = auth.uid()) with check (participant = auth.uid());

drop policy if exists "Retirer ma participation" on wishlist.participations;
create policy "Retirer ma participation" on wishlist.participations
  for delete using (participant = auth.uid());

grant select, insert, update, delete on wishlist.participations to authenticated;

-- -------------------------------------------------------------------------
-- 4. État des pots d'une liste, pour les donateurs
--
-- Pour chaque pot : la somme réunie et MA participation. Jamais les autres
-- montants, ni les noms, ni le nombre de participants. Refusé au
-- destinataire. Inclut un cadeau qui n'est plus en pot commun si des
-- participations existent encore (pour que chacun puisse retirer la sienne).
-- -------------------------------------------------------------------------

create or replace function wishlist.etat_pots(id_liste uuid)
returns table (souhait_id uuid, total numeric, ma_participation numeric)
language plpgsql stable security definer
set search_path = wishlist, pg_temp
as $$
begin
  if auth.uid() is null or not wishlist.peut_voir_liste(id_liste) then
    raise exception 'Liste introuvable';
  end if;
  if wishlist.est_destinataire(id_liste) then
    raise exception 'Surprise ! Les pots communs de votre liste ne vous sont pas montrés';
  end if;

  return query
  select s.id,
         coalesce(sum(p.montant), 0)::numeric,
         max(p.montant) filter (where p.participant = auth.uid())
  from wishlist.souhaits s
  left join wishlist.participations p on p.souhait_id = s.id
  where s.liste_id = id_liste
    and (s.pot_commun or p.id is not null)
  group by s.id;
end;
$$;

grant execute on function wishlist.etat_pots(uuid) to authenticated;

-- -------------------------------------------------------------------------
-- 5. Retirer un souhait : garder le souhait (masqué pour le destinataire)
--    s'il a des participations, comme pour les réservations.
-- -------------------------------------------------------------------------

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

  if exists (select 1 from wishlist.reservations where souhait_id = id_souhait)
     or exists (select 1 from wishlist.participations where souhait_id = id_souhait) then
    update wishlist.souhaits set supprime_le = now(), maj_le = now() where id = id_souhait;
  else
    delete from wishlist.souhaits where id = id_souhait;
  end if;
end;
$$;

notify pgrst, 'reload schema';

commit;
