import { supabase } from './supabase';
import type { AlimentCongele, Congelateur } from '../types/models';

// Service "Congélateur" (voir supabase/congelateur.sql) : inventaire simple
// du contenu d'un ou plusieurs congélateurs du foyer — un aliment, son type
// et sa date de mise au congélateur, sans quantités (choix utilisateur :
// "que cela reste simple"). Le type fixe une durée de conservation
// conseillée : au-delà, l'aliment est signalé comme plus consommable
// (retour utilisateur : on y trouve parfois des viandes stockées depuis des
// années).

// ---------------------------------------------------------------------------
// Types d'aliments et durées conseillées (en mois, à -18 °C). Valeurs
// usuelles des guides de conservation, arrondies prudemment : à ajuster ici
// si besoin (la base ne stocke que la clé).
// ---------------------------------------------------------------------------

export type TypeAliment = { cle: string; libelle: string; mois: number };

export const TYPES_ALIMENTS: TypeAliment[] = [
  { cle: 'viande', libelle: 'Viande (bœuf, veau, agneau, gibier)', mois: 12 },
  { cle: 'porc', libelle: 'Porc', mois: 6 },
  { cle: 'hache', libelle: 'Viande hachée, saucisses', mois: 4 },
  { cle: 'volaille', libelle: 'Volaille', mois: 9 },
  { cle: 'poissonMaigre', libelle: 'Poisson maigre (cabillaud, colin…)', mois: 6 },
  { cle: 'poissonGras', libelle: 'Poisson gras, fruits de mer', mois: 3 },
  { cle: 'plat', libelle: 'Plat cuisiné, soupe, sauce', mois: 3 },
  { cle: 'legumes', libelle: 'Légumes, fruits', mois: 12 },
  { cle: 'pain', libelle: 'Pain, pâtisserie, pâte', mois: 3 },
  { cle: 'autre', libelle: 'Autre', mois: 6 },
];

export function typeAliment(cle: string): TypeAliment {
  return TYPES_ALIMENTS.find((t) => t.cle === cle) ?? TYPES_ALIMENTS[TYPES_ALIMENTS.length - 1];
}

// Type deviné d'après le nom saisi ("steak haché" → viande hachée, "filet de
// poulet" → volaille...), pour ne pas avoir à le choisir à chaque fois. Ordre
// important : le premier type dont un mot est trouvé l'emporte ("soupe de
// poisson" → plat cuisiné, "rôti de porc" → porc et non viande).
const MOTS_PAR_TYPE: [string, string[]][] = [
  ['plat', ['plat', 'soupe', 'sauce', 'lasagne', 'gratin', 'bolognaise', 'hachis', 'puree', 'blanquette',
    'pot au feu', 'pot-au-feu', 'tajine', 'curry', 'chili', 'couscous', 'quiche', 'pizza', 'bouillon', 'veloute',
    'ratatouille', 'reste', 'restes', 'fond de volaille']],
  ['hache', ['hache', 'hachee', 'saucisse', 'merguez', 'chipolata', 'chair a saucisse', 'boulette', 'burger']],
  ['volaille', ['poulet', 'dinde', 'canard', 'pintade', 'caille', 'volaille', 'chapon', 'magret', 'oie']],
  ['porc', ['porc', 'jambon', 'lard', 'lardon', 'echine', 'filet mignon', 'rouelle', 'poitrine', 'travers', 'andouillette']],
  ['poissonGras', ['saumon', 'maquereau', 'sardine', 'thon', 'truite', 'hareng', 'crevette', 'moule', 'saint jacques',
    'st jacques', 'calamar', 'gambas', 'fruits de mer', 'crabe', 'homard', 'langoustine', 'anguille']],
  ['poissonMaigre', ['poisson', 'cabillaud', 'colin', 'merlu', 'lieu', 'sole', 'dorade', 'daurade', 'bar', 'merlan',
    'lotte', 'eglefin', 'limande', 'julienne', 'tilapia', 'pane']],
  ['viande', ['viande', 'boeuf', 'veau', 'agneau', 'steak', 'roti', 'gigot', 'bourguignon', 'entrecote', 'bavette',
    'gibier', 'chevreuil', 'sanglier', 'lapin', 'cote', 'escalope', 'faux filet', 'onglet', 'paleron', 'basse cote']],
  ['pain', ['pain', 'baguette', 'brioche', 'croissant', 'gateau', 'tarte', 'pate', 'viennoiserie', 'cake', 'crepe',
    'galette', 'feuilletee', 'brisee', 'sablee', 'muffin', 'cookie', 'biscuit']],
  ['legumes', ['legume', 'haricot', 'petit pois', 'petits pois', 'epinard', 'brocoli', 'chou', 'courgette', 'carotte',
    'poivron', 'fruit', 'fraise', 'framboise', 'myrtille', 'cerise', 'mangue', 'compote', 'champignon', 'herbe',
    'persil', 'basilic', 'ciboulette', 'poireau', 'aubergine', 'mais', 'frite', 'pomme', 'poire', 'abricot', 'prune',
    'mure', 'groseille', 'rhubarbe', 'coulis']],
];

