-- =========================================================================
-- Migration 1 — Socle famille commun à toutes les apps
--
-- Sort le compte famille du schéma "recettes" vers un nouveau schéma
-- "famille", partagé par Cuisine, CadeauCommun et les apps à venir, et passe
-- au modèle "plusieurs familles par utilisateur" :
--   - un utilisateur vit dans UN foyer (règle inchangée) ;
--   - un foyer peut appartenir à PLUSIEURS familles (table famille_foyers) ;
--   - la famille active est commune à toutes les apps (table famille_active) ;
--     si l'utilisateur quitte sa famille active, l'autre devient active ;
--   - les personnes sans compte (bébé, grand-parent) existent dans
--     famille.personnes, pour pouvoir recevoir des cadeaux.
--
-- Tout se fait dans une transaction : en cas d'erreur, rien n'est modifié.
--
-- AVANT : sauvegarder la base (Dashboard > Database > Backups) et tester sur
-- une copie. APRÈS : ajouter "famille" aux schémas exposés
-- (Project Settings > API > Exposed schemas).
--
-- Compatibilité : des vues et des fonctions relais portant les anciens noms
-- restent dans le schéma "recettes", pour que les versions de l'app Cuisine
-- déjà installées continuent de fonctionner (famille active uniquement).
-- Seule exception connue : changer son prénom depuis une ancienne version.
-- =========================================================================

begin;

create schema if not exists famille;

grant usage on schema famille to anon, authenticated;
alter default privileges in schema famille
  grant select, insert, update, delete on tables to authenticated;

-- -------------------------------------------------------------------------
-- 1. Déplacement des tables (données, clés étrangères, index et règles RLS
--    suivent : les tables des recettes, courses, congélateurs… qui pointent
--    vers foyers continuent de pointer vers la même table).
-- -------------------------------------------------------------------------

alter table recettes.familles        set schema famille;
alter table recettes.famille_membres set schema famille;
alter table recettes.foyers          set schema famille;
alter table recettes.foyer_membres   set schema famille;
alter table recettes.invitations     set schema famille;
alter table recettes.profils         set schema famille;

-- -------------------------------------------------------------------------
-- 2. Plusieurs familles par utilisateur
-- -------------------------------------------------------------------------

-- Un foyer peut appartenir à plusieurs familles.
create table famille.famille_foyers (
  famille_id uuid not null references famille.familles (id) on delete cascade,
  foyer_id uuid not null references famille.foyers (id) on delete cascade,
  rejoint_le timestamptz not null default now(),
  primary key (famille_id, foyer_id)
);

insert into famille.famille_foyers (famille_id, foyer_id, rejoint_le)
select famille_id, id, cree_le from famille.foyers where famille_id is not null
on conflict do nothing;

