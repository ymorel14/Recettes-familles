import { supabase } from './supabase';
import { enregistrerPlat } from './repas';

// Page d'un événement (refonte Événements § 8) : actions à faire, personnes
// en retard, plats, liste d'envies liée. Les fonctions de lecture renvoient
// une liste vide si la migration 20261028170000 n'est pas encore passée.

export type TypeAction =
  | 'repondre'
  | 'voter_dates'
  | 'voter_hebergement'
  | 'voter_trajet'
  | 'voter_activite'
  | 'presence_activite'
  | 'trajet_foyer'
  | 'prendre_plat'
  | 'cagnotte';

export type ActionAFaire = { type: TypeAction; objet_id: string | null; libelle: string; echeance: string | null };

export async function aFaire(voyageId: string): Promise<ActionAFaire[]> {
  const { data, error } = await supabase.rpc('a_faire', { id_voyage: voyageId });
  if (error) return [];
  return (data ?? []) as ActionAFaire[];
}

export type EnAttente = { personne_id: string; foyer_id: string | null; type: TypeAction; libelle: string };

export async function enAttente(voyageId: string): Promise<EnAttente[]> {
  const { data, error } = await supabase.rpc('en_attente', { id_voyage: voyageId });
  if (error) return [];
  return (data ?? []) as EnAttente[];
}

// Renvoie faux si la personne a déjà été relancée aujourd'hui.
export async function relancer(voyageId: string, personneId: string, type: TypeAction): Promise<boolean> {
  const { data, error } = await supabase.rpc('relancer', { id_voyage: voyageId, id_personne: personneId, type_action: type });
  if (error) throw error;
  return data === true;
}

// --- Menu d'un repas ---------------------------------------------------------

export async function prendrePlat(platId: string, personneId: string): Promise<void> {
  const { error } = await supabase.from('plat_responsables').insert({ plat_id: platId, personne_id: personneId });
  if (error && (error as any).code !== '23505') throw error;
}

// « Proposer autre chose » : un plat dans « Proposé par la famille », dont je m'occupe.
export async function proposerPlat(repasId: string, titre: string, personneId: string): Promise<void> {
  await enregistrerPlat(
    { repas_id: repasId, etape: 'autre' as any, titre: titre.trim(), recette_id: null, quantite: null, notes: null },
    [personneId]
  );
}

// --- Liste d'envies liée (anniversaire) ---------------------------------------

export async function listesEnviesLiees(voyageId: string): Promise<string[]> {
  const { data, error } = await supabase.from('listes_envies').select('liste_id').eq('voyage_id', voyageId);
  if (error) return [];
  return ((data ?? []) as { liste_id: string }[]).map((l) => l.liste_id);
}

export type Envie = {
  id: string;
  titre: string;
  prix: number | null;
  reservations: { reserve_par: string; achete: boolean }[];
};

export async function enviesDeListe(listeId: string): Promise<Envie[]> {
  const { data, error } = await supabase
    .schema('wishlist')
    .from('souhaits')
    .select('id, titre, prix, reservations(reserve_par, achete)')
    .eq('liste_id', listeId)
    .is('supprime_le', null)
    .order('priorite')
    .order('cree_le');
  if (error) return [];
  return (data ?? []) as unknown as Envie[];
}

export async function offrirEnvie(souhaitId: string): Promise<void> {
  const { error } = await supabase.schema('wishlist').from('reservations').insert({ souhait_id: souhaitId });
  if (error && (error as any).code !== '23505') throw error;
}

// --- Choix des listes d'envies à relier ---------------------------------------

export type ListeVisible = { id: string; destinataire_id: string; titre: string; date: string | null };

// Listes de souhaits que je peux voir (la base masque les autres).
export async function listesVisibles(): Promise<ListeVisible[]> {
  const { data, error } = await supabase
    .schema('wishlist')
    .from('listes')
    .select('id, destinataire_id, statut, evenements(titre, date_evenement)')
    .neq('statut', 'archivee');
  if (error) throw error;
  return ((data ?? []) as any[]).map((l) => ({
    id: l.id as string,
    destinataire_id: l.destinataire_id as string,
    titre: (l.evenements?.titre as string | undefined) ?? 'Liste d’envies',
    date: (l.evenements?.date_evenement as string | undefined) ?? null,
  }));
}

export async function lierEnvies(voyageId: string, listeId: string, lier: boolean): Promise<void> {
  const { error } = lier
    ? await supabase.from('listes_envies').insert({ voyage_id: voyageId, liste_id: listeId })
    : await supabase.from('listes_envies').delete().eq('voyage_id', voyageId).eq('liste_id', listeId);
  if (error && (error as any).code !== '23505') throw error;
}
