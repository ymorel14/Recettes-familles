import { Platform, StyleSheet, useWindowDimensions } from 'react-native';

// Thèmes de couleurs de l'application. Le thème "Sceau" (vert forêt sombre
// + or, esprit sceau médiéval / nordique) est le thème d'origine et reste
// le thème par défaut. Voir la section "14. Identité visuelle et charte
// graphique" du cahier des charges.
//
// Chaque thème définit les mêmes 9 couleurs : les écrans n'utilisent que
// `theme.colors.*`, jamais de couleur codée en dur, pour que le changement
// de thème s'applique partout.

export type Palette = {
  background: string; // fond principal
  surface: string; // fond des panneaux et cartes
  border: string; // bordures et séparateurs
  accent: string; // accent principal, boutons d'action
  text: string; // texte principal
  textMuted: string; // texte secondaire
  success: string; // indicateur "terminé / disponible"
  warning: string; // indicateur "à traiter", actions destructives
  selection: string; // surbrillance de sélection
};

export type IdTheme =
  | 'sceau'
  | 'charlotte'
  | 'milleFeuille'
  | 'opera'
  | 'villagePecheurs'
  | 'ileParadisiaque'
  | 'foretMontagnes';

export type DefinitionTheme = {
  id: IdTheme;
  nom: string;
  ambiance: string;
  sombre: boolean; // fond sombre → icônes claires dans la barre d'état
  palette: Palette;
};

export const THEMES: DefinitionTheme[] = [
  {
    id: 'sceau',
    nom: 'Sceau',
    ambiance: 'Vert forêt et or, sceau médiéval',
    sombre: true,
    palette: {
      background: '#0F241A',
      surface: '#16301F',
      border: '#C9A227',
      accent: '#D4AF37',
      text: '#EDE6D3',
      textMuted: '#B9B29C',
      success: '#4CAF50',
      warning: '#E07B39',
      selection: '#8A7A3C',
    },
  },
  {
    id: 'charlotte',
    nom: 'Charlotte aux fraises',
    ambiance: 'Chantilly, biscuit cuillère, fraise',
    sombre: false,
    palette: {
      background: '#FFF6F2',
      surface: '#FCE4E4',
      border: '#E3B39C',
      accent: '#B8283F',
      text: '#4A2328',
      textMuted: '#85575D',
      success: '#4F7F3A',
      warning: '#9E4A12',
      selection: '#F4B6C2',
    },
  },
  {
    id: 'milleFeuille',
    nom: 'Mille-feuille',
    ambiance: 'Fondant blanc, crème pâtissière, feuilletage caramélisé',
    sombre: false,
    palette: {
      background: '#FBF5E6',
      surface: '#F3E3B8',
      border: '#C99A5B',
      accent: '#7A4A21',
      text: '#3B2A1A',
      textMuted: '#6F5A43',
      success: '#5E7F33',
      warning: '#9A4516',
      selection: '#E6C98A',
    },
  },
  {
    id: 'opera',
    nom: 'Opéra',
    ambiance: "Ganache, biscuit imbibé de café, feuille d'or",
    sombre: true,
    palette: {
      background: '#1E1410',
      surface: '#2E1F18',
      border: '#6B4A35',
      accent: '#CFA64E',
      text: '#F1E6D6',
      textMuted: '#BFA88F',
      success: '#8DAA5B',
      warning: '#D9794A',
      selection: '#5A3A28',
    },
  },
  {
    id: 'villagePecheurs',
    nom: 'Village de pêcheurs',
    ambiance: 'Murs chaulés, volets bleus, terracotta',
    sombre: false,
    palette: {
      background: '#F7F5EF',
      surface: '#E8EFF3',
      border: '#9DB8C9',
      accent: '#1F5F8B',
      text: '#1D2B36',
      textMuted: '#566A79',
      success: '#2F7A5E',
      warning: '#A04A26',
      selection: '#BFD7E6',
    },
  },
  {
    id: 'ileParadisiaque',
    nom: 'Île paradisiaque',
    ambiance: 'Sable blanc, lagon turquoise, palmiers, corail',
    sombre: false,
    palette: {
      background: '#FBF8F0',
      surface: '#DDF3F1',
      border: '#7FCFC9',
      accent: '#0B7A7A',
      text: '#16373A',
      textMuted: '#4A6A6C',
      success: '#3A8740',
      warning: '#B3412C',
      selection: '#F7D8B5',
    },
  },
  {
    id: 'foretMontagnes',
    nom: 'Forêt des montagnes',
    ambiance: "Sapins, chalet en bois, neige, géraniums d'Alsace",
    sombre: false,
    palette: {
      background: '#F5F3EE',
      surface: '#E6DDCF',
      border: '#A89479',
      accent: '#2F5D3A',
      text: '#2A2622',
      textMuted: '#5E554B',
      success: '#4C7F3B',
      warning: '#A8322D',
      selection: '#C9D8C0',
    },
  },
];

export const THEME_PAR_DEFAUT: IdTheme = 'sceau';

