-- =========================================================================
-- Migration — SouvenirsFamille : albums, personnes hors famille, catégories
--
-- 1. Albums : une collection nommée de souvenirs (« Mes motos », « Les
--    enfants que j'ai gardés », « Noëls en famille »). Un souvenir peut être
--    dans plusieurs albums. Un album n'affiche que les souvenirs que le
--    lecteur a le droit de voir (règles RLS des souvenirs).
--    Visibilité d'un album : "famille", "foyer" ou "prive" (comme un
--    souvenir). Son auteur et son foyer le gèrent ; dans un album "famille",
--    chacun peut aussi ajouter SES propres souvenirs (et les retirer).
-- 2. Personnes hors famille : prénoms libres sur un souvenir (les enfants
--    gardés par une nounou, un ami, un collègue), sans fiche dans la famille.
--    Ils sont trouvés par la recherche.
-- 3. Deux catégories : « Véhicule » et « Garde d'enfants ».
--
-- Pré-requis : migration 20261001100000_souvenirs.sql.
-- =========================================================================

begin;

-- -------------------------------------------------------------------------
-- 1. Catégories
-- -------------------------------------------------------------------------

insert into souvenirs.categories (code, libelle, icone, mots_cles, ordre) values
  ('vehicule',      'Véhicule',          'car-sport-outline', 'véhicule voiture moto scooter vélo camping-car bateau achat acheté vendu permis', 78),
  ('garde_enfants', 'Garde d''enfants', 'balloon-outline',   'garde gardé gardée gardés nounou assistante maternelle baby-sitting enfant enfants', 76)
on conflict (code) do nothing;

-- -------------------------------------------------------------------------
-- 2. Personnes hors famille
-- -------------------------------------------------------------------------

alter table souvenirs.souvenirs
  add column if not exists autres_personnes text[] not null default '{}';

comment on column souvenirs.souvenirs.autres_personnes is
  'Prénoms libres de personnes hors de la famille (enfants gardés, amis…).';

-- Index de recherche : les prénoms hors famille comptent comme le lieu
-- (poids B).
create or replace function souvenirs.document_recherche(s souvenirs.souvenirs)
returns tsvector
language sql stable security definer
set search_path = souvenirs, pg_temp
as $$
  select
       setweight(to_tsvector('souvenirs.fr', coalesce(s.titre, '')), 'A')
    || setweight(to_tsvector('souvenirs.fr', concat_ws(' ',
         (select c.libelle || ' ' || c.mots_cles from souvenirs.categories c where c.code = s.categorie),
         s.lieu, s.pays, array_to_string(s.etiquettes, ' '), array_to_string(s.autres_personnes, ' '),
         extract(year from s.date_debut)::int::text,
         extract(year from s.date_fin)::int::text
       )), 'B')
    || setweight(to_tsvector('souvenirs.fr', coalesce(s.recit, '')), 'C')
    || setweight(to_tsvector('souvenirs.fr', concat_ws(' ',
         (select string_agg(co.texte, ' ') from souvenirs.commentaires co where co.souvenir_id = s.id),
         (select string_agg(m.legende, ' ') from souvenirs.medias m where m.souvenir_id = s.id)
       )), 'D');
$$;

create or replace function souvenirs.texte_court(s souvenirs.souvenirs)
returns text
language sql stable
set search_path = souvenirs, pg_temp
as $$
  select souvenirs.normaliser(concat_ws(' ',
    s.titre, s.lieu, s.pays, array_to_string(s.etiquettes, ' '), array_to_string(s.autres_personnes, ' '),
    (select c.libelle from souvenirs.categories c where c.code = s.categorie)
  ));
$$;

-- Prénoms nettoyés (espaces, doublons) et maj_le suivi : on complète le
-- déclencheur existant par un déclencheur qui passe avant lui (ordre
-- alphabétique des noms).
create or replace function souvenirs.nettoyer_autres_personnes()
returns trigger
language plpgsql
set search_path = souvenirs, pg_temp
as $$
begin
  new.autres_personnes := coalesce(
    (select array_agg(p order by min_pos) from (
       select trim(x) as p, min(o) as min_pos
       from unnest(new.autres_personnes) with ordinality as t(x, o)
       where trim(x) <> ''
       group by trim(x)
     ) d),
    '{}'
  );
  if tg_op = 'UPDATE' and new.autres_personnes is distinct from old.autres_personnes then
    new.maj_le := now();
  end if;
  return new;
