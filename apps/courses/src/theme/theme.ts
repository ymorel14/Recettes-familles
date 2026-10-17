import { colors, spacing, radii, definirThemeParDefaut, type IdTheme } from '@apps-famille/theme';

// Thèmes de couleurs : les mêmes que dans les autres apps de la famille
// (paquet commun packages/theme). Courses démarre sur "Forêt des montagnes"
// (vert sapin, bois clair) : distinct des autres apps sur l'accueil du site,
// et lisible au magasin ; chacun peut choisir un autre thème dans son Profil.
export * from '@apps-famille/theme';

export const THEME_PAR_DEFAUT: IdTheme = 'foretMontagnes';
definirThemeParDefaut(THEME_PAR_DEFAUT);

// Mêmes polices que CadeauCommun, VoyageCommun, SouvenirsFamille et
// Quotidien : titres en Fraunces, corps de texte en Karla.
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
