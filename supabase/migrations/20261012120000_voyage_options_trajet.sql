-- =========================================================================
-- Migration — VoyageCommun : options de trajet et étapes partagées
--
-- Pour aller en Angleterre depuis Caen, on peut prendre l'avion, le bateau
-- ou la voiture : chaque façon d'y aller est une OPTION (voyage.options_trajet),
-- proposée par n'importe quel participant et commentée par les autres. Un
-- organisateur en retient une ; les autres passent « écartées » (toujours
-- visibles). Seule l'option retenue compte dans le budget.
--
-- Une option est une suite d'ÉTAPES : les trajets existants (voyage.trajets)
-- y sont rattachés (option_id) et ordonnés (ordre). Chaque étape a ses
-- passagers, d'un ou plusieurs foyers : deux foyers partent chacun de chez
-- eux puis se retrouvent sur une étape commune (le ferry), dont le coût est
-- partagé entre tous ses passagers.
--
-- Les trajets déjà saisis sont regroupés dans une option « Trajets prévus »,
-- retenue : rien ne change pour les voyages en cours. Une ancienne version de
-- l'app qui ajoute un trajet sans option le voit rattaché à l'option retenue
-- (ou à la première).
--
-- Pré-requis : migrations voyage (20260929100000 à 20261002100000).
-- =========================================================================

begin;

-- -------------------------------------------------------------------------
-- 1. Données
-- -------------------------------------------------------------------------

create table voyage.options_trajet (
  id uuid primary key default gen_random_uuid(),
  voyage_id uuid not null references voyage.voyages (id) on delete cascade,
  nom text not null check (length(trim(nom)) > 0),
  description text,
  statut text not null default 'proposee' check (statut in ('proposee', 'retenue', 'ecartee')),
  propose_par uuid not null default auth.uid() references auth.users (id) on delete cascade,
  cree_le timestamptz not null default now()
);
create index options_trajet_voyage on voyage.options_trajet (voyage_id);
-- Une seule option retenue par voyage.
create unique index options_trajet_une_retenue on voyage.options_trajet (voyage_id) where statut = 'retenue';

-- Commentaires : un par personne et par option (modifiable).
create table voyage.avis_options_trajet (
  option_id uuid not null references voyage.options_trajet (id) on delete cascade,
  utilisateur_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  commentaire text not null check (length(trim(commentaire)) > 0),
  maj_le timestamptz not null default now(),
  primary key (option_id, utilisateur_id)
);

alter table voyage.trajets
  add column if not exists option_id uuid references voyage.options_trajet (id) on delete cascade,
  add column if not exists ordre smallint not null default 0;
create index trajets_option on voyage.trajets (option_id, ordre);

-- Trajets déjà saisis : une option « Trajets prévus », retenue, par voyage.
with voyages_a_regrouper as (
  select distinct t.voyage_id, v.cree_par
  from voyage.trajets t join voyage.voyages v on v.id = t.voyage_id
  where t.option_id is null
),
nouvelles as (
  insert into voyage.options_trajet (voyage_id, nom, statut, propose_par)
  select voyage_id, 'Trajets prévus', 'retenue', cree_par from voyages_a_regrouper
  returning id, voyage_id
)
update voyage.trajets t set option_id = n.id
from nouvelles n
where t.voyage_id = n.voyage_id and t.option_id is null;

-- Ordre des étapes déjà saisies : celui de leur création.
update voyage.trajets t set ordre = r.rang
from (select id, row_number() over (partition by option_id order by cree_le)::smallint as rang from voyage.trajets) r
where t.id = r.id;

-- -------------------------------------------------------------------------
-- 2. Fonctions de contrôle
-- -------------------------------------------------------------------------

create or replace function voyage.voyage_d_option(id_option uuid)
returns uuid language sql stable security definer set search_path = voyage, pg_temp
as $$ select voyage_id from voyage.options_trajet where id = id_option; $$;

-- -------------------------------------------------------------------------
-- 3. Règles
-- -------------------------------------------------------------------------

