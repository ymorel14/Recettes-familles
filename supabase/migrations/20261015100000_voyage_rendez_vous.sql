-- =========================================================================
-- Migration — VoyageCommun : rendez-vous, étapes propres à un foyer, retour
--
-- Décisions du 15 octobre 2026. Les familles n'habitent pas au même endroit :
-- avant de partager une étape (le ferry), chacune se rend à un point de
-- rendez-vous. Dans une option de trajet :
--
--   - les ÉTAPES COMMUNES forment l'enchaînement de l'option (le tronc) ;
--   - une ÉTAPE PROPRE À UN FOYER (trajets.propre_foyer) n'en fait pas
--     partie : elle mène ce foyer jusqu'au groupe. rejoint_id dit quelle
--     étape commune il rejoint (le rendez-vous est son départ) ; vide : le
--     foyer va directement à destination, sans le tronc commun. Il peut y
--     avoir plusieurs rendez-vous (Caen, puis Portsmouth) ;
--   - les passagers des étapes communes suivent : un foyer qui rejoint le
--     groupe à Portsmouth est passager des étapes communes à partir de
--     Portsmouth, pas avant ; celui qui va directement n'en est d'aucune
--     (voyage.ranger_etapes, appelée par l'app après chaque changement).
--
-- Le retour est le même trajet en sens inverse par défaut (étapes
-- « aller-retour »). Un organisateur ou l'auteur de l'option peut le rendre
-- différent (voyage.separer_retour) : chaque étape aller-retour devient une
-- étape d'aller et une étape de retour, modifiables séparément ; au retour,
-- rejoint_id d'une étape propre à un foyer dit à l'arrivée de quelle étape
-- commune il quitte le groupe. voyage.retour_identique revient en arrière.
--
-- trajets.sens : 'aller_retour' (défaut), 'aller' ou 'retour'. La colonne
-- aller_retour (coût de la voiture compté deux fois) en découle ; une
-- ancienne version de l'app qui la coche ou la décoche change sens.
--
-- Pré-requis : 20261013100000_voyage_paiement_commun.sql.
-- =========================================================================

begin;

-- -------------------------------------------------------------------------
-- 1. Données
-- -------------------------------------------------------------------------

alter table voyage.trajets
  add column if not exists sens text not null default 'aller_retour'
    check (sens in ('aller_retour', 'aller', 'retour')),
  add column if not exists propre_foyer boolean not null default false,
  add column if not exists rejoint_id uuid references voyage.trajets (id) on delete set null,
  add column if not exists retour_de uuid references voyage.trajets (id) on delete set null;

comment on column voyage.trajets.sens is
  'aller_retour (même étape au retour, en sens inverse), aller ou retour seulement.';
comment on column voyage.trajets.propre_foyer is
  'Étape d''un seul foyer (foyer_id) pour rejoindre le groupe, hors de l''enchaînement commun de l''option.';
comment on column voyage.trajets.rejoint_id is
  'Étape propre à un foyer : l''étape commune qu''il rejoint (aller : à son départ) ou quitte (retour : à son arrivée) ; vide : directement, sans le groupe.';
comment on column voyage.trajets.retour_de is
  'Étape de retour créée par separer_retour : l''étape d''aller dont elle est l''inverse.';

-- Trajets « aller simple » déjà saisis.
update voyage.trajets set sens = 'aller' where not aller_retour and sens = 'aller_retour';

alter table voyage.options_trajet
  add column if not exists retour_different boolean not null default false;
comment on column voyage.options_trajet.retour_different is
  'Le retour a ses propres étapes (sinon : l''aller en sens inverse).';

-- Étapes d'un même groupe : le tronc d'un sens, ou une branche de foyer.
create index if not exists trajets_rejoint on voyage.trajets (rejoint_id) where rejoint_id is not null;

-- -------------------------------------------------------------------------
-- 2. Cohérence d'une étape
-- -------------------------------------------------------------------------

-- Sens et aller_retour accordés ; étape propre : un foyer, et un rendez-vous
-- pris parmi les étapes communes de la même option et du même sens.
create or replace function voyage.regler_etape()
returns trigger
language plpgsql security definer
set search_path = voyage, pg_temp
as $$
declare
  r voyage.trajets;
begin
  if tg_op = 'INSERT' then
    if new.sens = 'aller_retour' and not new.aller_retour then
      new.sens := 'aller';
    end if;
  elsif new.aller_retour is distinct from old.aller_retour and new.sens = old.sens then
    -- Ancienne version de l'app : la case « aller-retour » mène.
    new.sens := case when new.aller_retour then 'aller_retour' when old.sens = 'retour' then 'retour' else 'aller' end;
  end if;
  new.aller_retour := new.sens = 'aller_retour';

  if not new.propre_foyer then
    new.rejoint_id := null;
  elsif new.foyer_id is null then
    raise exception 'Une étape propre à un foyer doit dire de quel foyer.';
  end if;

  if new.rejoint_id is not null then
    select * into r from voyage.trajets where id = new.rejoint_id;
    if r.id is null or r.id = new.id or r.option_id is distinct from new.option_id or r.propre_foyer then
      raise exception 'Le rendez-vous doit être une étape commune de la même option.';
    end if;
    if (new.sens = 'retour') <> (r.sens = 'retour') and r.sens <> 'aller_retour' then
      raise exception 'Le rendez-vous doit être une étape du même sens (aller ou retour).';
    end if;
  end if;
  return new;
end;
$$;

create trigger regler_etape
before insert or update on voyage.trajets
for each row execute function voyage.regler_etape();

-- Une étape commune supprimée, ou devenue propre à un foyer : les foyers qui
-- la rejoignaient rejoignent l'étape commune suivante (à défaut la
-- précédente ; aucune : directement).
create or replace function voyage.reporter_rendez_vous(t voyage.trajets)
returns void
language plpgsql security definer
set search_path = voyage, pg_temp
as $$
declare
  autre uuid;
