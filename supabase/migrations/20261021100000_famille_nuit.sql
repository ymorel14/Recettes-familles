-- =========================================================================
-- Migration — App Famille : traitement de nuit de l'assistant et doublons
--
-- Spécification V1, chantier C, étape 7 :
--   - § 4.6.2 résumé du matin sur l'accueil ;
--   - § 4.2.2 prévision des habituels de Courses (« Café à racheter ? ») ;
--   - § 4.2.3 fusion des doublons (« ce n'est pas le même produit » mémorisé).
--
-- AJOUT SEULEMENT : nouvelles tables et fonctions, aucune table existante
-- modifiée. Les six apps actuelles ne voient aucune différence.
--
-- Garantie de confidentialité, PAR CONSTRUCTION (§ 4.6.2 et § 5.6) :
--   famille.faits_du_jour() et courses.historique_prevision() sont des
--   fonctions ordinaires (« security invoker ») : elles lisent les tables
--   des modules AVEC LES RÈGLES RLS de la personne connectée. La nuit,
--   personne n'est connecté : famille.preparer_travaux_nuit(), lancée par
--   pg_cron, prend tour à tour l'identité de chaque utilisateur (rôle
--   « authenticated » et son identifiant, exactement comme une requête de
--   l'app) avant de les appeler. Les faits obtenus sont donc ceux que la
--   personne voit dans l'app, rien de plus : pas d'idée de cadeau ni de
--   voyage surprise qui lui serait caché. Le modèle ne reçoit que ces faits,
--   déjà filtrés et déjà rédigés ; il ne fait que les mettre en phrases.
--   La fonction Edge « ia-nuit » (clé service_role) ne lit que ces faits
--   préparés (famille.ia_travaux), jamais les tables des modules.
--
--   famille.resumes_demandes  qui ouvre l'accueil (résumé préparé pour les
--                             personnes venues ces 7 derniers jours)
--   famille.ia_travaux        travail de nuit : faits préparés, réponse
--   famille.ia_lots           lots envoyés à l'API Batches (moitié prix)
--   famille.resumes_matin     résumé de chaque personne, chaque jour
--   courses.previsions_ia     affinage hebdomadaire des habituels
--   courses.non_doublons      « ce n'est pas le même produit », mémorisé
--
-- Planification (pg_cron) : supabase/planification_nuit.sql, à exécuter une
-- fois, après le déploiement de la fonction Edge « ia-nuit ».
--
-- Pré-requis : 20261020110000_famille_ia.sql et les migrations des modules.
-- =========================================================================

begin;

-- -------------------------------------------------------------------------
-- 1. Tables
-- -------------------------------------------------------------------------

-- Dernière visite de l'accueil : le résumé n'est préparé que pour les
-- personnes qui s'en servent (pas de dépense pour un compte endormi).
create table if not exists famille.resumes_demandes (
  utilisateur_id uuid primary key references auth.users (id) on delete cascade,
  derniere_vue timestamptz not null default now()
);
alter table famille.resumes_demandes enable row level security;
revoke all on famille.resumes_demandes from anon, authenticated;

