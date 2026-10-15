-- =========================================================================
-- Migration — Quotidien, Phase 2 : planning équitable des trajets
--
-- Un membre du groupe demande une proposition de tours
-- (quotidien.proposer_planning) : chaque trajet LIBRE de la période est
-- confié au parent qui a le moins conduit (trajets passés et à venir), en
-- évitant :
--   - les parents indisponibles ce jour-là (table indisponibilites) ;
--   - ceux qui ont déjà refusé CE trajet (table refus_trajets) ;
--   - autant que possible, le même parent à l'aller et au retour ;
--   - les parents sans enfant dans le groupe (s'il y en a avec enfants).
-- Un trajet proposé (trajets.propose) attend l'accord du parent : il
-- l'accepte (accepter_trajet) ou le refuse (laisser_trajet), et le trajet
-- redevient libre pour une nouvelle proposition, sans lui.
-- Les trajets déjà pris ne sont jamais modifiés.
--
-- Pré-requis : migrations 20261007120000_quotidien et _quotidien_rappels.
-- =========================================================================

begin;

-- -------------------------------------------------------------------------
-- 1. Tables
-- -------------------------------------------------------------------------

alter table quotidien.trajets add column propose boolean not null default false;
comment on column quotidien.trajets.propose is
  'Vrai : conducteur proposé par le planning, en attente de son accord.';

create table quotidien.indisponibilites (
  id uuid primary key default gen_random_uuid(),
  participant_id uuid not null references quotidien.participants (id) on delete cascade,
  date_debut date not null,
  date_fin date not null,
  note text,
  cree_le timestamptz not null default now(),
  check (date_fin >= date_debut),
  check (date_fin <= date_debut + 366)
);
create index indisponibilites_participant on quotidien.indisponibilites (participant_id, date_debut);

create table quotidien.refus_trajets (
  trajet_id uuid not null references quotidien.trajets (id) on delete cascade,
  participant_id uuid not null references quotidien.participants (id) on delete cascade,
  cree_le timestamptz not null default now(),
  primary key (trajet_id, participant_id)
);

alter table quotidien.indisponibilites enable row level security;
alter table quotidien.refus_trajets enable row level security;

grant select, insert, delete on quotidien.indisponibilites to authenticated;
grant select on quotidien.refus_trajets to authenticated;
grant all on quotidien.indisponibilites, quotidien.refus_trajets to service_role;

-- Les indisponibilités se voient dans le groupe (le planning en tient
-- compte) ; chacun gère les siennes (et celles des invités qu'il a ajoutés).
create policy "Voir les indisponibilités du groupe" on quotidien.indisponibilites
  for select using (quotidien.est_membre(quotidien.groupe_de_participant(participant_id)));
create policy "Ajouter ses indisponibilités" on quotidien.indisponibilites
  for insert with check (
    participant_id in (select quotidien.mes_participants())
    or exists (
      select 1 from quotidien.participants p
      where p.id = participant_id and p.invite_par = auth.uid() and quotidien.est_membre(p.groupe_id)
    )
  );
create policy "Retirer ses indisponibilités" on quotidien.indisponibilites
  for delete using (
    participant_id in (select quotidien.mes_participants())
    or exists (
      select 1 from quotidien.participants p
      where p.id = participant_id and p.invite_par = auth.uid() and quotidien.est_membre(p.groupe_id)
    )
  );

create policy "Voir les refus du groupe" on quotidien.refus_trajets
  for select using (quotidien.est_membre(quotidien.groupe_de_trajet(trajet_id)));

-- -------------------------------------------------------------------------
-- 2. Prendre, accepter, laisser un trajet
-- -------------------------------------------------------------------------

-- Je conduis ce trajet : s'il est libre, ou s'il m'est proposé (je l'accepte).
create or replace function quotidien.prendre_trajet(id_trajet uuid, nb_places smallint default null)
returns void
language plpgsql security definer
set search_path = quotidien, pg_temp
as $$
declare
  moi uuid := quotidien.mon_participant(quotidien.groupe_de_trajet(id_trajet));
begin
  if moi is null then
    raise exception 'Vous ne faites pas partie de ce groupe';
  end if;
  update quotidien.trajets
  set conducteur_id = moi, propose = false, places = coalesce(nb_places, places)
  where id = id_trajet and (conducteur_id is null or conducteur_id = moi);
  if not found then
    raise exception 'Quelqu''un conduit déjà ce trajet';
  end if;
  delete from quotidien.refus_trajets where trajet_id = id_trajet and participant_id = moi;
end;
$$;

-- J'accepte le trajet que le planning m'a proposé.
create or replace function quotidien.accepter_trajet(id_trajet uuid)
returns void
language plpgsql security definer
set search_path = quotidien, pg_temp
as $$
declare
  moi uuid := quotidien.mon_participant(quotidien.groupe_de_trajet(id_trajet));
begin
  update quotidien.trajets set propose = false
  where id = id_trajet and conducteur_id = moi and moi is not null;
  if not found then
    raise exception 'Ce trajet ne vous est pas proposé';
  end if;
end;
$$;

-- Je ne peux pas (ou plus) conduire : le trajet redevient libre. Si
-- c'était une proposition, mon refus est noté (le planning ne me le
-- reproposera pas).
create or replace function quotidien.laisser_trajet(id_trajet uuid)
returns void
language plpgsql security definer
set search_path = quotidien, pg_temp
as $$
declare
  moi uuid := quotidien.mon_participant(quotidien.groupe_de_trajet(id_trajet));
  etait_propose boolean;
