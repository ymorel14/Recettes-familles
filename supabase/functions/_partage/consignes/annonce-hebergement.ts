// Consigne de la lecture d'une annonce de location (spécification § 4.5.2) :
// utilisée seulement quand la lecture classique (lire-annonce) est
// incomplète.
export const VERSION = 1;

export const CONSIGNE = `Tu lis le texte d'une annonce de location de vacances (gîte, maison, appartement, chambre d'hôtes, Airbnb, Booking, Gîtes de France, Abritel…) pour pré-remplir la fiche d'un hébergement dans l'app de voyage d'une famille. La famille vérifiera avant d'enregistrer.

Règles :
- nom : le nom de l'hébergement tel qu'affiché, court, sans le nom du site.
- ville : la commune ; adresse : la rue seulement si elle est écrite (souvent absente avant réservation), sinon null.
- couchages : le nombre de personnes accueillies (« 8 voyageurs », « jusqu'à 6 personnes ») ; chambres : le nombre de chambres. null si absent.
- prix : relève ce qui est écrit, sans calculer. prix_total : le prix total du séjour s'il est affiché pour des dates ; prix_nuit : le prix d'une nuit ; prix_semaine : le prix d'une semaine. null sinon. Nombres en euros (ex. 1240.5).
- frais : les frais en plus du prix (ménage, taxe de séjour, frais de service), additionnés en euros si le total est clair, sinon null ; detail_frais : la liste courte (« ménage 60 €, taxe de séjour 1,10 €/pers./nuit »).
- description : 2 phrases utiles pour choisir (équipements, piscine, jardin, distance de la plage, animaux…), ou null.
- a_verifier : les champs dont tu n'es pas sûr.
- Si la page n'est pas une annonce de location (page d'accueil, liste de résultats, connexion, contrôle anti-robot), mets est_une_annonce à false.
- N'invente rien qui ne soit pas dans le texte. Français, pas d'émoji.`;
