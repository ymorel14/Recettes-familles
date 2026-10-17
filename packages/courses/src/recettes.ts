import { cleProduit, majusculeInitiale, motsNormalises, normaliserTexte } from './texte';
import { RAYON_AUTRES, devinerRayonDictionnaire } from './rayons';

// Ingrédients des recettes envoyés dans une liste de l'app Courses (schéma
// "courses") : code commun à Recettes (qui envoie) et à Courses (qui
// affiche le détail par recette et permet de retirer une recette).
//
// Mêmes règles que l'ancienne liste de courses de Recettes : quantités
// déjà ramenées au nombre de parts, produits identiques fusionnés (accents,
// casse et pluriel simple ignorés, indication après une virgule ignorée :
// « origan, émincé » = « origan »), détail de chaque ajout gardé
// (courses.contributions) pour pouvoir retirer une seule recette.

// Client Supabase limité au schéma "courses" : supabase.schema('courses').
export type ClientCourses = {
  from: (table: string) => any;
  rpc: (fonction: string, args?: Record<string, unknown>) => any;
};

export type IngredientEnvoye = { libelle: string; quantite: number | null; unite: string | null };

export type RecetteEnvoyee = {
  recetteId: string | null;
  // Titre affiché dans la liste (« Recette surprise » pour une recette
  // cachée au foyer).
  recetteTitre: string;
  parts: number;
  ingredients: IngredientEnvoye[];
};

export type Contribution = {
  id: string;
  liste_id: string;
  recette_id: string | null;
  recette_titre: string;
  ajout_id: string;
  libelle: string;
  quantite: number | null;
  unite: string | null;
  parts_utilisees: number;
  ajoute_le: string;
};

type ArticleExistant = {
  id: string;
  libelle: string;
  quantite: number | null;
  unite: string | null;
  etat: string;
};

// Nom du produit seul, sans l'indication de préparation propre à la recette
// (« poivrons, coupés en dés » → « Poivrons »).
export function nomProduit(libelle: string): string {
  return majusculeInitiale(libelle.split(',')[0].trim() || libelle.trim());
}

function memeUnite(a: string | null, b: string | null): boolean {
  return normaliserTexte((a ?? '').trim()) === normaliserTexte((b ?? '').trim());
}

// Clé d'un article ou d'une contribution : produit + unité.
export function cleArticle(libelle: string, unite: string | null): string {
  return `${cleProduit(libelle)}::${normaliserTexte((unite ?? '').trim())}`;
}

function nouvelAjoutId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function arrondir(q: number | null): number | null {
  return q == null ? null : Math.round(q * 1000) / 1000;
}

