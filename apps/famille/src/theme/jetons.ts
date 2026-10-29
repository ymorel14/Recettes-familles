// Jetons de la charte graphique V1 (docs « V1-charte-graphique.md », § 3 à 5).
// Palette « par univers » (retour de test G-4, 27 octobre 2026) : neutres
// chauds, une couleur douce par module en trois tons — pâle (fonds), principal
// (boutons doux, bouton ⊕), foncé (icônes, textes, boutons pleins).
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
  marque: string; // Abricot principal : bouton ⊕
  surMarque: string;
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
    fond: '#FAF8F6',
    surface: '#FFFFFF',
    encre: '#2B2420',
    encreDouce: '#6F625A',
    encreInactive: '#6F625A',
    ligne: '#E8E2DC',
    ligneCarte: '#E8E2DC',
    separateur: '#F0EBE6',
    accent: '#9A4A22',
    surAccent: '#FFFFFF',
    marque: '#F2A882',
    surMarque: '#5A2A12',
    succes: '#0F7A5F',
    succesFond: '#DDF2EA',
    attentionFond: '#FFF1DB',
    attention: '#8A4B00',
    alerteFond: '#FDE8E4',
    alerte: '#A8321C',
    danger: '#B42318',
    segment: '#F2EEEA',
    interrupteurInactif: '#CFC6BE',
    voile: 'rgba(43, 36, 32, 0.45)',
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
    accent: '#F2A882',
    surAccent: '#2B2420',
    marque: '#F2A882',
    surMarque: '#2B2420',
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

export type CouleursModule = { fond: string; principal: string; encre: string };

export const COULEURS_MODULES: Record<Mode, Record<IdModule, CouleursModule>> = {
  clair: {
    recettes: { fond: '#FDF3DC', principal: '#EEC468', encre: '#7A5410' }, // Miel
    courses: { fond: '#EAF4EB', principal: '#A3CBA8', encre: '#3B6B44' }, // Sauge
    quotidien: { fond: '#EAF2FB', principal: '#93BCE6', encre: '#2D5E95' }, // Ciel
    cadeaux: { fond: '#FCEBEF', principal: '#EEA7B8', encre: '#9C3352' }, // Rose poudré
    voyages: { fond: '#FDEEE5', principal: '#F2A882', encre: '#9A4A22' }, // Abricot
    souvenirs: { fond: '#F0EDFB', principal: '#BBAEE8', encre: '#5A4A9E' }, // Lavande
  },
  sombre: {
    recettes: { fond: '#3A2F14', principal: '#EEC468', encre: '#EEC468' },
    courses: { fond: '#1E3322', principal: '#A3CBA8', encre: '#A3CBA8' },
    quotidien: { fond: '#1A2B40', principal: '#93BCE6', encre: '#93BCE6' },
    cadeaux: { fond: '#3D1F28', principal: '#EEA7B8', encre: '#EEA7B8' },
    voyages: { fond: '#3A2418', principal: '#F2A882', encre: '#F2A882' },
    souvenirs: { fond: '#29243F', principal: '#BBAEE8', encre: '#BBAEE8' },
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
  { id: 'voyages', nom: 'Événements', icone: 'briefcase-outline', chemin: 'voyages', route: 'Voyages' },
  { id: 'souvenirs', nom: 'Souvenirs', icone: 'images-outline', chemin: 'souvenirs', route: 'Souvenirs' },
];

export function infosModule(id: IdModule) {
  return MODULES.find((m) => m.id === id)!;
}
