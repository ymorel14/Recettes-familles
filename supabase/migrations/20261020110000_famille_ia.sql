-- =========================================================================
-- Migration — App Famille : socle de l'assistant (IA)
--
-- Spécification V1, chantier B (§ 3.3) : suivi des coûts et plafond par
-- foyer. Toutes les fonctions de l'assistant passent par la fonction Edge
-- « ia », qui compte chaque appel ici.
--
-- AJOUT SEULEMENT : nouvelles tables et fonctions, aucune table existante
-- modifiée (le plafond vit dans sa propre table plutôt que dans
-- famille.foyers). Les six apps actuelles ne voient aucune différence.
--
--   famille.ia_tarifs      prix par modèle (à mettre à jour à la main)
--   famille.ia_plafonds    plafond mensuel d'un foyer (5 $ si absent)
--   famille.ia_usage       une ligne par appel : tokens, coût, fonction
--   famille.ia_jauge()     jauge du foyer pour l'écran Moi : pourcentage
--                          pour tous, montants pour l'administrateur
--   famille.ia_etat_foyer  consommation et plafond, pour le serveur seul
--   famille.ia_usage_mensuel  vue d'administration (somme par foyer,
--                          fonction et mois), pour vérifier les estimations
--
-- Personne ne lit ni n'écrit ces tables directement depuis l'app : seul le
-- serveur (clé service_role, dans la fonction Edge) enregistre les appels.
-- Le mois est compté à l'heure de Paris (pause jusqu'au 1er du mois).
-- =========================================================================

begin;

-- -------------------------------------------------------------------------
-- Tarifs (dollars par million de tokens), tarifs d'octobre 2026
-- -------------------------------------------------------------------------
create table if not exists famille.ia_tarifs (
  modele text primary key,
  entree numeric(10,4) not null,
  sortie numeric(10,4) not null,
  cache_ecriture numeric(10,4) not null,
  cache_lecture numeric(10,4) not null,
  -- Au-delà de « seuil_long » tokens d'entrée, certains modèles coûtent plus.
  seuil_long int,
  entree_long numeric(10,4),
  sortie_long numeric(10,4),
  cache_ecriture_long numeric(10,4),
  cache_lecture_long numeric(10,4),
  -- Traitement de nuit (API Batches) : moitié prix.
  remise_differe numeric(4,3) not null default 0.5,
  -- Outil de recherche web : dollars pour 1 000 recherches.
  recherche_web_par_mille numeric(10,4) not null default 10,
  maj_le timestamptz not null default now()
);

insert into famille.ia_tarifs (modele, entree, sortie, cache_ecriture, cache_lecture,
                               seuil_long, entree_long, sortie_long, cache_ecriture_long, cache_lecture_long)
values
  ('claude-haiku-5-5', 0.10, 0.50, 0.125, 0.01, 100000, 0.50, 2.50, 0.625, 0.05),
  ('claude-sonnet-5-5', 2.00, 10.00, 2.50, 0.10, null, null, null, null, null)
on conflict (modele) do nothing;

alter table famille.ia_tarifs enable row level security;
revoke all on famille.ia_tarifs from anon, authenticated;

-- -------------------------------------------------------------------------
-- Plafond mensuel par foyer (5 $ par défaut, spécification § 3.3)
-- -------------------------------------------------------------------------
create table if not exists famille.ia_plafonds (
  foyer_id uuid primary key references famille.foyers (id) on delete cascade,
  plafond_usd numeric(8,2) not null default 5 check (plafond_usd >= 0),
  maj_le timestamptz not null default now()
);
alter table famille.ia_plafonds enable row level security;
revoke all on famille.ia_plafonds from anon, authenticated;

-- -------------------------------------------------------------------------
-- Consommation : une ligne par appel au modèle
-- -------------------------------------------------------------------------
create table if not exists famille.ia_usage (
  id bigint generated always as identity primary key,
  foyer_id uuid not null references famille.foyers (id) on delete cascade,
  utilisateur_id uuid references auth.users (id) on delete set null,
  fonction text not null,          -- 'essai', 'recette-photo', 'plus', 'resume-matin'…
  modele text not null,
  tokens_entree int not null,
  tokens_sortie int not null,
  tokens_cache_lus int not null default 0,
  tokens_cache_ecrits int not null default 0,
  recherches_web int not null default 0,
  differe boolean not null default false,   -- traitement de nuit à moitié prix
  cout_usd numeric(10,6) not null,
  cree_le timestamptz not null default now()
);
create index if not exists ia_usage_foyer_mois on famille.ia_usage (foyer_id, cree_le desc);

alter table famille.ia_usage enable row level security;
revoke all on famille.ia_usage from anon, authenticated;

