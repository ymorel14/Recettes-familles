-- =========================================================================
-- Migration — Événements : action « cagnotte » dans « À faire pour vous »
-- (refonte § 8.2)
--
-- Pour un repas dont la liste d'envies est liée, une carte propose de
-- participer au pot commun d'une envie, tant qu'on n'y a pas participé et
-- que la somme visée n'est pas atteinte. La personne fêtée ne voit pas le
-- lien (RLS de voyage.listes_envies) : elle n'a donc jamais cette carte.
-- Participation enregistrée dans wishlist.participations (visible de son
-- seul auteur).
--
-- Pré-requis : 20261028170000 et 20260929090000.
-- =========================================================================

begin;

-- Un pot commun est ouvert tant qu'il existe et que la somme visée (si elle
-- est connue) n'est pas atteinte. Fonction à part, en security definer : les
-- montants des autres sont invisibles par la RLS, mais leur total sert ici.
-- Elle ne renvoie qu'un booléen.
create or replace function voyage.pot_ouvert(id_souhait uuid)
returns boolean
language sql stable security definer
set search_path = voyage, wishlist, pg_temp
as $$
  select coalesce(s.pot_commun and s.supprime_le is null
           and (s.prix is null or s.prix > coalesce((select sum(p.montant) from wishlist.participations p where p.souhait_id = s.id), 0)),
         false)
  from wishlist.souhaits s where s.id = id_souhait
$$;
revoke all on function voyage.pot_ouvert(uuid) from public;
grant execute on function voyage.pot_ouvert(uuid) to authenticated;

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

  union all
  -- Cagnotte : participer au pot commun d'une envie de la liste liée.
  -- (voyage.listes_envies n'est jamais visible de la personne fêtée.)
  select 'cagnotte', s.id, 'Participer au cadeau : ' || s.titre, null::date
  from v, voyage.listes_envies le, wishlist.souhaits s
  where le.voyage_id = id_voyage
    and s.liste_id = le.liste_id
    and exists (select 1 from ma_reponse where reponse <> 'decline')
    and voyage.pot_ouvert(s.id)
    and not exists (
      select 1 from wishlist.participations p
      where p.souhait_id = s.id and p.participant = auth.uid()
    )
$$;

grant execute on function voyage.a_faire(uuid) to authenticated;

notify pgrst, 'reload schema';

commit;
