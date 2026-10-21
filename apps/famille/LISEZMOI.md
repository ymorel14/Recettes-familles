# App Famille (nouvelle version)

Les six apps réunies dans une seule app, avec l'interface de la charte V1
(`V1-charte-graphique.md`) et la navigation de la spécification V1
(`V1-specification-dev.md`, chantier A), avec l'assistant (chantiers B et C).

**Même base Supabase que les six apps actuelles**, mêmes schémas, mêmes règles RLS :
les deux versions lisent et écrivent les mêmes données et fonctionnent côte à côte.

## Lancer

```bash
npm install            # à la racine du dépôt
npm run famille        # téléphone (Expo)
npm run famille:web    # navigateur
```

`.env` dans ce dossier (modèle : `.env.example`), mêmes valeurs que les autres apps.
Sur le site commun : `/famille/` (construit par `scripts/construire-site.mjs`).

## Organisation

| Dossier | Contenu |
| --- | --- |
| `src/theme/` | Jetons de la charte (`jetons.ts`), thème clair/sombre (`theme.ts`), thème vu par le code des modules (`modules.ts` : palette « Famille » + encre du module) |
| `src/navigation/` | Barre du bas (Accueil · Agenda · ⊕ · Activité · Moi), onglets du haut des modules (`OngletsModule.tsx`), pile de chaque module (`modules/*.tsx`), adresses web (`liens.ts`) |
| `src/ecrans/` | Accueil, Agenda, Activité, Moi, feuille ⊕ Ajouter |
| `src/services/` | Client Supabase unique (`clientPourSchema` pour chaque module), lectures de l'accueil et de l'Agenda (`journee.ts`), notifications |
| `src/modules/<module>/` | Code repris des six apps (écrans, services, composants), **copié** : les apps actuelles ne sont pas modifiées |
| `src/compte/` | Connexion, bienvenue, prénom, mot de passe |

## Assistant (chantier B : socle)

Fonction Edge `ia` (`supabase/functions/ia`, mise en service : `supabase/functions/ia/LISEZMOI.md`).
Côté app : `src/services/assistant.ts` (`appelerAssistant(route, corps)`, messages d'erreur
de la charte), jauge du foyer dans Moi (`src/ecrans/JaugeAssistant.tsx`), composants de la
charte § 7 dans `src/composants/assistant.tsx` (étincelle ✦, chargement en mots avec
« Annuler », bandeau « Proposé par l'assistant », pastille « À vérifier », messages d'erreur).
Jeux de tests : `tests/ia/`, rejoués par `node scripts/rejouer-tests-ia.mjs`.

## Assistant (chantier C, étape 4 : saisie en langage naturel)

- **⊕ Ajouter** (`src/ecrans/FeuilleAjouter.tsx`, route `plus`) : « Dites ou écrivez… » avec micro,
  une carte par action proposée (cases à cocher, modification sur place ou dans le formulaire),
  « Tout ajouter » puis « Annuler » dans le message de confirmation. Les six raccourcis restent.
- **Courses** (`ListeScreen`) : une phrase (« de quoi faire des crêpes », « lait, œufs et beurre »)
  passe par `courses-phrase` ; les suggestions arrivent décochées. Un mot seul reste ajouté directement.
- **Tâches** : bouton « ✦ Dicter » (`FeuilleDictee`, route `tache-dictee`) → formulaire pré-rempli
  avec le bandeau « Proposé par l'assistant » et les dates « À vérifier ».
- **Cadeaux** : « Coller » un lien ou « ✦ Remplir avec la page » (route `lien-envie`) remplit les
  champs vides de l'envie.
