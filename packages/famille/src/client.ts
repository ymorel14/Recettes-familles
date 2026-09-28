import type { SupabaseClient } from '@supabase/supabase-js';

// Chaque app crée son propre client Supabase (schéma par défaut, stockage de
// session, options propres à l'app) et le confie à ce paquet au démarrage
// avec configurerFamille(). Le compte famille passe ensuite par ce client,
// sur le schéma "famille".
let client: SupabaseClient<any, any, any> | null = null;

export function configurerFamille(clientSupabase: SupabaseClient<any, any, any>): void {
  client = clientSupabase;
}

export function clientSupabase(): SupabaseClient<any, any, any> {
  if (!client) {
    throw new Error(
      'Compte famille non configuré : appeler configurerFamille(supabase) au démarrage de l\u2019app.'
    );
  }
  return client;
}

// Requêtes sur le schéma "famille" (familles, foyers, membres, profils,
// codes d'invitation, famille active).
export const schemaFamille = () => clientSupabase().schema('famille');
