import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable, AppState } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { theme, creerStylesThemes } from '../theme/theme';
import { compterNonLues } from '../services/notifications';

// Cloche de l'en-tête, avec le nombre de nouveautés non lues. Le compteur se
// met à jour à chaque changement d'écran, au retour dans l'app et toutes les
// deux minutes.
export default function Cloche() {
  const navigation = useNavigation<any>();
  const [nonLues, setNonLues] = useState(0);

  const actualiser = useCallback(() => {
    compterNonLues()
      .then(setNonLues)
      .catch(() => {});
  }, []);

  useEffect(() => {
    actualiser();
    const retirerEtat = navigation.addListener('state', actualiser);
    const minuterie = setInterval(actualiser, 120000);
    const abonnement = AppState.addEventListener('change', (e) => e === 'active' && actualiser());
    return () => {
      retirerEtat();
      clearInterval(minuterie);
      abonnement.remove();
    };
  }, [navigation, actualiser]);

  return (
    <Pressable
      onPress={() => navigation.navigate('Notifications')}
      accessibilityRole="button"
      accessibilityLabel={nonLues ? `Nouveautés : ${nonLues} non lue${nonLues > 1 ? 's' : ''}` : 'Nouveautés'}
      style={styles.bouton}
    >
      <Ionicons name={nonLues ? 'notifications' : 'notifications-outline'} size={25} color={theme.colors.accent} />
      {nonLues > 0 && (
        <View style={styles.pastille}>
          <Text style={styles.nombre}>{nonLues > 9 ? '9+' : nonLues}</Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = creerStylesThemes(() => ({
  bouton: { paddingHorizontal: theme.spacing.xs, minHeight: 44, minWidth: 40, justifyContent: 'center', alignItems: 'center' },
  pastille: {
    position: 'absolute',
    top: 6,
    right: 0,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.warning,
  },
  nombre: { fontFamily: theme.fontBodyBold, fontSize: 11, color: theme.colors.background },
}));
