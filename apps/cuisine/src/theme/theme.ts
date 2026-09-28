import { colors, spacing, radii, definirThemeParDefaut, type IdTheme } from '@apps-famille/theme';

// Thèmes de couleurs : communs à toutes les apps de la famille, dans le
// paquet packages/theme (liste des thèmes, recoloration de tous les écrans,
// affichage web). Ce fichier fixe ce qui est propre à l'app Cuisine : son
// thème par défaut ("Sceau", vert forêt sombre + or, esprit sceau médiéval
// / nordique — section "14. Identité visuelle et charte graphique" du cahier
// des charges) et ses polices.
export * from '@apps-famille/theme';

export const THEME_PAR_DEFAUT: IdTheme = 'sceau';
definirThemeParDefaut(THEME_PAR_DEFAUT);

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
