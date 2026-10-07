-- =========================================================================
-- Migration — VoyageCommun : voyages et repas surprises
--
-- Un organisateur peut garder un voyage ou un repas secret pour certaines
-- personnes de la famille (voyage.secrets) :
--   - niveau 'cache' : la personne ne voit RIEN (ni le voyage, ni le repas,
--     ni ses notifications), même si elle fait partie des invités (voyage
--     surprise qu'on lui offre) ou si quelqu'un de son foyer y va ;
--   - niveau 'fete'  : la personne fêtée (anniversaire…) sait que
--     l'événement existe : elle en voit le titre, les dates retenues, le
--     lieu d'un repas et un mot de l'organisateur (message_surprise), par la
--     fonction voyage.evenements_pour_moi(). Rien d'autre : ni le menu, ni
--     les invités, ni qui vient, ni les listes de cadeaux, ni l'hébergement,
--     ni la destination d'un voyage.
--
-- Garanti par les règles RLS : est_participant() et peut_voir(), sur
-- lesquelles reposent toutes les règles du schéma voyage, répondent « non »
-- à une personne tenue au secret. Les notifications qui lui seraient
-- destinées ne sont pas créées (et celles déjà reçues, par exemple
-- l'invitation envoyée à la création, sont effacées quand le secret est
-- posé).
--
-- On ne garde pas le secret pour le créateur ni pour un organisateur.
-- Le secret tombe tout seul le lendemain de la fin de l'événement (date de
-- fin retenue, heure de Paris), ou quand un organisateur le lève.
--
-- Pré-requis : migrations voyage (20260929100000 à 20261001120000).
-- =========================================================================

begin;

-- -------------------------------------------------------------------------
-- 1. Données
-- -------------------------------------------------------------------------

alter table voyage.voyages add column if not exists message_surprise text;
comment on column voyage.voyages.message_surprise is
  'Mot de l''organisateur montré aux personnes fêtées (ex. « Prévois une tenue chic ! »).';

create table voyage.secrets (
  voyage_id uuid not null references voyage.voyages (id) on delete cascade,
  personne_id uuid not null references famille.personnes (id) on delete cascade,
  niveau text not null check (niveau in ('cache', 'fete')),
  ajoute_par uuid default auth.uid() references auth.users (id) on delete set null,
  ajoute_le timestamptz not null default now(),
  primary key (voyage_id, personne_id)
);
create index secrets_personne on voyage.secrets (personne_id);

-- -------------------------------------------------------------------------
-- 2. Qui est tenu au secret
-- -------------------------------------------------------------------------

-- Niveau de secret ('cache' ou 'fete') de ce voyage pour cet utilisateur,
-- ou null. Interne : non exposée aux apps (elle dirait pour qui un voyage
-- est secret).
create or replace function voyage.secret_pour(id_voyage uuid, id_utilisateur uuid)
returns text
language sql stable security definer
set search_path = voyage, pg_temp
as $$
  select s.niveau
  from voyage.secrets s
  join famille.personnes p on p.id = s.personne_id
  join voyage.voyages v on v.id = s.voyage_id
  where s.voyage_id = id_voyage
    and p.utilisateur_id = id_utilisateur
    and v.cree_par <> id_utilisateur
    and not exists (
      select 1 from voyage.participants pa
      where pa.voyage_id = id_voyage and pa.personne_id = s.personne_id and pa.role = 'organisateur'
    )
    and (v.date_fin is null or v.date_fin >= (now() at time zone 'Europe/Paris')::date)
  order by s.niveau  -- 'cache' avant 'fete'
  limit 1;
$$;

create or replace function voyage.secret_pour_moi(id_voyage uuid)
returns text
language sql stable security definer
set search_path = voyage, pg_temp
as $$ select voyage.secret_pour(id_voyage, auth.uid()); $$;

-- Les deux fonctions sur lesquelles reposent les règles du schéma : une
-- personne tenue au secret n'est plus « participante » et ne « voit » plus
-- le voyage, même par l'intermédiaire d'un enfant de son foyer.
create or replace function voyage.est_participant(id_voyage uuid)
returns boolean
language sql stable security definer
set search_path = voyage, pg_temp
as $$
  select exists (
    select 1 from voyage.participants
    where voyage_id = id_voyage and personne_id in (select voyage.mes_personnes())
  )
  and voyage.secret_pour_moi(id_voyage) is null;
$$;

create or replace function voyage.peut_voir(id_voyage uuid)
returns boolean
language sql stable security definer
set search_path = voyage, pg_temp
as $$
  select exists (
    select 1 from voyage.voyages v
    where v.id = id_voyage
      and (
        v.cree_par = auth.uid()
        or voyage.est_participant(v.id)
        or (v.participation = 'famille' and v.famille_id in (select famille.mes_familles()))
      )
  )
  and voyage.secret_pour_moi(id_voyage) is null;
$$;

-- -------------------------------------------------------------------------
-- 3. Règles
-- -------------------------------------------------------------------------

