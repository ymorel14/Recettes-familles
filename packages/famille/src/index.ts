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
