-- App Famille, retour de test R-7 (27 octobre 2026) : commentaires libres en
-- bas d'une recette (« Envoyer »), à côté des essais.
--
-- Droits : un commentaire se lit exactement comme sa recette. Les règles
-- passent par recettes.recettes, donc par SES règles RLS : une recette
-- surprise reste cachée, commentaires compris. On commente une recette qu'on
-- voit ; chacun modifie ou supprime les siens.
-- Notification : l'auteur de la recette est prévenu (sauf s'il ne voit pas
-- la recette — surprise cachée par quelqu'un d'autre —, vérifié sous son
-- identité comme les autres nouveautés). Le déclencheur ne lève jamais
-- d'erreur.
--
-- AJOUT SEULEMENT : nouvelle table, nouveau déclencheur. Nécessite
-- 20261021120000_famille_notifications_modules.sql (aides des
-- déclencheurs). Les six apps actuelles ne changent pas.

begin;

create table if not exists recettes.commentaires (
  id uuid primary key default gen_random_uuid(),
  recette_id uuid not null references recettes.recettes (id) on delete cascade,
  auteur_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  texte text not null check (length(btrim(texte)) between 1 and 2000),
  cree_le timestamptz not null default now(),
  maj_le timestamptz not null default now()
);

create index if not exists commentaires_recette_idx on recettes.commentaires (recette_id, cree_le);

alter table recettes.commentaires enable row level security;
grant select, insert, update, delete on recettes.commentaires to authenticated;

drop policy if exists "Voir les commentaires des recettes visibles" on recettes.commentaires;
create policy "Voir les commentaires des recettes visibles" on recettes.commentaires
  for select using (recette_id in (select r.id from recettes.recettes r));

drop policy if exists "Commenter une recette visible" on recettes.commentaires;
create policy "Commenter une recette visible" on recettes.commentaires
  for insert with check (auteur_id = auth.uid() and recette_id in (select r.id from recettes.recettes r));

drop policy if exists "Modifier ses commentaires" on recettes.commentaires;
create policy "Modifier ses commentaires" on recettes.commentaires
  for update using (auteur_id = auth.uid())
  with check (auteur_id = auth.uid() and recette_id in (select r.id from recettes.recettes r));

drop policy if exists "Supprimer ses commentaires" on recettes.commentaires;
create policy "Supprimer ses commentaires" on recettes.commentaires
  for delete using (auteur_id = auth.uid());

-- Notification à l'auteur de la recette.
create or replace function recettes.notif_commentaire()
returns trigger
language plpgsql
set search_path = recettes, famille, pg_temp
as $$
declare
  auteur uuid := auth.uid();
  dest uuid;
  titre text;
  avant text[];
  visible boolean;
begin
  begin
    if auteur is null or current_user <> 'authenticated' then return null; end if;
    select r.cree_par, r.titre into dest, titre from recettes.recettes r where r.id = new.recette_id;
    if dest is null or dest = auteur then return null; end if;
    avant := famille.prendre_identite(dest);
    select exists (select 1 from recettes.recettes r where r.id = new.recette_id) into visible;
    perform famille.reprendre_identite(avant);
    if visible then
      perform famille.notifier_declencheur(
        dest, 'recettes', 'commentaire',
        famille.prenom_utilisateur(auteur) || ' a commenté « ' || titre || ' » : ' || left(new.texte, 120),
        'recettes/recette/' || new.recette_id);
    end if;
  exception when others then
    raise warning 'notif_commentaire : %', sqlerrm;
  end;
  return null;
end;
$$;

drop trigger if exists famille_notif_commentaire on recettes.commentaires;
create trigger famille_notif_commentaire after insert on recettes.commentaires
  for each row execute function recettes.notif_commentaire();

commit;