-- Résumé du matin d'une personne pour un jour. phrases = tableau de
-- phrases, chacune faite de morceaux { texte, cible, module } (cible =
-- chemin interne de l'écran à ouvrir, null pour du texte simple).
create table if not exists famille.resumes_matin (
  utilisateur_id uuid not null references auth.users (id) on delete cascade,
  jour date not null,
  phrases jsonb not null default '[]'::jsonb,
  differe boolean not null default true,   -- rédigé la nuit (moitié prix)
  cree_le timestamptz not null default now(),
  primary key (utilisateur_id, jour)
);
alter table famille.resumes_matin enable row level security;
drop policy if exists "Mon résumé du matin" on famille.resumes_matin;
create policy "Mon résumé du matin" on famille.resumes_matin
  for select using (utilisateur_id = auth.uid());
grant select on famille.resumes_matin to authenticated;

-- Lots envoyés à l'API Batches d'Anthropic.
create table if not exists famille.ia_lots (
  id uuid primary key default gen_random_uuid(),
  anthropic_id text unique,
  statut text not null default 'en_cours' check (statut in ('en_cours', 'termine', 'echec')),
  nb_requetes int not null default 0,
  cree_le timestamptz not null default now(),
  termine_le timestamptz
);
alter table famille.ia_lots enable row level security;
revoke all on famille.ia_lots from anon, authenticated;

-- Travail de nuit : une ligne par résumé à rédiger ou par foyer dont on
-- affine les habituels. « entree » contient les faits DÉJÀ FILTRÉS.
create table if not exists famille.ia_travaux (
  id uuid primary key default gen_random_uuid(),
  nature text not null check (nature in ('resume-matin', 'habituels')),
  foyer_id uuid not null references famille.foyers (id) on delete cascade,
  utilisateur_id uuid references auth.users (id) on delete cascade,
  jour date not null,
  entree jsonb not null,
  sortie jsonb,
  -- a_envoyer → envoye → fait | echec ; sans_objet : rien à dire ;
  -- plafond : foyer au plafond du mois, rien n'est envoyé.
  statut text not null default 'a_envoyer'
    check (statut in ('a_envoyer', 'envoye', 'fait', 'echec', 'sans_objet', 'plafond')),
  lot_id uuid references famille.ia_lots (id) on delete set null,
  cree_le timestamptz not null default now(),
  fini_le timestamptz
);
create unique index if not exists ia_travaux_resume_unique
  on famille.ia_travaux (utilisateur_id, jour) where nature = 'resume-matin';
create index if not exists ia_travaux_statut on famille.ia_travaux (statut, cree_le);
create index if not exists ia_travaux_habituels on famille.ia_travaux (foyer_id, jour) where nature = 'habituels';
alter table famille.ia_travaux enable row level security;
revoke all on famille.ia_travaux from anon, authenticated;

-- Affinage hebdomadaire des habituels par l'assistant (saisonnalité,
-- produits liés) : date probable du prochain achat et phrase courte.
create table if not exists courses.previsions_ia (
  foyer_id uuid not null references famille.foyers (id) on delete cascade,
  cle text not null,
  prochain_achat date,
  -- L'assistant pense que ce n'est pas le moment (produit de saison…).
  ignorer boolean not null default false,
  phrase text,
  maj_le timestamptz not null default now(),
  primary key (foyer_id, cle)
);
alter table courses.previsions_ia enable row level security;
drop policy if exists "Courses : prévisions du foyer" on courses.previsions_ia;
create policy "Courses : prévisions du foyer" on courses.previsions_ia
  for select using (foyer_id in (select famille.mes_foyers()));
grant select on courses.previsions_ia to authenticated;

-- « Ce n'est pas le même produit » : deux clés (cle_a < cle_b) que le
-- foyer ne veut plus voir proposées à la fusion.
create table if not exists courses.non_doublons (
  foyer_id uuid not null references famille.foyers (id) on delete cascade,
  cle_a text not null,
  cle_b text not null,
  cree_par uuid default auth.uid() references auth.users (id) on delete set null,
  cree_le timestamptz not null default now(),
  primary key (foyer_id, cle_a, cle_b),
  check (cle_a < cle_b)
);
alter table courses.non_doublons enable row level security;
drop policy if exists "Courses : non-doublons du foyer" on courses.non_doublons;
create policy "Courses : non-doublons du foyer" on courses.non_doublons
  for select using (foyer_id in (select famille.mes_foyers()));
drop policy if exists "Courses : noter un non-doublon" on courses.non_doublons;
create policy "Courses : noter un non-doublon" on courses.non_doublons
  for insert with check (foyer_id in (select famille.mes_foyers()));
drop policy if exists "Courses : oublier un non-doublon" on courses.non_doublons;
create policy "Courses : oublier un non-doublon" on courses.non_doublons
  for delete using (foyer_id in (select famille.mes_foyers()));
grant select, insert, delete on courses.non_doublons to authenticated;

-- -------------------------------------------------------------------------
-- 2. Petites aides
-- -------------------------------------------------------------------------

