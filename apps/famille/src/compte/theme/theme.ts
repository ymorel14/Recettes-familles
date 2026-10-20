// Thème des écrans de compte (connexion, bienvenue, prénom) : palette
// « Famille », sans couleur de module (accent = encre).
import { creerThemeModule } from '../../theme/modules';
export { EST_WEB, LARGEUR_MAX_WEB, useLargeurContenu } from '../../theme/theme';

const t = creerThemeModule('famille');
export const theme = t.theme;
export const creerStylesThemes = t.creerStylesThemes;
