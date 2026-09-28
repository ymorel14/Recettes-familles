# Apps de la famille

Un seul dépôt pour les applications familiales (Android, iOS et Web), qui
partagent le même compte famille : mêmes utilisateurs, mêmes foyers, mêmes
familles, et une famille active commune à toutes les apps.

| Dossier | Contenu |
| --- | --- |
| `apps/cuisine` | App Cuisine (« Recettes familiales ») : recettes, courses, assistant, congélateur |
| `apps/cadeaucommun` | App CadeauCommun (listes de souhaits) — à venir |
| `packages/famille` | Code commun : compte famille, foyers, profils, famille active, codes d'invitation |
| `supabase/` | Base de données : `setup.sql` (historique, ne plus lancer) et `migrations/` |

Le cahier des charges de chaque app vit dans les documents Claude, pas dans ce dépôt.

## Démarrage

Les dépendances s'installent une seule fois, à la racine (npm workspaces) :

```bash
npm install
npm run cuisine          # lance l'app Cuisine (Expo)
npm run cuisine:web      # version navigateur
```

Ou depuis le dossier de l'app : `cd apps/cuisine` puis `npx expo start`.

Le fichier `.env` de chaque app se place dans son dossier (ex. `apps/cuisine/.env`,
modèle dans `apps/cuisine/.env.example`) avec `EXPO_PUBLIC_SUPABASE_URL` et
`EXPO_PUBLIC_SUPABASE_ANON_KEY`.

## Builds et mise en ligne

- **Android / iOS (EAS)** : lancer les commandes `eas build` depuis le dossier
  de l'app, par exemple `cd apps/cuisine` puis `eas build --profile preview --platform android`.
- **Web (Netlify)** : `netlify.toml` à la racine construit l'app Cuisine
  (`npm run cuisine:export:web`, publication de `apps/cuisine/dist`). Dans
  Netlify, le réglage « Base directory » doit rester vide.

## Base de données (Supabase)

Un seul projet Supabase, découpé en schémas : `famille` (compte famille
commun), `recettes` (app Cuisine), `wishlist` (CadeauCommun). Chaque
changement de la base est un fichier numéroté dans `supabase/migrations/`,
à exécuter une fois dans l'éditeur SQL (voir `supabase/migrations/LISEZMOI.md`).
