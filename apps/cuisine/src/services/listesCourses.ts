import { supabase } from './supabase';
import { normaliserTexte } from '../utils/texte';
import { etatSurprise } from './recettes';
import type { ListeCourses, ArticleListeCourses, ContributionListeCourses, RecetteComplete } from '../types/models';

function normaliser(texte: string): string {
  return normaliserTexte(texte.trim());
}

// Retire un pluriel simple ("oeufs" → "oeuf") pour que deux recettes citant
// le même produit au singulier et au pluriel fusionnent dans la liste de
// courses (retour utilisateur — §7 : "4 Oeufs", "1 oeuf" restaient deux
// lignes séparées). Volontairement limité au "s" final d'au moins 4 lettres
// pour ne pas tronquer des mots courts qui se terminent naturellement par un
// "s" au singulier (ex. "pois", "cassis").
function ignorerPluriel(mot: string): string {
  return mot.length > 3 && mot.endsWith('s') ? mot.slice(0, -1) : mot;
}

// Clef de regroupement du nom de produit : accents/casse ignorés (via
// `normaliser`) ET pluriel simple ignoré, mot par mot — les mots qui
// suivent le premier (ex. "entiers" dans "oeufs entiers") restent pris en
// compte, donc un libellé avec un mot descriptif en plus ne fusionne pas
// avec le même produit sans ce mot (choix délibéré, pour ne pas fusionner à
// tort des produits différents comme "lait" et "lait de coco").
function normaliserProduitPourFusion(texte: string): string {
  return normaliser(texte)
    .split(/\s+/)
    .filter(Boolean)
    .map(ignorerPluriel)
    .join(' ');
}

// Isole le nom du produit d'un libellé d'ingrédient qui contiendrait, après
// une virgule, une indication de préparation propre à la recette (ex.
// "origan, émincé" → "origan" ; "poivrons, coupés en dés" → "poivrons") —
// utile pour cuisiner, mais pas pour faire les courses. Sans ça, deux
// recettes citant le même produit avec des indications différentes
// ("émincé", "haché fin"...) créaient chacune leur propre ligne dans la
// liste de courses au lieu de cumuler leurs quantités sur une seule.
function nomProduit(libelle: string): string {
  return libelle.split(',')[0].trim() || libelle.trim();
}

function nouvelAjoutId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

// Mots trop courants pour servir d'indice de produit (ex. dans "Poudre à
// lever", on ne veut pas repérer "à" comme mot-clé commun à tout le monde).
const MOTS_VIDES_PRODUIT = new Set([
  'de', 'du', 'des', 'la', 'le', 'les', 'un', 'une', 'et', 'à', 'au', 'aux', 'en', 'd', 'l',
]);

// Mots "signifiants" du nom de produit (au moins 3 lettres, hors mots vides,
// pluriel ignoré) — sert à repérer des articles qui citent probablement le
// même aliment sans que leur texte soit identique (ex. "Oeufs" et "oeufs
// entiers" partagent "oeuf"). Contrairement à `clefDeArticle`, on ne compare
// ici qu'un seul mot à la fois : la fusion automatique reste refusée (trop
// risqué de deviner que deux produits sont identiques), mais ça permet de
// PROPOSER un rapprochement à l'utilisateur, qui tranche lui-même (retour
// utilisateur — repérer un mot commun comme "oeuf" et demander confirmation
// plutôt que de deviner).
function motsSignificatifsProduit(libelle: string): string[] {
  return normaliserProduitPourFusion(nomProduit(libelle))
    .split(/[^a-z0-9]+/)
    .filter((mot) => mot.length >= 3 && !MOTS_VIDES_PRODUIT.has(mot));
}

// Une suggestion = un mot-clé commun ("oeuf") et les articles de la liste
// qui le partagent, alors qu'ils ne sont pas déjà fusionnés automatiquement
// (clefs différentes). Présentée à l'utilisateur par `ListeDeCoursesScreen`,
// qui laisse fusionner ou ignorer.
export type SuggestionFusion = { motCle: string; articles: ArticleListeCourses[] };

