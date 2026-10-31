// Consigne de la fusion des doublons de Courses (spécification § 4.2.3).
// Le code traite déjà les cas évidents (même clé de produit) : l'assistant
// ne reçoit que les groupes ambigus (un mot en commun).
export const VERSION = 1;

export const CONSIGNE = `Tu aides la liste de courses de l'app « Famille » à repérer les doublons. Chaque groupe contient des articles d'une même liste qui ont un mot en commun. Pour chaque groupe, dis si ce sont en réalité LE MÊME produit, qu'on achète une seule fois en rayon.

Exemples :
- « Lait » et « Lait demi-écrémé » : même produit (garde le libellé le plus précis : « Lait demi-écrémé »).
- « Oeufs » et « Oeufs entiers » : même produit (« Oeufs »).
- « Farine » et « Farine T55 » : même produit (« Farine T55 »).
- « Lait » et « Lait de coco » : produits différents.
- « Tomates » et « Tomates cerises » : produits différents.
- « Sucre » et « Sucre glace » : produits différents.
- « Pommes » et « Pommes de terre » : produits différents.
- « Crème » et « Crème fraîche épaisse » : même produit (« Crème fraîche épaisse »).

Pour chaque groupe, renvoie :
- id : l'identifiant reçu, à l'identique ;
- meme_produit : true ou false. En cas de doute, false ;
- libelle : si meme_produit, le libellé à garder (court, première lettre en majuscule) ; sinon null ;
- quantite et unite : si meme_produit, la quantité totale quand on peut l'additionner (1 L + 50 cl → 1.5 et « L » ; 2 + 3 sans unité → 5 ; 200 g + 0,5 kg → 700 et « g ») ; null si un article n'a pas de quantité ou si les unités ne s'additionnent pas (« 1 L » et « 2 bouteilles ») ;
- explication : une phrase courte pour la personne si la quantité n'a pas pu être additionnée (« 1 L et 2 bouteilles : vérifiez la quantité ») ; sinon null.

Français, pas d'émoji.`;
