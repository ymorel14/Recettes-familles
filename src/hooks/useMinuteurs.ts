import { useCallback, useEffect, useRef, useState } from 'react';
import type { MinuteurEnregistre } from '../services/progressionAssistant';

// Minuteurs du mode assistant : plusieurs à la fois, chacun avec un nom
// ("Pâtes", "Four", "Étape 4"). Chaque minuteur garde son heure de fin
// plutôt qu'un compte à rebours : il reste juste même si l'écran a été mis
// en veille ou l'application fermée entre-temps.

export type Minuteur = MinuteurEnregistre & {
  // Arrivé à zéro et pas encore acquitté ("c'est bon" / bouton OK).
  sonne: boolean;
};

let compteur = 0;
function nouvelId(): string {
  compteur += 1;
  return `${Date.now().toString(36)}-${compteur}`;
}

type Options = {
  // Appelée une fois quand un minuteur arrive à zéro.
  onTermine: (minuteur: Minuteur) => void;
};

export function useMinuteurs({ onTermine }: Options) {
  const [minuteurs, setMinuteurs] = useState<Minuteur[]>([]);
  const [maintenant, setMaintenant] = useState(() => Date.now());
  const onTermineRef = useRef(onTermine);
  onTermineRef.current = onTermine;

  const enCours = minuteurs.length > 0;

  // Horloge : une mise à jour par seconde, seulement s'il y a des minuteurs.
  useEffect(() => {
    if (!enCours) return;
    setMaintenant(Date.now());
    const horloge = setInterval(() => setMaintenant(Date.now()), 1000);
    return () => clearInterval(horloge);
  }, [enCours]);

  // Passage à zéro.
  useEffect(() => {
    const termines = minuteurs.filter((m) => !m.sonne && m.finA <= maintenant);
    if (termines.length === 0) return;
    setMinuteurs((liste) => liste.map((m) => (termines.some((t) => t.id === m.id) ? { ...m, sonne: true } : m)));
    termines.forEach((m) => onTermineRef.current({ ...m, sonne: true }));
  }, [minuteurs, maintenant]);

  const ajouter = useCallback((nom: string, dureeMs: number): Minuteur => {
    const minuteur: Minuteur = { id: nouvelId(), nom, dureeMs, finA: Date.now() + dureeMs, sonne: false };
    setMinuteurs((liste) => [...liste, minuteur]);
    setMaintenant(Date.now());
    return minuteur;
  }, []);

  const retirer = useCallback((id: string) => {
    setMinuteurs((liste) => liste.filter((m) => m.id !== id));
  }, []);

  // Arrête les sonneries en cours (les minuteurs terminés disparaissent).
  const acquitter = useCallback(() => {
    setMinuteurs((liste) => liste.filter((m) => !m.sonne));
  }, []);

  // Reprise d'une recette interrompue : les minuteurs terminés pendant
  // l'absence sont signalés comme sonnant.
  const restaurer = useCallback((liste: MinuteurEnregistre[]) => {
    setMinuteurs(liste.map((m) => ({ ...m, sonne: false })));
    setMaintenant(Date.now());
  }, []);

  return { minuteurs, maintenant, ajouter, retirer, acquitter, restaurer };
}
