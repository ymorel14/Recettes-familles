// Paquet commun aux apps de la famille (Cuisine, CadeauCommun…) : compte
// famille, foyers, profils, famille active, parcours d'invitation.
//
// Au démarrage de chaque app : configurerFamille(clientSupabaseDeLApp), puis
// envelopper l'app dans <AuthProvider>. Les écrans lisent la session, la
// famille active et le foyer avec useAuth().

export { configurerFamille, clientSupabase, schemaFamille, type OptionsFamille } from './client';
export * from './types';
export * from './famille';
export * from './profils';
export { AuthProvider, useAuth } from './AuthContext';
// Une seule connexion pour toutes les apps : site web commun (même adresse,
// donc même session) et, sur téléphone, « Continuer avec mon compte ».
export * from './appsFamille';
export * from './connexionPartagee';
export { PassageConnexion, type PolicesFamille } from './PassageConnexion';
export { ConnexionAutresApps } from './ConnexionAutresApps';
// Retour à l'accueil du site commun (choix de l'app), sans se reconnecter.
export { BoutonAppsFamille } from './BoutonAppsFamille';
// Photos de profil, communes à toutes les apps : petite photo ronde à côté
// des prénoms (<Avatar>, <NomAvecAvatar>) et section « Ma photo » du Profil.
export * from './photos';
export { Avatar, NomAvecAvatar, GroupeNoms, type ProprietesAvatar } from './Avatar';
export { PhotosProfil } from './PhotosProfil';
// Visibilité des enfants famille par famille (familles recomposées) :
// réglage du Profil et liste des personnes masquées dans la famille active.
export * from './visibilite';
export { VisibiliteEnfants } from './VisibiliteEnfants';