begin
  if not exists (select 1 from voyage.trajets where rejoint_id = t.id) then
    return;
  end if;
  select id into autre from voyage.trajets
  where option_id = t.option_id and not propre_foyer and (sens = 'retour') = (t.sens = 'retour')
    and (ordre, id) > (t.ordre, t.id)
  order by ordre, id
  limit 1;
  if autre is null then
    select id into autre from voyage.trajets
    where option_id = t.option_id and not propre_foyer and (sens = 'retour') = (t.sens = 'retour')
      and (ordre, id) < (t.ordre, t.id)
    order by ordre desc, id desc
    limit 1;
  end if;
  update voyage.trajets set rejoint_id = autre where rejoint_id = t.id;
end;
$$;

create or replace function voyage.avant_retrait_etape()
returns trigger
language plpgsql security definer
set search_path = voyage, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    -- Option ou voyage supprimés en entier : rien à reporter.
    if exists (select 1 from voyage.options_trajet where id = old.option_id) then
      perform voyage.reporter_rendez_vous(old);
    end if;
    return old;
  end if;
  if new.propre_foyer and not old.propre_foyer then
    perform voyage.reporter_rendez_vous(old);
  end if;
  return new;
end;
$$;

create trigger avant_retrait_etape
before delete or update of propre_foyer on voyage.trajets
for each row execute function voyage.avant_retrait_etape();

-- -------------------------------------------------------------------------
-- 3. Fonctions appelées par l'app
-- -------------------------------------------------------------------------

create or replace function voyage.peut_organiser_option(id_option uuid)
returns boolean
language sql stable security definer
set search_path = voyage, pg_temp
as $$
  select exists (
    select 1 from voyage.options_trajet o
    where o.id = id_option and (o.propose_par = auth.uid() or voyage.est_organisateur(o.voyage_id))
  );
$$;

