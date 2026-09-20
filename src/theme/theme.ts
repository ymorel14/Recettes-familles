// Thème "Sceau" — inspiré du thème de l'éditeur de roman personnel de l'utilisateur.
// Palette vert forêt sombre + or, esprit sceau médiéval / nordique.
// Voir la section "14. Identité visuelle et charte graphique" du cahier des charges.

export const colors = {
  background: '#0F241A', // fond principal, vert forêt très sombre
  surface: '#16301F', // fond des panneaux et cartes
  border: '#C9A227', // bordures et séparateurs, or vieilli
  accent: '#D4AF37', // accent principal, boutons d'action, or
  text: '#EDE6D3', // texte sur fond sombre, ivoire
  textMuted: '#B9B29C', // texte secondaire, ivoire atténué
  success: '#4CAF50', // indicateur "terminé / disponible"
  warning: '#E07B39', // indicateur "à traiter / en attente"
  selection: '#8A7A3C', // surbrillance de sélection, olive doré
} as const;

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

export const theme = {
  colors,
  spacing,
  radii,
  fontTitle,
  fontTitleBold,
  fontBody,
  fontBodyBold,
} as const;

export type Theme = typeof theme;
