-- =========================================================================
-- Migration — Quotidien, refonte (docs/refonte-quotidien.md § 9.1, suite) :
-- semaine d'un enfant, coups de main, bilan du dimanche, espace enfant.
--
-- DEUXIÈME PARTIE, après 20261028100000_quotidien_taches_enfants.sql.
-- Les notifications (a_valider, bilan_semaine, bilan_relance…) et les tâches
-- pg_cron (preparer_bilans le dimanche 19 h, relance le mardi) viennent dans
-- la migration suivante : elles dépendent de famille.notifier.
--
-- Règles : semaine du lundi au dimanche, heure de Paris ; dates calculées
-- côté base. AJOUT SEULEMENT : les fonctions existantes gardent leur nom et
-- leurs paramètres (taches_du_jour_foyer, marquer_faite, vue_enfant,
-- marquer_faite_enfant) ; elles gagnent des champs, jamais n'en perdent.
-- =========================================================================

begin;

-- -------------------------------------------------------------------------
-- 1. Outils
-- -------------------------------------------------------------------------

-- Lundi de la semaine d'une date.
create or replace function quotidien.lundi_de(d date)
returns date
language sql immutable
as $$
  select date_trunc('week', d::timestamp)::date;
$$;

-- -------------------------------------------------------------------------
-- 2. Tâches du jour : type ajouté, coups de main exclus
-- -------------------------------------------------------------------------

-- Copie de la version de 20261020120000 avec :
--   - 'type' et 'attribution' dans le résultat (l'écran Tâches filtre
--     type = 'maison') ;
--   - les coups de main n'y figurent plus (ils vivent dans semaine_enfant) ;
--   - une seule réalisation renvoyée par tâche (plusieurs enfants peuvent
--     avoir fait la même tâche « chacun » le même jour).
create or replace function quotidien.taches_du_jour_foyer(id_foyer uuid, jour date)
returns json
language sql stable security definer
set search_path = quotidien, pg_temp
as $$
  with miens as (select quotidien.personnes_du_foyer(id_foyer) as ids),
  candidates as (
    select t.*, o.k as occ_k, o.debut as occ_debut, o.fin as occ_fin, o.suivante as occ_suivante
    from quotidien.taches t
    left join lateral quotidien.occurrence_tache(t, jour) o on true
    where t.active and jour >= t.date_debut and t.type <> 'coup_de_main'
      and (t.foyer_id = id_foyer or t.personnes && quotidien.personnes_du_foyer(id_foyer))
  ),
  dues as (
    select c.*,
      case
        when cardinality(c.personnes) = 0 then null
        when cardinality(c.personnes) = 1 then c.personnes[1]
        when c.recurrence = 'annuelle' then c.personnes[1 + (c.occ_k % cardinality(c.personnes))]
        else c.personnes[1 + (
          ((jour - c.date_debut) / (case when c.recurrence = 'quotidienne' then 1 else 7 end))
          % cardinality(c.personnes))]
      end as pour
    from candidates c
    where
      (c.planif = 'libre' and (
        c.recurrence = 'quotidienne'
        or (c.recurrence = 'hebdomadaire' and extract(isodow from jour)::smallint = any (c.jours))
        or (c.recurrence = 'aucune' and not exists (
              select 1 from quotidien.realisations r where r.tache_id = c.id and r.date < jour))
      ))
      or (c.planif <> 'libre' and c.occ_debut is not null
        and c.occ_fin >= c.date_debut
        and not exists (
          select 1 from quotidien.realisations r
          where r.tache_id = c.id and r.date >= c.occ_debut and r.date < jour
            and (c.occ_suivante is null or r.date < c.occ_suivante))
        and (jour <= c.occ_fin or jour <= current_date))
  ),
  visibles as (
    select d.* from dues d, miens m
    where d.foyer_id = id_foyer or d.pour is null or d.pour = any (m.ids)
  )
  select coalesce(json_agg(json_build_object(
    'id', d.id, 'libelle', d.libelle, 'points', d.points, 'recurrence', d.recurrence,
    'type', d.type, 'attribution', d.attribution,
    'pour', d.pour,
    'pour_prenom', (select nullif(trim(p.prenom), '') from famille.personnes p where p.id = d.pour),
    'candidats', d.personnes,
    'domaine_id', d.domaine_id,
    'domaine', (select dm.nom from quotidien.domaines dm where dm.id = d.domaine_id),
    'domaine_icone', (select dm.icone from quotidien.domaines dm where dm.id = d.domaine_id),
    'planif', d.planif,
    'debut', d.occ_debut,
    'fin', d.occ_fin,
    'en_retard', (d.planif <> 'libre' and jour > d.occ_fin
                  and not exists (select 1 from quotidien.realisations r where r.tache_id = d.id and r.date = jour)),
    'realisation', (
      select json_build_object('id', r.id, 'etat', r.etat, 'personne_id', r.personne_id,
                               'prenom', (select nullif(trim(p.prenom), '') from famille.personnes p where p.id = r.personne_id))
      from quotidien.realisations r where r.tache_id = d.id and r.date = jour
      order by r.cree_le limit 1),
    'foyer_id', d.foyer_id,
    'confiee', d.foyer_id <> id_foyer,
    'foyer_nom', case when d.foyer_id <> id_foyer then (select f.nom from famille.foyers f where f.id = d.foyer_id) end
  ) order by (d.planif <> 'libre' and jour > d.occ_fin) desc, d.occ_fin nulls last, d.libelle), '[]'::json)
  from visibles d;
