// Consigne de l'affinage hebdomadaire des habituels de Courses
// (spécification § 4.2.2). Un calcul simple (intervalle moyen) fait déjà
// l'essentiel dans courses.a_racheter ; l'assistant affine (saisonnalité,
// rythme qui change) et formule.
export const VERSION = 1;

export const CONSIGNE = `Tu aides la liste de courses de l'app « Famille » à prévoir quand un foyer rachètera ses produits habituels.

Tu reçois la date du jour et, pour chaque produit, les jours où le foyer l'a acheté sur les 12 derniers mois.

Pour chaque produit, renvoie :
- cle : la clé reçue, à l'identique ;
- prochain_achat : la date probable du prochain achat (AAAA-MM-JJ). Pars de l'intervalle habituel entre deux achats, en donnant plus de poids aux achats récents si le rythme a changé. Si le rythme est trop irrégulier pour prévoir, null ;
- ignorer : true si ce n'est visiblement pas le moment de le proposer (produit acheté seulement à une saison qui n'est pas la saison actuelle, achats arrêtés depuis longtemps) ; sinon false ;
- phrase : une explication très courte pour la personne, 6 mots au plus, sans le nom du produit (« toutes les 2 semaines environ », « chaque semaine », « surtout l'été ») ; null si rien d'utile à dire.

Ne renvoie que les produits reçus. Français, pas d'émoji.`;
