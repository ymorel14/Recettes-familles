import { colors, spacing, radii, definirThemeParDefaut, type IdTheme } from '@apps-famille/theme';

// Thèmes de couleurs : les mêmes que dans les autres apps de la famille
// (paquet commun packages/theme). SouvenirsFamille démarre sur
// "Mille-feuille" (crème et caramel, l'album de photos ancien) ; chacun peut
// choisir un autre thème dans son Profil (réglage propre à l'appareil).
export * from '@apps-famille/theme';

export const THEME_PAR_DEFAUT: IdTheme = 'milleFeuille';
definirThemeParDefaut(THEME_PAR_DEFAUT);

// Mêmes polices que CadeauCommun et VoyageCommun : titres en Fraunces,
// corps de texte en Karla, très lisible sur téléphone.
export const fontTitle = 'Fraunces_700Bold';
export const fontTitleBold = 'Fraunces_700Bold';
export const fontBody = 'Karla_400Regular';
export const fontBodyBold = 'Karla_700Bold';
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
