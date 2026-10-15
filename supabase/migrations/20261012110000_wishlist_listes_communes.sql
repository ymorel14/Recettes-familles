-- =========================================================================
-- Migration — CadeauCommun : listes communes, cachées à leurs destinataires
--
-- En plus de la liste de chaque personne, on peut créer une liste pour
-- PLUSIEURS personnes au choix (Mamie et Papi, les cousins…), avec un titre
-- ("Noces d'or", "Noël des petits"). Elle est invisible de ses
-- destinataires : ils ne la voient pas du tout, ni son titre, ni ses idées,
-- ni ce qui y est réservé. Le reste de la famille y ajoute des idées, les
-- réserve ou y ouvre un pot commun, comme sur une liste de personne.
--
-- Garanti par la base (règles RLS), pas seulement par l'interface :
--   - une liste commune n'a pas de destinataire unique
--     (listes.destinataire_id vide) ; ses destinataires sont dans
--     wishlist.liste_destinataires ;
--   - wishlist.est_destinataire() vaut vrai pour chacun d'eux : ils ne
--     peuvent ni réserver, ni participer, ni lire l'état des réservations ;
--   - wishlist.peut_voir_liste() leur refuse la liste, même si l'un d'eux
--     l'avait créée (impossible : le créateur ne peut pas en être
--     destinataire) ;
--   - tout ce qu'on y ajoute est une idée cachée (secret = vrai) ;
--   - la liste est visible de la famille où elle a été créée
--     (wishlist.liste_familles), moins ses destinataires.
--
-- Une personne sans compte (enfant) peut être destinataire : ses parents,
-- eux, voient la liste (ils font partie des donateurs).
--
-- Création et modification par fonctions (wishlist.creer_liste_commune,
-- wishlist.modifier_liste_commune) ; suppression par son créateur (règle
-- existante "Supprimer sa liste").
--
-- Pré-requis : migrations CadeauCommun précédentes
-- (20261007110000_wishlist_sans_evenements.sql).
-- =========================================================================

begin;

-- -------------------------------------------------------------------------
-- 1. Listes communes : titre, pas de destinataire unique
-- -------------------------------------------------------------------------

alter table wishlist.listes add column if not exists titre text;
alter table wishlist.listes alter column destinataire_id drop not null;

alter table wishlist.listes drop constraint if exists listes_commune_titre;
alter table wishlist.listes
  add constraint listes_commune_titre
  check (destinataire_id is not null or (titre is not null and length(trim(titre)) > 0));

comment on column wishlist.listes.titre is
  'Titre d''une liste commune ("Noces d''or de Mamie et Papi") ; vide pour la liste d''une personne.';
comment on column wishlist.listes.destinataire_id is
  'Personne à qui appartient la liste ; vide pour une liste commune (destinataires dans liste_destinataires).';

create table if not exists wishlist.liste_destinataires (
  liste_id uuid not null references wishlist.listes (id) on delete cascade,
  personne_id uuid not null references famille.personnes (id) on delete cascade,
  primary key (liste_id, personne_id)
);
create index if not exists liste_destinataires_personne on wishlist.liste_destinataires (personne_id);

comment on table wishlist.liste_destinataires is
  'Destinataires d''une liste commune : ils ne voient pas la liste.';

-- -------------------------------------------------------------------------
-- 2. Qui est destinataire, qui voit la liste
-- -------------------------------------------------------------------------

-- Suis-je destinataire de cette liste ? Sa personne, ou l'une des personnes
-- d'une liste commune.
create or replace function wishlist.est_destinataire(id_liste uuid)
returns boolean
language sql stable security definer
set search_path = wishlist, pg_temp
as $$
  select exists (
    select 1 from wishlist.listes l join famille.personnes p on p.id = l.destinataire_id
    where l.id = id_liste and p.utilisateur_id = auth.uid()
  )
  or exists (
    select 1 from wishlist.liste_destinataires ld join famille.personnes p on p.id = ld.personne_id
    where ld.liste_id = id_liste and p.utilisateur_id = auth.uid()
  );
