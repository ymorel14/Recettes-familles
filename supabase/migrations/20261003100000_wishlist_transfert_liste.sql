-- =========================================================================
-- Migration — CadeauCommun : transférer le contenu d'une liste dans une
-- autre, puis supprimer la liste de départ
--
-- Cas d'usage : une liste créée en trop (doublon, mauvaise personne,
-- mauvais événement). Avant de la supprimer, on déplace ses souhaits et
-- idées dans une autre liste ; les réservations et participations aux pots
-- communs suivent leur cadeau.
--
-- Surprise préservée :
--   - même destinataire des deux côtés : souhaits et idées gardent leur
--     statut (souhait visible / idée cachée) ;
--   - destinataire différent : tout devient "idée cachée" pour le nouveau
--     destinataire, qui n'a écrit aucun de ces souhaits. Ses propres
--     réservations ou participations sur ces cadeaux sont retirées (il ne
--     peut pas réserver un cadeau de sa propre liste).
--   - la fonction ne renvoie rien : le destinataire qui transfère sa liste
--     n'apprend pas combien d'idées cachées elle contenait.
--
-- Droits : celui qui peut supprimer la liste de départ (son créateur, son
-- destinataire ou un gestionnaire), vers une liste qu'il peut voir.
--
-- Pré-requis : migrations CadeauCommun précédentes (dont le pot commun).
-- =========================================================================

begin;

-- Le déclencheur des souhaits empêche de changer de liste. Seule la
-- fonction de transfert le permet, en levant un drapeau propre à la
-- transaction (les clients de l'API ne peuvent pas le lever eux-mêmes).
create or replace function wishlist.regler_secret()
returns trigger
language plpgsql security definer
set search_path = wishlist, pg_temp
as $$
begin
  if tg_op = 'UPDATE' and coalesce(current_setting('wishlist.transfert_en_cours', true), '') = 'oui' then
    new.cree_par := old.cree_par;
    new.maj_le := now();
    return new;
  end if;

  if wishlist.est_destinataire(new.liste_id) then
    new.secret := false;
  elsif not wishlist.peut_gerer_liste(new.liste_id) then
    new.secret := true;
  end if;
  if tg_op = 'UPDATE' then
    new.cree_par := old.cree_par;
    new.liste_id := old.liste_id;
    new.maj_le := now();
  end if;
  return new;
end;
$$;

create or replace function wishlist.transferer_liste(id_source uuid, id_cible uuid)
returns void
language plpgsql security definer
set search_path = wishlist, pg_temp
as $$
declare
  src wishlist.listes;
  cib wishlist.listes;
  meme_destinataire boolean;
  compte_cible uuid;
  deplaces uuid[];
begin
  if auth.uid() is null then
    raise exception 'Connexion requise';
  end if;

  select * into src from wishlist.listes where id = id_source;
  if src.id is null or not (src.cree_par = auth.uid() or wishlist.peut_gerer_liste(src.id)) then
    raise exception 'Liste introuvable';
  end if;

  select * into cib from wishlist.listes where id = id_cible;
  if cib.id is null or cib.id = src.id or not wishlist.peut_voir_liste(cib.id) then
    raise exception 'Liste de destination introuvable';
  end if;

  meme_destinataire := src.destinataire_id = cib.destinataire_id;
  select utilisateur_id into compte_cible from famille.personnes where id = cib.destinataire_id;

  perform set_config('wishlist.transfert_en_cours', 'oui', true);
  with maj as (
    update wishlist.souhaits
    set liste_id = cib.id,
        secret = case when meme_destinataire then secret else true end
    where liste_id = src.id
    returning id
  )
  select coalesce(array_agg(id), '{}') into deplaces from maj;
  perform set_config('wishlist.transfert_en_cours', 'non', true);

  -- Le nouveau destinataire ne garde pas de réservation ni de participation
  -- sur des cadeaux qui sont désormais pour lui.
  if not meme_destinataire and compte_cible is not null then
    delete from wishlist.reservations where souhait_id = any (deplaces) and reserve_par = compte_cible;
    delete from wishlist.participations where souhait_id = any (deplaces) and participant = compte_cible;
  end if;

  delete from wishlist.listes where id = src.id;
end;
$$;

revoke execute on function wishlist.transferer_liste(uuid, uuid) from public;
grant execute on function wishlist.transferer_liste(uuid, uuid) to authenticated;

notify pgrst, 'reload schema';

commit;
