# Migrations Supabase

À partir de maintenant, chaque changement de la base est un fichier SQL numéroté
dans ce dossier, à exécuter une seule fois, dans l'ordre. `setup.sql` décrit
l'état d'avant et **ne doit plus être relancé** une fois la migration 1 passée.

| Fichier | Contenu |
| --- | --- |
| `20260928140000_socle_famille.sql` | Schéma `famille` commun à toutes les apps, plusieurs familles par utilisateur, famille active partagée, personnes sans compte, compatibilité avec l'app Cuisine actuelle |
| `20260928150000_wishlist.sql` | Schéma `wishlist` de CadeauCommun : événements, listes, souhaits, idées cachées, réservations anonymes |

## Exécution

1. Sauvegarder la base (Dashboard > Database > Backups), idéalement tester d'abord
   sur une copie du projet.
2. Dashboard > SQL Editor : coller et exécuter la migration 1, puis la migration 2.
   Chaque fichier est une transaction : en cas d'erreur, rien n'est modifié.
3. Project Settings > API > Exposed schemas : ajouter `famille` et `wishlist`
   (à côté de `public` et `recettes`).
4. Vérifier que l'app Cuisine fonctionne toujours (connexion, recettes, courses,
   profil). Elle passe par les vues de compatibilité laissées dans `recettes`.

## Limite connue pendant la transition

Tant que l'app Cuisine n'est pas mise à jour, changer son prénom depuis l'écran
Profil échoue (l'enregistrement passe par une vue). Tout le reste fonctionne,
sur la famille active.
