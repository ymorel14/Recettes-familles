import { clientPourSchema } from './supabase';
import { rechercher as rechercherSouvenirs } from '../modules/souvenirs/services/souvenirs';
import type { Familles } from './familles';
import type { IdModule } from '../theme/jetons';

// Recherche globale (retour de test P-2) : instantanée, SANS assistant
// (aucun coût), dans tous les modules. Première version : une requête par
// module, en parallèle, avec les règles RLS de la personne (on ne trouve
// que ce qu'on a le droit de voir, surprises comprises). Ensuite : une
// fonction SQL `famille.rechercher(texte)` pour aller plus vite.

export type ResultatRecherche = {
  cle: string;
  module: IdModule;
  titre: string;
  detail: string | null;
  // Écran à ouvrir : un écran du module (avec paramètres) ou un onglet.
  ecran?: string;
  params?: Record<string, any>;
  onglet?: string;
};

export type GroupeRecherche = { module: IdModule; nom: string; resultats: ResultatRecherche[] };

const PAR_MODULE = 6;

// Motifs pour ilike : le texte tel quel, et sans accents (« boeuf » trouve
// « bœuf » si la base l'écrit « boeuf », et inversement pour « crème »).
function motifs(texte: string): string[] {
  const propre = texte.trim().replace(/[%_,()]/g, ' ').replace(/\s+/g, ' ');
  const sansAccents = propre
    .replace(/[œŒ]/g, 'oe')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
  return Array.from(new Set([propre, sansAccents])).filter(Boolean);
}

// Filtre « or » de PostgREST : colonne ilike *motif* pour chaque motif.
function ou(colonnes: string[], texte: string): string {
  return motifs(texte)
    .flatMap((m) => colonnes.map((c) => `${c}.ilike.*${m}*`))
    .join(',');
}

async function lire<T>(promesse: PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  try {
    const { data, error } = await promesse;
    if (error) return [];
    return data ?? [];
  } catch {
    return [];
  }
}