-- « dimanche 26 octobre »
create or replace function famille.date_en_clair(d date)
returns text
language sql immutable
as $$
  select (array['dimanche','lundi','mardi','mercredi','jeudi','vendredi','samedi'])[extract(dow from d)::int + 1]
    || ' ' || case when extract(day from d) = 1 then '1er' else extract(day from d)::int::text end
    || ' ' || (array['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'])[extract(month from d)::int];
$$;

-- « aujourd'hui », « demain », « dans 5 jours »
create or replace function famille.dans_combien(d date, jour date)
returns text
language sql immutable
as $$
  select case
    when d - jour = 0 then 'aujourd''hui'
    when d - jour = 1 then 'demain'
    when d - jour > 1 then 'dans ' || (d - jour) || ' jours'
    when d - jour = -1 then 'hier'
    else 'il y a ' || (jour - d) || ' jours'
  end;
$$;

-- Aujourd'hui, à Paris.
create or replace function famille.aujourdhui_paris()
returns date
language sql stable
as $$
  select (now() at time zone 'Europe/Paris')::date;
$$;

grant execute on function famille.date_en_clair(date), famille.dans_combien(date, date), famille.aujourdhui_paris()
  to authenticated, service_role;

-- -------------------------------------------------------------------------
-- 3. Courses : produits à racheter (§ 4.2.2)
-- -------------------------------------------------------------------------
-- Un calcul simple suffit en grande partie : intervalle moyen entre deux
-- jours d'achat, sur les listes DU FOYER (jamais les listes « moi », qui
-- sont personnelles). Pas de suggestion avant 3 achats ; « Ne plus
-- proposer » (produits.masque) est respecté ; un produit déjà sur une liste
-- du foyer n'est pas proposé. L'affinage de l'assistant (courses.previsions_ia,
-- moins de 10 jours) remplace la date calculée et ajoute une phrase.
-- Fonction ordinaire (security invoker) : les règles RLS de la personne
-- connectée s'appliquent.
create or replace function courses.a_racheter(jour date default null)
returns table (
  foyer_id uuid,
  cle text,
  libelle text,
  nb_achats int,
  dernier_achat date,
  intervalle_jours int,
  prevu_le date,
  quantite numeric,
  unite text,
  rayon_id text,
  phrase text
)
language sql stable
set search_path = courses, famille, pg_temp
as $$
  with j as (select coalesce(jour, famille.aujourdhui_paris()) as d),
  achats as (
    select l.foyer_id, pa.cle, pa.libelle, pa.quantite, pa.unite, pa.rayon_id,
           (p.termine_le at time zone 'Europe/Paris')::date as jour_achat, p.termine_le
    from courses.passage_articles pa
    join courses.passages p on p.id = pa.passage_id
    join courses.listes l on l.id = p.liste_id
    where l.portee = 'foyer'
      and l.foyer_id in (select famille.mes_foyers())
      and pa.cle is not null and pa.cle <> ''
      and p.termine_le > now() - interval '12 months'
  ),
  stats as (
    select a.foyer_id, a.cle,
           (array_agg(a.libelle order by a.termine_le desc))[1] as libelle,
           count(distinct a.jour_achat)::int as n,
           min(a.jour_achat) as premier,
           max(a.jour_achat) as dernier,
           mode() within group (order by a.quantite) as quantite,
           mode() within group (order by a.unite) as unite,
           (array_agg(a.rayon_id order by a.termine_le desc))[1] as rayon_id
    from achats a
    group by a.foyer_id, a.cle
    having count(distinct a.jour_achat) >= 3
  ),
  calcul as (
    select s.*, greatest(1, round((s.dernier - s.premier)::numeric / (s.n - 1)))::int as intervalle
    from stats s
  )
  select c.foyer_id, c.cle, coalesce(pr.libelle, c.libelle), c.n, c.dernier, c.intervalle,
         coalesce(case when pi.maj_le > now() - interval '10 days' then pi.prochain_achat end,
                  c.dernier + c.intervalle),
         c.quantite, c.unite, coalesce(pr.rayon_id, c.rayon_id),
         case when pi.maj_le > now() - interval '10 days' then pi.phrase end
  from calcul c
  cross join j
  left join courses.produits pr on pr.foyer_id = c.foyer_id and pr.cle = c.cle
  left join courses.previsions_ia pi on pi.foyer_id = c.foyer_id and pi.cle = c.cle
  where c.intervalle >= 2
    and not coalesce(pr.masque, false)
    and not (coalesce(pi.ignorer, false) and pi.maj_le > now() - interval '10 days')
    -- À racheter : la date prévue est passée ou tombe demain…
    and coalesce(case when pi.maj_le > now() - interval '10 days' then pi.prochain_achat end,
                 c.dernier + c.intervalle) <= j.d + 1
    -- … sans être si loin qu'on ait sans doute arrêté d'en acheter.
    and j.d - c.dernier <= c.intervalle * 3
    -- Pas déjà sur une liste du foyer.
    and not exists (
      select 1 from courses.articles ar
      join courses.listes l2 on l2.id = ar.liste_id
      where l2.foyer_id = c.foyer_id and ar.etat <> 'caddie'
        and courses.cle_produit(ar.libelle) = c.cle
    )
  order by (j.d - c.dernier)::numeric / c.intervalle desc, c.n desc
  limit 12;
