-- =========================================================================
-- Migration — VoyageCommun : notifications dans l'app
--
-- La base crée elle-même une notification pour les invités concernés quand
-- quelque chose bouge dans un voyage (jamais pour l'auteur de l'action) :
--   - on est invité à un voyage ;
--   - des dates sont proposées, puis retenues ;
--   - un hébergement est proposé, puis retenu ;
--   - une activité est proposée, puis retenue.
-- Chacun ne lit, ne marque comme lues et ne supprime QUE les siennes.
-- Seules les personnes avec un compte reçoivent des notifications.
--
-- Pré-requis : migrations voyage précédentes.
-- =========================================================================

begin;

create table voyage.notifications (
  id uuid primary key default gen_random_uuid(),
  utilisateur_id uuid not null references auth.users (id) on delete cascade,
  voyage_id uuid not null references voyage.voyages (id) on delete cascade,
  type text not null check (type in (
    'invitation', 'dates_proposees', 'dates_retenues',
    'hebergement_propose', 'hebergement_retenu', 'activite_proposee', 'activite_retenue'
  )),
  message text not null,
  -- Écran de l'app à ouvrir (Voyage, Dates, Hebergements, Activites…).
  ecran text not null default 'Voyage',
  auteur uuid references auth.users (id) on delete set null,
  lue_le timestamptz,
  cree_le timestamptz not null default now()
);
create index notifications_utilisateur on voyage.notifications (utilisateur_id, cree_le desc);

alter table voyage.notifications enable row level security;
create policy "Mes notifications" on voyage.notifications
  for select using (utilisateur_id = auth.uid());
create policy "Marquer mes notifications" on voyage.notifications
  for update using (utilisateur_id = auth.uid()) with check (utilisateur_id = auth.uid());
create policy "Supprimer mes notifications" on voyage.notifications
  for delete using (utilisateur_id = auth.uid());
-- Pas d'insertion directe : seules les fonctions ci-dessous en créent.
grant select, update, delete on voyage.notifications to authenticated;

-- Prénom de l'auteur de l'action (ou "Quelqu'un").
create or replace function voyage.prenom_auteur()
returns text
language sql stable security definer
set search_path = voyage, pg_temp
as $$
  select coalesce(nullif(trim((select prenom from famille.profils where utilisateur_id = auth.uid())), ''), 'Quelqu’un');
$$;

-- Notifie les invités (avec compte, n'ayant pas décliné) d'un voyage, sauf
-- l'auteur de l'action.
create or replace function voyage.notifier(id_voyage uuid, type_notif text, texte text, ecran_cible text)
returns void
language sql security definer
set search_path = voyage, pg_temp
as $$
  insert into voyage.notifications (utilisateur_id, voyage_id, type, message, ecran, auteur)
  select distinct p.utilisateur_id, id_voyage, type_notif, texte, ecran_cible, auth.uid()
  from voyage.participants pa
  join famille.personnes p on p.id = pa.personne_id
  where pa.voyage_id = id_voyage
    and pa.reponse <> 'decline'
    and p.utilisateur_id is not null
    and p.utilisateur_id is distinct from auth.uid();
$$;

create or replace function voyage.titre_voyage(id_voyage uuid)
returns text
language sql stable security definer
set search_path = voyage, pg_temp
as $$ select titre from voyage.voyages where id = id_voyage; $$;

-- Invitation : la personne invitée (si elle a un compte et n'est pas
-- l'auteur).
create or replace function voyage.notif_invitation()
returns trigger
language plpgsql security definer
set search_path = voyage, pg_temp
as $$
declare
  destinataire uuid := (select utilisateur_id from famille.personnes where id = new.personne_id);
begin
  if destinataire is not null and destinataire is distinct from auth.uid() then
    insert into voyage.notifications (utilisateur_id, voyage_id, type, message, ecran, auteur)
    values (
      destinataire, new.voyage_id, 'invitation',
      voyage.prenom_auteur() || ' vous invite : « ' || voyage.titre_voyage(new.voyage_id) || ' »',
      'Voyage', auth.uid()
    );
  end if;
  return new;
end;
$$;

create trigger notif_invitation
after insert on voyage.participants
for each row execute function voyage.notif_invitation();

create or replace function voyage.notif_dates()
returns trigger
language plpgsql security definer
set search_path = voyage, pg_temp
as $$
begin
  if tg_table_name = 'propositions_dates' then
    perform voyage.notifier(
      new.voyage_id, 'dates_proposees',
      voyage.prenom_auteur() || ' propose des dates pour « ' || voyage.titre_voyage(new.voyage_id) || ' » : du '
        || to_char(new.date_debut, 'DD/MM') || ' au ' || to_char(new.date_fin, 'DD/MM/YYYY'),
      'Dates');
  elsif new.date_debut is not null and new.date_fin is not null
        and (old.date_debut is distinct from new.date_debut or old.date_fin is distinct from new.date_fin) then
    perform voyage.notifier(
      new.id, 'dates_retenues',
      'Dates retenues pour « ' || new.titre || ' » : du ' || to_char(new.date_debut, 'DD/MM') || ' au '
        || to_char(new.date_fin, 'DD/MM/YYYY'),
      'Dates');
  end if;
  return new;
end;
$$;

create trigger notif_dates_proposees
after insert on voyage.propositions_dates
for each row execute function voyage.notif_dates();
create trigger notif_dates_retenues
after update of date_debut, date_fin on voyage.voyages
for each row execute function voyage.notif_dates();

create or replace function voyage.notif_hebergement()
returns trigger
language plpgsql security definer
set search_path = voyage, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    perform voyage.notifier(
      new.voyage_id, 'hebergement_propose',
      voyage.prenom_auteur() || ' propose un hébergement pour « ' || voyage.titre_voyage(new.voyage_id) || ' » : ' || new.nom,
      'Hebergements');
  elsif new.statut = 'retenu' and old.statut is distinct from 'retenu' then
    perform voyage.notifier(
      new.voyage_id, 'hebergement_retenu',
      'Hébergement retenu pour « ' || voyage.titre_voyage(new.voyage_id) || ' » : ' || new.nom,
      'Hebergements');
  end if;
  return new;
end;
$$;

create trigger notif_hebergement
after insert or update of statut on voyage.hebergements
for each row execute function voyage.notif_hebergement();

create or replace function voyage.notif_activite()
returns trigger
language plpgsql security definer
set search_path = voyage, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    perform voyage.notifier(
      new.voyage_id, 'activite_proposee',
      voyage.prenom_auteur() || ' propose une activité pour « ' || voyage.titre_voyage(new.voyage_id) || ' » : ' || new.titre,
      'Activites');
  elsif new.statut = 'retenu' and old.statut is distinct from 'retenu' then
    perform voyage.notifier(
      new.voyage_id, 'activite_retenue',
      'Activité retenue pour « ' || voyage.titre_voyage(new.voyage_id) || ' » : ' || new.titre,
      'Activites');
  end if;
  return new;
end;
$$;

create trigger notif_activite
after insert or update of statut on voyage.activites
for each row execute function voyage.notif_activite();

revoke execute on function voyage.notifier(uuid, text, text, text) from public;

notify pgrst, 'reload schema';

commit;
