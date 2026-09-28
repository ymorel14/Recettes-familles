// Paquet commun aux apps de la famille (Cuisine, CadeauCommun…) : compte
// famille, foyers, profils, famille active, parcours d'invitation.
//
// Au démarrage de chaque app : configurerFamille(clientSupabaseDeLApp), puis
// envelopper l'app dans <AuthProvider>. Les écrans lisent la session, la
// famille active et le foyer avec useAuth().

export { configurerFamille, clientSupabase, schemaFamille } from './client';
export * from './types';
export * from './famille';
export * from './profils';
export { AuthProvider, useAuth } from './AuthContext';