export function detecterSuggestionsFusion(articles: ArticleListeCourses[]): SuggestionFusion[] {
  const parMot = new Map<string, ArticleListeCourses[]>();
  articles.forEach((article) => {
    motsSignificatifsProduit(article.libelle).forEach((mot) => {
      const liste = parMot.get(mot) ?? [];
      liste.push(article);
      parMot.set(mot, liste);
    });
  });

  const signaturesDejaProposees = new Set<string>();
  const suggestions: SuggestionFusion[] = [];
  parMot.forEach((liste, mot) => {
    const distincts = Array.from(new Map(liste.map((a) => [a.id, a])).values());
    if (distincts.length < 2) return;
    // Si tous les articles du groupe ont déjà exactement la même clef, ils
    // sont déjà fusionnés automatiquement — rien à proposer.
    const clefsDistinctes = new Set(distincts.map((a) => clefDeArticle(a.libelle, a.unite)));
    if (clefsDistinctes.size < 2) return;
    const signature = distincts.map((a) => a.id).sort().join(',');
    if (signaturesDejaProposees.has(signature)) return;
    signaturesDejaProposees.add(signature);
    suggestions.push({ motCle: mot, articles: distincts });
  });

  return suggestions.sort((a, b) => a.motCle.localeCompare(b.motCle));
}

// Fusionne plusieurs articles choisis par l'utilisateur (suite à une
// suggestion) en un seul, sous le libellé/l'unité retenus : cumule leurs
// quantités, réécrit les contributions concernées avec ce libellé/cette
// unité (pour que les futurs ajouts/retraits — basés sur `clefDeArticle` —
// continuent de les reconnaître comme un seul produit), puis supprime les
// articles devenus redondants.
export async function fusionnerArticles(
  listeId: string,
  articleIds: string[],
  libelleRetenu: string,
  uniteRetenue: string | null
): Promise<void> {
  if (articleIds.length < 2) return;

  const articles = await listerArticles(listeId);
  const aFusionner = articles.filter((a) => articleIds.includes(a.id));
  if (aFusionner.length < 2) return;

  const clefsOrigine = new Set(aFusionner.map((a) => clefDeArticle(a.libelle, a.unite)));

  const contributions = await listerContributionsDeListe(listeId);
  const aReecrire = contributions.filter((c) => clefsOrigine.has(clefDeArticle(c.libelle, c.unite)));
  if (aReecrire.length > 0) {
    await Promise.all(
      aReecrire.map((c) =>
        supabase
          .from('liste_courses_contributions')
          .update({ libelle: libelleRetenu, unite: uniteRetenue })
          .eq('id', c.id)
      )
    );
  }

  const quantiteCumulee = aFusionner.some((a) => a.quantite != null)
    ? aFusionner.reduce((somme, a) => somme + (a.quantite ?? 0), 0)
    : null;

  const [articleConserve, ...autres] = aFusionner.slice().sort((a, b) => a.ordre - b.ordre);

  const { error: erreurMaj } = await supabase
    .from('liste_courses_articles')
    .update({ libelle: libelleRetenu, unite: uniteRetenue, quantite: quantiteCumulee })
    .eq('id', articleConserve.id);
  if (erreurMaj) throw erreurMaj;

  if (autres.length > 0) {
    const { error: erreurSuppression } = await supabase
      .from('liste_courses_articles')
      .delete()
      .in('id', autres.map((a) => a.id));
    if (erreurSuppression) throw erreurSuppression;
  }
}

// Clef d'agrégation d'un article, partagée par `ajouterRecettesALaListe` et
// `retirerAjoutDeListe` pour toujours regrouper les mêmes produits — et
// exportée pour que l'écran de la liste de courses puisse rattacher chaque
// contribution à son article (détail par recette).
export function clefDeArticle(libelle: string, unite: string | null): string {
  return `${normaliserProduitPourFusion(nomProduit(libelle))}::${normaliser(unite ?? '')}`;
}

// Une seule liste de courses "active" par foyer pour cette Phase 1 (la plus
// récente) — cahier des charges §7.
export async function obtenirOuCreerListeActive(foyerId: string): Promise<ListeCourses> {
  const { data: existante } = await supabase
    .from('listes_courses')
    .select('*')
    .eq('foyer_id', foyerId)
    .order('cree_le', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existante) return existante;

  const { data: creee, error } = await supabase
    .from('listes_courses')
    .insert({ foyer_id: foyerId, nom: 'Liste de courses' })
    .select()
    .single();
  if (error) throw error;
  return creee;
}