-- foyers.famille_id devient la "famille d'origine" du foyer (informatif,
-- gardé pour les anciennes versions de l'app). La vérité est famille_foyers.
alter table famille.foyers alter column famille_id drop not null;
comment on column famille.foyers.famille_id is
  'Famille d''origine du foyer (informatif). Appartenance réelle : famille.famille_foyers.';

-- Un utilisateur peut maintenant être membre de plusieurs familles.
alter table famille.famille_membres drop constraint famille_membres_pkey;
alter table famille.famille_membres add primary key (famille_id, utilisateur_id);
create index if not exists famille_membres_utilisateur on famille.famille_membres (utilisateur_id);

-- Famille active, commune à toutes les apps.
create table famille.famille_active (
  utilisateur_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  famille_id uuid not null references famille.familles (id) on delete cascade,
  maj_le timestamptz not null default now()
);

-- -------------------------------------------------------------------------
-- 3. Personnes (avec ou sans compte)
-- -------------------------------------------------------------------------

create table famille.personnes (
  id uuid primary key default gen_random_uuid(),
  utilisateur_id uuid unique references auth.users (id) on delete set null,
  foyer_id uuid references famille.foyers (id) on delete cascade,
  prenom text not null default '',
  date_naissance date,
  tailles jsonb not null default '{}'::jsonb,
  gere_par uuid references auth.users (id) on delete set null,
  cree_par uuid references auth.users (id) on delete set null default auth.uid(),
  cree_le timestamptz not null default now(),
  maj_le timestamptz not null default now()
);
create index personnes_foyer on famille.personnes (foyer_id);

comment on table famille.personnes is
  'Toute personne de la famille pouvant recevoir un cadeau. utilisateur_id vide = personne sans compte, gérée par gere_par.';

-- Une personne par membre existant, avec son prénom quand il est connu.
insert into famille.personnes (utilisateur_id, foyer_id, prenom, cree_par, cree_le)
select fm.utilisateur_id, fm.foyer_id, coalesce(p.prenom, ''), fm.utilisateur_id, fm.rejoint_le
from famille.foyer_membres fm
left join famille.profils p on p.utilisateur_id = fm.utilisateur_id
on conflict (utilisateur_id) do nothing;

-- -------------------------------------------------------------------------
-- 4. Fonctions
--
-- Les fonctions existantes sont DÉPLACÉES (et non recréées) : les règles RLS
-- des tables recettes qui les appellent restent ainsi branchées dessus. On
-- remplace ensuite leur contenu, qui citait encore le schéma "recettes".
-- -------------------------------------------------------------------------

alter function recettes.mes_foyers()                   set schema famille;
alter function recettes.ma_famille()                   set schema famille;
alter function recettes.foyers_de_ma_famille()         set schema famille;
alter function recettes.est_createur_du_foyer(uuid)    set schema famille;
alter function recettes.generer_code_invitation()      set schema famille;
alter function recettes.obtenir_code_invitation(text)  set schema famille;
alter function recettes.rejoindre_avec_code(text)      set schema famille;
alter function recettes.creer_famille(text)            set schema famille;
alter function recettes.creer_foyer(text)              set schema famille;
alter function recettes.foyers_a_rejoindre()           set schema famille;
alter function recettes.choisir_foyer(uuid)            set schema famille;

-- Lecture étendue à TOUTES les familles de l'utilisateur (les apps filtrent
-- ensuite sur la famille active).
alter function famille.foyers_de_ma_famille() rename to foyers_de_mes_familles;

-- Foyers dont l'utilisateur est membre (un seul en pratique).
create or replace function famille.mes_foyers()
returns setof uuid
language sql stable security definer
set search_path = famille, pg_temp
as $$
  select foyer_id from famille.foyer_membres where utilisateur_id = auth.uid();
$$;

-- Toutes les familles de l'utilisateur.
create or replace function famille.mes_familles()
returns setof uuid
language sql stable security definer
set search_path = famille, pg_temp
as $$
  select famille_id from famille.famille_membres where utilisateur_id = auth.uid();
$$;

-- Famille ACTIVE de l'utilisateur : son choix s'il est toujours membre,
-- sinon la première famille rejointe (bascule automatique), sinon null.
create or replace function famille.ma_famille()
returns uuid
language sql stable security definer
set search_path = famille, pg_temp
as $$
  select coalesce(
    (select a.famille_id from famille.famille_active a
      join famille.famille_membres m
        on m.famille_id = a.famille_id and m.utilisateur_id = a.utilisateur_id
      where a.utilisateur_id = auth.uid()),
    (select m.famille_id from famille.famille_membres m
      where m.utilisateur_id = auth.uid()
      order by m.rejoint_le, m.famille_id
      limit 1)
  );
$$;

-- Foyers de toutes mes familles (le mien compris).
create or replace function famille.foyers_de_mes_familles()
returns setof uuid
language sql stable security definer
set search_path = famille, pg_temp
as $$
  select ff.foyer_id from famille.famille_foyers ff
  where ff.famille_id in (select famille.mes_familles())
  union
  select famille.mes_foyers();
$$;

-- Foyers de la famille active (le mien compris) : filtre utilisé par les apps.
create or replace function famille.foyers_famille_active()
returns setof uuid
language sql stable security definer
set search_path = famille, pg_temp
as $$
  select ff.foyer_id from famille.famille_foyers ff
  where ff.famille_id = famille.ma_famille()
  union
  select famille.mes_foyers();
$$;

create or replace function famille.est_createur_du_foyer(id_foyer uuid)
returns boolean
language sql stable security definer
set search_path = famille, pg_temp
as $$
  select exists (select 1 from famille.foyers where id = id_foyer and cree_par = auth.uid());
