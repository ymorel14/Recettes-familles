import { supabase } from './supabase';

// Repas de famille (migration 20261001100000_voyage_repas.sql) : repas d'un
// événement, plats par étape, recettes de l'app Cuisine, qui s'occupe de
// quoi, et listes de cadeaux de CadeauCommun liées.

export type EtapeRepas = 'aperitif' | 'entree' | 'plat' | 'accompagnement' | 'fromage' | 'dessert' | 'boissons';
export type MomentRepas = 'petit_dejeuner' | 'brunch' | 'dejeuner' | 'gouter' | 'apero' | 'diner';

export const ETAPES_REPAS: { id: EtapeRepas; libelle: string; icone: string }[] = [
  { id: 'aperitif', libelle: 'Apéritif', icone: 'wine-outline' },
  { id: 'entree', libelle: 'Entrée', icone: 'leaf-outline' },
  { id: 'plat', libelle: 'Plat', icone: 'restaurant-outline' },
  { id: 'accompagnement', libelle: 'Accompagnement', icone: 'nutrition-outline' },
  { id: 'fromage', libelle: 'Fromage', icone: 'pizza-outline' },
  { id: 'dessert', libelle: 'Dessert', icone: 'ice-cream-outline' },
  { id: 'boissons', libelle: 'Boissons', icone: 'beer-outline' },
];

export const MOMENTS: { id: MomentRepas; libelle: string }[] = [
  { id: 'petit_dejeuner', libelle: 'Petit-déjeuner' },
  { id: 'brunch', libelle: 'Brunch' },
  { id: 'dejeuner', libelle: 'Déjeuner' },
  { id: 'gouter', libelle: 'Goûter' },
  { id: 'apero', libelle: 'Apéro dînatoire' },
  { id: 'diner', libelle: 'Dîner' },
];

export type Plat = {
  id: string;
  repas_id: string;
  etape: EtapeRepas;
  titre: string;
  recette_id: string | null;
  quantite: string | null;
  notes: string | null;
  propose_par: string;
  recette: { id: string; titre: string; photo_url: string | null } | null;
  responsables: { personne_id: string }[];
};

export type Repas = {
  id: string;
  voyage_id: string;
  titre: string;
  jour: string | null;
  moment: MomentRepas;
  notes: string | null;
  plats: Plat[];
  responsables: { etape: EtapeRepas; personne_id: string }[];
};

const ORDRE_MOMENTS: MomentRepas[] = ['petit_dejeuner', 'brunch', 'dejeuner', 'gouter', 'apero', 'diner'];

// Repas d'un événement, dans l'ordre du calendrier (jour, puis moment).
export async function listerRepas(voyageId: string): Promise<Repas[]> {
  const { data, error } = await supabase
    .from('repas')
    .select(
      '*, responsables:repas_responsables(etape, personne_id), ' +
        'plats(*, responsables:plat_responsables(personne_id))'
    )
    .eq('voyage_id', voyageId);
  if (error) throw error;
  const repas = (data ?? []) as unknown as Repas[];
  // Les recettes vivent dans un autre schéma (app Cuisine) : l'API ne peut pas
  // les joindre, on les lit à part.
  const ids = [...new Set(repas.flatMap((r) => r.plats.map((p) => p.recette_id)).filter((x): x is string => !!x))];
  const recettes = new Map<string, RecetteResume>();
  if (ids.length) {
    const { data: lues } = await supabase.schema('recettes').from('recettes').select('id, titre, photo_url').in('id', ids);
    for (const r of (lues ?? []) as RecetteResume[]) recettes.set(r.id, r);
  }
  for (const r of repas) for (const p of r.plats) p.recette = p.recette_id ? recettes.get(p.recette_id) ?? null : null;
  return repas.sort(
    (a, b) =>
      (a.jour ?? '9999').localeCompare(b.jour ?? '9999') ||
      ORDRE_MOMENTS.indexOf(a.moment) - ORDRE_MOMENTS.indexOf(b.moment)
  );
}

export async function enregistrerRepas(
  r: { voyage_id: string; titre: string; jour: string | null; moment: MomentRepas; notes: string | null },
  id?: string
): Promise<void> {
  if (id) {
    const { voyage_id, ...champs } = r;
    const { error } = await supabase.from('repas').update(champs).eq('id', id);
    if (error) throw error;
  } else {
    const { error } = await supabase.from('repas').insert(r);
    if (error) throw error;
  }
}

export async function supprimerRepas(id: string): Promise<void> {
  const { error } = await supabase.from('repas').delete().eq('id', id);
  if (error) throw error;
}