alter table voyage.options_trajet enable row level security;
alter table voyage.avis_options_trajet enable row level security;

-- Options : tout participant propose ; son auteur ou un organisateur la
-- modifie ; seul un organisateur la retient ou l'écarte (déclencheur).
create policy "Voir les options de trajet" on voyage.options_trajet
  for select using (propose_par = auth.uid() or voyage.peut_voir(voyage_id));
create policy "Proposer une option de trajet" on voyage.options_trajet
  for insert with check (
    propose_par = auth.uid() and (voyage.est_participant(voyage_id) or voyage.est_organisateur(voyage_id))
  );
create policy "Modifier une option de trajet" on voyage.options_trajet
  for update using (propose_par = auth.uid() or voyage.est_organisateur(voyage_id))
  with check (propose_par = auth.uid() or voyage.est_organisateur(voyage_id));
create policy "Supprimer une option de trajet" on voyage.options_trajet
  for delete using (propose_par = auth.uid() or voyage.est_organisateur(voyage_id));

create policy "Voir les commentaires d'options" on voyage.avis_options_trajet
  for select using (voyage.peut_voir(voyage.voyage_d_option(option_id)));
create policy "Commenter une option" on voyage.avis_options_trajet
  for insert with check (
    utilisateur_id = auth.uid()
    and (voyage.est_participant(voyage.voyage_d_option(option_id)) or voyage.est_organisateur(voyage.voyage_d_option(option_id)))
  );
create policy "Changer son commentaire" on voyage.avis_options_trajet
  for update using (utilisateur_id = auth.uid()) with check (utilisateur_id = auth.uid());
create policy "Retirer son commentaire" on voyage.avis_options_trajet
  for delete using (utilisateur_id = auth.uid());

grant select, insert, update, delete on voyage.options_trajet, voyage.avis_options_trajet to authenticated;

-- -------------------------------------------------------------------------
-- 4. Déclencheurs
-- -------------------------------------------------------------------------

-- Option : voyage, auteur et date figés ; statut changé par un organisateur
-- seulement.
create or replace function voyage.regler_option_trajet()
returns trigger
language plpgsql security definer
set search_path = voyage, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    if new.statut <> 'proposee' and not voyage.est_organisateur(new.voyage_id) then
      new.statut := 'proposee';
    end if;
    return new;
  end if;
  new.voyage_id := old.voyage_id;
  new.propose_par := old.propose_par;
  new.cree_le := old.cree_le;
  if new.statut is distinct from old.statut and not voyage.est_organisateur(old.voyage_id) then
    raise exception 'Seul un organisateur retient ou écarte une option.';
  end if;
  return new;
end;
$$;

create trigger regler_option_trajet
before insert or update on voyage.options_trajet
for each row execute function voyage.regler_option_trajet();

