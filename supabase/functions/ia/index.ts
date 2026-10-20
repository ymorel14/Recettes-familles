// Fonction Edge « ia » : toutes les fonctions de l'assistant de l'app
// Famille, une route par fonctionnalité (spécification V1, § 3.1) :
//   POST /functions/v1/ia/<route>   avec le jeton de l'utilisateur
// Le travail commun (connexion, foyer, plafond, appel au modèle, comptage)
// est dans ../_partage/ia.ts. Ajouter une fonction = une consigne
// (_partage/consignes), un schéma, une route ici.
//
// Mise en service (une fois) :
//   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
//   supabase functions deploy ia
//
// Routes :
//   essai           vérifie que tout est bien branché (Moi › Assistant du foyer)
//   plus            ⊕ universel : une phrase → des actions proposées (§ 4.6.1)
//   courses-phrase  ajout de courses en phrase (§ 4.2.1)
//   tache-dictee    tâche dictée → formulaire pré-rempli (§ 4.3.2)
//   lien-envie      lien collé → fiche d'envie (§ 4.4.1)
import { servirIA } from '../_partage/ia.ts';
import { essai } from './routes/essai.ts';
import { plus } from './routes/plus.ts';
import { coursesPhrase } from './routes/courses-phrase.ts';
import { tacheDictee } from './routes/tache-dictee.ts';
import { lienEnvie } from './routes/lien-envie.ts';

servirIA({
  essai,
  plus,
  'courses-phrase': coursesPhrase,
  'tache-dictee': tacheDictee,
  'lien-envie': lienEnvie,
});
