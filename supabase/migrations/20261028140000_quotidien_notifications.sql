-- =========================================================================
-- Migration — Quotidien : notifications de la refonte
--
-- Refonte Quotidien § 8. Elles arrivent dans Activité (famille.notifications)
-- et, selon le réglage de chacun, sur le téléphone (envoyer-notifications).
--
--   type                     quand                              pour qui
--   a_valider                l'enfant coche « J'ai fini »        adultes du foyer de l'enfant
--   bilan_semaine            dimanche 19 h                       adultes du foyer
--   bilan_relance            mardi 19 h si bilan non validé      adultes du foyer
--   trajet_sans_responsable  2 jours avant, à 18 h               adultes du foyer concerné
--
-- (rappel_tache et anniversaire : 20261028120000_quotidien_rappels_maison.sql.)
--
-- Les fonctions planifiées sont appelées à deux heures UTC et ne font
-- quelque chose qu'à la bonne heure de Paris (été comme hiver) :
-- supabase/planification_quotidien.sql. « forcer » sert aux essais à la main.
-- Rien n'est envoyé deux fois (quotidien.notifs_creees).
--
-- AJOUT SEULEMENT : un déclencheur qui ne lève JAMAIS d'erreur (en cas de
-- souci, la notification n'est pas créée et « J'ai fini » réussit), et des
-- fonctions réservées à la clé de service.
--
-- Pré-requis : 20261028110000 (bilans), 20261028120000 (notifier_une_fois),
-- 20261028130000 (responsable_id) et 20261021120000 (notifications).
-- =========================================================================

begin;

-- Une notification AVEC action pour tous les adultes d'un foyer, une seule
-- fois par clé.
create or replace function quotidien.notifier_foyer(
  cle_unique text, id_foyer uuid, type_notif text, texte text, chemin text, action_attendue text default null)
returns void
language plpgsql security definer
set search_path = quotidien, pg_temp
as $$
declare
  u uuid;
begin
  for u in select m.utilisateur_id from famille.foyer_membres m where m.foyer_id = id_foyer loop
    insert into quotidien.notifs_creees (cle) values (cle_unique || ':' || u) on conflict do nothing;
    if found then
      insert into famille.notifications (utilisateur_id, module, type, message, cible, action)
      values (u, 'quotidien', type_notif, left(texte, 300), chemin, action_attendue);
    end if;
  end loop;
end;
$$;
revoke all on function quotidien.notifier_foyer(text, uuid, text, text, text, text) from public, anon, authenticated;

-- -------------------------------------------------------------------------
-- 1. « J'ai fini » → les parents valident
-- -------------------------------------------------------------------------

create or replace function quotidien.notif_a_valider()
returns trigger
language plpgsql security definer
set search_path = quotidien, pg_temp
as $$
declare
  enfant record;
  libelle_tache text;
begin
  begin
    if new.etat <> 'faite' or new.personne_id is null then
      return null;
    end if;
    select p.foyer_id, coalesce(nullif(trim(p.prenom), ''), 'Un enfant') as prenom
      into enfant from famille.personnes p where p.id = new.personne_id;
    select t.libelle into libelle_tache from quotidien.taches t where t.id = new.tache_id;
    if enfant.foyer_id is not null then
      perform quotidien.notifier_foyer(
        'a_valider:' || new.id, enfant.foyer_id, 'a_valider',
        enfant.prenom || ' dit avoir fini : ' || coalesce(libelle_tache, 'une tâche'),
        'quotidien/argent-de-poche/' || new.personne_id, 'valider');
    end if;
  exception when others then
    raise warning 'notif_a_valider : %', sqlerrm;
  end;
  return null;
end;
$$;

drop trigger if exists famille_notif_a_valider on quotidien.realisations;
create trigger famille_notif_a_valider after insert on quotidien.realisations
  for each row execute function quotidien.notif_a_valider();

-- -------------------------------------------------------------------------
-- 2. Bilan du dimanche (19 h) et relance du mardi (19 h)
-- -------------------------------------------------------------------------

create or replace function quotidien.bilans_du_dimanche(forcer boolean default false)
returns void
language plpgsql security definer
set search_path = quotidien, pg_temp
as $$
declare
  maintenant timestamp := now() at time zone 'Europe/Paris';
  v_lundi date;
  f record;
  texte text;
