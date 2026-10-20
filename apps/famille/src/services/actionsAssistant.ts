import { clientPourSchema } from './supabase';
import {
  ajouterArticle,
  listerArticles,
  listerListes,
  listerProduits,
  supprimerArticle,
  type ListeResume,
} from '../modules/courses/services/courses';
import { lireSaisie } from '../modules/courses/services/saisie';
import { aujourdHuiIso } from '../modules/quotidien/services/quotidien';
import type { Planif, Recurrence } from '../modules/quotidien/services/maison';
import { creerSouhait, listeDe, obtenirMaPersonne, type FormulaireSouhait } from '../modules/cadeaux/services/wishlist';
import { creerSouvenir, supprimerSouvenir } from '../modules/souvenirs/services/souvenirs';

// Ce que renvoie l'assistant (mêmes formes que
// supabase/functions/_partage/schemas.ts) et la création des éléments une
// fois que la personne a validé. Rien n'est créé sans « Tout ajouter » ou
// « Enregistrer » (spécification V1, § 1, règle 2).

export type ArticlePropose = { libelle: string; quantite: number | null; unite: string | null; suggestion: boolean };

export type QuandTache = 'libre' | 'quotidienne' | 'hebdomadaire' | 'le' | 'entre' | 'avant';
export type TacheProposee = {
  libelle: string;
  quand: QuandTache;
  date_debut: string | null;
  date_fin: string | null;
  annuelle: boolean;
  jours: number[];
  pour: string[];
  points: number | null;
  a_verifier: string[];
};

export type EnvieProposee = { titre: string; details: string | null; lien: string | null; prix: number | null };
export type SouvenirPropose = { titre: string; date: string | null; recit: string | null; personnes: string[] };

export type TypeAction = 'courses' | 'tache' | 'envie' | 'souvenir' | 'recette';
export type ActionProposee = {
  type: TypeAction;
  resume: string;
  incertain: boolean;
  articles: ArticlePropose[];
  liste: string | null;
  tache: TacheProposee | null;
  envie: EnvieProposee | null;
  souvenir: SouvenirPropose | null;
  lien: string | null;
};

export type ReponsePlus = { actions: ActionProposee[]; question: string | null };

// Les mots qui montrent qu'une saisie de courses mérite l'assistant
// (spécification § 4.2.1) : plusieurs articles ou des mots de liaison.
export function phraseDeCourses(texte: string): boolean {
  const t = ` ${texte.toLowerCase()} `;
  return /,|;| et | pour | de quoi | ce qu.il faut | avec | plus /.test(t) || t.trim().split(/\s+/).length > 5;
}

// Liste choisie : celle que la phrase nomme, sinon la principale.
export function listeVisee(listes: ListeResume[], nom: string | null): ListeResume | null {
  const propre = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  if (nom) {
    const trouvee = listes.find((l) => propre(l.nom) === propre(nom)) ?? listes.find((l) => propre(l.nom).includes(propre(nom)));
    if (trouvee) return trouvee;
  }
  return listes.find((l) => l.principale) ?? listes[0] ?? null;
}

// Ajoute des articles à une liste (rayon choisi par le dictionnaire du
// foyer, quantités additionnées si le produit y est déjà). Renvoie les
// articles créés, pour « Annuler ».
export async function ajouterArticles(listeId: string, foyerId: string, articles: ArticlePropose[]): Promise<string[]> {
  const [produits, actuels] = await Promise.all([listerProduits(foyerId), listerArticles(listeId)]);
  const crees: string[] = [];
  for (const a of articles) {
    const libelle = a.libelle.trim();
    if (!libelle) continue;
    const saisie = a.quantite == null && a.unite == null ? lireSaisie(libelle) : { libelle, quantite: a.quantite, unite: a.unite };
    const { article, fusionne } = await ajouterArticle(listeId, saisie, produits, actuels);
    if (!fusionne) crees.push(article.id);
    actuels.push(article);
  }
  return crees;
}

export async function retirerArticles(ids: string[]): Promise<void> {
  await Promise.all(ids.map((id) => supprimerArticle(id).catch(() => {})));
}

// « 2026-10-22 » → « 22/10/2026 » (saisie du formulaire de tâche)
export function versSaisieDate(iso: string | null): string {
  if (!iso) return '';
  const [a, m, j] = iso.split('-');
  return `${j}/${m}/${a}`;
}

