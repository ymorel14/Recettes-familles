// Dates de la semaine d'argent de poche (lundi → dimanche), en dates pures
// « AAAA-MM-JJ » : aucun fuseau, aucun décalage d'heure d'été.

const MOIS_COURTS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const MOIS_LONGS = [
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
];
export const JOURS_LONGS = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];
export const JOURS_COURTS = ['Lu', 'Ma', 'Me', 'Je', 'Ve', 'Sa', 'Di'];

function versDate(iso: string): Date {
  const [a, m, j] = iso.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, j));
}

// Date du jour sur l'appareil, « AAAA-MM-JJ ».
export function aujourdhuiIso(): string {
  const d = new Date();
  const mois = String(d.getMonth() + 1).padStart(2, '0');
  const jour = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mois}-${jour}`;
}

export function ajouterJoursIso(iso: string, n: number): string {
  const d = versDate(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// « 26 oct. », « 1er nov. »
export function jourCourt(iso: string): string {
  const d = versDate(iso);
  const j = d.getUTCDate();
  return `${j === 1 ? '1er' : j} ${MOIS_COURTS[d.getUTCMonth()]}`;
}

// « lundi 26 octobre », « dimanche 1er novembre »
export function jourLong(iso: string): string {
  const d = versDate(iso);
  const j = d.getUTCDate();
  return `${JOURS_LONGS[(d.getUTCDay() + 6) % 7]} ${j === 1 ? '1er' : j} ${MOIS_LONGS[d.getUTCMonth()]}`;
}

// « mardi » pour une date.
export function nomDuJour(iso: string): string {
  return JOURS_LONGS[(versDate(iso).getUTCDay() + 6) % 7];
}

// « 18 h 05 » pour un horodatage ISO.
export function heureCourte(horodatage: string): string {
  const d = new Date(horodatage);
  return `${d.getHours()} h ${String(d.getMinutes()).padStart(2, '0')}`;
}

// Jours choisis (1 = lundi … 7 = dimanche) → « Tous les jours », « Lun. au ven. », « Lun., mer. et sam. ».
export function libelleJours(jours: number[]): string {
  const tries = [...new Set(jours)].sort((a, b) => a - b);
  if (tries.length === 7) return 'Tous les jours';
  const courts = ['lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.', 'dim.'];
  const majuscule = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
  const consecutifs = tries.length > 2 && tries.every((j, i) => i === 0 || j === tries[i - 1] + 1);
  if (consecutifs) return `${majuscule(courts[tries[0] - 1])} au ${courts[tries[tries.length - 1] - 1]}`;
  const noms = tries.map((j) => courts[j - 1]);
  if (noms.length === 1) return majuscule(noms[0]);
  return `${majuscule(noms.slice(0, -1).join(', '))} et ${noms[noms.length - 1]}`;
}
