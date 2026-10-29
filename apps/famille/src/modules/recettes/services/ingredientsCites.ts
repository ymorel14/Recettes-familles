import { normaliserTexte } from '../utils/texte';

// Repère, parmi les ingrédients d'une recette, ceux cités dans le texte libre
// d'une étape (« Mélanger la farine et les œufs » cite « Farine » et
// « Œufs ») — mode assistant, formulaire. Code pur (sans base ni réseau),
// testé par tests/recettes/ingredients-cites.test.ts.
//
// Retour de test R-12 : en plus du mot exact, on reconnaît
// 1. les VERBES de cuisine : « salez » → sel, « beurrez le moule » → beurre ;
// 2. les FAMILLES de mots : « ajoutez les épices », « assaisonnez » → cumin,
//    paprika, curry… de la recette ; « les herbes » → thym, persil… ;
// 3. les PLURIELS en -x / -aux : poireaux, choux, bocaux.
// Quand l'assistant a relié les étapes à leurs ingrédients (R-12, option 4,
// `etapes.ingredients_cites`), ce lien est utilisé en priorité ; ce code
// reste le secours.

// Mots qui ne désignent pas l'ingrédient (articles, unités de mesure).
const MOTS_VIDES = new Set([
  'de', 'du', 'des', 'la', 'le', 'les', 'un', 'une', 'et', 'au', 'aux', 'en', 'd', 'l',
  'pincee', 'cuillere', 'sachet', 'gousse', 'tranche', 'verre', 'brin', 'boite', 'morceau',
]);

// Singulier approché d'un mot normalisé (sans accents, minuscules).
export function singulier(mot: string): string {
  if (mot.length > 4 && mot.endsWith('eaux')) return mot.slice(0, -1); // poireaux → poireau
  if (mot.length > 4 && mot.endsWith('aux')) return `${mot.slice(0, -3)}al`; // bocaux → bocal
  if (mot.length > 3 && mot.endsWith('oux')) return mot.slice(0, -1); // choux → chou
  if (mot.length > 3 && mot.endsWith('eux')) return mot.slice(0, -1); // cheveux → cheveu
  if (mot.length > 3 && mot.endsWith('s') && !mot.endsWith('ss')) return mot.slice(0, -1);
  return mot;
}

function mots(texte: string): string[] {
  return normaliserTexte(texte).split(/[^a-z0-9]+/).filter(Boolean);
}

// Mots signifiants d'un libellé d'ingrédient, au singulier.
function motsIngredient(libelle: string): string[] {
  return mots(libelle)
    .map(singulier)
    .filter((m) => m.length >= 3 && !MOTS_VIDES.has(m));
}

// Familles d'ingrédients : un ingrédient en fait partie si l'un de ses mots
// est dans la liste (au singulier).
const FAMILLES: Record<'epices' | 'herbes', Set<string>> = {
  epices: new Set([
    'epice', 'cumin', 'paprika', 'curry', 'cannelle', 'muscade', 'piment', 'curcuma', 'gingembre',
    'hanout', 'cardamome', 'girofle', 'safran', 'badiane', 'anis', 'cayenne', 'espelette', 'poivre',
    'garam', 'masala', 'tandoori', 'colombo', 'sumac', 'zaatar', 'fenugrec', 'carvi', 'chili', 'baie',
  ]),
  herbes: new Set([
    'herbe', 'thym', 'laurier', 'persil', 'basilic', 'ciboulette', 'coriandre', 'menthe', 'estragon',
    'romarin', 'sauge', 'origan', 'cerfeuil', 'aneth', 'marjolaine', 'sarriette', 'aromate', 'garni',
    'provence', 'liveche', 'oseille',
  ]),
};

// Mots de l'étape qui renvoient à un ingrédient sans le nommer.
const RENVOIS: { motif: RegExp; ingredients?: string[]; familles?: (keyof typeof FAMILLES)[] }[] = [
  { motif: /^sal(er|ez|e|ee|es|ees)$/, ingredients: ['sel'] },
  { motif: /^poivr(er|ez|e|ee|es|ees)$/, ingredients: ['poivre'] },
  { motif: /^sucr(er|ez|e|ee|es|ees)$/, ingredients: ['sucre'] },
  { motif: /^beurr(er|ez|e|ee|es|ees)$/, ingredients: ['beurre'] },
  { motif: /^farin(er|ez|ee|ees)$/, ingredients: ['farine'] },
  { motif: /^huil(er|ez|e|ee|es|ees)$/, ingredients: ['huile'] },
  { motif: /^citronn(er|ez|e|ee|es|ees)$/, ingredients: ['citron'] },
  { motif: /^vinaigr(er|ez)$/, ingredients: ['vinaigre'] },
  { motif: /^graiss(er|ez)$/, ingredients: ['beurre', 'huile'] },
  { motif: /^(assaisonn(er|ez|e|ee|es|ees|ement)|rectifi(er|ez))$/, ingredients: ['sel', 'poivre'], familles: ['epices'] },
  { motif: /^epic(er|ez|e|ee|es|ees)$/, familles: ['epices'] },
  { motif: /^(herbe|herbes|aromate|aromates|aromatique|aromatiques)$/, familles: ['herbes'] },
];

export function detecterIngredientsCites<T extends { libelle: string }>(texte: string, ingredients: T[]): T[] {
  const motsEtape = mots(texte);
  const presents = new Set(motsEtape.map(singulier));
  const familles = new Set<keyof typeof FAMILLES>();
  motsEtape.forEach((m) => {
    RENVOIS.forEach((r) => {
      if (!r.motif.test(m)) return;
      r.ingredients?.forEach((i) => presents.add(i));
      r.familles?.forEach((f) => familles.add(f));
    });
  });
  return ingredients.filter((ingredient) => {
    const motsIng = motsIngredient(ingredient.libelle);
    if (motsIng.length === 0) return false;
    if (motsIng.some((m) => presents.has(m))) return true;
    return [...familles].some((f) => motsIng.some((m) => FAMILLES[f].has(m)));
  });
}

// Ingrédients d'une étape : le lien fait par l'assistant s'il est encore
// valable (même texte d'étape), sinon le repérage par mots ci-dessus. Les
// ingrédients cités par jeton {{ingredient:id}} sont toujours inclus.
export function ingredientsDeLEtape<T extends { id: string; libelle: string }>(
  etape: { texte: string; ingredients_cites?: { texte: string; libelles: string[] } | null },
  ingredients: T[]
): T[] {
  const lien = etape.ingredients_cites;
  if (!lien || lien.texte !== etape.texte || !Array.isArray(lien.libelles)) {
    return detecterIngredientsCites(etape.texte, ingredients);
  }
  const libelles = new Set(lien.libelles.map((l) => normaliserTexte(l.trim())));
  const parJeton = new Set(Array.from(etape.texte.matchAll(/\{\{ingredient:([\w-]+)\}\}/g)).map((m) => m[1]));
  return ingredients.filter((i) => libelles.has(normaliserTexte(i.libelle.trim())) || parJeton.has(i.id));
}

// Le lien de l'assistant manque ou n'est plus valable pour au moins une étape.
export function lienAFaire(etapes: { texte: string; ingredients_cites?: { texte: string } | null }[]): boolean {
  return etapes.some((e) => e.texte.trim() && (!e.ingredients_cites || e.ingredients_cites.texte !== e.texte));
}
