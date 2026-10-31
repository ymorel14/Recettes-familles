import { Platform } from 'react-native';
import { supabase } from './supabase';
import { baseWeb } from '@apps-famille/famille';

// Données de Quotidien (schéma "quotidien", schéma par défaut du client :
// supabase/migrations/20261007120000_quotidien.sql).
// Les groupes ne dépendent pas de la famille active : un groupe réunit des
// foyers de familles différentes (parents d'une même équipe).

export type Groupe = {
  id: string;
  nom: string;
  zone_vacances: ZoneVacances | null;
  cree_par: string;
  // Groupe privé du foyer (« Notre foyer ») : non null = pas un groupe de covoiturage.
  foyer_prive?: string | null;
};

export type ZoneVacances = 'A' | 'B' | 'C' | 'Corse';
export const ZONES_VACANCES: ZoneVacances[] = ['A', 'B', 'C', 'Corse'];

export type Participant = {
  id: string;
  groupe_id: string;
  foyer_id: string | null;
  nom_affiche: string;
  invite_par: string | null;
  parti_le: string | null;
};

export type Enfant = { id: string; participant_id: string; prenom: string };

export type Activite = {
  id: string;
  groupe_id: string;
  nom: string;
  lieu: string | null;
  jour_semaine: number;
  heure_debut: string;
  heure_fin: string;
  date_debut: string;
  date_fin: string;
  // Responsables par défaut (personnes du foyer) ; *_alt : une semaine sur deux.
  aller_par?: string | null;
  retour_par?: string | null;
  aller_par_alt?: string | null;
  retour_par_alt?: string | null;
  // Temps entre le départ de l'aller et le début, en texte d'intervalle SQL ('20 minutes').
  avance_aller?: string;
};

export type Trajet = {
  id: string;
  sens: 'aller' | 'retour';
  heure: string; // "13:45:00"
  places: number;
  note: string | null;
  conducteur_id: string | null;
  // Conducteur proposé par le planning, en attente de son accord.
  propose: boolean;
  date: string; // "2026-10-14"
  statut: 'prevue' | 'annulee';
  lieu: string | null;
  activite: string;
  groupe_id: string;
  enfants: { id: string; prenom: string; participant_id?: string }[];
};

export type LigneEquite = { participant_id: string; nom_affiche: string; trajets: number; parti: boolean };

export const JOURS = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];

// ---------------------------------------------------------------------------
// Dates et heures
// ---------------------------------------------------------------------------

export function aujourdHuiIso(decalageJours = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + decalageJours);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// "13:45:00" → "13:45"
export function heureCourte(heure: string): string {
  return heure.slice(0, 5);
}

// "9h", "9:30", "09h30" → "09:30" (null si invalide)
export function lireHeureSaisie(texte: string): string | null {
  const m = texte.trim().toLowerCase().match(/^(\d{1,2})\s*[:h]\s*(\d{2})?$/);
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2] ?? '0');
  if (h > 23 || mi > 59) return null;
  return `${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}`;
}

// "2026-10-14" → "Aujourd'hui", "Demain", "Mercredi 14 octobre"
export function libelleJour(iso: string): string {
  if (iso === aujourdHuiIso()) return 'Aujourd’hui';
  if (iso === aujourdHuiIso(1)) return 'Demain';
  const [a, m, j] = iso.split('-').map(Number);
  const texte = new Date(a, m - 1, j).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  return texte.charAt(0).toUpperCase() + texte.slice(1);
}

// ---------------------------------------------------------------------------
// Groupes et participants
// ---------------------------------------------------------------------------

export async function listerGroupes(): Promise<Groupe[]> {
  const { data, error } = await supabase.from('groupes').select('id, nom, zone_vacances, cree_par, foyer_prive').order('cree_le');
  if (error) throw error;
  return (data as Groupe[]) ?? [];
}

export async function creerGroupe(nom: string, zone: ZoneVacances | null): Promise<string> {
  const { data, error } = await supabase
    .from('groupes')
    .insert({ nom: nom.trim(), zone_vacances: zone })
    .select('id')
    .single();
  if (error) throw error;
  return data.id as string;
}

export async function modifierGroupe(id: string, champs: { nom?: string; zone_vacances?: ZoneVacances | null }) {
  const { error } = await supabase.from('groupes').update(champs).eq('id', id);
  if (error) throw error;
}

