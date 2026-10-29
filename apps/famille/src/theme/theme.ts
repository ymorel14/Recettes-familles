import { Platform, StyleSheet, useWindowDimensions } from 'react-native';
import {
  ARRONDIS,
  COULEURS_MODULES,
  ESPACES,
  HAUTEURS,
  JETONS,
  MARGE_PAGE,
  POLICES,
  type CouleursModule,
  type IdModule,
  type Jetons,
  type Mode,
} from './jetons';

export * from './jetons';

// Un seul thème pour toute l'app (thème « Famille » de la charte), en clair
// ou en sombre. Comme dans packages/theme, les couleurs sont des objets
// MUTABLES : changer de mode remplace leur contenu en place, puis l'app est
// redessinée (voir PreferencesContext). Les styles créés avec creerStyles()
// sont recalculés au premier accès après un changement.

export const couleurs: Jetons = { ...JETONS.clair };
const couleursModules: Record<IdModule, CouleursModule> = {
  recettes: { ...COULEURS_MODULES.clair.recettes },
  courses: { ...COULEURS_MODULES.clair.courses },
  quotidien: { ...COULEURS_MODULES.clair.quotidien },
  cadeaux: { ...COULEURS_MODULES.clair.cadeaux },
  voyages: { ...COULEURS_MODULES.clair.voyages },
  souvenirs: { ...COULEURS_MODULES.clair.souvenirs },
};

let modeActif: Mode = 'clair';
let version = 0;
const abonnes = new Set<() => void>();

export function modeActuel(): Mode {
  return modeActif;
}

export function versionTheme(): number {
  return version;
}

export function couleursModule(id: IdModule): CouleursModule {
  return couleursModules[id];
}

// Appelé par les thèmes des modules pour recalculer leurs couleurs dérivées.
export function surChangementDeMode(rappel: () => void): void {
  abonnes.add(rappel);
}

export function appliquerMode(mode: Mode): void {
  modeActif = mode;
  Object.assign(couleurs, JETONS[mode]);
  (Object.keys(couleursModules) as IdModule[]).forEach((id) => Object.assign(couleursModules[id], COULEURS_MODULES[mode][id]));
  version += 1;
  abonnes.forEach((r) => r());
}

export const EST_WEB = Platform.OS === 'web';
// Tablettes et grands écrans (retour de test G-5) : plus de colonne étroite
// de 760 px ; l'app prend toute la largeur (jusqu'à 1280 px sur un grand
// écran d'ordinateur) et se réorganise au-delà de 700 px.
export const LARGEUR_MAX_WEB = 1280;
export const SEUIL_ECRAN_LARGE = 700;
// Feuilles et fenêtres : centrées, de largeur raisonnable sur grand écran.
export const LARGEUR_FEUILLE_LARGE = 600;

export function useLargeurContenu(): { width: number; height: number } {
  const { width, height } = useWindowDimensions();
  return { width: EST_WEB ? Math.min(width, LARGEUR_MAX_WEB) : width, height };
}

// Vrai sur tablette, téléphone en paysage large et ordinateur.
export function useEcranLarge(): boolean {
  return useLargeurContenu().width >= SEUIL_ECRAN_LARGE;
}

// Remplace StyleSheet.create : styles recalculés après un changement de mode.
export function creerStyles<T extends StyleSheet.NamedStyles<T>>(fabrique: () => T): T {
  let cache: T | null = null;
  let versionCache = -1;
  const obtenir = (): T => {
    if (!cache || versionCache !== version) {
      cache = StyleSheet.create(fabrique());
      versionCache = version;
    }
    return cache;
  };
  return new Proxy({} as T, { get: (_c, p) => (obtenir() as any)[p] });
}

// Transparence d'une couleur #RRGGBB.
export function transparent(hex: string, opacite: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${opacite})`;
}

export const polices = POLICES;
export const espaces = ESPACES;
export const arrondis = ARRONDIS;
export const hauteurs = HAUTEURS;
export const margePage = MARGE_PAGE;

// Styles de texte de la charte (§ 4).
export const texte = {
  titreAccueil: () => ({ fontFamily: POLICES.titre, fontSize: 36, lineHeight: 38, letterSpacing: -0.7, color: couleurs.encre }),
  titreEcran: () => ({ fontFamily: POLICES.titre, fontSize: 30, lineHeight: 34, letterSpacing: -0.4, color: couleurs.encre }),
  titreDetail: () => ({ fontFamily: POLICES.titre, fontSize: 28, lineHeight: 32, color: couleurs.encre }),
  section: () => ({ fontFamily: POLICES.titre, fontSize: 20, lineHeight: 26, color: couleurs.encre }),
  titreCarte: () => ({ fontFamily: POLICES.texteGras, fontSize: 15, lineHeight: 20, color: couleurs.encre }),
  courant: () => ({ fontFamily: POLICES.texte, fontSize: 15, lineHeight: 22, color: couleurs.encre }),
  secondaire: () => ({ fontFamily: POLICES.texteMoyen, fontSize: 13, lineHeight: 18, color: couleurs.encreDouce }),
  libelleSection: () => ({
    fontFamily: POLICES.texteGras,
    fontSize: 13,
    letterSpacing: 0.8,
    textTransform: 'uppercase' as const,
    color: couleurs.encreDouce,
  }),
  puce: () => ({ fontFamily: POLICES.texteGras, fontSize: 12, lineHeight: 16 }),
};
