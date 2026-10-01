// Dates des souvenirs (format "AAAA-MM-JJ" de la base) et âges.
//
// Un souvenir a une précision de date : "jour" (14 mars 2021), "mois"
// (mars 2021), "annee" (2021) ou "environ" (vers 2021). La base stocke
// toujours une date complète : le 1er du mois ou le 1er janvier quand la
// précision est le mois ou l'année.

export type PrecisionDate = 'jour' | 'mois' | 'annee' | 'environ';

export const PRECISIONS: { id: PrecisionDate; libelle: string; exemple: string }[] = [
  { id: 'jour', libelle: 'Jour précis', exemple: 'JJ/MM/AAAA' },
  { id: 'mois', libelle: 'Mois', exemple: 'MM/AAAA' },
  { id: 'annee', libelle: 'Année', exemple: 'AAAA' },
  { id: 'environ', libelle: 'Vers…', exemple: 'AAAA' },
];

export const MOIS = [
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
];

function parties(iso: string): [number, number, number] {
  const [a, m, j] = iso.slice(0, 10).split('-').map(Number);
  return [a, m, j];
}

function deux(n: number): string {
  return String(n).padStart(2, '0');
}

// "2021-03-14" → "14 mars 2021" (1er → "1er").
export function formaterJour(iso: string): string {
  const [a, m, j] = parties(iso);
  if (!a || !m || !j) return iso;
  return `${j === 1 ? '1er' : j} ${MOIS[m - 1]} ${a}`;
}

// Date d'un souvenir selon sa précision, avec sa date de fin éventuelle :
// "14 mars 2021", "mars 2021", "2021", "vers 2021",
// "du 5 au 19 juillet 2019", "du 28 juin au 3 juillet 2019".
export function formaterDateSouvenir(
  debut: string | null,
  fin: string | null,
  precision: PrecisionDate
): string {
  if (!debut) return 'Date inconnue';
  const [a1, m1, j1] = parties(debut);
  if (precision === 'annee') return String(a1);
  if (precision === 'environ') return `vers ${a1}`;
  if (precision === 'mois') {
    if (fin) {
      const [a2, m2] = parties(fin);
      if (a2 !== a1 || m2 !== m1) {
        return a1 === a2 ? `de ${MOIS[m1 - 1]} à ${MOIS[m2 - 1]} ${a2}` : `de ${MOIS[m1 - 1]} ${a1} à ${MOIS[m2 - 1]} ${a2}`;
      }
    }
    return `${MOIS[m1 - 1]} ${a1}`;
  }
  if (!fin || fin.slice(0, 10) === debut.slice(0, 10)) return formaterJour(debut);
  const [a2, m2, j2] = parties(fin);
  const jj1 = j1 === 1 ? '1er' : String(j1);
  const jj2 = j2 === 1 ? '1er' : String(j2);
  if (a1 === a2 && m1 === m2) return `du ${jj1} au ${jj2} ${MOIS[m2 - 1]} ${a2}`;
  if (a1 === a2) return `du ${jj1} ${MOIS[m1 - 1]} au ${jj2} ${MOIS[m2 - 1]} ${a2}`;
  return `du ${formaterJour(debut)} au ${formaterJour(fin)}`;
}

// Saisie → date de la base, selon la précision (null si invalide).
//   jour : "14/03/2021" ; mois : "03/2021" ; annee, environ : "2021".
export function lireDateSaisie(texte: string, precision: PrecisionDate): string | null {
  const t = texte.trim();
  if (precision === 'annee' || precision === 'environ') {
    const m = t.match(/^(\d{4})$/);
    if (!m) return null;
    const a = Number(m[1]);
    return a >= 1800 && a <= 2200 ? `${a}-01-01` : null;
  }
  if (precision === 'mois') {
    const m = t.match(/^(\d{1,2})[/.\-](\d{4})$/);
    if (!m) return null;
    const mo = Number(m[1]);
    const a = Number(m[2]);
    return mo >= 1 && mo <= 12 && a >= 1800 && a <= 2200 ? `${a}-${deux(mo)}-01` : null;
  }
  const m = t.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})$/);
  if (!m) return null;
  const j = Number(m[1]);
  const mo = Number(m[2]);
  const a = Number(m[3]);
  const d = new Date(a, mo - 1, j);
  if (d.getFullYear() !== a || d.getMonth() !== mo - 1 || d.getDate() !== j || a < 1800) return null;
  return `${a}-${deux(mo)}-${deux(j)}`;
}

// Date de la base → texte du champ de saisie, selon la précision.
export function versSaisie(iso: string | null, precision: PrecisionDate): string {
  if (!iso) return '';
  const [a, m, j] = parties(iso);
  if (precision === 'annee' || precision === 'environ') return String(a);
  if (precision === 'mois') return `${deux(m)}/${a}`;
  return `${deux(j)}/${deux(m)}/${a}`;
}

// Mois révolus entre une naissance et une date (null si inconnu ou avant).
export function moisEntre(naissance: string | null, date: string | null): number | null {
  if (!naissance || !date) return null;
  const [an, mn, jn] = parties(naissance);
  const [a, m, j] = parties(date);
  let mois = (a - an) * 12 + (m - mn);
  if (j < jn) mois -= 1;
  return mois >= 0 ? mois : null;
}

// Âge à afficher (précision au mois) : "nouveau-né" le premier mois,
// "13 mois" jusqu'à 2 ans, puis "6 ans".
export function formaterAge(mois: number | null): string | null {
  if (mois === null || mois === undefined || mois < 0) return null;
  if (mois === 0) return 'nouveau-né';
  if (mois < 24) return `${mois} mois`;
  const ans = Math.floor(mois / 12);
  return `${ans} ans`;
}

// Âge selon la précision de la date : exact au jour ou au mois près ; pour
// "2021" ou "vers 2021", seulement "vers 6 ans" (rien avant 2 ans).
export function ageSouvenir(
  naissance: string | null,
  date: string | null,
  precision: PrecisionDate
): string | null {
  const mois = moisEntre(naissance, date);
  if (mois === null) return null;
  if (precision === 'jour' || precision === 'mois') return formaterAge(mois);
  const ans = Math.floor(mois / 12);
  return ans >= 2 ? `vers ${ans} ans` : null;
}

// Année d'un souvenir pour le regroupement du fil ("Sans date" sinon).
export function anneeDe(iso: string | null): string {
  return iso ? iso.slice(0, 4) : 'Sans date';
}

// "il y a 5 ans" pour « Ce jour-là ».
export function ilYaAns(iso: string, aujourdHui = new Date()): string {
  const ans = aujourdHui.getFullYear() - parties(iso)[0];
  return ans <= 1 ? 'il y a un an' : `il y a ${ans} ans`;
}

// Date du jour au format de la base, en heure locale.
export function aujourdhuiIso(d = new Date()): string {
  return `${d.getFullYear()}-${deux(d.getMonth() + 1)}-${deux(d.getDate())}`;
}
