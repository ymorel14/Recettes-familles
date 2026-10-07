import { colors, spacing, radii, definirThemeParDefaut, type IdTheme } from '@apps-famille/theme';

// Thèmes de couleurs : les mêmes que dans les autres apps de la famille
// (paquet commun packages/theme). Quotidien démarre sur "Village de
// pêcheurs" (murs chaulés, volets bleus) : clair et net pour un usage de tous
// les jours ; chacun peut choisir un autre thème dans son Profil.
export * from '@apps-famille/theme';

export const THEME_PAR_DEFAUT: IdTheme = 'villagePecheurs';
definirThemeParDefaut(THEME_PAR_DEFAUT);

// Mêmes polices que CadeauCommun, VoyageCommun et SouvenirsFamille : titres
// en Fraunces, corps de texte en Karla, très lisible sur téléphone.
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