begin
  update quotidien.trajets t set conducteur_id = null, propose = false
  from (select propose from quotidien.trajets where id = id_trajet) avant
  where t.id = id_trajet and t.conducteur_id = moi and moi is not null
  returning avant.propose into etait_propose;
  if not found then
    raise exception 'Vous ne conduisez pas ce trajet';
  end if;
  if etait_propose then
    insert into quotidien.refus_trajets (trajet_id, participant_id) values (id_trajet, moi)
    on conflict do nothing;
  end if;
end;
$$;

-- Mêmes gestes pour un parent invité sans compte (par jeton).
create or replace function quotidien.prendre_trajet_invite(jeton_invite uuid, id_trajet uuid)
returns void
language plpgsql security definer
set search_path = quotidien, pg_temp
as $$
declare
  moi uuid := quotidien.participant_du_jeton(jeton_invite);
begin
  if moi is null or quotidien.groupe_de_participant(moi) is distinct from quotidien.groupe_de_trajet(id_trajet) then
    raise exception 'Lien invalide ou expiré';
  end if;
  update quotidien.trajets set conducteur_id = moi, propose = false
  where id = id_trajet and (conducteur_id is null or conducteur_id = moi);
  if not found then
    raise exception 'Quelqu''un conduit déjà ce trajet';
  end if;
  delete from quotidien.refus_trajets where trajet_id = id_trajet and participant_id = moi;
end;
$$;

create or replace function quotidien.laisser_trajet_invite(jeton_invite uuid, id_trajet uuid)
returns void
language plpgsql security definer
set search_path = quotidien, pg_temp
as $$
declare
  moi uuid := quotidien.participant_du_jeton(jeton_invite);
  etait_propose boolean;
begin
  update quotidien.trajets t set conducteur_id = null, propose = false
  from (select propose from quotidien.trajets where id = id_trajet) avant
  where t.id = id_trajet and t.conducteur_id = moi and moi is not null
  returning avant.propose into etait_propose;
  if not found then
    raise exception 'Vous ne conduisez pas ce trajet';
  end if;
  if etait_propose then
    insert into quotidien.refus_trajets (trajet_id, participant_id) values (id_trajet, moi)
    on conflict do nothing;
  end if;
end;
$$;

-- L'invité indique ses indisponibilités (liste, ajout, retrait).
create or replace function quotidien.ajouter_indisponibilite_invite(jeton_invite uuid, du date, au date)
returns uuid
language plpgsql security definer
set search_path = quotidien, pg_temp
as $$
declare
  moi uuid := quotidien.participant_du_jeton(jeton_invite);
  i uuid;
begin
  if moi is null then
    raise exception 'Lien invalide ou expiré';
  end if;
  insert into quotidien.indisponibilites (participant_id, date_debut, date_fin)
  values (moi, du, au) returning id into i;
  return i;
end;
$$;

create or replace function quotidien.retirer_indisponibilite_invite(jeton_invite uuid, id_indisponibilite uuid)
returns void
language plpgsql security definer
set search_path = quotidien, pg_temp
as $$
begin
  delete from quotidien.indisponibilites
  where id = id_indisponibilite and participant_id = quotidien.participant_du_jeton(jeton_invite);
end;
$$;