function decaler(iso: string, jours: number): string {
  const [a, m, j] = iso.split('-').map(Number);
  const d = new Date(a, m - 1, j + jours);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

type PersonneFoyer = { id: string; prenom: string };

// Tâche proposée → champs de quotidien.taches (mêmes règles que
// TacheFormScreen). Renvoie un message si la tâche ne peut pas être créée
// telle quelle (il faut alors passer par le formulaire).
export function tacheVersLigne(
  t: TacheProposee,
  personnes: PersonneFoyer[]
): { libelle: string; points: number; recurrence: Recurrence; planif: Planif; periode_debut: string | null; periode_fin: string | null; jours: number[]; personnes: string[] } | string {
  const recurrence: Recurrence = t.annuelle ? 'annuelle' : 'aucune';
  const pour = t.pour
    .map((p) => personnes.find((x) => x.prenom.toLowerCase() === p.toLowerCase())?.id)
    .filter((x): x is string => !!x);
  const base = { libelle: t.libelle.trim(), points: t.points ?? 0, jours: [] as number[], personnes: pour };
  if (!base.libelle) return 'La tâche n’a pas de libellé.';
  switch (t.quand) {
    case 'quotidienne':
      return { ...base, recurrence: 'quotidienne', planif: 'libre', periode_debut: null, periode_fin: null };
    case 'hebdomadaire':
      if (!t.jours.length) return 'Choisissez les jours de la tâche.';
      return { ...base, jours: t.jours, recurrence: 'hebdomadaire', planif: 'libre', periode_debut: null, periode_fin: null };
    case 'le':
      if (!t.date_debut) return 'La date de la tâche est à préciser.';
      return { ...base, recurrence, planif: 'le', periode_debut: t.date_debut, periode_fin: t.date_debut };
    case 'entre':
      if (!t.date_debut || !t.date_fin || t.date_fin < t.date_debut) return 'La période de la tâche est à préciser.';
      return { ...base, recurrence, planif: 'entre', periode_debut: t.date_debut, periode_fin: t.date_fin };
    case 'avant': {
      if (!t.date_fin) return 'La date limite de la tâche est à préciser.';
      const aujourdHui = aujourdHuiIso();
      let debut = t.date_debut ?? (t.annuelle ? decaler(t.date_fin, -30) : aujourdHui < t.date_fin ? aujourdHui : t.date_fin);
      if (debut > t.date_fin) debut = t.date_fin;
      return { ...base, recurrence, planif: 'avant', periode_debut: debut, periode_fin: t.date_fin };
    }
    default:
      return { ...base, recurrence: 'aucune', planif: 'libre', periode_debut: null, periode_fin: null };
  }
}

const quotidien = () => clientPourSchema('quotidien');

export async function creerTacheProposee(t: TacheProposee, foyerId: string, personnes: PersonneFoyer[]): Promise<string> {
  const ligne = tacheVersLigne(t, personnes);
  if (typeof ligne === 'string') throw new Error(ligne);
  const { data, error } = await quotidien()
    .from('taches')
    .insert({ ...ligne, domaine_id: null, foyer_id: foyerId })
    .select('id')
    .single();
  if (error) throw error;
  return data.id as string;
}

export async function retirerTache(id: string): Promise<void> {
  await quotidien().from('taches').delete().eq('id', id);
}

// Envie → ma liste de souhaits (jamais secrète : c'est la mienne).
export async function creerEnvieProposee(e: EnvieProposee, utilisateurId: string): Promise<void> {
  const moi = await obtenirMaPersonne(utilisateurId);
  if (!moi) throw new Error('Fiche personne introuvable.');
  const listeId = await listeDe(moi.id);
  const formulaire: FormulaireSouhait = {
    titre: e.titre.trim(),
    description: e.details ?? '',
    lien: e.lien ?? '',
    image: null,
    photoLocale: null,
    prix: e.prix != null ? String(e.prix) : '',
    typePrix: 'estime',
    taille: '',
    priorite: 2,
    quantite: 1,
    potCommun: false,
    modeOptions: null,
    options: [],
  };
  await creerSouhait(listeId, utilisateurId, formulaire, false);
}

// Catégorie du souvenir devinée d'après son titre (mots-clés de la base,
// repris ici sous forme courte) ; « Événement » sinon.
const MOTS_CATEGORIES: [string, RegExp][] = [
  ['loisirs', /match|gagn|sport|compétition|concours|spectacle|concert|tournoi/i],
  ['anniversaire', /anniversaire|ans\b|bougie/i],
  ['scolarite', /école|rentrée|crèche|collège|lycée|bac|diplôme|examen/i],
  ['premiere_fois', /premi(er|ère) fois|premier vélo|nager|lire|écrire/i],
  ['premiers_pas', /premiers pas|marche/i],
  ['premiere_dent', /dent/i],
  ['voyage', /voyage|vacances|séjour|week-end/i],
  ['fete', /fête|noël|réveillon|pâques/i],
  ['animal', /chien|chat|chiot|chaton|adopt/i],
  ['maison', /déménag|emménag|maison|travaux/i],
];

export async function creerSouvenirPropose(s: SouvenirPropose, familleId: string, utilisateurId: string, personnes: PersonneFoyer[]): Promise<string> {
  const categorie = MOTS_CATEGORIES.find(([, r]) => r.test(`${s.titre} ${s.recit ?? ''}`))?.[0] ?? 'evenement';
  const concernees = s.personnes
    .map((p) => personnes.find((x) => x.prenom.toLowerCase() === p.toLowerCase())?.id)
    .filter((x): x is string => !!x);
  const autres = s.personnes.filter((p) => !personnes.some((x) => x.prenom.toLowerCase() === p.toLowerCase()));
  return creerSouvenir(familleId, utilisateurId, {
    titre: s.titre.trim(),
    categorie,
    precision_date: 'jour',
    date_debut: s.date ?? aujourdHuiIso(),
    date_fin: null,
    lieu: '',
    pays: '',
    recit: s.recit ?? '',
    etiquettes: [],
    autres_personnes: autres,
    visibilite: 'famille',
    personnes: concernees.map((personne_id) => ({ personne_id, role: 'principal' as const })),
  });
}

export async function retirerSouvenir(id: string): Promise<void> {
  await supprimerSouvenir(id).catch(() => {});
}

export { listerListes };
