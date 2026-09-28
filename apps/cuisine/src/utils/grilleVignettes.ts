import { theme, useLargeurContenu } from '../theme/theme';

// Taille visée pour une vignette (en points). Le nombre de colonnes est
// choisi pour s'en approcher au mieux selon la largeur de l'écran :
// smartphone en portrait → 3 colonnes (~115 pt), smartphone en paysage ou
// petite tablette → 5 à 6, grande tablette / web → jusqu'à 8.
const LARGEUR_CIBLE = 120;
const COLONNES_MIN = 2;
const COLONNES_MAX = 8;

// Calcule le nombre de colonnes et la largeur exacte des vignettes d'une
// grille, en tenant compte des marges de l'écran et de l'espace entre
// vignettes. Recalculé automatiquement si l'écran pivote.
// La largeur est fixe (pas de `flex: 1`) pour que la dernière vignette
// d'une ligne incomplète garde la même taille que les autres.
export function useGrilleVignettes(
  margeEcran: number = theme.spacing.md,
  espace: number = theme.spacing.sm
) {
  // Largeur de l'écran (téléphone) ou de la colonne centrale (navigateur).
  const { width: largeurFenetre } = useLargeurContenu();
  const largeurDisponible = largeurFenetre - 2 * margeEcran;

  const nbColonnes = Math.min(
    COLONNES_MAX,
    Math.max(COLONNES_MIN, Math.round((largeurDisponible + espace) / (LARGEUR_CIBLE + espace)))
  );
  const largeurVignette = (largeurDisponible - (nbColonnes - 1) * espace) / nbColonnes;

  // Texte de l'étiquette proportionnel à la vignette (entre 12 et 16 pt).
  const taillePolice = Math.round(Math.min(16, Math.max(12, largeurVignette * 0.11)));

  return { nbColonnes, largeurVignette, taillePolice };
}
