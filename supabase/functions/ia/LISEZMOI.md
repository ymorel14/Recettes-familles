# Assistant de l'app Famille — mise en service

Socle de l'assistant (spécification V1, chantier B). Une seule fonction Edge,
`ia`, avec une route par fonctionnalité : `POST /functions/v1/ia/<route>`.

| Fichier | Rôle |
| --- | --- |
| `../_partage/ia.ts` | Travail commun : connexion de l'utilisateur, foyer, plafond, appel au modèle (sortie structurée), refus et réponses trop longues, comptage dans `famille.ia_usage` |
| `../_partage/consignes/<route>.ts` | Consigne de chaque fonction, versionnée |
| `routes/<route>.ts` | Une fonctionnalité : schéma de sortie, contenu envoyé, brouillon renvoyé |
| `index.ts` | Liste des routes |

Routes disponibles :

| Route | Rôle | Modèle, coût indicatif |
| --- | --- | --- |
| `essai` | Vérifie toute la chaîne (bouton « Vérifier l'assistant » de Moi, administrateur) | Haiku, < 0,0002 $ |
| `plus` | ⊕ universel : une phrase → actions proposées (courses, tâche, envie, souvenir, recette) | Haiku, ~0,0005 $ |
| `courses-phrase` | Une phrase dans une liste Courses → articles (suggestions décochées) | Haiku, ~0,0003 $ |
| `tache-dictee` | Tâche dictée → brouillon du formulaire de tâche | Haiku, ~0,0003 $ |
| `lien-envie` | Lien collé dans une envie → titre, prix, image, options. Sans assistant (0 $) quand la page donne déjà titre et prix | Haiku si besoin, ~0,001 $ |
| `recette-photo` | 1 à 3 photos d'une recette (livre, fiche manuscrite) → fiche recette pré-remplie | Sonnet, ~0,03 $ |
| `planning-photo` | Photo(s) ou PDF d'un planning → activités de chaque semaine et séances datées | Sonnet, ~0,03 $ |
| `objet-photo` | Photo d'un objet → envie (nom, marque, catégorie, mots de recherche) | Sonnet, ~0,02 $ |
| `lettre-noel` | Photo ou dictée de la lettre au Père Noël → envies de l'enfant (prénom seul envoyé) | Sonnet, ~0,02 $ |
| `photo-classer` | ⊕ photo : de quoi s'agit-il ? (image réduite à 512 px) | Haiku, ~0,0003 $ |
| `recette-lien` | Page web SANS fiche recette structurée (l'app essaie d'abord `importer-recette`, gratuit), vidéo YouTube / TikTok / Instagram (texte public seulement : description, légende ; jamais la vidéo ni les sous-titres), ou texte collé (description, sous-titres) → recette | Sonnet, ~0,02 à 0,035 $ |
| `annonce-hebergement` | Annonce de location quand `lire-annonce` n'a pas trouvé le prix, les couchages ou les chambres → champs manquants | Sonnet, ~0,02 $ |
| `resume-matin` | Résumé du matin quand rien n'a été préparé cette nuit (première visite) : faits du jour lus au jeton de l'utilisateur (`famille.faits_du_jour`), une seule rédaction par jour | Haiku, ~0,0005 $ |
| `doublons` | Articles de courses ambigus (un mot en commun) : même produit ? libellé et quantité totale proposés | Haiku, ~0,0005 $ |
| `cuisine-question` | Question pendant le mode assistant en cuisine (à la voix si la phrase n'est pas une commande, ou au clavier) ; recette affichée (version, quantités, astuces) en contexte mis en cache ; 80 mots au plus, lue à voix haute | Sonnet, effort medium, ~0,009 $ |
| `voyage-brouillon` | « Organise-nous un week-end en Bretagne en novembre » : dates qui respectent le calendrier commun, hébergements et activités trouvés par recherche web (5 au plus ; un lien absent des résultats est écarté), programme, budget. Contexte au jeton de l'utilisateur : nombre d'adultes, âges des enfants, périodes non libres sans motif ni nom, adresse de départ de son foyer | Sonnet, effort medium + recherche web, ~0,15 $ |
| `recette-categories` | Classement automatique des recettes (retour de test R-4) : titre et ingrédients de 25 recettes au plus → 1 à 3 catégories chacune, prises dans les catégories existantes (nouvelles seulement si l'app l'autorise) ; validées sur l'écran de revue | Haiku, ~0,0005 $ par recette |
| `recette-ingredients` | Lien entre les étapes d'une recette et ses ingrédients (retour de test R-12) : verbes (« salez »), familles (« les épices »), pluriels ; gardé dans `recettes.etapes.ingredients_cites` (migration `20261027110000`) pour le mode assistant | Haiku, ~0,001 $ par recette |

Photos et PDF (`_partage/images.ts`) : réduits par l'app avant l'envoi (1 568 px, JPEG 0,8),
3 photos au plus, 5 Mo par fichier, 8 Mo en tout ; jamais enregistrés, ils ne font que passer.
Contexte commun (`_partage/contexte.ts`) : date de Paris, noms des listes et prénoms du foyer,
lus au jeton de l'utilisateur. Lecture de page (`_partage/page.ts`) : adresses publiques seulement,
10 s et 1,5 Mo au plus. Les autres fonctions du chantier C s'ajouteront ici, une route chacune,
sans toucher au socle.

## Mettre en service (une fois)

1. **Clé API Anthropic** : créer une clé sur <https://console.anthropic.com>
   (Settings › API Keys), avec une limite de dépense mensuelle sur le compte
   (par exemple 20 $) en plus du plafond par foyer.
2. **Base** : exécuter `supabase/migrations/20261020110000_famille_ia.sql`
   dans l'éditeur SQL de Supabase (ajout seulement, sans effet sur les six apps actuelles).
3. **Secret et déploiement**, depuis la racine du dépôt :

   ```bash
   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
   supabase functions deploy ia
   ```

   `SUPABASE_URL`, `SUPABASE_ANON_KEY` et `SUPABASE_SERVICE_ROLE_KEY` sont
   fournis automatiquement par Supabase aux fonctions Edge.
4. **Vérifier** : dans l'app Famille › Moi › Assistant du foyer › « Vérifier
   l'assistant ». La jauge augmente d'une fraction de pourcent.
   Ou, en ligne de commande : `node scripts/rejouer-tests-ia.mjs essai`
   (voir `tests/ia/LISEZMOI.md`).

## Règles du socle

- **Lectures avec le jeton de l'utilisateur** : la RLS s'applique, donc
  l'assistant ne reçoit que ce que la personne a le droit de voir (surprises
  comprises). La clé `service_role` ne sert qu'au plafond et au comptage.
- **Brouillons seulement** : aucune route n'écrit dans les tables des modules.
- **Plafond** : 5 $ par foyer et par mois par défaut (réglable par
  l'administrateur du foyer dans Moi : 2, 5, 10 ou 20 $). Au-delà, réponse
  `429` « L'assistant fait une pause jusqu'au 1er … » ; le reste de l'app marche.
- **Modèles** : `claude-haiku-5-5` (textes courts et fréquents) et
  `claude-sonnet-5-5` (images, pages longues, raisonnement ; repli côté serveur
  en cas de refus, en-tête `server-side-fallback-2026-07-01`). Effort `low` par
  défaut.
- **Cache** : la consigne (et un éventuel contexte stable) est envoyée en tête
  avec `cache_control`. Rien de variable dans la consigne.
- **Tarifs** : table `famille.ia_tarifs` (octobre 2026), à mettre à jour à la
  main si les prix changent. Suivi réel : vue `famille.ia_usage_mensuel` dans
  l'éditeur SQL.

Avec un outil côté serveur (recherche web), la sortie structurée n'est pas utilisée (incompatible avec
les citations) : le schéma est donné dans la consigne et le JSON final est validé par le même schéma Zod.
Les adresses des résultats de recherche sont renvoyées par `extraire` (`urls`) pour vérifier les liens.

## Traitement de nuit (fonction `ia-nuit`, chantier C, étape 7)

À moitié prix (API Batches), pour ce qui n'est pas urgent :

| Travail | Quand | Résultat | Modèle, coût indicatif |
| --- | --- | --- | --- |
| Résumé du matin (§ 4.6.2) | Chaque nuit, pour chaque personne venue sur l'accueil ces 7 derniers jours | `famille.resumes_matin`, affiché en tête de l'accueil | Haiku, ~0,0003 $ |
| Affinage des habituels (§ 4.2.2) | Une fois par semaine et par foyer | `courses.previsions_ia` (date du prochain achat, phrase), utilisé par `courses.a_racheter` | Haiku, ~0,0003 $ |

1. Vers 2 h, `famille.preparer_travaux_nuit()` (pg_cron) calcule les faits **sous l'identité de chaque
   personne** (rôle `authenticated` et son identifiant, comme une requête de l'app) : les règles RLS
   s'appliquent, rien de caché n'est lu (surprises comprises). Les faits, déjà rédigés, vont dans
   `famille.ia_travaux`.
2. Toutes les 15 minutes jusqu'au matin, `ia-nuit` envoie ce travail en un lot (sauf foyers au
   plafond), relève les lots terminés, enregistre résumés, prévisions et consommation (`differe = true`).
   Elle ne lit jamais les tables des modules. Relancée, elle ne refait rien en double.

Mise en service (une fois, après la migration `20261021100000_famille_nuit.sql`) :

```bash
supabase functions deploy ia        # nouvelles routes resume-matin et doublons
supabase functions deploy ia-nuit
```

puis exécuter `supabase/planification_nuit.sql` dans l'éditeur SQL. Pour suivre une nuit :
`select nature, statut, count(*) from famille.ia_travaux where jour = current_date group by 1, 2;`

Sans la planification, l'accueil demande lui-même le résumé une fois par jour (route `resume-matin`,
prix normal) : tout marche, en un peu plus cher.

