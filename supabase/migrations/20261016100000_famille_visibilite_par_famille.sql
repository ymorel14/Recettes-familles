-- =========================================================================
-- Migration — Compte famille : visibilité d'un enfant famille par famille
--
-- Un foyer peut appartenir à plusieurs familles (famille recomposée : la
-- famille de chacun des deux parents). Jusqu'ici, toute personne du foyer
-- était visible de toutes ces familles. Désormais, une personne SANS COMPTE
-- (enfant, bébé) peut être masquée dans une famille donnée :
-- famille.personnes_masquees (personne, famille).
--
-- Une personne masquée dans une famille :
--   - n'apparaît plus aux membres de cette famille, dans aucune app (règle
--     RLS de famille.personnes) — sauf à ceux de son foyer, qui la voient
--     toujours, et à ceux qui la voient par une AUTRE famille où elle reste
--     visible ;
--   - sa photo de profil n'est plus lisible par eux ;
--   - CadeauCommun : sa liste ne leur est plus visible, et ils ne peuvent
--     plus la créer ni la choisir comme destinataire d'une liste commune ;
--   - VoyageCommun : elle n'est plus invitée automatiquement aux voyages
--     « toute la famille » de cette famille, ni invitable, ni affichée dans
--     son calendrier commun ;
--   - SouvenirsFamille : elle ne peut plus être associée à un souvenir par
--     eux, ni retrouvée par son prénom dans leurs recherches.
-- Rien n'est supprimé : la rendre de nouveau visible remet tout en place.
--
-- Qui choisit : les membres du foyer de l'enfant (ou celui qui le gère),
-- parmi les familles de ce foyer. Par défaut, visible partout (comme avant).
--
-- Pré-requis : toutes les migrations précédentes (dont
-- 20261012110000_wishlist_listes_communes.sql).
-- =========================================================================

begin;

-- -------------------------------------------------------------------------
-- 1. Table des masquages
-- -------------------------------------------------------------------------

create table if not exists famille.personnes_masquees (
  personne_id uuid not null references famille.personnes (id) on delete cascade,
  famille_id uuid not null references famille.familles (id) on delete cascade,
  masque_par uuid references auth.users (id) on delete set null default auth.uid(),
  masque_le timestamptz not null default now(),
  primary key (personne_id, famille_id)
);
create index if not exists personnes_masquees_famille on famille.personnes_masquees (famille_id);

comment on table famille.personnes_masquees is
  'Personne sans compte (enfant) invisible des membres de cette famille, sauf ceux de son foyer.';

-- -------------------------------------------------------------------------
-- 2. Fonctions
-- -------------------------------------------------------------------------

-- Cette personne est-elle masquée dans cette famille ?
create or replace function famille.est_masquee_dans(id_personne uuid, id_famille uuid)
returns boolean
language sql stable security definer
set search_path = famille, pg_temp
as $$
  select exists (
    select 1 from famille.personnes_masquees m
    where m.personne_id = id_personne and m.famille_id = id_famille
  );
$$;

-- Personnes que je vois : moi, celles de mon foyer, celles que je gère, et
-- celles des foyers de mes familles, sauf dans une famille où elles sont
-- masquées.
create or replace function famille.personnes_visibles()
returns setof uuid
language sql stable security definer
set search_path = famille, pg_temp
as $$
  select p.id from famille.personnes p
  where p.utilisateur_id = auth.uid()
     or p.gere_par = auth.uid()
     or p.foyer_id in (select famille.mes_foyers())
  union
  select p.id
  from famille.personnes p
  join famille.famille_foyers ff on ff.foyer_id = p.foyer_id
  where ff.famille_id in (select famille.mes_familles())
    and not exists (
      select 1 from famille.personnes_masquees m
      where m.personne_id = p.id and m.famille_id = ff.famille_id
    );
$$;

create or replace function famille.peut_voir_personne(id_personne uuid)
returns boolean
language sql stable security definer
set search_path = famille, pg_temp
as $$
  select id_personne in (select famille.personnes_visibles());
$$;

-- Puis-je choisir où cette personne est visible ? Personne sans compte de
-- mon foyer, ou que je gère.
create or replace function famille.peut_regler_visibilite(id_personne uuid)
returns boolean
language sql stable security definer
set search_path = famille, pg_temp
as $$
  select exists (
    select 1 from famille.personnes p
    where p.id = id_personne
      and p.utilisateur_id is null
      and (p.foyer_id in (select famille.mes_foyers()) or p.gere_par = auth.uid())
  );
$$;

-- Familles du foyer de cette personne.
create or replace function famille.familles_de_personne(id_personne uuid)
returns setof uuid
language sql stable security definer
set search_path = famille, pg_temp
as $$
  select ff.famille_id
  from famille.personnes p
  join famille.famille_foyers ff on ff.foyer_id = p.foyer_id
  where p.id = id_personne;
$$;

