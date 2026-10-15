-- =========================================================================
-- Migration — VoyageCommun : qui paie quoi (paiement commun)
--
-- Décisions du 13 octobre 2026, pour les voyages compliqués :
--   - chaque étape de trajet dit qui la paie (trajets.paiement) :
--       'foyer'     : le foyer du trajet (sa voiture : chacun paie son
--                     essence, même s'il emmène d'autres passagers),
--       'commun'    : payée en commun, répartie comme l'hébergement (règle
--                     du voyage : par adulte, enfants gratuits…) entre les
--                     passagers de l'étape (le ferry),
--       'passagers' : chaque passager sa part, enfants compris ;
--     vide : la voiture par son foyer, les autres modes en commun ;
--   - un hébergement retenu est commun, ou à la charge de certains foyers
--     seulement (hebergements.pour_foyers ; vide : commun).
--
-- Le calcul vit dans l'app (apps/voyage/src/services/budget.ts) ; la base
-- ne fait que garder ces choix. Les droits ne changent pas : qui peut
-- modifier une étape ou un hébergement peut changer qui le paie.
--
-- Pré-requis : 20261012120000_voyage_options_trajet.sql.
-- =========================================================================

begin;

alter table voyage.trajets
  add column if not exists paiement text check (paiement in ('foyer', 'commun', 'passagers'));
comment on column voyage.trajets.paiement is
  'Qui paie l''étape : foyer (du trajet), commun (règle du voyage entre ses passagers), passagers (part égale) ; vide : voiture → foyer, sinon commun.';

alter table voyage.hebergements
  add column if not exists pour_foyers uuid[];
comment on column voyage.hebergements.pour_foyers is
  'Foyers qui paient cet hébergement (répartition selon la règle du voyage entre leurs membres) ; vide : frais communs.';

-- Seuls des foyers de la famille du voyage (les autres sont retirés).
create or replace function voyage.regler_pour_foyers()
returns trigger
language plpgsql security definer
set search_path = voyage, pg_temp
as $$
begin
  if new.pour_foyers is not null then
    new.pour_foyers := nullif(array(
      select distinct f from unnest(new.pour_foyers) f
      where f in (
        select ff.foyer_id from famille.famille_foyers ff
        join voyage.voyages v on v.famille_id = ff.famille_id
        where v.id = new.voyage_id
      )
    ), '{}');
  end if;
  return new;
end;
$$;

create trigger regler_pour_foyers
before insert or update of pour_foyers on voyage.hebergements
for each row execute function voyage.regler_pour_foyers();

notify pgrst, 'reload schema';

commit;
