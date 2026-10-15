// Options de trajet (avion, bateau, voiture…) et leurs étapes : calculs
// seuls, sans base ni affichage, testés par scripts/tester-options-trajet.mjs.
//
// Une option est une suite d'étapes communes (voyage.trajets), le « tronc » ;
// chaque étape a ses passagers, d'un ou plusieurs foyers. Les familles
// n'habitant pas au même endroit, chaque foyer peut avoir ses propres étapes
// (propre_foyer) pour rejoindre le groupe à un rendez-vous : le départ d'une
// étape commune (rejoint_id), ou aller directement à destination. Le retour
// est l'aller en sens inverse, sauf si l'option a un retour différent (étapes
// sens = 'retour'). Seule l'option retenue compte dans le budget.

export type StatutOption = 'proposee' | 'retenue' | 'ecartee';
export type SensEtape = 'aller_retour' | 'aller' | 'retour';

export type EtapeCalcul = {
  id: string;
  option_id: string | null;
  ordre: number;
  mode: string;
  cout_total: number | string;
  duree_minutes: number | null;
  passagers: { personne_id: string }[];
  sens?: SensEtape | null;
  propre_foyer?: boolean | null;
  rejoint_id?: string | null;
  foyer_id?: string | null;
};

export type OptionCalcul = { id: string; nom: string; statut: StatutOption; cree_le?: string };

export type ResumeOption = {
  cout: number;
  voyageurs: number;
  coutParVoyageur: number | null;
  // Le plus long temps de trajet d'une personne (somme de ses étapes), en
  // minutes ; dureeIncomplete si une de ses étapes n'a pas de durée.
  dureeMax: number | null;
  dureeIncomplete: boolean;
  modes: string[];
  // Invités attendus sans aucune étape dans cette option.
  sansPlace: string[];
  // Étapes dont les passagers viennent de plusieurs foyers.
  etapesPartagees: number;
};

export function etapesDe<T extends EtapeCalcul>(optionId: string | null, etapes: T[]): T[] {
  return etapes
    .filter((e) => e.option_id === optionId)
    .sort((a, b) => a.ordre - b.ordre || a.id.localeCompare(b.id));
}

export function resumerOption(
  etapes: EtapeCalcul[],
  attendus: string[],
  foyerDe: (personneId: string) => string | null = () => null
): ResumeOption {
  const cout = Math.round(etapes.reduce((a, e) => a + Number(e.cout_total || 0), 0) * 100) / 100;
  const parPersonne = new Map<string, { minutes: number; incomplete: boolean }>();
  // Temps de trajet : celui de l'aller (le retour a ses propres étapes
  // seulement si l'option a un retour différent).
  for (const e of etapes) {
    if (e.sens === 'retour') continue;
    for (const p of e.passagers) {
      const d = parPersonne.get(p.personne_id) ?? { minutes: 0, incomplete: false };
      if (e.duree_minutes == null) d.incomplete = true;
      else d.minutes += e.duree_minutes;
      parPersonne.set(p.personne_id, d);
    }
  }
  const voyageurs = new Set(etapes.flatMap((e) => e.passagers.map((p) => p.personne_id)));
  const durees = [...parPersonne.values()];
  const avecDuree = durees.filter((d) => d.minutes > 0);
  const modes: string[] = [];
  for (const e of etapes) if (!modes.includes(e.mode)) modes.push(e.mode);
  const etapesPartagees = etapes.filter((e) => {
    if (e.sens === 'retour') return false;
    const foyers = new Set(e.passagers.map((p) => foyerDe(p.personne_id)).filter(Boolean));
    return foyers.size > 1;
  }).length;
  return {
    cout,
    voyageurs: voyageurs.size,
    coutParVoyageur: voyageurs.size ? Math.round((cout / voyageurs.size) * 100) / 100 : null,
    dureeMax: avecDuree.length ? Math.max(...avecDuree.map((d) => d.minutes)) : null,
    dureeIncomplete: durees.some((d) => d.incomplete),
    modes,
    sansPlace: attendus.filter((id) => !voyageurs.has(id)),
    etapesPartagees,
  };
}

// Branche : les étapes propres à un foyer pour un même rendez-vous (ou
// directement), dans leur ordre.
export type Branche<E extends EtapeCalcul> = {
  cle: string;
  foyer_id: string | null;
  rejoint_id: string | null;
  etapes: E[];
  personnes: string[];
};

