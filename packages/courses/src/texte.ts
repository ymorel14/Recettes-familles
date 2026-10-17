// Normalisation de texte (même règle que l'app Recettes,
// apps/cuisine/src/utils/texte.ts) : sans accents, minuscules, ligatures
// œ/æ dépliées — « œufs » et « oeufs » sont le même produit.
export function normaliserTexte(texte: string): string {
  return texte
    .replace(/[œŒ]/g, (c) => (c === 'œ' ? 'oe' : 'OE'))
    .replace(/[æÆ]/g, (c) => (c === 'æ' ? 'ae' : 'AE'))
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

// Pluriel simple retiré (« oeufs » → « oeuf »), seulement sur les mots
// d'au moins 4 lettres, pour ne pas tronquer « pois » ou « cassis » (même
// règle que la liste de courses de Recettes).
function ignorerPluriel(mot: string): string {
  if (mot.length > 3 && (mot.endsWith('s') || mot.endsWith('x'))) return mot.slice(0, -1);
  return mot;
}

// Mots d'un libellé, normalisés, pluriel simple retiré.
export function motsNormalises(texte: string): string[] {
  return normaliserTexte(texte)
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .map(ignorerPluriel);
}

// Clé d'un produit : deux libellés de même clé sont le même produit
// (« Œufs » = « oeuf »). Le texte après une virgule (indication de
// préparation venue d'une recette : « origan, émincé ») est ignoré.
export function cleProduit(libelle: string): string {
  const nom = libelle.split(',')[0].trim() || libelle.trim();
  return motsNormalises(nom).join(' ');
}

// Première lettre en majuscule, le reste tel quel (« lait » → « Lait »).
export function majusculeInitiale(texte: string): string {
  const t = texte.trim();
  return t ? t.charAt(0).toLocaleUpperCase('fr-FR') + t.slice(1) : t;
}
