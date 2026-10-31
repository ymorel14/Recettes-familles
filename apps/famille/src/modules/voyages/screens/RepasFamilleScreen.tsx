import React from 'react';
import { ListeEvenements } from './VoyagesScreen';

// Onglet « Repas de famille » (refonte Événements § 4).
export default function RepasFamilleScreen({ navigation }: any) {
  return <ListeEvenements navigation={navigation} nature="repas" />;
}
