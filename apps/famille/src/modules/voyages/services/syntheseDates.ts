// Synthèse graphique des propositions de dates proches ou qui se
// chevauchent (écran Dates) : calculs seuls, sans affichage, testés par
// scripts/tester-synthese.mjs.

export type VoteSynthese = { personne_id: string; reponse: 'oui' | 'si_besoin' | 'non' };
export type PropositionSynthese = { id: string; date_debut: string; date_fin: string; votes: VoteSynthese[] };

export type JourSynthese = {
  date: string; // AAAA-MM-JJ
  weekend: boolean;
  // Pour chaque personne, sa meilleure réponse parmi les propositions qui
  // couvrent ce jour (dire oui au 10–17 et non au 12–19, c'est dire que le
  // 12 convient).
  oui: number;
  possible: number;
  non: number;
};

export type BarreSynthese = {
  id: string;
  date_debut: string;
  date_fin: string;
  debut: number; // indice du premier jour dans la synthèse
  duree: number; // nombre de jours
  score: number; // oui × 2 + possible
  oui: number;
  possible: number;
  non: number;
};

export type Synthese = {
  jours: JourSynthese[];
  barres: BarreSynthese[];
  // Plus longue suite de jours qui conviennent au plus de monde.
  meilleurs: { debut: string; fin: string; oui: number; possible: number } | null;
};

const JOUR = 86_400_000;
const versTemps = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
const versIso = (t: number) => new Date(t).toISOString().slice(0, 10);
const ecartJours = (a: string, b: string) => Math.round((versTemps(b) - versTemps(a)) / JOUR);

// Groupes de propositions qui se chevauchent ou sont à quelques jours les
// unes des autres. Seuls les groupes d'au moins deux propositions valent
// une synthèse ; au-delà de dureeMax jours, le dessin serait illisible.
export function regrouperProches<T extends { date_debut: string; date_fin: string }>(
  propositions: T[],
  ecartMax = 3,
  dureeMax = 45
): T[][] {
  const triees = [...propositions].sort((a, b) => a.date_debut.localeCompare(b.date_debut) || a.date_fin.localeCompare(b.date_fin));
  const groupes: T[][] = [];
  let courant: T[] = [];
  let finCourante = '';
  for (const p of triees) {
    if (courant.length && ecartJours(finCourante, p.date_debut) <= ecartMax && ecartJours(courant[0].date_debut, p.date_fin) < dureeMax) {
      courant.push(p);
      if (p.date_fin > finCourante) finCourante = p.date_fin;
    } else {
      if (courant.length) groupes.push(courant);
      courant = [p];
      finCourante = p.date_fin;
    }
  }
  if (courant.length) groupes.push(courant);
  return groupes.filter((g) => g.length >= 2);
}

const RANG = { oui: 2, si_besoin: 1, non: 0 } as const;

export function synthetiser(propositions: PropositionSynthese[]): Synthese {
  if (propositions.length === 0) return { jours: [], barres: [], meilleurs: null };
  const debut = propositions.reduce((m, p) => (p.date_debut < m ? p.date_debut : m), propositions[0].date_debut);
  const fin = propositions.reduce((m, p) => (p.date_fin > m ? p.date_fin : m), propositions[0].date_fin);
  const n = ecartJours(debut, fin) + 1;

  const jours: JourSynthese[] = [];
  for (let i = 0; i < n; i++) {
    const t = versTemps(debut) + i * JOUR;
    const date = versIso(t);
    const jourSemaine = new Date(t).getUTCDay();
    const meilleure = new Map<string, number>();
    for (const p of propositions) {
      if (p.date_debut > date || p.date_fin < date) continue;
      for (const v of p.votes) meilleure.set(v.personne_id, Math.max(meilleure.get(v.personne_id) ?? -1, RANG[v.reponse]));
    }
    const rangs = [...meilleure.values()];
    jours.push({
      date,
      weekend: jourSemaine === 0 || jourSemaine === 6,
      oui: rangs.filter((r) => r === 2).length,
      possible: rangs.filter((r) => r === 1).length,
      non: rangs.filter((r) => r === 0).length,
    });
  }

  const barres: BarreSynthese[] = propositions
    .map((p) => {
      const oui = p.votes.filter((v) => v.reponse === 'oui').length;
      const possible = p.votes.filter((v) => v.reponse === 'si_besoin').length;
      const non = p.votes.filter((v) => v.reponse === 'non').length;
      return {
        id: p.id,
        date_debut: p.date_debut,
        date_fin: p.date_fin,
        debut: ecartJours(debut, p.date_debut),
        duree: ecartJours(p.date_debut, p.date_fin) + 1,
        score: oui * 2 + possible,
        oui,
        possible,
        non,
      };
    })
    .sort((a, b) => a.debut - b.debut || a.duree - b.duree);

  // Meilleurs jours : le plus de « oui », puis de « possible » ; la plus
  // longue suite de tels jours.
  const valeur = (j: JourSynthese) => j.oui * 2 + j.possible;
  const max = Math.max(...jours.map(valeur));
  let meilleurs: Synthese['meilleurs'] = null;
  if (max > 0) {
    let i = 0;
    let long = 0;
    while (i < n) {
      if (valeur(jours[i]) !== max) {
        i++;
        continue;
      }
      let j = i;
      while (j + 1 < n && valeur(jours[j + 1]) === max) j++;
      if (j - i + 1 > long) {
        long = j - i + 1;
        meilleurs = { debut: jours[i].date, fin: jours[j].date, oui: jours[i].oui, possible: jours[i].possible };
      }
      i = j + 1;
    }
  }
  return { jours, barres, meilleurs };
}