-- Range une option après un changement d'étape :
--   1. si l'étape id_trajet (propre à un foyer) a changé de rendez-vous, les
--      autres étapes de la même branche (même foyer, même sens, même ancien
--      rendez-vous) la suivent ;
--   2. les passagers des branches sont placés sur les étapes communes : à
--      l'aller, à partir du rendez-vous ; au retour, jusqu'à l'étape où ils
--      quittent le groupe ; directement : sur aucune.
-- Permis à tout participant du voyage (ne touche que les passagers qui ont
-- une étape propre à leur foyer dans l'option).
create or replace function voyage.ranger_etapes(id_option uuid, id_trajet uuid default null, ancien_rejoint uuid default null)
returns void
language plpgsql security definer
set search_path = voyage, pg_temp
as $$
declare
  v uuid := voyage.voyage_d_option(id_option);
  t voyage.trajets;
  sens_retour boolean;
  tronc uuid[];
  b record;
  k integer;
  i integer;
begin
  if v is null or not (voyage.est_participant(v) or voyage.est_organisateur(v)) then
    raise exception 'Vous ne participez pas à ce voyage.';
  end if;

  if id_trajet is not null then
    select * into t from voyage.trajets where id = id_trajet and option_id = id_option;
    if t.propre_foyer and t.rejoint_id is distinct from ancien_rejoint then
      update voyage.trajets set rejoint_id = t.rejoint_id
      where option_id = id_option and propre_foyer and id <> t.id
        and foyer_id = t.foyer_id and (sens = 'retour') = (t.sens = 'retour')
        and rejoint_id is not distinct from ancien_rejoint;
    end if;
  end if;

  foreach sens_retour in array array[false, true] loop
    select array_agg(id order by ordre, id) into tronc
    from voyage.trajets
    where option_id = id_option and not propre_foyer
      -- Une étape aller-retour sert aussi au retour, avec les mêmes
      -- passagers : elle se range avec l'aller.
      and (case when sens_retour then sens = 'retour' else sens in ('aller', 'aller_retour') end);
    if tronc is null then
      tronc := '{}';
    end if;
    for b in
      select tr.rejoint_id, array_agg(distinct p.personne_id) as personnes
      from voyage.trajets tr join voyage.trajet_passagers p on p.trajet_id = tr.id
      where tr.option_id = id_option and tr.propre_foyer
        and (case when sens_retour then tr.sens = 'retour' else tr.sens in ('aller', 'aller_retour') end)
      group by tr.foyer_id, tr.rejoint_id
    loop
      k := coalesce(array_position(tronc, b.rejoint_id), 0);
      for i in 1 .. coalesce(array_length(tronc, 1), 0) loop
        if k > 0 and ((not sens_retour and i >= k) or (sens_retour and i <= k)) then
          insert into voyage.trajet_passagers (trajet_id, personne_id)
          select tronc[i], unnest(b.personnes)
          on conflict do nothing;
        else
          delete from voyage.trajet_passagers where trajet_id = tronc[i] and personne_id = any (b.personnes);
        end if;
      end loop;
    end loop;
  end loop;
end;
$$;

-- Rendre le retour différent de l'aller : chaque étape aller-retour devient
-- une étape d'aller et une étape de retour (départ et arrivée inversés,
-- mêmes passagers, ordre inversé, prix des billets coupé en deux).
create or replace function voyage.separer_retour(id_option uuid)
returns void
language plpgsql security definer
set search_path = voyage, pg_temp
as $$
declare
  t voyage.trajets;
  base integer;
  nouveau uuid;
  copies jsonb := '{}';
