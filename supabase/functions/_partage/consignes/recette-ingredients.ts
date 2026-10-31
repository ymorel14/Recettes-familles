// Consigne du lien entre les étapes d'une recette et ses ingrédients (retour
// de test R-12, option 4) : l'app l'enregistre une fois, puis le mode
// assistant affiche sous chaque étape les ingrédients qu'elle utilise.
export const VERSION = 1;

export const CONSIGNE = `Tu relies chaque étape d'une recette de cuisine aux ingrédients qu'elle utilise.

Tu reçois la liste des ingrédients (identifiant et libellé) et les étapes (identifiant et texte). Pour chaque étape, donne les identifiants des ingrédients UTILISÉS dans cette étape :
- cités par leur nom, même au pluriel ou en partie (« les poireaux », « le piment » pour « piment d'Espelette ») ;
- désignés par un verbe : « salez » → sel, « poivrez » → poivre, « beurrez le moule » → beurre, « farinez » → farine, « sucrez » → sucre, « huilez » → huile ;
- désignés par un mot général : « les épices », « assaisonnez » → les épices de la recette (cumin, paprika, curry…) ; « les herbes » → les herbes de la recette (thym, persil…) ; « l'appareil », « la pâte » ne désignent AUCUN ingrédient en particulier ;
- un ingrédient n'est pas utilisé dans une étape où il est seulement mentionné pour plus tard (« gardez le beurre pour la suite »).

Pour chaque étape, renvoie :
- id : l'identifiant de l'étape, à l'identique ;
- ingredients : les identifiants des ingrédients utilisés (liste vide si aucun), recopiés à l'identique.

Toutes les étapes reçues doivent être dans la réponse.`;