alter table voyage.secrets enable row level security;

-- Ceux qui voient le voyage savent pour qui il est secret (pour ne pas
-- vendre la mèche) ; seuls les organisateurs posent ou lèvent un secret.
create policy "Voir les secrets" on voyage.secrets
  for select using (voyage.peut_voir(voyage_id));
create policy "Poser un secret" on voyage.secrets
  for insert with check (
    voyage.est_organisateur(voyage_id) and personne_id in (select voyage.personnes_invitables())
  );
create policy "Changer un secret" on voyage.secrets
  for update using (voyage.est_organisateur(voyage_id)) with check (voyage.est_organisateur(voyage_id));
create policy "Lever un secret" on voyage.secrets
  for delete using (voyage.est_organisateur(voyage_id));

grant select, insert, update, delete on voyage.secrets to authenticated;

-- Pas de secret pour le créateur ni pour un organisateur.
create or replace function voyage.regler_secret()
returns trigger
language plpgsql security definer
set search_path = voyage, pg_temp
as $$
begin
  new.voyage_id := coalesce(old.voyage_id, new.voyage_id);
  new.personne_id := coalesce(old.personne_id, new.personne_id);
  if exists (
       select 1 from voyage.voyages v join famille.personnes p on p.utilisateur_id = v.cree_par
       where v.id = new.voyage_id and p.id = new.personne_id
     )
     or exists (
       select 1 from voyage.participants
       where voyage_id = new.voyage_id and personne_id = new.personne_id and role = 'organisateur'
     ) then
    raise exception 'Impossible : cette personne organise ce voyage.';
  end if;
  return new;
end;
$$;

create trigger regler_secret
before insert or update on voyage.secrets
for each row execute function voyage.regler_secret();

-- Secret posé : on efface les notifications déjà reçues pour ce voyage
-- (l'invitation envoyée à la création, par exemple).
create or replace function voyage.effacer_notifications_secretes()
returns trigger
language plpgsql security definer
set search_path = voyage, pg_temp
as $$
begin
  delete from voyage.notifications n
  using famille.personnes p
  where p.id = new.personne_id
    and n.utilisateur_id = p.utilisateur_id
    and n.voyage_id = new.voyage_id;
  return new;
end;
$$;

create trigger effacer_notifications_secretes
after insert or update on voyage.secrets
for each row execute function voyage.effacer_notifications_secretes();

-- On ne confie pas l'organisation à une personne tenue au secret.
create or replace function voyage.organisateur_sans_secret()
returns trigger
language plpgsql security definer
set search_path = voyage, pg_temp
as $$
begin
  if new.role = 'organisateur' and exists (
    select 1 from voyage.secrets where voyage_id = new.voyage_id and personne_id = new.personne_id
  ) then
    raise exception 'Impossible : ce voyage est une surprise pour cette personne.';
  end if;
  return new;
end;
$$;

create trigger organisateur_sans_secret
before insert or update of role on voyage.participants
for each row execute function voyage.organisateur_sans_secret();

-- Aucune notification à une personne tenue au secret, quel que soit le
-- déclencheur qui la crée.
create or replace function voyage.filtrer_notification_secrete()
returns trigger
language plpgsql security definer
set search_path = voyage, pg_temp
as $$
begin
  if new.voyage_id is not null and voyage.secret_pour(new.voyage_id, new.utilisateur_id) is not null then
    return null;
  end if;
  return new;
end;
$$;

create trigger filtrer_notification_secrete
before insert on voyage.notifications
for each row execute function voyage.filtrer_notification_secrete();

-- -------------------------------------------------------------------------
-- 4. Ce que voit la personne fêtée
-- -------------------------------------------------------------------------

-- Les événements organisés pour moi : titre, dates, lieu d'un repas (pas
-- la destination d'un voyage), mot de l'organisateur. Ni les invités, ni le
-- contenu.
create or replace function voyage.evenements_pour_moi()
returns table (
  id uuid, famille_id uuid, titre text, nature text, statut text, periode text, annee smallint,
  date_debut date, date_fin date, foyer_hote uuid, lieu text, message text
)
language sql stable security definer
set search_path = voyage, pg_temp
as $$
  select v.id, v.famille_id, v.titre, v.nature, v.statut, v.periode, v.annee,
         v.date_debut, v.date_fin,
         case when v.nature = 'repas' then v.foyer_hote end,
         case when v.nature = 'repas' then v.destination end,
         v.message_surprise
  from voyage.voyages v
  where voyage.secret_pour(v.id, auth.uid()) = 'fete'
    and v.famille_id in (select famille.mes_familles())
  order by v.date_debut nulls last, v.cree_le;
$$;

revoke execute on function voyage.secret_pour(uuid, uuid) from public, anon, authenticated;
grant execute on function voyage.secret_pour_moi(uuid), voyage.evenements_pour_moi() to authenticated;

notify pgrst, 'reload schema';

commit;
