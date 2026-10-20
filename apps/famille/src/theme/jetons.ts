// Jetons de la charte graphique V1 (docs « V1-charte-graphique.md », § 3 à 5).
// Seule source des couleurs, tailles et arrondis de l'app Famille : les
// écrans n'écrivent jamais une couleur en dur.

export type Mode = 'clair' | 'sombre';
export type IdModule = 'recettes' | 'courses' | 'quotidien' | 'cadeaux' | 'voyages' | 'souvenirs';

export type Jetons = {
  fond: string;
  surface: string;
  encre: string;
  encreDouce: string;
  encreInactive: string;
  ligne: string;
  ligneCarte: string;
  separateur: string;
  accent: string;
  surAccent: string; // texte posé sur l'accent
  succes: string;
  succesFond: string;
  attentionFond: string;
  attention: string;
  alerteFond: string;
  alerte: string;
  danger: string;
  segment: string; // fond des contrôles segmentés, barres de progression
  interrupteurInactif: string;
  voile: string; // fond assombri derrière les feuilles du bas
  focus: string;
  enfant: string; // espace enfant
};

export const JETONS: Record<Mode, Jetons> = {
  clair: {
    fond: '#F4F3EF',
    surface: '#FFFFFF',
    encre: '#17181C',
    encreDouce: '#62656C',
    encreInactive: '#6B6E75',
    ligne: '#E6E4DE',
    ligneCarte: '#ECEAE4',
    separateur: '#EEECE7',
    accent: '#D2432B',
    surAccent: '#FFFFFF',
    succes: '#0F7A5F',
    succesFond: '#DDF2EA',
    attentionFond: '#FFF1DB',
    attention: '#8A4B00',
    alerteFond: '#FDE8E4',
    alerte: '#A8321C',
    danger: '#B42318',
    segment: '#ECEAE4',
    interrupteurInactif: '#C9C6BF',
    voile: 'rgba(23, 24, 28, 0.45)',
    focus: '#2F5BD3',
    enfant: '#FFE9A8',
  },
  sombre: {
    fond: '#15161A',
    surface: '#1E2026',
    encre: '#EDEDEA',
    encreDouce: '#A4A7AE',
    encreInactive: '#9A9DA4',
    ligne: '#30333B',
    ligneCarte: '#30333B',
    separateur: '#2A2D34',
    accent: '#F0715A',
    surAccent: '#15161A',
    succes: '#6FD0A9',
    succesFond: '#173A2E',
    attentionFond: '#3A2C14',
    attention: '#F2C27A',
    alerteFond: '#3E1E18',
    alerte: '#F4A493',
    danger: '#FF8A7A',
    segment: '#2A2D34',
    interrupteurInactif: '#4A4E57',
    voile: 'rgba(0, 0, 0, 0.6)',
    focus: '#8DA9F5',
    enfant: '#4A3D12',
  },
};

export type CouleursModule = { fond: string; encre: string };

export const COULEURS_MODULES: Record<Mode, Record<IdModule, CouleursModule>> = {
  clair: {
    recettes: { fond: '#FDEBDD', encre: '#A04A14' },
    courses: { fond: '#E2F3E4', encre: '#2B7A34' },
    quotidien: { fond: '#E3EEFB', encre: '#1D5FB8' },
    cadeaux: { fond: '#FCE4EC', encre: '#B0335B' },
    voyages: { fond: '#DDF3EF', encre: '#0F766E' },
    souvenirs: { fond: '#ECE7FB', encre: '#5B45B0' },
  },
  sombre: {
    recettes: { fond: '#3A2416', encre: '#F4AE7E' },
    courses: { fond: '#1B3420', encre: '#8FD69A' },
    quotidien: { fond: '#172B45', encre: '#8EBBF2' },
    cadeaux: { fond: '#3D1C28', encre: '#F29BB9' },
    voyages: { fond: '#133632', encre: '#7FD9CB' },
    souvenirs: { fond: '#2A2347', encre: '#BFB0F5' },
  },
};

// Polices (§ 4) : titres en Bricolage Grotesque, texte en Plus Jakarta Sans.
export const POLICES = {
  titre: 'BricolageGrotesque_700Bold',
  texte: 'PlusJakartaSans_400Regular',
  texteMoyen: 'PlusJakartaSans_500Medium',
  texteDemiGras: 'PlusJakartaSans_600SemiBold',
  texteGras: 'PlusJakartaSans_700Bold',
} as const;

// Grille de 4 px (§ 5).
export const ESPACES = { xs: 4, s: 8, m: 12, l: 16, xl: 20, xxl: 24, xxxl: 28 } as const;
export const MARGE_PAGE = 20;

export const ARRONDIS = {
  pilule: 999,
  petit: 12,
  champ: 14,
  carte: 18,
  tuile: 22,
  feuille: 28,
} as const;

export const HAUTEURS = {
  barreBas: 64, // hors zone de sécurité (84 px avec elle sur un iPhone)
  plus: 56,
  ongletsHaut: 44,
  ligne: 56,
  bouton: 50,
} as const;

// Modules : nom affiché, icône (Ionicons, § 9), chemin web (identique au
// site commun actuel, § 2.3 de la spécification).
export const MODULES: { id: IdModule; nom: string; icone: string; chemin: string; route: string }[] = [
  { id: 'recettes', nom: 'Recettes', icone: 'restaurant-outline', chemin: 'cuisine', route: 'Recettes' },
  { id: 'courses', nom: 'Courses', icone: 'cart-outline', chemin: 'courses', route: 'Courses' },
  { id: 'quotidien', nom: 'Quotidien', icone: 'today-outline', chemin: 'quotidien', route: 'Quotidien' },
  { id: 'cadeaux', nom: 'Cadeaux', icone: 'gift-outline', chemin: 'cadeaux', route: 'Cadeaux' },
  { id: 'voyages', nom: 'Voyages', icone: 'briefcase-outline', chemin: 'voyages', route: 'Voyages' },
  { id: 'souvenirs', nom: 'Souvenirs', icone: 'images-outline', chemin: 'souvenirs', route: 'Souvenirs' },
];

export function infosModule(id: IdModule) {
  return MODULES.find((m) => m.id === id)!;
}
