-- =========================================================================
-- Congélateur — inventaire simple du contenu d'un ou plusieurs congélateurs
-- du foyer : un aliment, un type (qui fixe la durée de conservation
-- conseillée, voir src/services/congelateur.ts) et une date de mise au
-- congélateur. Pas de quantités (choix utilisateur : "que cela reste simple").
--
-- Ce bloc est aussi recopié dans setup.sql. Il peut être exécuté seul dans
-- l'éditeur SQL de Supabase (Dashboard > SQL Editor) ; il est ré-exécutable
-- sans risque.
-- =========================================================================

create table if not exists recettes.congelateurs (
  id uuid primary key default gen_random_uuid(),
  foyer_id uuid not null references recettes.foyers (id) on delete cascade,
  nom text not null,
  cree_par uuid not null references auth.users (id),
  cree_le timestamptz not null default now()
);

create table if not exists recettes.congelateur_aliments (
  id uuid primary key default gen_random_uuid(),
  congelateur_id uuid not null references recettes.congelateurs (id) on delete cascade,
  -- Recopié depuis le congélateur : simplifie les droits d'accès et permet
  -- le filtre de synchronisation temps réel par foyer.
  foyer_id uuid not null references recettes.foyers (id) on delete cascade,
  nom text not null,
  -- Clé du type d'aliment (ex. 'viande', 'volaille', 'plat') : la liste et
  -- les durées conseillées vivent dans l'application, pour pouvoir les
  -- ajuster sans toucher à la base.
  type text not null default 'autre',
  date_stockage date not null default current_date,
  cree_par uuid not null references auth.users (id),
  cree_le timestamptz not null default now()
);

create index if not exists congelateur_aliments_foyer_idx on recettes.congelateur_aliments (foyer_id);
create index if not exists congelateur_aliments_congelateur_idx on recettes.congelateur_aliments (congelateur_id);

alter table recettes.congelateurs enable row level security;
alter table recettes.congelateur_aliments enable row level security;

-- Tout le foyer voit, ajoute, modifie et retire : sortir un aliment du
-- congélateur est un geste partagé, quel que soit celui qui l'y a mis.
drop policy if exists "Voir les congélateurs de son foyer" on recettes.congelateurs;
create policy "Voir les congélateurs de son foyer" on recettes.congelateurs
  for select using (foyer_id in (select recettes.mes_foyers()));

drop policy if exists "Créer un congélateur dans son foyer" on recettes.congelateurs;
create policy "Créer un congélateur dans son foyer" on recettes.congelateurs
  for insert with check (foyer_id in (select recettes.mes_foyers()));

drop policy if exists "Modifier les congélateurs de son foyer" on recettes.congelateurs;
create policy "Modifier les congélateurs de son foyer" on recettes.congelateurs
  for update using (foyer_id in (select recettes.mes_foyers()))
  with check (foyer_id in (select recettes.mes_foyers()));

drop policy if exists "Supprimer un congélateur de son foyer" on recettes.congelateurs;
create policy "Supprimer un congélateur de son foyer" on recettes.congelateurs
  for delete using (foyer_id in (select recettes.mes_foyers()));

drop policy if exists "Voir le contenu des congélateurs de son foyer" on recettes.congelateur_aliments;
create policy "Voir le contenu des congélateurs de son foyer" on recettes.congelateur_aliments
  for select using (foyer_id in (select recettes.mes_foyers()));

drop policy if exists "Ajouter un aliment au congélateur" on recettes.congelateur_aliments;
create policy "Ajouter un aliment au congélateur" on recettes.congelateur_aliments
  for insert with check (
    foyer_id in (select recettes.mes_foyers())
    and congelateur_id in (select id from recettes.congelateurs where foyer_id in (select recettes.mes_foyers()))
  );

drop policy if exists "Modifier un aliment du congélateur" on recettes.congelateur_aliments;
create policy "Modifier un aliment du congélateur" on recettes.congelateur_aliments
  for update using (foyer_id in (select recettes.mes_foyers()))
  with check (
    foyer_id in (select recettes.mes_foyers())
    and congelateur_id in (select id from recettes.congelateurs where foyer_id in (select recettes.mes_foyers()))
  );

drop policy if exists "Retirer un aliment du congélateur" on recettes.congelateur_aliments;
create policy "Retirer un aliment du congélateur" on recettes.congelateur_aliments
  for delete using (foyer_id in (select recettes.mes_foyers()));

-- Droits API (déjà couverts par les "default privileges" de setup.sql pour
-- les nouvelles tables ; répétés ici pour une exécution isolée de ce bloc).
grant select, insert, update, delete on recettes.congelateurs to anon, authenticated;
grant select, insert, update, delete on recettes.congelateur_aliments to anon, authenticated;

-- Synchronisation temps réel entre les appareils du foyer.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'recettes' and tablename = 'congelateurs'
  ) then
    alter publication supabase_realtime add table recettes.congelateurs;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'recettes' and tablename = 'congelateur_aliments'
  ) then
    alter publication supabase_realtime add table recettes.congelateur_aliments;
  end if;
end $$;