export async function rejoindreGroupe(code: string, nom?: string): Promise<string> {
  const { data, error } = await supabase.rpc('rejoindre_groupe', { code_saisi: code.trim(), nom: nom?.trim() || null });
  if (error) throw error;
  return data as string;
}

export async function obtenirCodeGroupe(idGroupe: string): Promise<{ code: string; expire_le: string }> {
  const { data, error } = await supabase.rpc('obtenir_code_groupe', { id_groupe: idGroupe });
  if (error) throw error;
  return data as { code: string; expire_le: string };
}

export async function quitterGroupe(idGroupe: string): Promise<void> {
  const { error } = await supabase.rpc('quitter_groupe', { id_groupe: idGroupe });
  if (error) throw error;
}

// Participants actifs (et partis, pour l'historique) des groupes donnés.
export async function listerParticipants(groupes: string[]): Promise<Participant[]> {
  if (!groupes.length) return [];
  const { data, error } = await supabase
    .from('participants')
    .select('id, groupe_id, foyer_id, nom_affiche, invite_par, parti_le')
    .in('groupe_id', groupes)
    .order('ajoute_le');
  if (error) throw error;
  return (data as Participant[]) ?? [];
}

export async function renommerParticipant(id: string, nom: string): Promise<void> {
  const { error } = await supabase.from('participants').update({ nom_affiche: nom.trim() }).eq('id', id);
  if (error) throw error;
}

// Mes participants : ceux de mon foyer (un par groupe).
export function mesParticipants(participants: Participant[], foyerId: string | null | undefined): Participant[] {
  return participants.filter((p) => p.foyer_id && p.foyer_id === foyerId && !p.parti_le);
}

// ---------------------------------------------------------------------------
// Invités sans compte
// ---------------------------------------------------------------------------

export async function ajouterInvite(idGroupe: string, nom: string): Promise<string> {
  const { data, error } = await supabase.rpc('ajouter_invite', { id_groupe: idGroupe, nom: nom.trim() });
  if (error) throw error;
  return data as string;
}

export async function lienInvite(idParticipant: string): Promise<string | null> {
  const { data, error } = await supabase.rpc('lien_invite', { id_participant: idParticipant });
  if (error) throw error;
  return (data as string | null) ?? null;
}

export async function retirerInvite(idParticipant: string): Promise<void> {
  const { error } = await supabase.rpc('retirer_invite', { id_participant: idParticipant });
  if (error) throw error;
}

// Adresse à envoyer à un invité : <site>/quotidien/invite/<jeton>. Sur le
// web, l'adresse du site courant ; sur téléphone, EXPO_PUBLIC_URL_SITE
// (adresse du site commun, ex. https://famille.netlify.app).
export function adresseInvite(jeton: string): string {
  const site =
    Platform.OS === 'web' && typeof window !== 'undefined'
      ? window.location.origin
      : (process.env.EXPO_PUBLIC_URL_SITE ?? '').replace(/\/$/, '');
  const chemin = Platform.OS === 'web' ? baseWeb() || '/quotidien' : '/quotidien';
  return `${site}${chemin}/invite/${jeton}`;
}

// Adresse de l'espace d'un enfant : <site>/quotidien/enfant/<jeton>.
export function adresseEnfant(jeton: string): string {
  return adresseInvite(jeton).replace('/invite/', '/enfant/');
}

// Jeton d'enfant lu dans l'adresse de la page (web) : …/enfant/<jeton>.
export function jetonEnfantDansAdresse(): string | null {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  const m = window.location.pathname.match(/\/enfant\/([0-9a-f-]{36})\/?$/i);
  return m ? m[1] : null;
}

// Jeton d'invité lu dans l'adresse de la page (web) : …/invite/<jeton>.
export function jetonDansAdresse(): string | null {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  const m = window.location.pathname.match(/\/invite\/([0-9a-f-]{36})\/?$/i);
  return m ? m[1] : null;
}

// ---------------------------------------------------------------------------
// Enfants
// ---------------------------------------------------------------------------

export async function listerEnfants(participants: string[]): Promise<Enfant[]> {
  if (!participants.length) return [];
  const { data, error } = await supabase
    .from('enfants')
    .select('id, participant_id, prenom')
    .in('participant_id', participants)
    .order('cree_le');
  if (error) throw error;
  return (data as Enfant[]) ?? [];
}

