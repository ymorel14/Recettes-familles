import { colors, spacing, radii, definirThemeParDefaut, type IdTheme } from '@apps-famille/theme';

// Thèmes de couleurs : les mêmes que dans l'app Cuisine (paquet commun
// packages/theme). CadeauCommun démarre sur "Papier kraft" ; chacun peut
// choisir un autre thème dans son Profil (réglage propre à l'appareil).
export * from '@apps-famille/theme';

export const THEME_PAR_DEFAUT: IdTheme = 'papierKraft';
definirThemeParDefaut(THEME_PAR_DEFAUT);

// Titres : Fraunces (serif chaleureuse, un peu artisanale).
export const fontTitle = 'Fraunces_700Bold';
export const fontTitleBold = 'Fraunces_700Bold';

// Corps de texte : Karla, très lisible sur téléphone.
export const fontBody = 'Karla_400Regular';
export const fontBodyBold = 'Karla_700Bold';

// Petites touches (sous-titres, dates) : Fraunces plus légère.
export const fontManuscrit = 'Fraunces_500Medium';

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
