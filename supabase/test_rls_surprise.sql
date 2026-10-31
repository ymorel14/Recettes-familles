-- =========================================================================
-- Test RLS « surprise » : une personne tenue au secret (niveau 'cache')
-- ne doit rien voir d'un événement. À coller dans l'éditeur SQL de Supabase
-- (copie d'abord, puis prod) et à lancer EN UNE FOIS.
--
-- Il n'écrit rien dans vos données : seulement une table temporaire.
-- Il prend automatiquement le premier événement qui a une personne cachée
-- ayant un compte. Pour en viser un autre, remplacez NULL ci-dessous par
-- l'identifiant de l'événement (entre apostrophes).
--
-- Lecture du résultat : chaque ligne doit afficher « OK ». Une ligne « ÉCHEC »
-- est une fuite à corriger. « (erreur) » = la vérification n'a pas pu tourner
-- (nom de colonne ou de table différent) : dites-le-moi.
-- =========================================================================

drop table if exists pg_temp.res;
create temp table res (n serial, controle text, vu bigint, attendu bigint, verdict text);
grant all on res to authenticated;
grant usage, select on sequence res_n_seq to authenticated;

create or replace function pg_temp.verifie(nom text, requete text, attendu bigint)
returns void language plpgsql as $f$
declare v bigint;
begin
  begin
    execute requete into v;
    insert into res (controle, vu, attendu, verdict)
      values (nom, v, attendu, case when v = attendu then 'OK' else 'ÉCHEC' end);
  exception when others then
    insert into res (controle, vu, attendu, verdict) values (nom, null, attendu, '(erreur) ' || sqlerrm);
  end;
end $f$;

do $t$
declare
  cible_voyage uuid := NULL;   -- ← mettre l'id d'un événement pour en viser un précis
  v uuid;
  cache_uid uuid;
  orga_uid uuid;
begin
  -- 1. Choisir l'événement et la personne cachée (avec un compte).
  select s.voyage_id, p.utilisateur_id into v, cache_uid
  from voyage.secrets s join famille.personnes p on p.id = s.personne_id
  where s.niveau = 'cache' and p.utilisateur_id is not null
    and (cible_voyage is null or s.voyage_id = cible_voyage)
  order by s.ajoute_le desc limit 1;

  if v is null then
    insert into res (controle, verdict) values ('Aucune personne cachée avec compte trouvée', 'À créer : un événement surprise avec une personne cachée');
    return;
  end if;

  -- Un organisateur de cet événement, pour la vérification témoin.
  select p.utilisateur_id into orga_uid
  from voyage.participants pa join famille.personnes p on p.id = pa.personne_id
  where pa.voyage_id = v and pa.role = 'organisateur' and p.utilisateur_id is not null limit 1;

  insert into res (controle, verdict) values ('Événement testé : ' || v::text, '—');

  -- 2. Témoin : un organisateur voit bien l'événement (sinon le test ne prouve rien).
  if orga_uid is not null then
    perform set_config('request.jwt.claims', json_build_object('sub', orga_uid, 'role', 'authenticated')::text, true);
    set local role authenticated;
    perform pg_temp.verifie('TÉMOIN : l''organisateur voit l''événement', format('select count(*) from voyage.voyages where id = %L', v), 1);
    reset role;
  end if;

  -- 3. La personne cachée.
  perform set_config('request.jwt.claims', json_build_object('sub', cache_uid, 'role', 'authenticated')::text, true);
  set local role authenticated;

  perform pg_temp.verifie('L''événement (voyages)',            format('select count(*) from voyage.voyages where id = %L', v), 0);
  perform pg_temp.verifie('peut_voir()',                       format('select count(*) from (select 1 where voyage.peut_voir(%L)) x', v), 0);
  perform pg_temp.verifie('Les participants',                  format('select count(*) from voyage.participants where voyage_id = %L', v), 0);
  perform pg_temp.verifie('Les dates proposées',               format('select count(*) from voyage.propositions_dates where voyage_id = %L', v), 0);
  perform pg_temp.verifie('Les logements',                     format('select count(*) from voyage.hebergements where voyage_id = %L', v), 0);
  perform pg_temp.verifie('Les options de trajet',             format('select count(*) from voyage.options_trajet where voyage_id = %L', v), 0);
  perform pg_temp.verifie('Les activités',                     format('select count(*) from voyage.activites where voyage_id = %L', v), 0);
  perform pg_temp.verifie('Les repas',                         format('select count(*) from voyage.repas where voyage_id = %L', v), 0);
  perform pg_temp.verifie('Les plats',                         format('select count(*) from voyage.plats where repas_id in (select id from voyage.repas where voyage_id = %L)', v), 0);
  perform pg_temp.verifie('Les listes d''envies liées',        format('select count(*) from voyage.listes_envies where voyage_id = %L', v), 0);
  perform pg_temp.verifie('Les secrets (qui est caché)',       format('select count(*) from voyage.secrets where voyage_id = %L', v), 0);
  perform pg_temp.verifie('Ses notifications de l''événement', format('select count(*) from voyage.notifications where voyage_id = %L and utilisateur_id = auth.uid()', v), 0);
  perform pg_temp.verifie('« À faire pour vous » (a_faire)',   format('select count(*) from voyage.a_faire(%L)', v), 0);
  perform pg_temp.verifie('« On attend » (en_attente)',        format('select count(*) from voyage.en_attente(%L)', v), 0);
  perform pg_temp.verifie('Liste « événements organisés pour moi » (réservée au niveau fête)',
                          format('select count(*) from voyage.evenements_pour_moi() where id = %L', v), 0);

  reset role;
end $t$;

select n, controle, vu, attendu, verdict from res order by n;
