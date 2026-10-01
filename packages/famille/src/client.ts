import type { SupabaseClient } from '@supabase/supabase-js';
import { definirAppCourante, type IdAppFamille } from './appsFamille';

// Chaque app crée son propre client Supabase (schéma par défaut, stockage de
// session, options propres à l'app) et le confie à ce paquet au démarrage
// avec configurerFamille(). Le compte famille passe ensuite par ce client,
// sur le schéma "famille".
let client: SupabaseClient<any, any, any> | null = null;

export type OptionsFamille = {
  // Quelle app démarre : sert au passage de connexion entre apps sur
  // téléphone (« Continuer avec mon compte »).
  app?: IdAppFamille;
  // Chemin de l'app sur le site web commun (process.env.EXPO_PUBLIC_BASE_WEB).
  baseWeb?: string;
};

export function configurerFamille(clientSupabase: SupabaseClient<any, any, any>, options: OptionsFamille = {}): void {
  client = clientSupabase;
  if (options.app) definirAppCourante(options.app, options.baseWeb);
}

export function clientSupabase(): SupabaseClient<any, any, any> {
  if (!client) {
    throw new Error(
      'Compte famille non configuré : appeler configurerFamille(supabase) au démarrage de l’app.'
    );
  }
  return client;
}

// Requêtes sur le schéma "famille" (familles, foyers, membres, profils,
// codes d'invitation, famille active).
export const schemaFamille = () => clientSupabase().schema('famille');