$$;
revoke all on function courses.a_racheter(date) from public, anon;
grant execute on function courses.a_racheter(date) to authenticated;

-- Historique d'achats du foyer pour l'affinage de l'assistant : produits
-- achetés au moins 3 jours différents sur les 12 derniers mois, dates
-- d'achat seulement (40 produits au plus). Listes du foyer seulement.
-- Fonction ordinaire (security invoker).
create or replace function courses.historique_prevision()
returns jsonb
language sql stable
set search_path = courses, famille, pg_temp
as $$
  with achats as (
    select pa.cle, pa.libelle, (p.termine_le at time zone 'Europe/Paris')::date as jour_achat, p.termine_le
    from courses.passage_articles pa
    join courses.passages p on p.id = pa.passage_id
    join courses.listes l on l.id = p.liste_id
    where l.portee = 'foyer'
      and l.foyer_id in (select famille.mes_foyers())
      and pa.cle is not null and pa.cle <> ''
      and p.termine_le > now() - interval '12 months'
  ),
  produits as (
    select a.cle,
           (array_agg(a.libelle order by a.termine_le desc))[1] as libelle,
           array_agg(distinct a.jour_achat order by a.jour_achat) as jours
    from achats a
    group by a.cle
    having count(distinct a.jour_achat) >= 3
    order by count(distinct a.jour_achat) desc
    limit 40
  )
  select coalesce(jsonb_agg(jsonb_build_object('cle', p.cle, 'libelle', p.libelle, 'achats', to_jsonb(p.jours))
                            order by p.libelle), '[]'::jsonb)
  from produits p
  left join courses.produits pr on pr.cle = p.cle and pr.foyer_id in (select famille.mes_foyers())
  where not coalesce(pr.masque, false);
$$;
revoke all on function courses.historique_prevision() from public, anon;
grant execute on function courses.historique_prevision() to authenticated;

-- -------------------------------------------------------------------------
-- 4. Faits du jour (§ 4.6.2)
-- -------------------------------------------------------------------------
-- Liste de faits DÉJÀ FILTRÉS et déjà rédigés, pour la personne connectée :
--   [{ "id": "f1", "module": "quotidien", "texte": "…", "cible": "quotidien/groupe/…" }]
-- Trajets du jour qui la concernent, tâches de la maison dues, aliments à
-- finir au congélateur, anniversaires dans moins de 15 jours (famille
-- active, sans les enfants masqués), voyages et repas à venir (famille
-- active), produits sans doute à racheter.
-- Fonction ordinaire (security invoker) : chaque lecture passe par les
-- règles RLS de la personne, comme dans l'app. Une rubrique en erreur
-- n'empêche pas les autres.
create or replace function famille.faits_du_jour(jour date default null)
returns jsonb
language plpgsql stable
set search_path = famille, pg_temp
as $$
declare
  d date := coalesce(jour, famille.aujourdhui_paris());
  faits jsonb := '[]'::jsonb;
  n int := 0;
  r record;
  texte text;
  taches json;
