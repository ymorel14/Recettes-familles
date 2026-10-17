import { majusculeInitiale } from '../utils/texte';

// Lecture de l'ajout rapide : « 2 lait », « lait x2 », « 500 g farine »,
// « farine 500g », « 1,5 kg pommes », « pain ». La quantité est toujours
// facultative : sans nombre, l'article n'a pas de quantité.

export type Saisie = { libelle: string; quantite: number | null; unite: string | null };

const UNITES: Record<string, string> = {
  g: 'g', gr: 'g', gramme: 'g', grammes: 'g',
  kg: 'kg', kilo: 'kg', kilos: 'kg',
  l: 'L', litre: 'L', litres: 'L',
  cl: 'cL', ml: 'mL',
  paquet: 'paquet', paquets: 'paquet', pack: 'pack', packs: 'pack',
  boite: 'boîte', boites: 'boîte', 'boîte': 'boîte', 'boîtes': 'boîte',
  bouteille: 'bouteille', bouteilles: 'bouteille',
  pot: 'pot', pots: 'pot', sachet: 'sachet', sachets: 'sachet',
  tranche: 'tranche', tranches: 'tranche', botte: 'botte', bottes: 'botte',
  barquette: 'barquette', barquettes: 'barquette', rouleau: 'rouleau', rouleaux: 'rouleau',
  douzaine: 'douzaine', douzaines: 'douzaine',
};

function nombre(texte: string): number | null {
  const n = Number(texte.replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function unite(mot: string | undefined): string | null {
  if (!mot) return null;
  return UNITES[mot.toLocaleLowerCase('fr-FR')] ?? null;
}

export function lireSaisie(brut: string): Saisie {
  let texte = brut.trim().replace(/\s+/g, ' ');
  if (!texte) return { libelle: '', quantite: null, unite: null };

  // « lait x2 », « lait ×2 », « lait (2) »
  let m = texte.match(/^(.*\S)\s*(?:[x×*]\s*(\d+(?:[.,]\d+)?)|\((\d+(?:[.,]\d+)?)\))$/i);
  if (m) {
    return { libelle: majusculeInitiale(m[1]), quantite: nombre(m[2] ?? m[3]), unite: null };
  }
  // « 2x lait », « 500g farine », « 500 g de farine », « 2 bouteilles d'eau »
  m = texte.match(/^(\d+(?:[.,]\d+)?)\s*(?:x\s*)?([a-zA-Zîé]+)?\s+(.*)$/);
  if (m) {
    const q = nombre(m[1]);
    const u = unite(m[2]);
    let reste = u ? m[3] : `${m[2] ?? ''} ${m[3]}`.trim();
    if (u) reste = reste.replace(/^(de |d'|d’)/i, '');
    return { libelle: majusculeInitiale(reste), quantite: q, unite: u };
  }
  // « farine 500g », « farine 500 g », « lait 2 »
  m = texte.match(/^(.*\S)\s+(\d+(?:[.,]\d+)?)\s*([a-zA-Zîé]+)?$/);
  if (m && (m[3] === undefined || unite(m[3]))) {
    return { libelle: majusculeInitiale(m[1]), quantite: nombre(m[2]), unite: unite(m[3]) };
  }
  return { libelle: majusculeInitiale(texte), quantite: null, unite: null };
}

// « 2 », « 500 g », « 1,5 kg » ; vide sans quantité.
export function formaterQuantite(quantite: number | null, uniteArticle: string | null): string {
  if (quantite == null) return uniteArticle ?? '';
  const q = Number.isInteger(quantite) ? String(quantite) : String(Math.round(quantite * 100) / 100).replace('.', ',');
  return uniteArticle ? `${q} ${accorderUnite(uniteArticle, quantite)}` : q;
}

// « 2 paquet » → « 2 paquets » ; les symboles (g, kg, L…) ne changent pas.
const SYMBOLES = new Set(['g', 'kg', 'l', 'cl', 'ml', 'mg']);
function accorderUnite(uniteArticle: string, quantite: number): string {
  const u = uniteArticle.trim();
  if (quantite < 2 || SYMBOLES.has(u.toLowerCase()) || /[sxz]$/i.test(u) || u.includes(' ')) return u;
  return /eau$/i.test(u) ? `${u}x` : `${u}s`;
}
