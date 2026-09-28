// Normalisation de texte partagée : retire les accents et met en
// minuscules, pour comparer deux textes sans tenir compte des accents ni de
// la casse (fusion des ingrédients dans la liste de courses, détection des
// ingrédients cités dans une étape — §7, §8).
//
// Les ligatures françaises (œ, æ) ne sont PAS des lettres accentuées : ce
// sont des caractères Unicode à part entière, que `normalize('NFD')` ne
// décompose donc pas en "oe"/"ae" (contrairement à un é qui devient bien
// e + accent). Sans ce remplacement préalable, "œufs" et "oeufs" — deux
// façons également courantes d'écrire le même mot, la seconde étant ce que
// produit la plupart des claviers et de l'OCR — étaient traités comme deux
// produits différents (retour utilisateur : les articles ne fusionnaient
// pas dans la liste de courses).
export function normaliserTexte(texte: string): string {
  return texte
    .replace(/[œŒ]/g, (c) => (c === 'œ' ? 'oe' : 'OE'))
    .replace(/[æÆ]/g, (c) => (c === 'æ' ? 'ae' : 'AE'))
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}
