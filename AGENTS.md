# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

# Contexte du projet — Recettes familiales

Application de recettes de cuisine partageable en famille (Android, iOS, Web),
scaffoldée en Phase 0 avec Claude Code. Le cahier des charges complet et la
feuille de route détaillée par phases vivent dans le document Claude ("Cahier
des charges – App recettes familiales"), pas dans ce dépôt — s'y référer avant
toute nouvelle fonctionnalité.

Résumé des choix retenus :

- Stack : React Native + Expo (SDK 57), une seule base pour Android/iOS/Web
- Navigation : React Navigation, bottom tabs (Recettes / Courses / Assistant)
- Backend : Supabase (base de données, authentification, stockage, temps réel) —
  un projet EXISTANT est réutilisé (limite de 2 projets sur le plan gratuit), avec les
  tables de cette app isolées dans le schéma Postgres `recettes` (voir `supabase/setup.sql`)
  et un bucket de stockage dédié `recettes-photos`. L'authentification, elle, reste
  celle du projet (`auth.users`), partagée avec l'autre application du même compte.
  Client dans `src/services/supabase.ts`, clés à renseigner dans `.env` (voir `.env.example`)
- Thème "Sceau" : palette et polices dans `src/theme/theme.ts` (vert forêt sombre + or,
  titres en Cinzel, corps de texte en EB Garamond)
- Phase 0 (ce commit) : squelette + navigation + démonstration statique, sans
  données réelles. La Phase 1 (MVP) ajoute l'authentification, le foyer, la
  création de recettes et la liste de courses connectées à Supabase.

Convention de code : composants fonctionnels TypeScript, un écran par fichier
dans `src/screens`, styles via `StyleSheet.create` en réutilisant `theme.ts`
plutôt que des couleurs ou tailles codées en dur.
