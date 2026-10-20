import { StyleSheet } from 'react-native';
import { colors as couleursPaquet, type Couleurs } from '@apps-famille/theme';
import {
  couleurs,
  couleursModule,
  modeActuel,
  surChangementDeMode,
  transparent,
  versionTheme,
  EST_WEB,
  polices,
} from './theme';
import type { IdModule } from './jetons';

// Thème vu par le code repris des six apps (écrans, composants), qui lit
// `theme.colors.background`, `theme.colors.accent`… (palette de
// packages/theme). Chaque module reçoit la même palette « Famille », avec
// pour accent l'encre de SA couleur (charte § 3.2 : dans un module, le
// bouton principal prend l'encre du module) et pour sélection son pastel.

function paletteModule(id: IdModule | 'famille'): Couleurs {
  const m = id === 'famille' ? { fond: couleurs.segment, encre: couleurs.encre } : couleursModule(id);
  return {
    background: couleurs.fond,
    surface: couleurs.surface,
    border: couleurs.ligneCarte,
    accent: m.encre,
    text: couleurs.encre,
    textMuted: couleurs.encreDouce,
    success: couleurs.succes,
    warning: couleurs.alerte,
    selection: m.fond,
    voile: transparent(couleurs.fond, 0.82),
    voileFort: transparent(couleurs.fond, 0.9),
    voileLeger: transparent(couleurs.fond, 0.5),
    accentTransparent: transparent(m.encre, 0.14),
    selectionTransparent: m.fond,
  };
}

// Palette neutre (hors module), donnée aux composants communs de
// packages/famille (photo de profil, visibilité des enfants…) qui lisent
// l'objet global de packages/theme : il ne peut y avoir qu'un thème actif.
function paletteNeutre(): Couleurs {
  return {
    background: couleurs.fond,
    surface: couleurs.surface,
    border: couleurs.ligne,
    accent: couleurs.encre,
    text: couleurs.encre,
    textMuted: couleurs.encreDouce,
    success: couleurs.succes,
    warning: couleurs.alerte,
    selection: couleurs.segment,
    voile: transparent(couleurs.fond, 0.82),
    voileFort: transparent(couleurs.fond, 0.9),
    voileLeger: transparent(couleurs.fond, 0.5),
    accentTransparent: transparent(couleurs.encre, 0.08),
    selectionTransparent: couleurs.segment,
  };
}

function rafraichirPaquet() {
  Object.assign(couleursPaquet, paletteNeutre());
}
rafraichirPaquet();
surChangementDeMode(rafraichirPaquet);

const ESPACEMENTS_MODULE = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 } as const;
// Arrondis de la charte (§ 5) : petits champs 12, boutons 14, cartes 18.
const ARRONDIS_MODULE = { sm: 10, md: 14, lg: 18 } as const;

// Dans un navigateur, un bouton « pleine largeur » reste de taille normale
// (même règle que packages/theme).
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
    if (estBoutonPleineLargeur) resultat[nom] = { ...style, alignSelf: 'center', minWidth: 280, paddingHorizontal: 32 };
  });
  return resultat;
}

export function creerThemeModule(id: IdModule | 'famille') {
  const colors: Couleurs = paletteModule(id);
  surChangementDeMode(() => Object.assign(colors, paletteModule(id)));

  function creerStylesThemes<T extends StyleSheet.NamedStyles<T>>(fabrique: () => T): T {
    let cache: T | null = null;
    let versionCache = -1;
    const obtenir = (): T => {
      if (!cache || versionCache !== versionTheme()) {
        cache = StyleSheet.create(adapterPourWeb(fabrique()));
        versionCache = versionTheme();
      }
      return cache;
    };
    return new Proxy({} as T, { get: (_c, p) => (obtenir() as any)[p] });
  }

  const theme = {
    colors,
    spacing: ESPACEMENTS_MODULE,
    radii: ARRONDIS_MODULE,
    fontTitle: polices.titre,
    fontTitleBold: polices.titre,
    fontBody: polices.texte,
    fontBodyBold: polices.texteGras,
    fontManuscrit: polices.texteDemiGras,
  } as const;

  return {
    theme,
    colors,
    spacing: ESPACEMENTS_MODULE,
    radii: ARRONDIS_MODULE,
    creerStylesThemes,
    themeActuel: () => ({ sombre: modeActuel() === 'sombre' }),
  };
}
