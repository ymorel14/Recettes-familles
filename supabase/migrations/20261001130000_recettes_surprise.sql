-- =========================================================================
-- Migration — Cuisine : recettes surprises
--
-- Une recette peut être cachée, par exemple parce qu'elle fait partie d'une
-- surprise pour un repas de famille :
--   - cachee = 'moi'   : visible seulement de la personne qui l'a cachée ;
--   - cachee = 'foyer' : visible de son foyer, cachée au reste de la famille ;
--   - cachee = null    : recette normale.
-- Une date de révélation facultative (revelee_le) la rend de nouveau visible
-- à tous à partir de ce jour-là (heure de Paris). Sinon, on la révèle à la
-- main (cachee remis à null).
--
-- La surprise est garantie par les règles RLS de la base, pas seulement par
-- l'interface : une recette cachée n'est renvoyée à personne d'autre, ni par
-- l'app Cuisine, ni par VoyageCommun (plats d'un repas liés à une recette).
-- Ses ingrédients, étapes, photos, catégories, éléments et essais suivent,
-- puisque leurs règles ne laissent voir que ceux des recettes visibles.
--
-- Pré-requis : 20260928140000_socle_famille.sql (fonctions famille.*).
-- =========================================================================

begin;

-- -------------------------------------------------------------------------
-- 1. Colonnes
-- -------------------------------------------------------------------------

alter table recettes.recettes
  add column if not exists cachee text check (cachee in ('moi', 'foyer')),
  -- Qui l'a cachée : renseigné par la base (déclencheur ci-dessous), jamais
  -- par l'application.
  add column if not exists cachee_par uuid references auth.users (id) on delete set null,
  add column if not exists revelee_le date;

comment on column recettes.recettes.cachee is
  'Recette surprise : ''moi'' (visible de cachee_par seul), ''foyer'' (visible de son foyer), null (visible de la famille).';
comment on column recettes.recettes.revelee_le is
  'Date (heure de Paris) à partir de laquelle une recette cachée redevient visible de tous. Facultative.';

-- -------------------------------------------------------------------------
-- 2. Qui l'a cachée
-- -------------------------------------------------------------------------

create or replace function recettes.memoriser_qui_cache()
returns trigger
language plpgsql
as $$
begin
  if new.cachee is null then
    new.cachee_par := null;
    new.revelee_le := null;
  elsif tg_op = 'INSERT' or old.cachee is null or old.cachee is distinct from new.cachee then
    new.cachee_par := auth.uid();
  else
    -- Cachée et inchangée : on garde celui qui l'a cachée.
    new.cachee_par := old.cachee_par;
  end if;
  return new;
end;
$$;

drop trigger if exists memoriser_qui_cache on recettes.recettes;
create trigger memoriser_qui_cache
  before insert or update on recettes.recettes
  for each row execute function recettes.memoriser_qui_cache();

-- -------------------------------------------------------------------------
-- 3. La recette est-elle cachée à l'utilisateur courant ?
-- -------------------------------------------------------------------------

create or replace function recettes.cachee_pour_moi(
  p_cachee text,
  p_cachee_par uuid,
  p_foyer_id uuid,
  p_revelee_le date
)
returns boolean
language sql
stable
security definer
set search_path = famille, pg_temp
as $$
  select p_cachee is not null
    and (p_revelee_le is null or p_revelee_le > (now() at time zone 'Europe/Paris')::date)
    and p_cachee_par is distinct from auth.uid()
    and (p_cachee = 'moi' or p_foyer_id not in (select famille.mes_foyers()));
$$;

grant execute on function recettes.cachee_pour_moi(text, uuid, uuid, date) to authenticated;

-- -------------------------------------------------------------------------
-- 4. Règles d'accès aux recettes
-- -------------------------------------------------------------------------

drop policy if exists "Voir les recettes de son foyer" on recettes.recettes;
create policy "Voir les recettes de son foyer" on recettes.recettes
  for select using (
    foyer_id in (select famille.mes_foyers())
    and not recettes.cachee_pour_moi(cachee, cachee_par, foyer_id, revelee_le)
  );

drop policy if exists "Voir les recettes de sa famille" on recettes.recettes;
create policy "Voir les recettes de sa famille" on recettes.recettes
  for select using (
    foyer_id in (select famille.foyers_de_mes_familles())
    and not recettes.cachee_pour_moi(cachee, cachee_par, foyer_id, revelee_le)
  );

drop policy if exists "Modifier les recettes de son foyer" on recettes.recettes;
create policy "Modifier les recettes de son foyer" on recettes.recettes
  for update using (
    foyer_id in (select famille.mes_foyers())
    and not recettes.cachee_pour_moi(cachee, cachee_par, foyer_id, revelee_le)
  )
  with check (foyer_id in (select famille.mes_foyers()));

drop policy if exists "Supprimer sa propre recette" on recettes.recettes;
create policy "Supprimer sa propre recette" on recettes.recettes
  for delete using (
    cree_par = auth.uid()
    and not recettes.cachee_pour_moi(cachee, cachee_par, foyer_id, revelee_le)
  );

notify pgrst, 'reload schema';

commit;
