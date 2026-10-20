// Thème du module dans l'app Famille : palette « Famille » de la charte,
// avec l'encre du module pour accent (voir src/theme/modules.ts). Remplace
// le thème propre à l'ancienne app, sans changer les écrans qui le lisent.
import { creerThemeModule } from '../../../theme/modules';
export { EST_WEB, LARGEUR_MAX_WEB, useLargeurContenu } from '../../../theme/theme';

const t = creerThemeModule('quotidien');

export const theme = t.theme;
export const colors = t.colors;
export const spacing = t.spacing;
export const radii = t.radii;
export const creerStylesThemes = t.creerStylesThemes;
export const themeActuel = t.themeActuel;
export const fontTitle = t.theme.fontTitle;
export const fontTitleBold = t.theme.fontTitleBold;
export const fontBody = t.theme.fontBody;
export const fontBodyBold = t.theme.fontBodyBold;
export const fontManuscrit = t.theme.fontManuscrit;

export type Theme = typeof theme;