begin
  if not forcer and (extract(isodow from maintenant) <> 7 or extract(hour from maintenant) <> 19) then
    return;
  end if;
  v_lundi := quotidien.lundi_de(maintenant::date);
  perform quotidien.preparer_bilans(v_lundi);

  for f in
    select b.foyer_id,
      string_agg(
        coalesce(nullif(trim(p.prenom), ''), 'Un enfant') || case
          when b.complete then ' ' || replace(to_char(b.montant_prevu / 100.0, 'FM999990D00'), '.', ',') || ' €'
          else ' à décider' end,
        ', ' order by p.prenom) as resume
    from quotidien.bilans b
    join famille.personnes p on p.id = b.personne_id
    where b.semaine = v_lundi and b.decision is null
    group by b.foyer_id
  loop
    perform quotidien.notifier_foyer(
      'bilan:' || f.foyer_id || ':' || v_lundi, f.foyer_id, 'bilan_semaine',
      'Le bilan de la semaine est prêt : ' || f.resume,
      'quotidien/bilan/' || v_lundi, 'valider');
  end loop;
end;
$$;

create or replace function quotidien.relancer_bilans(forcer boolean default false)
returns void
language plpgsql security definer
set search_path = quotidien, pg_temp
as $$
declare
  maintenant timestamp := now() at time zone 'Europe/Paris';
  v_lundi date;
  f record;
begin
  if not forcer and (extract(isodow from maintenant) <> 2 or extract(hour from maintenant) <> 19) then
    return;
  end if;
  -- Le bilan de la semaine qui vient de finir.
  v_lundi := quotidien.lundi_de(maintenant::date) - 7;
  for f in
    select distinct b.foyer_id from quotidien.bilans b where b.semaine = v_lundi and b.decision is null
  loop
    perform quotidien.notifier_foyer(
      'relance:' || f.foyer_id || ':' || v_lundi, f.foyer_id, 'bilan_relance',
      'Bilan de la semaine dernière à valider',
      'quotidien/bilan/' || v_lundi, 'valider');
  end loop;
end;
$$;

-- -------------------------------------------------------------------------
-- 3. Trajets sans personne, deux jours avant (18 h)
-- -------------------------------------------------------------------------

create or replace function quotidien.alerter_trajets_libres(forcer boolean default false)
returns void
language plpgsql security definer
set search_path = quotidien, pg_temp
as $$
declare
  maintenant timestamp := now() at time zone 'Europe/Paris';
  r record;
  jour_nom text;
begin
  if not forcer and extract(hour from maintenant) <> 18 then
    return;
  end if;
  for r in
    select t.id as trajet_id, t.sens, s.date, a.nom as activite, p.foyer_id,
      (select string_agg(e.prenom, ', ' order by e.prenom)
         from quotidien.trajet_enfants te join quotidien.enfants e on e.id = te.enfant_id
        where te.trajet_id = t.id and e.participant_id = p.id) as enfants
    from quotidien.trajets t
    join quotidien.seances s on s.id = t.seance_id
    join quotidien.activites a on a.id = s.activite_id
    join quotidien.participants p on p.groupe_id = a.groupe_id and p.parti_le is null and p.foyer_id is not null
    where s.date = maintenant::date + 2 and s.statut = 'prevue'
      and t.responsable_id is null and t.conducteur_id is null
      and exists (
        select 1 from quotidien.trajet_enfants te join quotidien.enfants e on e.id = te.enfant_id
        where te.trajet_id = t.id and e.participant_id = p.id)
  loop
    jour_nom := (array['dimanche','lundi','mardi','mercredi','jeudi','vendredi','samedi'])[extract(dow from r.date)::int + 1];
    perform quotidien.notifier_foyer(
      'trajet:' || r.trajet_id || ':' || r.foyer_id, r.foyer_id, 'trajet_sans_responsable',
      'Personne pour ' || case when r.sens = 'aller' then 'emmener ' else 'ramener ' end
        || coalesce(r.enfants, 'les enfants') || ' (' || r.activite || ') ' || jour_nom,
      'quotidien/activites', 'conduire');
  end loop;
end;
$$;

revoke all on function
  quotidien.bilans_du_dimanche(boolean),
  quotidien.relancer_bilans(boolean),
  quotidien.alerter_trajets_libres(boolean)
from public, anon, authenticated;
grant execute on function
  quotidien.bilans_du_dimanche(boolean),
  quotidien.relancer_bilans(boolean),
  quotidien.alerter_trajets_libres(boolean)
to service_role;

commit;
