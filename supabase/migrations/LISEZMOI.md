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
