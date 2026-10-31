import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Interrupteur } from './ui';
import { couleurs, creerStyles, espaces, polices } from '../theme/theme';

// « Inclure … de nos familles » (retours de test R-2 et M-1) : désactivé par
// défaut (on voit ce qui est à nous), activé on voit aussi ce que partagent
// les autres foyers de nos familles, en lecture seule. Choix mémorisé sur
// l'appareil, un par écran (clé).
export function useInclureFamilles(cle: string): [boolean, (v: boolean) => void] {
  const stockage = `famille.inclureFamilles.${cle}`;
  const [valeur, setValeur] = useState(false);
  useEffect(() => {
    AsyncStorage.getItem(stockage)
      .then((v) => setValeur(v === 'true'))
      .catch(() => {});
  }, [stockage]);
  const changer = (v: boolean) => {
    setValeur(v);
    AsyncStorage.setItem(stockage, String(v)).catch(() => {});
  };
  return [valeur, changer];
}

export function InterrupteurFamilles({
  libelle,
  valeur,
  onChange,
}: {
  libelle: string;
  valeur: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <View style={styles.ligne}>
      <Text style={styles.libelle}>{libelle}</Text>
      <Interrupteur valeur={valeur} onChange={onChange} libelle={libelle} />
    </View>
  );
}

const styles = creerStyles(() => ({
  ligne: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: espaces.m, minHeight: 44 },
  libelle: { flex: 1, fontFamily: polices.texteDemiGras, fontSize: 14, color: couleurs.encre },
}));
