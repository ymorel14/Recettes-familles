// Résumé du matin (§ 4.6.2) et affinage des habituels (§ 4.2.2) : ce qui
// est commun au traitement de nuit (fonction Edge ia-nuit, API Batches à
// moitié prix) et à la route « resume-matin » de la fonction ia (premier
// résumé de la journée, quand rien n'a été préparé cette nuit).
//
// Les faits viennent TOUJOURS de famille.faits_du_jour, calculés avec les
// règles RLS de la personne : le modèle ne reçoit que ce qu'elle voit.
import { z } from './ia.ts';
import { CONSIGNE as CONSIGNE_RESUME } from './consignes/resume-matin.ts';
import { CONSIGNE as CONSIGNE_HABITUELS } from './consignes/habituels.ts';

export const MODELE_NUIT = 'claude-haiku-5-5' as const;

// Aujourd'hui à Paris : "AAAA-MM-JJ".
export function jourParis(maintenant = new Date()): string {
  return maintenant.toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' });
}

const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

function jourEnClair(iso: string): string {
  const [a, m, j] = iso.split('-').map(Number);
  const d = new Date(Date.UTC(a, m - 1, j));
  return `${JOURS[d.getUTCDay()]} ${j === 1 ? '1er' : j} ${MOIS[m - 1]} ${a}`;
}

// --- Résumé du matin ----------------------------------------------------------

export type Fait = { id: string; module: string; texte: string; cible: string | null };

export type Morceau = { texte: string; cible: string | null; module: string | null };
export type Phrase = { morceaux: Morceau[] };

export const SchemaResume = z.object({
  phrases: z.array(
    z.object({
      morceaux: z.array(
        z.object({
          texte: z.string(),
          fait: z.string().nullable(),
        })
      ),
    })
  ),
});
export type SortieResume = z.infer<typeof SchemaResume>;

export const CONSIGNE_RESUME_MATIN = CONSIGNE_RESUME;

export function faitsValides(entree: unknown): Fait[] {
  if (!Array.isArray(entree)) return [];
  return entree
    .filter((f: any) => f && typeof f.id === 'string' && typeof f.texte === 'string')
    .map((f: any) => ({ id: f.id, module: String(f.module ?? ''), texte: f.texte.slice(0, 300), cible: f.cible ? String(f.cible) : null }))
    .slice(0, 20);
}

// Contenu du message (variable) : la date et les faits. La consigne, elle,
// reste stable (mise en cache).
export function contenuResume(faits: Fait[], jour: string): string {
  return [`Aujourd'hui : ${jourEnClair(jour)} (${jour}).`, '', 'Faits :', ...faits.map((f) => `[${f.id}] (${f.module}) ${f.texte}`)].join('\n');
}

// Remplace les identifiants de faits par leur cible (écran à ouvrir) ;
// ignore un identifiant inconnu, recolle les morceaux de texte simple,
// garde 3 phrases au plus.
export function phrasesAvecCibles(sortie: SortieResume, faits: Fait[]): Phrase[] {
  const parId = new Map(faits.map((f) => [f.id, f]));
  const phrases: Phrase[] = [];
  for (const p of sortie.phrases ?? []) {
    const morceaux: Morceau[] = [];
    for (const m of p.morceaux ?? []) {
      const texte = String(m.texte ?? '');
      if (!texte) continue;
      const fait = m.fait ? parId.get(m.fait.trim()) : undefined;
      const cible = fait?.cible ?? null;
      const precedent = morceaux[morceaux.length - 1];
      if (!cible && precedent && !precedent.cible) precedent.texte += texte;
      else morceaux.push({ texte, cible, module: cible ? fait!.module : null });
    }
    if (morceaux.length) {
      morceaux[0].texte = morceaux[0].texte.replace(/^\s+/, '');
      morceaux[morceaux.length - 1].texte = morceaux[morceaux.length - 1].texte.replace(/\s+$/, '');
    }
    if (morceaux.some((m) => m.texte.trim())) phrases.push({ morceaux });
    if (phrases.length >= 3) break;
  }
  return phrases;
}

// --- Habituels ---------------------------------------------------------------

export type ProduitHistorique = { cle: string; libelle: string; achats: string[] };

export const SchemaHabituels = z.object({
  produits: z.array(
    z.object({
      cle: z.string(),
      prochain_achat: z.string().nullable(),
      ignorer: z.boolean(),
      phrase: z.string().nullable(),
    })
  ),
});
export type SortieHabituels = z.infer<typeof SchemaHabituels>;

export const CONSIGNE_HABITUELS_NUIT = CONSIGNE_HABITUELS;

export function historiqueValide(entree: unknown): ProduitHistorique[] {
  if (!Array.isArray(entree)) return [];
  return entree
    .filter((p: any) => p && typeof p.cle === 'string' && Array.isArray(p.achats))
    .map((p: any) => ({ cle: p.cle, libelle: String(p.libelle ?? p.cle), achats: p.achats.map(String).slice(-30) }))
    .slice(0, 40);
}

export function contenuHabituels(produits: ProduitHistorique[], jour: string): string {
  return [
    `Aujourd'hui : ${jourEnClair(jour)} (${jour}).`,
    '',
    'Produits (clé | libellé : jours d’achat) :',
    ...produits.map((p) => `- ${p.cle} | ${p.libelle} : ${p.achats.join(', ')}`),
  ].join('\n');
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

// Lignes de courses.previsions_ia : seulement les clés reçues, dates
// valides et pas plus d'un an devant, phrases courtes.
export function lignesPrevisions(sortie: SortieHabituels, produits: ProduitHistorique[], foyerId: string, jour: string) {
  const cles = new Set(produits.map((p) => p.cle));
  const vues = new Set<string>();
  const limite = `${Number(jour.slice(0, 4)) + 1}${jour.slice(4)}`;
  return (sortie.produits ?? [])
    .filter((p) => cles.has(p.cle) && !vues.has(p.cle) && vues.add(p.cle))
    .map((p) => ({
      foyer_id: foyerId,
      cle: p.cle,
      prochain_achat: p.prochain_achat && DATE.test(p.prochain_achat) && p.prochain_achat <= limite ? p.prochain_achat : null,
      ignorer: !!p.ignorer,
      phrase: p.phrase ? p.phrase.trim().slice(0, 60) || null : null,
      maj_le: new Date().toISOString(),
    }));
}
