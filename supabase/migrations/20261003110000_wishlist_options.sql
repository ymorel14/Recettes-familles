-- =========================================================================
-- Migration — CadeauCommun : options d'un souhait (modèles, variantes)
--
-- Un souhait ou une idée peut contenir plusieurs options (wishlist.options),
-- un exemplaire par option, selon deux modes (souhaits.mode_options) :
--   - 'un_au_choix' : plusieurs modèles de téléphone, on n'en achète qu'un.
--     Réserver une option réserve tout le souhait ; seul celui qui a réservé
--     sait quel modèle il a choisi.
--   - 'toutes' : plusieurs figurines, chacune se réserve séparément. Les
--     donateurs voient lesquelles sont prises, jamais par qui.
--   - vide : souhait classique, sans options.
--
-- Surprise : le destinataire voit les options de ses souhaits, jamais leur
-- état de réservation (etat_options lui est refusée, comme
-- etat_reservations). Les options d'une idée cachée suivent l'idée : le
-- destinataire ne les voit pas.
--
-- Un souhait avec options ne peut pas être un pot commun.
--
-- Pré-requis : migrations CadeauCommun précédentes (dont pot commun).
-- =========================================================================

begin;

-- -------------------------------------------------------------------------
-- 1. Mode et options
-- -------------------------------------------------------------------------

alter table wishlist.souhaits
  add column if not exists mode_options text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'souhaits_mode_options_check' and conrelid = 'wishlist.souhaits'::regclass) then
    alter table wishlist.souhaits
      add constraint souhaits_mode_options_check check (mode_options is null or mode_options in ('un_au_choix', 'toutes'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'souhaits_options_sans_pot' and conrelid = 'wishlist.souhaits'::regclass) then
    alter table wishlist.souhaits
      add constraint souhaits_options_sans_pot check (not (pot_commun and mode_options is not null));
  end if;
end $$;

comment on column wishlist.souhaits.mode_options is
  'un_au_choix : une seule option à offrir (réserver une option réserve le souhait) ; toutes : chaque option se réserve séparément ; vide : pas d''options.';

create table if not exists wishlist.options (
  id uuid primary key default gen_random_uuid(),
  souhait_id uuid not null references wishlist.souhaits (id) on delete cascade,
  titre text not null check (length(trim(titre)) > 0),
  lien text,
  image text,
  prix numeric(10, 2) check (prix is null or prix >= 0),
  ordre integer not null default 0,
  cree_le timestamptz not null default now()
);
create index if not exists options_souhait on wishlist.options (souhait_id, ordre);

-- Puis-je modifier ce souhait (et donc ses options) ? Mêmes règles que la
-- modification d'un souhait : le destinataire ou son gestionnaire pour un
-- souhait, l'auteur pour une idée cachée.
create or replace function wishlist.peut_modifier_souhait(id_souhait uuid)
returns boolean
language sql stable security definer
set search_path = wishlist, pg_temp
as $$
  select exists (
    select 1 from wishlist.souhaits s
    where s.id = id_souhait
      and (
        (not s.secret and wishlist.peut_gerer_liste(s.liste_id))
        or (s.secret and s.cree_par = auth.uid())
      )
  );
$$;
grant execute on function wishlist.peut_modifier_souhait(uuid) to authenticated;

alter table wishlist.options enable row level security;

-- Lecture : les options d'un souhait que je vois (la règle des souhaits
-- s'applique dans la sous-requête : options d'une idée cachée invisibles du
-- destinataire).
drop policy if exists "Voir les options" on wishlist.options;
create policy "Voir les options" on wishlist.options
  for select using (exists (select 1 from wishlist.souhaits s where s.id = souhait_id));

drop policy if exists "Ajouter une option" on wishlist.options;
create policy "Ajouter une option" on wishlist.options
  for insert with check (wishlist.peut_modifier_souhait(souhait_id));

drop policy if exists "Modifier une option" on wishlist.options;
create policy "Modifier une option" on wishlist.options
  for update using (wishlist.peut_modifier_souhait(souhait_id))
  with check (wishlist.peut_modifier_souhait(souhait_id));

