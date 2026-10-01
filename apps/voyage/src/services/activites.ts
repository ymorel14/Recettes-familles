import { supabase } from './supabase';

// Activités d'un voyage (voyage.activites) et avis de chacun
// (voyage.avis_activites). Tout participant propose ; seul un organisateur
// retient ou écarte ; seules les activités retenues entrent au budget.

export type CategorieActivite =
  | 'visite'
  | 'chateau'
  | 'musee'
  | 'parc_attraction'
  | 'parc_animalier'
  | 'restaurant'
  | 'nature'
  | 'plage'
  | 'sport'
  | 'spectacle'
  | 'marche'
  | 'autre';

export type AvisActivite = 'partant' | 'pourquoi_pas' | 'non';

export type Activite = {
  id: string;
  voyage_id: string;
  titre: string;
  categorie: CategorieActivite;
  description: string | null;
  lien: string | null;
  image: string | null;
  adresse: string | null;
  jour: string | null;
  prix_adulte: number | null;
  prix_enfant: number | null;
  age_max_enfant: number | null;
  age_gratuit: number | null;
  prix_forfait: number | null;
  statut: 'propose' | 'retenu' | 'ecarte';
  propose_par: string;
  avis: { personne_id: string; avis: AvisActivite }[];
};

export const CATEGORIES_ACTIVITE: { id: CategorieActivite; libelle: string; icone: string }[] = [
  { id: 'visite', libelle: 'Visite', icone: 'walk-outline' },
  { id: 'chateau', libelle: 'Château', icone: 'business-outline' },
  { id: 'musee', libelle: 'Musée', icone: 'color-palette-outline' },
  { id: 'parc_attraction', libelle: 'Parc d’attractions', icone: 'happy-outline' },
  { id: 'parc_animalier', libelle: 'Parc animalier', icone: 'paw-outline' },
  { id: 'restaurant', libelle: 'Restaurant', icone: 'restaurant-outline' },
  { id: 'nature', libelle: 'Nature', icone: 'leaf-outline' },
  { id: 'plage', libelle: 'Plage', icone: 'sunny-outline' },
  { id: 'sport', libelle: 'Sport', icone: 'bicycle-outline' },
  { id: 'spectacle', libelle: 'Spectacle', icone: 'musical-notes-outline' },
  { id: 'marche', libelle: 'Marché', icone: 'basket-outline' },
  { id: 'autre', libelle: 'Autre', icone: 'star-outline' },
];

export const AVIS_ACTIVITE: { id: AvisActivite; libelle: string }[] = [
  { id: 'partant', libelle: 'Partant' },
  { id: 'pourquoi_pas', libelle: 'Pourquoi pas' },
  { id: 'non', libelle: 'Ne vient pas' },
];

export async function listerActivites(voyageId: string): Promise<Activite[]> {
  const { data, error } = await supabase
    .from('activites')
    .select('*, avis:avis_activites(personne_id, avis)')
    .eq('voyage_id', voyageId)
    .order('cree_le');
  if (error) throw error;
  return (data ?? []) as Activite[];
}

export type FormulaireActivite = Omit<Activite, 'id' | 'statut' | 'propose_par' | 'avis'>;

export async function enregistrerActivite(a: FormulaireActivite, id?: string): Promise<void> {
  if (id) {
    const { voyage_id, ...champs } = a;
    const { error } = await supabase.from('activites').update(champs).eq('id', id);
    if (error) throw error;
  } else {
    const { error } = await supabase.from('activites').insert(a);
    if (error) throw error;
  }
}

export async function supprimerActivite(id: string): Promise<void> {
  const { error } = await supabase.from('activites').delete().eq('id', id);
  if (error) throw error;
}

export async function changerStatutActivite(id: string, statut: Activite['statut']): Promise<void> {
  const { error } = await supabase.from('activites').update({ statut }).eq('id', id);
  if (error) throw error;
}

export async function donnerAvisActivite(activiteId: string, personneId: string, avis: AvisActivite): Promise<void> {
  const { error } = await supabase
    .from('avis_activites')
    .upsert(
      { activite_id: activiteId, personne_id: personneId, avis, maj_le: new Date().toISOString() },
      { onConflict: 'activite_id,personne_id' }
    );
  if (error) throw error;
}

// Place une activité un jour du séjour (null = à placer).
export async function planifierActivite(id: string, jour: string | null): Promise<void> {
  const { error } = await supabase.from('activites').update({ jour }).eq('id', id);
  if (error) throw error;
}