-- Personnes masquées dans ma famille active que je vois quand même (mon
-- foyer, ou par une autre famille) : les apps les retirent de leurs listes
-- quand elles affichent la famille active. Ne révèle rien de nouveau.
create or replace function famille.personnes_masquees_famille_active()
returns setof uuid
language sql stable security definer
set search_path = famille, pg_temp
as $$
  select m.personne_id
  from famille.personnes_masquees m
  where m.famille_id = famille.ma_famille()
    and m.personne_id in (select famille.personnes_visibles());
$$;

grant execute on function
  famille.est_masquee_dans(uuid, uuid), famille.personnes_visibles(), famille.peut_voir_personne(uuid),
  famille.peut_regler_visibilite(uuid), famille.familles_de_personne(uuid),
  famille.personnes_masquees_famille_active()
to authenticated;

-- -------------------------------------------------------------------------
-- 3. Règles RLS
-- -------------------------------------------------------------------------

-- Fiches des personnes. Les conditions directes (moi, mon foyer) restent
-- pour relire une fiche juste créée.
drop policy if exists "Voir les personnes de ses familles" on famille.personnes;
create policy "Voir les personnes de ses familles" on famille.personnes
  for select using (
    utilisateur_id = auth.uid()
    or foyer_id in (select famille.mes_foyers())
    or id in (select famille.personnes_visibles())
  );

alter table famille.personnes_masquees enable row level security;

drop policy if exists "Voir les réglages de visibilité" on famille.personnes_masquees;
create policy "Voir les réglages de visibilité" on famille.personnes_masquees
  for select using (famille.peut_regler_visibilite(personne_id));

drop policy if exists "Masquer dans une famille" on famille.personnes_masquees;
create policy "Masquer dans une famille" on famille.personnes_masquees
  for insert with check (
    famille.peut_regler_visibilite(personne_id)
    and famille_id in (select famille.familles_de_personne(personne_id))
    and masque_par = auth.uid()
  );

drop policy if exists "Rendre visible dans une famille" on famille.personnes_masquees;
create policy "Rendre visible dans une famille" on famille.personnes_masquees
  for delete using (famille.peut_regler_visibilite(personne_id));

grant select, insert, delete on famille.personnes_masquees to authenticated;
revoke update on famille.personnes_masquees from authenticated;

-- Photos : un gestionnaire des photos ne change que celles qu'il voit.
create or replace function famille.peut_modifier_photo(id_personne uuid)
returns boolean
language sql stable security definer
set search_path = famille, pg_temp
as $$
  select exists (
    select 1 from famille.personnes p
    where p.id = id_personne
      and (
        p.utilisateur_id = auth.uid()
        or (p.utilisateur_id is null and p.foyer_id in (select famille.mes_foyers()))
        or (famille.gere_les_photos() and famille.peut_voir_personne(p.id))
      )
  );
$$;

-- -------------------------------------------------------------------------
-- 4. CadeauCommun
-- -------------------------------------------------------------------------

-- Familles qui voient une liste : celles de son destinataire où il n'est pas
-- masqué (et les partages, sous la même condition). Liste commune : ses
-- partages.
create or replace function wishlist.familles_de_liste(id_liste uuid)
returns setof uuid
language sql stable security definer
set search_path = wishlist, pg_temp
as $$
  select ff.famille_id
  from wishlist.listes l
  join famille.personnes p on p.id = l.destinataire_id
  join famille.famille_foyers ff on ff.foyer_id = p.foyer_id
  where l.id = id_liste
    and not famille.est_masquee_dans(p.id, ff.famille_id)
  union
  select lf.famille_id
  from wishlist.liste_familles lf
  join wishlist.listes l on l.id = lf.liste_id
  where lf.liste_id = id_liste
    and (l.destinataire_id is null or not famille.est_masquee_dans(l.destinataire_id, lf.famille_id));
$$;

-- Liste d'une personne : seulement si je vois cette personne (même si j'ai
-- créé sa liste autrefois).
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
         and famille.peut_voir_personne(l.destinataire_id)
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

drop policy if exists "Voir les listes que j'ai créées" on wishlist.listes;
create policy "Voir les listes que j'ai créées" on wishlist.listes
  for select using (
    cree_par = auth.uid()
    and (
      (destinataire_id is not null and destinataire_id in (select famille.personnes_visibles()))
      or (destinataire_id is null and not wishlist.est_destinataire(id))
    )
  );

drop policy if exists "Créer une liste" on wishlist.listes;
create policy "Créer une liste" on wishlist.listes
  for insert with check (
    cree_par = auth.uid()
    and destinataire_id in (select famille.personnes_visibles())
  );

create or replace function wishlist.liste_de(id_personne uuid)
returns uuid
language plpgsql security definer
set search_path = wishlist, pg_temp
as $$
declare
  p famille.personnes;
  id_liste uuid;
