-- =========================================================================
-- Migration — Courses, Phase 2 : avant de partir, articles habituels,
-- historique
--
--   - CHECKLIST DU FOYER (courses.a_verifier) : une seule par foyer, commune
--     à toutes ses listes — les articles à contrôler à la maison avant
--     chaque course (lait, œufs, papier toilette…), rangés par endroit de
--     la maison (frigo, placards…) ;
--   - PRÉPARATIONS (courses.preparations, courses.verifications) : « Préparer
--     les courses » d'une liste passe la checklist article par article ;
--     « À acheter » ajoute l'article à cette liste. Une préparation en cours
--     se partage : deux personnes du foyer voient en direct ce que l'autre a
--     déjà vérifié. Chaque nouvelle préparation repart de zéro ;
--   - HABITUELS (courses.habituels) : produits achetés le plus souvent avec
--     une liste, d'après l'historique des courses terminées, avec la
--     quantité habituelle quand il y en a une ; épinglés en tête, masqués
--     jamais proposés (courses.produits.epingle / masque) ;
--   - l'historique garde désormais la clé de chaque produit
--     (courses.passage_articles.cle), calculée par l'app.
--
-- Qui voit quoi (règles RLS) : checklist, préparations et habituels sont
-- réservés au foyer (un invité d'un autre foyer n'est pas concerné par ce
-- qu'il y a dans les placards).
--
-- Pré-requis : 20261017100000_courses.sql.
-- =========================================================================

begin;

-- -------------------------------------------------------------------------
-- 1. Checklist du foyer
-- -------------------------------------------------------------------------

create table courses.a_verifier (
  id uuid primary key default gen_random_uuid(),
  foyer_id uuid not null references famille.foyers (id) on delete cascade,
  libelle text not null check (length(trim(libelle)) > 0),
  -- Endroit de la maison où vérifier (« Frigo », « Placards »…).
  endroit text not null default 'Placards',
  ordre integer not null default 0,
  cree_par uuid references auth.users (id) on delete set null default auth.uid(),
  cree_le timestamptz not null default now()
);
create index a_verifier_foyer on courses.a_verifier (foyer_id);

-- -------------------------------------------------------------------------
-- 2. Préparations (vérification partagée, en direct)
-- -------------------------------------------------------------------------

create table courses.preparations (
  id uuid primary key default gen_random_uuid(),
  liste_id uuid not null references courses.listes (id) on delete cascade,
  foyer_id uuid not null references famille.foyers (id) on delete cascade,
  commencee_par uuid references auth.users (id) on delete set null default auth.uid(),
  commencee_le timestamptz not null default now(),
  terminee_le timestamptz
);
-- Une seule préparation en cours par liste.
create unique index preparations_une_en_cours on courses.preparations (liste_id) where terminee_le is null;

create table courses.verifications (
  preparation_id uuid not null references courses.preparations (id) on delete cascade,
  a_verifier_id uuid not null references courses.a_verifier (id) on delete cascade,
  reponse text not null check (reponse in ('en_stock', 'a_acheter')),
  par uuid references auth.users (id) on delete set null default auth.uid(),
  le timestamptz not null default now(),
  primary key (preparation_id, a_verifier_id)
);

-- Préparation en cours de cette liste, créée si besoin (sans risque si deux
-- personnes l'ouvrent en même temps).
create or replace function courses.preparation_en_cours(id_liste uuid)
returns uuid
language plpgsql security definer
set search_path = courses, famille, pg_temp
as $$
declare
  id_foyer uuid;
  resultat uuid;
begin
  select foyer_id into id_foyer from courses.listes where id = id_liste;
  if id_foyer is null or id_foyer not in (select famille.mes_foyers()) or not courses.peut_voir_liste(id_liste) then
    raise exception 'Liste inaccessible.';
  end if;
  select id into resultat from courses.preparations where liste_id = id_liste and terminee_le is null;
  if resultat is null then
    insert into courses.preparations (liste_id, foyer_id, commencee_par)
    values (id_liste, id_foyer, auth.uid())
    on conflict do nothing
    returning id into resultat;
    if resultat is null then
      select id into resultat from courses.preparations where liste_id = id_liste and terminee_le is null;
    end if;
  end if;
  return resultat;
end;
$$;

-- -------------------------------------------------------------------------
-- 3. Historique : clé du produit, habituels
-- -------------------------------------------------------------------------

alter table courses.passage_articles add column if not exists cle text;
update courses.passage_articles set cle = lower(trim(libelle)) where cle is null;

-- « Terminer les courses » : comme en Phase 1, en gardant en plus la clé du
-- produit dans l'historique (pour les habituels).
create or replace function courses.terminer_courses(id_liste uuid, cles jsonb default '{}'::jsonb)
returns uuid
language plpgsql security definer
set search_path = courses, famille, pg_temp
as $$
declare
  id_passage uuid;
  id_foyer uuid;
  a record;
  cle_produit text;
begin
  if not courses.peut_voir_liste(id_liste) then
    raise exception 'Liste inaccessible.';
  end if;
  if not exists (select 1 from courses.articles where liste_id = id_liste and etat = 'caddie') then
    return null;
  end if;
  select foyer_id into id_foyer from courses.listes where id = id_liste;

  insert into courses.passages (liste_id, termine_par) values (id_liste, auth.uid())
  returning id into id_passage;

  for a in
    select * from courses.articles where liste_id = id_liste and etat = 'caddie'
  loop
    cle_produit := coalesce(nullif(cles ->> a.id::text, ''), lower(trim(a.libelle)));
    insert into courses.passage_articles (passage_id, libelle, quantite, unite, rayon_id, ajoute_par, cle)
    values (id_passage, a.libelle, a.quantite, a.unite, a.rayon_id, a.ajoute_par, cle_produit);
    insert into courses.produits (foyer_id, cle, libelle, rayon_id, nb_achats, dernier_achat)
    values (id_foyer, cle_produit, a.libelle, a.rayon_id, 1, now())
    on conflict (foyer_id, cle) do update
      set nb_achats = courses.produits.nb_achats + 1,
          dernier_achat = now(),
          libelle = excluded.libelle;
  end loop;

  delete from courses.articles where liste_id = id_liste and etat = 'caddie';
  return id_passage;
end;
$$;

-- Articles habituels d'une liste : achetés le plus souvent avec elle, les
-- épinglés en tête, les masqués jamais. Quantité habituelle = la plus
-- fréquente (vide si l'article n'en a jamais eu). Réservé au foyer.
create or replace function courses.habituels(id_liste uuid, nombre integer default 30)
returns table (
  cle text,
  libelle text,
  nb_achats bigint,
  dernier_achat timestamptz,
  quantite numeric,
  unite text,
  rayon_id text,
  epingle boolean
)
language sql stable security definer
set search_path = courses, famille, pg_temp
as $$
  with liste as (
    select l.id, l.foyer_id from courses.listes l
    where l.id = id_liste and l.foyer_id in (select famille.mes_foyers())
  ),
  achats as (
    select pa.*, p.termine_le
    from courses.passage_articles pa
    join courses.passages p on p.id = pa.passage_id
    join liste on liste.id = p.liste_id
    where pa.cle is not null
  ),
  groupes as (
    select
      a.cle,
      (array_agg(a.libelle order by a.termine_le desc))[1] as libelle,
      count(*) as nb_achats,
      max(a.termine_le) as dernier_achat,
      mode() within group (order by a.quantite) as quantite,
      mode() within group (order by a.unite) as unite,
      (array_agg(a.rayon_id order by a.termine_le desc))[1] as rayon_id
    from achats a
    group by a.cle
  )
  select g.cle, coalesce(pr.libelle, g.libelle), g.nb_achats, g.dernier_achat, g.quantite, g.unite,
         coalesce(pr.rayon_id, g.rayon_id), coalesce(pr.epingle, false)
  from groupes g
  join liste on true
  left join courses.produits pr on pr.foyer_id = liste.foyer_id and pr.cle = g.cle
  where not coalesce(pr.masque, false)
  union all
  -- Épinglés jamais encore achetés avec cette liste.
  select pr.cle, pr.libelle, 0, pr.dernier_achat, null, null, pr.rayon_id, true
  from courses.produits pr
  join liste on pr.foyer_id = liste.foyer_id
  where pr.epingle and not pr.masque and pr.cle not in (select cle from groupes)
  order by 8 desc, 3 desc, 4 desc nulls last
  limit greatest(nombre, 1);
$$;

-- -------------------------------------------------------------------------
-- 4. Droits et règles RLS
-- -------------------------------------------------------------------------

grant select, insert, update, delete on courses.a_verifier, courses.preparations, courses.verifications to authenticated;
grant all on courses.a_verifier, courses.preparations, courses.verifications to service_role;

alter table courses.a_verifier enable row level security;
alter table courses.preparations enable row level security;
alter table courses.verifications enable row level security;

create policy "Courses : checklist du foyer" on courses.a_verifier
  for all using (foyer_id in (select famille.mes_foyers()))
  with check (foyer_id in (select famille.mes_foyers()));

create policy "Courses : voir les préparations du foyer" on courses.preparations
  for select using (foyer_id in (select famille.mes_foyers()));
create policy "Courses : terminer une préparation du foyer" on courses.preparations
  for update using (foyer_id in (select famille.mes_foyers()))
  with check (foyer_id in (select famille.mes_foyers()));

create policy "Courses : vérifications du foyer" on courses.verifications
  for all using (
    preparation_id in (select id from courses.preparations where foyer_id in (select famille.mes_foyers()))
  )
  with check (
    par = auth.uid()
    and preparation_id in (select id from courses.preparations where foyer_id in (select famille.mes_foyers()))
    and a_verifier_id in (select id from courses.a_verifier where foyer_id in (select famille.mes_foyers()))
  );

grant execute on function
  courses.preparation_en_cours(uuid),
  courses.habituels(uuid, integer),
  courses.terminer_courses(uuid, jsonb)
to authenticated;

-- -------------------------------------------------------------------------
-- 5. Temps réel : vérification partagée en direct
-- -------------------------------------------------------------------------

alter table courses.verifications replica identity full;
alter publication supabase_realtime add table courses.verifications;

commit;
