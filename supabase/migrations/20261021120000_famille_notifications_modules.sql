-- =========================================================================
-- Migration — App Famille : notifications de tous les modules, et sur le
-- téléphone
--
-- Spécification V1, § 2.5. Jusqu'ici, seul VoyageCommun écrivait dans
-- famille.notifications. Cette migration y ajoute :
--   - Courses   : liste partagée avec vous, articles ajoutés à une liste que
--                 vous voyez (regroupés : une nouveauté par liste et par
--                 3 heures), courses faites ;
--   - Cadeaux   : nouvelle envie ou idée sur une liste que vous voyez ;
--   - Recettes  : nouvelle recette de la famille ;
--   - Quotidien : un trajet de vos enfants trouve son conducteur, un trajet
--                 n'a plus de conducteur, une tâche confiée à quelqu'un de
--                 votre foyer.
-- (Souvenirs : rien pour l'instant ; la visibilité d'un souvenir se règle
-- après sa création, une nouveauté risquerait d'en dire trop.)
--
-- RÈGLE « SURPRISE », GARANTIE PAR LA BASE : pour Cadeaux et Recettes, la
-- nouveauté n'est créée pour une personne que si elle VOIT l'élément avec
-- ses propres règles RLS. Le déclencheur vérifie, pour chaque destinataire,
-- « est-ce que cette ligne lui est visible ? » en prenant un instant son
-- identité (comme une requête de l'app faite par elle), puis reprend celle
-- de l'auteur. Une idée cachée, une liste commune, une recette surprise ne
-- sont donc jamais annoncées à qui ne doit pas les voir.
--
-- Notifications sur le téléphone : téléphones inscrits (famille.appareils),
-- réglage par module (famille.reglages_notifications), envoi par la
-- fonction Edge envoyer-notifications (planification :
-- supabase/planification_notifications.sql). Les rappels de la veille de
-- Quotidien (rappels-veille, quotidien.appareils) restent tels quels.
--
-- AJOUT SEULEMENT : nouvelles tables, fonctions et déclencheurs. Les
-- déclencheurs ne lèvent JAMAIS d'erreur : en cas de souci, la nouveauté
-- n'est pas créée et l'action de l'app (actuelle ou nouvelle) réussit.
--
-- Pré-requis : 20261020100000_famille_notifications.sql et les migrations
-- des modules.
-- =========================================================================

begin;

-- -------------------------------------------------------------------------
-- 1. Aides réservées aux déclencheurs
-- -------------------------------------------------------------------------
-- pg_trigger_depth() > 0 : utilisables seulement depuis un déclencheur,
-- jamais appelées directement par l'API.

-- Crée une nouveauté pour un utilisateur, sauf pour l'auteur. Avec
-- « regrouper », pas de doublon : rien si une nouveauté non lue du même
-- type, vers le même écran, existe depuis moins longtemps.
create or replace function famille.notifier_declencheur(
  destinataire uuid,
  nom_module text,
  type_notif text,
  texte text,
  chemin text,
  regrouper interval default null
)
returns void
language plpgsql security definer
set search_path = famille, pg_temp
as $$
begin
  if pg_trigger_depth() = 0 or destinataire is null or destinataire is not distinct from auth.uid() then
    return;
  end if;
  if regrouper is not null and exists (
    select 1 from famille.notifications n
    where n.utilisateur_id = destinataire and n.type = type_notif and n.cible = chemin
      and n.lue_le is null and n.cree_le > now() - regrouper
  ) then
    return;
  end if;
  insert into famille.notifications (utilisateur_id, module, type, message, cible, auteur)
  values (destinataire, nom_module, type_notif, left(texte, 300), chemin, auth.uid());
end;
$$;

-- Prénom d'un utilisateur (« Quelqu'un » s'il n'en a pas).
create or replace function famille.prenom_utilisateur(id_utilisateur uuid)
returns text
language sql stable security definer
set search_path = famille, pg_temp
as $$
  select case when pg_trigger_depth() = 0 then null else
    coalesce((select nullif(trim(p.prenom), '') from famille.personnes p where p.utilisateur_id = id_utilisateur limit 1),
             'Quelqu''un') end;
$$;

-- Utilisateurs des familles d'un utilisateur (lui compris).
create or replace function famille.utilisateurs_familles_de(id_utilisateur uuid)
returns setof uuid
language sql stable security definer
set search_path = famille, pg_temp
as $$
  select distinct m2.utilisateur_id
  from famille.famille_membres m1
  join famille.famille_membres m2 on m2.famille_id = m1.famille_id
  where pg_trigger_depth() > 0 and m1.utilisateur_id = id_utilisateur;
$$;

-- Utilisateurs membres d'un foyer.
create or replace function famille.utilisateurs_du_foyer(id_foyer uuid)
returns setof uuid
language sql stable security definer
set search_path = famille, pg_temp
as $$
  select m.utilisateur_id from famille.foyer_membres m
  where pg_trigger_depth() > 0 and m.foyer_id = id_foyer;
$$;

-- Prend l'identité d'un utilisateur pour la suite de la transaction (même
-- rôle « authenticated », autre identifiant) : les règles RLS répondent
-- alors pour lui. Renvoie les réglages d'avant, à rendre avec
-- famille.reprendre_identite.
create or replace function famille.prendre_identite(id_utilisateur uuid)
returns text[]
language plpgsql
as $$
declare
  avant text[] := array[current_setting('request.jwt.claims', true), current_setting('request.jwt.claim.sub', true)];
begin
  if pg_trigger_depth() = 0 then
    raise exception 'Réservé aux déclencheurs';
  end if;
  perform set_config('request.jwt.claims', json_build_object('sub', id_utilisateur, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', id_utilisateur::text, true);
  return avant;
end;
$$;

create or replace function famille.reprendre_identite(avant text[])
returns void
language plpgsql
as $$
begin
  perform set_config('request.jwt.claims', coalesce(avant[1], ''), true);
  perform set_config('request.jwt.claim.sub', coalesce(avant[2], ''), true);
end;
$$;

revoke all on function
  famille.notifier_declencheur(uuid, text, text, text, text, interval),
  famille.prenom_utilisateur(uuid),
  famille.utilisateurs_familles_de(uuid),
  famille.utilisateurs_du_foyer(uuid),
  famille.prendre_identite(uuid),
  famille.reprendre_identite(text[])
from public, anon;
-- Les déclencheurs s'exécutent avec les droits de l'auteur de l'action.
grant execute on function
  famille.notifier_declencheur(uuid, text, text, text, text, interval),
  famille.prenom_utilisateur(uuid),
  famille.utilisateurs_familles_de(uuid),
  famille.utilisateurs_du_foyer(uuid),
  famille.prendre_identite(uuid),
  famille.reprendre_identite(text[])
to authenticated, service_role;

-- « mardi 27 octobre » (sans l'année)
create or replace function famille.jour_en_clair(d date)
returns text
language sql immutable
as $$
  select (array['dimanche','lundi','mardi','mercredi','jeudi','vendredi','samedi'])[extract(dow from d)::int + 1]
    || ' ' || case when extract(day from d) = 1 then '1er' else extract(day from d)::int::text end
    || ' ' || (array['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'])[extract(month from d)::int];
$$;

-- -------------------------------------------------------------------------
-- 2. Courses
-- -------------------------------------------------------------------------

-- Utilisateurs qui voient une liste : son foyer (liste du foyer) ou son
-- créateur (liste « moi »), et les personnes avec qui elle est partagée.
create or replace function courses.utilisateurs_de_liste(id_liste uuid)
returns setof uuid
language sql stable security definer
set search_path = courses, famille, pg_temp
as $$
  select m.utilisateur_id from courses.listes l
  join famille.foyer_membres m on m.foyer_id = l.foyer_id
  where pg_trigger_depth() > 0 and l.id = id_liste and l.portee = 'foyer'
  union
  select l.cree_par from courses.listes l where pg_trigger_depth() > 0 and l.id = id_liste
  union
  select i.utilisateur_id from courses.invites i where pg_trigger_depth() > 0 and i.liste_id = id_liste;
$$;
revoke all on function courses.utilisateurs_de_liste(uuid) from public, anon;
grant execute on function courses.utilisateurs_de_liste(uuid) to authenticated, service_role;

create or replace function courses.notif_partage()
returns trigger
language plpgsql
set search_path = courses, famille, pg_temp
as $$
declare
  nom_liste text;
begin
  begin
    select l.nom into nom_liste from courses.listes l where l.id = new.liste_id;
    perform famille.notifier_declencheur(
      new.utilisateur_id, 'courses', 'partage',
      famille.prenom_utilisateur(auth.uid()) || ' a partagé la liste « ' || coalesce(nom_liste, 'Courses') || ' » avec vous',
      'courses/liste/' || new.liste_id);
  exception when others then
    raise warning 'notif_partage : %', sqlerrm;
  end;
  return null;
end;
$$;

create or replace function courses.notif_articles()
returns trigger
language plpgsql
set search_path = courses, famille, pg_temp
as $$
declare
  nom_liste text;
  dest uuid;
begin
  begin
    if auth.uid() is null then return null; end if;
    select l.nom into nom_liste from courses.listes l where l.id = new.liste_id;
    for dest in select courses.utilisateurs_de_liste(new.liste_id) loop
      perform famille.notifier_declencheur(
        dest, 'courses', 'articles',
        famille.prenom_utilisateur(auth.uid()) || ' a ajouté des articles à « ' || coalesce(nom_liste, 'la liste') || ' »',
        'courses/liste/' || new.liste_id, interval '3 hours');
    end loop;
  exception when others then
    raise warning 'notif_articles : %', sqlerrm;
  end;
  return null;
end;
$$;

create or replace function courses.notif_courses_faites()
returns trigger
language plpgsql
set search_path = courses, famille, pg_temp
as $$
declare
  nom_liste text;
  dest uuid;
begin
  begin
    if auth.uid() is null then return null; end if;
    select l.nom into nom_liste from courses.listes l where l.id = new.liste_id;
    for dest in select courses.utilisateurs_de_liste(new.liste_id) loop
      perform famille.notifier_declencheur(
        dest, 'courses', 'courses_faites',
        famille.prenom_utilisateur(auth.uid()) || ' a fait les courses « ' || coalesce(nom_liste, 'Courses') || ' »',
        'courses/liste/' || new.liste_id, interval '1 hour');
    end loop;
  exception when others then
    raise warning 'notif_courses_faites : %', sqlerrm;
  end;
  return null;
end;
$$;

drop trigger if exists famille_notif_partage on courses.invites;
create trigger famille_notif_partage after insert on courses.invites
  for each row execute function courses.notif_partage();
drop trigger if exists famille_notif_articles on courses.articles;
create trigger famille_notif_articles after insert on courses.articles
  for each row execute function courses.notif_articles();
drop trigger if exists famille_notif_courses_faites on courses.passages;
create trigger famille_notif_courses_faites after insert on courses.passages
  for each row execute function courses.notif_courses_faites();

-- -------------------------------------------------------------------------
-- 3. Cadeaux (règle « surprise » : vérification sous l'identité de chacun)
-- -------------------------------------------------------------------------
create or replace function wishlist.notif_souhait()
returns trigger
language plpgsql
set search_path = wishlist, famille, pg_temp
as $$
declare
  auteur uuid := auth.uid();
  dest uuid;
  avant text[];
  visible boolean;
  quoi text;
begin
  begin
    -- Seulement pour une action faite dans l'app, avec les règles RLS de
    -- l'auteur (pas pour une fonction de la base ni la clé de service).
    if auteur is null or current_user <> 'authenticated' then return null; end if;
    select case
             when l.destinataire_id is not null then
               case when new.secret then 'Idée de cadeau pour ' else 'Nouvelle envie de ' end
               || coalesce(nullif(trim(p.prenom), ''), 'quelqu''un')
             else 'Nouvelle idée dans « ' || coalesce(l.titre, 'une liste commune') || ' »'
           end
      into quoi
      from wishlist.listes l
      left join famille.personnes p on p.id = l.destinataire_id
     where l.id = new.liste_id;
    for dest in select famille.utilisateurs_familles_de(auteur) loop
      continue when dest = auteur;
      avant := famille.prendre_identite(dest);
      select exists (select 1 from wishlist.souhaits s where s.id = new.id) into visible;
      perform famille.reprendre_identite(avant);
      if visible then
        perform famille.notifier_declencheur(
          dest, 'cadeaux', 'envie', coalesce(quoi, 'Nouvelle envie') || ' : ' || new.titre,
          'cadeaux/liste/' || new.liste_id, interval '3 hours');
      end if;
    end loop;
  exception when others then
    raise warning 'notif_souhait : %', sqlerrm;
  end;
  return null;
end;
$$;

drop trigger if exists famille_notif_souhait on wishlist.souhaits;
create trigger famille_notif_souhait after insert on wishlist.souhaits
  for each row execute function wishlist.notif_souhait();

-- -------------------------------------------------------------------------
-- 4. Recettes (une recette surprise n'est annoncée à personne qui ne la voit)
-- -------------------------------------------------------------------------
create or replace function recettes.notif_recette()
returns trigger
language plpgsql
set search_path = recettes, famille, pg_temp
as $$
declare
  auteur uuid := auth.uid();
  dest uuid;
  avant text[];
  visible boolean;
begin
  begin
    if auteur is null or current_user <> 'authenticated' then return null; end if;
    for dest in select famille.utilisateurs_familles_de(auteur) loop
      continue when dest = auteur;
      avant := famille.prendre_identite(dest);
      select exists (select 1 from recettes.recettes r where r.id = new.id) into visible;
      perform famille.reprendre_identite(avant);
      if visible then
        perform famille.notifier_declencheur(
          dest, 'recettes', 'recette',
          famille.prenom_utilisateur(auteur) || ' a ajouté une recette : ' || new.titre,
          'recettes/recette/' || new.id);
      end if;
    end loop;
  exception when others then
    raise warning 'notif_recette : %', sqlerrm;
  end;
  return null;
end;
$$;

drop trigger if exists famille_notif_recette on recettes.recettes;
create trigger famille_notif_recette after insert on recettes.recettes
  for each row execute function recettes.notif_recette();

-- -------------------------------------------------------------------------
-- 5. Quotidien
-- -------------------------------------------------------------------------

-- Un trajet trouve son conducteur (pris, ou proposé puis accepté) : les
-- foyers des enfants transportés, sauf celui du conducteur. Un trajet perd
-- son conducteur : tous les foyers du groupe, sauf l'auteur.
create or replace function quotidien.notif_trajet()
returns trigger
language plpgsql
set search_path = quotidien, famille, pg_temp
as $$
declare
  s record;
  conducteur record;
  enfants text;
  dest uuid;
  quand text;
begin
  begin
    if auth.uid() is null then return null; end if;
    select se.date, a.nom, a.groupe_id into s
      from quotidien.seances se join quotidien.activites a on a.id = se.activite_id
     where se.id = new.seance_id;
    if s is null or s.date < (now() at time zone 'Europe/Paris')::date then return null; end if;
    quand := famille.jour_en_clair(s.date) || ' à ' || to_char(new.heure, 'FMHH24"h"MI');

    if new.conducteur_id is not null and not new.propose
       and (old.conducteur_id is distinct from new.conducteur_id or old.propose) then
      select p.nom_affiche, p.foyer_id into conducteur from quotidien.participants p where p.id = new.conducteur_id;
      for dest in
        select distinct m.utilisateur_id
        from quotidien.trajet_enfants te
        join quotidien.enfants e on e.id = te.enfant_id
        join quotidien.participants p on p.id = e.participant_id
        join famille.foyer_membres m on m.foyer_id = p.foyer_id
        where te.trajet_id = new.id and p.foyer_id is distinct from conducteur.foyer_id
      loop
        select string_agg(e.prenom, ', ' order by e.prenom) into enfants
          from quotidien.trajet_enfants te
          join quotidien.enfants e on e.id = te.enfant_id
          join quotidien.participants p on p.id = e.participant_id
          join famille.foyer_membres m on m.foyer_id = p.foyer_id and m.utilisateur_id = dest
         where te.trajet_id = new.id;
        perform famille.notifier_declencheur(
          dest, 'quotidien', 'trajet_pris',
          coalesce(conducteur.nom_affiche, 'Quelqu''un') || ' conduira ' || coalesce(enfants, 'les enfants') || ' ' || quand
            || ' (' || s.nom || ', ' || new.sens || ')',
          'quotidien/groupe/' || s.groupe_id);
      end loop;
    elsif new.conducteur_id is null and old.conducteur_id is not null then
      for dest in
        select distinct m.utilisateur_id
        from quotidien.participants p
        join famille.foyer_membres m on m.foyer_id = p.foyer_id
        where p.groupe_id = s.groupe_id and p.parti_le is null
      loop
        perform famille.notifier_declencheur(
          dest, 'quotidien', 'trajet_libre',
          'Plus de conducteur : ' || s.nom || ' (' || new.sens || '), ' || quand,
          'quotidien/groupe/' || s.groupe_id);
      end loop;
    end if;
  exception when others then
    raise warning 'notif_trajet : %', sqlerrm;
  end;
  return null;
end;
$$;

drop trigger if exists famille_notif_trajet on quotidien.trajets;
create trigger famille_notif_trajet after update of conducteur_id, propose on quotidien.trajets
  for each row execute function quotidien.notif_trajet();

-- Tâche confiée à une personne d'un autre foyer : ce foyer est prévenu.
create or replace function quotidien.notif_tache_confiee()
returns trigger
language plpgsql
set search_path = quotidien, famille, pg_temp
as $$
declare
  r record;
  dest uuid;
begin
  begin
    if auth.uid() is null or cardinality(new.personnes) = 0 then return null; end if;
    for r in
      select p.foyer_id, string_agg(nullif(trim(p.prenom), ''), ', ' order by p.prenom) as prenoms
      from famille.personnes p
      where p.id = any (new.personnes) and p.foyer_id is distinct from new.foyer_id and p.foyer_id is not null
      group by p.foyer_id
    loop
      for dest in select famille.utilisateurs_du_foyer(r.foyer_id) loop
        perform famille.notifier_declencheur(
          dest, 'quotidien', 'tache_confiee',
          famille.prenom_utilisateur(auth.uid()) || ' a confié une tâche à ' || coalesce(r.prenoms, 'votre foyer') || ' : ' || new.libelle,
          'quotidien/taches');
      end loop;
    end loop;
  exception when others then
    raise warning 'notif_tache_confiee : %', sqlerrm;
  end;
  return null;
end;
$$;

drop trigger if exists famille_notif_tache_confiee on quotidien.taches;
create trigger famille_notif_tache_confiee after insert on quotidien.taches
  for each row execute function quotidien.notif_tache_confiee();

-- -------------------------------------------------------------------------
-- 6. Sur le téléphone
-- -------------------------------------------------------------------------

-- Téléphones où l'app Famille envoie les nouveautés (jeton Expo).
create table if not exists famille.appareils (
  jeton text primary key check (jeton like 'ExponentPushToken[%' or jeton like 'ExpoPushToken[%'),
  utilisateur_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  plateforme text check (plateforme in ('ios', 'android')),
  maj_le timestamptz not null default now()
);
create index if not exists appareils_utilisateur on famille.appareils (utilisateur_id);
alter table famille.appareils enable row level security;
drop policy if exists "Mes téléphones" on famille.appareils;
create policy "Mes téléphones" on famille.appareils for select using (utilisateur_id = auth.uid());
drop policy if exists "Retirer mon téléphone" on famille.appareils;
create policy "Retirer mon téléphone" on famille.appareils for delete using (utilisateur_id = auth.uid());
grant select, delete on famille.appareils to authenticated;

create or replace function famille.enregistrer_appareil(jeton_expo text, plateforme_appareil text default null)
returns void
language plpgsql security definer
set search_path = famille, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'Vous devez être connecté';
  end if;
  insert into famille.appareils (jeton, utilisateur_id, plateforme, maj_le)
  values (jeton_expo, auth.uid(), plateforme_appareil, now())
  on conflict (jeton) do update
    set utilisateur_id = excluded.utilisateur_id, plateforme = excluded.plateforme, maj_le = now();
end;
$$;
revoke all on function famille.enregistrer_appareil(text, text) from public, anon;
grant execute on function famille.enregistrer_appareil(text, text) to authenticated;

-- Nouveautés envoyées ou non sur le téléphone, module par module
-- (absent = oui).
create table if not exists famille.reglages_notifications (
  utilisateur_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  module text not null check (module in ('recettes', 'courses', 'quotidien', 'cadeaux', 'voyages', 'souvenirs')),
  telephone boolean not null default true,
  maj_le timestamptz not null default now(),
  primary key (utilisateur_id, module)
);
alter table famille.reglages_notifications enable row level security;
drop policy if exists "Mes réglages de notifications" on famille.reglages_notifications;
create policy "Mes réglages de notifications" on famille.reglages_notifications
  for all using (utilisateur_id = auth.uid()) with check (utilisateur_id = auth.uid());
grant select, insert, update, delete on famille.reglages_notifications to authenticated;

-- Nouveautés déjà envoyées sur les téléphones (jamais deux fois).
create table if not exists famille.notifications_envoyees (
  notification_id uuid primary key references famille.notifications (id) on delete cascade,
  envoyee_le timestamptz not null default now()
);
alter table famille.notifications_envoyees enable row level security;
revoke all on famille.notifications_envoyees from anon, authenticated;

-- À envoyer : nouveautés de moins de 2 heures, pas encore lues ni
-- envoyées, pour un utilisateur qui a un téléphone inscrit et n'a pas
-- coupé ce module. Réservé à la clé de service (envoyer-notifications).
create or replace function famille.notifications_a_envoyer(limite int default 500)
returns table (notification_id uuid, jetons text[], module text, message text, cible text)
language sql stable security definer
set search_path = famille, pg_temp
as $$
  select n.id, array_agg(a.jeton), n.module, n.message, n.cible
  from famille.notifications n
  join famille.appareils a on a.utilisateur_id = n.utilisateur_id
  where n.cree_le > now() - interval '2 hours'
    and n.lue_le is null
    and not exists (select 1 from famille.notifications_envoyees e where e.notification_id = n.id)
    and coalesce((select r.telephone from famille.reglages_notifications r
                  where r.utilisateur_id = n.utilisateur_id and r.module = n.module), true)
  group by n.id, n.module, n.message, n.cible, n.cree_le
  order by n.cree_le
  limit greatest(limite, 1);
$$;
revoke all on function famille.notifications_a_envoyer(int) from public, anon, authenticated;
grant execute on function famille.notifications_a_envoyer(int) to service_role;
grant select, insert on famille.notifications_envoyees to service_role;
grant select, delete on famille.appareils to service_role;

commit;
