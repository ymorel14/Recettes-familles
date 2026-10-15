-- =========================================================================
-- Migration — Quotidien : rappels de la veille sur téléphone
--
-- Chaque soir, la fonction Edge "rappels-veille" envoie une notification :
--   - au conducteur d'un trajet du lendemain (« Demain, c'est vous qui
--     conduisez ») : tous les téléphones des membres de son foyer ;
--   - pour un trajet du lendemain SANS conducteur : tous les téléphones des
--     foyers membres du groupe (« qui peut le prendre ? »).
-- Les parents invités sans compte n'ont pas de téléphone inscrit : ils ne
-- reçoivent rien (lien seulement).
--
-- Tables :
--   - appareils : jetons de notification Expo des téléphones, inscrits par
--     l'app (quotidien.enregistrer_appareil) ; chacun ne voit que les siens ;
--   - rappels_envoyes : ce qui est déjà parti (un rappel par trajet et par
--     genre), lu et écrit par la clé de service seulement.
--
-- Pré-requis : migration 20261007120000_quotidien.
-- =========================================================================

begin;

create table quotidien.appareils (
  -- Jeton Expo (« ExponentPushToken[…] »), unique par téléphone et par app.
  jeton text primary key check (jeton like 'ExponentPushToken[%' or jeton like 'ExpoPushToken[%'),
  utilisateur_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  plateforme text check (plateforme in ('ios', 'android')),
  maj_le timestamptz not null default now()
);
create index appareils_utilisateur on quotidien.appareils (utilisateur_id);

create table quotidien.rappels_envoyes (
  trajet_id uuid not null references quotidien.trajets (id) on delete cascade,
  genre text not null check (genre in ('conducteur', 'sans_conducteur')),
  envoye_le timestamptz not null default now(),
  primary key (trajet_id, genre)
);

alter table quotidien.appareils enable row level security;
alter table quotidien.rappels_envoyes enable row level security;

create policy "Voir ses téléphones" on quotidien.appareils
  for select using (utilisateur_id = auth.uid());
create policy "Retirer ses téléphones" on quotidien.appareils
  for delete using (utilisateur_id = auth.uid());
-- Inscription par la fonction enregistrer_appareil (un téléphone passé
-- d'un compte à un autre change de propriétaire).
grant select, delete on quotidien.appareils to authenticated;
revoke all on quotidien.rappels_envoyes from anon, authenticated;
grant all on quotidien.appareils, quotidien.rappels_envoyes to service_role;

create or replace function quotidien.enregistrer_appareil(jeton_expo text, plateforme_appareil text default null)
returns void
language plpgsql security definer
set search_path = quotidien, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'Vous devez être connecté';
  end if;
  insert into quotidien.appareils (jeton, utilisateur_id, plateforme, maj_le)
  values (jeton_expo, auth.uid(), plateforme_appareil, now())
  on conflict (jeton) do update
    set utilisateur_id = excluded.utilisateur_id, plateforme = excluded.plateforme, maj_le = now();
end;
$$;

-- Rappels à envoyer pour un jour donné (demain, en principe), pas encore
-- partis. Réservé à la clé de service (fonction Edge rappels-veille).
create or replace function quotidien.rappels_a_envoyer(jour date)
returns table (trajet_id uuid, genre text, jetons text[], titre text, corps text)
language sql stable security definer
set search_path = quotidien, pg_temp
as $$
  with a_venir as (
    select t.id, t.sens, to_char(t.heure, 'HH24:MI') as heure, t.conducteur_id,
           a.nom as activite, coalesce(s.lieu, a.lieu) as lieu, a.groupe_id,
           (select string_agg(e.prenom, ', ' order by e.prenom)
              from quotidien.trajet_enfants te join quotidien.enfants e on e.id = te.enfant_id
             where te.trajet_id = t.id) as enfants
    from quotidien.trajets t
    join quotidien.seances s on s.id = t.seance_id
    join quotidien.activites a on a.id = s.activite_id
    where s.date = jour and s.statut = 'prevue'
  ),
  conducteurs as (
    select v.id, 'conducteur'::text as genre,
           array_agg(distinct ap.jeton) as jetons,
           'Demain, c''est vous qui conduisez'::text as titre,
           concat_ws(' · ', v.activite || ' — ' || v.sens || ' à ' || v.heure, v.lieu, v.enfants) as corps
    from a_venir v
    join quotidien.participants p on p.id = v.conducteur_id and p.foyer_id is not null and p.parti_le is null
    join famille.foyer_membres fm on fm.foyer_id = p.foyer_id
    join quotidien.appareils ap on ap.utilisateur_id = fm.utilisateur_id
    group by v.id, v.activite, v.sens, v.heure, v.lieu, v.enfants
  ),
  libres as (
    select v.id, 'sans_conducteur'::text as genre,
           array_agg(distinct ap.jeton) as jetons,
           'Trajet sans conducteur demain'::text as titre,
           concat_ws(' · ', v.activite || ' — ' || v.sens || ' à ' || v.heure, v.lieu) || ' — qui peut le prendre ?' as corps
    from a_venir v
    join quotidien.participants p on p.groupe_id = v.groupe_id and p.foyer_id is not null and p.parti_le is null
    join famille.foyer_membres fm on fm.foyer_id = p.foyer_id
    join quotidien.appareils ap on ap.utilisateur_id = fm.utilisateur_id
    where v.conducteur_id is null
    group by v.id, v.activite, v.sens, v.heure, v.lieu
  )
  select x.id, x.genre, x.jetons, x.titre, x.corps
  from (select * from conducteurs union all select * from libres) x
  where not exists (
    select 1 from quotidien.rappels_envoyes r where r.trajet_id = x.id and r.genre = x.genre
  );
$$;

revoke execute on function quotidien.enregistrer_appareil(text, text), quotidien.rappels_a_envoyer(date) from public;
grant execute on function quotidien.enregistrer_appareil(text, text) to authenticated;
grant execute on function quotidien.rappels_a_envoyer(date) to service_role;

notify pgrst, 'reload schema';

commit;
