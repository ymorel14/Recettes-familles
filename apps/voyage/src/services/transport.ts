import { supabase } from './supabase';
import type { Energie, Vehicule } from './voyage';

// Véhicules des foyers (voyage.vehicules) et trajets d'un voyage
// (voyage.trajets, voyage.trajet_passagers). Le coût d'un trajet est calculé
// par la base (colonne cout_total) avec la même formule que coutTrajet()
// dans budget.ts.

export type ModeTrajet = 'voiture' | 'train' | 'avion' | 'bateau' | 'bus' | 'autre';

export type Trajet = {
  id: string;
  voyage_id: string;
  mode: ModeTrajet;
  libelle: string | null;
  foyer_id: string | null;
  responsable: string;
  vehicule_id: string | null;
  ville_depart: string | null;
  ville_arrivee: string | null;
  aller_retour: boolean;
  distance_km: number | null;
  duree_minutes: number | null;
  energie: Energie | null;
  consommation: number | null;
  prix_unitaire: number | null;
  peages: number | null;
  prix_billets: number | null;
  lien: string | null;
  note: string | null;
  cout_total: number;
  passagers: { personne_id: string }[];
};

export const MODES_TRAJET: { id: ModeTrajet; libelle: string; icone: string }[] = [
  { id: 'voiture', libelle: 'Voiture', icone: 'car-outline' },
  { id: 'train', libelle: 'Train', icone: 'train-outline' },
  { id: 'avion', libelle: 'Avion', icone: 'airplane-outline' },
  { id: 'bateau', libelle: 'Bateau', icone: 'boat-outline' },
  { id: 'bus', libelle: 'Bus', icone: 'bus-outline' },
  { id: 'autre', libelle: 'Autre', icone: 'navigate-outline' },
];

export const ENERGIES: { id: Energie; libelle: string; unite: string; consommation: number; prix: number }[] = [
  { id: 'gazole', libelle: 'Gazole', unite: 'L', consommation: 5.5, prix: 1.7 },
  { id: 'sp95', libelle: 'SP95 / E10', unite: 'L', consommation: 6.5, prix: 1.8 },
  { id: 'sp98', libelle: 'SP98', unite: 'L', consommation: 6.5, prix: 1.9 },
  { id: 'e85', libelle: 'E85', unite: 'L', consommation: 8, prix: 0.8 },
  { id: 'gpl', libelle: 'GPL', unite: 'L', consommation: 8, prix: 1 },
  { id: 'electrique', libelle: 'Électrique', unite: 'kWh', consommation: 17, prix: 0.25 },
];

export function infoEnergie(e: Energie | null | undefined) {
  return ENERGIES.find((x) => x.id === e) ?? ENERGIES[0];
}

// ---------------------------------------------------------------------------
// Véhicules du foyer
// ---------------------------------------------------------------------------

export async function listerVehicules(foyers: string[]): Promise<Vehicule[]> {
  if (foyers.length === 0) return [];
  const { data, error } = await supabase.from('vehicules').select('*').in('foyer_id', foyers).order('nom');
  if (error) throw error;
  return (data ?? []) as Vehicule[];
}

export async function enregistrerVehicule(v: Omit<Vehicule, 'id'>, id?: string): Promise<void> {
  const { error } = id
    ? await supabase.from('vehicules').update(v).eq('id', id)
    : await supabase.from('vehicules').insert(v);
  if (error) throw error;
}