export async function ajouterEnfant(participantId: string, prenom: string, personneId?: string | null): Promise<void> {
  const { error } = await supabase
    .from('enfants')
    .insert({ participant_id: participantId, prenom: prenom.trim(), personne_id: personneId ?? null });
  if (error) throw error;
}

export async function retirerEnfant(id: string): Promise<void> {
  const { error } = await supabase.from('enfants').delete().eq('id', id);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Activités et séances
// ---------------------------------------------------------------------------

export async function listerActivites(groupes: string[]): Promise<Activite[]> {
  if (!groupes.length) return [];
  const { data, error } = await supabase
    .from('activites')
    .select(
      'id, groupe_id, nom, lieu, jour_semaine, heure_debut, heure_fin, date_debut, date_fin, aller_par, retour_par, aller_par_alt, retour_par_alt'
    )
    .in('groupe_id', groupes)
    .order('jour_semaine');
  if (error) throw error;
  return (data as Activite[]) ?? [];
}

// Crée l'activité puis ses séances (vacances sautées) ; renvoie le nombre de séances.
export async function creerActivite(activite: Omit<Activite, 'id'>, enfants: string[] = []): Promise<number> {
  const { data, error } = await supabase.from('activites').insert(activite).select('id').single();
  if (error) throw error;
  // Les enfants concernés sont inscrits d'office aux trajets des séances.
  if (enfants.length) {
    const { error: e1 } = await supabase
      .from('activite_enfants')
      .insert(enfants.map((enfant_id) => ({ activite_id: data.id, enfant_id })));
    if (e1) throw e1;
  }
  const { data: nb, error: e2 } = await supabase.rpc('generer_seances', { id_activite: data.id });
  if (e2) throw e2;
  return nb as number;
}

export async function supprimerActivite(id: string): Promise<void> {
  const { error } = await supabase.from('activites').delete().eq('id', id);
  if (error) throw error;
}

export async function annulerSeance(idSeance: string, annulee: boolean): Promise<void> {
  const { error } = await supabase
    .from('seances')
    .update({ statut: annulee ? 'annulee' : 'prevue' })
    .eq('id', idSeance);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Trajets
// ---------------------------------------------------------------------------

function versTrajet(l: any): Trajet {
  return {
    id: l.id,
    sens: l.sens,
    heure: l.heure,
    places: l.places,
    note: l.note,
    conducteur_id: l.conducteur_id,
    propose: !!l.propose,
    date: l.seances.date,
    statut: l.seances.statut,
    lieu: l.seances.lieu ?? l.seances.activites.lieu,
    activite: l.seances.activites.nom,
    groupe_id: l.seances.activites.groupe_id,
    enfants: (l.trajet_enfants ?? []).map((te: any) => te.enfants).filter(Boolean),
  };
}

// Trajets de tous mes groupes entre deux dates (incluses), dans l'ordre.
export async function listerTrajets(du: string, au: string): Promise<Trajet[]> {
  const { data, error } = await supabase
    .from('trajets')
    .select(
      'id, sens, heure, places, note, conducteur_id, propose, seance_id, ' +
        'seances!inner(id, date, statut, lieu, activites!inner(id, nom, lieu, groupe_id)), ' +
        'trajet_enfants(enfants(id, prenom, participant_id))'
    )
    .gte('seances.date', du)
    .lte('seances.date', au);
  if (error) throw error;
  return ((data as any[]) ?? [])
    .map(versTrajet)
    .sort((a, b) => (a.date + a.heure).localeCompare(b.date + b.heure));
}

export async function prendreTrajet(id: string, places?: number): Promise<void> {
  const { error } = await supabase.rpc('prendre_trajet', { id_trajet: id, nb_places: places ?? null });
  if (error) throw error;
}

// J'accepte le trajet que le planning m'a proposé.
export async function accepterTrajet(id: string): Promise<void> {
  const { error } = await supabase.rpc('accepter_trajet', { id_trajet: id });
  if (error) throw error;
}

// Propose un conducteur pour chaque trajet libre de la période (le parent
// qui a le moins conduit) ; renvoie le nombre de trajets proposés.
export async function proposerPlanning(idGroupe: string, du: string, au: string): Promise<number> {
  const { data, error } = await supabase.rpc('proposer_planning', { id_groupe: idGroupe, du, au });
  if (error) throw error;
  return data as number;
}

export async function laisserTrajet(id: string): Promise<void> {
  const { error } = await supabase.rpc('laisser_trajet', { id_trajet: id });
  if (error) throw error;
}

export async function modifierPlaces(id: string, places: number): Promise<void> {
  const { error } = await supabase.from('trajets').update({ places }).eq('id', id);
  if (error) throw error;
}

export async function inscrireEnfant(trajetId: string, enfantId: string, inscrire: boolean): Promise<void> {
  const requete = inscrire
    ? supabase.from('trajet_enfants').insert({ trajet_id: trajetId, enfant_id: enfantId })
    : supabase.from('trajet_enfants').delete().eq('trajet_id', trajetId).eq('enfant_id', enfantId);
  const { error } = await requete;
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Indisponibilités (le planning n'y propose pas de trajet)
// ---------------------------------------------------------------------------

export type Indisponibilite = { id: string; participant_id: string; date_debut: string; date_fin: string };

export async function listerIndisponibilites(participants: string[]): Promise<Indisponibilite[]> {
  if (!participants.length) return [];
  const { data, error } = await supabase
    .from('indisponibilites')
    .select('id, participant_id, date_debut, date_fin')
    .in('participant_id', participants)
    .gte('date_fin', aujourdHuiIso())
    .order('date_debut');
  if (error) throw error;
  return (data as Indisponibilite[]) ?? [];
}

export async function ajouterIndisponibilite(participantId: string, du: string, au: string): Promise<void> {
  const { error } = await supabase
    .from('indisponibilites')
    .insert({ participant_id: participantId, date_debut: du, date_fin: au });
  if (error) throw error;
}

export async function retirerIndisponibilite(id: string): Promise<void> {
  const { error } = await supabase.from('indisponibilites').delete().eq('id', id);
  if (error) throw error;
}

export async function equite(idGroupe: string): Promise<LigneEquite[]> {
  const { data, error } = await supabase.rpc('equite', { id_groupe: idGroupe });
  if (error) throw error;
  return ((data as any[]) ?? []).map((l) => ({ ...l, trajets: Number(l.trajets) }));
}

// ---------------------------------------------------------------------------
// Parent invité (sans compte, par jeton) — fonctions ouvertes à la clé anon
// ---------------------------------------------------------------------------

export type VueInvite = {
  moi: string;
  groupe: { id: string; nom: string };
  participants: { id: string; nom_affiche: string }[];
  mes_enfants: { id: string; prenom: string }[];
  mes_indisponibilites: { id: string; date_debut: string; date_fin: string }[];
  trajets: (Omit<Trajet, 'groupe_id'> & {})[];
};

export async function vueInvite(jeton: string): Promise<VueInvite> {
  const { data, error } = await supabase.rpc('vue_invite', { jeton_invite: jeton });
  if (error) throw error;
  return data as VueInvite;
}

export async function prendreTrajetInvite(jeton: string, idTrajet: string): Promise<void> {
  const { error } = await supabase.rpc('prendre_trajet_invite', { jeton_invite: jeton, id_trajet: idTrajet });
  if (error) throw error;
}

export async function laisserTrajetInvite(jeton: string, idTrajet: string): Promise<void> {
  const { error } = await supabase.rpc('laisser_trajet_invite', { jeton_invite: jeton, id_trajet: idTrajet });
  if (error) throw error;
}

export async function ajouterEnfantInvite(jeton: string, prenom: string): Promise<void> {
  const { error } = await supabase.rpc('ajouter_enfant_invite', { jeton_invite: jeton, prenom: prenom.trim() });
  if (error) throw error;
}

export async function inscrireEnfantInvite(jeton: string, idTrajet: string, idEnfant: string, inscrire: boolean) {
  const { error } = await supabase.rpc('inscrire_enfant_invite', {
    jeton_invite: jeton,
    id_trajet: idTrajet,
    id_enfant: idEnfant,
    inscrire,
  });
  if (error) throw error;
}

export async function ajouterIndisponibiliteInvite(jeton: string, du: string, au: string): Promise<void> {
  const { error } = await supabase.rpc('ajouter_indisponibilite_invite', { jeton_invite: jeton, du, au });
  if (error) throw error;
}

export async function retirerIndisponibiliteInvite(jeton: string, id: string): Promise<void> {
  const { error } = await supabase.rpc('retirer_indisponibilite_invite', { jeton_invite: jeton, id_indisponibilite: id });
  if (error) throw error;
}


// ---------------------------------------------------------------------------
// Activités du foyer (refonte Quotidien § 5)
// ---------------------------------------------------------------------------

// Groupe privé de mon foyer (créé au premier appel) : il porte les activités
// qui ne sont pas partagées avec d'autres familles.
export async function groupeDuFoyer(): Promise<string> {
  const { data, error } = await supabase.rpc('groupe_du_foyer');
  if (error) throw error;
  return data as string;
}

export type TrajetSemaine = {
  id: string;
  sens: 'aller' | 'retour';
  heure: string;
  propose: boolean;
  // Adulte de MON foyer qui s'en occupe (prénom jamais donné pour un autre foyer).
  responsable_id: string | null;
  responsable: string | null;
  moi: boolean;
  // Famille d'un groupe partagé qui conduit, ou participant de mon foyer.
  conducteur_id: string | null;
  conducteur: string | null;
  // Pris par mon foyer sans adulte précisé (ancien covoiturage).
  foyer: boolean | null;
  vide: boolean;
};

export type SeanceSemaine = {
  seance_id: string;
  date: string;
  heure_debut: string;
  heure_fin: string;
  statut: 'prevue' | 'annulee';
  activite_id: string;
  activite: string;
  lieu: string | null;
  groupe_id: string;
  partage: boolean;
  enfants: string[];
  trajets: TrajetSemaine[];
};

// Séances de la semaine (lundi → dimanche) de mes enfants, avec le
// responsable de chaque trajet.
export async function activitesSemaine(lundi: string): Promise<SeanceSemaine[]> {
  const { data, error } = await supabase.rpc('activites_semaine', { lundi });
  if (error) throw error;
  return (data as SeanceSemaine[]) ?? [];
}

// Qui s'occupe de ce trajet : un adulte de mon foyer (personneId), une
// famille du groupe (participantId), ou personne (aucun des deux).
export async function definirResponsable(
  idTrajet: string,
  choix: { personneId?: string | null; participantId?: string | null }
): Promise<void> {
  const { error } = await supabase.rpc('definir_responsable', {
    id_trajet: idTrajet,
    id_personne: choix.personneId ?? null,
    id_participant: choix.participantId ?? null,
  });
  if (error) throw error;
}

export async function modifierResponsablesActivite(
  idActivite: string,
  r: { aller: string | null; retour: string | null; allerAlt: string | null; retourAlt: string | null }
): Promise<void> {
  const { error } = await supabase.rpc('modifier_responsables_activite', {
    id_activite: idActivite,
    p_aller: r.aller,
    p_retour: r.retour,
    p_aller_alt: r.allerAlt,
    p_retour_alt: r.retourAlt,
  });
  if (error) throw error;
}

// Prénoms des enfants de chaque activité (clé : id de l'activité).
export async function enfantsDesActivites(ids: string[]): Promise<Record<string, string[]>> {
  if (!ids.length) return {};
  const { data, error } = await supabase
    .from('activite_enfants')
    .select('activite_id, enfants(id, prenom)')
    .in('activite_id', ids);
  if (error) throw error;
  const res: Record<string, string[]> = {};
  for (const l of (data as any[]) ?? []) {
    if (l.enfants?.prenom) (res[l.activite_id] ??= []).push(l.enfants.prenom);
  }
  return res;
}

// Enfants (inscrits dans le groupe) concernés par une activité.
export async function idsEnfantsDeActivite(idActivite: string): Promise<string[]> {
  const { data, error } = await supabase.from('activite_enfants').select('enfant_id').eq('activite_id', idActivite);
  if (error) throw error;
  return ((data as any[]) ?? []).map((l) => l.enfant_id as string);
}

// Nom et lieu d'une activité (les horaires et la période ne se changent pas :
// les séances sont déjà créées).
export async function modifierActivite(id: string, champs: { nom?: string; lieu?: string | null }): Promise<void> {
  const { error } = await supabase.from('activites').update(champs).eq('id', id);
  if (error) throw error;
}
