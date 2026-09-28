# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

# Contexte du dépôt — Apps de la famille

Dépôt unique (npm workspaces) pour les apps familiales (Android, iOS, Web) qui
partagent le compte famille :

- `apps/cuisine` : app de recettes de cuisine partageable en famille
  (« Recettes familiales »), scaffoldée en Phase 0 avec Claude Code. Son cahier
  des charges vit dans le document Claude "Cahier des charges – App recettes
  familiales".
- `apps/cadeaucommun` : app de listes de souhaits (événements, listes, idées
  cachées, réservations anonymes), données dans le schéma `wishlist`. Cahier des
  charges : document Claude "Cahier des charges — CadeauCommun". La surprise est
  garantie par les règles RLS de la base, jamais seulement par l'interface.
- `packages/famille` : code commun (compte famille, foyers, profils, famille
  active, codes d'invitation, AuthProvider/useAuth). Chaque app crée son client
  Supabase et le confie au paquet avec `configurerFamille(supabase)`.
- `packages/theme` : thèmes de couleurs communs (Sceau, Charlotte aux fraises,
  Papier kraft…) et `creerStylesThemes`. Chaque app fixe son thème par défaut
  (`definirThemeParDefaut`) et ses polices dans son `src/theme/theme.ts`.

Les dépendances s'installent à la racine (`npm install`). Les commandes Expo et
EAS se lancent depuis le dossier de l'app. Se référer au cahier des charges de
l'app concernée avant toute nouvelle fonctionnalité.

Résumé des choix retenus (app Cuisine, valables aussi pour les suivantes) :

- Stack : React Native + Expo (SDK 57), une seule base pour Android/iOS/Web
- Navigation : React Navigation, bottom tabs (Recettes / Courses / Assistant)
- Backend : Supabase (base de données, authentification, stockage, temps réel) —
  un projet EXISTANT est réutilisé (limite de 2 projets sur le plan gratuit), avec les
  tables de cette app isolées dans le schéma Postgres `recettes` (voir `supabase/setup.sql`)
  et un bucket de stockage dédié `recettes-photos`. Le compte famille (familles, foyers,
  membres, profils, famille active) vit dans le schéma `famille`, commun à toutes les apps
  de la famille (Cuisine, CadeauCommun) — requêtes via `schemaFamille()`. Les changements
  de base se font désormais par fichiers numérotés dans `supabase/migrations/` (voir
  LISEZMOI.md) ; `setup.sql` ne doit plus être relancé. L'authentification, elle, reste
  celle du projet (`auth.users`), partagée avec l'autre application du même compte.
  Client dans `apps/cuisine/src/services/supabase.ts`, clés à renseigner dans
  `apps/cuisine/.env` (voir `apps/cuisine/.env.example`)
- Thème "Sceau" : palette et polices dans `apps/cuisine/src/theme/theme.ts` (vert forêt sombre + or,
  titres en Cinzel, corps de texte en EB Garamond)
- Phase 0 (ce commit) : squelette + navigation + démonstration statique, sans
  données réelles. La Phase 1 (MVP) ajoute l'authentification, le foyer, la
  création de recettes et la liste de courses connectées à Supabase.

Convention de code : composants fonctionnels TypeScript, un écran par fichier
dans `src/screens` de chaque app, styles via `StyleSheet.create` en réutilisant `theme.ts`
plutôt que des couleurs ou tailles codées en dur.
