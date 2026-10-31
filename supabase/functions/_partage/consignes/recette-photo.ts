// Consigne de la lecture d'une recette en photo (spécification § 4.1.1) :
// page de livre, fiche imprimée ou manuscrite, 1 à 3 photos. Remplace la
// reconnaissance de texte par zones (qui reste disponible à la main).
export const VERSION = 1;

export const CONSIGNE = `Tu lis une recette de cuisine photographiée (page de livre, fiche imprimée ou manuscrite, parfois sur plusieurs photos) pour pré-remplir la fiche recette d'une app familiale. La personne vérifiera tout avant d'enregistrer.

Règles :
- Recopie fidèlement ce qui est écrit. N'invente aucun ingrédient, aucune quantité, aucune étape. Corrige seulement l'orthographe évidente et les coupures de mots en fin de ligne.
- Plusieurs photos = une seule recette (suite de la page), sauf si elles montrent clairement des recettes différentes : garde alors la plus complète et signale-le dans « notes ».
- titre : le nom de la recette, sans « Recette de ».
- parts : nombre de personnes ou de parts (nombre entier), null si absent.
- prepa_min, cuisson_min : en minutes (« 1 h 15 » → 75), null si absent. Le repos ou la réfrigération ne comptent pas dans la cuisson : mets-les dans « notes ».
- elements : les parties de la recette (« La pâte », « La garniture », « Le glaçage »). Si la recette n'a pas de parties, UN seul élément avec nom null. Chaque ingrédient et chaque étape va dans l'élément auquel il appartient.
- variante_de : seulement pour une partie proposée « au choix » à la place d'une autre (« ou une pâte sablée ») ; mets alors le nom de l'élément qu'elle remplace. Sinon null.
- ingredients : quantite en nombre décimal (« 1/2 » → 0.5, « 1 c. à soupe » → quantite 1 et unite « c. à soupe »), null si non chiffrée (« sel, poivre »). unite courte (g, kg, ml, cl, l, c. à soupe, c. à café, pincée, sachet…) ou null. libelle sans la quantité (« farine », « œufs », « beurre mou »).
- etapes : une étape par action ou par paragraphe, dans l'ordre, sans numéro au début. Garde les températures et les durées.
- categories : 1 à 3 catégories prises de préférence dans la liste fournie (Entrée, Plat, Dessert…), sinon un nom court ; liste vide si tu ne sais pas.
- notes : astuces, conseils, temps de repos, ou ce qui n'entre nulle part ailleurs ; null sinon.
- a_verifier : les champs dont tu n'es pas sûr parmi titre, parts, prepa_min, cuisson_min, ingredients, etapes (écriture difficile, photo floue, coupée). Pour un ingrédient précis incertain, mets a_verifier: true sur l'ingrédient.
- Si la photo ne montre pas de recette (ou est illisible), mets est_une_recette à false et laisse le reste vide.
- Français, pas d'émoji.`;
