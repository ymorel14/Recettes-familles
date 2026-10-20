import { useCallback, useEffect, useRef, useState } from 'react';
import type { ExpoSpeechRecognitionModule as TypeModule } from 'expo-speech-recognition';

// Dictée d'une phrase (⊕, tâche dictée) avec la reconnaissance vocale du
// téléphone ou de Chrome : gratuite, rien n'est envoyé à l'assistant tant
// que la personne n'a pas validé le texte (spécification § 3.2).
// Le module natif est absent d'Expo Go : `dicteePossible` vaut alors false
// et le bouton micro est masqué.
let Reconnaissance: typeof TypeModule | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  Reconnaissance = require('expo-speech-recognition').ExpoSpeechRecognitionModule;
} catch {
  Reconnaissance = null;
}

function disponible(): boolean {
  try {
    return !!Reconnaissance?.isRecognitionAvailable();
  } catch {
    return false;
  }
}

export const dicteePossible = disponible();

export function useDictee(onTexte: (texte: string, definitif: boolean) => void) {
  const [ecoute, setEcoute] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const rappel = useRef(onTexte);
  rappel.current = onTexte;

  useEffect(() => {
    if (!Reconnaissance) return;
    const abonnements = [
      Reconnaissance.addListener('result', (ev) => {
        const texte = ev.results[0]?.transcript?.trim();
        if (texte) rappel.current(texte, ev.isFinal);
      }),
      Reconnaissance.addListener('error', (ev) => {
        if (ev.error === 'not-allowed' || ev.error === 'service-not-allowed') {
          setErreur('Accès au micro refusé. Autorisez le micro dans les réglages du téléphone.');
        } else if (ev.error !== 'no-speech' && ev.error !== 'aborted') {
          setErreur('Je n’ai pas bien entendu. Réessayez ou écrivez.');
        }
      }),
      Reconnaissance.addListener('end', () => setEcoute(false)),
    ];
    return () => {
      abonnements.forEach((a) => a.remove());
      try {
        Reconnaissance?.abort();
      } catch {
        // Déjà arrêtée.
      }
    };
  }, []);

  const demarrer = useCallback(async () => {
    if (!Reconnaissance) return;
    setErreur(null);
    try {
      const permission = await Reconnaissance.requestPermissionsAsync();
      if (!permission.granted) {
        setErreur('Accès au micro refusé. Autorisez le micro dans les réglages du téléphone.');
        return;
      }
      Reconnaissance.start({ lang: 'fr-FR', interimResults: true, continuous: false, maxAlternatives: 1 });
      setEcoute(true);
    } catch {
      setErreur('Impossible de démarrer le micro.');
    }
  }, []);

  const arreter = useCallback(() => {
    try {
      Reconnaissance?.stop();
    } catch {
      // Rien à arrêter.
    }
    setEcoute(false);
  }, []);

  return { ecoute, erreur, demarrer, arreter, possible: dicteePossible };
}
