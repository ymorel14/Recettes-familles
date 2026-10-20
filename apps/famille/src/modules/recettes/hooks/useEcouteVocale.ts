import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import type { ExpoSpeechRecognitionModule as TypeModule } from 'expo-speech-recognition';

// Écoute du micro pour les commandes vocales du mode assistant, via
// `expo-speech-recognition` (reconnaissance vocale du téléphone : gratuite,
// en français, et dans Chrome pour la version web).
//
// Ce module natif n'existe pas dans Expo Go : il faut une application
// compilée avec EAS (profil preview ou development). S'il est absent,
// `ecouteDisponible` vaut false et l'écran masque simplement le bouton micro,
// sans planter.
let Reconnaissance: typeof TypeModule | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  Reconnaissance = require('expo-speech-recognition').ExpoSpeechRecognitionModule;
} catch {
  Reconnaissance = null;
}

function moduleUtilisable(): boolean {
  if (!Reconnaissance) return false;
  try {
    return Reconnaissance.isRecognitionAvailable();
  } catch {
    return false;
  }
}

export const ecouteDisponible = moduleUtilisable();

export type EtatEcoute = 'inactive' | 'demarrage' | 'ecoute' | 'erreur';

type Options = {
  // Écoute voulue (bouton micro activé et écran affiché).
  active: boolean;
  // Mots attendus, pour aider la reconnaissance (iOS).
  motsCles: string[];
  // Appelée à chaque phrase entendue (provisoire ou définitive). Renvoie
  // true si la phrase a été traitée : on repart alors sur une nouvelle
  // écoute, pour ne pas exécuter la même commande deux fois.
  onPhrase: (texte: string, definitive: boolean) => boolean;
};

// Chaque phrase se déroule dans sa propre séance d'écoute : dès qu'une
// commande est reconnue (ou que la séance se termine après un silence), on
// relance une nouvelle séance tant que l'écoute est active. C'est le
// fonctionnement le plus fiable sur les trois plateformes (iOS, Android,
// Chrome), qui coupent toutes l'écoute d'elles-mêmes après un moment.
export function useEcouteVocale({ active, motsCles, onPhrase }: Options) {
  const [etat, setEtat] = useState<EtatEcoute>('inactive');
  const [erreur, setErreur] = useState<string | null>(null);

  const activeRef = useRef(active);
  const onPhraseRef = useRef(onPhrase);
  const motsClesRef = useRef(motsCles);
  const phraseTraitee = useRef(false);
  const erreursSuccessives = useRef(0);
  const relance = useRef<ReturnType<typeof setTimeout> | null>(null);
  onPhraseRef.current = onPhrase;
  motsClesRef.current = motsCles;

  const demarrerSeance = useCallback(() => {
    if (!Reconnaissance || !activeRef.current) return;
    phraseTraitee.current = false;
    // Android 13+ : mode continu, qui évite le "bip" du système à chaque
    // nouvelle séance. Android 12 et moins ne le connaissent pas.
    const continu = Platform.OS === 'android' && Number(Platform.Version) >= 33;
    try {
      Reconnaissance.start({
        lang: 'fr-FR',
        interimResults: true,
        continuous: continu,
        maxAlternatives: 1,
        contextualStrings: motsClesRef.current,
        // Améliore la reconnaissance des commandes d'un seul mot.
        iosTaskHint: 'confirmation',
        androidIntentOptions: { EXTRA_LANGUAGE_MODEL: 'web_search' },
        // iOS : micro + haut-parleur en même temps, sans le mode "mesure"
        // par défaut de la bibliothèque, qui baisse fortement le volume de
        // la voix de lecture des étapes.
        iosCategory: {
          category: 'playAndRecord',
          categoryOptions: ['defaultToSpeaker', 'allowBluetooth'],
          mode: 'default',
        },
      });
    } catch (e) {
      setEtat('erreur');
      setErreur("Impossible de démarrer l'écoute du micro.");
    }
  }, []);

  const planifierRelance = useCallback(() => {
    if (relance.current) clearTimeout(relance.current);
    if (!activeRef.current) return;
    // Petite pause entre deux séances, plus longue si les erreurs
    // s'enchaînent (pas de connexion, micro occupé…).
    const delai = erreursSuccessives.current > 3 ? 2000 : 250;
    relance.current = setTimeout(demarrerSeance, delai);
  }, [demarrerSeance]);

  // Abonnements aux événements du micro.
  useEffect(() => {
    if (!Reconnaissance) return;
    const abonnements = [
      Reconnaissance.addListener('start', () => {
        setEtat('ecoute');
      }),
      Reconnaissance.addListener('result', (ev) => {
        const texte = ev.results[0]?.transcript?.trim();
        if (!texte || phraseTraitee.current) return;
        erreursSuccessives.current = 0;
        const traitee = onPhraseRef.current(texte, ev.isFinal);
        if (traitee || ev.isFinal) {
          phraseTraitee.current = true;
          // On coupe cette séance ; `end` en relance aussitôt une nouvelle.
          try {
            Reconnaissance?.abort();
          } catch {
            // Déjà arrêtée.
          }
        }
      }),
      Reconnaissance.addListener('error', (ev) => {
        if (ev.error === 'not-allowed' || ev.error === 'service-not-allowed') {
          activeRef.current = false;
          setEtat('erreur');
          setErreur(
            "Accès au micro refusé. Autorisez le micro et la reconnaissance vocale pour l'application dans les réglages du téléphone."
          );
          return;
        }
        if (ev.error === 'language-not-supported') {
          activeRef.current = false;
          setEtat('erreur');
          setErreur("La reconnaissance vocale en français n'est pas disponible sur cet appareil.");
          return;
        }
        // "no-speech", "aborted", "network"… : la séance se termine, `end`
        // la relance.
        if (ev.error !== 'no-speech' && ev.error !== 'aborted') erreursSuccessives.current += 1;
      }),
      Reconnaissance.addListener('end', () => {
        if (activeRef.current) {
          planifierRelance();
        } else {
          setEtat((e) => (e === 'erreur' ? e : 'inactive'));
        }
      }),
    ];
    return () => abonnements.forEach((a) => a.remove());
  }, [planifierRelance]);

  // Marche / arrêt.
  useEffect(() => {
    activeRef.current = active;
    if (!Reconnaissance) return;
    if (!active) {
      if (relance.current) clearTimeout(relance.current);
      try {
        Reconnaissance.abort();
      } catch {
        // Rien à arrêter.
      }
      setEtat((e) => (e === 'erreur' ? e : 'inactive'));
      return;
    }
    let annule = false;
    setErreur(null);
    setEtat('demarrage');
    erreursSuccessives.current = 0;
    Reconnaissance.requestPermissionsAsync()
      .then((reponse) => {
        if (annule) return;
        if (!reponse.granted) {
          activeRef.current = false;
          setEtat('erreur');
          setErreur(
            "Accès au micro refusé. Autorisez le micro et la reconnaissance vocale pour l'application dans les réglages du téléphone."
          );
          return;
        }
        demarrerSeance();
      })
      .catch(() => {
        if (!annule) demarrerSeance();
      });
    return () => {
      annule = true;
    };
  }, [active, demarrerSeance]);

  // Arrêt complet quand l'écran disparaît.
  useEffect(
    () => () => {
      activeRef.current = false;
      if (relance.current) clearTimeout(relance.current);
      try {
        Reconnaissance?.abort();
      } catch {
        // Rien à arrêter.
      }
    },
    []
  );

  return { etat, erreur };
}