## Texte pour la politique de confidentialité (spécification § 3.6)

> **Assistant de l'app Famille.** Quand vous utilisez l'assistant (par exemple
> pour lire la photo d'une recette ou ajouter plusieurs articles d'une phrase),
> le texte, la photo ou le lien concernés sont envoyés à Anthropic, qui fournit
> le modèle d'intelligence artificielle, uniquement pour produire la réponse.
> Selon les conditions commerciales de l'API d'Anthropic, ces données ne
> servent pas à entraîner ses modèles et sont supprimées automatiquement dans
> les 30 jours (sauf obligation légale ou contenu signalé comme contraire à
> ses règles d'utilisation). L'assistant ne reçoit que ce que
> vous avez le droit de voir dans l'app : rien de ce qui vous est caché (idées
> de cadeaux, voyages surprises) ne lui est envoyé. Il ne fait aucune
> reconnaissance de visage. Pour un enfant sans compte, seuls son prénom et son
> âge peuvent être envoyés, et seulement quand c'est utile. Rien n'est
> enregistré dans l'app sans votre validation.

Sources (vérifiées le 20 octobre 2026, à relire avant publication) :
<https://privacy.claude.com/en/articles/7996866-how-long-do-you-store-my-organization-s-data>
et <https://privacy.claude.com/en/articles/7996868-is-my-data-used-for-model-training>.