function sansAccents(texte: string): string {
  return texte
    .replace(/[œŒ]/g, 'oe')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[''\-]/g, ' ');
}

export function devinerType(nom: string): string | null {
  const texte = ` ${sansAccents(nom).replace(/[^a-z]+/g, ' ')} `;
  for (const [cle, mots] of MOTS_PAR_TYPE) {
    if (mots.some((mot) => new RegExp(` ${sansAccents(mot)}(s|x)? `).test(texte))) return cle;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Dates (format de la base : AAAA-MM-JJ, sans heure ni fuseau)
// ---------------------------------------------------------------------------

export function versDate(iso: string): Date {
  const [a, m, j] = iso.slice(0, 10).split('-').map(Number);
  return new Date(a, m - 1, j);
}

export function versIso(date: Date): string {
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const j = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${m}-${j}`;
}

export function aujourdhui(): Date {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

// Ajoute (ou retire) des mois, en restant au dernier jour du mois si besoin
// (31 janvier + 1 mois → 28/29 février).
export function ajouterMois(date: Date, mois: number): Date {
  const cible = new Date(date.getFullYear(), date.getMonth() + mois, 1);
  const dernierJour = new Date(cible.getFullYear(), cible.getMonth() + 1, 0).getDate();
  cible.setDate(Math.min(date.getDate(), dernierJour));
  return cible;
}

export function formaterDate(iso: string): string {
  const d = versDate(iso);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

// Saisie libre d'une date : "12/03/2024", "12/3/24", "03/2024" (on ne se
// souvient souvent que du mois → 1er du mois) ou "2023" (→ 1er janvier).
// Renvoie AAAA-MM-JJ, ou null si la saisie n'est pas une date valide.
export function lireDateSaisie(saisie: string): string | null {
  const morceaux = saisie.trim().split(/[\/.\-\s]+/).filter(Boolean).map(Number);
  if (morceaux.length === 0 || morceaux.some((n) => !Number.isInteger(n))) return null;
  let [jour, mois, annee] = [1, 1, 0];
  if (morceaux.length === 3) [jour, mois, annee] = morceaux;
  else if (morceaux.length === 2) [mois, annee] = morceaux;
  else [annee] = morceaux;
  if (annee < 100) annee += 2000;
  const date = new Date(annee, mois - 1, jour);
  const valide =
    annee >= 1990 && date.getFullYear() === annee && date.getMonth() === mois - 1 && date.getDate() === jour;
  return valide ? versIso(date) : null;
}

// "il y a 3 jours", "il y a 5 mois", "il y a 2 ans et 3 mois".
export function ancienneteTexte(iso: string): string {
  const debut = versDate(iso);
  const fin = aujourdhui();
  let mois = (fin.getFullYear() - debut.getFullYear()) * 12 + (fin.getMonth() - debut.getMonth());
  if (fin.getDate() < debut.getDate()) mois -= 1;
  if (mois <= 0) {
    const jours = Math.round((fin.getTime() - debut.getTime()) / 86400000);
    if (jours <= 0) return "aujourd'hui";
    return jours === 1 ? 'hier' : `il y a ${jours} jours`;
  }
  const ans = Math.floor(mois / 12);
  const reste = mois % 12;
  if (ans === 0) return `il y a ${mois} mois`;
  const texteAns = `${ans} an${ans > 1 ? 's' : ''}`;
  return reste === 0 ? `il y a ${texteAns}` : `il y a ${texteAns} et ${reste} mois`;
}

// ---------------------------------------------------------------------------
// État de conservation
// ---------------------------------------------------------------------------

// ok : dans les temps ; bientot : dernier mois avant la limite conseillée ;
// depasse : limite dépassée → plus consommable.
export type EtatConservation = 'ok' | 'bientot' | 'depasse';

export function dateLimite(aliment: Pick<AlimentCongele, 'type' | 'date_stockage'>): Date {
  return ajouterMois(versDate(aliment.date_stockage), typeAliment(aliment.type).mois);
}

export function etatConservation(aliment: Pick<AlimentCongele, 'type' | 'date_stockage'>): EtatConservation {
  const limite = dateLimite(aliment);
  const jour = aujourdhui();
  if (jour > limite) return 'depasse';
  if (jour >= ajouterMois(limite, -1)) return 'bientot';
  return 'ok';
}

const ORDRE_ETAT: Record<EtatConservation, number> = { depasse: 0, bientot: 1, ok: 2 };

// Les plus urgents d'abord (dépassés, puis bientôt), puis par date limite.
export function trierParUrgence(aliments: AlimentCongele[]): AlimentCongele[] {
  return [...aliments].sort(
    (a, b) =>
      ORDRE_ETAT[etatConservation(a)] - ORDRE_ETAT[etatConservation(b)] ||
      dateLimite(a).getTime() - dateLimite(b).getTime() ||
      a.nom.localeCompare(b.nom, 'fr')
  );
}

// ---------------------------------------------------------------------------
// Recherche ("Est-ce qu'il reste du poulet ?")
// ---------------------------------------------------------------------------

// Mots d'une question qui ne désignent pas l'aliment cherché.
const MOTS_QUESTION = new Set(
  (
    "est ce que qu quoi il ils elle y a t reste restent encore toujours on nous avons ai as j je tu vous " +
    'des du de la le les l d un une au aux en dans mon ma mes notre nos ton ta tes votre vos ce cet cette ces ' +
    'congelateur congelateurs congelo congelos frigo quelque chose peu combien avoir sont est-ce ' +
    'cherche chercher trouve trouver voir montre montrer dis moi liste lister please stp svp oui non'
  ).split(' ')
);

// Réduit une question parlée ou tapée à ce qu'on cherche :
// "Est-ce qu'il reste du poulet dans le congélateur ?" → "poulet".
// On coupe au "dans" (lieu), puis on retire les mots de la question au début
// et à la fin : ceux du milieu restent ("pommes de terre"). Les mots gardés
// conservent leurs accents ("steaks hachés"), pour la réponse affichée et lue.
export function extraireRecherche(question: string): string {
  const mots = question
    .toLowerCase()
    .split(/[^\p{L}]+/u)
    .filter(Boolean);
  const coupure = mots.findIndex((m, i) => i > 0 && m === 'dans');
  const utiles = coupure > 0 ? mots.slice(0, coupure) : mots;
  const estMotQuestion = (m: string) => MOTS_QUESTION.has(sansAccents(m));
  let debut = 0;
  let fin = utiles.length;
  while (debut < fin && estMotQuestion(utiles[debut])) debut += 1;
  while (fin > debut && estMotQuestion(utiles[fin - 1])) fin -= 1;
  return utiles.slice(debut, fin).join(' ');
}

// Mots désignant une famille d'aliments : "poisson" trouve aussi le saumon
// et le cabillaud, "viande" le rôti, les merguez et le poulet...
const FAMILLES: Record<string, string[]> = {
  poisson: ['poissonMaigre', 'poissonGras'],
  poissons: ['poissonMaigre', 'poissonGras'],
  viande: ['viande', 'porc', 'hache', 'volaille'],
  viandes: ['viande', 'porc', 'hache', 'volaille'],
  volaille: ['volaille'],
  volailles: ['volaille'],
  porc: ['porc'],
  plat: ['plat'],
  plats: ['plat'],
  'plat cuisine': ['plat'],
  'plats cuisines': ['plat'],
  soupe: ['plat'],
  soupes: ['plat'],
  legume: ['legumes'],
  legumes: ['legumes'],
  fruit: ['legumes'],
  fruits: ['legumes'],
  pain: ['pain'],
  patisserie: ['pain'],
  patisseries: ['pain'],
  gateau: ['pain'],
  gateaux: ['pain'],
};

// Singulier approximatif, pour que "steaks" trouve "steak" et inversement.
function racine(mot: string): string {
  return mot.length > 3 ? mot.replace(/(s|x)$/, '') : mot;
}

// Aliments correspondant à la recherche : par le nom (tous les mots cherchés
// y figurent, au singulier ou au pluriel) ou par la famille ("poisson").
export function rechercherAliments(aliments: AlimentCongele[], recherche: string): AlimentCongele[] {
  // Petits mots ignorés pour la comparaison ("pommes de terre" → pommes, terre).
  const motsCherches = sansAccents(recherche)
    .replace(/[^a-z]+/g, ' ')
    .split(' ')
    .filter((m) => m && !MOTS_QUESTION.has(m))
    .map(racine);
  if (motsCherches.length === 0) return aliments;
  const famille = FAMILLES[sansAccents(recherche).replace(/[^a-z]+/g, ' ').trim()];
  return aliments.filter((a) => {
    if (famille?.includes(a.type)) return true;
    const motsNom = sansAccents(a.nom).replace(/[^a-z]+/g, ' ').split(' ').filter(Boolean).map(racine);
    return motsCherches.every((m) => motsNom.some((n) => n.startsWith(m)));
  });
}

// Réponse à lire à voix haute (et à afficher) après une question.
export function phraseReponse(
  recherche: string,
  trouves: AlimentCongele[],
  nomsCongelateurs: Map<string, string>
): string {
  if (!recherche.trim()) return "Je n'ai pas compris quel aliment vous cherchez.";
  if (trouves.length === 0) return `Non, il n'y a pas de ${recherche} dans vos congélateurs.`;
  const plusieursCongelateurs = nomsCongelateurs.size > 1;
  const details = trierParUrgence(trouves)
    .slice(0, 5)
    .map((a) => {
      const ou = plusieursCongelateurs ? `, dans ${nomsCongelateurs.get(a.congelateur_id) ?? 'le congélateur'}` : '';
      const etat = etatConservation(a);
      const alerteEtat =
        etat === 'depasse' ? ', attention, plus consommable' : etat === 'bientot' ? ', à consommer bientôt' : '';
      return `${a.nom}${ou}, congelé ${ancienneteTexte(a.date_stockage)}${alerteEtat}`;
    });
  const suite = trouves.length > 5 ? `, et ${trouves.length - 5} autres` : '';
  return `Oui, ${trouves.length === 1 ? 'un' : trouves.length} : ${details.join(' ; ')}${suite}.`;
}

// ---------------------------------------------------------------------------
// Congélateurs
// ---------------------------------------------------------------------------

export async function listerCongelateurs(foyerId: string): Promise<Congelateur[]> {
  const { data, error } = await supabase
    .from('congelateurs')
    .select('*')
    .eq('foyer_id', foyerId)
    .order('cree_le', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function creerCongelateur(foyerId: string, utilisateurId: string, nom: string): Promise<string> {
  const { data, error } = await supabase
    .from('congelateurs')
    .insert({ foyer_id: foyerId, nom: nom.trim(), cree_par: utilisateurId })
    .select()
    .single();
  if (error) throw error;
  return data.id as string;
}

export async function renommerCongelateur(id: string, nom: string): Promise<void> {
  const { error } = await supabase.from('congelateurs').update({ nom: nom.trim() }).eq('id', id);
  if (error) throw error;
}

// Supprime aussi tout son contenu (on delete cascade).
export async function supprimerCongelateur(id: string): Promise<void> {
  const { error } = await supabase.from('congelateurs').delete().eq('id', id);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Aliments
// ---------------------------------------------------------------------------

export async function listerAliments(foyerId: string): Promise<AlimentCongele[]> {
  const { data, error } = await supabase.from('congelateur_aliments').select('*').eq('foyer_id', foyerId);
  if (error) throw error;
  return data ?? [];
}

export async function obtenirAliment(id: string): Promise<AlimentCongele> {
  const { data, error } = await supabase.from('congelateur_aliments').select('*').eq('id', id).single();
  if (error) throw error;
  return data;
}

export type AlimentFormulaire = { nom: string; type: string; congelateurId: string; dateStockage: string };

export async function creerAliment(foyerId: string, utilisateurId: string, form: AlimentFormulaire): Promise<void> {
  const { error } = await supabase.from('congelateur_aliments').insert({
    foyer_id: foyerId,
    congelateur_id: form.congelateurId,
    nom: form.nom.trim(),
    type: form.type,
    date_stockage: form.dateStockage,
    cree_par: utilisateurId,
  });
  if (error) throw error;
}

export async function mettreAJourAliment(id: string, form: AlimentFormulaire): Promise<void> {
  const { error } = await supabase
    .from('congelateur_aliments')
    .update({
      congelateur_id: form.congelateurId,
      nom: form.nom.trim(),
      type: form.type,
      date_stockage: form.dateStockage,
    })
    .eq('id', id);
  if (error) throw error;
}

// Aliment sorti du congélateur (consommé ou jeté).
export async function retirerAliment(id: string): Promise<void> {
  const { error } = await supabase.from('congelateur_aliments').delete().eq('id', id);
  if (error) throw error;
}