function transparent(hex: string, opacite: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${opacite})`;
}

// Couleurs dérivées de la palette (voiles semi-transparents), recalculées à
// chaque changement de thème.
function derivees(p: Palette) {
  return {
    voile: transparent(p.background, 0.78), // bandeau sur les vignettes photo
    voileFort: transparent(p.background, 0.85), // fond des fenêtres modales
    voileLeger: transparent(p.background, 0.5),
    accentTransparent: transparent(p.accent, 0.2),
    selectionTransparent: transparent(p.selection, 0.15),
  };
}

export type Couleurs = Palette & ReturnType<typeof derivees>;

// Objet MUTABLE : `appliquerTheme` remplace son contenu en place, pour que
// tous les `theme.colors.x` lus au rendu voient le nouveau thème.
export const colors: Couleurs = {
  ...THEMES[0].palette,
  ...derivees(THEMES[0].palette),
};

let themeActif: DefinitionTheme = THEMES[0];
let versionTheme = 0;

export function obtenirTheme(id: string | null | undefined): DefinitionTheme {
  return THEMES.find((t) => t.id === id) ?? THEMES[0];
}

export function themeActuel(): DefinitionTheme {
  return themeActif;
}

// Applique un thème : met à jour `theme.colors` en place et invalide les
// feuilles de style créées avec `creerStylesThemes`. Les écrans doivent
// ensuite être re-rendus (voir PreferencesContext, qui s'en charge).
export function appliquerTheme(id: string | null | undefined): DefinitionTheme {
  const definition = obtenirTheme(id);
  themeActif = definition;
  Object.assign(colors, definition.palette, derivees(definition.palette));
  versionTheme += 1;
  return definition;
}

// ---------------------------------------------------------------------------
// Version web (navigateur) : affichage en colonne centrée et boutons de taille
// normale, sans rien changer sur Android et iOS.
// ---------------------------------------------------------------------------

export const EST_WEB = Platform.OS === 'web';

// Largeur maximale du contenu dans un navigateur (au-delà : marges sur les
// côtés, voir App.tsx).
export const LARGEUR_MAX_WEB = 760;

// Largeur disponible pour le contenu : celle de l'écran sur téléphone, celle
// de la colonne centrale dans un navigateur. À utiliser à la place de
// useWindowDimensions() pour dimensionner vignettes et photos.
export function useLargeurContenu(): { width: number; height: number } {
  const { width, height } = useWindowDimensions();
  return { width: EST_WEB ? Math.min(width, LARGEUR_MAX_WEB) : width, height };
}

// Dans un navigateur, un bouton "pleine largeur" (style nommé bouton…, centré,
// sans largeur ni marge horizontale imposées) devient un bouton centré de
// taille normale, au lieu de s'étirer sur toute la colonne.
function adapterPourWeb<T>(styles: T): T {
  if (!EST_WEB) return styles;
  const resultat: any = { ...styles };
  Object.entries(resultat).forEach(([nom, style]: [string, any]) => {
    const estBoutonPleineLargeur =
      /^bouton/.test(nom) &&
      style &&
      style.alignItems === 'center' &&
      style.paddingVertical != null &&
      style.paddingHorizontal == null &&
      style.width == null &&
      style.flex == null &&
      style.alignSelf == null &&
      style.minWidth == null;
    if (estBoutonPleineLargeur) {
      resultat[nom] = { ...style, alignSelf: 'center', minWidth: 280, paddingHorizontal: spacing.xl };
    }
  });
  return resultat;
}

// Remplace `StyleSheet.create` dans les écrans : les styles sont recalculés
// automatiquement (au premier accès) après un changement de thème, au lieu
// d'être figés au chargement de l'application.
export function creerStylesThemes<T extends StyleSheet.NamedStyles<T>>(fabrique: () => T): T {
  let cache: T | null = null;
  let versionCache = -1;
  const obtenir = (): T => {
    if (!cache || versionCache !== versionTheme) {
      cache = StyleSheet.create(adapterPourWeb(fabrique()));
      versionCache = versionTheme;
    }
    return cache;
  };
  return new Proxy({} as T, {
    get: (_cible, propriete) => (obtenir() as any)[propriete],
  });
}

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
} as const;

export const radii = {
  sm: 4,
  md: 8,
  lg: 12,
} as const;

// Titres et en-têtes : police à caractère ancien/runique (ambiance Seigneur des Anneaux / nordique)
export const fontTitle = 'Cinzel_600SemiBold';
export const fontTitleBold = 'Cinzel_700Bold';

// Corps de texte (ingrédients, étapes, listes) : serif classique très lisible, esprit Garamond
export const fontBody = 'EBGaramond_400Regular';
export const fontBodyBold = 'EBGaramond_600SemiBold';

// Touche manuscrite (rappel de la famille et du foyer en haut des écrans) :
// écriture à la main, pour une ambiance conviviale.
export const fontManuscrit = 'Caveat_600SemiBold';

export const theme = {
  colors,
  spacing,
  radii,
  fontTitle,
  fontTitleBold,
  fontBody,
  fontBodyBold,
  fontManuscrit,
} as const;

export type Theme = typeof theme;