// Crée ou modifie un plat, puis remplace la liste de ceux qui s'en occupent.
export async function enregistrerPlat(
  p: { repas_id: string; etape: EtapeRepas; titre: string; recette_id: string | null; quantite: string | null; notes: string | null },
  responsables: string[],
  id?: string,
  responsablesAvant: string[] = []
): Promise<void> {
  let platId = id;
  if (id) {
    const { repas_id, ...champs } = p;
    const { error } = await supabase.from('plats').update(champs).eq('id', id);
    if (error) throw error;
  } else {
    const { data, error } = await supabase.from('plats').insert(p).select('id').single();
    if (error) throw error;
    platId = (data as { id: string }).id;
  }
  const aRetirer = responsablesAvant.filter((x) => !responsables.includes(x));
  const aAjouter = responsables.filter((x) => !responsablesAvant.includes(x));
  if (aRetirer.length) {
    const { error } = await supabase.from('plat_responsables').delete().eq('plat_id', platId).in('personne_id', aRetirer);
    if (error) throw error;
  }
  if (aAjouter.length) {
    const { error } = await supabase
      .from('plat_responsables')
      .insert(aAjouter.map((personne_id) => ({ plat_id: platId, personne_id })));
    if (error) throw error;
  }
}

export async function supprimerPlat(id: string): Promise<void> {
  const { error } = await supabase.from('plats').delete().eq('id', id);
  if (error) throw error;
}

export async function confierEtape(repasId: string, etape: EtapeRepas, personneId: string): Promise<void> {
  const { error } = await supabase.from('repas_responsables').insert({ repas_id: repasId, etape, personne_id: personneId });
  if (error && (error as any).code !== '23505') throw error;
}

export async function retirerEtape(repasId: string, etape: EtapeRepas, personneId: string): Promise<void> {
  const { error } = await supabase
    .from('repas_responsables')
    .delete()
    .eq('repas_id', repasId)
    .eq('etape', etape)
    .eq('personne_id', personneId);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Recettes de l'app Cuisine (visibles de toute la famille)
// ---------------------------------------------------------------------------

export type RecetteResume = { id: string; titre: string; photo_url: string | null };

const sansAccents = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

// Recherche sans tenir compte des accents (« buche » trouve « Bûche ») : les
// recettes de la famille sont lues une fois, puis filtrées ici.
let cacheRecettes: { quand: number; liste: RecetteResume[] } | null = null;
export async function chercherRecettes(texte: string): Promise<RecetteResume[]> {
  if (!cacheRecettes || Date.now() - cacheRecettes.quand > 60000) {
    const { data, error } = await supabase
      .schema('recettes')
      .from('recettes')
      .select('id, titre, photo_url')
      .order('titre')
      .limit(1000);
    if (error) throw error;
    cacheRecettes = { quand: Date.now(), liste: (data ?? []) as RecetteResume[] };
  }
  const mots = sansAccents(texte).split(/\s+/).filter(Boolean);
  return cacheRecettes.liste.filter((r) => mots.every((m) => sansAccents(r.titre).includes(m))).slice(0, 20);
}

// ---------------------------------------------------------------------------
// Listes de cadeaux (événements de CadeauCommun)
// ---------------------------------------------------------------------------

export type EvenementCadeaux = { id: string; titre: string; type: string; date_evenement: string };

// Événements CadeauCommun de la famille (la base ne renvoie que ceux qu'on a le droit de voir).
export async function evenementsCadeaux(familleId: string): Promise<EvenementCadeaux[]> {
  const { data, error } = await supabase
    .schema('wishlist')
    .from('evenements')
    .select('id, titre, type, date_evenement')
    .eq('famille_id', familleId)
    .order('date_evenement');
  if (error) throw error;
  return (data ?? []) as EvenementCadeaux[];
}

export async function listesLiees(voyageId: string): Promise<string[]> {
  const { data, error } = await supabase.from('listes_cadeaux').select('evenement_id').eq('voyage_id', voyageId);
  if (error) throw error;
  return (data ?? []).map((x: any) => x.evenement_id as string);
}

export async function lierListe(voyageId: string, evenementId: string, lier: boolean): Promise<void> {
  const { error } = lier
    ? await supabase.from('listes_cadeaux').insert({ voyage_id: voyageId, evenement_id: evenementId })
    : await supabase.from('listes_cadeaux').delete().eq('voyage_id', voyageId).eq('evenement_id', evenementId);
  if (error) throw error;
}

export function libelleMoment(m: MomentRepas): string {
  return MOMENTS.find((x) => x.id === m)?.libelle ?? '';
}
