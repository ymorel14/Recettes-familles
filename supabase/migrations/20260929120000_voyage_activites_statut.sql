-- =========================================================================
-- Migration — VoyageCommun : seul un organisateur retient une activité
--
-- Comme pour les hébergements (migration 20260929110000) : l'auteur d'une
-- activité peut la modifier, mais seul un organisateur change son statut
-- (retenue, écartée) ; une proposition naît toujours "proposée" ; l'auteur
-- reste celui d'origine. Sans ce garde-fou, un participant aurait pu faire
-- entrer sa propre activité au budget.
--
-- Pré-requis : migrations 20260929100000_voyage.sql et
-- 20260929110000_voyage_vehicules.sql.
-- =========================================================================

begin;

create or replace function voyage.regler_activite()
returns trigger
language plpgsql security definer
set search_path = voyage, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    if not voyage.est_organisateur(new.voyage_id) then
      new.statut := 'propose';
    end if;
    return new;
  end if;
  new.propose_par := old.propose_par;
  new.cree_le := old.cree_le;
  if new.statut is distinct from old.statut and not voyage.est_organisateur(old.voyage_id) then
    new.statut := old.statut;
  end if;
  return new;
end;
$$;

create trigger regler_activite
before insert or update on voyage.activites
for each row execute function voyage.regler_activite();

-- Un trajet garde son responsable (celui qui l'a déclaré).
create or replace function voyage.regler_trajet()
returns trigger
language plpgsql
set search_path = voyage, pg_temp
as $$
begin
  new.responsable := old.responsable;
  new.cree_le := old.cree_le;
  return new;
end;
$$;

create trigger regler_trajet
before update on voyage.trajets
for each row execute function voyage.regler_trajet();

notify pgrst, 'reload schema';

commit;
