# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

# Contexte du dépôt — Apps de la famille

Dépôt unique (npm workspaces) pour les apps familiales (Android, iOS, Web) qui
partagent le compte famille :

- `apps/cuisine` : app de recettes de cuisine partageable en famille
  (« Recettes familiales »), scaffoldée en Phase 0 avec Claude Code. Son cahier
  des charges vit dans le document Claude "Cahier des charges – App recettes
  familiales".
- `apps/cadeaucommun` : app de listes de souhaits (une liste par personne,
  idées cachées, réservations anonymes, listes communes pour plusieurs
  personnes cachées à ces personnes — `ListeCommuneFormScreen`, migration
  `20261012110000_wishlist_listes_communes.sql`), données dans le schéma `wishlist`. Cahier des
  charges : document Claude "Cahier des charges — CadeauCommun". La surprise est
  garantie par les règles RLS de la base, jamais seulement par l'interface.
- `apps/voyage` : app VoyageCommun (préparer un voyage en famille : calendrier
  commun des disponibilités, voyages et invités, sondage de dates, hébergements,
  trajets, activités, budget), données dans le schéma `voyage`. Cahier des
  charges : document Claude "Cahier des charges — VoyageCommun". Qui voit un
  voyage privé est garanti par les règles RLS de la base.
- `apps/souvenirs` : app SouvenirsFamille (la mémoire de la famille : souvenirs
  datés et catégorisés, personnes concernées avec leur âge, photos, vidéos, sons
  et PDF dans l'espace privé `souvenirs-medias`, commentaires, recherche en
  français par `souvenirs.rechercher`), données dans le schéma `souvenirs`.
  Cahier des charges : document Claude "Cahier des charges — SouvenirsFamille".
  Qui voit un souvenir est garanti par les règles RLS de la base ; les photos
  s'affichent par adresses signées, jamais publiques.
- `apps/quotidien` : app Quotidien (la logistique de tous les jours : activités
  et trajets des enfants, covoiturage entre familles grâce aux « groupes »
  rejoints par code — équipe, club, classe —, tâches de la maison, argent de
  poche virtuel affiché en points avec l'équivalent en euros entre
  parenthèses, sans aucun flux d'argent réel), données dans le schéma
  `quotidien`. Tâches et tirelires (`src/services/maison.ts`) restent dans
  le foyer (règles RLS) ; tâches et argent de poche branchés depuis les
  Phases 3 et 4 (migration `20261008110000_quotidien_taches_argent.sql`).
  Espace enfant (Phase 5) : lien `/quotidien/enfant/<jeton>`, `EnfantScreen`,
  fonctions `*_enfant` ; « J'ai fini » attend la validation d'un parent. Cahier des charges : document Claude "Cahier des charges —
  Quotidien". Covoiturage (`src/services/quotidien.ts`, migrations
  `20261007120000_quotidien.sql`, `…_rappels`, `…_planning`). Un membre de groupe ne
  voit que les trajets de l'activité commune et le prénom des enfants,
  garanti par les règles RLS ; un parent invité sans compte passe par son
  lien (`/quotidien/invite/<jeton>`, `InviteScreen`, fonctions `*_invite`). Rappels de la veille sur
  téléphone : `src/services/notifications.ts` (expo-notifications), table
  `quotidien.appareils`, fonction Edge `rappels-veille` planifiée par
  `supabase/planification_rappels.sql`.
  Inventaires (onglet « Inventaires », `src/services/inventaires.ts`,
  migration `20261012100000_quotidien_inventaires.sql`) : inventaires par
  domaine, lieux et contenants de rangement, objets avec photo, prêts ;
  réservés au foyer (règles RLS), photos dans l'espace privé
  `quotidien-inventaires`, envoyées seulement à « Enregistrer » (`avecPhoto`).
