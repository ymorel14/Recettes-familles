# Apps de la famille

Un seul dépôt pour les applications familiales (Android, iOS et Web), qui
partagent le même compte famille : mêmes utilisateurs, mêmes foyers, mêmes
familles, et une famille active commune à toutes les apps.

| Dossier | Contenu |
| --- | --- |
| `apps/cuisine` | App Cuisine (« Recettes familiales ») : recettes, courses, assistant, congélateur |
| `apps/cadeaucommun` | App CadeauCommun : listes de souhaits, idées cachées, réservations anonymes |
| `apps/voyage` | App VoyageCommun : calendrier commun des disponibilités, préparation des voyages en famille (dates, hébergement, transport, activités, budget) |
| `apps/souvenirs` | App SouvenirsFamille : souvenirs de famille datés (voyages, naissances, premiers pas…), photos, vidéos, commentaires, recherche en français |
| `apps/quotidien` | App Quotidien : trajets et activités des enfants (covoiturage entre familles par groupes), tâches de la maison, argent de poche virtuel en points — covoiturage (groupes, invités sans compte, planning équitable, rappels), tâches et argent de poche branchés sur Supabase |
| `apps/courses` | App Courses : listes de courses du foyer (plusieurs listes, partage avec des personnes choisies, rayons, mode magasin) — Phase 0 : squelette, connexion et profil ; remplacera l'onglet Courses de Recettes |
| `packages/famille` | Code commun : compte famille, foyers, profils, famille active, codes d'invitation |
| `packages/theme` | Thèmes de couleurs communs aux apps |
| `supabase/` | Base de données : `setup.sql` (historique, ne plus lancer) et `migrations/` |

Le cahier des charges de chaque app vit dans les documents Claude, pas dans ce dépôt.

## Démarrage

Les dépendances s'installent une seule fois, à la racine (npm workspaces) :

```bash
npm install
npm run cuisine          # lance l'app Cuisine (Expo)
npm run cuisine:web      # version navigateur
npm run cadeau           # lance l'app CadeauCommun
npm run cadeau:web       # version navigateur
npm run voyage           # lance l'app VoyageCommun
npm run voyage:web       # version navigateur
npm run souvenirs        # lance l'app SouvenirsFamille
npm run souvenirs:web    # version navigateur
npm run quotidien        # lance l'app Quotidien
npm run quotidien:web    # version navigateur
npm run courses          # lance l'app Courses
npm run courses:web      # version navigateur
```

Ou depuis le dossier de l'app : `cd apps/cuisine` puis `npx expo start`.

Le fichier `.env` de chaque app se place dans son dossier (`apps/cuisine/.env`,
`apps/cadeaucommun/.env`, `apps/voyage/.env`, `apps/souvenirs/.env`, `apps/quotidien/.env`, `apps/courses/.env`, modèle dans chaque `.env.example`) avec `EXPO_PUBLIC_SUPABASE_URL` et
`EXPO_PUBLIC_SUPABASE_ANON_KEY`.

## Builds et mise en ligne

- **Android / iOS (EAS)** : lancer les commandes `eas build` depuis le dossier
  de l'app, par exemple `cd apps/cuisine` puis `eas build --profile preview --platform android`.
- **Web (Netlify) : un seul site pour les six apps.** `netlify.toml` à la
  racine lance `npm run site:export:web` (script `scripts/construire-site.mjs`)
  et publie `site/dist` : accueil à la racine, puis `/cuisine/`, `/cadeaux/`,
  `/voyages/`, `/souvenirs/`, `/quotidien/` et `/courses/`. Toutes les apps étant à la même adresse, le
  navigateur garde **une seule connexion** pour toutes. Les anciennes adresses
  de Cuisine (`/recette/123`…) sont redirigées vers `/cuisine/…` (sauf `/courses`,
  désormais l'app Courses). Dans
  Netlify, « Base directory » doit rester vide. Pour tester en local :
  `npm run site:export:web`, puis servir `site/dist` (ou n'en construire
  qu'une : `node scripts/construire-site.mjs voyages`).
- Les anciens sites Netlify propres à CadeauCommun et SouvenirsFamille
  (dossiers `dist` versionnés) peuvent être arrêtés une fois le site commun en
  ligne : sur ces sites, il faut se connecter séparément.

## Une seule connexion

- **Web** : le site commun partage la session entre les apps (même adresse).
  Se déconnecter dans une app déconnecte de toutes sur ce navigateur.
- **Téléphone** : chaque app garde sa propre session (le système ne laisse
  pas une app lire celle d'une autre). Sur l'écran de connexion, « Continuer
  avec <autre app> » ouvre une app déjà connectée, qui demande « Autoriser ? »
  puis renvoie, connecté, sans mot de passe (code de connexion à usage unique,
  fonction Edge `transfert-session`). Code commun dans `packages/famille`
  (`connexionPartagee.ts`, `PassageConnexion`, `ConnexionAutresApps`), testé
  par `npm run test:connexion -w @apps-famille/famille`.

## Base de données (Supabase)

Un seul projet Supabase, découpé en schémas : `famille` (compte famille
commun), `recettes` (app Cuisine), `wishlist` (CadeauCommun), `voyage`
(VoyageCommun), `souvenirs` (SouvenirsFamille), `quotidien` (Quotidien), `courses` (Courses, à partir de la Phase 1). Chaque
changement de la base est un fichier numéroté dans `supabase/migrations/`,
à exécuter une fois dans l'éditeur SQL (voir `supabase/migrations/LISEZMOI.md`).
