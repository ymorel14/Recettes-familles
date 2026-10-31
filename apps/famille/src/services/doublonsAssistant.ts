import AsyncStorage from '@react-native-async-storage/async-storage';
import { cleProduit } from '../modules/courses/utils/texte';
import { appelerAssistant } from './assistant';

// Fusion des doublons de Courses (spécification § 4.2.3). Le code repère
// les articles qui ont un mot en commun (« Lait » / « Lait demi-écrémé »,
// « Lait » / « Lait de coco ») ; l'assistant dit si c'est le même produit
// et additionne les quantités. Il propose seulement : la personne fusionne
// ou répond « pas le même », mémorisé par le foyer.
//
// Les réponses sont gardées sur le téléphone (300 au plus) : le même
// groupe n'est jamais redemandé.

export type ArticleCompare = { libelle: string; quantite: number | null; unite: string | null };

export type VerdictDoublon = {
  meme_produit: boolean;
  libelle: string | null;
  quantite: number | null;
  unite: string | null;
  explication: string | null;
};

const CLE_STOCKAGE = 'famille.assistant.doublons';
const MAX = 300;
let memoire: Map<string, VerdictDoublon> | null = null;

async function charger(): Promise<Map<string, VerdictDoublon>> {
  if (memoire) return memoire;
  memoire = new Map();
  try {
    const brut = await AsyncStorage.getItem(CLE_STOCKAGE);
    if (brut) (JSON.parse(brut) as [string, VerdictDoublon][]).forEach(([k, v]) => memoire!.set(k, v));
  } catch {
    // Stockage illisible : on repart de zéro.
  }
  return memoire;
}

function sauver(m: Map<string, VerdictDoublon>) {
  const entrees = [...m.entries()].slice(-MAX);
  AsyncStorage.setItem(CLE_STOCKAGE, JSON.stringify(entrees)).catch(() => {});
}

// Même groupe = mêmes produits, mêmes quantités, mêmes unités.
export function signatureGroupe(articles: ArticleCompare[]): string {
  return articles
    .map((a) => `${cleProduit(a.libelle)}|${a.quantite ?? ''}|${(a.unite ?? '').trim().toLowerCase()}`)
    .sort()
    .join('§');
}

export function verdictConnu(signature: string): VerdictDoublon | undefined {
  return memoire?.get(signature);
}

// Verdicts pour ces groupes : ceux déjà connus, puis l'assistant pour les
// autres (6 au plus par appel). Une erreur de l'assistant remonte (l'app
// montre alors la question simple, sans proposition).
export async function verdictsDoublons(
  groupes: ArticleCompare[][],
  signal?: AbortSignal
): Promise<Map<string, VerdictDoublon>> {
  const m = await charger();
  const resultat = new Map<string, VerdictDoublon>();
  const aDemander: { signature: string; articles: ArticleCompare[] }[] = [];
  for (const articles of groupes) {
    const signature = signatureGroupe(articles);
    const connu = m.get(signature);
    if (connu) resultat.set(signature, connu);
    else if (!aDemander.some((g) => g.signature === signature)) aDemander.push({ signature, articles });
  }
  const lot = aDemander.slice(0, 6);
  if (!lot.length) return resultat;
  const r = await appelerAssistant<{ groupes: (VerdictDoublon & { id: string })[] }>(
    'doublons',
    {
      groupes: lot.map((g, i) => ({
        id: `g${i + 1}`,
        articles: g.articles.map((a) => ({ libelle: a.libelle, quantite: a.quantite, unite: a.unite })),
      })),
    },
    { signal, delaiMs: 20000 }
  );
  r.groupes.forEach((v) => {
    const g = lot[Number(v.id.replace(/^g/, '')) - 1];
    if (!g) return;
    const verdict: VerdictDoublon = {
      meme_produit: !!v.meme_produit,
      libelle: v.libelle ?? null,
      quantite: v.quantite ?? null,
      unite: v.unite ?? null,
      explication: v.explication ?? null,
    };
    m.delete(g.signature);
    m.set(g.signature, verdict);
    resultat.set(g.signature, verdict);
  });
  sauver(m);
  return resultat;
}