begin
  if auth.uid() is null then
    return faits;
  end if;

  -- Trajets du jour : ceux que je conduis, ceux de mes enfants, ceux sans
  -- conducteur dans mes groupes.
  begin
    for r in
      select t.id, t.sens, t.heure, t.conducteur_id, t.propose, a.nom, coalesce(s.lieu, a.lieu) as lieu,
             a.groupe_id, pc.nom_affiche as conducteur,
             t.conducteur_id in (select quotidien.mes_participants()) as moi,
             (select string_agg(e.prenom, ', ' order by e.prenom)
                from quotidien.trajet_enfants te join quotidien.enfants e on e.id = te.enfant_id
               where te.trajet_id = t.id) as enfants,
             exists (select 1 from quotidien.trajet_enfants te join quotidien.enfants e on e.id = te.enfant_id
                      where te.trajet_id = t.id and e.participant_id in (select quotidien.mes_participants())) as mes_enfants
      from quotidien.trajets t
      join quotidien.seances s on s.id = t.seance_id
      join quotidien.activites a on a.id = s.activite_id
      left join quotidien.participants pc on pc.id = t.conducteur_id
      where s.date = d and s.statut = 'prevue'
      order by t.heure
    loop
      continue when not (coalesce(r.moi, false) or r.mes_enfants or r.conducteur_id is null);
      exit when n >= 5;
      texte := to_char(r.heure, 'FMHH24"h"MI') || ' · ' || r.nom || ' (' || r.sens || ')'
        || coalesce(', ' || r.lieu, '') || ' : '
        || case
             when r.conducteur_id is null then 'conducteur à trouver'
             when r.moi and r.propose then 'le planning vous propose de conduire, à accepter'
             when r.moi then 'c''est vous qui conduisez'
             when r.propose then coalesce(r.conducteur, 'quelqu''un') || ' proposé, pas encore confirmé'
             else coalesce(r.conducteur, 'quelqu''un') || ' conduit'
           end
        || coalesce(' · enfants : ' || r.enfants, '');
      n := n + 1;
      faits := faits || jsonb_build_object('id', 'f' || n, 'module', 'quotidien', 'texte', texte,
                                           'cible', 'quotidien/groupe/' || r.groupe_id);
    end loop;
  exception when others then
    raise warning 'faits_du_jour (trajets) : %', sqlerrm;
  end;

  -- Tâches de la maison dues aujourd'hui, pas encore faites.
  begin
    taches := quotidien.taches_du_jour(d);
    select count(*) as nb, count(*) filter (where (x ->> 'en_retard')::boolean) as en_retard,
           string_agg(x ->> 'libelle', ', ') filter (where rang <= 3) as liste
      into r
      from (select x, row_number() over () as rang
              from json_array_elements(coalesce(taches, '[]'::json)) x
             where x -> 'realisation' is null or json_typeof(x -> 'realisation') = 'null') t;
    if r.nb > 0 then
      n := n + 1;
      faits := faits || jsonb_build_object(
        'id', 'f' || n, 'module', 'quotidien',
        'texte', r.nb || ' tâche' || case when r.nb > 1 then 's' else '' end
                 || ' de la maison aujourd''hui : ' || r.liste
                 || case when r.nb > 3 then '…' else '' end
                 || case when r.en_retard > 0 then ' (' || r.en_retard || ' en retard)' else '' end,
        'cible', 'quotidien/taches');
    end if;
  exception when others then
    raise warning 'faits_du_jour (tâches) : %', sqlerrm;
  end;

  -- Aliments à finir au congélateur (date conseillée dans moins de 14 jours
  -- ou passée ; mêmes durées que l'app Recettes).
  begin
    select count(*) as nb,
           string_agg(nom || case when limite < d then ' (date passée)'
                                  else ' (avant le ' || famille.date_en_clair(limite) || ')' end,
                      ', ' order by limite) filter (where rang <= 3) as liste
      into r
      from (
        select a.nom, x.limite, row_number() over (order by x.limite) as rang
        from recettes.congelateur_aliments a
        cross join lateral (
          select (a.date_stockage + make_interval(months => case a.type
            when 'viande' then 12 when 'porc' then 6 when 'hache' then 4 when 'volaille' then 9
            when 'poissonMaigre' then 6 when 'poissonGras' then 3 when 'plat' then 3
            when 'legumes' then 12 when 'pain' then 3 else 6 end))::date as limite
        ) x
        where x.limite <= d + 14
      ) t;
    if r.nb > 0 then
      n := n + 1;
      faits := faits || jsonb_build_object('id', 'f' || n, 'module', 'recettes',
        'texte', 'À finir au congélateur : ' || r.liste || case when r.nb > 3 then '…' else '' end,
        'cible', 'recettes/congelateur');
    end if;
  exception when others then
    raise warning 'faits_du_jour (congélateur) : %', sqlerrm;
  end;

  -- Anniversaires dans moins de 15 jours (famille active, sans les
  -- personnes masquées dans cette famille, sans moi).
  begin
    for r in
      select p.prenom, x.prochain, extract(year from x.prochain)::int - extract(year from p.date_naissance)::int as age
      from famille.personnes p
      cross join lateral (
        select case
          when (p.date_naissance + make_interval(years => extract(year from d)::int - extract(year from p.date_naissance)::int))::date >= d
            then (p.date_naissance + make_interval(years => extract(year from d)::int - extract(year from p.date_naissance)::int))::date
          else (p.date_naissance + make_interval(years => extract(year from d)::int + 1 - extract(year from p.date_naissance)::int))::date
        end as prochain
      ) x
      where p.date_naissance is not null
        and trim(p.prenom) <> ''
        and p.foyer_id in (select famille.foyers_famille_active())
        and p.id not in (select famille.personnes_masquees_famille_active())
        and p.utilisateur_id is distinct from auth.uid()
        and x.prochain <= d + 15
      order by x.prochain
      limit 3
    loop
      n := n + 1;
      faits := faits || jsonb_build_object('id', 'f' || n, 'module', 'cadeaux',
        'texte', 'Anniversaire de ' || r.prenom || ' ' || famille.dans_combien(r.prochain, d)
                 || case when r.prochain > d then ' (' || famille.date_en_clair(r.prochain) || ')' else '' end
                 || case when r.age between 1 and 120 then ', ' || r.age || ' ans' else '' end,
        'cible', 'cadeaux');
    end loop;
  exception when others then
    raise warning 'faits_du_jour (anniversaires) : %', sqlerrm;
  end;

  -- Voyages et repas de la famille active, en cours ou dans moins de 30
  -- jours (un voyage caché à la personne n'est pas visible : règles RLS).
  begin
    for r in
      select v.id, v.titre, v.nature, v.statut, v.date_debut, coalesce(v.date_fin, v.date_debut) as fin
      from voyage.voyages v
      where v.famille_id = famille.ma_famille()
        and v.statut in ('organisation', 'confirme')
        and v.date_debut is not null
        and coalesce(v.date_fin, v.date_debut) >= d
        and v.date_debut <= d + 30
      order by v.date_debut
      limit 2
    loop
      n := n + 1;
      faits := faits || jsonb_build_object('id', 'f' || n, 'module', 'voyages',
        'texte', case when r.nature = 'repas' then 'Repas de famille « ' else 'Voyage « ' end || r.titre || ' » '
                 || case
                      when r.date_debut <= d and r.fin > d then 'en cours, jusqu''au ' || famille.date_en_clair(r.fin)
                      when r.date_debut = d then 'aujourd''hui'
                      else famille.dans_combien(r.date_debut, d) || ' (' || famille.date_en_clair(r.date_debut) || ')'
                    end
                 || case when r.statut = 'confirme' then ', confirmé' else ', en préparation' end,
        'cible', 'voyages/voyage/' || r.id);
    end loop;
  exception when others then
    raise warning 'faits_du_jour (voyages) : %', sqlerrm;
  end;

  -- Produits sans doute à racheter (Courses).
  begin
    select count(*) as nb, string_agg(libelle, ', ') filter (where rang <= 3) as liste
      into r
      from (select ar.libelle, row_number() over () as rang from courses.a_racheter(d) ar) t;
    if r.nb > 0 then
      n := n + 1;
      faits := faits || jsonb_build_object('id', 'f' || n, 'module', 'courses',
        'texte', 'Sans doute à racheter : ' || r.liste || case when r.nb > 3 then '…' else '' end,
        'cible', 'courses');
    end if;
  exception when others then
    raise warning 'faits_du_jour (courses) : %', sqlerrm;
  end;

  return faits;
end;
$$;
revoke all on function famille.faits_du_jour(date) from public, anon;
grant execute on function famille.faits_du_jour(date) to authenticated;

-- -------------------------------------------------------------------------
-- 5. Lecture par l'app
-- -------------------------------------------------------------------------

-- Résumé du matin du jour, lu à l'ouverture de l'accueil. Note la visite
-- (le résumé de demain sera préparé cette nuit). Renvoie :
--   { "etat": "pret", "phrases": [...] }   résumé rédigé
--   { "etat": "attente" }                  préparé, en cours de rédaction
--   { "etat": "rien" }                     rien à dire aujourd'hui
--   { "etat": "absent" }                   rien de préparé (première visite)
create or replace function famille.resume_du_jour()
returns jsonb
language plpgsql security definer
set search_path = famille, pg_temp
as $$
declare
  moi uuid := auth.uid();
  d date := famille.aujourdhui_paris();
  resume famille.resumes_matin%rowtype;
  statut_travail text;
begin
  if moi is null then
    return jsonb_build_object('etat', 'absent');
  end if;
  insert into famille.resumes_demandes (utilisateur_id, derniere_vue) values (moi, now())
  on conflict (utilisateur_id) do update set derniere_vue = now();

  select * into resume from famille.resumes_matin where utilisateur_id = moi and jour = d;
  if found then
    return jsonb_build_object('etat', case when jsonb_array_length(resume.phrases) > 0 then 'pret' else 'rien' end,
                              'phrases', resume.phrases);
  end if;
  select t.statut into statut_travail from famille.ia_travaux t
  where t.nature = 'resume-matin' and t.utilisateur_id = moi and t.jour = d;
  return jsonb_build_object('etat', case
    when statut_travail in ('a_envoyer', 'envoye') then 'attente'
    when statut_travail in ('sans_objet', 'plafond', 'echec') then 'rien'
    else 'absent' end);
end;
$$;
revoke all on function famille.resume_du_jour() from public, anon;
grant execute on function famille.resume_du_jour() to authenticated;

-- -------------------------------------------------------------------------
-- 6. Préparation de nuit (pg_cron)
-- -------------------------------------------------------------------------
-- Pour chaque personne venue sur l'accueil ces 7 derniers jours : faits du
-- jour, calculés SOUS SON IDENTITÉ (rôle authenticated et son identifiant,
-- comme une requête de l'app : les règles RLS s'appliquent). Une fois par
-- semaine et par foyer : historique d'achats pour l'affinage des habituels,
-- sous l'identité d'un membre du foyer venu récemment.
-- La fonction Edge « ia-nuit » envoie ensuite ce travail à l'API Batches.
--
-- RÉSERVÉE au propriétaire de la base (pg_cron) : surtout pas « security
-- definer » (on ne peut pas changer de rôle dans une telle fonction), et
-- aucun droit d'exécution pour les rôles de l'API.
create or replace function famille.preparer_travaux_nuit()
returns jsonb
language plpgsql
set search_path = famille, pg_temp
as $$
declare
  d date := famille.aujourdhui_paris();
  u record;
  v_entree jsonb;
  nb_resumes int := 0;
  nb_habituels int := 0;
begin
  -- Résumés du matin.
  for u in
    select rd.utilisateur_id, m.foyer_id
    from famille.resumes_demandes rd
    join lateral (
      select fm.foyer_id from famille.foyer_membres fm
      where fm.utilisateur_id = rd.utilisateur_id
      order by fm.foyer_id limit 1
    ) m on true
    where rd.derniere_vue > now() - interval '7 days'
      and not exists (select 1 from famille.ia_travaux t
                      where t.nature = 'resume-matin' and t.utilisateur_id = rd.utilisateur_id and t.jour = d)
      and not exists (select 1 from famille.resumes_matin r where r.utilisateur_id = rd.utilisateur_id and r.jour = d)
  loop
    begin
      perform set_config('request.jwt.claims',
                         json_build_object('sub', u.utilisateur_id, 'role', 'authenticated')::text, true);
      perform set_config('request.jwt.claim.sub', u.utilisateur_id::text, true);
      perform set_config('request.jwt.claim.role', 'authenticated', true);
      set local role authenticated;
      v_entree := famille.faits_du_jour(d);
      reset role;
      insert into famille.ia_travaux (nature, foyer_id, utilisateur_id, jour, entree, statut, fini_le)
      values ('resume-matin', u.foyer_id, u.utilisateur_id, d, v_entree,
              case when jsonb_array_length(v_entree) = 0 then 'sans_objet' else 'a_envoyer' end,
              case when jsonb_array_length(v_entree) = 0 then now() end);
      nb_resumes := nb_resumes + 1;
    exception when others then
      raise warning 'Résumé du matin de % : %', u.utilisateur_id, sqlerrm;
    end;
  end loop;

  -- Affinage des habituels : une fois par semaine et par foyer.
  for u in
    select distinct on (m.foyer_id) m.foyer_id, rd.utilisateur_id
    from famille.resumes_demandes rd
    join famille.foyer_membres m on m.utilisateur_id = rd.utilisateur_id
    where rd.derniere_vue > now() - interval '7 days'
      and not exists (select 1 from famille.ia_travaux t
                      where t.nature = 'habituels' and t.foyer_id = m.foyer_id and t.jour > d - 7)
    order by m.foyer_id, rd.derniere_vue desc
  loop
    begin
      perform set_config('request.jwt.claims',
                         json_build_object('sub', u.utilisateur_id, 'role', 'authenticated')::text, true);
      perform set_config('request.jwt.claim.sub', u.utilisateur_id::text, true);
      perform set_config('request.jwt.claim.role', 'authenticated', true);
      set local role authenticated;
      v_entree := courses.historique_prevision();
      reset role;
      insert into famille.ia_travaux (nature, foyer_id, utilisateur_id, jour, entree, statut, fini_le)
      values ('habituels', u.foyer_id, null, d, v_entree,
              case when jsonb_array_length(v_entree) = 0 then 'sans_objet' else 'a_envoyer' end,
              case when jsonb_array_length(v_entree) = 0 then now() end);
      nb_habituels := nb_habituels + 1;
    exception when others then
      raise warning 'Habituels du foyer % : %', u.foyer_id, sqlerrm;
    end;
  end loop;

  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claim.role', '', true);

  -- Ménage : travail de plus de 30 jours, lots de plus de 30 jours,
  -- résumés de plus de 7 jours.
  delete from famille.ia_travaux where cree_le < now() - interval '30 days';
  delete from famille.ia_lots where cree_le < now() - interval '30 days';
  delete from famille.resumes_matin where jour < d - 7;

  return jsonb_build_object('resumes', nb_resumes, 'habituels', nb_habituels);
end;
$$;
revoke all on function famille.preparer_travaux_nuit() from public, anon, authenticated, service_role;

-- -------------------------------------------------------------------------
-- 7. Droits du serveur (fonction Edge « ia-nuit » et route « resume-matin »)
-- -------------------------------------------------------------------------
grant select, update on famille.ia_travaux to service_role;
grant select, insert, update on famille.ia_lots to service_role;
grant select, insert, update on famille.resumes_matin to service_role;
grant select, insert, update, delete on courses.previsions_ia to service_role;

commit;