// Envoie une ou plusieurs recettes dans la liste. Renvoie le nombre de
// nouveaux articles et d'articles déjà présents complétés.
export async function envoyerRecettes(
  client: ClientCourses,
  listeId: string,
  recettes: RecetteEnvoyee[],
  utilisateurId: string | null
): Promise<{ nouveaux: number; completes: number }> {
  const { data: liste, error: erreurListe } = await client.from('listes').select('id, foyer_id').eq('id', listeId).single();
  if (erreurListe) throw erreurListe;

  // Rayons déjà choisis par le foyer pour ces produits (vide si on n'y a
  // pas accès) : sinon dictionnaire, sinon « Autres ».
  const { data: produits } = await client.from('produits').select('cle, rayon_id').eq('foyer_id', liste.foyer_id);
  const rayonConnu = new Map<string, string>(
    ((produits ?? []) as { cle: string; rayon_id: string | null }[]).filter((p) => p.rayon_id).map((p) => [p.cle, p.rayon_id!])
  );

  const { data: lignes, error: erreurArticles } = await client
    .from('articles')
    .select('id, libelle, quantite, unite, etat')
    .eq('liste_id', listeId)
    .neq('etat', 'caddie');
  if (erreurArticles) throw erreurArticles;
  const existants = (lignes ?? []) as ArticleExistant[];

  type Agrege = { libelle: string; unite: string | null; quantite: number | null; existant?: ArticleExistant; modifie: boolean };
  const parCle = new Map<string, Agrege>();
  existants.forEach((a) => parCle.set(cleArticle(a.libelle, a.unite), { libelle: a.libelle, unite: a.unite, quantite: a.quantite, existant: a, modifie: false }));

  const contributions: Omit<Contribution, 'id' | 'ajoute_le'>[] = [];
  for (const recette of recettes) {
    const ajoutId = nouvelAjoutId();
    for (const ing of recette.ingredients) {
      const libelle = nomProduit(ing.libelle);
      if (!libelle) continue;
      const unite = ing.unite?.trim() || null;
      const quantite = arrondir(ing.quantite);
      const cle = cleArticle(libelle, unite);
      const agrege = parCle.get(cle);
      if (agrege) {
        if (agrege.quantite != null && quantite != null) {
          agrege.quantite = arrondir(agrege.quantite + quantite);
          agrege.modifie = true;
        } else if (agrege.quantite == null && quantite != null && !agrege.existant) {
          agrege.quantite = quantite;
        }
        if (agrege.existant?.etat === 'introuvable') agrege.modifie = true;
      } else {
        parCle.set(cle, { libelle, unite, quantite, modifie: false });
      }
      contributions.push({
        liste_id: listeId,
        recette_id: recette.recetteId,
        recette_titre: recette.recetteTitre,
        ajout_id: ajoutId,
        libelle,
        quantite,
        unite,
        parts_utilisees: recette.parts,
      });
    }
  }

  const nouveaux: Record<string, unknown>[] = [];
  for (const a of parCle.values()) {
    if (a.existant) {
      if (!a.modifie) continue;
      const { error } = await client.from('articles').update({ quantite: a.quantite, etat: 'a_acheter' }).eq('id', a.existant.id);
      if (error) throw error;
    } else {
      nouveaux.push({
        liste_id: listeId,
        libelle: a.libelle,
        quantite: a.quantite,
        unite: a.unite,
        rayon_id: rayonConnu.get(cleProduit(a.libelle)) ?? devinerRayonDictionnaire(a.libelle) ?? RAYON_AUTRES,
        ajoute_par: utilisateurId,
      });
    }
  }
  // Articles déjà sur la liste que ces recettes citent aussi.
  const citees = new Set(contributions.map((c) => cleArticle(c.libelle, c.unite)));
  const completes = existants.filter((a) => citees.has(cleArticle(a.libelle, a.unite))).length;

  if (nouveaux.length > 0) {
    const { error } = await client.from('articles').insert(nouveaux);
    if (error) throw error;
  }
  if (contributions.length > 0) {
    const { error } = await client.from('contributions').insert(contributions.map((c) => ({ ...c, ajoute_par: utilisateurId })));
    if (error) throw error;
  }
  return { nouveaux: nouveaux.length, completes };
}

export async function listerContributions(client: ClientCourses, listeId: string): Promise<Contribution[]> {
  const { data, error } = await client.from('contributions').select('*').eq('liste_id', listeId).order('ajoute_le');
  if (error) throw error;
  return (data ?? []) as Contribution[];
}

export type AjoutRecette = { ajoutId: string; recetteId: string | null; titre: string; parts: number; ajouteLe: string };

// Chaque ajout de recette présent dans la liste (une même recette ajoutée
// deux fois apparaît deux fois, et se retire séparément).
export function ajoutsDeRecettes(contributions: Contribution[]): AjoutRecette[] {
  const parAjout = new Map<string, AjoutRecette>();
  contributions.forEach((c) => {
    if (!parAjout.has(c.ajout_id)) {
      parAjout.set(c.ajout_id, { ajoutId: c.ajout_id, recetteId: c.recette_id, titre: c.recette_titre, parts: Number(c.parts_utilisees), ajouteLe: c.ajoute_le });
    }
  });
  return [...parAjout.values()];
}

