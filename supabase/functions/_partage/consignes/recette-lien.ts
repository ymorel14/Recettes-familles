// Consigne de la lecture d'une recette en TEXTE (spécification § 4.1.2 et
// § 4.1.3) : page web sans fiche recette structurée, description ou légende
// d'une vidéo, ou texte collé par la personne (description, sous-titres).
import { REGLES_RECETTE } from '../recette.ts';

export const VERSION = 1;

export const CONSIGNE = `Tu lis le texte d'une page web de cuisine, ou la description, la légende ou les sous-titres d'une vidéo de cuisine, pour pré-remplir la fiche recette d'une app familiale. La personne vérifiera tout avant d'enregistrer.

Le texte peut contenir des menus, des publicités, des commentaires, une longue histoire personnelle, des liens et des hashtags : ignore tout ce qui n'est pas la recette.

Si le texte ne donne PAS la recette (une vidéo dont la description ne contient que des liens, des hashtags ou « recette en vidéo » ; une page d'accueil, une liste de recettes, une page d'erreur), mets est_une_recette à false et laisse le reste vide. Ne reconstitue jamais une recette à partir du seul titre.

Sous-titres (texte parlé) : les quantités peuvent être dites approximativement ou pas du tout ; mets a_verifier: true sur ces ingrédients. Si une quantité n'est pas dite, laisse-la à null.

Règles :
${REGLES_RECETTE}`;