end;
$$;

create trigger a_nettoyer_autres_personnes
before insert or update on souvenirs.souvenirs
for each row execute function souvenirs.nettoyer_autres_personnes();

-- Recalcule l'index de tous les souvenirs (nouvelles catégories, nouveau
-- champ).
update souvenirs.souvenirs set recherche = null;

-- La recherche renvoie aussi les prénoms hors famille (type de retour
-- modifié : on recrée la fonction).
drop function souvenirs.rechercher(text, uuid, text, uuid, date, date, integer);

-- Formes d'un mot essayées par la recherche : tel quel, sans s/x final,
-- avec un s final (« motos » ↔ « moto »).
create or replace function souvenirs.variantes(mot text)
returns text[]
language sql immutable
set search_path = souvenirs, pg_temp
as $$
  select array_remove(array[
    mot,
    case when length(mot) > 3 and mot ~ '[sx]$' then left(mot, -1) end,
    case when length(mot) > 2 and mot !~ '[sx]$' then mot || 's' end
  ], null);
$$;

-- Requête d'un seul mot de la question (toutes ses formes).
create or replace function souvenirs.requete_mot(mot text)
returns tsquery
language sql stable
set search_path = souvenirs, pg_temp
as $$
  select case when count(*) = 0 then null
              else to_tsquery('simple', string_agg(distinct quote_literal(t.lexeme), ' | ')) end
  from unnest(souvenirs.variantes(mot)) as v(forme)
  cross join lateral unnest(to_tsvector('souvenirs.fr', v.forme)) as t;
$$;

create or replace function souvenirs.rechercher(
  question text default '',
  id_famille uuid default null,
  categorie_code text default null,
  id_personne uuid default null,
  depuis date default null,
  jusqu_a date default null,
  limite integer default 30
)
returns table (
  id uuid, titre text, categorie text, date_debut date, date_fin date, precision_date text,
  lieu text, pays text, extrait text, couverture text, nb_medias integer,
  nb_commentaires integer, personnes jsonb, autres_personnes text[], pertinence real
)
language plpgsql stable
-- extensions et public : là où peut se trouver pg_trgm (word_similarity).
set search_path = souvenirs, extensions, public, pg_temp
as $$
#variable_conflict use_column
declare
  fam uuid := coalesce(id_famille, famille.ma_famille());
  texte_norm text := souvenirs.normaliser(question);
  q tsquery;
  mots text[];
  lexemes text[];
