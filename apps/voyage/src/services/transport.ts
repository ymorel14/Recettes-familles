import { supabase } from './supabase';
import type { Energie, Vehicule } from './voyage';
import { etapesDe, etapesDuBudget, type SensEtape, type StatutOption } from './optionsTrajet';
import type { PaiementEtape } from './budget';

// Véhicules des foyers (voyage.vehicules) et trajets d'un voyage
// (voyage.trajets, voyage.trajet_passagers). Le coût d'un trajet est calculé
// par la base (colonne cout_total) avec la même formule que coutTrajet()
// dans budget.ts.

export type ModeTrajet = 'voiture' | 'train' | 'avion' | 'bateau' | 'bus' | 'autre';

export type Trajet = {
  id: string;
  voyage_id: string;
  // Option de trajet à laquelle appartient cette étape, et sa place dans
  // l'option (voir optionsTrajet.ts).
  option_id: string | null;
  ordre: number;
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
  // Qui paie l'étape (budget.ts) ; vide : la voiture par son foyer, le
  // reste en commun.
  paiement?: PaiementEtape | null;
  lien: string | null;
  note: string | null;
  // Aller-retour (défaut), aller ou retour seulement ; aller_retour en
  // découle (supabase/migrations/20261015100000_voyage_rendez_vous.sql).
  sens?: SensEtape;
  // Étape d'un seul foyer (foyer_id) pour rejoindre le groupe : rejoint_id
  // est l'étape commune rejointe (aller) ou quittée (retour) ; vide :
  // directement, sans le groupe.
  propre_foyer?: boolean;
  rejoint_id?: string | null;
  retour_de?: string | null;
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
  return ((data ?? []) as any[]).map((t) => ({
    option_id: null,
    ordre: 0,
    sens: t.aller_retour === false ? 'aller' : 'aller_retour',
    propre_foyer: false,
    rejoint_id: null,
    ...t,
  })) as Trajet[];
}

// Étapes qui comptent dans le budget (option retenue, ou à défaut la seule
// ou la moins chère), avec une note quand c'est une estimation.
export async function listerTrajetsDuBudget(voyageId: string): Promise<{ trajets: Trajet[]; note: string | null }> {
  const [options, trajets] = await Promise.all([listerOptions(voyageId), listerTrajets(voyageId)]);
  const r = etapesDuBudget(options, trajets);
  return { trajets: r.etapes, note: r.note };
}

export type FormulaireTrajet = Omit<Trajet, 'id' | 'responsable' | 'cout_total' | 'passagers' | 'ordre'>;

// Crée ou modifie un trajet, puis remplace sa liste de passagers ; renvoie
// son identifiant.
export async function enregistrerTrajet(t: FormulaireTrajet, passagers: string[], id?: string): Promise<string> {
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
  return trajetId!;
}

// Après un changement d'étape : la branche suit le nouveau rendez-vous, et
// les passagers des étapes communes sont mis d'accord avec les branches
// (rejoint à Portsmouth : à bord à partir de Portsmouth ; directement : sur
// aucune). Base pas encore à jour : sans effet.
export async function rangerEtapes(optionId: string, trajetId?: string, ancienRejoint?: string | null): Promise<void> {
  const { error } = await supabase.rpc('ranger_etapes', {
    id_option: optionId,
    id_trajet: trajetId ?? null,
    ancien_rejoint: ancienRejoint ?? null,
  });
  if (error && !/ranger_etapes|PGRST202/i.test(`${(error as any).code ?? ''} ${error.message}`)) throw error;
}

// Retour différent de l'aller : chaque étape aller-retour devient une étape
// d'aller et une de retour, modifiables séparément ; ou l'inverse.
export async function separerRetour(optionId: string): Promise<void> {
  const { error } = await supabase.rpc('separer_retour', { id_option: optionId });
  if (error) throw error;
}

