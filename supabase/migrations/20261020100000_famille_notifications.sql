-- =========================================================================
-- Migration — App Famille (nouvelle version) : notifications communes
--
-- Spécification V1, § 2.5. Nouvelle table famille.notifications, sur le
-- modèle de voyage.notifications : l'écran Activité, les pastilles de
-- l'accueil et « À faire pour vous » de l'app Famille la lisent.
--
-- AJOUT SEULEMENT : aucune table existante n'est modifiée ni supprimée.
-- Les six apps actuelles continuent de fonctionner exactement comme avant
-- (VoyageCommun garde voyage.notifications et sa cloche).
--
--   - Les notifications de VoyageCommun déjà existantes sont recopiées ;
--     les nouvelles le sont automatiquement (déclencheur), avec les mêmes
--     destinataires : la règle « surprise » de voyage.notifier s'applique
--     donc aussi ici, rien n'est montré à une personne tenue au secret.
--   - « Lu » est synchronisé dans les deux sens : lire une nouveauté dans
--     l'app Famille la marque lue dans VoyageCommun, et inversement.
--   - Chacun ne lit, ne marque et ne supprime QUE les siennes. Pas
--     d'insertion directe : seules des fonctions « security definer » en
--     créent (famille.notifier pour les prochains modules).
--
-- Sans cette migration, l'app Famille lit directement voyage.notifications :
-- elle marche aussi, avec moins de choses dans Activité.
--
-- Pré-requis : 20260929140000_voyage_notifications.sql.
-- =========================================================================

begin;

create table if not exists famille.notifications (
  id uuid primary key default gen_random_uuid(),
  utilisateur_id uuid not null references auth.users (id) on delete cascade,
  module text not null check (module in ('recettes', 'courses', 'quotidien', 'cadeaux', 'voyages', 'souvenirs')),
  type text not null,
  message text not null,
  -- Chemin interne de l'écran à ouvrir, ex. 'voyages/voyage/<id>/dates',
  -- 'courses/liste/<id>' (mêmes chemins que le site web).
  cible text not null,
  -- 'valider', 'voter', 'conduire'… (null = simple information)
  action text,
  action_faite_le timestamptz,
  auteur uuid references auth.users (id) on delete set null,
  lue_le timestamptz,
  cree_le timestamptz not null default now(),
  -- Notification de VoyageCommun recopiée (synchronisation de « lu »).
  source_voyage_id uuid unique references voyage.notifications (id) on delete cascade
);
create index if not exists notifications_utilisateur on famille.notifications (utilisateur_id, cree_le desc);

alter table famille.notifications enable row level security;
drop policy if exists "Mes notifications" on famille.notifications;
create policy "Mes notifications" on famille.notifications
  for select using (utilisateur_id = auth.uid());
drop policy if exists "Marquer mes notifications" on famille.notifications;
create policy "Marquer mes notifications" on famille.notifications
  for update using (utilisateur_id = auth.uid()) with check (utilisateur_id = auth.uid());
drop policy if exists "Supprimer mes notifications" on famille.notifications;
create policy "Supprimer mes notifications" on famille.notifications
  for delete using (utilisateur_id = auth.uid());
-- Pas d'insertion directe. En modification, seuls « lu » et « action faite ».
grant select, delete on famille.notifications to authenticated;
grant update (lue_le, action_faite_le) on famille.notifications to authenticated;

-- -------------------------------------------------------------------------
-- Création par les modules (prochaines étapes) : une notification pour un
-- utilisateur. Chaque appelant vérifie la règle « surprise » AVANT
-- d'appeler (pas de notification sur une idée ou une réservation à la
-- personne qui reçoit le cadeau, ni sur un voyage surprise à la personne
-- tenue au secret).
-- -------------------------------------------------------------------------
create or replace function famille.notifier(
  destinataire uuid,
  nom_module text,
  type_notif text,
  texte text,
  chemin text,
  action_attendue text default null
)
returns void
language sql security definer
set search_path = famille, pg_temp
as $$
  insert into famille.notifications (utilisateur_id, module, type, message, cible, action, auteur)
  select destinataire, nom_module, type_notif, texte, chemin, action_attendue, auth.uid()
  where destinataire is distinct from auth.uid();
$$;
revoke all on function famille.notifier(uuid, text, text, text, text, text) from public, anon, authenticated;

-- -------------------------------------------------------------------------
-- Recopie des notifications de VoyageCommun
-- -------------------------------------------------------------------------

-- Écran de VoyageCommun → chemin interne.
create or replace function famille.chemin_voyage(id_voyage uuid, ecran text)
returns text
language sql immutable
as $$
  select 'voyages/voyage/' || id_voyage::text || case ecran
    when 'Dates' then '/dates'
    when 'Hebergements' then '/hebergement'
    when 'Transport' then '/transport'
    when 'Activites' then '/activites'
    when 'Programme' then '/programme'
    when 'Budget' then '/budget'
    when 'Menu' then '/menu'
    when 'ListesCadeaux' then '/cadeaux'
    when 'Surprise' then '/surprise'
    else ''
  end;
$$;

create or replace function famille.recopier_notification_voyage()
returns trigger
language plpgsql security definer
set search_path = famille, pg_temp
as $$
begin
  insert into famille.notifications (utilisateur_id, module, type, message, cible, auteur, lue_le, cree_le, source_voyage_id)
  values (new.utilisateur_id, 'voyages', new.type, new.message, famille.chemin_voyage(new.voyage_id, new.ecran),
          new.auteur, new.lue_le, new.cree_le, new.id)
  on conflict (source_voyage_id) do nothing;
  return new;
end;
$$;

drop trigger if exists recopier_dans_famille on voyage.notifications;
create trigger recopier_dans_famille
  after insert on voyage.notifications
  for each row execute function famille.recopier_notification_voyage();

-- Notifications déjà existantes.
insert into famille.notifications (utilisateur_id, module, type, message, cible, auteur, lue_le, cree_le, source_voyage_id)
select n.utilisateur_id, 'voyages', n.type, n.message, famille.chemin_voyage(n.voyage_id, n.ecran), n.auteur, n.lue_le, n.cree_le, n.id
from voyage.notifications n
on conflict (source_voyage_id) do nothing;

-- « Lu » dans les deux sens (la condition « is distinct from » arrête
-- l'aller-retour entre les deux déclencheurs).
create or replace function famille.synchroniser_lu_vers_voyage()
returns trigger
language plpgsql security definer
set search_path = famille, pg_temp
as $$
begin
  if new.source_voyage_id is not null then
    update voyage.notifications set lue_le = new.lue_le
    where id = new.source_voyage_id and lue_le is distinct from new.lue_le;
  end if;
  return new;
end;
$$;

drop trigger if exists synchroniser_lu on famille.notifications;
create trigger synchroniser_lu
  after update of lue_le on famille.notifications
  for each row when (new.lue_le is distinct from old.lue_le)
  execute function famille.synchroniser_lu_vers_voyage();

create or replace function famille.synchroniser_lu_depuis_voyage()
returns trigger
language plpgsql security definer
set search_path = famille, pg_temp
as $$
begin
  update famille.notifications set lue_le = new.lue_le
  where source_voyage_id = new.id and lue_le is distinct from new.lue_le;
  return new;
end;
$$;

drop trigger if exists synchroniser_lu_famille on voyage.notifications;
create trigger synchroniser_lu_famille
  after update of lue_le on voyage.notifications
  for each row when (new.lue_le is distinct from old.lue_le)
  execute function famille.synchroniser_lu_depuis_voyage();

commit;