$$;

-- -------------------------------------------------------------------------
-- 3. Cocher à la place de l'enfant : rattrapage encadré
-- -------------------------------------------------------------------------

-- Version de 20261020120000 + une règle : on ne rattrape plus une semaine
-- dont le bilan est déjà validé (refonte § 12).
create or replace function quotidien.marquer_faite(id_tache uuid, jour date, id_personne uuid)
returns uuid
language plpgsql security definer
set search_path = quotidien, pg_temp
as $$
declare
  t quotidien.taches;
  r uuid;
  a_moi boolean;
  miens uuid[] := array(select quotidien.personnes_de_mon_foyer());
begin
  select * into t from quotidien.taches
  where id = id_tache and (foyer_id in (select famille.mes_foyers()) or personnes && miens);
  if t.id is null then
    raise exception 'Tâche introuvable';
  end if;
  a_moi := t.foyer_id in (select famille.mes_foyers());
  if id_personne is null
     or (a_moi and not (id_personne = any (miens) or id_personne = any (t.personnes)))
     or (not a_moi and not (id_personne = any (miens) and id_personne = any (t.personnes))) then
    raise exception 'Choisissez qui a fait la tâche';
  end if;
  if jour > current_date then
    raise exception 'On ne peut pas cocher une tâche à l''avance';
  end if;
  if t.type <> 'maison' and exists (
    select 1 from quotidien.bilans b
    where b.personne_id = id_personne and b.semaine = quotidien.lundi_de(jour) and b.decision is not null
  ) then
    raise exception 'Le bilan de cette semaine est déjà validé';
  end if;
  begin
    insert into quotidien.realisations (tache_id, date, personne_id, etat, cochee_par, validee_par)
    values (id_tache, jour, id_personne, 'validee', auth.uid(), auth.uid())
    returning id into r;
  exception when unique_violation then
    raise exception 'Cette tâche est déjà faite';
  end;
  if t.points > 0 and exists (select 1 from famille.personnes p where p.id = id_personne and p.foyer_id = t.foyer_id) then
    insert into quotidien.mouvements (personne_id, points, libelle, origine, realisation_id, cree_par)
    values (id_personne, t.points, 'Tâche : ' || t.libelle, 'tache', r, auth.uid());
  end if;
  return r;
end;
$$;

-- -------------------------------------------------------------------------
-- 4. La semaine d'un enfant
-- -------------------------------------------------------------------------

