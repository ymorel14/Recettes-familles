import { Platform } from 'react-native';

// Les apps de la famille : nom affiché, adresse (« scheme ») qui ouvre l'app
// sur téléphone, et chemin de l'app sur le site web commun (un seul site,
// une seule connexion : voir scripts/construire-site.mjs).
export type IdAppFamille = 'cuisine' | 'cadeaucommun' | 'voyagecommun' | 'souvenirsfamille' | 'quotidien' | 'courses';

export type AppFamille = {
  id: IdAppFamille;
  nom: string;
  // Identique au champ "scheme" de son app.json.
  scheme: string;
  // Chemin sur le site commun (ex. https://…/voyages/).
  cheminWeb: string;
  icone: string;
};

export const APPS_FAMILLE: AppFamille[] = [
  { id: 'cuisine', nom: 'Recettes familiales', scheme: 'recettesfamiliales', cheminWeb: '/cuisine', icone: 'restaurant-outline' },
  { id: 'cadeaucommun', nom: 'CadeauCommun', scheme: 'cadeaucommun', cheminWeb: '/cadeaux', icone: 'gift-outline' },
  { id: 'voyagecommun', nom: 'VoyageCommun', scheme: 'voyagecommun', cheminWeb: '/voyages', icone: 'airplane-outline' },
  { id: 'souvenirsfamille', nom: 'SouvenirsFamille', scheme: 'souvenirsfamille', cheminWeb: '/souvenirs', icone: 'images-outline' },
  { id: 'quotidien', nom: 'Quotidien', scheme: 'quotidienfamille', cheminWeb: '/quotidien', icone: 'today-outline' },
  { id: 'courses', nom: 'Courses', scheme: 'coursesfamille', cheminWeb: '/courses', icone: 'cart-outline' },
];

let appCourante: AppFamille | null = null;
let base = '';

// Appelée au démarrage par configurerFamille(supabase, { app, baseWeb }).
export function definirAppCourante(id: IdAppFamille, cheminSurLeSite?: string): void {
  appCourante = APPS_FAMILLE.find((a) => a.id === id) ?? null;
  const propre = (cheminSurLeSite ?? '').trim().replace(/\/$/, '');
  base = propre && !propre.startsWith('/') ? `/${propre}` : propre;
}

export function obtenirAppCourante(): AppFamille | null {
  return appCourante;
}

export function appParScheme(scheme: string | null | undefined): AppFamille | null {
  return APPS_FAMILLE.find((a) => a.scheme === scheme) ?? null;
}

// Chemin de l'app sur le site web commun ('' hors du site commun, par
// exemple en développement). Fixé à la construction du site par la
// variable EXPO_PUBLIC_BASE_WEB (voir app.config.js de chaque app), que
// l'app transmet à configurerFamille().
export function baseWeb(): string {
  return base;
}

// Adresse vers laquelle renvoient les liens reçus par email (confirmation
// d'inscription) : l'app elle-même sur le web, sous son chemin du site
// commun. Sur téléphone : non précisée, Supabase utilise la « Site URL ».
export function urlRetourEmail(): string | undefined {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return undefined;
  return `${window.location.origin}${baseWeb()}/`;
}

// --- Adresses web sous le chemin de l'app (site commun) -------------------
// À brancher dans les « linking » de React Navigation :
//   getStateFromPath: (chemin, o) => etatDepuisCheminWeb(chemin, (c) => getStateFromPath(c, o)),
//   getPathFromState: (etat, o) => `${baseWeb()}${getPathFromState(etat, o)}`,

// "/voyages/voyage/12" → "/voyage/12" (adresse vue par la navigation).
export function sansBaseWeb(chemin: string): string {
  if (!base || !chemin.startsWith(base)) return chemin;
  const reste = chemin.slice(base.length);
  return reste.startsWith('/') ? reste : `/${reste}`;
}

// React Navigation garde l'adresse d'origine dans l'état (route.path) et la
// remet telle quelle dans la barre d'adresse : on lui laisse l'adresse
// complète, préfixe compris, sinon un rechargement de page le perdait
// (/voyages/voyage/12 devenait /voyage/12).
export function etatDepuisCheminWeb<T>(chemin: string, lire: (cheminSansBase: string) => T): T {
  const etat = lire(sansBaseWeb(chemin));
  const remettre = (e: any): any =>
    e && Array.isArray(e.routes)
      ? {
          ...e,
          routes: e.routes.map((r: any) => ({
            ...r,
            ...(typeof r.path === 'string' ? { path: chemin } : {}),
            ...(r.state ? { state: remettre(r.state) } : {}),
          })),
        }
      : e;
  return remettre(etat);
}
