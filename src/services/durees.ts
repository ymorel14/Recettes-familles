import { normaliserTexte } from '../utils/texte';

// Durées en français, pour les minuteurs du mode assistant : lecture d'une
// durée dite à voix haute ("dix minutes", "1 h 30", "une demi-heure"…) ou
// écrite dans une étape ("cuire 20 à 25 minutes"), et mise en forme pour
// l'affichage et la lecture vocale.

const UNITES: Record<string, number> = {
  zero: 0, un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8, neuf: 9,
  dix: 10, onze: 11, douze: 12, treize: 13, quatorze: 14, quinze: 15, seize: 16,
};
const DIZAINES: Record<string, number> = { vingt: 20, vingts: 20, trente: 30, quarante: 40, cinquante: 50, soixante: 60 };

// Texte normalisé (sans accents, minuscules, ponctuation retirée) avec les
// nombres écrits en toutes lettres remplacés par des chiffres :
// "mets un minuteur de vingt-cinq minutes" → "mets 1 minuteur de 25 minutes".
export function normaliserPhrase(texte: string): string {
  const mots = normaliserTexte(texte)
    .replace(/[''`’]/g, ' ')
    .replace(/(\d)\s*[,.]\s*(\d)/g, '$1.$2')
    .replace(/[^a-z0-9.]+/g, ' ')
    // Points de fin de phrase (hors nombres décimaux comme "1.5").
    .replace(/\.(?!\d)|(?<!\d)\./g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  const sortie: string[] = [];
  let i = 0;
  while (i < mots.length) {
    const mot = mots[i];
    if (!(mot in UNITES) && !(mot in DIZAINES) && mot !== 'cent') {
      sortie.push(mot);
      i += 1;
      continue;
    }
    // Suite de mots-nombres ("soixante dix sept", "vingt et un").
    let valeur = 0;
    let precedent: number | null = null;
    let j = i;
    while (j < mots.length) {
      const m = mots[j];
      if (m === 'et' && j + 1 < mots.length && (mots[j + 1] === 'un' || mots[j + 1] === 'une') && j > i) {
        j += 1;
        continue;
      }
      if (m in DIZAINES) {
        // "quatre-vingt" : 4 × 20.
        if (precedent === 4 && DIZAINES[m] === 20) valeur = valeur - 4 + 80;
        else valeur += DIZAINES[m];
        precedent = DIZAINES[m];
      } else if (m in UNITES) {
        valeur += UNITES[m];
        precedent = UNITES[m];
      } else if (m === 'cent') {
        valeur = (valeur || 1) * 100;
        precedent = 100;
      } else {
        break;
      }
      j += 1;
    }
    sortie.push(String(valeur));
    i = j;
  }
  return sortie.join(' ');
}

const SECONDE = 1000;
const MINUTE = 60 * SECONDE;
const HEURE = 60 * MINUTE;

// Durée (en millisecondes) trouvée dans une phrase déjà normalisée par
// `normaliserPhrase`, ou null. Additionne les morceaux : "1 heure 15",
// "2 minutes 30", "1 h et demie", "une demi heure", "3 quarts d heure".
export function extraireDuree(phrase: string): number | null {
  let total = 0;
  let trouve = false;
  let reste = ` ${phrase} `;

  const quarts = reste.match(/ (?:(\d+) )?quarts? d heure /);
  if (quarts) {
    total += (quarts[1] ? Number(quarts[1]) : 1) * 15 * MINUTE;
    trouve = true;
    reste = reste.replace(quarts[0], ' ');
  }
  if (/ demi heure /.test(reste)) {
    total += 30 * MINUTE;
    trouve = true;
    reste = reste.replace(/ demi heure /, ' ');
  }

  // Heures : "1 heure", "2 h", "1h30" (déjà séparé en "1 h 30" ou "1h30").
  reste = reste.replace(/(\d)h(\d)/g, '$1 h $2').replace(/(\d)h /g, '$1 h ');
  const heures = reste.match(/ (\d+(?:\.\d+)?) (?:heures?|h) (?:et demie? |(\d+) (?:minutes? |min |mn )?)?/);
  if (heures) {
    total += Number(heures[1]) * HEURE;
    if (/et demie?/.test(heures[0])) total += 30 * MINUTE;
    if (heures[2]) total += Number(heures[2]) * MINUTE;
    trouve = true;
    reste = reste.replace(heures[0], ' ');
  }

  const minutes = reste.match(/ (\d+(?:\.\d+)?) (?:minutes?|min|mn) (?:et demie? |(\d+) (?:secondes? |sec |s )?)?/);
  if (minutes) {
    total += Number(minutes[1]) * MINUTE;
    if (/et demie?/.test(minutes[0])) total += 30 * SECONDE;
    if (minutes[2]) total += Number(minutes[2]) * SECONDE;
    trouve = true;
    reste = reste.replace(minutes[0], ' ');
  }

  const secondes = reste.match(/ (\d+) (?:secondes?|sec|s) /);
  if (secondes) {
    total += Number(secondes[1]) * SECONDE;
    trouve = true;
  }

  return trouve && total > 0 ? Math.round(total) : null;
}

// Durées citées dans le texte d'une étape ("Cuire 20 à 25 minutes",
// "laisser reposer 1 h"), pour proposer d'un geste le minuteur
// correspondant. Pour une fourchette, on retient la plus courte (mieux vaut
// vérifier trop tôt que trop tard).
export function dureesDansTexte(texte: string): number[] {
  const phrase = ` ${normaliserPhrase(texte).replace(/(\d)h(\d)/g, '$1 h $2').replace(/(\d)h /g, '$1 h ')} `;
  const resultats: number[] = [];
  const motif =
    / (\d+(?:\.\d+)?)(?: (?:a|ou) \d+(?:\.\d+)?)? (heures?|h|minutes?|min|mn)(?: (\d+)(?= ))?(?= )/g;
  let m: RegExpExecArray | null;
  while ((m = motif.exec(phrase))) {
    const valeur = Number(m[1]);
    const enHeures = /^h/.test(m[2]);
    let duree = valeur * (enHeures ? HEURE : MINUTE);
    if (enHeures && m[3]) duree += Number(m[3]) * MINUTE;
    if (duree > 0 && duree <= 24 * HEURE && !resultats.includes(duree)) resultats.push(duree);
  }
  return resultats;
}

// "4:05" / "1:02:30" : compte à rebours affiché.
export function formaterCompteARebours(ms: number): string {
  const totalSecondes = Math.max(0, Math.ceil(ms / SECONDE));
  const h = Math.floor(totalSecondes / 3600);
  const min = Math.floor((totalSecondes % 3600) / 60);
  const s = totalSecondes % 60;
  const deux = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${deux(min)}:${deux(s)}` : `${min}:${deux(s)}`;
}

// "25 min", "1 h 30", "45 s" : libellé court d'une durée.
export function formaterDureeCourte(ms: number): string {
  const totalSecondes = Math.round(ms / SECONDE);
  const h = Math.floor(totalSecondes / 3600);
  const min = Math.floor((totalSecondes % 3600) / 60);
  const s = totalSecondes % 60;
  if (h > 0) return min > 0 ? `${h} h ${String(min).padStart(2, '0')}` : `${h} h`;
  if (min > 0) return s > 0 ? `${min} min ${s} s` : `${min} min`;
  return `${s} s`;
}

// "4 minutes et 30 secondes", "1 heure et 5 minutes" : pour la voix.
export function formaterDureeParlee(ms: number): string {
  const totalSecondes = Math.max(0, Math.round(ms / SECONDE));
  const h = Math.floor(totalSecondes / 3600);
  const min = Math.floor((totalSecondes % 3600) / 60);
  // Au-delà de 5 minutes, les secondes n'apportent rien à l'oreille.
  const s = h === 0 && min < 5 ? totalSecondes % 60 : 0;
  const morceaux: string[] = [];
  if (h > 0) morceaux.push(`${h} heure${h > 1 ? 's' : ''}`);
  if (min > 0) morceaux.push(`${min} minute${min > 1 ? 's' : ''}`);
  if (s > 0) morceaux.push(`${s} seconde${s > 1 ? 's' : ''}`);
  return morceaux.length ? morceaux.join(' et ') : 'moins d’une seconde';
}