-- -------------------------------------------------------------------------
-- 3. Proposer les tours
-- -------------------------------------------------------------------------

-- Confie chaque trajet libre du groupe entre deux dates (au plus 9
-- semaines) au parent qui a le moins conduit. Renvoie le nombre de trajets
-- proposés ; ceux qui ne trouvent personne restent libres.
create or replace function quotidien.proposer_planning(id_groupe uuid, du date, au date)
returns integer
language plpgsql security definer
set search_path = quotidien, pg_temp
as $$
declare
  t record;
  choix uuid;
  n integer := 0;
  avec_enfants boolean;
  debut date := greatest(du, current_date);
begin
  if not quotidien.est_membre(id_groupe) then
    raise exception 'Vous ne faites pas partie de ce groupe';
  end if;
  if au < debut then
    return 0;
  end if;
  if au > debut + 63 then
    raise exception 'Période trop longue (9 semaines au plus)';
  end if;
  -- Ne proposer qu'aux parents qui ont des enfants dans le groupe, s'il y en a.
  avec_enfants := exists (
    select 1 from quotidien.participants p join quotidien.enfants e on e.participant_id = p.id
    where p.groupe_id = id_groupe and p.parti_le is null
  );

  for t in
    select tr.id, tr.seance_id, s.date
    from quotidien.trajets tr
    join quotidien.seances s on s.id = tr.seance_id
    join quotidien.activites a on a.id = s.activite_id
    where a.groupe_id = id_groupe and s.statut = 'prevue'
      and s.date between debut and au and tr.conducteur_id is null
    order by s.date, tr.heure, tr.sens
  loop
    select p.id into choix
    from quotidien.participants p
    where p.groupe_id = id_groupe and p.parti_le is null
      and (not avec_enfants or exists (select 1 from quotidien.enfants e where e.participant_id = p.id))
      and not exists (
        select 1 from quotidien.indisponibilites i
        where i.participant_id = p.id and t.date between i.date_debut and i.date_fin
      )
      and not exists (
        select 1 from quotidien.refus_trajets r where r.trajet_id = t.id and r.participant_id = p.id
      )
    order by
      -- 1. le moins de trajets (passés et à venir, propositions comprises)
      (select count(*) from quotidien.trajets t2 join quotidien.seances s2 on s2.id = t2.seance_id
        where t2.conducteur_id = p.id and s2.statut = 'prevue'),
      -- 2. pas déjà au volant pour l'autre sens de la même séance
      exists (select 1 from quotidien.trajets t3 where t3.seance_id = t.seance_id and t3.conducteur_id = p.id),
      -- 3. sinon au hasard
      random()
    limit 1;

    if choix is not null then
      update quotidien.trajets set conducteur_id = choix, propose = true where id = t.id;
      n := n + 1;
    end if;
  end loop;
  return n;
end;
$$;

-- -------------------------------------------------------------------------
-- 4. Page invité : trajets avec leur état « proposé », indisponibilités
-- -------------------------------------------------------------------------

create or replace function quotidien.vue_invite(jeton_invite uuid)
returns json
language plpgsql stable security definer
set search_path = quotidien, pg_temp
as $$
declare
  moi uuid := quotidien.participant_du_jeton(jeton_invite);
  g uuid;
begin
  if moi is null then
    raise exception 'Lien invalide ou expiré';
  end if;
  g := quotidien.groupe_de_participant(moi);
  return json_build_object(
    'moi', moi,
    'groupe', (select json_build_object('id', id, 'nom', nom) from quotidien.groupes where id = g),
    'participants', coalesce((
      select json_agg(json_build_object('id', p.id, 'nom_affiche', p.nom_affiche) order by p.ajoute_le)
      from quotidien.participants p where p.groupe_id = g and p.parti_le is null), '[]'::json),
    'mes_enfants', coalesce((
      select json_agg(json_build_object('id', e.id, 'prenom', e.prenom) order by e.cree_le)
      from quotidien.enfants e where e.participant_id = moi), '[]'::json),
    'mes_indisponibilites', coalesce((
      select json_agg(json_build_object('id', i.id, 'date_debut', i.date_debut, 'date_fin', i.date_fin) order by i.date_debut)
      from quotidien.indisponibilites i where i.participant_id = moi and i.date_fin >= current_date), '[]'::json),
    'trajets', coalesce((
      select json_agg(json_build_object(
        'id', t.id, 'sens', t.sens, 'heure', t.heure, 'places', t.places, 'note', t.note,
        'conducteur_id', t.conducteur_id, 'propose', t.propose,
        'date', s.date, 'statut', s.statut, 'lieu', coalesce(s.lieu, a.lieu), 'activite', a.nom,
        'enfants', coalesce((
          select json_agg(json_build_object('id', e.id, 'prenom', e.prenom))
          from quotidien.trajet_enfants te join quotidien.enfants e on e.id = te.enfant_id
          where te.trajet_id = t.id), '[]'::json)
      ) order by s.date, t.heure)
      from quotidien.trajets t
      join quotidien.seances s on s.id = t.seance_id
      join quotidien.activites a on a.id = s.activite_id
      where a.groupe_id = g and s.date between current_date and current_date + 42), '[]'::json)
  );