-- Début du mois en cours, à l'heure de Paris.
create or replace function famille.ia_debut_mois()
returns timestamptz
language sql stable
as $$
  select (date_trunc('month', now() at time zone 'Europe/Paris')) at time zone 'Europe/Paris';
$$;

-- Consommation du mois et plafond d'un foyer. Réservée au serveur.
create or replace function famille.ia_etat_foyer(id_foyer uuid)
returns table (utilise_usd numeric, plafond_usd numeric)
language sql stable security definer
set search_path = famille, pg_temp
as $$
  select
    coalesce((select sum(u.cout_usd) from famille.ia_usage u
              where u.foyer_id = id_foyer and u.cree_le >= famille.ia_debut_mois()), 0)::numeric,
    coalesce((select p.plafond_usd from famille.ia_plafonds p where p.foyer_id = id_foyer), 5)::numeric;
$$;
revoke all on function famille.ia_etat_foyer(uuid) from public, anon, authenticated;

-- Jauge de mon foyer (écran Moi). Tout le monde voit le pourcentage ; les
-- montants en dollars ne sont donnés qu'à l'administrateur ou au créateur
-- du foyer (charte § 7.8).
create or replace function famille.ia_jauge()
returns table (
  pourcentage int,
  utilise_usd numeric,
  plafond_usd numeric,
  administrateur boolean,
  en_pause boolean,
  reprise_le date
)
language sql stable security definer
set search_path = famille, pg_temp
as $$
  with moi as (
    select m.foyer_id,
           (m.role = 'administrateur' or f.cree_par = auth.uid()) as admin
    from famille.foyer_membres m
    join famille.foyers f on f.id = m.foyer_id
    where m.utilisateur_id = auth.uid()
    limit 1
  ),
  etat as (
    select moi.foyer_id, moi.admin, e.utilise_usd, e.plafond_usd
    from moi, lateral famille.ia_etat_foyer(moi.foyer_id) e
  )
  select
    case when plafond_usd <= 0 then 100
         else least(100, round(100 * utilise_usd / plafond_usd))::int end,
    case when admin then round(utilise_usd, 2) end,
    case when admin then plafond_usd end,
    admin,
    utilise_usd >= plafond_usd,
    ((famille.ia_debut_mois() at time zone 'Europe/Paris') + interval '1 month')::date
  from etat;
$$;
revoke all on function famille.ia_jauge() from public, anon;
grant execute on function famille.ia_jauge() to authenticated;

-- L'administrateur (ou le créateur) du foyer règle le plafond de son foyer.
create or replace function famille.ia_definir_plafond(nouveau_plafond numeric)
returns void
language plpgsql security definer
set search_path = famille, pg_temp
as $$
declare
  id_foyer uuid;
begin
  select m.foyer_id into id_foyer
  from famille.foyer_membres m
  join famille.foyers f on f.id = m.foyer_id
  where m.utilisateur_id = auth.uid()
    and (m.role = 'administrateur' or f.cree_par = auth.uid())
  limit 1;
  if id_foyer is null then
    raise exception 'Seul l''administrateur du foyer peut changer le plafond de l''assistant.';
  end if;
  if nouveau_plafond is null or nouveau_plafond < 0 or nouveau_plafond > 50 then
    raise exception 'Plafond attendu entre 0 et 50 dollars par mois.';
  end if;
  insert into famille.ia_plafonds (foyer_id, plafond_usd, maj_le)
  values (id_foyer, nouveau_plafond, now())
  on conflict (foyer_id) do update set plafond_usd = excluded.plafond_usd, maj_le = now();
end;
$$;
revoke all on function famille.ia_definir_plafond(numeric) from public, anon;
grant execute on function famille.ia_definir_plafond(numeric) to authenticated;

-- Vue d'administration (éditeur SQL de Supabase uniquement).
create or replace view famille.ia_usage_mensuel as
select
  date_trunc('month', u.cree_le at time zone 'Europe/Paris')::date as mois,
  u.foyer_id,
  f.nom as foyer,
  u.fonction,
  u.modele,
  count(*) as appels,
  sum(u.tokens_entree) as tokens_entree,
  sum(u.tokens_sortie) as tokens_sortie,
  sum(u.tokens_cache_lus) as tokens_cache_lus,
  round(sum(u.cout_usd), 4) as cout_usd
from famille.ia_usage u
join famille.foyers f on f.id = u.foyer_id
group by 1, 2, 3, 4, 5;
revoke all on famille.ia_usage_mensuel from anon, authenticated;

-- Le serveur (fonction Edge « ia », clé service_role) lit les tarifs et le
-- plafond, et enregistre chaque appel.
grant usage on schema famille to service_role;
grant select on famille.ia_tarifs, famille.ia_plafonds, famille.ia_usage_mensuel to service_role;
grant select, insert on famille.ia_usage to service_role;
grant execute on function famille.ia_etat_foyer(uuid) to service_role;

commit;
