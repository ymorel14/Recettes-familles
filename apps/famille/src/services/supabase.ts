import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';
import { configurerFamille, schemaFamille } from '@apps-famille/famille';

// Client Supabase de l'app Famille : le MÊME projet et les MÊMES schémas que
// les six apps actuelles (famille, recettes, courses, quotidien, wishlist,
// voyage, souvenirs). Rien n'est copié ni déplacé : les deux versions lisent
// et écrivent les mêmes données, avec les mêmes règles RLS.
//
// Une seule session pour toute l'app ; chaque module passe par
// clientPourSchema('<schéma>'), qui envoie ses .from() et .rpc() vers son
// schéma (comme le faisait le « schéma par défaut » de chaque app).
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    "Supabase n'est pas configuré : renseignez EXPO_PUBLIC_SUPABASE_URL et " +
      'EXPO_PUBLIC_SUPABASE_ANON_KEY dans apps/famille/.env (voir .env.example).'
  );
}

export const supabase = createClient(supabaseUrl ?? '', supabaseAnonKey ?? '', {
  db: { schema: 'famille' },
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: Platform.OS === 'web',
  },
});

// Pas d'« app » déclarée : l'app Famille ne participe pas au passage de
// connexion entre les anciennes apps (inutile dans l'app unique).
// Une seule vue pour toutes les familles du foyer (retour de test G-2) : plus
// de « famille affichée » à choisir.
configurerFamille(supabase, { vueToutesFamilles: true });
export { schemaFamille };

// Chemin de l'app sur le site web commun (/famille), à côté des six apps
// actuelles qui gardent leurs adresses.
export const BASE_WEB = (process.env.EXPO_PUBLIC_BASE_WEB ?? '').replace(/\/$/, '');

export const URL_RETOUR_EMAIL: string | undefined =
  Platform.OS === 'web' && typeof window !== 'undefined' ? `${window.location.origin}${BASE_WEB}/` : undefined;

// Client d'un module : mêmes session, stockage et temps réel ; seules les
// requêtes .from() et .rpc() vont dans le schéma du module.
const clients = new Map<string, SupabaseClient<any, any, any>>();
export function clientPourSchema(schema: string): SupabaseClient<any, any, any> {
  const existant = clients.get(schema);
  if (existant) return existant;
  const client = new Proxy(supabase, {
    get(cible, propriete) {
      if (propriete === 'from') return (table: string) => cible.schema(schema).from(table);
      if (propriete === 'rpc') return (fn: string, args?: any, options?: any) => cible.schema(schema).rpc(fn, args, options);
      const valeur = Reflect.get(cible, propriete, cible);
      return typeof valeur === 'function' ? valeur.bind(cible) : valeur;
    },
  }) as SupabaseClient<any, any, any>;
  clients.set(schema, client);
  return client;
}

if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (etat) => {
    if (etat === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}