drop policy if exists "Supprimer une option" on wishlist.options;
create policy "Supprimer une option" on wishlist.options
  for delete using (wishlist.peut_modifier_souhait(souhait_id));

grant select, insert, update, delete on wishlist.options to authenticated;

-- -------------------------------------------------------------------------
-- 2. Réservation d'une option
-- -------------------------------------------------------------------------

alter table wishlist.reservations
  add column if not exists option_id uuid references wishlist.options (id) on delete set null;

-- Un donateur peut réserver plusieurs figurines d'un même souhait : la
-- règle "une réservation par personne et par souhait" ne vaut plus que pour
-- les réservations sans option. Une option ne se réserve qu'une fois.
alter table wishlist.reservations drop constraint if exists reservations_souhait_id_reserve_par_key;
create unique index if not exists reservations_une_par_personne
  on wishlist.reservations (souhait_id, reserve_par) where option_id is null;
create unique index if not exists reservations_une_par_option
  on wishlist.reservations (option_id) where option_id is not null;

create or replace function wishlist.controler_reservation()
returns trigger
language plpgsql security definer
set search_path = wishlist, pg_temp
as $$
declare
  s wishlist.souhaits;
  deja integer;
begin
  if tg_op = 'UPDATE' then
    new.souhait_id := old.souhait_id;
    new.reserve_par := old.reserve_par;
    new.option_id := old.option_id;
  end if;
  select * into s from wishlist.souhaits where id = new.souhait_id;

  if wishlist.est_destinataire(s.liste_id) then
    raise exception 'Impossible de réserver un cadeau de sa propre liste';
  end if;
  if s.supprime_le is not null and tg_op = 'INSERT' then
    raise exception 'Ce souhait a été retiré de la liste';
  end if;

  if tg_op = 'INSERT' and s.mode_options is not null then
    if new.option_id is null
       or not exists (select 1 from wishlist.options o where o.id = new.option_id and o.souhait_id = s.id) then
      raise exception 'Choisissez une option de ce cadeau';
    end if;
    new.quantite := 1;
    if s.mode_options = 'un_au_choix'
       and exists (select 1 from wishlist.reservations r where r.souhait_id = s.id and r.id <> new.id) then
      raise exception 'Ce cadeau est déjà réservé';
    end if;
    if s.mode_options = 'toutes'
       and exists (select 1 from wishlist.reservations r where r.option_id = new.option_id and r.id <> new.id) then
      raise exception 'Cette option est déjà réservée';
    end if;
    return new;
  end if;

  if tg_op = 'INSERT' and new.option_id is not null then
    raise exception 'Ce cadeau n''a pas d''options';
  end if;

  if s.mode_options is null then
    select coalesce(sum(quantite), 0) into deja
    from wishlist.reservations
    where souhait_id = new.souhait_id and id <> new.id;
    if deja + new.quantite > s.quantite then
      raise exception 'Ce cadeau est déjà réservé';
    end if;
  end if;
  return new;
end;
$$;

-- -------------------------------------------------------------------------
-- 3. État des options d'une liste, pour les donateurs
--
-- Pour chaque option : prise ou non (mode 'toutes' seulement : en mode
-- 'un_au_choix', le modèle choisi reste le secret de celui qui a réservé),
-- et si c'est moi qui l'ai réservée. Jamais qui d'autre. Refusé au
-- destinataire.
-- -------------------------------------------------------------------------

create or replace function wishlist.etat_options(id_liste uuid)
returns table (option_id uuid, souhait_id uuid, reservee boolean, reservee_par_moi boolean)
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
  select o.id, s.id,
         case when s.mode_options = 'toutes' then exists (select 1 from wishlist.reservations r where r.option_id = o.id)
              else false end,
         exists (select 1 from wishlist.reservations r where r.option_id = o.id and r.reserve_par = auth.uid())
  from wishlist.options o
  join wishlist.souhaits s on s.id = o.souhait_id
  where s.liste_id = id_liste;
end;
$$;

grant execute on function wishlist.etat_options(uuid) to authenticated;

notify pgrst, 'reload schema';

commit;
