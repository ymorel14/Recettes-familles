import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

// Client Supabase — backend retenu au §3 de la feuille de route (cahier des charges, onglet 2).
//
// Ce projet réutilise un projet Supabase EXISTANT (pour rester dans les 2 projets du
// plan gratuit) plutôt que d'en créer un nouveau. Pour ne pas entrer en collision avec
// les tables d'une autre application hébergée sur ce même projet, toutes les tables de
// l'app recettes vivent dans un schéma Postgres dédié : "recettes" (voir supabase/setup.sql).
//
// L'authentification, elle, N'EST PAS cloisonnée par schéma : elle reste celle du projet
// (table auth.users), donc les membres du foyer se connectent avec les mêmes comptes que
// votre autre application, comme demandé.
//
// Les valeurs viennent des variables d'environnement EXPO_PUBLIC_* (voir .env.example).
// Elles sont à renseigner dans un fichier .env local (non versionné) avec l'URL et la clé
// anonyme de votre projet Supabase existant (Project Settings > API).
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    "Supabase n'est pas configuré : renseignez EXPO_PUBLIC_SUPABASE_URL et " +
      'EXPO_PUBLIC_SUPABASE_ANON_KEY dans un fichier .env (voir .env.example).'
  );
}

export const supabase = createClient(supabaseUrl ?? '', supabaseAnonKey ?? '', {
  db: {
    // Toutes les requêtes .from(...) de l'app pointent vers le schéma "recettes"
    // par défaut, isolé des tables d'une éventuelle autre application du même projet.
    schema: 'recettes',
  },
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// Stockage des photos : utiliser un bucket au nom distinct (ex. "recettes-photos"),
// pour ne pas entrer en collision avec un bucket déjà utilisé par une autre application
// sur ce même projet Supabase.
export const BUCKET_PHOTOS_RECETTES = 'recettes-photos';
