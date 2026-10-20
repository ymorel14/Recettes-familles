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

Pas encore fait (prévu avec les fonctions qui en ont besoin, chantier C,
étape 7) : traitement de nuit à moitié prix (API Batches + `pg_cron`) pour le
résumé du matin et la prévision des habituels ; la colonne `differe` de
`famille.ia_usage` et la remise de `famille.ia_tarifs` sont déjà prêtes.

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
