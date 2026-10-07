# Migrations Supabase

À partir de maintenant, chaque changement de la base est un fichier SQL numéroté
dans ce dossier, à exécuter une seule fois, dans l'ordre. `setup.sql` décrit
l'état d'avant et **ne doit plus être relancé** une fois la migration 1 passée.

| Fichier | Contenu |
| --- | --- |
| `20260928140000_socle_famille.sql` | Schéma `famille` commun à toutes les apps, plusieurs familles par utilisateur, famille active partagée, personnes sans compte, compatibilité avec l'app Cuisine actuelle |
| `20260928150000_wishlist.sql` | Schéma `wishlist` de CadeauCommun : événements, listes, souhaits, idées cachées, réservations anonymes |
| `20260928160000_wishlist_listes_creees.sql` | Correctif CadeauCommun : pouvoir créer sa liste (lecture de la liste qu'on vient de créer) |
| `20260928170000_wishlist_evenement_destinataire.sql` | CadeauCommun : personne fêtée d'un événement (anniversaire de…) |
| `20260928180000_wishlist_photos_budget.sql` | CadeauCommun : prix estimé ou budget, espace de stockage des photos de cadeaux |
| `20260928190000_wishlist_date_remise.sql` | CadeauCommun : date de remise des cadeaux (repas), distincte de la date de l'événement |
| `20260929090000_wishlist_pot_commun.sql` | CadeauCommun : pot commun par cadeau (participations dont seul l'auteur voit le montant ; somme réunie cachée au destinataire) |
| `20260929100000_voyage.sql` | VoyageCommun : schéma `voyage` (calendrier commun des disponibilités, voyages et invités, sondage de dates, hébergements et avis, trajets et coût carburant/péages, activités, postes de budget) |
| `20260929110000_voyage_vehicules.sql` | VoyageCommun : véhicules mémorisés par foyer, hébergements proposés par tout participant, frais communs par personne (enfants gratuits) par défaut |
| `20260929120000_voyage_activites_statut.sql` | VoyageCommun : seul un organisateur retient une activité ; un trajet garde son responsable |
| `20260929130000_voyage_adresse_foyer.sql` | VoyageCommun : adresse du foyer (départ par défaut des trajets), lisible des seuls membres du foyer |
| `20260929140000_voyage_notifications.sql` | VoyageCommun : notifications dans l'app (invitation, dates proposées et retenues, hébergement et activité proposés ou retenus), chacun ne lit que les siennes |
| `20261001100000_souvenirs.sql` | SouvenirsFamille : schéma `souvenirs` (souvenirs datés et catégorisés, personnes concernées ou présentes, photos/vidéos/audio dans l'espace privé `souvenirs-medias`, commentaires, recherche en français `souvenirs.rechercher`, « ce jour-là », souvenir créé depuis un voyage) |
| `20261001110000_souvenirs_albums.sql` | SouvenirsFamille : albums (collections de souvenirs, chacun ne voit que les souvenirs qu'il a le droit de voir), prénoms de personnes hors famille sur un souvenir, catégories « Véhicule » et « Garde d'enfants », recherche tolérante aux pluriels |
| `20261001120000_voyage_repas.sql` | VoyageCommun : repas de famille (lieu « chez » un foyer, plusieurs repas par événement, plats de l'apéritif aux boissons liés aux recettes de Cuisine, étapes et plats confiés à des personnes, listes de cadeaux liées ; dates d'un seul jour). Après `souvenirs` ; nécessite les schémas `recettes` et `wishlist` |
| `20261001130000_recettes_surprise.sql` | Cuisine : recettes surprises — une recette peut être cachée au reste de la famille (visible de son foyer) ou à tous sauf à celui qui l'a cachée, avec une date de révélation automatique facultative ; garanti par les règles RLS (aussi pour VoyageCommun) |
| `20261001140000_quitter_foyer.sql` | Compte famille : quitter son foyer (`famille.quitter_foyer`) ou en retirer un membre avec compte (`famille.retirer_du_foyer`, administrateur ou créateur du foyer ; le créateur ne peut pas être retiré). La personne reste dans ses familles, sa fiche et ses listes la suivent, le foyer garde ses recettes et courses ; un autre membre devient administrateur s'il n'en reste plus |
| `20261002100000_voyage_surprises.sql` | VoyageCommun : voyages et repas surprises — un organisateur cache l'événement à certaines personnes (elles ne voient rien, même invitées, ni notification) ou désigne une personne fêtée (elle voit seulement le titre, les dates, le lieu d'un repas et un mot), garanti par les règles RLS ; le secret tombe le lendemain de la fin |
| `20261002110000_recettes_variantes.sql` | Cuisine : variantes d'un élément de recette (ex. curd au citron *ou* appareil à l'orange, pâte sablée *ou* pâte brisée) — un élément peut en remplacer un autre de la même recette (`elements.variante_de`), chacun avec ses ingrédients et étapes ; on choisit la version au moment de cuisiner |
| `20261003100000_wishlist_transfert_liste.sql` | CadeauCommun : transférer le contenu d'une liste dans une autre avant de la supprimer (`wishlist.transferer_liste`) ; réservations et participations suivent leur cadeau, et vers une autre personne tout devient idée cachée pour elle |
| `20261003110000_wishlist_options.sql` | CadeauCommun : options d'un souhait (modèles, variantes), un exemplaire par option — « un au choix » (réserver un modèle réserve le souhait, seul le donateur sait lequel) ou « plusieurs à offrir » (chaque option se réserve séparément) ; état anonyme via `wishlist.etat_options`, refusé au destinataire ; incompatible avec le pot commun |
| `20261003120000_wishlist_pot_un_au_choix.sql` | CadeauCommun : pot commun autorisé sur un souhait « un au choix » (un seul article offert, les modèles servent d'indication) ; seul « plusieurs à offrir » reste incompatible avec le pot |
| `20261003130000_photos_profil.sql` | Compte famille : photo de profil de chaque personne (`famille.personnes.photo`, espace privé `famille-photos`, adresses signées), affichée à côté des prénoms dans toutes les apps ; chacun change la sienne, les membres d'un foyer celles de ses personnes sans compte, et les gestionnaires des photos (`famille.gestionnaires_photos`, au départ ymorel76@gmail.com) celles de toute leur famille, via `famille.definir_photo_personne` |
| `20261007100000_wishlist_liste_unique.sql` | CadeauCommun : **une seule liste par personne** — fusion des listes existantes (les réservations et participations gardent l'événement de leur ancienne liste) ; l'événement est choisi en réservant (obligatoire, à venir, concernant la personne ; un pot = un événement) ; les cadeaux d'un événement passé sont considérés comme offerts (`wishlist.souhaits_offerts`, `options_offertes`) ; liste ouverte ou créée par `wishlist.liste_de` |
| `20261007110000_wishlist_sans_evenements.sql` | CadeauCommun : **plus de notion d'événement** (les événements relèvent de VoyageCommun ; la table `wishlist.evenements` reste pour elle) — réserver et participer sans événement ; le donateur coche « offert » (`reservations.offert_le`, `participations.offert_le`) et le cadeau disparaît alors de la liste ; reprise : ce qui était réservé pour un événement passé est marqué offert |

## Exécution

1. Sauvegarder la base (Dashboard > Database > Backups), idéalement tester d'abord
   sur une copie du projet.
2. Dashboard > SQL Editor : coller et exécuter les migrations dans l'ordre (1, 2, 3…).
   Chaque fichier est une transaction : en cas d'erreur, rien n'est modifié.
3. Project Settings > API > Exposed schemas : ajouter `famille`, `wishlist`, `voyage` et `souvenirs`
   (à côté de `public` et `recettes`).
4. Vérifier que l'app Cuisine fonctionne toujours (connexion, recettes, courses,
   profil). Elle passe par les vues de compatibilité laissées dans `recettes`.

## Fonctions Edge

- `calcul-trajet` (VoyageCommun) : distance, durée et prix moyen du carburant pour un trajet en voiture
  (Géoplateforme IGN, prix-carburants). À déployer une fois : `supabase functions deploy calcul-trajet`
  (aucune clé nécessaire). Sans elle, l'app laisse saisir la distance à la main.
- `lire-annonce` (VoyageCommun) : lit une annonce ou le site d'une activité (titre, photo, adresse, prix…)
  pour préremplir les fiches. `supabase functions deploy lire-annonce` (aucune clé). Certains sites
  (Airbnb, Booking) bloquent souvent la lecture : on complète alors à la main.

- `transfert-session` (toutes les apps, téléphone) : « Continuer avec mon compte » — une app déjà
  connectée transmet la connexion à une autre app de la famille sur le même téléphone (code de connexion
  à usage unique, sans email envoyé). `supabase functions deploy transfert-session` (aucune clé : la
  fonction utilise la clé de service fournie par Supabase). Conseillé : Authentication > Providers > Email
  > « Email OTP Expiration » à quelques minutes.

## Site web commun (une seule connexion)

Authentication > URL Configuration : mettre l'adresse du site commun en « Site URL » et ajouter
`https://<site>/**` aux « Redirect URLs » (les emails de confirmation renvoient vers l'app concernée,
ex. `https://<site>/voyages/`).

## Limite connue pendant la transition

Les anciennes versions de l'app Cuisine (avant le passage au schéma `famille`)
continuent de fonctionner sur la famille active, sauf pour changer son prénom
depuis l'écran Profil (l'enregistrement passe par une vue). La version à jour
n'a pas cette limite.

## Nettoyage, plus tard

Quand toutes les installations sont à jour, une migration pourra supprimer les
vues et fonctions de compatibilité du schéma `recettes`, **sauf la vue
`recettes.foyers`**, utilisée en permanence par l'app pour afficher le nom du
foyer d'une recette ou d'un essai.
