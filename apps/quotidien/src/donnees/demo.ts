// Données de démonstration des modules pas encore branchés sur la base :
// tâches (Phase 3) et argent de poche (Phase 4). Prénoms fictifs.
// Les trajets, eux, viennent de Supabase depuis la Phase 1.

export type TacheDemo = {
  id: string;
  libelle: string;
  pour: string; // prénom, ou "Qui veut"
  recurrence: string | null;
  points: number;
  etat: 'a_faire' | 'faite' | 'validee';
};

export const TACHES_DEMO: TacheDemo[] = [
  { id: 'c1', libelle: 'Mettre la table', pour: 'Léo', recurrence: 'Chaque soir', points: 10, etat: 'a_faire' },
  { id: 'c2', libelle: 'Vider le lave-vaisselle', pour: 'Jeanne', recurrence: 'Chaque soir', points: 10, etat: 'faite' },
  { id: 'c3', libelle: 'Ranger sa chambre', pour: 'Léo', recurrence: 'Le samedi', points: 20, etat: 'a_faire' },
  { id: 'c4', libelle: 'Nourrir le chat', pour: 'Jeanne', recurrence: 'Chaque matin', points: 10, etat: 'validee' },
  { id: 'c5', libelle: 'Laver la voiture', pour: 'Qui veut', recurrence: null, points: 50, etat: 'a_faire' },
];

// Argent de poche affiché en points, avec l'équivalent en euros entre
// parenthèses : « 235 points (23,50 €) ». Taux par défaut : 10 points = 1 €
// (réglable par foyer en Phase 4).
export const POINTS_PAR_EURO = 10;

export type MouvementDemo = { id: string; date: string; libelle: string; points: number };

export type TirelireDemo = {
  enfant: string;
  solde: number; // en points
  hebdomadaire: number; // en points
  objectif: { libelle: string; points: number } | null;
  mouvements: MouvementDemo[];
};

export const TIRELIRES_DEMO: TirelireDemo[] = [
  {
    enfant: 'Léo',
    solde: 235,
    hebdomadaire: 30,
    objectif: { libelle: 'Ballon de match', points: 350 },
    mouvements: [
      { id: 'm1', date: '07/10', libelle: 'Tâche : ranger sa chambre', points: 20 },
      { id: 'm2', date: '05/10', libelle: 'Argent de poche de la semaine', points: 30 },
      { id: 'm3', date: '03/10', libelle: 'Cartes Panini', points: -45 },
    ],
  },
  {
    enfant: 'Jeanne',
    solde: 410,
    hebdomadaire: 40,
    objectif: { libelle: 'Vélo', points: 800 },
    mouvements: [
      { id: 'm4', date: '07/10', libelle: 'Tâche : nourrir le chat', points: 10 },
      { id: 'm5', date: '05/10', libelle: 'Argent de poche de la semaine', points: 40 },
    ],
  },
];

export function formaterEuros(montant: number): string {
  return `${montant.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
}

// « 235 points (23,50 €) » ; signe affiché si demandé (« +20 points (2,00 €) »).
export function formaterPoints(points: number, signe = false): string {
  const libelle = `${Math.abs(points) <= 1 ? 'point' : 'points'}`;
  const prefixe = signe && points > 0 ? '+' : '';
  return `${prefixe}${Math.abs(points).toLocaleString('fr-FR')} ${libelle} (${formaterEuros(Math.abs(points) / POINTS_PAR_EURO)})`;
}
