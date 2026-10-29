-- =========================================================================
-- Migration — Événements : « À faire pour vous » et « On attend… »
-- (refonte § 8.2, 10.3)
--
--   voyage.a_faire(id_voyage)   : ce que MOI je dois faire sur un événement.
--                                 Source unique du compteur de l'onglet
--                                 Programmation, du bandeau « À vous » des
--                                 cartes et des cartes de l'accueil.
--   voyage.en_attente(id_voyage): pour les organisateurs, qui est en retard.
--   voyage.relancer(...)        : une relance par jour, personne et action.
--
-- Une personne tenue au secret ne voit rien : voyage.peut_voir() la rejette
-- (migration des surprises). Une personne sans compte (enfant) n'a pas
-- d'action : c'est le parent qui répond pour le foyer.
--
-- Non inclus ici : l'action « cagnotte » (montants rapides sur le pot commun
-- de la liste d'envies liée), à ajouter avec la liste d'envies côté app.
--
-- Pré-requis : 20261028150000 et 20261028160000.
-- =========================================================================

begin;

create or replace function voyage.a_faire(id_voyage uuid)
returns table (type text, objet_id uuid, libelle text, echeance date)
language sql stable security invoker
set search_path = voyage, pg_temp
as $$
  with v as (
    select * from voyage.voyages where id = id_voyage and voyage.peut_voir(id_voyage)
  ),
  moi as (select voyage.ma_personne() as id),
  -- Ma réponse (sans compte : jamais d'action).
  ma_reponse as (
    select pa.reponse
    from voyage.participants pa join moi on pa.personne_id = moi.id
    where pa.voyage_id = id_voyage
  ),
  plats_libres as (
    select count(*) as n
    from voyage.plats pl join voyage.repas r on r.id = pl.repas_id
    where r.voyage_id = id_voyage
      and not exists (select 1 from voyage.plat_responsables x where x.plat_id = pl.id)
  ),
  opt_retenue as (
    select id from voyage.options_trajet where voyage_id = id_voyage and statut = 'retenue'
  )

  -- Répondre à l'invitation (moi, et les personnes sans compte que je gère).
  select 'repondre'::text, pa.personne_id, 'Répondre à l’invitation'::text, null::date
  from v, voyage.participants pa
  where pa.voyage_id = id_voyage and pa.reponse = 'invite'
    and pa.personne_id in (select voyage.mes_personnes())

  union all
  -- Voter pour les dates.
  select 'voter_dates', id_voyage, 'Indiquer vos disponibilités', null::date
  from v
  where v.dates_validees_le is null
    and (select count(*) from voyage.propositions_dates where voyage_id = id_voyage) >= 2
    and exists (select 1 from ma_reponse where reponse <> 'decline')
    and exists (
      select 1 from voyage.propositions_dates pd
      where pd.voyage_id = id_voyage
        and not exists (select 1 from voyage.votes_dates vd where vd.proposition_id = pd.id and vd.personne_id = (select id from moi))
    )

  union all
  -- Voter pour le logement.
  select 'voter_hebergement', id_voyage, 'Donner votre avis sur les logements', null::date
  from v
  where exists (select 1 from ma_reponse where reponse <> 'decline')
    and not exists (select 1 from voyage.hebergements where voyage_id = id_voyage and statut = 'retenu')
    and (select count(*) from voyage.hebergements where voyage_id = id_voyage and statut = 'propose') >= 2
    and exists (
      select 1 from voyage.hebergements h
      where h.voyage_id = id_voyage and h.statut = 'propose'
        and not exists (select 1 from voyage.avis_hebergements a where a.hebergement_id = h.id and a.utilisateur_id = auth.uid())
    )

  union all
  -- Voter pour le trajet.
  select 'voter_trajet', id_voyage, 'Voter pour le trajet', null::date
  from v
  where exists (select 1 from ma_reponse where reponse <> 'decline')
    and not exists (select 1 from opt_retenue)
    and (select count(*) from voyage.options_trajet where voyage_id = id_voyage and statut = 'proposee') >= 2
    and exists (
      select 1 from voyage.options_trajet o
      where o.voyage_id = id_voyage and o.statut = 'proposee'
        and not exists (
          select 1 from voyage.avis_options_trajet a
          where a.option_id = o.id and a.utilisateur_id = auth.uid() and a.vote is not null
        )
    )

  union all
  -- Dire ce qui me tente (activités au vote).
  select 'voter_activite', id_voyage,
         'Dire ce qui vous tente (' || count(*) || ' activité' || case when count(*) > 1 then 's' else '' end || ')',
         min(act.cloture_le)
  from v, voyage.activites act
  where act.voyage_id = id_voyage and act.statut = 'propose'
    and exists (select 1 from ma_reponse where reponse <> 'decline')
    and not exists (
      select 1 from voyage.avis_activites a
      where a.activite_id = act.id and a.personne_id = (select id from moi)
    )
  group by id_voyage
  having count(*) > 0

  union all
  -- Dire si on vient (activité retenue qui demande une inscription).
  select 'presence_activite', act.id, 'Présence : ' || act.titre, act.jour
  from v, voyage.activites act
  where act.voyage_id = id_voyage and act.statut = 'retenu' and act.inscription
    and exists (select 1 from ma_reponse where reponse <> 'decline')
    and not exists (
      select 1 from voyage.avis_activites a
      where a.activite_id = act.id and a.personne_id = (select id from moi)
    )

  union all
  -- Indiquer comment mon foyer rejoint le départ (trajet retenu).
  select 'trajet_foyer', o.id, 'Indiquer votre trajet', null::date
  from v, opt_retenue o
  where exists (select 1 from ma_reponse where reponse <> 'decline')
    and not exists (
      select 1 from voyage.trajets t
      where t.option_id = o.id and t.propre_foyer and t.foyer_id in (select famille.mes_foyers())
    )

  union all
  -- Repas : prendre un plat.
  select 'prendre_plat', id_voyage, (select n from plats_libres) || ' plat(s) sans personne : prenez-en un dans le menu', null::date
  from v
  where v.nature = 'repas'
    and exists (select 1 from ma_reponse where reponse <> 'decline')
    and (select n from plats_libres) > 0
    and not exists (
      select 1
      from voyage.plat_responsables x
      join voyage.plats pl on pl.id = x.plat_id
      join voyage.repas r on r.id = pl.repas_id
      where r.voyage_id = id_voyage and x.personne_id in (select voyage.mes_personnes())
    )
$$;

-- Organisateurs : qui est en retard.
create or replace function voyage.en_attente(id_voyage uuid)
returns table (personne_id uuid, foyer_id uuid, type text, libelle text)
language sql stable security definer
set search_path = voyage, pg_temp
as $$
  -- Invitations sans réponse.
  select p.id, p.foyer_id, 'repondre'::text, 'n’a pas encore répondu'::text
  from voyage.participants pa
  join famille.personnes p on p.id = pa.personne_id
  where voyage.est_organisateur(id_voyage) and pa.voyage_id = id_voyage
    and pa.reponse = 'invite' and p.utilisateur_id is not null

  union all
  -- Dates au vote : pas encore de vote.
  select p.id, p.foyer_id, 'voter_dates', 'n’a pas indiqué ses disponibilités'
  from voyage.participants pa
  join famille.personnes p on p.id = pa.personne_id
  join voyage.voyages v on v.id = pa.voyage_id
  where voyage.est_organisateur(id_voyage) and pa.voyage_id = id_voyage
    and pa.reponse <> 'decline' and p.utilisateur_id is not null
    and v.dates_validees_le is null
    and (select count(*) from voyage.propositions_dates where voyage_id = id_voyage) >= 2
    and not exists (
      select 1 from voyage.propositions_dates pd
      join voyage.votes_dates vd on vd.proposition_id = pd.id
      where pd.voyage_id = id_voyage and vd.personne_id = p.id
    )

  union all
  -- Trajet retenu : foyers qui n'ont pas indiqué le leur.
  select p.id, p.foyer_id, 'trajet_foyer', 'n’a pas encore indiqué son trajet'
  from voyage.participants pa
  join famille.personnes p on p.id = pa.personne_id
  where voyage.est_organisateur(id_voyage) and pa.voyage_id = id_voyage
    and pa.reponse = 'partant' and p.utilisateur_id is not null
    and exists (select 1 from voyage.options_trajet where voyage_id = id_voyage and statut = 'retenue')
    and not exists (
      select 1 from voyage.trajets t
      join voyage.options_trajet o on o.id = t.option_id
      where o.voyage_id = id_voyage and o.statut = 'retenue' and t.propre_foyer and t.foyer_id = p.foyer_id
    )
$$;

-- Une relance par jour, par personne et par action.
create table if not exists voyage.relances (
  voyage_id uuid not null references voyage.voyages (id) on delete cascade,
  personne_id uuid not null references famille.personnes (id) on delete cascade,
  type text not null,
  le date not null default ((now() at time zone 'Europe/Paris')::date),
  par uuid not null default auth.uid() references auth.users (id) on delete cascade,
  primary key (voyage_id, personne_id, type, le)
);
alter table voyage.relances enable row level security;
drop policy if exists "Relances de mes événements" on voyage.relances;
create policy "Relances de mes événements" on voyage.relances
  for select using (voyage.est_organisateur(voyage_id));
grant select on voyage.relances to authenticated;
grant all on voyage.relances to service_role;

create or replace function voyage.relancer(id_voyage uuid, id_personne uuid, type_action text)
returns boolean
language plpgsql security definer
set search_path = voyage, pg_temp
as $$
declare
  cible uuid;
  nb integer;
  texte text;
begin
  if not voyage.est_organisateur(id_voyage) then
    raise exception 'Réservé aux organisateurs';
  end if;
  if not exists (select 1 from voyage.participants where voyage_id = id_voyage and personne_id = id_personne) then
    raise exception 'Cette personne ne participe pas à l’événement';
  end if;

  insert into voyage.relances (voyage_id, personne_id, type) values (id_voyage, id_personne, type_action)
  on conflict do nothing;
  get diagnostics nb = row_count;
  if nb = 0 then
    return false; -- déjà relancée aujourd'hui
  end if;

  select utilisateur_id into cible from famille.personnes where id = id_personne;
  if cible is null then
    return true; -- personne sans compte : rien à envoyer
  end if;

  texte := case type_action
    when 'repondre' then voyage.prenom_auteur() || ' attend votre réponse pour « ' || voyage.titre_voyage(id_voyage) || ' »'
    when 'voter_dates' then voyage.prenom_auteur() || ' attend vos disponibilités pour « ' || voyage.titre_voyage(id_voyage) || ' »'
    when 'trajet_foyer' then voyage.prenom_auteur() || ' attend l’indication de votre trajet pour « ' || voyage.titre_voyage(id_voyage) || ' »'
    else voyage.prenom_auteur() || ' vous relance pour « ' || voyage.titre_voyage(id_voyage) || ' »'
  end;

  insert into voyage.notifications (utilisateur_id, voyage_id, type, message, ecran, auteur)
  values (cible, id_voyage, 'relance', texte,
          case type_action when 'voter_dates' then 'Dates' when 'trajet_foyer' then 'Transport' else 'Voyage' end,
          auth.uid());
  return true;
end;
$$;

grant execute on function voyage.a_faire(uuid), voyage.en_attente(uuid), voyage.relancer(uuid, uuid, text) to authenticated;

notify pgrst, 'reload schema';

commit;