export async function listerArticles(listeId: string): Promise<ArticleListeCourses[]> {
  const { data, error } = await supabase
    .from('liste_courses_articles')
    .select('*')
    .eq('liste_id', listeId)
    .order('ordre', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

// Détail des contributions de chaque recette à la liste (une ligne par
// ingrédient de recette ajouté) — sert à afficher, pour un article, quelles
// recettes le citent (`listerContributionsDeListe`) et quelles recettes ont
// été ajoutées à la liste (`listerAjoutsDeListe`, `retirerAjoutDeListe`).
export async function listerContributionsDeListe(listeId: string): Promise<ContributionListeCourses[]> {
  const { data, error } = await supabase
    .from('liste_courses_contributions')
    .select('*')
    .eq('liste_id', listeId);
  if (error) throw error;
  return data ?? [];
}

// Un `ajout` = un clic sur "Ajouter à la liste de courses" pour une recette
// donnée (voir `ajout_id`). Si la même recette est ajoutée deux fois, elle
// apparaît ici deux fois — chaque occurrence se retire indépendamment de
// l'autre (voir `retirerAjoutDeListe`), sans quoi retirer "la recette"
// effacerait les deux d'un coup.
export type AjoutRecetteDansListe = { ajoutId: string; recetteId: string | null; titre: string; ajouteLe: string };

// Chaque ajout distinct présent dans la liste, avec sa date — pour le
// panneau "Recettes ajoutées".
export async function listerAjoutsDeListe(listeId: string): Promise<AjoutRecetteDansListe[]> {
  const contributions = await listerContributionsDeListe(listeId);
  const parAjout = new Map<string, AjoutRecetteDansListe>();
  contributions
    .slice()
    .sort((a, b) => a.ajoute_le.localeCompare(b.ajoute_le))
    .forEach((c) => {
      if (!parAjout.has(c.ajout_id)) {
        parAjout.set(c.ajout_id, {
          ajoutId: c.ajout_id,
          recetteId: c.recette_id,
          titre: c.recette_titre,
          ajouteLe: c.ajoute_le,
        });
      }
    });
  return Array.from(parAjout.values());
}

export async function basculerArticle(articleId: string, coche: boolean): Promise<void> {
  const { error } = await supabase.from('liste_courses_articles').update({ coche }).eq('id', articleId);
  if (error) throw error;
}

export async function ajouterArticleManuel(listeId: string, libelle: string): Promise<void> {
  const { error } = await supabase.from('liste_courses_articles').insert({ liste_id: listeId, libelle: libelle.trim() });
  if (error) throw error;
}

// "Supprimer la liste" : retire tous ses articles et le détail par recette.
// On garde la ligne de la liste elle-même (vide) plutôt que de la supprimer,
// pour que tous les téléphones du foyer continuent de pointer sur la même
// liste (sinon deux appareils pourraient en recréer chacun une nouvelle).
export async function viderListe(listeId: string): Promise<void> {
  const { error: erreurContributions } = await supabase
    .from('liste_courses_contributions')
    .delete()
    .eq('liste_id', listeId);
  if (erreurContributions) throw erreurContributions;

  const { error: erreurArticles } = await supabase
    .from('liste_courses_articles')
    .delete()
    .eq('liste_id', listeId);
  if (erreurArticles) throw erreurArticles;
}

export async function supprimerArticle(articleId: string): Promise<void> {
  const { error } = await supabase.from('liste_courses_articles').delete().eq('id', articleId);
  if (error) throw error;
}

// Agrège les ingrédients de plusieurs recettes (chacune ramenée au nombre de
// parts souhaité) et fusionne avec les articles déjà présents dans la liste
// quand le produit et l'unité correspondent (§7 : "fusion automatique des
// ingrédients identiques entre recettes"). Enregistre en parallèle, pour
// chaque ingrédient, une ligne de contribution qui mémorise quelle recette a
// apporté quelle quantité — c'est ce détail qui permet ensuite de voir, par
// article, les recettes qui le citent, et de retirer proprement la
// contribution d'une seule recette de la liste globale.
export async function ajouterRecettesALaListe(
  listeId: string,
  selections: { recette: RecetteComplete; partsSouhaitees: number }[]
): Promise<void> {
  const articlesExistants = await listerArticles(listeId);

  type Agrege = { libelle: string; unite: string | null; quantite: number | null };
  const parClef = new Map<string, Agrege>();

  // On part des articles déjà dans la liste, pour additionner par-dessus.
  articlesExistants.forEach((a) => {
    parClef.set(clefDeArticle(a.libelle, a.unite), { libelle: a.libelle, unite: a.unite, quantite: a.quantite });
  });

  selections.forEach(({ recette, partsSouhaitees }) => {
    const facteur = partsSouhaitees / (recette.parts_defaut || 1);
    recette.ingredients.forEach((ing) => {
      const clef = clefDeArticle(ing.libelle, ing.unite);
      const quantiteAjustee = ing.quantite != null ? ing.quantite * facteur : null;
      const existant = parClef.get(clef);
      if (existant) {
        existant.quantite =
          existant.quantite != null && quantiteAjustee != null
            ? existant.quantite + quantiteAjustee
            : existant.quantite ?? quantiteAjustee;
      } else {
        // Nouvelle ligne : nom du produit seul (sans indication de
        // préparation), pas utile une fois à l'épicerie.
        parClef.set(clef, { libelle: nomProduit(ing.libelle), unite: ing.unite, quantite: quantiteAjustee });
      }
    });
  });

  // Ré-écrit les articles existants mis à jour, puis insère les nouveaux.
  const aMettreAJour = articlesExistants.filter((a) => {
    const agrege = parClef.get(clefDeArticle(a.libelle, a.unite));
    return agrege && agrege.quantite !== a.quantite;
  });
  await Promise.all(
    aMettreAJour.map((a) => {
      const agrege = parClef.get(clefDeArticle(a.libelle, a.unite))!;
      return supabase.from('liste_courses_articles').update({ quantite: agrege.quantite }).eq('id', a.id);
    })
  );

  const clefsExistantes = new Set(articlesExistants.map((a) => clefDeArticle(a.libelle, a.unite)));
  const nouveaux = Array.from(parClef.entries())
    .filter(([clef]) => !clefsExistantes.has(clef))
    .map(([, agrege]) => agrege);

  if (nouveaux.length > 0) {
    const { error } = await supabase.from('liste_courses_articles').insert(
      nouveaux.map((n, index) => ({
        liste_id: listeId,
        libelle: n.libelle,
        quantite: n.quantite,
        unite: n.unite,
        ordre: articlesExistants.length + index,
      }))
    );
    if (error) throw error;
  }

  const contributions = selections.flatMap(({ recette, partsSouhaitees }) => {
    const facteur = partsSouhaitees / (recette.parts_defaut || 1);
    // Un seul `ajout_id` pour toutes les lignes de cette recette dans cet
    // ajout précis, distinct à chaque appel — même si la même recette est
    // ajoutée une seconde fois par erreur, ce sera un ajout_id différent.
    const ajoutId = nouvelAjoutId();
    return recette.ingredients.map((ing) => ({
      liste_id: listeId,
      recette_id: recette.id,
      // La liste est partagée par tout le foyer : une recette surprise
      // cachée à son foyer n'y apparaît pas sous son vrai nom.
      recette_titre: etatSurprise(recette)?.portee === 'moi' ? 'Recette surprise' : recette.titre,
      ajout_id: ajoutId,
      libelle: nomProduit(ing.libelle),
      quantite: ing.quantite != null ? ing.quantite * facteur : null,
      unite: ing.unite,
      parts_utilisees: partsSouhaitees,
    }));
  });
  if (contributions.length > 0) {
    const { error } = await supabase.from('liste_courses_contributions').insert(contributions);
    if (error) throw error;
  }
}

// Retire de la liste tout ce qu'UN ajout précis (un clic "Ajouter à la
// liste de courses" pour une recette, voir `ajout_id`) y a apporté :
// supprime ses lignes de contribution, puis recalcule chaque article touché
// à partir des contributions restantes des autres ajouts — l'article
// disparaît entièrement si plus rien ne le cite. Si la même recette a été
// ajoutée deux fois, retirer un ajout laisse l'autre intact — c'est tout
// l'intérêt de cibler par `ajout_id` plutôt que par recette.
export async function retirerAjoutDeListe(listeId: string, ajoutId: string): Promise<void> {
  const toutesContributions = await listerContributionsDeListe(listeId);
  const contributionsAjout = toutesContributions.filter((c) => c.ajout_id === ajoutId);
  if (contributionsAjout.length === 0) return;

  const clefsAffectees = new Set(contributionsAjout.map((c) => clefDeArticle(c.libelle, c.unite)));

  const { error: erreurSuppression } = await supabase
    .from('liste_courses_contributions')
    .delete()
    .in('id', contributionsAjout.map((c) => c.id));
  if (erreurSuppression) throw erreurSuppression;

  const contributionsRestantes = toutesContributions.filter(
    (c) => !contributionsAjout.some((ca) => ca.id === c.id)
  );
  const articlesExistants = await listerArticles(listeId);

  await Promise.all(
    Array.from(clefsAffectees).map(async (clef) => {
      const article = articlesExistants.find((a) => clefDeArticle(a.libelle, a.unite) === clef);
      if (!article) return;
      const restantes = contributionsRestantes.filter((c) => clefDeArticle(c.libelle, c.unite) === clef);
      if (restantes.length === 0) {
        // Plus aucune recette ne cite ce produit : on retire la ligne.
        await supabase.from('liste_courses_articles').delete().eq('id', article.id);
      } else {
        const quantiteRecalculee = restantes.some((c) => c.quantite != null)
          ? restantes.reduce((somme, c) => somme + (c.quantite ?? 0), 0)
          : null;
        await supabase.from('liste_courses_articles').update({ quantite: quantiteRecalculee }).eq('id', article.id);
      }
    })
  );
}