$$;

create or replace function famille.generer_code_invitation()
returns text
language plpgsql volatile
set search_path = famille, pg_temp
as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  resultat text := '';
begin
  for i in 1..6 loop
    resultat := resultat || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
  end loop;
  return resultat;
end;
$$;

-- Choisir la famille active (commune à toutes les apps).
create or replace function famille.choisir_famille_active(id_famille uuid)
returns uuid
language plpgsql security definer
set search_path = famille, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'Vous devez être connecté';
  end if;
  if not exists (
    select 1 from famille.famille_membres where famille_id = id_famille and utilisateur_id = auth.uid()
  ) then
    raise exception 'Vous ne faites pas partie de cette famille';
  end if;

  insert into famille.famille_active (utilisateur_id, famille_id, maj_le)
  values (auth.uid(), id_famille, now())
  on conflict (utilisateur_id) do update set famille_id = excluded.famille_id, maj_le = now();

  return id_famille;
end;
$$;

-- Rattacher un foyer (et tous ses membres) à une famille.
create or replace function famille.rattacher_foyer(id_foyer uuid, id_famille uuid)
returns void
language sql security definer
set search_path = famille, pg_temp
as $$
  insert into famille.famille_foyers (famille_id, foyer_id)
  values (id_famille, id_foyer)
  on conflict do nothing;

  insert into famille.famille_membres (utilisateur_id, famille_id)
  select fm.utilisateur_id, id_famille from famille.foyer_membres fm where fm.foyer_id = id_foyer
  on conflict do nothing;
$$;
revoke execute on function famille.rattacher_foyer(uuid, uuid) from public, anon, authenticated;

-- Mes familles, pour le sélecteur : [{ "id", "nom", "active" }, ...]
create or replace function famille.lister_mes_familles()
returns json
language sql stable security definer
set search_path = famille, pg_temp
as $$
  select coalesce(json_agg(json_build_object(
    'id', f.id,
    'nom', f.nom,
    'active', f.id = famille.ma_famille()
  ) order by m.rejoint_le), '[]'::json)
  from famille.famille_membres m
  join famille.familles f on f.id = m.famille_id
  where m.utilisateur_id = auth.uid();
$$;

-- Code d'invitation de la famille ACTIVE (tout membre) ou, ancien usage,
-- du foyer (son créateur). Résultat : { "code", "expire_le" }
create or replace function famille.obtenir_code_invitation(type_code text)
returns json
language plpgsql security definer
set search_path = famille, pg_temp
as $$
declare
  id_famille uuid;
  id_foyer uuid;
  invitation famille.invitations;
begin
  if auth.uid() is null then
    raise exception 'Vous devez être connecté';
  end if;

  id_famille := famille.ma_famille();

  if type_code = 'famille' then
    if id_famille is null then
      raise exception 'Rejoignez ou créez d''abord une famille';
    end if;

    select * into invitation from famille.invitations i
    where i.type = 'famille' and i.famille_id = id_famille
      and i.expire_le > now() + interval '1 hour'
    order by i.expire_le desc limit 1;
  elsif type_code = 'foyer' then
    select f.id into id_foyer
    from famille.foyers f
    join famille.foyer_membres m on m.foyer_id = f.id
    where m.utilisateur_id = auth.uid() and f.cree_par = auth.uid()
    limit 1;

    if id_foyer is null then
      raise exception 'Seul le créateur du foyer peut générer un code foyer';
    end if;

    select * into invitation from famille.invitations i
    where i.type = 'foyer' and i.foyer_id = id_foyer
      and i.expire_le > now() + interval '1 hour'
    order by i.expire_le desc limit 1;
  else
    raise exception 'Type de code inconnu : %', type_code;
  end if;

  if invitation.id is null then
    loop
      begin
        insert into famille.invitations (type, famille_id, foyer_id, code, creee_par, expire_le)
        values (type_code, id_famille, id_foyer, famille.generer_code_invitation(), auth.uid(), now() + interval '1 day')
        returning * into invitation;
        exit;
      exception when unique_violation then
        -- Code déjà pris (collision très rare) : on en tire un autre.
      end;
    end loop;
  end if;

  return json_build_object('code', invitation.code, 'expire_le', invitation.expire_le);