-- Étape : rattachée à une option du même voyage (à défaut, l'option retenue,
-- la première, ou une nouvelle « Trajets prévus » : anciennes versions de
-- l'app) ; placée à la fin de l'option si aucun ordre n'est donné.
create or replace function voyage.rattacher_trajet()
returns trigger
language plpgsql security definer
set search_path = voyage, pg_temp
as $$
begin
  if new.option_id is null then
    select id into new.option_id from voyage.options_trajet
    where voyage_id = new.voyage_id
    order by (statut = 'retenue') desc, cree_le
    limit 1;
    if new.option_id is null then
      insert into voyage.options_trajet (voyage_id, nom, propose_par)
      values (new.voyage_id, 'Trajets prévus', coalesce(auth.uid(), new.responsable))
      returning id into new.option_id;
    end if;
  elsif voyage.voyage_d_option(new.option_id) is distinct from new.voyage_id then
    raise exception 'Cette option appartient à un autre voyage.';
  end if;
  if tg_op = 'INSERT' and new.ordre = 0 then
    select coalesce(max(ordre), 0) + 1 into new.ordre from voyage.trajets where option_id = new.option_id;
  end if;
  return new;
end;
$$;

create trigger rattacher_trajet
before insert or update of option_id on voyage.trajets
for each row execute function voyage.rattacher_trajet();

-- Retenir une option (les autres sont écartées), ou lever le choix
-- (retenir = false : toutes redeviennent proposées). Organisateurs.
create or replace function voyage.retenir_option_trajet(id_option uuid, retenir boolean default true)
returns void
language plpgsql security definer
set search_path = voyage, pg_temp
as $$
declare
  v uuid := voyage.voyage_d_option(id_option);
begin
  if v is null or not voyage.est_organisateur(v) then
    raise exception 'Seul un organisateur peut retenir une option de trajet.';
  end if;
  if retenir then
    update voyage.options_trajet set statut = 'ecartee' where voyage_id = v and id <> id_option and statut <> 'ecartee';
    update voyage.options_trajet set statut = 'retenue' where id = id_option;
  else
    update voyage.options_trajet set statut = 'proposee' where voyage_id = v;
  end if;
end;
$$;

-- Monter (sens -1) ou descendre (+1) une étape dans son option : toutes les
-- étapes de l'option sont renumérotées 1, 2, 3… d'un coup. Permis à qui
-- peut modifier l'étape (son responsable, un organisateur) et à l'auteur de
-- l'option, même si les étapes voisines appartiennent à d'autres.
create or replace function voyage.deplacer_etape(id_trajet uuid, sens integer)
returns void
language plpgsql security definer
set search_path = voyage, pg_temp
as $$
declare
  t voyage.trajets;
  ids uuid[];
  i integer;
  j integer;
  autre uuid;
begin
  select * into t from voyage.trajets where id = id_trajet;
  if t.id is null or not (
    t.responsable = auth.uid()
    or voyage.est_organisateur(t.voyage_id)
    or exists (select 1 from voyage.options_trajet o where o.id = t.option_id and o.propose_par = auth.uid())
  ) then
    raise exception 'Vous ne pouvez pas déplacer cette étape.';
  end if;
  select array_agg(id order by ordre, id) into ids
  from voyage.trajets where voyage_id = t.voyage_id and option_id is not distinct from t.option_id;
  i := array_position(ids, id_trajet);
  j := i + sign(sens)::integer;
  if j < 1 or j > array_length(ids, 1) then
    return;
  end if;
  autre := ids[j];
  ids[j] := ids[i];
  ids[i] := autre;
  update voyage.trajets tr set ordre = k.rang
  from unnest(ids) with ordinality as k(id, rang)
  where tr.id = k.id and tr.ordre <> k.rang;
end;
$$;

grant execute on function voyage.retenir_option_trajet(uuid, boolean), voyage.voyage_d_option(uuid),
  voyage.deplacer_etape(uuid, integer) to authenticated;

-- Notifications : option proposée, option retenue (deux nouveaux types).
alter table voyage.notifications drop constraint if exists notifications_type_check;
alter table voyage.notifications add constraint notifications_type_check check (type in (
  'invitation', 'dates_proposees', 'dates_retenues', 'hebergement_propose', 'hebergement_retenu',
  'activite_proposee', 'activite_retenue', 'plat_propose', 'tache_confiee',
  'option_trajet_proposee', 'option_trajet_retenue'
));

-- Notifications : option proposée, option retenue.
create or replace function voyage.notif_option_trajet()
returns trigger
language plpgsql security definer
set search_path = voyage, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    perform voyage.notifier(
      new.voyage_id, 'option_trajet_proposee',
      voyage.prenom_auteur() || ' propose une façon d’aller à « ' || voyage.titre_voyage(new.voyage_id) || ' » : ' || new.nom,
      'Transport');
  elsif new.statut = 'retenue' and old.statut is distinct from 'retenue' then
    perform voyage.notifier(
      new.voyage_id, 'option_trajet_retenue',
      'Trajet retenu pour « ' || voyage.titre_voyage(new.voyage_id) || ' » : ' || new.nom,
      'Transport');
  end if;
  return new;
end;
$$;

create trigger notif_option_trajet
after insert or update of statut on voyage.options_trajet
for each row execute function voyage.notif_option_trajet();

notify pgrst, 'reload schema';

commit;