end;
$$;

-- -------------------------------------------------------------------------
-- 5. Rappels : un trajet proposé et pas encore accepté le dit
-- -------------------------------------------------------------------------

create or replace function quotidien.rappels_a_envoyer(jour date)
returns table (trajet_id uuid, genre text, jetons text[], titre text, corps text)
language sql stable security definer
set search_path = quotidien, pg_temp
as $$
  with a_venir as (
    select t.id, t.sens, to_char(t.heure, 'HH24:MI') as heure, t.conducteur_id, t.propose,
           a.nom as activite, coalesce(s.lieu, a.lieu) as lieu, a.groupe_id,
           (select string_agg(e.prenom, ', ' order by e.prenom)
              from quotidien.trajet_enfants te join quotidien.enfants e on e.id = te.enfant_id
             where te.trajet_id = t.id) as enfants
    from quotidien.trajets t
    join quotidien.seances s on s.id = t.seance_id
    join quotidien.activites a on a.id = s.activite_id
    where s.date = jour and s.statut = 'prevue'
  ),
  conducteurs as (
    select v.id, 'conducteur'::text as genre,
           array_agg(distinct ap.jeton) as jetons,
           case when v.propose then 'Demain, on compte sur vous pour conduire (à confirmer)'
                else 'Demain, c''est vous qui conduisez' end as titre,
           concat_ws(' · ', v.activite || ' — ' || v.sens || ' à ' || v.heure, v.lieu, v.enfants) as corps
    from a_venir v
    join quotidien.participants p on p.id = v.conducteur_id and p.foyer_id is not null and p.parti_le is null
    join famille.foyer_membres fm on fm.foyer_id = p.foyer_id
    join quotidien.appareils ap on ap.utilisateur_id = fm.utilisateur_id
    group by v.id, v.propose, v.activite, v.sens, v.heure, v.lieu, v.enfants
  ),
  libres as (
    select v.id, 'sans_conducteur'::text as genre,
           array_agg(distinct ap.jeton) as jetons,
           'Trajet sans conducteur demain'::text as titre,
           concat_ws(' · ', v.activite || ' — ' || v.sens || ' à ' || v.heure, v.lieu) || ' — qui peut le prendre ?' as corps
    from a_venir v
    join quotidien.participants p on p.groupe_id = v.groupe_id and p.foyer_id is not null and p.parti_le is null
    join famille.foyer_membres fm on fm.foyer_id = p.foyer_id
    join quotidien.appareils ap on ap.utilisateur_id = fm.utilisateur_id
    where v.conducteur_id is null
    group by v.id, v.activite, v.sens, v.heure, v.lieu
  )
  select x.id, x.genre, x.jetons, x.titre, x.corps
  from (select * from conducteurs union all select * from libres) x
  where not exists (
    select 1 from quotidien.rappels_envoyes r where r.trajet_id = x.id and r.genre = x.genre
  );
$$;

-- -------------------------------------------------------------------------
-- 6. Droits
-- -------------------------------------------------------------------------

revoke execute on function
  quotidien.accepter_trajet(uuid), quotidien.proposer_planning(uuid, date, date),
  quotidien.ajouter_indisponibilite_invite(uuid, date, date),
  quotidien.retirer_indisponibilite_invite(uuid, uuid)
from public;
grant execute on function
  quotidien.accepter_trajet(uuid), quotidien.proposer_planning(uuid, date, date)
to authenticated;
grant execute on function
  quotidien.ajouter_indisponibilite_invite(uuid, date, date),
  quotidien.retirer_indisponibilite_invite(uuid, uuid)
to anon, authenticated;

notify pgrst, 'reload schema';

commit;
