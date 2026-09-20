import { supabase } from './supabase';
import type { ListeCourses, ArticleListeCourses, RecetteComplete } from '../types/models';

function normaliser(texte: string): string {
  return texte
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
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

export async function basculerArticle(articleId: string, coche: boolean): Promise<void> {
  const { error } = await supabase.from('liste_courses_articles').update({ coche }).eq('id', articleId);
  if (error) throw error;
}

export async function ajouterArticleManuel(listeId: string, libelle: string): Promise<void> {
  const { error } = await supabase.from('liste_courses_articles').insert({ liste_id: listeId, libelle: libelle.trim() });
  if (error) throw error;
}

export async function supprimerArticle(articleId: string): Promise<void> {
  const { error } = await supabase.from('liste_courses_articles').delete().eq('id', articleId);
  if (error) throw error;
}

// Agrège les ingrédients de plusieurs recettes (chacune ramenée au nombre de
// parts souhaité) et fusionne avec les articles déjà présents dans la liste
// quand le libellé et l'unité correspondent (§7 : "fusion automatique des
// ingrédients identiques entre recettes").
export async function ajouterRecettesALaListe(
  listeId: string,
  selections: { recette: RecetteComplete; partsSouhaitees: number }[]
): Promise<void> {
  const articlesExistants = await listerArticles(listeId);

  type Agrege = { libelle: string; unite: string | null; quantite: number | null };
  const parClef = new Map<string, Agrege>();

  const clefDe = (libelle: string, unite: string | null) => `${normaliser(libelle)}::${normaliser(unite ?? '')}`;

  // On part des articles déjà dans la liste, pour additionner par-dessus.
  articlesExistants.forEach((a) => {
    parClef.set(clefDe(a.libelle, a.unite), { libelle: a.libelle, unite: a.unite, quantite: a.quantite });
  });

  selections.forEach(({ recette, partsSouhaitees }) => {
    const facteur = partsSouhaitees / (recette.parts_defaut || 1);
    recette.ingredients.forEach((ing) => {
      const clef = clefDe(ing.libelle, ing.unite);
      const quantiteAjustee = ing.quantite != null ? ing.quantite * facteur : null;
      const existant = parClef.get(clef);
      if (existant) {
        existant.quantite =
          existant.quantite != null && quantiteAjustee != null
            ? existant.quantite + quantiteAjustee
            : existant.quantite ?? quantiteAjustee;
      } else {
        parClef.set(clef, { libelle: ing.libelle, unite: ing.unite, quantite: quantiteAjustee });
      }
    });
  });

  // Ré-écrit les articles existants mis à jour, puis insère les nouveaux.
  const aMettreAJour = articlesExistants.filter((a) => {
    const agrege = parClef.get(clefDe(a.libelle, a.unite));
    return agrege && agrege.quantite !== a.quantite;
  });
  await Promise.all(
    aMettreAJour.map((a) => {
      const agrege = parClef.get(clefDe(a.libelle, a.unite))!;
      return supabase.from('liste_courses_articles').update({ quantite: agrege.quantite }).eq('id', a.id);
    })
  );

  const clefsExistantes = new Set(articlesExistants.map((a) => clefDe(a.libelle, a.unite)));
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
}
