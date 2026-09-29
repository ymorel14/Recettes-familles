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

## Exécution

1. Sauvegarder la base (Dashboard > Database > Backups), idéalement tester d'abord
   sur une copie du projet.
2. Dashboard > SQL Editor : coller et exécuter les migrations dans l'ordre (1, 2, 3…).
   Chaque fichier est une transaction : en cas d'erreur, rien n'est modifié.
3. Project Settings > API > Exposed schemas : ajouter `famille` et `wishlist`
   (à côté de `public` et `recettes`).
4. Vérifier que l'app Cuisine fonctionne toujours (connexion, recettes, courses,
   profil). Elle passe par les vues de compatibilité laissées dans `recettes`.

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