begin
  if auth.uid() is null or fam is null or fam not in (select famille.mes_familles()) then
    raise exception 'Famille introuvable';
  end if;

  -- Mots utiles de la question (hors mots vides du français).
  select array_agg(distinct m.mot) into mots
  from regexp_split_to_table(lower(coalesce(question, '')), '[^[:alnum:]]+') as m(mot)
  where length(m.mot) >= 2
    and to_tsvector('pg_catalog.french', m.mot) <> ''::tsvector;

  -- Requête "un mot OU l'autre" (chaque mot avec et sans s/x final : le
  -- français ne réduit pas toujours les pluriels courts, « motos ») ; la
  -- pertinence compte ensuite la part des mots de la question retrouvés.
  select array_agg(distinct t.lexeme) into lexemes
  from unnest(coalesce(mots, '{}')) as m(mot)
  cross join lateral unnest(souvenirs.variantes(m.mot)) as v(forme)
  cross join lateral unnest(to_tsvector('souvenirs.fr', v.forme)) as t;

  if cardinality(lexemes) > 0 then
    select to_tsquery('simple', string_agg(quote_literal(l), ' | '))
      into q
    from unnest(lexemes) as l;
  end if;

  return query
  with prenoms as (
    select p.id as personne_id
    from famille.personnes p
    where p.id in (select souvenirs.personnes_de_mes_familles())
      and length(souvenirs.normaliser(p.prenom)) >= 2
      and texte_norm ~ ('\m' || regexp_replace(souvenirs.normaliser(p.prenom), '([^[:alnum:][:space:]])', '\\\1', 'g') || '\M')
  ),
  candidats as (
    select s.*,
      case when q is null then 0
           else ts_rank(s.recherche, q, 32) end as r_texte,
      case when q is null then 0
           else (select count(*) from unnest(mots) as m(mot)
                 where s.recherche @@ souvenirs.requete_mot(m.mot))::real
                / cardinality(mots) end as r_mots,
      exists (
        select 1 from souvenirs.souvenir_personnes sp
        where sp.souvenir_id = s.id and sp.personne_id in (select pr.personne_id from prenoms pr)
      ) as r_personne,
      coalesce((
        select max(word_similarity(souvenirs.normaliser(m.mot), s.texte_recherche))
        from unnest(coalesce(mots, '{}')) as m(mot)
        where length(m.mot) >= 3
      ), 0) as r_approche
    from souvenirs.souvenirs s
    where s.famille_id = fam
      and (categorie_code is null or s.categorie = categorie_code)
      and (id_personne is null or exists (
            select 1 from souvenirs.souvenir_personnes sp
            where sp.souvenir_id = s.id and sp.personne_id = id_personne))
      and (depuis is null or coalesce(s.date_fin, s.date_debut) >= depuis)
      and (jusqu_a is null or s.date_debut <= jusqu_a)
  )
  select
    c.id, c.titre, c.categorie, c.date_debut, c.date_fin, c.precision_date, c.lieu, c.pays,
    case
      when c.recit is null then null
      when q is not null and c.recherche @@ q then
        ts_headline('souvenirs.fr', c.recit, q, 'MaxWords=30, MinWords=12, StartSel=«, StopSel=»')
      else left(c.recit, 200)
    end,
    coalesce(
      (select m.chemin from souvenirs.medias m where m.id = c.couverture_id),
      (select m.chemin from souvenirs.medias m
        where m.souvenir_id = c.id and m.type = 'photo' order by m.ordre, m.cree_le limit 1)
    ),
    (select count(*)::int from souvenirs.medias m where m.souvenir_id = c.id),
    (select count(*)::int from souvenirs.commentaires co where co.souvenir_id = c.id),
    (select coalesce(jsonb_agg(jsonb_build_object(
        'id', p.id,
        'prenom', p.prenom,
        'role', sp.role,
        'age_mois', case when p.date_naissance is not null and c.date_debut >= p.date_naissance then
                      (extract(year from age(c.date_debut, p.date_naissance)) * 12
                       + extract(month from age(c.date_debut, p.date_naissance)))::int end
      ) order by sp.role desc, p.prenom), '[]'::jsonb)
      from souvenirs.souvenir_personnes sp
      join famille.personnes p on p.id = sp.personne_id
      where sp.souvenir_id = c.id),
    c.autres_personnes,
    (c.r_mots + c.r_texte * 0.3
      + case when c.r_personne then 0.5 else 0 end
      + case when c.r_approche >= 0.5 then c.r_approche * 0.3 else 0 end)::real
  from candidats c
  where (q is null and not exists (select 1 from prenoms) and coalesce(cardinality(mots), 0) = 0)
     or (q is not null and c.recherche @@ q)
     or c.r_personne
     or c.r_approche >= 0.5
  order by 15 desc, c.date_debut desc nulls last
  limit greatest(1, least(coalesce(limite, 30), 200));
end;
$$;

revoke execute on function souvenirs.rechercher(text, uuid, text, uuid, date, date, integer) from public, anon;
grant execute on function souvenirs.rechercher(text, uuid, text, uuid, date, date, integer) to authenticated;

-- -------------------------------------------------------------------------
-- 3. Albums
-- -------------------------------------------------------------------------

