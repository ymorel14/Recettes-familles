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
//   recette-photo   photo(s) d'une recette → fiche recette pré-remplie (§ 4.1.1)
//   planning-photo  photo ou PDF d'un planning → activités et séances (§ 4.3.1)
//   objet-photo     photo d'un objet → envie (§ 4.4.2)
//   lettre-noel     lettre au Père Noël → envies de l'enfant (§ 4.4.3)
//   photo-classer   ⊕ photo : de quoi s'agit-il ? (§ 4.6.1)
//   annonce-hebergement  annonce de location → fiche d'hébergement (§ 4.5.2)
//   recette-lien    page web sans fiche recette, vidéo, ou texte collé → recette (§ 4.1.2, § 4.1.3)
//   resume-matin    résumé du matin quand rien n'a été préparé cette nuit (§ 4.6.2)
//   doublons        articles de courses ambigus : même produit ? (§ 4.2.3)
//   cuisine-question  question pendant le mode assistant en cuisine (§ 4.1.4)
//   voyage-brouillon  « Organise-nous un week-end… » → brouillon de voyage (§ 4.5.1)
//   recette-categories  classement automatique des recettes (retour de test R-4)
//   recette-ingredients lien étapes → ingrédients d'une recette (retour de test R-12)
import { servirIA } from '../_partage/ia.ts';
import { essai } from './routes/essai.ts';
import { plus } from './routes/plus.ts';
import { coursesPhrase } from './routes/courses-phrase.ts';
import { tacheDictee } from './routes/tache-dictee.ts';
import { lienEnvie } from './routes/lien-envie.ts';
import { recettePhoto } from './routes/recette-photo.ts';
import { planningPhoto } from './routes/planning-photo.ts';
import { objetPhoto } from './routes/objet-photo.ts';
import { lettreNoel } from './routes/lettre-noel.ts';
import { photoClasser } from './routes/photo-classer.ts';
import { recetteLien } from './routes/recette-lien.ts';
import { annonceHebergement } from './routes/annonce-hebergement.ts';
import { resumeMatin } from './routes/resume-matin.ts';
import { doublons } from './routes/doublons.ts';
import { cuisineQuestion } from './routes/cuisine-question.ts';
import { voyageBrouillon } from './routes/voyage-brouillon.ts';
import { recetteCategories } from './routes/recette-categories.ts';
import { recetteIngredients } from './routes/recette-ingredients.ts';

servirIA({
  essai,
  plus,
  'courses-phrase': coursesPhrase,
  'tache-dictee': tacheDictee,
  'lien-envie': lienEnvie,
  'recette-photo': recettePhoto,
  'planning-photo': planningPhoto,
  'objet-photo': objetPhoto,
  'lettre-noel': lettreNoel,
  'photo-classer': photoClasser,
  'recette-lien': recetteLien,
  'annonce-hebergement': annonceHebergement,
  'resume-matin': resumeMatin,
  doublons,
  'cuisine-question': cuisineQuestion,
  'voyage-brouillon': voyageBrouillon,
  'recette-categories': recetteCategories,
  'recette-ingredients': recetteIngredients,
});