- `apps/courses` : app Courses (listes de courses du foyer : plusieurs
  listes, partage avec des personnes choisies une par une — jamais toute la
  famille —, rayons rangés automatiquement avec un ordre propre à chacun,
  checklist à vérifier avant de partir, mode magasin où l'article disparaît
  dès qu'il est dans le caddie, en direct, articles habituels ; quantités
  toujours facultatives). Adresse `/courses/` du site commun, thème par
  défaut « Forêt des montagnes ». Remplacera l'onglet « Courses » de
  Recettes (Phase 3). Phase 1 : listes, partage, articles par rayon
  (dictionnaire `src/services/rayons.ts`, mémoire du foyer
  `courses.produits`), ajout rapide (`src/services/saisie.ts` : « 2 lait »),
  ordre des rayons de chacun, temps réel (`src/hooks/useListe.ts`), mode
  magasin (`MagasinScreen`). Données dans le schéma `courses` (migration
  `20261017100000_courses.sql`) ; qui voit une liste est garanti par les
  règles RLS. Phase 3 (migration `20261017120000_courses_recettes.sql`) :
  reçoit les recettes de Recettes (détail par recette, « Retirer »),
  reprise des anciennes listes de Recettes. Photo d'un produit
  (migration `20261017130000_courses_photos.sql`, `src/services/photos.ts`,
  `src/components/Photo.tsx`) : gardée avec le produit du foyer, pas avec
  l'article. Phase 2 (migration `20261017110000_courses_avant_de_partir.sql`) :
  checklist du foyer, une seule pour toutes ses listes (`ChecklistScreen`,
  emplacements propres au foyer : migration `20261017150000_courses_emplacements.sql`),
  bouton « À la maison » : vérification partagée en direct
  (`VerificationScreen`), bouton « Je suis au magasin » (`MagasinScreen`),
  articles habituels (`courses.habituels`), onglet « Habituels » en bas
  (`HabituelsScreen` : épingler, ne plus proposer, ajouter à une liste,
  oublier un produit ; toucher un produit ouvre sa fiche `ProduitScreen` :
  photo, rayon, épingle, ajout à une liste, « À vérifier à la maison »
  (lien avec la checklist par la clé du produit), renommer ou fusionner — migration
  `20261017140000_courses_renommer_produit.sql`), historique (`HistoriqueScreen`),
  × sur une ligne de liste pour retirer un article (avec « Annuler »),
  mode sans réseau au magasin (`src/services/horsLigne.ts` : liste gardée
  sur le téléphone, appuis mis en attente puis renvoyés).
  Cahier des charges : document Claude "Cahier des charges — Courses".
- `packages/famille` : code commun (compte famille, foyers, profils, famille
  active, codes d'invitation, AuthProvider/useAuth, visibilité des enfants
  famille par famille : `<VisibiliteEnfants>` dans le Profil de chaque app,
  `personnesMasqueesFamilleActive()` pour filtrer les listes de la famille
  affichée). Chaque app crée son client
  Supabase et le confie au paquet avec
  `configurerFamille(supabase, { app, baseWeb: process.env.EXPO_PUBLIC_BASE_WEB })`.
  Une seule connexion pour toutes les apps : sur le web, site commun
  (`scripts/construire-site.mjs`, chaque app sous son chemin, ex. `/voyages/`) ;
  sur téléphone, « Continuer avec mon compte » (`connexionPartagee.ts`,
  `<PassageConnexion>` à monter dans chaque app, `<ConnexionAutresApps>` sur
  l'écran de connexion, fonction Edge `transfert-session`). Une nouvelle app
  s'ajoute à `APPS_FAMILLE` (appsFamille.ts) et à `scripts/construire-site.mjs`.
  Les clés de stockage local d'une app sont préfixées par son nom (le site
  commun partage le stockage du navigateur).
- `packages/courses` : code commun à Courses et Recettes — normalisation
  des produits (`cleProduit`), rayons et dictionnaire des produits,
  envoi des ingrédients d'une recette dans une liste Courses
  (`envoyerRecettes`), détail par recette (`courses.contributions`),
  retrait d'une recette, rapprochements proposés.
- `packages/theme` : thèmes de couleurs communs (Sceau, Charlotte aux fraises,
  Papier kraft…) et `creerStylesThemes`. Chaque app fixe son thème par défaut
  (`definirThemeParDefaut`) et ses polices dans son `src/theme/theme.ts`.

Les dépendances s'installent à la racine (`npm install`). Les commandes Expo et
EAS se lancent depuis le dossier de l'app. Se référer au cahier des charges de
l'app concernée avant toute nouvelle fonctionnalité.

Résumé des choix retenus (app Cuisine, valables aussi pour les suivantes) :

- Stack : React Native + Expo (SDK 57), une seule base pour Android/iOS/Web
- Navigation : React Navigation, bottom tabs (Recettes / Congélateur / Assistant /
  Aide-mémoire / Profil). La liste de courses a quitté Recettes pour l'app
  Courses (Phase 3 de Courses) : « Ajouter à la liste de courses » envoie les
  ingrédients dans une liste Courses (`src/hooks/useEnvoiCourses.tsx`), le
  panier de l'onglet Recettes mène à `ListeDeCoursesScreen` (ouvrir Courses,
  ajouter plusieurs recettes)
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