// Retire ce qu'un ajout de recette avait apporté : sa quantité est
// soustraite des articles concernés, et un article qui n'est plus cité par
// aucune recette et n'a plus de quantité disparaît. Les articles déjà dans
// le caddie ne sont pas touchés.
export async function retirerAjout(client: ClientCourses, listeId: string, ajoutId: string): Promise<void> {
  const toutes = await listerContributions(client, listeId);
  const retirees = toutes.filter((c) => c.ajout_id === ajoutId);
  if (retirees.length === 0) return;
  const restantes = toutes.filter((c) => c.ajout_id !== ajoutId);

  const { data: lignes, error } = await client
    .from('articles')
    .select('id, libelle, quantite, unite, etat')
    .eq('liste_id', listeId)
    .neq('etat', 'caddie');
  if (error) throw error;
  const articles = (lignes ?? []) as ArticleExistant[];

  for (const c of retirees) {
    const cle = cleArticle(c.libelle, c.unite);
    const article = articles.find((a) => cleArticle(a.libelle, a.unite) === cle);
    if (!article) continue;
    const encoreCite = restantes.some((r) => cleArticle(r.libelle, r.unite) === cle);
    let quantite = article.quantite;
    if (quantite != null && c.quantite != null) quantite = arrondir(quantite - Number(c.quantite));
    if (!encoreCite && (quantite == null || quantite <= 0)) {
      await client.from('articles').delete().eq('id', article.id);
      articles.splice(articles.indexOf(article), 1);
    } else if (quantite !== article.quantite) {
      await client.from('articles').update({ quantite: quantite != null && quantite > 0 ? quantite : null }).eq('id', article.id);
      article.quantite = quantite;
    }
  }
  const { error: erreurSuppression } = await client.from('contributions').delete().eq('liste_id', listeId).eq('ajout_id', ajoutId);
  if (erreurSuppression) throw erreurSuppression;
}

// --- Rapprochements proposés (« Oeufs » et « Oeufs entiers ») -------------

const MOTS_VIDES = new Set(['de', 'du', 'des', 'la', 'le', 'les', 'un', 'une', 'et', 'a', 'au', 'aux', 'en', 'd', 'l']);

export type SuggestionFusion<A> = { motCle: string; articles: A[] };

// Articles qui partagent un mot significatif sans être déjà le même
// produit : on PROPOSE de les fusionner, l'utilisateur tranche (jamais de
// fusion automatique : « lait » et « lait de coco » restent distincts).
export function detecterSuggestionsFusion<A extends { id: string; libelle: string; unite: string | null }>(
  articles: A[]
): SuggestionFusion<A>[] {
  const parMot = new Map<string, A[]>();
  articles.forEach((a) => {
    new Set(motsNormalises(a.libelle.split(',')[0]).filter((m) => m.length >= 3 && !MOTS_VIDES.has(m))).forEach((mot) => {
      parMot.set(mot, [...(parMot.get(mot) ?? []), a]);
    });
  });
  const vues = new Set<string>();
  const resultat: SuggestionFusion<A>[] = [];
  parMot.forEach((liste, mot) => {
    if (liste.length < 2) return;
    const cles = new Set(liste.map((a) => cleArticle(a.libelle, a.unite)));
    if (cles.size < 2) return;
    const signature = liste.map((a) => a.id).sort().join(',');
    if (vues.has(signature)) return;
    vues.add(signature);
    resultat.push({ motCle: mot, articles: liste });
  });
  return resultat.sort((a, b) => a.motCle.localeCompare(b.motCle));
}

// Fusionne des articles choisis en un seul (le premier) : quantités
// additionnées quand toutes en ont une et la même unité, contributions
// réécrites sous le libellé retenu, autres articles supprimés.
export async function fusionnerArticles<A extends ArticleExistant>(client: ClientCourses, listeId: string, articles: A[]): Promise<void> {
  if (articles.length < 2) return;
  const [garde, ...autres] = articles;
  const memesUnites = articles.every((a) => memeUnite(a.unite, garde.unite));
  const quantite =
    memesUnites && articles.every((a) => a.quantite != null)
      ? arrondir(articles.reduce((s, a) => s + Number(a.quantite), 0))
      : garde.quantite;
  const { error } = await client.from('articles').update({ quantite }).eq('id', garde.id);
  if (error) throw error;
  const cles = new Set(autres.map((a) => cleArticle(a.libelle, a.unite)));
  const contributions = await listerContributions(client, listeId);
  for (const c of contributions.filter((c) => cles.has(cleArticle(c.libelle, c.unite)))) {
    await client.from('contributions').update({ libelle: garde.libelle, unite: garde.unite }).eq('id', c.id);
  }
  const { error: erreurSuppression } = await client
    .from('articles')
    .delete()
    .in(
      'id',
      autres.map((a) => a.id)
    );
  if (erreurSuppression) throw erreurSuppression;
}
