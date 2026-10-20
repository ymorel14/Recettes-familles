import React, { useCallback, useState } from 'react';
import { Text } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { theme, creerStylesThemes } from '../theme/theme';
import { useAuth } from '../contexts/AuthContext';
import { extraireMessageErreur } from '@apps-famille/famille';
import { listeDe, obtenirMaPersonne } from '../services/wishlist';
import { Chargement } from '../components/ui';
import ListeScreen from './ListeScreen';

// Onglet "Mes envies" : MA liste, unique et permanente (créée au premier
// passage, en brouillon). La famille y réserve des cadeaux sans que je voie
// ce qui est réservé.
export default function MesEnviesScreen({ navigation }: any) {
  const { session } = useAuth();
  const [listeId, setListeId] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!session || listeId) return;
      (async () => {
        try {
          setErreur(null);
          const moi = await obtenirMaPersonne(session.user.id);
          if (!moi) return setErreur('Rejoignez d’abord votre famille pour créer votre liste.');
          setListeId(await listeDe(moi.id));
        } catch (e) {
          setErreur(extraireMessageErreur(e, 'Chargement impossible.'));
        }
      })();
    }, [session, listeId])
  );

  if (!listeId) return erreur ? <Text style={styles.erreur}>{erreur}</Text> : <Chargement />;
  return <ListeScreen route={{ params: { listeId } }} navigation={navigation} />;
}

const styles = creerStylesThemes(() => ({
  erreur: {
    fontFamily: theme.fontBody,
    fontSize: 14,
    color: theme.colors.warning,
    padding: theme.spacing.md,
    backgroundColor: theme.colors.background,
    flex: 1,
  },
}));