$$;

-- Puis-je voir cette liste ?
--  - liste d'une personne : inchangé (créateur, gestionnaire, ou famille
--    une fois publiée) ;
--  - liste commune : JAMAIS ses destinataires ; sinon son créateur et les
--    membres de ses familles.
create or replace function wishlist.peut_voir_liste(id_liste uuid)
returns boolean
language sql stable security definer
set search_path = wishlist, pg_temp
as $$
  select exists (
    select 1 from wishlist.listes l
    where l.id = id_liste
      and (
        (l.destinataire_id is not null
         and (
           l.cree_par = auth.uid()
           or wishlist.peut_gerer_liste(l.id)
           or (l.statut <> 'brouillon'
               and exists (
                 select 1 from wishlist.familles_de_liste(l.id) f
                 where f in (select famille.mes_familles())
               ))
         ))
        or
        (l.destinataire_id is null
         and not wishlist.est_destinataire(l.id)
         and (
           l.cree_par = auth.uid()
           or exists (
             select 1 from wishlist.familles_de_liste(l.id) f
             where f in (select famille.mes_familles())
           )
         ))
      )
  );
$$;

-- Lecture directe des listes qu'on a créées (correctif du 28 septembre) :
-- jamais pour une liste commune dont on serait devenu destinataire.
drop policy if exists "Voir les listes que j'ai créées" on wishlist.listes;
create policy "Voir les listes que j'ai créées" on wishlist.listes
  for select using (
    cree_par = auth.uid()
    and (destinataire_id is not null or not wishlist.est_destinataire(id))
  );

alter table wishlist.liste_destinataires enable row level security;

drop policy if exists "Voir les destinataires" on wishlist.liste_destinataires;
create policy "Voir les destinataires" on wishlist.liste_destinataires
  for select using (wishlist.peut_voir_liste(liste_id));

-- Pas d'écriture directe : création et modification par les fonctions
-- ci-dessous, qui vérifient tout.
grant select on wishlist.liste_destinataires to authenticated;

-- -------------------------------------------------------------------------
-- 3. Créer et modifier une liste commune
-- -------------------------------------------------------------------------

-- Vérifie les destinataires choisis : au moins un, tous dans les foyers de
-- ces familles, et jamais l'appelant lui-même.
create or replace function wishlist.verifier_destinataires_communs(personnes uuid[], familles uuid[])
returns void
language plpgsql stable security definer
set search_path = wishlist, pg_temp
as $$
begin
  if personnes is null or coalesce(array_length(personnes, 1), 0) = 0 then
    raise exception 'Choisissez au moins une personne';
  end if;
  if exists (
    select 1 from famille.personnes p
    where p.id = any (personnes) and p.utilisateur_id = auth.uid()
  ) then
    raise exception 'Vous ne pouvez pas faire partie des destinataires d''une liste que vous gérez';
  end if;
  if exists (
    select 1 from unnest(personnes) as x(id)
    where not exists (
      select 1 from famille.personnes p
      join famille.famille_foyers ff on ff.foyer_id = p.foyer_id
      where p.id = x.id and ff.famille_id = any (familles)
    )
  ) then
    raise exception 'Personne introuvable dans cette famille';
  end if;
end;
$$;

revoke execute on function wishlist.verifier_destinataires_communs(uuid[], uuid[]) from public;

create or replace function wishlist.creer_liste_commune(titre_liste text, personnes uuid[], id_famille uuid)
returns uuid
language plpgsql security definer
set search_path = wishlist, pg_temp
as $$
declare
  id_liste uuid;
