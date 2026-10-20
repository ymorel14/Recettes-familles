// Schémas de sortie communs à plusieurs routes de l'assistant (§ 3.5).
// Les mêmes formes sont décrites côté app dans
// apps/famille/src/services/actionsAssistant.ts (types TypeScript).
import { z } from './ia.ts';

// Un article de courses. `suggestion` : proposé par l'assistant sans avoir
// été demandé tel quel (« de quoi faire un apéro ») → décoché par défaut.
export const Article = z.object({
  libelle: z.string(),
  quantite: z.number().nullable(),
  unite: z.string().nullable(),
  suggestion: z.boolean(),
});

// Une tâche, dans les termes du formulaire de Quotidien :
//   quand : libre (une fois, sans date), quotidienne, hebdomadaire (jours),
//           le (une date), entre (période), avant (date limite)
//   dates au format AAAA-MM-JJ ; « avant » : date_fin = date limite.
export const Tache = z.object({
  libelle: z.string(),
  // Valeurs : libre, quotidienne, hebdomadaire, le, entre, avant (le SDK ne
  // contraint pas les listes de valeurs : voir normaliserTache).
  quand: z.string().describe('Une valeur parmi : libre, quotidienne, hebdomadaire, le, entre, avant'),
  date_debut: z.string().nullable(),
  date_fin: z.string().nullable(),
  annuelle: z.boolean(),
  jours: z.array(z.number()), // 1 = lundi … 7 = dimanche
  pour: z.array(z.string()),
  points: z.number().nullable(),
  a_verifier: z.array(z.string()), // champs incertains : 'date_debut', 'quand'…
});

export const Envie = z.object({
  titre: z.string(),
  details: z.string().nullable(),
  lien: z.string().nullable(),
  prix: z.number().nullable(),
});

export const Souvenir = z.object({
  titre: z.string(),
  date: z.string().nullable(), // AAAA-MM-JJ
  recit: z.string().nullable(),
  personnes: z.array(z.string()), // prénoms
});

export type TacheLue = z.infer<typeof Tache>;
const QUANDS = ['libre', 'quotidienne', 'hebdomadaire', 'le', 'entre', 'avant'];
const DATE = /^\d{4}-\d{2}-\d{2}$/;

// Remet une tâche lue dans les clous du formulaire (valeur de « quand »
// inconnue, dates mal formées) plutôt que d'échouer.
export function normaliserTache(t: TacheLue): TacheLue {
  const quand = QUANDS.includes(String(t.quand).toLowerCase()) ? String(t.quand).toLowerCase() : 'libre';
  const date = (d: string | null) => (d && DATE.test(d) ? d : null);
  let debut = date(t.date_debut);
  let fin = date(t.date_fin);
  const aVerifier = new Set(t.a_verifier);
  if (quand === 'le') {
    debut = debut ?? fin;
    fin = debut;
    if (!debut) aVerifier.add('date_debut');
  }
  if (quand === 'avant' && !fin) aVerifier.add('date_fin');
  if (quand === 'entre' && (!debut || !fin)) aVerifier.add('date_debut');
  return {
    ...t,
    libelle: t.libelle.trim(),
    quand,
    date_debut: debut,
    date_fin: fin,
    jours: [...new Set(t.jours.map(Math.round).filter((j) => j >= 1 && j <= 7))].sort(),
    points: t.points == null ? null : Math.max(0, Math.round(t.points)),
    a_verifier: [...aVerifier],
  };
}
