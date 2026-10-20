import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { extraireMessageErreur } from '@apps-famille/famille';
import { alerte } from '../utils/alerte';
import { chargerInventaires, type DonneesInventaires } from '../services/inventaires';

// Tout l'inventaire du foyer, relu chaque fois que l'écran revient au
// premier plan (retour d'un formulaire…). null pendant le premier chargement.
export function useInventaires() {
  const [donnees, setDonnees] = useState<DonneesInventaires | null>(null);

  const recharger = useCallback(async () => {
    try {
      setDonnees(await chargerInventaires());
    } catch (e) {
      alerte('Chargement impossible', extraireMessageErreur(e, 'Veuillez réessayer.'));
      setDonnees((d) => d ?? { inventaires: [], lieux: [], contenants: [], objets: [], pretsEnCours: [] });
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      recharger();
    }, [recharger])
  );

  return { donnees, recharger };
}