begin
  if auth.uid() is null then
    raise exception 'Connexion requise';
  end if;
  if coalesce(length(trim(titre_liste)), 0) = 0 then
    raise exception 'Donnez un titre à la liste';
  end if;
  if id_famille is null or id_famille not in (select famille.mes_familles()) then
    raise exception 'Famille introuvable';
  end if;
  perform wishlist.verifier_destinataires_communs(personnes, array[id_famille]);

  insert into wishlist.listes (destinataire_id, titre, statut, cree_par)
  values (null, trim(titre_liste), 'publiee', auth.uid())
  returning id into id_liste;

  insert into wishlist.liste_familles (liste_id, famille_id) values (id_liste, id_famille);

  insert into wishlist.liste_destinataires (liste_id, personne_id)
  select distinct id_liste, x from unnest(personnes) as x;

  return id_liste;
end;
$$;

-- Changer le titre et les destinataires (créateur seulement). Une personne
-- ajoutée aux destinataires perd ses réservations et participations sur
-- cette liste : elle ne doit plus rien en savoir.
create or replace function wishlist.modifier_liste_commune(id_liste uuid, titre_liste text, personnes uuid[])
returns void
language plpgsql security definer
set search_path = wishlist, pg_temp
as $$
declare
  l wishlist.listes;
  familles uuid[];
  nouveaux_comptes uuid[];
begin
  if auth.uid() is null then
    raise exception 'Connexion requise';
  end if;
  select * into l from wishlist.listes where id = id_liste;
  if l.id is null or l.destinataire_id is not null or l.cree_par <> auth.uid() then
    raise exception 'Liste introuvable';
  end if;
  if coalesce(length(trim(titre_liste)), 0) = 0 then
    raise exception 'Donnez un titre à la liste';
  end if;

  select coalesce(array_agg(f), '{}') into familles from wishlist.familles_de_liste(l.id) f;
  perform wishlist.verifier_destinataires_communs(personnes, familles);

  select coalesce(array_agg(p.utilisateur_id), '{}') into nouveaux_comptes
  from famille.personnes p
  where p.id = any (personnes)
    and p.utilisateur_id is not null
    and not exists (select 1 from wishlist.liste_destinataires ld where ld.liste_id = l.id and ld.personne_id = p.id);

  update wishlist.listes set titre = trim(titre_liste) where id = l.id;

  delete from wishlist.liste_destinataires where liste_id = l.id and not (personne_id = any (personnes));
  insert into wishlist.liste_destinataires (liste_id, personne_id)
  select distinct l.id, x from unnest(personnes) as x
  on conflict do nothing;

  if coalesce(array_length(nouveaux_comptes, 1), 0) > 0 then
    delete from wishlist.reservations r
    using wishlist.souhaits s
    where r.souhait_id = s.id and s.liste_id = l.id and r.reserve_par = any (nouveaux_comptes);
    delete from wishlist.participations pa
    using wishlist.souhaits s
    where pa.souhait_id = s.id and s.liste_id = l.id and pa.participant = any (nouveaux_comptes);
  end if;
end;
$$;

revoke execute on function wishlist.creer_liste_commune(text, uuid[], uuid) from public;
revoke execute on function wishlist.modifier_liste_commune(uuid, text, uuid[]) from public;
grant execute on function wishlist.creer_liste_commune(text, uuid[], uuid) to authenticated;
grant execute on function wishlist.modifier_liste_commune(uuid, text, uuid[]) to authenticated;

-- -------------------------------------------------------------------------
-- 4. Transfert de liste : pas pour les listes communes
-- -------------------------------------------------------------------------

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

  if src.destinataire_id is null or cib.destinataire_id is null then
    raise exception 'Une liste commune ne se transfère pas';
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

  if not meme_destinataire and compte_cible is not null then
    delete from wishlist.reservations where souhait_id = any (deplaces) and reserve_par = compte_cible;
    delete from wishlist.participations where souhait_id = any (deplaces) and participant = compte_cible;
  end if;

  delete from wishlist.listes where id = src.id;
end;
$$;

notify pgrst, 'reload schema';

commit;