begin
  if auth.uid() is null then
    raise exception 'Connexion requise';
  end if;
  select * into p from famille.personnes where id = id_personne;
  if p.id is null or not famille.peut_voir_personne(p.id) then
    raise exception 'Personne introuvable';
  end if;

  select id into id_liste from wishlist.listes where destinataire_id = id_personne;
  if id_liste is null then
    insert into wishlist.listes (destinataire_id, statut, cree_par)
    values (id_personne, case when p.utilisateur_id = auth.uid() then 'brouillon' else 'publiee' end, auth.uid())
    on conflict do nothing
    returning id into id_liste;
    if id_liste is null then
      select id into id_liste from wishlist.listes where destinataire_id = id_personne;
    end if;
  end if;

  if not wishlist.peut_voir_liste(id_liste) then
    raise exception 'La liste de % n''est pas encore publiée', coalesce(nullif(trim(p.prenom), ''), 'cette personne');
  end if;
  return id_liste;
end;
$$;

-- Destinataires d'une liste commune : visibles dans l'une de ses familles.
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
      where p.id = x.id
        and ff.famille_id = any (familles)
        and not famille.est_masquee_dans(p.id, ff.famille_id)
    )
  ) then
    raise exception 'Personne introuvable dans cette famille';
  end if;
end;
$$;

-- -------------------------------------------------------------------------
-- 5. VoyageCommun
-- -------------------------------------------------------------------------

create or replace function voyage.personnes_invitables()
returns setof uuid
language sql stable security definer
set search_path = voyage, pg_temp
as $$
  select famille.personnes_visibles();
$$;

-- Voyage « toute la famille » : pas les personnes masquées dans cette famille.
create or replace function voyage.inviter_a_la_creation()
returns trigger
language plpgsql security definer
set search_path = voyage, pg_temp
as $$
declare
  moi uuid := (select id from famille.personnes where utilisateur_id = new.cree_par);
begin
  if moi is not null then
    insert into voyage.participants (voyage_id, personne_id, role, reponse, ajoute_par)
    values (new.id, moi, 'organisateur', 'partant', new.cree_par)
    on conflict do nothing;
  end if;

  if new.participation = 'famille' then
    insert into voyage.participants (voyage_id, personne_id, ajoute_par)
    select new.id, p.id, new.cree_par
    from famille.personnes p
    where p.foyer_id in (
      select ff.foyer_id from famille.famille_foyers ff where ff.famille_id = new.famille_id
    )
      and not famille.est_masquee_dans(p.id, new.famille_id)
    on conflict do nothing;
  end if;
  return new;
end;
$$;

-- Calendrier commun d'une famille : sans les personnes qui y sont masquées.
create or replace function voyage.calendrier(debut date, fin date, id_famille uuid default null)
returns table (
  id uuid, personne_id uuid, prenom text, foyer_id uuid,
  date_debut date, date_fin date, etat text, motif text, prive boolean, modifiable boolean
)
language plpgsql stable security definer
set search_path = voyage, pg_temp
as $$
declare
  fam uuid := coalesce(id_famille, famille.ma_famille());
begin
  if auth.uid() is null or fam is null or fam not in (select famille.mes_familles()) then
    raise exception 'Famille introuvable';
  end if;

  return query
  select d.id, d.personne_id, p.prenom, p.foyer_id, d.date_debut, d.date_fin, d.etat,
         case when d.prive and d.personne_id not in (select voyage.mes_personnes())
              then null else d.motif end,
         d.prive,
         d.personne_id in (select voyage.mes_personnes())
  from voyage.disponibilites d
  join famille.personnes p on p.id = d.personne_id
  where p.foyer_id in (
          select ff.foyer_id from famille.famille_foyers ff where ff.famille_id = fam
          union select famille.mes_foyers()
        )
    and (p.utilisateur_id = auth.uid() or not famille.est_masquee_dans(p.id, fam))
    and d.date_fin >= debut and d.date_debut <= fin
  order by d.date_debut, p.prenom;
end;
$$;

-- Disponibilités des participants d'un voyage : seulement les personnes que
-- je vois.
create or replace function voyage.disponibilites_participants(id_voyage uuid, debut date, fin date)
returns table (
  personne_id uuid, prenom text, date_debut date, date_fin date, etat text, motif text
)
language plpgsql stable security definer
set search_path = voyage, pg_temp
as $$
begin
  if auth.uid() is null or not voyage.peut_voir(id_voyage) then
    raise exception 'Voyage introuvable';
  end if;

  return query
  select d.personne_id, p.prenom, d.date_debut, d.date_fin, d.etat,
         case when d.prive and d.personne_id not in (select voyage.mes_personnes())
              then null else d.motif end
  from voyage.participants pa
  join voyage.disponibilites d on d.personne_id = pa.personne_id
  join famille.personnes p on p.id = pa.personne_id
  where pa.voyage_id = id_voyage and pa.reponse <> 'decline'
    and p.id in (select famille.personnes_visibles())
    and d.date_fin >= debut and d.date_debut <= fin
  order by d.date_debut, p.prenom;
end;
$$;

-- -------------------------------------------------------------------------
-- 6. SouvenirsFamille
-- -------------------------------------------------------------------------

create or replace function souvenirs.personnes_de_mes_familles()
returns setof uuid
language sql stable security definer
set search_path = souvenirs, pg_temp
as $$
  select famille.personnes_visibles();
$$;

notify pgrst, 'reload schema';

commit;