create table souvenirs.albums (
  id uuid primary key default gen_random_uuid(),
  famille_id uuid not null references famille.familles (id) on delete cascade,
  foyer_id uuid references famille.foyers (id) on delete set null,
  titre text not null check (length(trim(titre)) > 0),
  description text,
  visibilite text not null default 'famille' check (visibilite in ('famille', 'foyer', 'prive')),
  -- Souvenir dont la photo sert de couverture (sinon : le premier qui en a une).
  couverture_souvenir_id uuid references souvenirs.souvenirs (id) on delete set null,
  cree_par uuid default auth.uid() references auth.users (id) on delete set null,
  cree_le timestamptz not null default now(),
  maj_le timestamptz not null default now()
);
create index albums_famille on souvenirs.albums (famille_id);

create table souvenirs.album_souvenirs (
  album_id uuid not null references souvenirs.albums (id) on delete cascade,
  souvenir_id uuid not null references souvenirs.souvenirs (id) on delete cascade,
  ajoute_par uuid default auth.uid() references auth.users (id) on delete set null,
  ajoute_le timestamptz not null default now(),
  primary key (album_id, souvenir_id)
);
create index album_souvenirs_souvenir on souvenirs.album_souvenirs (souvenir_id);

-- Contrôles (security definer, comme pour les souvenirs).
create or replace function souvenirs.peut_voir_album(id_album uuid)
returns boolean
language sql stable security definer
set search_path = souvenirs, pg_temp
as $$
  select exists (
    select 1 from souvenirs.albums a
    where a.id = id_album
      and (
        a.cree_par = auth.uid()
        or (a.visibilite = 'famille' and a.famille_id in (select famille.mes_familles()))
        or (a.visibilite = 'foyer' and a.foyer_id in (select famille.mes_foyers()))
      )
  );
$$;

create or replace function souvenirs.peut_modifier_album(id_album uuid)
returns boolean
language sql stable security definer
set search_path = souvenirs, pg_temp
as $$
  select exists (
    select 1 from souvenirs.albums a
    where a.id = id_album
      and (
        a.cree_par = auth.uid()
        or (a.visibilite <> 'prive' and a.foyer_id in (select famille.mes_foyers()))
      )
  );
$$;

-- Album "famille" : chacun peut y verser SES souvenirs.
create or replace function souvenirs.peut_contribuer_album(id_album uuid, id_souvenir uuid)
returns boolean
language sql stable security definer
set search_path = souvenirs, pg_temp
as $$
  select souvenirs.peut_modifier_album(id_album)
      or exists (
        select 1 from souvenirs.albums a, souvenirs.souvenirs s
        where a.id = id_album and s.id = id_souvenir
          and a.visibilite = 'famille'
          and a.famille_id in (select famille.mes_familles())
          and s.cree_par = auth.uid()
      );
$$;

-- Album : foyer de l'auteur rempli, auteur/famille/foyer figés, seul
-- l'auteur rend un album privé.
create or replace function souvenirs.regler_album()
returns trigger
language plpgsql security definer
set search_path = souvenirs, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    if new.foyer_id is null then
      new.foyer_id := (
        select fm.foyer_id from famille.foyer_membres fm
        where fm.utilisateur_id = coalesce(new.cree_par, auth.uid()) limit 1
      );
    end if;
  else
    new.cree_par := old.cree_par;
    new.famille_id := old.famille_id;
    new.foyer_id := old.foyer_id;
    new.cree_le := old.cree_le;
    if new.visibilite = 'prive' and old.visibilite <> 'prive'
       and auth.uid() is not null and auth.uid() is distinct from old.cree_par then
      raise exception 'Seul l''auteur peut rendre cet album privé';
    end if;
    new.maj_le := now();
  end if;
  new.titre := trim(new.titre);
  return new;
end;
$$;

create trigger regler_album
before insert or update on souvenirs.albums
for each row execute function souvenirs.regler_album();

-- Un souvenir n'entre que dans un album de sa propre famille.
create or replace function souvenirs.regler_album_souvenir()
returns trigger
language plpgsql security definer
set search_path = souvenirs, pg_temp
as $$
begin
  if (select famille_id from souvenirs.albums where id = new.album_id)
     is distinct from (select famille_id from souvenirs.souvenirs where id = new.souvenir_id) then
    raise exception 'Ce souvenir appartient à une autre famille que l''album';
  end if;
  return new;
end;
$$;

create trigger regler_album_souvenir
before insert on souvenirs.album_souvenirs
for each row execute function souvenirs.regler_album_souvenir();

