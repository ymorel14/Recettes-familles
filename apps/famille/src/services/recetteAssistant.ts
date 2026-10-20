import {
  formulaireVide,
  nouvelElementBrouillon,
  nouvelIngredientBrouillon,
  nouvelleEtapeBrouillon,
  nouvellePhotoBrouillonLocale,
  type RecetteFormulaire,
} from '../modules/recettes/services/recettes';

// Recette lue sur une photo par l'assistant (route ia/recette-photo, même
// forme que supabase/functions/ia/routes/recette-photo.ts) et sa mise en
// forme pour RecetteFormScreen. Rien n'est enregistré ici.

export type IngredientLu = { quantite: number | null; unite: string | null; libelle: string; a_verifier: boolean };
export type ElementLu = { nom: string | null; variante_de: string | null; ingredients: IngredientLu[]; etapes: string[] };
export type RecetteLue = {
  titre: string;
  parts: number | null;
  prepa_min: number | null;
  cuisson_min: number | null;
  elements: ElementLu[];
  categories: string[];
  notes: string | null;
  a_verifier: string[];
};

// Ce que le formulaire doit marquer « À vérifier » (§ 7.3 de la charte).
export type VerificationRecette = { champs: string[]; ingredients: string[] };

function quantiteTexte(q: number | null): string {
  if (q == null) return '';
  const arrondi = Math.round(q * 100) / 100;
  return String(arrondi).replace('.', ',');
}

const propre = (s: string | null | undefined) => (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

export function recetteLueVersFormulaire(
  r: RecetteLue,
  photoCouverture: string | null
): { formulaire: RecetteFormulaire; verification: VerificationRecette } {
  const vide = formulaireVide();
  const blocs = r.elements.length ? r.elements : [{ nom: null, variante_de: null, ingredients: [], etapes: [] }];
  const elements = blocs.map((b) => ({ lu: b, brouillon: nouvelElementBrouillon(b.nom ?? '') }));
  // Variante « au choix » : rattachée à l'élément principal qu'elle remplace.
  for (const e of elements) {
    if (!e.lu.variante_de) continue;
    const principal = elements.find((x) => x !== e && !x.lu.variante_de && propre(x.lu.nom) === propre(e.lu.variante_de));
    if (principal) e.brouillon.varianteDe = principal.brouillon.clefId;
  }
  const aVerifierIngredients: string[] = [];
  const ingredients = elements.flatMap((e) =>
    e.lu.ingredients.map((i) => {
      const brouillon = {
        ...nouvelIngredientBrouillon(),
        libelle: i.libelle.trim(),
        quantite: quantiteTexte(i.quantite),
        unite: i.unite?.trim() ?? '',
        elementClef: e.brouillon.clefId,
      };
      if (i.a_verifier) aVerifierIngredients.push(brouillon.clefId);
      return brouillon;
    })
  );
  const etapes = elements.flatMap((e) =>
    e.lu.etapes.map((texte) => ({ ...nouvelleEtapeBrouillon(), texte, elementClef: e.brouillon.clefId }))
  );
  const formulaire: RecetteFormulaire = {
    ...vide,
    titre: r.titre,
    photos: photoCouverture ? [nouvellePhotoBrouillonLocale(photoCouverture)] : [],
    partsDefaut: r.parts ?? vide.partsDefaut,
    tempsPreparationMinutes: r.prepa_min,
    tempsCuissonMinutes: r.cuisson_min,
    notes: r.notes ?? '',
    nomsCategories: r.categories,
    elements: elements.map((e) => e.brouillon),
    ingredients: ingredients.length ? ingredients : [nouvelIngredientBrouillon()],
    etapes: etapes.length ? etapes : [nouvelleEtapeBrouillon()],
    source: 'scan',
  };
  const champs = new Set(r.a_verifier);
  if (r.parts == null) champs.add('parts');
  return { formulaire, verification: { champs: [...champs], ingredients: aVerifierIngredients } };
}
