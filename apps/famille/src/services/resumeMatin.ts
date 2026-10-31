import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import { appelerAssistant } from './assistant';

// Résumé du matin sur l'accueil (spécification § 4.6.2, charte § 7.5).
// D'habitude rédigé la nuit, à moitié prix (fonction Edge ia-nuit), à partir
// de faits déjà filtrés par les règles RLS de la personne
// (famille.faits_du_jour) : l'assistant ne fait que les mettre en phrases.
// Si rien n'a été préparé (première visite), l'app le demande une fois dans
// la journée (route « resume-matin »). Le bloc « Aujourd'hui », sans
// assistant, fait foi si quelque chose change dans la journée.

export type MorceauResume = { texte: string; cible: string | null; module: string | null };
export type PhraseResume = { morceaux: MorceauResume[] };

type EtatResume = { etat: 'pret' | 'attente' | 'rien' | 'absent' | 'indisponible'; phrases: PhraseResume[] };

function jourParis(): string {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' });
}

const CLE_DEMANDE = 'famille.assistant.resume-demande';

// Lit le résumé du jour (et note la visite, pour préparer celui de demain).
async function lireResume(): Promise<EtatResume> {
  const { data, error } = await supabase.rpc('resume_du_jour');
  if (error) return { etat: 'indisponible', phrases: [] };
  const r = (data ?? {}) as { etat?: EtatResume['etat']; phrases?: PhraseResume[] };
  return { etat: r.etat ?? 'absent', phrases: Array.isArray(r.phrases) ? r.phrases : [] };
}

// Résumé à afficher, ou [] (rien à dire, pas encore prêt, assistant en
// pause ou pas installé : l'accueil s'en passe sans message).
export async function resumeDuJour(): Promise<PhraseResume[]> {
  const r = await lireResume();
  if (r.etat === 'pret') return r.phrases;
  if (r.etat !== 'absent') return [];
  // Rien de préparé cette nuit : une seule demande par jour sur ce téléphone.
  const jour = jourParis();
  try {
    if ((await AsyncStorage.getItem(CLE_DEMANDE)) === jour) return [];
    await AsyncStorage.setItem(CLE_DEMANDE, jour);
  } catch {
    // Stockage indisponible : on demande quand même (une seule rédaction
    // par jour côté serveur).
  }
  try {
    const { phrases } = await appelerAssistant<{ phrases: PhraseResume[] }>('resume-matin', {}, { delaiMs: 20000 });
    return Array.isArray(phrases) ? phrases : [];
  } catch {
    return [];
  }
}
