import { normaliserTexte } from '../modules/recettes/utils/texte';
import { resoudreEtapePourAffichage, resoudreLibelleIngredient } from '../modules/recettes/services/recettes';
import type { PointEssai, RecetteComplete } from '../modules/recettes/types/models';
import { appelerAssistant } from './assistant';

// Assistant en cuisine (spécification § 4.1.4). Les commandes vocales par
// mots-clés (gratuites) restent prioritaires ; seule une phrase qui n'est
// pas une commande ET ressemble à une question part à l'assistant.

const MOTS_QUESTION =
  /\b(comment|pourquoi|combien|quand|quel|quelle|quels|quelles|quoi|est ce que|est ce qu|peut on|on peut|je peux|puis je|faut il|il faut|dois je|je dois|remplacer|remplace|a la place|au lieu|normal|trop|pas assez|ca veut dire|c est quoi|qu est ce|ou est|cuit|cuite|cuisson|congeler|conserver|garder)\b/;

export function ressembleAUneQuestion(texte: string): boolean {
  const t = normaliserTexte(texte).replace(/[^a-z0-9?]+/g, ' ').trim();
  const mots = t.split(' ').filter(Boolean);
  if (mots.length < 3) return false;
  return texte.includes('?') || MOTS_QUESTION.test(t);
}

// La recette telle qu'elle est à l'écran : version choisie, quantités
// adaptées, astuces de la famille. Contexte stable (mis en cache) tant que
// les quantités ne changent pas.
export function texteRecettePourAssistant(
  recette: RecetteComplete,
  facteur: number,
  astuces: Map<string, PointEssai[]>
): string {
  const noms = new Map((recette.elements ?? []).map((e) => [e.id, e.nom.trim()] as [string, string]));
  const lignes: string[] = [`Titre : ${recette.titre}`];
  if (recette.parts_defaut) {
    const parts = Math.round(recette.parts_defaut * facteur * 10) / 10;
    lignes.push(`Pour ${parts} part${parts > 1 ? 's' : ''}${facteur !== 1 ? ' (quantités adaptées)' : ''}`);
  }
  if (recette.ingredients.length) {
    lignes.push('', 'Ingrédients :', ...recette.ingredients.map((i) => `- ${resoudreLibelleIngredient(i, facteur)}`));
  }
  lignes.push('', 'Étapes :');
  let elementPrecedent: string | null = null;
  recette.etapes.forEach((e, i) => {
    const element = e.element_id ? noms.get(e.element_id) ?? null : null;
    if (element && element !== elementPrecedent) lignes.push(`(${element})`);
    elementPrecedent = element;
    lignes.push(`${i + 1}. ${resoudreEtapePourAffichage(e.texte, recette.ingredients, facteur)}`);
    (astuces.get(e.id) ?? []).forEach((p) => {
      const astuce = [p.souci, ...p.reponses.map((r) => r.texte)].filter(Boolean).join(' → ');
      if (astuce) lignes.push(`   Astuce de la famille : ${astuce}`);
    });
  });
  return lignes.join('\n').slice(0, 15000);
}

export type EchangeCuisine = { question: string; reponse: string };

export async function poserQuestionCuisine(o: {
  question: string;
  recette: string;
  etape: string | null;
  echanges: EchangeCuisine[];
  signal?: AbortSignal;
}): Promise<string> {
  const r = await appelerAssistant<{ reponse: string }>(
    'cuisine-question',
    { question: o.question, recette: o.recette, etape: o.etape ?? '', echanges: o.echanges.slice(-3) },
    { signal: o.signal, delaiMs: 30000 }
  );
  return r.reponse;
}

// Écho de la voix de l'app (le micro entend aussi la lecture de l'étape) :
// une phrase dont presque tous les mots viennent du dernier texte lu n'est
// pas une question de la personne.
export function ressembleALaLecture(entendu: string, lu: string): boolean {
  const mots = (t: string) => normaliserTexte(t).split(/[^a-z0-9]+/).filter((m) => m.length >= 3);
  const entendus = mots(entendu);
  if (!entendus.length || !lu) return false;
  const dansLu = new Set(mots(lu));
  return entendus.filter((m) => dansLu.has(m)).length / entendus.length >= 0.6;
}