end;
$$;

-- Utiliser un code. Code famille : si l'utilisateur a déjà un foyer, TOUT
-- son foyer rejoint la famille (l'app demande confirmation avant) ; sinon il
-- rejoint la famille puis choisit ou crée un foyer. Code foyer (ancien) :
-- rejoint le foyer et ses familles. La famille du code devient active.
-- Résultat : { "type", "famille_id", "foyer_id" }
create or replace function famille.rejoindre_avec_code(code_saisi text)
returns json
language plpgsql security definer
set search_path = famille, pg_temp
as $$
declare
  invitation famille.invitations;
  famille_du_code uuid;
  foyer_actuel uuid;
begin
  if auth.uid() is null then
    raise exception 'Vous devez être connecté';
  end if;

  select * into invitation from famille.invitations where code = upper(trim(code_saisi));

  if invitation.id is null then
    raise exception 'Code d''invitation invalide';
  end if;
  if invitation.expire_le <= now() then
    raise exception 'Ce code a expiré : demandez-en un nouveau';
  end if;

  select foyer_id into foyer_actuel from famille.foyer_membres where utilisateur_id = auth.uid() limit 1;

  if invitation.type = 'foyer' then
    if foyer_actuel is not null and foyer_actuel <> invitation.foyer_id then
      raise exception 'Vous faites déjà partie d''un autre foyer';
    end if;

    insert into famille.foyer_membres (foyer_id, utilisateur_id, role)
    values (invitation.foyer_id, auth.uid(), 'membre')
    on conflict (foyer_id, utilisateur_id) do nothing;

    select coalesce(
      (select famille_id from famille.foyers where id = invitation.foyer_id),
      (select famille_id from famille.famille_foyers where foyer_id = invitation.foyer_id limit 1)
    ) into famille_du_code;
    foyer_actuel := invitation.foyer_id;
  else
    famille_du_code := invitation.famille_id;

    insert into famille.famille_membres (utilisateur_id, famille_id)
    values (auth.uid(), famille_du_code)
    on conflict do nothing;

    if foyer_actuel is not null then
      perform famille.rattacher_foyer(foyer_actuel, famille_du_code);
    end if;
  end if;

  perform famille.choisir_famille_active(famille_du_code);

  return json_build_object(
    'type', invitation.type,
    'famille_id', famille_du_code,
    'foyer_id', case when invitation.type = 'foyer' then invitation.foyer_id end
  );
end;
$$;

-- Créer une famille (première ou seconde). Si l'utilisateur a déjà un foyer,
-- ce foyer y est rattaché. La nouvelle famille devient active.
create or replace function famille.creer_famille(nom_famille text)
returns uuid
language plpgsql security definer
set search_path = famille, pg_temp
as $$
declare
  nouvelle_famille uuid;
  foyer_actuel uuid;
begin
  if auth.uid() is null then
    raise exception 'Vous devez être connecté';
  end if;
  if coalesce(trim(nom_famille), '') = '' then
    raise exception 'Le nom de la famille est obligatoire';
  end if;

  insert into famille.familles (nom, cree_par)
  values (trim(nom_famille), auth.uid())
  returning id into nouvelle_famille;

  insert into famille.famille_membres (utilisateur_id, famille_id)
  values (auth.uid(), nouvelle_famille);

  select foyer_id into foyer_actuel from famille.foyer_membres where utilisateur_id = auth.uid() limit 1;
  if foyer_actuel is not null then
    perform famille.rattacher_foyer(foyer_actuel, nouvelle_famille);
  end if;

  perform famille.choisir_famille_active(nouvelle_famille);
  return nouvelle_famille;
end;
$$;

-- Créer son foyer. Il est rattaché à toutes les familles de l'utilisateur.
create or replace function famille.creer_foyer(nom_foyer text)
returns uuid
language plpgsql security definer
set search_path = famille, pg_temp
as $$
declare
  id_famille uuid;
  autre_famille uuid;
  nouveau_foyer uuid;
begin
  if auth.uid() is null then
    raise exception 'Vous devez être connecté';
  end if;
  if coalesce(trim(nom_foyer), '') = '' then
    raise exception 'Le nom du foyer est obligatoire';
  end if;

  id_famille := famille.ma_famille();
  if id_famille is null then
    raise exception 'Rejoignez ou créez d''abord une famille';
  end if;
  if exists (select 1 from famille.foyer_membres where utilisateur_id = auth.uid()) then
    raise exception 'Vous faites déjà partie d''un foyer';
  end if;

  insert into famille.foyers (nom, cree_par, famille_id)
  values (trim(nom_foyer), auth.uid(), id_famille)
  returning id into nouveau_foyer;

  insert into famille.foyer_membres (foyer_id, utilisateur_id, role)
  values (nouveau_foyer, auth.uid(), 'administrateur');

  for autre_famille in select famille.mes_familles() loop
    perform famille.rattacher_foyer(nouveau_foyer, autre_famille);
  end loop;

  return nouveau_foyer;
end;
$$;

-- Foyers de la famille active, proposés au nouvel arrivant.
-- Résultat : [{ "id", "nom", "createur", "nb_membres" }, ...]
create or replace function famille.foyers_a_rejoindre()
returns json
language sql stable security definer
set search_path = famille, pg_temp
as $$
  select coalesce(json_agg(json_build_object(
    'id', f.id,
    'nom', f.nom,
    'createur', p.prenom,
    'nb_membres', (select count(*) from famille.foyer_membres m where m.foyer_id = f.id)
  ) order by f.nom), '[]'::json)
  from famille.famille_foyers ff
  join famille.foyers f on f.id = ff.foyer_id
  left join famille.profils p on p.utilisateur_id = f.cree_par
  where ff.famille_id = famille.ma_famille();
$$;

-- Rejoindre un foyer existant de sa famille active. L'utilisateur devient
-- aussi membre de toutes les familles de ce foyer.
create or replace function famille.choisir_foyer(id_foyer uuid)
returns uuid
language plpgsql security definer
set search_path = famille, pg_temp
as $$
declare
  f uuid;
begin
  if auth.uid() is null then
    raise exception 'Vous devez être connecté';
  end if;
  if famille.ma_famille() is null then
    raise exception 'Rejoignez ou créez d''abord une famille';
  end if;
  if not exists (
    select 1 from famille.famille_foyers where foyer_id = id_foyer and famille_id = famille.ma_famille()
  ) then
    raise exception 'Ce foyer ne fait pas partie de votre famille';
  end if;
  if exists (select 1 from famille.foyer_membres where utilisateur_id = auth.uid()) then
    raise exception 'Vous faites déjà partie d''un foyer';
  end if;

  insert into famille.foyer_membres (foyer_id, utilisateur_id, role)
  values (id_foyer, auth.uid(), 'membre');

  for f in select famille_id from famille.famille_foyers where foyer_id = id_foyer loop
    insert into famille.famille_membres (utilisateur_id, famille_id)
    values (auth.uid(), f)
    on conflict do nothing;
  end loop;

  return id_foyer;
end;
$$;

-- Quitter une famille. Avec un foyer, c'est tout le foyer qui la quitte.
-- On ne peut pas quitter sa seule famille. Si c'était la famille active,
-- l'autre devient active automatiquement (voir ma_famille).
create or replace function famille.quitter_famille(id_famille uuid)
returns void
language plpgsql security definer
set search_path = famille, pg_temp
as $$
declare
  foyer_actuel uuid;
begin
  if auth.uid() is null then
    raise exception 'Vous devez être connecté';
  end if;
  if not exists (select 1 from famille.famille_membres where famille_id = id_famille and utilisateur_id = auth.uid()) then
    raise exception 'Vous ne faites pas partie de cette famille';
  end if;
  if (select count(*) from famille.famille_membres where utilisateur_id = auth.uid()) < 2 then
    raise exception 'Vous ne pouvez pas quitter votre seule famille';
  end if;

  select foyer_id into foyer_actuel from famille.foyer_membres where utilisateur_id = auth.uid() limit 1;

  if foyer_actuel is not null then
    delete from famille.famille_foyers where famille_id = id_famille and foyer_id = foyer_actuel;
    delete from famille.famille_membres
    where famille_id = id_famille
      and utilisateur_id in (select utilisateur_id from famille.foyer_membres where foyer_id = foyer_actuel);
    delete from famille.famille_active
    where famille_id = id_famille
      and utilisateur_id in (select utilisateur_id from famille.foyer_membres where foyer_id = foyer_actuel);
  else
    delete from famille.famille_membres where famille_id = id_famille and utilisateur_id = auth.uid();
    delete from famille.famille_active where famille_id = id_famille and utilisateur_id = auth.uid();
  end if;
end;
$$;

grant execute on function
  famille.mes_foyers(), famille.mes_familles(), famille.ma_famille(),
  famille.foyers_de_mes_familles(), famille.foyers_famille_active(),
  famille.est_createur_du_foyer(uuid), famille.choisir_famille_active(uuid),
  famille.lister_mes_familles(), famille.obtenir_code_invitation(text),
  famille.rejoindre_avec_code(text), famille.creer_famille(text), famille.creer_foyer(text),
  famille.foyers_a_rejoindre(), famille.choisir_foyer(uuid), famille.quitter_famille(uuid)
to authenticated;

-- -------------------------------------------------------------------------
-- 5. Personnes : création automatique et prénom synchronisé
-- -------------------------------------------------------------------------

-- Quand un utilisateur rejoint un foyer, sa fiche personne est créée (ou
-- rattachée à ce foyer).
create or replace function famille.personne_du_membre()
returns trigger
language plpgsql security definer
set search_path = famille, pg_temp
as $$
begin
  insert into famille.personnes (utilisateur_id, foyer_id, prenom, cree_par)
  values (
    new.utilisateur_id, new.foyer_id,
    coalesce((select prenom from famille.profils where utilisateur_id = new.utilisateur_id), ''),
    new.utilisateur_id
  )
  on conflict (utilisateur_id) do update set foyer_id = excluded.foyer_id, maj_le = now();
  return new;
end;
$$;

create trigger personne_du_membre
after insert on famille.foyer_membres
for each row execute function famille.personne_du_membre();

-- Le prénom saisi dans le profil est recopié sur la fiche personne.
create or replace function famille.prenom_vers_personne()
returns trigger
language plpgsql security definer
set search_path = famille, pg_temp
as $$
begin
  update famille.personnes set prenom = new.prenom, maj_le = now()
  where utilisateur_id = new.utilisateur_id;
  return new;
end;
$$;

create trigger prenom_vers_personne
after insert or update of prenom on famille.profils
for each row execute function famille.prenom_vers_personne();

-- -------------------------------------------------------------------------
-- 6. Règles RLS du schéma famille (celles qui ne visaient qu'une famille
--    sont réécrites pour toutes les familles de l'utilisateur).
-- -------------------------------------------------------------------------

drop policy if exists "Voir sa famille" on famille.familles;
create policy "Voir ses familles" on famille.familles
  for select using (id in (select famille.mes_familles()));

drop policy if exists "Voir les membres de sa famille" on famille.famille_membres;
create policy "Voir les membres de ses familles" on famille.famille_membres
  for select using (famille_id in (select famille.mes_familles()));

drop policy if exists "Voir les invitations de sa famille et de son foyer" on famille.invitations;
create policy "Voir les invitations de ses familles et de son foyer" on famille.invitations
  for select using (
    foyer_id in (select famille.mes_foyers())
    or famille_id in (select famille.mes_familles())
  );

drop policy if exists "Voir les profils de sa famille" on famille.profils;
create policy "Voir les profils de ses familles" on famille.profils
  for select using (
    utilisateur_id = auth.uid()
    or utilisateur_id in (
      select utilisateur_id from famille.famille_membres where famille_id in (select famille.mes_familles())
    )
  );

-- Les membres des foyers de mes familles (pour afficher qui est qui).
drop policy if exists "Voir les membres des foyers de ses familles" on famille.foyer_membres;
create policy "Voir les membres des foyers de ses familles" on famille.foyer_membres
  for select using (foyer_id in (select famille.foyers_de_mes_familles()));

alter table famille.famille_foyers enable row level security;
create policy "Voir les foyers de ses familles" on famille.famille_foyers
  for select using (famille_id in (select famille.mes_familles()));

alter table famille.famille_active enable row level security;
create policy "Voir sa famille active" on famille.famille_active
  for select using (utilisateur_id = auth.uid());

alter table famille.personnes enable row level security;
create policy "Voir les personnes de ses familles" on famille.personnes
  for select using (foyer_id in (select famille.foyers_de_mes_familles()) or utilisateur_id = auth.uid());
create policy "Modifier sa propre fiche" on famille.personnes
  for update using (utilisateur_id = auth.uid()) with check (utilisateur_id = auth.uid());
-- Personnes sans compte : gérées par les membres de leur foyer.
create policy "Ajouter une personne sans compte à son foyer" on famille.personnes
  for insert with check (utilisateur_id is null and foyer_id in (select famille.mes_foyers()));
create policy "Modifier une personne sans compte de son foyer" on famille.personnes
  for update using (utilisateur_id is null and foyer_id in (select famille.mes_foyers()))
  with check (utilisateur_id is null and foyer_id in (select famille.mes_foyers()));
create policy "Retirer une personne sans compte de son foyer" on famille.personnes
  for delete using (utilisateur_id is null and foyer_id in (select famille.mes_foyers()));

grant select, insert, update, delete on all tables in schema famille to authenticated;
-- Les écritures sur familles, membres, foyers et invitations passent par les
-- fonctions ci-dessus ; la famille active aussi (choisir_famille_active).
revoke insert, update, delete on famille.famille_foyers, famille.famille_active from authenticated;

-- -------------------------------------------------------------------------
-- 7. Compatibilité avec les versions de l'app Cuisine déjà installées
--    (client configuré sur le schéma "recettes"). À supprimer quand toutes
--    les installations sont à jour (migration de nettoyage).
-- -------------------------------------------------------------------------

create view recettes.familles with (security_invoker = true) as
  select * from famille.familles;

-- Une seule ligne "moi" : celle de la famille active (l'ancienne version
-- lit famille_membres avec maybeSingle).
create view recettes.famille_membres with (security_invoker = true) as
  select utilisateur_id, famille_id, rejoint_le
  from famille.famille_membres
  where famille_id = famille.ma_famille();

create view recettes.foyers with (security_invoker = true) as
  select * from famille.foyers;

create view recettes.foyer_membres with (security_invoker = true) as
  select * from famille.foyer_membres;

create view recettes.invitations with (security_invoker = true) as
  select * from famille.invitations;

create view recettes.profils with (security_invoker = true) as
  select * from famille.profils;

grant select on recettes.familles, recettes.famille_membres, recettes.foyers,
  recettes.foyer_membres, recettes.invitations to authenticated;
grant select, insert, update on recettes.profils to authenticated;

-- Fonctions relais (anciens noms appelés par l'app).
create or replace function recettes.rejoindre_avec_code(code_saisi text) returns json
language sql security invoker as $$ select famille.rejoindre_avec_code(code_saisi) $$;
create or replace function recettes.creer_famille(nom_famille text) returns uuid
language sql security invoker as $$ select famille.creer_famille(nom_famille) $$;
create or replace function recettes.creer_foyer(nom_foyer text) returns uuid
language sql security invoker as $$ select famille.creer_foyer(nom_foyer) $$;
create or replace function recettes.foyers_a_rejoindre() returns json
language sql security invoker as $$ select famille.foyers_a_rejoindre() $$;
create or replace function recettes.choisir_foyer(id_foyer uuid) returns uuid
language sql security invoker as $$ select famille.choisir_foyer(id_foyer) $$;
create or replace function recettes.obtenir_code_invitation(type_code text) returns json
language sql security invoker as $$ select famille.obtenir_code_invitation(type_code) $$;
create or replace function recettes.rejoindre_foyer(code_saisi text) returns uuid
language sql security invoker as $$ select (famille.rejoindre_avec_code(code_saisi) ->> 'foyer_id')::uuid $$;

grant execute on function recettes.rejoindre_avec_code(text), recettes.creer_famille(text),
  recettes.creer_foyer(text), recettes.foyers_a_rejoindre(), recettes.choisir_foyer(uuid),
  recettes.obtenir_code_invitation(text), recettes.rejoindre_foyer(text)
to authenticated;

-- Recharge le cache de l'API pour qu'elle voie le nouveau schéma.
notify pgrst, 'reload schema';

commit;
