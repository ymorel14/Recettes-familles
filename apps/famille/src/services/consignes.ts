import { clientPourSchema } from './supabase';
import { rechercherPartout, type ResultatRecherche } from './recherche';
import type { Familles } from './familles';
import type { ActionProposee } from './actionsAssistant';
import type { IdModule } from '../theme/jetons';

// Consignes qui OUVRENT un écran (retour de test P-3) : « lance ma recette
// de bourguignon », « ouvre la liste Carrefour », « où est la perceuse ? ».
// Exécutées tout de suite (rien n'est créé) ; si plusieurs recettes
// correspondent, la personne choisit.

export type IssueConsigne =
  | { type: 'ouvrir'; resultat: ResultatRecherche }
  | { type: 'choisir'; recettes: { id: string; titre: string }[] }
  | { type: 'rechercher'; texte: string }
  | { type: 'question'; texte: string };

const MODULES: IdModule[] = ['recettes', 'courses', 'quotidien', 'cadeaux', 'voyages', 'souvenirs'];

function normaliser(t: string): string {
  return t
    .replace(/[œŒ]/g, 'oe')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

const MOTS_VIDES = new Set(['de', 'du', 'des', 'la', 'le', 'les', 'ma', 'mon', 'mes', 'recette', 'au', 'aux', 'a', 'l', 'd', 'en']);

function mots(t: string): string[] {
  return normaliser(t)
    .split(/[^a-z0-9]+/)
    .filter((m) => m.length > 1 && !MOTS_VIDES.has(m));
}

// Recettes dont le titre contient tous les mots dits (sinon au moins un).
async function trouverRecettes(nom: string, foyers: string[]): Promise<{ id: string; titre: string }[]> {
  const { data } = await clientPourSchema('recettes').from('recettes').select('id, titre').in('foyer_id', foyers).limit(1000);
  const recettes = (data ?? []) as { id: string; titre: string }[];
  const cherches = mots(nom);
  if (!cherches.length) return [];
  const tous = recettes.filter((r) => cherches.every((m) => normaliser(r.titre).includes(m)));
  if (tous.length) return tous.slice(0, 8);
  return recettes.filter((r) => cherches.some((m) => normaliser(r.titre).includes(m))).slice(0, 8);
}

// Onglets connus par leur nom dit à voix haute.
const ONGLETS: { module: IdModule; motif: RegExp; onglet: string }[] = [
  { module: 'quotidien', motif: /tirelire|argent de poche/, onglet: 'ArgentPoche' },
  { module: 'quotidien', motif: /tache/, onglet: 'Taches' },
  { module: 'quotidien', motif: /trajet|covoiturage/, onglet: 'Activites' },
  { module: 'quotidien', motif: /inventaire/, onglet: 'Inventaires' },
  { module: 'cadeaux', motif: /mes envies|ma liste/, onglet: 'MesEnvies' },
  { module: 'cadeaux', motif: /a offrir|reservation/, onglet: 'AOffrir' },
  { module: 'recettes', motif: /congelateur|garde.manger|frigo|placard/, onglet: 'Congelateur' },
  { module: 'recettes', motif: /aide.memoire/, onglet: 'AideMemoire' },
  { module: 'courses', motif: /habituel/, onglet: 'Habituels' },
];

export async function executerConsigne(
  action: ActionProposee,
  ctx: { foyerId: string; foyersFamille: string[]; familles: Familles }
): Promise<IssueConsigne> {
  const cible = (action.cible ?? '').trim();
  const module = MODULES.includes(action.module as IdModule) ? (action.module as IdModule) : null;
  const foyers = Array.from(new Set([ctx.foyerId, ...ctx.foyersFamille]));

  if (action.type === 'cuisiner') {
    const recettes = await trouverRecettes(cible, foyers);
    if (recettes.length === 1) {
      const r = recettes[0];
      return { type: 'ouvrir', resultat: { cle: r.id, module: 'recettes', titre: r.titre, detail: null, ecran: 'AssistantRecette', params: { recetteId: r.id } } };
    }
    if (recettes.length > 1) return { type: 'choisir', recettes };
    return { type: 'question', texte: `Je n’ai pas trouvé de recette « ${cible} ». Essayez avec un autre mot du titre.` };
  }

  if (action.type === 'rechercher') return { type: 'rechercher', texte: cible };

  // Ouvrir : un onglet connu, sinon l'élément trouvé par la recherche, sinon le module.
  const dit = normaliser(cible);
  const onglet = ONGLETS.find((o) => (!module || o.module === module) && o.motif.test(dit));
  if (onglet) return { type: 'ouvrir', resultat: { cle: onglet.onglet, module: onglet.module, titre: cible, detail: null, onglet: onglet.onglet } };
  if (cible) {
    const groupes = await rechercherPartout(cible, ctx).catch(() => []);
    const groupe = (module && groupes.find((g) => g.module === module)) || groupes[0];
    if (groupe?.resultats[0]) return { type: 'ouvrir', resultat: groupe.resultats[0] };
  }
  if (module) return { type: 'ouvrir', resultat: { cle: module, module, titre: module, detail: null } };
  return { type: 'rechercher', texte: cible };
}