export type VueOption<E extends EtapeCalcul> = {
  // Étapes communes, dans l'ordre.
  tronc: E[];
  // Par étape commune : à l'aller, les branches qui rejoignent le groupe à
  // son départ ; au retour, celles qui le quittent à son arrivée.
  branches: Map<string, Branche<E>[]>;
  // Branches qui ne passent pas par le tronc commun.
  directes: Branche<E>[];
};

export const estRetour = (e: { sens?: SensEtape | null }) => e.sens === 'retour';

// Les étapes d'une option, vues à l'aller (étapes aller et aller-retour) ou
// au retour (étapes retour seulement : option à retour différent).
export function vueOption<E extends EtapeCalcul>(etapes: E[], sens: 'aller' | 'retour'): VueOption<E> {
  const duSens = [...etapes]
    .filter((e) => estRetour(e) === (sens === 'retour'))
    .sort((a, b) => a.ordre - b.ordre || a.id.localeCompare(b.id));
  const tronc = duSens.filter((e) => !e.propre_foyer);
  const idsTronc = new Set(tronc.map((e) => e.id));
  const parCle = new Map<string, Branche<E>>();
  for (const e of duSens.filter((x) => x.propre_foyer)) {
    const rejoint = e.rejoint_id && idsTronc.has(e.rejoint_id) ? e.rejoint_id : null;
    const cle = `${e.foyer_id ?? ''}|${rejoint ?? ''}`;
    const b = parCle.get(cle) ?? { cle, foyer_id: e.foyer_id ?? null, rejoint_id: rejoint, etapes: [], personnes: [] };
    b.etapes.push(e);
    for (const p of e.passagers) if (!b.personnes.includes(p.personne_id)) b.personnes.push(p.personne_id);
    parCle.set(cle, b);
  }
  const branches = new Map<string, Branche<E>[]>();
  const directes: Branche<E>[] = [];
  for (const b of parCle.values()) {
    if (b.rejoint_id) branches.set(b.rejoint_id, [...(branches.get(b.rejoint_id) ?? []), b]);
    else directes.push(b);
  }
  return { tronc, branches, directes };
}

// Lieu du rendez-vous d'une étape commune : son départ à l'aller, son
// arrivée au retour.
export function lieuRendezVous(e: { ville_depart?: string | null; ville_arrivee?: string | null; sens?: SensEtape | null }): string {
  return (estRetour(e) ? e.ville_arrivee : e.ville_depart) || 'lieu à préciser';
}

// Étapes qui comptent dans le budget : celles de l'option retenue ; sans
// choix, celles de la seule option, ou à défaut de la moins chère (avec une
// note pour le dire). Les étapes sans option (base pas encore à jour)
// comptent toutes.
export function etapesDuBudget<E extends EtapeCalcul>(
  options: OptionCalcul[],
  etapes: E[]
): { etapes: E[]; option: OptionCalcul | null; note: string | null } {
  if (options.length === 0) return { etapes, option: null, note: null };
  const retenue = options.find((o) => o.statut === 'retenue');
  if (retenue) return { etapes: etapesDe(retenue.id, etapes), option: retenue, note: null };
  const candidates = options.filter((o) => o.statut !== 'ecartee');
  const liste = candidates.length ? candidates : options;
  if (liste.length === 1) return { etapes: etapesDe(liste[0].id, etapes), option: liste[0], note: null };
  const cout = (o: OptionCalcul) => etapesDe(o.id, etapes).reduce((a, e) => a + Number(e.cout_total || 0), 0);
  const avecEtapes = liste.filter((o) => etapesDe(o.id, etapes).length > 0);
  const moinsChere = (avecEtapes.length ? avecEtapes : liste).reduce((m, o) => (cout(o) < cout(m) ? o : m));
  return {
    etapes: etapesDe(moinsChere.id, etapes),
    option: moinsChere,
    note: `Trajet pas encore choisi : budget estimé avec l’option la moins chère (« ${moinsChere.nom} »).`,
  };
}

// Durée saisie à la main : "6 h 30", "6h30", "1:45", "90 min", "2" (heures)
// → minutes ; null si illisible.
export function lireDuree(texte: string): number | null {
  const t = texte.trim().toLowerCase().replace(',', '.');
  if (!t) return null;
  let m = t.match(/^(\d+)\s*(?:h|:)\s*(\d{1,2})?\s*(?:min)?$/);
  if (m) return Number(m[1]) * 60 + Number(m[2] ?? 0);
  m = t.match(/^(\d+)\s*(?:min|mn|m)$/);
  if (m) return Number(m[1]);
  m = t.match(/^(\d+(?:\.\d+)?)$/);
  if (m) return Math.round(Number(m[1]) * 60);
  return null;
}
