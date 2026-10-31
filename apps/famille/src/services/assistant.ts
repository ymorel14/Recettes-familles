import { FunctionsFetchError, FunctionsHttpError, FunctionsRelayError } from '@supabase/supabase-js';
import { schemaFamille, supabase } from './supabase';

// Appels à l'assistant (fonction Edge « ia », supabase/functions/ia) depuis
// l'app. Le téléphone n'appelle JAMAIS le modèle directement : la clé reste
// sur le serveur (spécification V1, § 1, règle 3). Les réponses sont des
// brouillons à vérifier avant d'enregistrer (règle 2).

export type CodeErreurAssistant =
  | 'non_connecte'
  | 'sans_foyer'
  | 'plafond'
  | 'refus'
  | 'illisible'
  | 'entree'
  | 'route'
  | 'configuration'
  | 'indisponible'
  | 'reseau'
  | 'annule';

export class ErreurAssistant extends Error {
  constructor(public code: CodeErreurAssistant, message: string) {
    super(message);
  }
}

// Messages de la charte (§ 7.7) quand le serveur n'en donne pas.
const MESSAGES: Record<CodeErreurAssistant, string> = {
  non_connecte: 'Reconnectez-vous pour utiliser l’assistant.',
  sans_foyer: 'L’assistant est réservé aux membres d’un foyer.',
  plafond: 'L’assistant fait une pause jusqu’au 1er du mois prochain. Tout le reste de l’app fonctionne.',
  refus: 'Je n’ai pas pu traiter ce contenu. Essayez avec un autre, ou remplissez à la main.',
  illisible: 'Je n’ai pas réussi à lire ce contenu. Essayez avec plus de lumière, ou remplissez à la main.',
  entree: 'Je n’ai pas pu traiter cette demande.',
  route: 'Cette fonction de l’assistant n’est pas encore disponible.',
  configuration: 'L’assistant n’est pas encore installé sur ce projet.',
  indisponible: 'L’assistant est momentanément indisponible. Réessayez dans un instant.',
  reseau: 'Pas de connexion. Réessayez dès le retour du réseau.',
  annule: 'Demande annulée.',
};

export function messageErreurAssistant(e: unknown): string {
  if (e instanceof ErreurAssistant) return e.message;
  return MESSAGES.indisponible;
}

// Appelle une route de l'assistant et renvoie son résultat (brouillon).
export async function appelerAssistant<T>(
  route: string,
  corps: Record<string, unknown> = {},
  options: { signal?: AbortSignal; delaiMs?: number } = {}
): Promise<T> {
  const { data, error } = await supabase.functions.invoke(`ia/${route}`, {
    body: corps,
    signal: options.signal,
    timeout: options.delaiMs ?? 60000,
  });
  if (options.signal?.aborted) throw new ErreurAssistant('annule', MESSAGES.annule);
  if (error) {
    if (error instanceof FunctionsHttpError) {
      let code: CodeErreurAssistant = 'indisponible';
      let message: string | undefined;
      try {
        const detail = await (error.context as Response).json();
        code = (detail?.erreur?.code as CodeErreurAssistant) ?? code;
        message = detail?.erreur?.message;
      } catch {
        // Réponse illisible : message générique.
      }
      if (!message && (error.context as Response)?.status === 404) code = 'configuration';
      throw new ErreurAssistant(code, message ?? MESSAGES[code] ?? MESSAGES.indisponible);
    }
    if (error instanceof FunctionsFetchError || error instanceof FunctionsRelayError) {
      throw new ErreurAssistant('reseau', MESSAGES.reseau);
    }
    throw new ErreurAssistant('indisponible', MESSAGES.indisponible);
  }
  return (data as { resultat: T }).resultat;
}

// --- Jauge du foyer (écran Moi, charte § 7.8) --------------------------------

export type JaugeAssistant = {
  pourcentage: number;
  utilise_usd: number | null; // administrateur seulement
  plafond_usd: number | null; // administrateur seulement
  administrateur: boolean;
  en_pause: boolean;
  reprise_le: string; // AAAA-MM-JJ
};

// null tant que la migration 20261020110000_famille_ia.sql n'est pas passée.
export async function lireJauge(): Promise<JaugeAssistant | null> {
  const { data, error } = await schemaFamille().rpc('ia_jauge');
  if (error) return null;
  const ligne = (data as any[])?.[0];
  if (!ligne) return null;
  return {
    pourcentage: Number(ligne.pourcentage ?? 0),
    utilise_usd: ligne.utilise_usd == null ? null : Number(ligne.utilise_usd),
    plafond_usd: ligne.plafond_usd == null ? null : Number(ligne.plafond_usd),
    administrateur: !!ligne.administrateur,
    en_pause: !!ligne.en_pause,
    reprise_le: ligne.reprise_le,
  };
}

export async function definirPlafond(dollars: number): Promise<void> {
  const { error } = await schemaFamille().rpc('ia_definir_plafond', { nouveau_plafond: dollars });
  if (error) throw error;
}

// Vérifie toute la chaîne (route « essai », moins de 0,0002 $).
export async function verifierAssistant(): Promise<{ message: string; modele: string; coutUsd: number }> {
  return appelerAssistant('essai', {});
}

// « 1er novembre »
export function dateReprise(iso: string): string {
  const [a, m, j] = iso.split('-').map(Number);
  const mois = new Date(a, m - 1, j).toLocaleDateString('fr-FR', { month: 'long' });
  return `${j === 1 ? '1er' : j} ${mois}`;
}