begin
  if not voyage.peut_organiser_option(id_option) then
    raise exception 'Seuls l''auteur de l''option et les organisateurs peuvent changer le retour.';
  end if;
  update voyage.options_trajet set retour_different = true where id = id_option;
  select coalesce(max(ordre), 0) into base from voyage.trajets where option_id = id_option;

  for t in select * from voyage.trajets where option_id = id_option and sens = 'aller_retour'
    order by propre_foyer, ordre desc, id desc
  loop
    base := base + 1;
    insert into voyage.trajets (
      voyage_id, option_id, ordre, mode, libelle, foyer_id, responsable, vehicule_id,
      ville_depart, ville_arrivee, sens, distance_km, duree_minutes, energie, consommation,
      prix_unitaire, peages, prix_billets, lien, note, paiement, propre_foyer, retour_de
    ) values (
      t.voyage_id, t.option_id, base, t.mode, t.libelle, t.foyer_id, t.responsable, t.vehicule_id,
      t.ville_arrivee, t.ville_depart, 'retour', t.distance_km, t.duree_minutes, t.energie, t.consommation,
      t.prix_unitaire, t.peages, t.prix_billets - round(t.prix_billets / 2, 2), t.lien, t.note, t.paiement,
      t.propre_foyer, t.id
    ) returning id into nouveau;
    copies := copies || jsonb_build_object(t.id::text, nouveau);
    insert into voyage.trajet_passagers (trajet_id, personne_id)
    select nouveau, personne_id from voyage.trajet_passagers where trajet_id = t.id;
  end loop;

  -- Rendez-vous du retour : la copie de l'étape commune rejointe à l'aller
  -- (on la quitte au retour là où on l'avait rejointe).
  update voyage.trajets c set rejoint_id = (copies ->> a.rejoint_id::text)::uuid
  from voyage.trajets a
  where c.retour_de = a.id and c.option_id = id_option and c.propre_foyer and a.rejoint_id is not null;

  update voyage.trajets set sens = 'aller', prix_billets = round(prix_billets / 2, 2)
  where option_id = id_option and sens = 'aller_retour';
end;
$$;

-- Revenir à un retour identique à l'aller : les étapes de retour sont
-- supprimées, celles d'aller servent aussi au retour (le prix des billets du
-- retour, s'il venait de separer_retour, est rajouté à l'aller).
create or replace function voyage.retour_identique(id_option uuid)
returns void
language plpgsql security definer
set search_path = voyage, pg_temp
as $$
begin
  if not voyage.peut_organiser_option(id_option) then
    raise exception 'Seuls l''auteur de l''option et les organisateurs peuvent changer le retour.';
  end if;
  update voyage.trajets a set prix_billets = coalesce(a.prix_billets, 0) + r.prix_billets
  from voyage.trajets r
  where r.retour_de = a.id and r.option_id = id_option and r.prix_billets is not null and a.prix_billets is not null;
  update voyage.trajets set rejoint_id = null where option_id = id_option and sens = 'retour' and rejoint_id is not null;
  delete from voyage.trajets where option_id = id_option and sens = 'retour';
  update voyage.trajets set sens = 'aller_retour' where option_id = id_option and sens = 'aller';
  update voyage.options_trajet set retour_different = false where id = id_option;
end;
$$;

-- Monter (sens -1) ou descendre (+1) une étape dans son groupe : le tronc
-- commun d'un sens, ou la branche d'un foyer (même foyer, même rendez-vous).
-- Remplace la version du 12 octobre (qui mélangeait toutes les étapes de
-- l'option).
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
  o1 smallint;
  o2 smallint;
begin
  select * into t from voyage.trajets where id = id_trajet;
  if t.id is null or not (
    t.responsable = auth.uid()
    or voyage.est_organisateur(t.voyage_id)
    or exists (select 1 from voyage.options_trajet o where o.id = t.option_id and o.propose_par = auth.uid())
  ) then
    raise exception 'Vous ne pouvez pas déplacer cette étape.';
  end if;

  -- Ordres distincts dans l'option (sans changer l'ordre relatif).
  update voyage.trajets tr set ordre = k.rang
  from (
    select id, row_number() over (order by ordre, id)::smallint as rang
    from voyage.trajets where voyage_id = t.voyage_id and option_id is not distinct from t.option_id
  ) k
  where tr.id = k.id and tr.ordre <> k.rang;

  select array_agg(id order by ordre, id) into ids
  from voyage.trajets x
  where x.voyage_id = t.voyage_id and x.option_id is not distinct from t.option_id
    and x.propre_foyer = t.propre_foyer
    and (x.sens = 'retour') = (t.sens = 'retour')
    and (not t.propre_foyer or (x.foyer_id is not distinct from t.foyer_id and x.rejoint_id is not distinct from t.rejoint_id));
  i := array_position(ids, id_trajet);
  j := i + sign(sens)::integer;
  if j < 1 or j > array_length(ids, 1) then
    return;
  end if;
  select ordre into o1 from voyage.trajets where id = ids[i];
  select ordre into o2 from voyage.trajets where id = ids[j];
  update voyage.trajets set ordre = o2 where id = ids[i];
  update voyage.trajets set ordre = o1 where id = ids[j];

  if t.option_id is not null and not t.propre_foyer then
    perform voyage.ranger_etapes(t.option_id);
  end if;
end;
$$;

grant execute on function voyage.ranger_etapes(uuid, uuid, uuid), voyage.separer_retour(uuid),
  voyage.retour_identique(uuid), voyage.peut_organiser_option(uuid) to authenticated;
revoke execute on function voyage.reporter_rendez_vous(voyage.trajets) from public;

notify pgrst, 'reload schema';

commit;
