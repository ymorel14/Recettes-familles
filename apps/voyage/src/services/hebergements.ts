import { supabase } from './supabase';

// Hébergements proposés pour un voyage (voyage.hebergements) et avis de
// chacun (voyage.avis_hebergements). Tout participant propose ; seul un
// organisateur retient ou écarte (garanti par la base).

export type TypeHebergement =
  | 'airbnb'
  | 'gites_de_france'
  | 'abritel'
  | 'booking'
  | 'hotel'
  | 'camping'
  | 'location'
  | 'chez_famille'
  | 'autre';

export type StatutHebergement = 'propose' | 'retenu' | 'ecarte';
export type Avis = 'coup_de_coeur' | 'pourquoi_pas' | 'bof' | 'non';

export type AvisHebergement = {
  hebergement_id: string;
  utilisateur_id: string;
  avis: Avis;
  commentaire: string | null;
};

export type Hebergement = {
  id: string;
  voyage_id: string;
  nom: string;
  type: TypeHebergement;
  lien: string | null;
  image: string | null;
  adresse: string | null;
  ville: string | null;
  capacite: number | null;
  nb_chambres: number | null;
  prix_total: number | null;
  prix_nuit: number | null;
  frais_annexes: number | null;
  description: string | null;
  statut: StatutHebergement;
  propose_par: string;
  avis: AvisHebergement[];
};

export const TYPES_HEBERGEMENT: { id: TypeHebergement; libelle: string }[] = [
  { id: 'airbnb', libelle: 'Airbnb' },
  { id: 'gites_de_france', libelle: 'Gîtes de France' },
  { id: 'abritel', libelle: 'Abritel' },
  { id: 'booking', libelle: 'Booking' },
  { id: 'hotel', libelle: 'Hôtel' },
  { id: 'camping', libelle: 'Camping' },
  { id: 'location', libelle: 'Location' },
  { id: 'chez_famille', libelle: 'Chez de la famille' },
  { id: 'autre', libelle: 'Autre' },
];

export const AVIS: { id: Avis; libelle: string }[] = [
  { id: 'coup_de_coeur', libelle: 'Coup de cœur' },
  { id: 'pourquoi_pas', libelle: 'Pourquoi pas' },
  { id: 'bof', libelle: 'Bof' },
  { id: 'non', libelle: 'Non' },
];

// Devine le type d'après le lien collé.
export function typeDepuisLien(lien: string): TypeHebergement | null {
  const l = lien.toLowerCase();
  if (l.includes('airbnb.')) return 'airbnb';
  if (l.includes('gites-de-france')) return 'gites_de_france';
  if (l.includes('abritel.')) return 'abritel';
  if (l.includes('booking.')) return 'booking';
  return null;
}

// Prix du séjour (prix total, sinon prix par nuit × nuits, + frais annexes) :
// même calcul que le budget.
export { prixSejour } from './budget';

export function formaterEuros(montant: number | null, decimales = false): string {
  if (montant === null || Number.isNaN(montant)) return '—';
  return (
    montant.toLocaleString('fr-FR', {
      minimumFractionDigits: decimales ? 2 : 0,
      maximumFractionDigits: decimales ? 2 : 0,
    }) + ' €'
  );
}

// "1 250,50" → 1250.5 (null si vide ou invalide)
export function lireMontant(texte: string): number | null {
  const net = texte.replace(/\s|€/g, '').replace(',', '.');
  if (!net) return null;
  const n = Number(net);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
}

// Comme lireMontant, avec un nombre de décimales choisi (prix du carburant
// au millième : 1,689 €/L).
export function lireDecimal(texte: string, decimales: number): number | null {
  const net = texte.replace(/\s|€/g, '').replace(',', '.');
  if (!net) return null;
  const n = Number(net);
  const f = 10 ** decimales;
  return Number.isFinite(n) && n >= 0 ? Math.round(n * f) / f : null;
}

export function lireEntier(texte: string): number | null {
  const n = Number(texte.trim());
  return texte.trim() && Number.isInteger(n) && n >= 0 ? n : null;
}

export async function listerHebergements(voyageId: string): Promise<Hebergement[]> {
  const { data, error } = await supabase
    .from('hebergements')
    .select('*, avis:avis_hebergements(hebergement_id, utilisateur_id, avis, commentaire)')
    .eq('voyage_id', voyageId)
    .order('cree_le');
  if (error) throw error;
  return (data ?? []) as Hebergement[];
}

export type FormulaireHebergement = Omit<Hebergement, 'id' | 'statut' | 'propose_par' | 'avis'>;

export async function proposerHebergement(f: FormulaireHebergement): Promise<void> {
  const { error } = await supabase.from('hebergements').insert(f);
  if (error) throw error;
}

export async function modifierHebergement(id: string, f: Partial<FormulaireHebergement>): Promise<void> {
  const { voyage_id, ...champs } = f as any;
  const { error } = await supabase.from('hebergements').update(champs).eq('id', id);
  if (error) throw error;
}

export async function supprimerHebergement(id: string): Promise<void> {
  const { error } = await supabase.from('hebergements').delete().eq('id', id);
  if (error) throw error;
}

// Retenir (les autres propositions passent en "écarté") — organisateurs.
export async function retenirHebergement(id: string): Promise<void> {
  const { error } = await supabase.rpc('retenir_hebergement', { id_hebergement: id, garder_autres: false });
  if (error) throw error;
}

// Remettre une proposition en jeu (retenue ou écartée → proposée).
export async function remettreEnJeu(id: string): Promise<void> {
  const { error } = await supabase.from('hebergements').update({ statut: 'propose' }).eq('id', id);
  if (error) throw error;
}

export async function donnerAvis(hebergementId: string, utilisateurId: string, avis: Avis, commentaire: string | null) {
  const { error } = await supabase.from('avis_hebergements').upsert(
    { hebergement_id: hebergementId, utilisateur_id: utilisateurId, avis, commentaire, maj_le: new Date().toISOString() },
    { onConflict: 'hebergement_id,utilisateur_id' }
  );
  if (error) throw error;
}

export async function retirerAvis(hebergementId: string, utilisateurId: string) {
  const { error } = await supabase
    .from('avis_hebergements')
    .delete()
    .eq('hebergement_id', hebergementId)
    .eq('utilisateur_id', utilisateurId);
  if (error) throw error;
}