-- Calcul sans contrôle d'accès (appelé par les fonctions publiques ci-dessous
-- et par le bilan). Jamais accordé à un rôle.
-- { personne_id, prenom, lundi, dimanche, aujourdhui, montant (centimes),
--   statut ('complete' | 'incomplete' | 'a_surveiller' | 'en_bonne_voie'),
--   complete, obligatoires: [{ id, libelle, validation_parent,
--     jours: [{ date, etat: fait | attente | a_faire | a_venir | non_prevu | oublie,
--               realisation_id }] }],
--   coups_de_main: [{ id, libelle, n, total, en_attente, max_un_par_jour,
--                     fait_aujourdhui, validation_parent }],
--   en_attente: [{ realisation_id, tache_id, libelle, type, date, cree_le }],
--   obligatoires_prevues, obligatoires_faites, aides_prevues, aides_faites,
--   oublies, reste_obligatoires_aujourdhui, reste_aides, manquant: [texte] }
create or replace function quotidien.semaine_enfant_interne(id_personne uuid, v_lundi date)
returns jsonb
language plpgsql stable security definer
set search_path = quotidien, pg_temp
as $$
declare
  noms_jours constant text[] := array['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];
  v_foyer uuid;
  v_auj date := quotidien.aujourd_hui_paris();
  v_dim date := v_lundi + 6;
  t record;
  v_j int;
  v_d date;
  v_etat text;
  v_rid uuid;
  v_retat text;
  v_jours jsonb;
  v_obl jsonb := '[]'::jsonb;
  v_aid jsonb := '[]'::jsonb;
  v_manquant jsonb := '[]'::jsonb;
  v_ob_prevues int := 0;
  v_ob_faites int := 0;
  v_ai_prevues int := 0;
  v_ai_faites int := 0;
  v_oublies int := 0;
  v_reste_auj int := 0;
  v_aides_restantes int := 0;
  v_n int;
  v_att int;
  v_auj_fait boolean;
  v_complete boolean;
  v_statut text;
  v_jours_restants int;
  v_montant int;
  v_attente jsonb;
begin
  select foyer_id into v_foyer from famille.personnes where id = id_personne;

  -- Obligatoires : une case par jour de la semaine.
  for t in
    select * from quotidien.taches
    where active and type = 'obligatoire' and foyer_id = v_foyer and id_personne = any (personnes)
    order by libelle
  loop
    v_jours := '[]'::jsonb;
    for v_j in 0..6 loop
      v_d := v_lundi + v_j;
      v_rid := null;
      if not (extract(isodow from v_d)::smallint = any (t.jours)) or v_d < t.date_debut then
        v_etat := 'non_prevu';
      else
        v_ob_prevues := v_ob_prevues + 1;
        select r.id, r.etat into v_rid, v_retat
        from quotidien.realisations r
        where r.tache_id = t.id and r.date = v_d and r.personne_id = id_personne
        order by r.numero limit 1;
        if v_rid is not null then
          if v_retat = 'validee' then
            v_etat := 'fait';
            v_ob_faites := v_ob_faites + 1;
          else
            v_etat := 'attente';
          end if;
        elsif v_d = v_auj then
          v_etat := 'a_faire';
          v_reste_auj := v_reste_auj + 1;
        elsif v_d > v_auj then
          v_etat := 'a_venir';
        else
          v_etat := 'oublie';
          v_oublies := v_oublies + 1;
          v_manquant := v_manquant || to_jsonb(t.libelle || ' : oublié ' || noms_jours[v_j + 1]);
        end if;
      end if;
      v_jours := v_jours || jsonb_build_array(jsonb_build_object('date', v_d, 'etat', v_etat, 'realisation_id', v_rid));
    end loop;
    v_obl := v_obl || jsonb_build_array(jsonb_build_object(
      'id', t.id, 'libelle', t.libelle, 'validation_parent', t.validation_parent, 'jours', v_jours));
  end loop;

  -- Coups de main : N réalisations validées dans la semaine. Compte à partir
  -- de la semaine de date_debut (le formulaire choisit lundi prochain ou
  -- « dès cette semaine »).
  for t in
    select * from quotidien.taches
    where active and type = 'coup_de_main' and foyer_id = v_foyer and id_personne = any (personnes)
      and date_debut <= v_lundi
    order by libelle
  loop
    select count(*) filter (where r.etat = 'validee'),
           count(*) filter (where r.etat = 'faite'),
           coalesce(bool_or(r.date = v_auj), false)
      into v_n, v_att, v_auj_fait
    from quotidien.realisations r
    where r.tache_id = t.id and r.personne_id = id_personne and r.date between v_lundi and v_dim;
    v_ai_prevues := v_ai_prevues + t.fois_par_semaine;
    v_ai_faites := v_ai_faites + least(v_n, t.fois_par_semaine);
    v_aides_restantes := v_aides_restantes + greatest(0, t.fois_par_semaine - v_n);
    if v_n < t.fois_par_semaine then
      v_manquant := v_manquant || to_jsonb(t.libelle || ' : ' || v_n || ' sur ' || t.fois_par_semaine);
    end if;
    v_aid := v_aid || jsonb_build_array(jsonb_build_object(
      'id', t.id, 'libelle', t.libelle, 'n', v_n, 'total', t.fois_par_semaine, 'en_attente', v_att,
      'max_un_par_jour', t.max_un_par_jour, 'fait_aujourdhui', v_auj_fait,
      'validation_parent', t.validation_parent));
  end loop;

  v_complete := (v_ob_prevues + v_ai_prevues) > 0 and v_ob_faites = v_ob_prevues and v_ai_faites = v_ai_prevues;

  if v_complete then
    v_statut := 'complete';
  elsif v_oublies > 0 or v_dim < v_auj then
    v_statut := 'incomplete';
  elsif v_lundi > v_auj then
    v_statut := 'en_bonne_voie';
  else
    -- Jours restants, aujourd'hui compris.
    v_jours_restants := v_dim - greatest(v_auj, v_lundi) + 1;
    if v_aides_restantes > v_jours_restants or v_aides_restantes > 2 then
      v_statut := 'a_surveiller';
    else
      v_statut := 'en_bonne_voie';
    end if;
  end if;

  select hebdomadaire into v_montant from quotidien.tirelires where personne_id = id_personne;

  select coalesce(jsonb_agg(jsonb_build_object(
    'realisation_id', r.id, 'tache_id', t2.id, 'libelle', t2.libelle, 'type', t2.type,
    'date', r.date, 'cree_le', r.cree_le) order by r.cree_le), '[]'::jsonb)
  into v_attente
  from quotidien.realisations r
  join quotidien.taches t2 on t2.id = r.tache_id
  where r.personne_id = id_personne and r.etat = 'faite'
    and t2.type <> 'maison' and r.date between v_lundi and v_dim;

  return jsonb_build_object(
    'personne_id', id_personne,
    'prenom', (select nullif(trim(prenom), '') from famille.personnes where id = id_personne),
    'lundi', v_lundi, 'dimanche', v_dim, 'aujourdhui', v_auj,
    'montant', coalesce(v_montant, 0),
    'statut', v_statut, 'complete', v_complete,
    'obligatoires', v_obl, 'coups_de_main', v_aid, 'en_attente', v_attente,
    'obligatoires_prevues', v_ob_prevues, 'obligatoires_faites', v_ob_faites,
    'aides_prevues', v_ai_prevues, 'aides_faites', v_ai_faites,
    'oublies', v_oublies,
    'reste_obligatoires_aujourdhui', v_reste_auj, 'reste_aides', v_aides_restantes,
    'manquant', v_manquant
  );
end;
$$;

-- Pour un parent : la semaine d'un enfant de mon foyer.
create or replace function quotidien.semaine_enfant(id_personne uuid, lundi date default null)
returns json
language plpgsql stable security definer
set search_path = quotidien, pg_temp
as $$
begin
  if id_personne not in (select quotidien.personnes_de_mon_foyer()) then
    raise exception 'Cette personne ne fait pas partie de votre foyer';
  end if;
  return quotidien.semaine_enfant_interne(
    id_personne, quotidien.lundi_de(coalesce(lundi, quotidien.aujourd_hui_paris()))
  )::json;
end;
$$;

-- -------------------------------------------------------------------------
-- 5. Cocher un coup de main
-- -------------------------------------------------------------------------

-- Contrôles et insertion communs aux deux versions (parent / espace enfant).
create or replace function quotidien.ajouter_aide(
  t quotidien.taches, id_personne uuid, v_jour date, v_etat text, par uuid)
returns uuid
language plpgsql security definer
set search_path = quotidien, pg_temp
as $$
declare
  v_lundi date := quotidien.lundi_de(v_jour);
  v_total int;
  v_numero smallint;
  r uuid;
begin
  if t.type <> 'coup_de_main' or not (id_personne = any (t.personnes)) or not t.active then
    raise exception 'Ce coup de main n''est pas pour cette personne';
  end if;
  select count(*) into v_total from quotidien.realisations x
  where x.tache_id = t.id and x.personne_id = id_personne and x.date between v_lundi and v_lundi + 6;
  if v_total >= t.fois_par_semaine then
    raise exception 'C''est déjà bon pour la semaine';
  end if;
  select coalesce(max(x.numero), 0) + 1 into v_numero from quotidien.realisations x
  where x.tache_id = t.id and x.personne_id = id_personne and x.date = v_jour;
  if t.max_un_par_jour and v_numero > 1 then
    raise exception 'Déjà fait ce jour-là';
  end if;
  insert into quotidien.realisations (tache_id, date, personne_id, etat, cochee_par, validee_par, numero)
  values (t.id, v_jour, id_personne, v_etat, par, case when v_etat = 'validee' then par end, v_numero)
  returning id into r;
  return r;
end;
$$;

-- Un parent ajoute un coup de main fait par un enfant de son foyer (validé tout de suite).
create or replace function quotidien.marquer_aide(id_tache uuid, id_personne uuid, jour date)
returns uuid
language plpgsql security definer
set search_path = quotidien, pg_temp
as $$
declare
  t quotidien.taches;
begin
  select * into t from quotidien.taches where id = id_tache and foyer_id in (select famille.mes_foyers());
  if t.id is null then
    raise exception 'Tâche introuvable';
  end if;
  if id_personne is null or id_personne not in (select quotidien.personnes_de_mon_foyer()) then
    raise exception 'Choisissez qui a fait la tâche';
  end if;
  if jour > quotidien.aujourd_hui_paris() then
    raise exception 'On ne peut pas cocher une tâche à l''avance';
  end if;
  if exists (select 1 from quotidien.bilans b
             where b.personne_id = id_personne and b.semaine = quotidien.lundi_de(jour) and b.decision is not null) then
    raise exception 'Le bilan de cette semaine est déjà validé';
  end if;
  return quotidien.ajouter_aide(t, id_personne, jour, 'validee', auth.uid());
end;
$$;

-- « J'en ai fait un » dans l'espace enfant : à valider si un parent doit valider.
create or replace function quotidien.marquer_aide_enfant(jeton_enfant uuid, id_tache uuid)
returns void
language plpgsql security definer
set search_path = quotidien, pg_temp
as $$
declare
  e uuid := quotidien.enfant_du_jeton(jeton_enfant);
  t quotidien.taches;
begin
  if e is null then
    raise exception 'Lien invalide ou expiré';
  end if;
  select tt.* into t from quotidien.taches tt
  where tt.id = id_tache and tt.foyer_id = (select foyer_id from famille.personnes where id = e);
  if t.id is null then
    raise exception 'Cette tâche n''est pas pour toi';
  end if;
  perform quotidien.ajouter_aide(t, e, quotidien.aujourd_hui_paris(),
    case when t.validation_parent then 'faite' else 'validee' end, null);
end;
$$;

-- -------------------------------------------------------------------------
-- 6. Espace enfant (lien) : tâches du jour et semaine
-- -------------------------------------------------------------------------

-- Ajoute 'semaine' (semaine_enfant_interne) et 'montant_semaine'. Les tâches
-- « obligatoires » (attribution « chacun ») restent dans 'taches' avec la
-- réalisation DE CET ENFANT, pour que l'ancienne app continue de les voir.
create or replace function quotidien.vue_enfant(jeton_enfant uuid)
returns json
language plpgsql stable security definer
set search_path = quotidien, pg_temp
as $$
declare
  e uuid := quotidien.enfant_du_jeton(jeton_enfant);
  f uuid;
  jour date := quotidien.aujourd_hui_paris();
begin
  if e is null then
    raise exception 'Lien invalide ou expiré';
  end if;
  select foyer_id into f from famille.personnes where id = e;
  return json_build_object(
    'prenom', (select nullif(trim(prenom), '') from famille.personnes where id = e),
    'points_par_euro', coalesce((select points_par_euro from quotidien.reglages_foyer where foyer_id = f), 100),
    'taches', coalesce((
      select json_agg(
        case when x->>'type' = 'obligatoire' then
          (x || jsonb_build_object(
            'pour', e,
            'pour_prenom', (select nullif(trim(prenom), '') from famille.personnes where id = e),
            'realisation', (
              select jsonb_build_object('id', r.id, 'etat', r.etat, 'personne_id', r.personne_id)
              from quotidien.realisations r
              where r.tache_id = (x->>'id')::uuid and r.date = jour and r.personne_id = e
              order by r.numero limit 1)))::json
        else x::json end)
      from jsonb_array_elements(quotidien.taches_du_jour_foyer(f, jour)::jsonb) x
      where (x->>'type' = 'obligatoire' and x->'candidats' ? e::text)
         or (coalesce(x->>'type', 'maison') <> 'obligatoire'
             and (x->>'pour' = e::text
                  or (x->>'pour' is null and (jsonb_array_length(x->'candidats') = 0 or x->'candidats' ? e::text))))
    ), '[]'::json),
    'solde', coalesce((select sum(points) from quotidien.mouvements where personne_id = e), 0),
    'hebdomadaire', (select hebdomadaire from quotidien.tirelires where personne_id = e),
    'montant_semaine', coalesce((select hebdomadaire from quotidien.tirelires where personne_id = e), 0),
    'objectif_libelle', (select objectif_libelle from quotidien.tirelires where personne_id = e),
    'objectif_points', (select objectif_points from quotidien.tirelires where personne_id = e),
    'semaine', quotidien.semaine_enfant_interne(e, quotidien.lundi_de(jour)),
    'mouvements', coalesce((
      select json_agg(json_build_object('id', m.id, 'points', m.points, 'libelle', m.libelle, 'cree_le', m.cree_le)
                      order by m.cree_le desc)
      from (select * from quotidien.mouvements where personne_id = e order by cree_le desc limit 10) m
    ), '[]'::json)
  );
end;
$$;

-- « J'ai fini » : accepte aussi les obligatoires « chacun » de cet enfant.
create or replace function quotidien.marquer_faite_enfant(jeton_enfant uuid, id_tache uuid)
returns void
language plpgsql security definer
set search_path = quotidien, pg_temp
as $$
declare
  e uuid := quotidien.enfant_du_jeton(jeton_enfant);
  jour date := quotidien.aujourd_hui_paris();
  f uuid;
  t quotidien.taches;
begin
  if e is null then
    raise exception 'Lien invalide ou expiré';
  end if;
  select foyer_id into f from famille.personnes where id = e;
  if not exists (
    select 1 from jsonb_array_elements(quotidien.taches_du_jour_foyer(f, jour)::jsonb) x
    where x->>'id' = id_tache::text
      and (
        (x->>'type' = 'obligatoire' and x->'candidats' ? e::text)
        or (coalesce(x->>'type', 'maison') <> 'obligatoire'
            and (x->>'pour' = e::text
                 or (x->>'pour' is null and (jsonb_array_length(x->'candidats') = 0 or x->'candidats' ? e::text))))
      )
  ) then
    raise exception 'Cette tâche n''est pas pour toi aujourd''hui';
  end if;
  select * into t from quotidien.taches where id = id_tache;
  begin
    insert into quotidien.realisations (tache_id, date, personne_id, etat)
    values (id_tache, jour, e, case when t.type <> 'maison' and not t.validation_parent then 'validee' else 'faite' end);
  exception when unique_violation then
    raise exception 'Cette tâche est déjà faite';
  end;
end;
$$;

-- -------------------------------------------------------------------------
-- 7. Bilan de la semaine
-- -------------------------------------------------------------------------

-- Calcule (ou recalcule, tant que rien n'est décidé) les bilans d'un foyer.
create or replace function quotidien.preparer_bilans_foyer(id_foyer uuid, v_lundi date)
returns integer
language plpgsql security definer
set search_path = quotidien, pg_temp
as $$
declare
  p uuid;
  s jsonb;
  n integer := 0;
begin
  for p in
    select personne_id from quotidien.tirelires where foyer_id = id_foyer and hebdomadaire > 0
  loop
    s := quotidien.semaine_enfant_interne(p, v_lundi);
    -- Sans aucune tâche cette semaine-là : pas de bilan.
    continue when (s->>'obligatoires_prevues')::int + (s->>'aides_prevues')::int = 0;
    insert into quotidien.bilans (
      personne_id, semaine, foyer_id, obligatoires_prevues, obligatoires_faites,
      aides_prevues, aides_faites, complete, montant_prevu)
    values (
      p, v_lundi, id_foyer, (s->>'obligatoires_prevues')::int, (s->>'obligatoires_faites')::int,
      (s->>'aides_prevues')::int, (s->>'aides_faites')::int, (s->>'complete')::boolean, (s->>'montant')::int)
    on conflict (personne_id, semaine) do update set
      obligatoires_prevues = excluded.obligatoires_prevues, obligatoires_faites = excluded.obligatoires_faites,
      aides_prevues = excluded.aides_prevues, aides_faites = excluded.aides_faites,
      complete = excluded.complete, montant_prevu = excluded.montant_prevu
    where quotidien.bilans.decision is null;
    n := n + 1;
  end loop;
  return n;
end;
$$;

-- Tous les foyers (planifié le dimanche à 19 h par la migration suivante).
create or replace function quotidien.preparer_bilans(lundi date default null)
returns integer
language plpgsql security definer
set search_path = quotidien, pg_temp
as $$
declare
  v_lundi date := coalesce(lundi, quotidien.lundi_de(quotidien.aujourd_hui_paris()));
  f uuid;
  n integer := 0;
begin
  for f in select distinct foyer_id from quotidien.tirelires where hebdomadaire > 0 loop
    n := n + quotidien.preparer_bilans_foyer(f, v_lundi);
  end loop;
  return n;
end;
$$;

-- Pour BilanScreen : { lundi, dimanche, bilans: [...], en_attente: [...], a_verser }.
create or replace function quotidien.bilan_semaine(lundi date)
returns json
language plpgsql security definer
set search_path = quotidien, pg_temp
as $$
declare
  f uuid := quotidien.mon_foyer();
  v_lundi date := quotidien.lundi_de(lundi);
begin
  if f is null then
    raise exception 'Créez ou rejoignez d''abord votre foyer';
  end if;
  perform quotidien.preparer_bilans_foyer(f, v_lundi);
  return json_build_object(
    'lundi', v_lundi,
    'dimanche', v_lundi + 6,
    'bilans', coalesce((
      select json_agg(json_build_object(
        'personne_id', b.personne_id,
        'prenom', (select nullif(trim(p.prenom), '') from famille.personnes p where p.id = b.personne_id),
        'complete', b.complete,
        'montant_prevu', b.montant_prevu,
        'obligatoires_prevues', b.obligatoires_prevues, 'obligatoires_faites', b.obligatoires_faites,
        'aides_prevues', b.aides_prevues, 'aides_faites', b.aides_faites,
        'manquant', quotidien.semaine_enfant_interne(b.personne_id, v_lundi)->'manquant',
        'decision', b.decision, 'montant_verse', b.montant_verse, 'decide_le', b.decide_le,
        'annulable', b.decision is not null and b.decide_le > now() - interval '24 hours'
      ) order by (select p.prenom from famille.personnes p where p.id = b.personne_id))
      from quotidien.bilans b where b.foyer_id = f and b.semaine = v_lundi
    ), '[]'::json),
    'en_attente', coalesce((
      select json_agg(x) from (
        select jsonb_array_elements(quotidien.semaine_enfant_interne(b.personne_id, v_lundi)->'en_attente')
               || jsonb_build_object('personne_id', b.personne_id,
                    'prenom', (select nullif(trim(p.prenom), '') from famille.personnes p where p.id = b.personne_id)) as x
        from quotidien.bilans b where b.foyer_id = f and b.semaine = v_lundi
      ) q
    ), '[]'::json),
    'a_verser', coalesce((
      select sum(b.montant_prevu) from quotidien.bilans b
      where b.foyer_id = f and b.semaine = v_lundi and b.decision is null and b.complete
    ), 0)
  );
end;
$$;

-- decisions = { "<personne_id>": "verse" | "non_verse" }. Sans choix : semaine
-- complète → verse ; incomplète → non_verse.
create or replace function quotidien.valider_bilan(lundi date, decisions jsonb default '{}'::jsonb)
returns void
language plpgsql security definer
set search_path = quotidien, pg_temp
as $$
declare
  f uuid := quotidien.mon_foyer();
  v_lundi date := quotidien.lundi_de(lundi);
  b quotidien.bilans;
  v_choix text;
  v_mvt uuid;
begin
  if f is null then
    raise exception 'Créez ou rejoignez d''abord votre foyer';
  end if;
  if quotidien.aujourd_hui_paris() < v_lundi + 6 then
    raise exception 'Le bilan se valide à partir du dimanche';
  end if;
  perform quotidien.preparer_bilans_foyer(f, v_lundi);
  if exists (
    select 1 from quotidien.realisations r
    join quotidien.taches t on t.id = r.tache_id
    join quotidien.bilans bb on bb.personne_id = r.personne_id and bb.semaine = v_lundi
    where bb.foyer_id = f and r.etat = 'faite' and t.type <> 'maison'
      and r.date between v_lundi and v_lundi + 6
  ) then
    raise exception 'Validez ou refusez d''abord les tâches en attente';
  end if;
  for b in select * from quotidien.bilans where foyer_id = f and semaine = v_lundi and decision is null for update loop
    v_choix := coalesce(decisions->>(b.personne_id::text), case when b.complete then 'verse' else 'non_verse' end);
    if v_choix not in ('verse', 'non_verse') then
      raise exception 'Décision inconnue';
    end if;
    v_mvt := null;
    if v_choix = 'verse' and b.montant_prevu > 0 then
      insert into quotidien.mouvements (personne_id, points, libelle, origine, cree_par, cree_le)
      values (b.personne_id, b.montant_prevu,
              'Argent de poche, semaine du ' || to_char(v_lundi, 'DD/MM'), 'hebdo', auth.uid(),
              ((v_lundi + 6)::timestamp + interval '19 hours') at time zone 'Europe/Paris')
      returning id into v_mvt;
    end if;
    update quotidien.bilans set
      decision = v_choix,
      montant_verse = case when v_choix = 'verse' then b.montant_prevu else 0 end,
      mouvement_id = v_mvt, decide_par = auth.uid(), decide_le = now()
    where personne_id = b.personne_id and semaine = b.semaine;
  end loop;
end;
$$;

-- Annuler le bilan dans les 24 h : retire les mouvements créés.
create or replace function quotidien.annuler_bilan(lundi date)
returns void
language plpgsql security definer
set search_path = quotidien, pg_temp
as $$
declare
  f uuid := quotidien.mon_foyer();
  v_lundi date := quotidien.lundi_de(lundi);
begin
  if not exists (
    select 1 from quotidien.bilans
    where foyer_id = f and semaine = v_lundi and decision is not null and decide_le > now() - interval '24 hours'
  ) then
    raise exception 'Ce bilan ne peut plus être annulé';
  end if;
  delete from quotidien.mouvements
  where id in (
    select mouvement_id from quotidien.bilans
    where foyer_id = f and semaine = v_lundi and mouvement_id is not null and decide_le > now() - interval '24 hours');
  update quotidien.bilans set decision = null, montant_verse = null, mouvement_id = null,
                              decide_par = null, decide_le = null
  where foyer_id = f and semaine = v_lundi and decide_le > now() - interval '24 hours';
end;
$$;

-- -------------------------------------------------------------------------
-- 8. Droits
-- -------------------------------------------------------------------------

revoke execute on function
  quotidien.lundi_de(date),
  quotidien.semaine_enfant_interne(uuid, date),
  quotidien.semaine_enfant(uuid, date),
  quotidien.ajouter_aide(quotidien.taches, uuid, date, text, uuid),
  quotidien.marquer_aide(uuid, uuid, date), quotidien.marquer_aide_enfant(uuid, uuid),
  quotidien.preparer_bilans_foyer(uuid, date), quotidien.preparer_bilans(date),
  quotidien.bilan_semaine(date), quotidien.valider_bilan(date, jsonb), quotidien.annuler_bilan(date)
from public;

grant execute on function
  quotidien.semaine_enfant(uuid, date), quotidien.marquer_aide(uuid, uuid, date),
  quotidien.bilan_semaine(date), quotidien.valider_bilan(date, jsonb), quotidien.annuler_bilan(date)
to authenticated;
grant execute on function quotidien.marquer_aide_enfant(uuid, uuid) to anon, authenticated;
grant execute on function quotidien.preparer_bilans(date) to service_role;

notify pgrst, 'reload schema';

commit;
