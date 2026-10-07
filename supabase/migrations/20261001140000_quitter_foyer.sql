-- =========================================================================
-- Migration — Compte famille : quitter son foyer / retirer un membre
--
-- Jusqu'ici, on ne pouvait qu'ENTRER dans un foyer. Deux fonctions :
--   - famille.quitter_foyer()                 : je quitte mon foyer ;
--   - famille.retirer_du_foyer(id_utilisateur) : un administrateur (ou le
--     créateur) du foyer en retire un autre membre ayant un compte.
--
-- La personne qui part RESTE dans ses familles (famille_membres et famille
-- active inchangés) : à sa prochaine ouverture d'une app, elle choisit un
-- autre foyer de la famille ou crée le sien (écran « Choisissez votre
-- foyer »).
--
-- Ce qui reste au foyer : ses recettes, listes de courses, congélateurs,
-- adresse, véhicules… (tout ce qui est rattaché au foyer). Ce qui suit la
-- personne : sa fiche (famille.personnes) et donc ses listes de souhaits ;
-- la fiche est détachée du foyer (foyer_id vide) puis rattachée
-- automatiquement à son nouveau foyer quand elle en choisit un.
--
-- Règles :
--   - on ne retire pas le créateur du foyer (lui seul peut partir) ;
--   - on ne se retire pas soi-même avec retirer_du_foyer (quitter_foyer) ;
--   - s'il ne reste plus d'administrateur, le membre le plus ancien le
--     devient ;
--   - le dernier membre peut partir : le foyer reste alors vide, avec ses
--     données, et peut être rejoint de nouveau depuis la liste des foyers.
--
-- Pré-requis : 20260928140000_socle_famille.sql.
-- =========================================================================

begin;

-- Partie commune : détache un membre de son foyer (sans vérification de
-- droits : réservée aux deux fonctions ci-dessous, jamais exposée).
create or replace function famille.detacher_du_foyer(id_utilisateur uuid, id_foyer uuid)
returns void
language plpgsql security definer
set search_path = famille, pg_temp
as $$
begin
  delete from famille.foyer_membres
  where foyer_id = id_foyer and utilisateur_id = id_utilisateur;

  -- Sa fiche personne le suit : elle n'appartient plus à ce foyer.
  update famille.personnes
  set foyer_id = null, maj_le = now()
  where utilisateur_id = id_utilisateur and foyer_id = id_foyer;

  -- Toujours au moins un administrateur tant que le foyer a des membres.
  if exists (select 1 from famille.foyer_membres where foyer_id = id_foyer)
     and not exists (
       select 1 from famille.foyer_membres where foyer_id = id_foyer and role = 'administrateur'
     ) then
    update famille.foyer_membres
    set role = 'administrateur'
    where foyer_id = id_foyer
      and utilisateur_id = (
        select utilisateur_id from famille.foyer_membres
        where foyer_id = id_foyer
        order by rejoint_le, utilisateur_id
        limit 1
      );
  end if;
end;
$$;

revoke all on function famille.detacher_du_foyer(uuid, uuid) from public, anon, authenticated;

-- Je quitte mon foyer (je reste dans mes familles).
create or replace function famille.quitter_foyer()
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

  select foyer_id into foyer_actuel
  from famille.foyer_membres where utilisateur_id = auth.uid() limit 1;
  if foyer_actuel is null then
    raise exception 'Vous ne faites partie d''aucun foyer';
  end if;

  perform famille.detacher_du_foyer(auth.uid(), foyer_actuel);
end;
$$;

-- Un administrateur (ou le créateur) de mon foyer en retire un autre membre.
create or replace function famille.retirer_du_foyer(id_utilisateur uuid)
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
  if id_utilisateur = auth.uid() then
    raise exception 'Pour partir vous-même, utilisez « Quitter le foyer »';
  end if;

  select foyer_id into foyer_actuel
  from famille.foyer_membres where utilisateur_id = auth.uid() limit 1;
  if foyer_actuel is null then
    raise exception 'Vous ne faites partie d''aucun foyer';
  end if;

  if not (
    famille.est_createur_du_foyer(foyer_actuel)
    or exists (
      select 1 from famille.foyer_membres
      where foyer_id = foyer_actuel and utilisateur_id = auth.uid() and role = 'administrateur'
    )
  ) then
    raise exception 'Seul un administrateur du foyer peut retirer un membre';
  end if;

  if not exists (
    select 1 from famille.foyer_membres where foyer_id = foyer_actuel and utilisateur_id = id_utilisateur
  ) then
    raise exception 'Cette personne ne fait pas partie de votre foyer';
  end if;

  if exists (select 1 from famille.foyers where id = foyer_actuel and cree_par = id_utilisateur) then
    raise exception 'Le créateur du foyer ne peut pas en être retiré (il peut le quitter lui-même)';
  end if;

  perform famille.detacher_du_foyer(id_utilisateur, foyer_actuel);
end;
$$;

grant execute on function famille.quitter_foyer(), famille.retirer_du_foyer(uuid) to authenticated;

commit;
