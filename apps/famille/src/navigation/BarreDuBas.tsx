import React, { useEffect, useState } from 'react';
import { Keyboard, Platform, Pressable, Text, View } from 'react-native';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Compteur, Icone } from '../composants/ui';
import { couleurs, creerStyles, hauteurs, polices } from '../theme/theme';
import { useNotifications } from '../contexts/NotificationsContext';
import { Avatar, useAuth } from '@apps-famille/famille';

// Barre du bas (charte § 6) : Accueil · Agenda · ⊕ · Activité · Moi,
// identique partout, y compris dans les modules. Les modules sont des
// onglets cachés de cette barre : quand on y est, « Accueil » reste allumé.

const ENTREES: { nom: string; libelle: string; icone: string; iconeActive: string }[] = [
  { nom: 'Accueil', libelle: 'Accueil', icone: 'home-outline', iconeActive: 'home' },
  { nom: 'Agenda', libelle: 'Agenda', icone: 'calendar-outline', iconeActive: 'calendar' },
  { nom: 'Ajouter', libelle: 'Ajouter', icone: 'add', iconeActive: 'add' },
  { nom: 'Activite', libelle: 'Activité', icone: 'notifications-outline', iconeActive: 'notifications' },
  { nom: 'Moi', libelle: 'Moi', icone: 'person-circle-outline', iconeActive: 'person-circle' },
];

export function BarreDuBas({ state, navigation, onAjouter }: BottomTabBarProps & { onAjouter: () => void }) {
  const insets = useSafeAreaInsets();
  const { nonLues } = useNotifications();
  const { session } = useAuth();
  const [clavier, setClavier] = useState(false);

  // Sur Android, la barre se cache quand le clavier est ouvert.
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const a = Keyboard.addListener('keyboardDidShow', () => setClavier(true));
    const b = Keyboard.addListener('keyboardDidHide', () => setClavier(false));
    return () => {
      a.remove();
      b.remove();
    };
  }, []);
  if (clavier) return null;

  const routeActive = state.routes[state.index]?.name;
  const actif = ENTREES.some((e) => e.nom === routeActive) ? routeActive : 'Accueil';

  return (
    <View style={[styles.barre, { paddingBottom: Math.max(insets.bottom, 8) }]} accessibilityRole="tablist">
      {ENTREES.map((e) => {
        if (e.nom === 'Ajouter') {
          return (
            <View key={e.nom} style={styles.entree}>
              <Pressable
                onPress={onAjouter}
                accessibilityRole="button"
                accessibilityLabel="Ajouter"
                style={({ pressed }) => [styles.plus, pressed && { transform: [{ scale: 0.96 }] }]}
              >
                <Icone nom="add" taille={30} couleur={couleurs.surMarque} />
              </Pressable>
            </View>
          );
        }
        const estActif = actif === e.nom;
        const couleur = estActif ? couleurs.accent : couleurs.encreInactive;
        return (
          <Pressable
            key={e.nom}
            accessibilityRole="tab"
            accessibilityState={{ selected: estActif }}
            accessibilityLabel={e.nom === 'Activite' && nonLues > 0 ? `Activité, ${nonLues} non lues` : e.libelle}
            onPress={() => {
              const route = state.routes.find((r) => r.name === e.nom);
              const evenement = route
                ? navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true })
                : null;
              if (routeActive === e.nom || evenement?.defaultPrevented) return;
              navigation.navigate(e.nom as never);
            }}
            style={styles.entree}
          >
            <View>
              {e.nom === 'Moi' && session ? (
                // Photo de profil à la place de l'icône (retour de test G-1).
                <Avatar
                  utilisateurId={session.user.id}
                  taille={26}
                  style={estActif ? { borderWidth: 2, borderColor: couleurs.encre } : undefined}
                />
              ) : (
                <Icone nom={estActif ? e.iconeActive : e.icone} taille={24} couleur={couleur} />
              )}
              {e.nom === 'Activite' ? <Compteur nombre={nonLues} style={styles.compteur} /> : null}
            </View>
            <Text style={[styles.libelle, { color: couleur }, estActif && { fontFamily: polices.texteGras }]}>{e.libelle}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = creerStyles(() => ({
  barre: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: couleurs.surface,
    borderTopWidth: 1,
    borderTopColor: couleurs.ligne,
    paddingTop: 6,
    minHeight: hauteurs.barreBas,
  },
  entree: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 3, minHeight: 48 },
  libelle: { fontFamily: polices.texteDemiGras, fontSize: 11 },
  plus: {
    width: hauteurs.plus,
    height: hauteurs.plus,
    borderRadius: 18,
    backgroundColor: couleurs.marque,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -4,
  },
  compteur: { position: 'absolute', top: -6, right: -12 },
}));
