# Recettes familiales

Application de recettes de cuisine partageable en famille — Android, iOS et Web.

Ce dépôt correspond à la **Phase 0** de la feuille de route (initialisation du
projet) : squelette Expo + navigation + thème, sans données réelles. Le détail
des fonctionnalités et des phases suivantes vit dans le cahier des charges
(document Claude "Cahier des charges – App recettes familiales").

## Démarrage

```bash
npm install
npm run web       # lance dans un navigateur
npm run android   # lance sur un émulateur/appareil Android (ou Expo Go)
npm run ios       # lance sur un simulateur iOS (macOS uniquement) ou Expo Go
```

## Configurer Supabase (backend)

Cette app réutilise un projet Supabase **existant** (pour rester dans la limite
de 2 projets du plan gratuit), isolé dans son propre schéma Postgres `recettes`.

1. Dans le tableau de bord de votre projet Supabase existant, ouvrir l'éditeur
   SQL et exécuter le contenu de `supabase/setup.sql` (une seule fois)
2. Dans Project Settings → API → *Exposed schemas*, ajouter `recettes` à côté
   de `public`
3. Copier `.env.example` en `.env`
4. Renseigner `EXPO_PUBLIC_SUPABASE_URL` et `EXPO_PUBLIC_SUPABASE_ANON_KEY`
   avec les valeurs de ce même projet (Project Settings → API)

L'authentification reste celle du projet (`auth.users`) : les membres du foyer
se connectent avec les mêmes comptes que votre autre application. Seules les
données de l'app recettes (tables, et plus tard le bucket de photos
`recettes-photos`) sont isolées du reste.

Tant que `.env` n'est pas renseigné, l'application démarre quand même (les
écrans utilisent des données de démonstration codées en dur pour cette Phase 0).

## Structure

```
src/
  screens/       Recettes, Liste de courses, Assistant (un écran par fichier)
  navigation/     Navigation par onglets (React Navigation)
  services/       Client Supabase (schéma "recettes")
  theme/          Thème "Sceau" (couleurs, polices, espacements)
supabase/
  setup.sql      Script à exécuter une fois sur le projet Supabase existant
```

## Publier sur GitHub

Ce dossier n'est pas encore un dépôt Git (à initialiser depuis un terminal, dans ce dossier) :

```bash
git init
git add -A
git commit -m "Phase 0 : squelette Expo, navigation, thème Sceau, config Supabase"
git remote add origin <URL de votre dépôt GitHub>
git branch -M main
git push -u origin main
```
