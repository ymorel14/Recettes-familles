import { supabase } from './supabase';
import { appelerAssistant } from '../../../services/assistant';
import { resoudreEtapePourAffichage } from './recettes';
import type { RecetteComplete } from '../types/models';

// Lien étapes → ingrédients fait par l'assistant (retour de test R-12,
// route `recette-ingredients`, ~0,001 $ par recette), une fois par recette
// puis à chaque changement du texte d'une étape. Gardé dans
// `etapes.ingredients_cites` quand la recette est de notre foyer (sinon
// seulement pour cette séance). Ne lève jamais d'erreur : sans assistant,
// le repérage par mots prend le relais.
export async function relierIngredientsEtapes(
  recette: RecetteComplete,
  enregistrer: boolean
): Promise<Map<string, { texte: string; libelles: string[] }>> {
  const liens = new Map<string, { texte: string; libelles: string[] }>();
  const etapes = recette.etapes.filter((e) => e.texte.trim());
  if (!etapes.length || !recette.ingredients.length) return liens;
  try {
    const r = await appelerAssistant<{ etapes: { id: string; ingredients: string[] }[] }>('recette-ingredients', {
      ingredients: recette.ingredients.map((i) => ({ id: i.id, libelle: i.libelle })),
      etapes: etapes.map((e) => ({ id: e.id, texte: resoudreEtapePourAffichage(e.texte, recette.ingredients) })),
    });
    const libelleDe = new Map(recette.ingredients.map((i) => [i.id, i.libelle]));
    r.etapes.forEach((lien) => {
      const etape = etapes.find((e) => e.id === lien.id);
      if (!etape) return;
      liens.set(etape.id, {
        texte: etape.texte,
        libelles: lien.ingredients.map((id) => libelleDe.get(id)).filter((l): l is string => !!l),
      });
    });
    if (enregistrer) {
      // Colonne absente (migration pas encore passée) : on ignore l'erreur.
      await Promise.all(
        [...liens.entries()].map(([id, valeur]) =>
          supabase.from('etapes').update({ ingredients_cites: valeur }).eq('id', id).then(() => undefined, () => undefined)
        )
      );
    }
  } catch {
    // Assistant indisponible ou en pause : le repérage par mots suffit.
  }
  return liens;
}