export async function supprimerVehicule(id: string): Promise<void> {
  const { error } = await supabase.from('vehicules').delete().eq('id', id);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Trajets
// ---------------------------------------------------------------------------

export async function listerTrajets(voyageId: string): Promise<Trajet[]> {
  const { data, error } = await supabase
    .from('trajets')
    .select('*, passagers:trajet_passagers(personne_id)')
    .eq('voyage_id', voyageId)
    .order('cree_le');
  if (error) throw error;
  return (data ?? []) as Trajet[];
}

export type FormulaireTrajet = Omit<Trajet, 'id' | 'responsable' | 'cout_total' | 'passagers'>;

// Crée ou modifie un trajet, puis remplace sa liste de passagers.
export async function enregistrerTrajet(t: FormulaireTrajet, passagers: string[], id?: string): Promise<void> {
  let trajetId = id;
  if (id) {
    const { voyage_id, ...champs } = t;
    const { error } = await supabase.from('trajets').update(champs).eq('id', id);
    if (error) throw error;
    const { error: e2 } = await supabase.from('trajet_passagers').delete().eq('trajet_id', id);
    if (e2) throw e2;
  } else {
    const { data, error } = await supabase.from('trajets').insert(t).select('id').single();
    if (error) throw error;
    trajetId = (data as { id: string }).id;
  }
  if (passagers.length > 0) {
    const { error } = await supabase
      .from('trajet_passagers')
      .insert(passagers.map((personne_id) => ({ trajet_id: trajetId, personne_id })));
    if (error) throw error;
  }
}

export async function supprimerTrajet(id: string): Promise<void> {
  const { error } = await supabase.from('trajets').delete().eq('id', id);
  if (error) throw error;
}

export async function choisirModeTransport(voyageId: string, mode: string | null): Promise<void> {
  const { error } = await supabase.from('voyages').update({ mode_transport: mode }).eq('id', voyageId);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Calcul de trajet (fonction Edge calcul-trajet)
// ---------------------------------------------------------------------------

export type Itineraire = { distanceKm: number; dureeMinutes: number } | null;

export type CalculTrajet = {
  depart: { libelle: string; ville?: string };
  arrivee: { libelle: string; ville?: string };
  rapide: Itineraire;
  sansAutoroute: Itineraire;
  prixCarburants: Record<string, number> | null;
};

export async function calculerTrajet(depart: string, arrivee: string): Promise<CalculTrajet> {
  const { data, error } = await supabase.functions.invoke('calcul-trajet', { body: { depart, arrivee } });
  if (error) {
    // Message renvoyé par la fonction, s'il y en a un.
    let message = 'Calcul impossible pour le moment : saisissez la distance à la main.';
    try {
      const corps = await (error as any).context?.json?.();
      if (corps?.erreur) message = corps.erreur;
    } catch {
      /* message par défaut */
    }
    throw new Error(message);
  }
  return data as CalculTrajet;
}

// Ville d'une adresse : "12 rue X, 76000 Rouen" → "Rouen" (sinon le texte).
// Seule la ville est enregistrée dans un trajet, visible de la famille.
export function villeDe(adresse: string): string {
  const texte = adresse.trim();
  const m = texte.match(/\b\d{5}\s+([^,]+)$/);
  if (m) return m[1].trim();
  const morceaux = texte.split(',').map((x) => x.trim()).filter(Boolean);
  return morceaux.length > 1 ? morceaux[morceaux.length - 1] : texte;
}

// ---------------------------------------------------------------------------
// Adresse du foyer (privée : lisible des seuls membres du foyer)
// ---------------------------------------------------------------------------

export async function lireAdresseFoyer(foyerId: string): Promise<string | null> {
  const { data, error } = await supabase.from('adresses_foyers').select('adresse').eq('foyer_id', foyerId).maybeSingle();
  if (error) throw error;
  return (data as { adresse: string } | null)?.adresse ?? null;
}

export async function enregistrerAdresseFoyer(foyerId: string, adresse: string): Promise<void> {
  const net = adresse.trim();
  const { error } = net
    ? await supabase
        .from('adresses_foyers')
        .upsert({ foyer_id: foyerId, adresse: net, maj_le: new Date().toISOString() }, { onConflict: 'foyer_id' })
    : await supabase.from('adresses_foyers').delete().eq('foyer_id', foyerId);
  if (error) throw error;
}

// "252" minutes → "4 h 12"
export function formaterDuree(minutes: number | null): string {
  if (minutes == null) return '';
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return h ? `${h} h ${String(m).padStart(2, '0')}` : `${m} min`;
}

// Lien vers un calculateur d'itinéraire (péages) pour le même trajet.
export function lienPeages(depart: string, arrivee: string): string {
  return `https://www.viamichelin.fr/web/Itineraires?${new URLSearchParams({ departure: depart, arrival: arrivee })}`;
}

// Sites où chercher des billets.
export function sitesBillets(mode: ModeTrajet, depart: string, arrivee: string): { nom: string; url: string }[] {
  const q = encodeURIComponent(`${depart} ${arrivee}`.trim());
  switch (mode) {
    case 'train':
      return [
        { nom: 'SNCF Connect', url: 'https://www.sncf-connect.com/' },
        { nom: 'Trainline', url: 'https://www.thetrainline.com/fr' },
      ];
    case 'avion':
      return [
        { nom: 'Google Vols', url: `https://www.google.com/travel/flights?q=${encodeURIComponent(`Vols de ${depart} à ${arrivee}`)}` },
        { nom: 'Skyscanner', url: 'https://www.skyscanner.fr/' },
      ];
    case 'bateau':
      return [{ nom: 'Direct Ferries', url: 'https://www.directferries.fr/' }];
    case 'bus':
      return [{ nom: 'BlaBlaCar Bus', url: 'https://www.blablacar.fr/bus' }, { nom: 'FlixBus', url: 'https://www.flixbus.fr/' }];
    default:
      return q ? [{ nom: 'Rechercher', url: `https://www.google.com/search?q=${q}` }] : [];
  }
}
