import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { arrondis, couleurs, creerStyles, espaces, hauteurs, polices } from '../theme/theme';
import { Icone } from './ui';

// Message en bas de l'écran (charte § 6, « Toast ») : confirme ce qui s'est
// passé, avec « Annuler » quand c'est possible. Au-dessus de la barre du bas,
// 4 secondes (6 avec « Annuler »).

type Toast = { id: number; message: string; annuler?: () => void };
type Valeur = { afficher: (message: string, options?: { annuler?: () => void }) => void };

const Contexte = createContext<Valeur>({ afficher: () => {} });

export function useToast(): Valeur {
  return useContext(Contexte);
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<Toast | null>(null);
  const minuteur = useRef<ReturnType<typeof setTimeout> | null>(null);
  const position = useRef(new Animated.Value(0)).current;
  const insets = useSafeAreaInsets();

  const fermer = useCallback(() => {
    Animated.timing(position, { toValue: 0, duration: 150, useNativeDriver: true }).start(() => setToast(null));
  }, [position]);

  const afficher = useCallback(
    (message: string, options?: { annuler?: () => void }) => {
      if (minuteur.current) clearTimeout(minuteur.current);
      setToast({ id: Date.now(), message, annuler: options?.annuler });
      AccessibilityInfo.announceForAccessibility?.(message);
      minuteur.current = setTimeout(fermer, options?.annuler ? 6000 : 4000);
    },
    [fermer]
  );

  useEffect(() => {
    if (toast) Animated.timing(position, { toValue: 1, duration: 200, useNativeDriver: true }).start();
  }, [toast, position]);

  useEffect(() => () => {
    if (minuteur.current) clearTimeout(minuteur.current);
  }, []);

  return (
    <Contexte.Provider value={{ afficher }}>
      {children}
      {toast ? (
        <Animated.View
          pointerEvents="box-none"
          style={[
            styles.conteneur,
            { bottom: hauteurs.barreBas + Math.max(insets.bottom, 8) + 12 },
            {
              opacity: position,
              transform: [{ translateY: position.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }],
            },
          ]}
        >
          <View style={styles.toast} accessibilityLiveRegion="polite">
            <Icone nom="checkmark-circle" taille={20} couleur={couleurs.succes} />
            <Text style={styles.texte} numberOfLines={2}>
              {toast.message}
            </Text>
            {toast.annuler ? (
              <Pressable
                onPress={() => {
                  toast.annuler?.();
                  fermer();
                }}
                accessibilityRole="button"
                hitSlop={10}
              >
                <Text style={styles.annuler}>Annuler</Text>
              </Pressable>
            ) : null}
          </View>
        </Animated.View>
      ) : null}
    </Contexte.Provider>
  );
}

const styles = creerStyles(() => ({
  conteneur: { position: 'absolute', left: 16, right: 16, alignItems: 'center' },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaces.m,
    maxWidth: 560,
    width: '100%',
    backgroundColor: couleurs.encre,
    borderRadius: arrondis.champ,
    paddingHorizontal: espaces.l,
    paddingVertical: 14,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  texte: { flex: 1, fontFamily: polices.texteDemiGras, fontSize: 14, color: couleurs.fond },
  annuler: { fontFamily: polices.texteGras, fontSize: 14, color: couleurs.fond, textDecorationLine: 'underline' },
}));
