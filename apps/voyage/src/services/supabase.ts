import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';
import { configurerFamille, schemaFamille, urlRetourEmail } from '@apps-famille/famille';

// Client Supabase de VoyageCommun : même projet Supabase que Cuisine et
// CadeauCommun (mêmes comptes, mêmes familles), mais les données de l'app
// vivent dans le schéma "voyage" (supabase/migrations/20260929100000_voyage.sql),
// qui est donc le schéma par défaut des requêtes .from(...).
// Le compte famille (schéma "famille") passe par le paquet commun
// packages/famille, auquel ce client est confié ci-dessous.
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    "Supabase n'est pas configuré : renseignez EXPO_PUBLIC_SUPABASE_URL et " +
      'EXPO_PUBLIC_SUPABASE_ANON_KEY dans apps/voyage/.env (voir .env.example).'
  );
}

export const supabase = createClient(supabaseUrl ?? '', supabaseAnonKey ?? '', {
  db: { schema: 'voyage' },
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: Platform.OS === 'web',
  },
});

// app et baseWeb : connexion partagée entre les apps de la famille (site web
// commun, « Continuer avec mon compte » sur téléphone).
configurerFamille(supabase, { app: 'voyagecommun', baseWeb: process.env.EXPO_PUBLIC_BASE_WEB });
export { schemaFamille };

// Adresse de retour des emails de confirmation (version web uniquement).
export const URL_RETOUR_EMAIL: string | undefined = urlRetourEmail();

// Sur téléphone, le renouvellement du jeton ne tourne qu'au premier plan
// (recommandation Supabase pour React Native).
if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (etat) => {
    if (etat === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}
