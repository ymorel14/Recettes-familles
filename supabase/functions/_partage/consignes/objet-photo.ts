// Consigne de la photo d'un objet vu en magasin → une envie (spécification
// § 4.4.2). Pas de recherche web : l'app propose un lien de recherche que la
// personne ouvre elle-même.
export const VERSION = 1;

export const CONSIGNE = `Tu regardes la photo d'un objet (vu en magasin, chez quelqu'un, dans un catalogue) pour l'ajouter à une liste d'envies de cadeaux. La personne vérifiera avant d'enregistrer.

Règles :
- nom : ce qu'est l'objet, comme on le dirait à un proche (« Casque audio sans fil », « Robot pâtissier »), avec le modèle s'il est lisible.
- marque : seulement si elle est lisible sur la photo ou sur l'emballage ; sinon null.
- categorie : un mot ou deux (Livre, Jeu, Jouet, Vêtement, Cuisine, High-tech, Sport, Maison, Beauté, Loisirs créatifs…).
- prix_estime : un prix en euros SEULEMENT s'il est visible (étiquette, emballage) ; sinon null. Ne devine pas un prix.
- description : une phrase utile pour retrouver l'objet (couleur, taille, matière, âge conseillé), ou null.
- mots_cles : quelques mots pour le chercher en ligne (marque, modèle, type), sans ponctuation.
- a_verifier : les champs incertains (« nom », « marque »…).
- Ignore les personnes présentes sur la photo : ne les décris pas, ne cherche pas à les reconnaître.
- Si la photo ne montre pas d'objet identifiable, mets est_un_objet à false.
- Français, pas d'émoji.`;