export async function rechercherPartout(
  texte: string,
  ctx: { foyerId: string; foyersFamille: string[]; familles: Familles }
): Promise<GroupeRecherche[]> {
  const q = texte.trim();
  if (q.length < 2) return [];
  const recettes = clientPourSchema('recettes');
  const courses = clientPourSchema('courses');
  const quotidien = clientPourSchema('quotidien');
  const wishlist = clientPourSchema('wishlist');
  const voyage = clientPourSchema('voyage');
  const foyers = Array.from(new Set([ctx.foyerId, ...ctx.foyersFamille]));

  const [parTitre, parIngredient, articles, taches, objets, souhaits, voyages, souvenirs, notes, gardeManger] = await Promise.all([
    lire<any>(recettes.from('recettes').select('id, titre, foyer_id').in('foyer_id', foyers).or(ou(['titre'], q)).limit(PAR_MODULE)),
    lire<any>(recettes.from('ingredients').select('libelle, recette:recettes!inner(id, titre, foyer_id)').or(ou(['libelle'], q)).limit(20)),
    lire<any>(courses.from('articles').select('id, libelle, liste_id, liste:listes(nom)').or(ou(['libelle'], q)).limit(PAR_MODULE)),
    lire<any>(quotidien.from('taches').select('id, libelle').or(ou(['libelle'], q)).limit(PAR_MODULE)),
    lire<any>(
      quotidien
        .from('objets')
        .select('id, nom, description, lieu:lieux(nom), contenant:contenants(nom)')
        .or(ou(['nom', 'description'], q))
        .limit(PAR_MODULE)
    ),
    lire<any>(wishlist.from('souhaits').select('id, titre, liste_id').is('supprime_le', null).or(ou(['titre'], q)).limit(PAR_MODULE)),
    lire<any>(voyage.from('voyages').select('id, titre, destination, nature').or(ou(['titre', 'destination'], q)).limit(PAR_MODULE)),
    rechercherSouvenirs(q, { familleId: ctx.familles, limite: PAR_MODULE }).catch(() => []),
    lire<any>(recettes.from('notes_utiles').select('id, titre, theme').in('foyer_id', foyers).or(ou(['titre', 'contenu'], q)).limit(PAR_MODULE)),
    // Garde-manger (C-1) : celui du foyer seulement.
    lire<any>(recettes.from('congelateur_aliments').select('id, nom, lieu:congelateurs(nom)').eq('foyer_id', ctx.foyerId).or(ou(['nom'], q)).limit(PAR_MODULE)),
  ]);

  // Recettes : par titre d'abord, puis celles qui contiennent l'ingrédient.
  const vues = new Set<string>();
  const resultatsRecettes: ResultatRecherche[] = [];
  parTitre.forEach((r) => {
    vues.add(r.id);
    resultatsRecettes.push({ cle: `r-${r.id}`, module: 'recettes', titre: r.titre, detail: null, ecran: 'DetailRecette', params: { recetteId: r.id } });
  });
  parIngredient.forEach((i) => {
    const r = i.recette;
    if (!r || vues.has(r.id) || !foyers.includes(r.foyer_id) || resultatsRecettes.length >= PAR_MODULE) return;
    vues.add(r.id);
    resultatsRecettes.push({ cle: `r-${r.id}`, module: 'recettes', titre: r.titre, detail: `Avec : ${i.libelle}`, ecran: 'DetailRecette', params: { recetteId: r.id } });
  });
  notes.forEach((n) =>
    resultatsRecettes.push({ cle: `n-${n.id}`, module: 'recettes', titre: n.titre, detail: n.theme ? `Aide-mémoire · ${n.theme}` : 'Aide-mémoire', onglet: 'AideMemoire' })
  );

  gardeManger.forEach((a) =>
    resultatsRecettes.push({ cle: `g-${a.id}`, module: 'recettes', titre: a.nom, detail: a.lieu?.nom ? `Garde-manger · ${a.lieu.nom}` : 'Garde-manger', ecran: 'FormulaireAlimentCongele', params: { alimentId: a.id } })
  );

  const groupes: GroupeRecherche[] = [
    { module: 'recettes', nom: 'Recettes', resultats: resultatsRecettes },
    {
      module: 'courses',
      nom: 'Courses',
      resultats: articles.map((a) => ({
        cle: `a-${a.id}`,
        module: 'courses' as IdModule,
        titre: a.libelle,
        detail: a.liste?.nom ? `Sur la liste « ${a.liste.nom} »` : null,
        ecran: 'Liste',
        params: { listeId: a.liste_id },
      })),
    },
    {
      module: 'quotidien',
      nom: 'Quotidien',
      resultats: [
        ...taches.map((t) => ({ cle: `t-${t.id}`, module: 'quotidien' as IdModule, titre: t.libelle, detail: 'Tâche', onglet: 'Taches' })),
        ...objets.map((o) => ({
          cle: `o-${o.id}`,
          module: 'quotidien' as IdModule,
          titre: o.nom,
          detail: [o.contenant?.nom, o.lieu?.nom].filter(Boolean).join(' · ') || 'Inventaire',
          ecran: 'Objet',
          params: { id: o.id },
        })),
      ],
    },
    {
      module: 'cadeaux',
      nom: 'Cadeaux',
      resultats: souhaits.map((s) => ({ cle: `s-${s.id}`, module: 'cadeaux' as IdModule, titre: s.titre, detail: 'Envie', ecran: 'Liste', params: { listeId: s.liste_id } })),
    },
    {
      module: 'voyages',
      nom: 'Voyages',
      resultats: voyages.map((v) => ({
        cle: `v-${v.id}`,
        module: 'voyages' as IdModule,
        titre: v.titre,
        detail: v.nature === 'repas' ? 'Repas de famille' : v.destination ?? 'Voyage',
        ecran: 'Voyage',
        params: { voyageId: v.id },
      })),
    },
    {
      module: 'souvenirs',
      nom: 'Souvenirs',
      resultats: (souvenirs as any[]).map((s) => ({
        cle: `so-${s.id}`,
        module: 'souvenirs' as IdModule,
        titre: s.titre,
        detail: s.extrait || s.lieu || null,
        ecran: 'Souvenir',
        params: { id: s.id },
      })),
    },
  ];
  return groupes.filter((g) => g.resultats.length > 0);
}