alter table souvenirs.albums enable row level security;
alter table souvenirs.album_souvenirs enable row level security;

create policy "Voir les albums" on souvenirs.albums
  for select using (cree_par = auth.uid() or souvenirs.peut_voir_album(id));
create policy "Créer un album dans ses familles" on souvenirs.albums
  for insert with check (famille_id in (select famille.mes_familles()) and cree_par = auth.uid());
create policy "Modifier un album" on souvenirs.albums
  for update using (souvenirs.peut_modifier_album(id)) with check (souvenirs.peut_modifier_album(id));
create policy "Supprimer un album" on souvenirs.albums
  for delete using (souvenirs.peut_modifier_album(id));

-- On ne voit dans un album que les souvenirs qu'on a le droit de voir.
create policy "Voir le contenu d'un album" on souvenirs.album_souvenirs
  for select using (souvenirs.peut_voir_album(album_id) and souvenirs.peut_voir(souvenir_id));
create policy "Ajouter un souvenir à un album" on souvenirs.album_souvenirs
  for insert with check (
    ajoute_par = auth.uid()
    and souvenirs.peut_voir(souvenir_id)
    and souvenirs.peut_contribuer_album(album_id, souvenir_id)
  );
create policy "Retirer un souvenir d'un album" on souvenirs.album_souvenirs
  for delete using (souvenirs.peut_modifier_album(album_id) or ajoute_par = auth.uid());

grant select, insert, update, delete on souvenirs.albums, souvenirs.album_souvenirs to authenticated;

-- Albums d'une famille (active par défaut) pour l'onglet Albums : nombre de
-- souvenirs visibles, période couverte, photo de couverture. Respecte les
-- règles RLS (security invoker).
create or replace function souvenirs.lister_albums(id_famille uuid default null)
returns table (
  id uuid, titre text, description text, visibilite text, cree_par uuid, foyer_id uuid,
  nb_souvenirs integer, premiere_date date, derniere_date date, couverture text, maj_le timestamptz
)
language sql stable
set search_path = souvenirs, pg_temp
as $$
  select a.id, a.titre, a.description, a.visibilite, a.cree_par, a.foyer_id,
    (select count(*)::int from souvenirs.album_souvenirs x
      join souvenirs.souvenirs s on s.id = x.souvenir_id where x.album_id = a.id),
    (select min(s.date_debut) from souvenirs.album_souvenirs x
      join souvenirs.souvenirs s on s.id = x.souvenir_id where x.album_id = a.id),
    (select max(coalesce(s.date_fin, s.date_debut)) from souvenirs.album_souvenirs x
      join souvenirs.souvenirs s on s.id = x.souvenir_id where x.album_id = a.id),
    coalesce(
      (select coalesce(
          (select m.chemin from souvenirs.medias m where m.id = s.couverture_id),
          (select m.chemin from souvenirs.medias m where m.souvenir_id = s.id and m.type = 'photo'
            order by m.ordre, m.cree_le limit 1))
        from souvenirs.souvenirs s where s.id = a.couverture_souvenir_id),
      (select m.chemin from souvenirs.album_souvenirs x
        join souvenirs.souvenirs s on s.id = x.souvenir_id
        join souvenirs.medias m on m.souvenir_id = s.id and m.type = 'photo'
        where x.album_id = a.id
        order by (m.id = s.couverture_id) desc, s.date_debut nulls last, m.ordre limit 1)
    ),
    a.maj_le
  from souvenirs.albums a
  where a.famille_id = coalesce(id_famille, famille.ma_famille())
  order by a.titre;
$$;

revoke execute on function
  souvenirs.peut_voir_album(uuid), souvenirs.peut_modifier_album(uuid),
  souvenirs.peut_contribuer_album(uuid, uuid), souvenirs.lister_albums(uuid)
from public, anon;
grant execute on function
  souvenirs.peut_voir_album(uuid), souvenirs.peut_modifier_album(uuid),
  souvenirs.peut_contribuer_album(uuid, uuid), souvenirs.lister_albums(uuid)
to authenticated;

notify pgrst, 'reload schema';

commit;