- Création après validation : `src/services/actionsAssistant.ts`. Dictée : `src/composants/useDictee.ts`
  (reconnaissance vocale du téléphone, absente d'Expo Go : le micro est alors masqué).

## Base de données

Aucune migration n'est obligatoire. `supabase/migrations/20261020100000_famille_notifications.sql`
(ajout seulement) crée `famille.notifications` pour l'écran Activité ; sans elle,
l'app lit les notifications de VoyageCommun.
`20261020120000_quotidien_taches_autres_foyers.sql` (élargissement seulement) permet de confier une tâche à
une personne d'un autre foyer de la famille (Quotidien › Tâches › « Pour qui ») ; sans elle, ces personnes ne
peuvent pas être choisies (la base refuse l'enregistrement).
`20261020110000_famille_ia.sql` (ajout seulement) installe le suivi des coûts et le plafond de
l'assistant ; sans elle, la jauge ne s'affiche pas et l'assistant répond « pas encore installé ».

## Assistant (chantier C, étape 5 : photos)

Photos réduites sur le téléphone puis envoyées à l'assistant (`src/services/photosAssistant.ts`,
choix des photos : `src/composants/PanneauPhotos.tsx`, appel : `src/composants/useAppelAssistant.ts`).

- **Recettes › Scanner une photo** (`LecturePhotoRecette`, route `recette-photo`) : 1 à 3 pages →
  fiche recette pré-remplie (éléments, ingrédients, étapes, catégories), bandeau « Proposé par
  l'assistant » et champs « À vérifier » dans `RecetteFormScreen`. « Entourer les zones moi-même »
  garde l'ancien tracé.
- **Quotidien › Groupe › Importer un planning** (`src/ecrans/ImportPlanning.tsx`, route
  `planning-photo`) : photo ou PDF. Activités de chaque semaine → `ActiviteFormScreen` pré-rempli ;
  dates précises (matchs) → liste à cocher, « Ajouter » crée une activité, ses séances et leurs
  trajets (`src/services/planningAssistant.ts`).
- **Cadeaux › Nouveau souhait** : photo prise → objet reconnu (route `objet-photo`), « Chercher en
  ligne » ouvre une recherche que la personne fait elle-même.
- **Cadeaux › liste d'un enfant gérée › Importer une lettre au Père Noël**
  (`src/ecrans/ImportLettre.tsx`, route `lettre-noel`) : photo ou dictée, une ligne par cadeau à
  cocher et corriger.
- **⊕ › Photo ou Galerie** : classement (route `photo-classer`), puis ouverture de l'écran qui lit
  ce type de photo ; si l'assistant ne sait pas, la personne choisit.

## Assistant (chantier C, étape 6 : pages, vidéos, annonces)

- **Recettes › Importer depuis le web** (`ImportWebScreen`) : la lecture classique (`importer-recette`, gratuite)
  reste la première ; si la page n'a pas de fiche recette structurée, l'assistant lit son texte (route
  `recette-lien`). Un lien YouTube, TikTok ou Instagram est lu par sa description ou sa légende publiques. Si la
  vidéo ne donne pas la recette par écrit : champ « Coller le texte de la recette » (description, sous-titres).
- **Voyages › Proposer un hébergement › Remplir depuis le lien** : si `lire-annonce` n'a pas trouvé le prix, les
  couchages ou les chambres (ou si le site bloque), l'assistant lit l'annonce (route `annonce-hebergement`) et
  complète les champs vides. La liste des hébergements montre « Le moins cher / pers. » et les couchages par
  rapport au nombre d'invités.

## Assistant (chantier C, étape 7 : traitement de nuit et doublons)

- **Résumé du matin** (`src/composants/ResumeMatin.tsx`, `src/services/resumeMatin.ts`) : en tête de
  l'accueil, 2 ou 3 phrases rédigées la nuit (fonction `ia-nuit`) à partir des faits du jour déjà
  filtrés (`famille.faits_du_jour`) ; chaque élément souligné ouvre l'écran concerné. Sans résumé
  préparé (première visite), l'accueil le demande une fois dans la journée (route `resume-matin`).
- **Sans doute à racheter** (`courses.a_racheter`) : puces en haut d'une liste du foyer (appui long :
  « Ne plus proposer ») et « Café à racheter ? » dans « À faire pour vous » (bouton « Ajouter », vers la
  liste principale). Pas avant 3 achats ; jamais à partir des listes « moi ».
- **Doublons** (`ListeScreen`, `src/services/doublonsAssistant.ts`, route `doublons`) : pour deux articles
  qui ont un mot en commun, l'assistant dit si c'est le même produit et propose libellé et quantité
  totale (« ✦ Fusionner en « Lait demi-écrémé 3 L » ») ; les produits différents ne sont plus proposés.
  « Pas le même » est mémorisé par le foyer (`courses.non_doublons`). Réponses gardées sur le téléphone.

Migration : `20261021100000_famille_nuit.sql` (ajout seulement). Sans elle, rien ne s'affiche et le
reste marche comme avant.

## Assistant (chantier C, étape 8 : cuisine et voyage)

- **Mode assistant en cuisine** (`DeroulementAssistantScreen`, `src/services/questionCuisine.ts`, route
  `cuisine-question`) : les commandes vocales par mots-clés restent prioritaires ; une phrase qui n'est pas
  une commande et ressemble à une question part à l'assistant, jamais pendant la lecture d'une étape ni si
  elle reprend le texte qui vient d'être lu (écho). Bouton « ✦ Poser une question » pour le clavier. Réponse
  dans une bulle sombre au-dessus des étapes, lue à voix haute ; les 3 derniers échanges servent de contexte.
- **Brouillon de voyage** (`NouveauVoyageScreen` › « Avec l'assistant », `src/services/brouillonVoyage.ts`,
  route `voyage-brouillon`) : une phrase pré-remplit le formulaire (titre, destination, période, nuits ;
  programme et budget dans le mot aux invités) et propose dates, hébergements (liens réels) et activités à
  cocher. À « Proposer ce voyage », ils deviennent des propositions ordinaires, votées comme les autres,
  avec la mention « ✦ Proposé par l'assistant » dans Dates, Hébergement et Activités.

Migration : `20261021110000_voyage_propositions_assistant.sql` (ajout seulement). Sans elle, les
propositions sont créées sans la mention.
