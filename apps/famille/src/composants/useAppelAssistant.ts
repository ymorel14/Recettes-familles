import { useCallback, useEffect, useRef, useState } from 'react';
import { appelerAssistant, ErreurAssistant, messageErreurAssistant } from '../services/assistant';
import { ErreurPhoto } from '../services/photosAssistant';

export type MessageAppel = { texte: string; pause?: boolean };

// Un appel à l'assistant depuis un écran : « lecture » en cours (pour
// ChargementAssistant), « Annuler », message d'erreur de la charte (§ 7.7).
// `lancer` renvoie null si l'appel a échoué ou a été annulé.
export function useAppelAssistant() {
  const [lecture, setLecture] = useState(false);
  const [message, setMessage] = useState<MessageAppel | null>(null);
  const annulation = useRef<AbortController | null>(null);

  useEffect(() => () => annulation.current?.abort(), []);

  const lancer = useCallback(
    async <T>(route: string, preparer: () => Promise<Record<string, unknown>> | Record<string, unknown>, delaiMs = 90000): Promise<T | null> => {
      annulation.current?.abort();
      const controle = new AbortController();
      annulation.current = controle;
      setMessage(null);
      setLecture(true);
      try {
        const corps = await preparer();
        if (controle.signal.aborted) return null;
        const r = await appelerAssistant<T>(route, corps, { signal: controle.signal, delaiMs });
        return controle.signal.aborted ? null : r;
      } catch (e) {
        if (controle.signal.aborted) return null;
        if (e instanceof ErreurPhoto) setMessage({ texte: e.message });
        else setMessage({ texte: messageErreurAssistant(e), pause: e instanceof ErreurAssistant && e.code === 'plafond' });
        return null;
      } finally {
        if (annulation.current === controle) setLecture(false);
      }
    },
    []
  );

  const annuler = useCallback(() => {
    annulation.current?.abort();
    setLecture(false);
  }, []);

  return { lecture, message, setMessage, lancer, annuler };
}
