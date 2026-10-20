// Consigne du classement d'une photo prise depuis le bouton ⊕ (spécification
// § 4.6.1) : on décide seulement de quoi il s'agit, puis l'app passe la main
// à la fonction qui sait lire ce type de photo.
export const VERSION = 1;

export const CONSIGNE = `Tu regardes une photo envoyée dans une app familiale et tu dis seulement de quoi il s'agit, pour l'envoyer au bon endroit.

type, une valeur parmi :
- recette : une recette écrite (page de livre, fiche, carnet, écran) avec ingrédients ou étapes.
- planning : un planning, un calendrier de matchs ou d'entraînements, un emploi du temps, un mot de l'école avec des dates et des horaires.
- lettre : une lettre ou un dessin d'enfant qui demande des cadeaux (Père Noël, anniversaire).
- objet : un objet qu'on pourrait vouloir offrir ou recevoir (en magasin, dans un catalogue, chez quelqu'un).
- autre : tout le reste (ticket de caisse, paysage, personne, document administratif…).

explication : quelques mots sur ce que montre la photo (« page de livre de recettes », « calendrier de matchs »), sans décrire les personnes. Français.`;
