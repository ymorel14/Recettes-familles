import React, { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  createNavigatorFactory,
  TabActions,
  TabRouter,
  useNavigationBuilder,
} from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icone } from '../composants/ui';
import { couleurs, couleursModule, creerStyles, espaces, hauteurs, margePage, polices, type IdModule } from '../theme/theme';
import { infosModule } from '../theme/jetons';

// Navigateur « onglets du haut » d'un module (spécification § 2.2) : les
// onglets de l'ancienne barre du bas passent en haut, défilables, sous
// l'en-tête teinté de la couleur du module. La barre du bas de l'app reste
// visible : jamais deux barres du bas l'une sur l'autre. Plus de lien « ‹ Accueil »
// au-dessus du titre (refonte Quotidien § 2.2) : le retour passe par la barre du bas.

export type ActionModule = {
  libelle: string;
  icone: string;
  onPress: (navigation: any) => void;
};

function OngletsModuleNavigator({
  id,
  initialRouteName,
  children,
  screenOptions,
  module,
  actions = [],
}: any) {
  const { state, navigation, descriptors, NavigationContent } = useNavigationBuilder(TabRouter, {
    id,
    initialRouteName,
    children,
    screenOptions,
  });
  const insets = useSafeAreaInsets();
  const c = couleursModule(module as IdModule);
  const infos = infosModule(module as IdModule);
  const [charges, setCharges] = useState<string[]>([state.routes[state.index].key]);
  const defilement = useRef<ScrollView>(null);
  const cleActive = state.routes[state.index].key;

  useEffect(() => {
    setCharges((avant) => (avant.includes(cleActive) ? avant : [...avant, cleActive]));
  }, [cleActive]);

  return (
    <NavigationContent>
      <View style={[styles.entete, { backgroundColor: c.fond, paddingTop: insets.top + espaces.s }]}>
        <View style={styles.ligneTitre}>
          <View style={styles.carreIcone}>
            <Icone nom={infos.icone} taille={24} couleur={c.encre} />
          </View>
          <Text style={styles.titre} accessibilityRole="header" numberOfLines={1}>
            {infos.nom}
          </Text>
          <View style={styles.actions}>
            {(actions as ActionModule[]).map((a) => (
              <Pressable
                key={a.libelle}
                onPress={() => a.onPress(navigation)}
                accessibilityRole="button"
                accessibilityLabel={a.libelle}
                style={({ pressed }) => [styles.action, pressed && { opacity: 0.7 }]}
              >
                <Icone nom={a.icone} taille={18} couleur={c.encre} />
                <Text style={[styles.actionTexte, { color: c.encre }]} numberOfLines={1}>
                  {a.libelle}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
        {state.routes.length > 1 ? (
          <ScrollView
            ref={defilement}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.onglets}
            accessibilityRole="tablist"
          >
            {state.routes.map((route: any, i: number) => {
              const actif = i === state.index;
              const titre = descriptors[route.key].options.title ?? route.name;
              return (
                <Pressable
                  key={route.key}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: actif }}
                  onPress={() => {
                    const evenement = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
                    if (!actif && !(evenement as any).defaultPrevented) {
                      navigation.dispatch({ ...TabActions.jumpTo(route.name), target: state.key });
                    }
                  }}
                  style={styles.onglet}
                >
                  <Text
                    style={[
                      styles.ongletTexte,
                      { color: actif ? couleurs.encre : couleurs.encreInactive },
                      actif && { fontFamily: polices.texteGras },
                    ]}
                  >
                    {titre}
                  </Text>
                  <View style={[styles.soulignement, { backgroundColor: actif ? c.encre : 'transparent' }]} />
                </Pressable>
              );
            })}
          </ScrollView>
        ) : (
          <View style={{ height: espaces.m }} />
        )}
      </View>
      <View style={{ flex: 1, backgroundColor: couleurs.fond }}>
        {state.routes.map((route: any, i: number) =>
          charges.includes(route.key) ? (
            <View
              key={route.key}
              style={[StyleSheet.absoluteFill, { display: i === state.index ? 'flex' : 'none' }]}
              accessibilityElementsHidden={i !== state.index}
              importantForAccessibility={i === state.index ? 'auto' : 'no-hide-descendants'}
            >
              {descriptors[route.key].render()}
            </View>
          ) : null
        )}
      </View>
    </NavigationContent>
  );
}

export const creerOngletsModule = createNavigatorFactory(OngletsModuleNavigator);

const styles = creerStyles(() => ({
  entete: { paddingHorizontal: margePage, gap: espaces.m },
  ligneTitre: { flexDirection: 'row', alignItems: 'center', gap: espaces.m },
  carreIcone: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: couleurs.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titre: { flex: 1, fontFamily: polices.titre, fontSize: 30, lineHeight: 34, letterSpacing: -0.4, color: couleurs.encre },
  actions: { flexDirection: 'row', gap: espaces.s },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 40,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: couleurs.surface,
  },
  actionTexte: { fontFamily: polices.texteGras, fontSize: 14 },
  onglets: { gap: espaces.xl, paddingRight: margePage },
  onglet: { height: hauteurs.ongletsHaut, justifyContent: 'flex-end' },
  ongletTexte: { fontFamily: polices.texteDemiGras, fontSize: 15, paddingBottom: 9 },
  soulignement: { height: 3, borderRadius: 2 },
}));
