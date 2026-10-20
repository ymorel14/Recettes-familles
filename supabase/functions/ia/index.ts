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
//   essai   vérifie que tout est bien branché (écran Moi › Assistant du foyer)
import { servirIA } from '../_partage/ia.ts';
import { essai } from './routes/essai.ts';

servirIA({ essai });