export async function retourIdentique(optionId: string): Promise<void> {
  const { error } = await supabase.rpc('retour_identique', { id_option: optionId });
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Options de trajet (avion, bateau, voiture…) : supabase/migrations/
// 20261012120000_voyage_options_trajet.sql. Chacun propose et commente ; un
// organisateur retient. Base pas encore à jour : liste vide (l'écran montre
// alors les trajets comme avant).
// ---------------------------------------------------------------------------

export type AvisOption = { utilisateur_id: string; commentaire: string; maj_le: string };
export type OptionTrajet = {
  id: string;
  voyage_id: string;
  nom: string;
  description: string | null;
  statut: StatutOption;
  propose_par: string;
  cree_le: string;
  // Le retour a ses propres étapes (sinon : l'aller en sens inverse).
  retour_different?: boolean;
  avis: AvisOption[];
};

export async function listerOptions(voyageId: string): Promise<OptionTrajet[]> {
  const { data, error } = await supabase
    .from('options_trajet')
    .select('*, avis:avis_options_trajet(utilisateur_id, commentaire, maj_le)')
    .eq('voyage_id', voyageId)
    .order('cree_le');
  if (error) {
    if (/options_trajet|PGRST20[05]|does not exist/i.test(`${(error as any).code ?? ''} ${error.message}`)) return [];
    throw error;
  }
  return (data ?? []) as OptionTrajet[];
}

export async function enregistrerOption(
  o: { voyage_id: string; nom: string; description: string | null },
  id?: string
): Promise<string> {
  if (id) {
    const { error } = await supabase.from('options_trajet').update({ nom: o.nom, description: o.description }).eq('id', id);
    if (error) throw error;
    return id;
  }
  const { data, error } = await supabase.from('options_trajet').insert(o).select('id').single();
  if (error) throw error;
  return (data as { id: string }).id;
}

export async function supprimerOption(id: string): Promise<void> {
  const { error } = await supabase.from('options_trajet').delete().eq('id', id);
  if (error) throw error;
}

// Retenir une option (les autres sont écartées) ou lever le choix.
export async function retenirOption(id: string, retenir = true): Promise<void> {
  const { error } = await supabase.rpc('retenir_option_trajet', { id_option: id, retenir });
  if (error) throw error;
}

// Copie d'une option avec toutes ses étapes et leurs passagers (pour
// proposer une variante : « pareil, mais en avion depuis Paris ») ; les
// rendez-vous pointent vers les copies des étapes communes.
export async function dupliquerOption(option: OptionTrajet, etapes: Trajet[], nom: string): Promise<string> {
  const nouvelle = await enregistrerOption({ voyage_id: option.voyage_id, nom, description: option.description });
  if (option.retour_different) {
    const { error } = await supabase.from('options_trajet').update({ retour_different: true }).eq('id', nouvelle);
    if (error) throw error;
  }
  const copies = new Map<string, string>();
  const liste = etapesDe(option.id, etapes);
  for (const e of liste) {
    const { id, responsable, cout_total, passagers, ordre, rejoint_id, retour_de, ...champs } = e as any;
    copies.set(id, await enregistrerTrajet({ ...champs, option_id: nouvelle }, passagers.map((p: { personne_id: string }) => p.personne_id)));
  }
  for (const e of liste) {
    const lien: Record<string, string> = {};
    if (e.rejoint_id && copies.has(e.rejoint_id)) lien.rejoint_id = copies.get(e.rejoint_id)!;
    if (e.retour_de && copies.has(e.retour_de)) lien.retour_de = copies.get(e.retour_de)!;
    if (Object.keys(lien).length) {
      const { error } = await supabase.from('trajets').update(lien).eq('id', copies.get(e.id)!);
      if (error) throw error;
    }
  }
  return nouvelle;
}

// Un commentaire par personne et par option (texte vide : retiré).
export async function commenterOption(optionId: string, commentaire: string): Promise<void> {
  const texte = commentaire.trim();
  const { error } = texte
    ? await supabase
        .from('avis_options_trajet')
        .upsert({ option_id: optionId, commentaire: texte, maj_le: new Date().toISOString() }, { onConflict: 'option_id,utilisateur_id' })
    : await supabase.from('avis_options_trajet').delete().eq('option_id', optionId).eq('utilisateur_id', (await supabase.auth.getUser()).data.user?.id ?? '');
  if (error) throw error;
}

// Monter ou descendre une étape dans son option (la base renumérote toutes
// les étapes de l'option, même celles des autres).
export async function deplacerEtape(id: string, sens: -1 | 1): Promise<void> {
  const { error } = await supabase.rpc('deplacer_etape', { id_trajet: id, sens });
  if (error) throw error;
}

// Rejoindre une étape (pour soi et les siens), ou la quitter.
export async function rejoindreEtape(trajetId: string, personnes: string[]): Promise<void> {
  if (personnes.length === 0) return;
  const { error } = await supabase
    .from('trajet_passagers')
    .upsert(personnes.map((personne_id) => ({ trajet_id: trajetId, personne_id })), {
      onConflict: 'trajet_id,personne_id',
      ignoreDuplicates: true,
    });
  if (error) throw error;
}

export async function quitterEtape(trajetId: string, personnes: string[]): Promise<void> {
  if (personnes.length === 0) return;
  const { error } = await supabase.from('trajet_passagers').delete().eq('trajet_id', trajetId).in('personne_id', personnes);
  if (error) throw error;
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
