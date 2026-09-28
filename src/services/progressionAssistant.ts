import AsyncStorage from '@react-native-async-storage/async-storage';
import type { AjustementQuantites } from '../components/ReglageQuantites';

// Recette en cours dans le mode assistant, enregistrée sur cet appareil
// (retour utilisateur : pouvoir interrompre une recette et la reprendre plus
// tard, même après avoir fermé l'application). On garde les étapes cochées,
// les quantités choisies et les minuteurs en cours — ces derniers avec leur
// heure de fin, pour qu'ils continuent de s'écouler pendant l'absence.
//
// Stockage local (non partagé avec le foyer) : chacun reprend là où LUI en
// était, sur son téléphone.

export type MinuteurEnregistre = {
  id: string;
  nom: string;
  // Heure de fin (millisecondes depuis 1970).
  finA: number;
  dureeMs: number;
};

export type ProgressionAssistant = {
  recetteId: string;
  etapesCochees: string[];
  ajustement: AjustementQuantites;
  minuteurs: MinuteurEnregistre[];
  // Dernière modification (millisecondes depuis 1970).
  majLe: number;
};

const PREFIXE = 'assistant.progression.';
// Au-delà, une recette laissée en plan est oubliée.
const DUREE_CONSERVATION_MS = 7 * 24 * 60 * 60 * 1000;

function valide(p: ProgressionAssistant | null): p is ProgressionAssistant {
  return !!p && Array.isArray(p.etapesCochees) && Date.now() - p.majLe < DUREE_CONSERVATION_MS;
}

export async function lireProgression(recetteId: string): Promise<ProgressionAssistant | null> {
  try {
    const brut = await AsyncStorage.getItem(PREFIXE + recetteId);
    const p = brut ? (JSON.parse(brut) as ProgressionAssistant) : null;
    if (!valide(p)) {
      if (brut) await AsyncStorage.removeItem(PREFIXE + recetteId);
      return null;
    }
    return { ...p, minuteurs: p.minuteurs ?? [] };
  } catch {
    return null;
  }
}

export async function enregistrerProgression(p: ProgressionAssistant): Promise<void> {
  try {
    await AsyncStorage.setItem(PREFIXE + p.recetteId, JSON.stringify(p));
  } catch {
    // Échec d'enregistrement : la recette ne pourra simplement pas être reprise.
  }
}

export async function effacerProgression(recetteId: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(PREFIXE + recetteId);
  } catch {
    // Rien à faire.
  }
}

// Toutes les recettes en cours sur cet appareil, la plus récente d'abord
// (écran de choix de l'onglet Assistant).
export async function listerProgressions(): Promise<ProgressionAssistant[]> {
  try {
    const cles = (await AsyncStorage.getAllKeys()).filter((c) => c.startsWith(PREFIXE));
    if (cles.length === 0) return [];
    const paires = await AsyncStorage.multiGet(cles);
    const resultats: ProgressionAssistant[] = [];
    for (const [cle, brut] of paires) {
      try {
        const p = brut ? (JSON.parse(brut) as ProgressionAssistant) : null;
        if (valide(p)) resultats.push(p);
        else await AsyncStorage.removeItem(cle);
      } catch {
        await AsyncStorage.removeItem(cle);
      }
    }
    return resultats.sort((a, b) => b.majLe - a.majLe);
  } catch {
    return [];
  }
}

// "il y a 5 minutes", "il y a 2 heures", "hier", "il y a 3 jours".
export function formaterAnciennete(majLe: number): string {
  const minutes = Math.round((Date.now() - majLe) / 60000);
  if (minutes < 1) return "à l'instant";
  if (minutes < 60) return `il y a ${minutes} min`;
  const heures = Math.round(minutes / 60);
  if (heures < 24) return `il y a ${heures} h`;
  const jours = Math.round(heures / 24);
  return jours <= 1 ? 'hier' : `il y a ${jours} jours`;
}
