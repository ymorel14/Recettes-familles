import React, { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts, Cinzel_600SemiBold, Cinzel_700Bold } from '@expo-google-fonts/cinzel';
import { EBGaramond_400Regular, EBGaramond_600SemiBold } from '@expo-google-fonts/eb-garamond';
import { Caveat_600SemiBold } from '@expo-google-fonts/caveat';
import Ionicons from '@expo/vector-icons/Ionicons';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AppNavigator from './src/navigation/AppNavigator';
import { AuthProvider } from './src/contexts/AuthContext';
import { PreferencesProvider, usePreferences } from './src/contexts/PreferencesContext';
import { theme, themeActuel, EST_WEB, LARGEUR_MAX_WEB } from './src/theme/theme';

SplashScreen.preventAutoHideAsync().catch(() => {
  // Ignoré : l'écran de démarrage a pu déjà être masqué (ex. rechargement web).
});

// Version web sur téléphone : « height: 100% » correspond à la hauteur de
// l'écran SANS la barre d'adresse du navigateur, si bien que le bas de
// l'application (la barre d'onglets) passait par moments sous la barre du
// navigateur. `100dvh` suit la hauteur réellement visible, qui change quand
// la barre d'adresse apparaît ou disparaît.
if (EST_WEB && typeof document !== 'undefined') {
  const style = document.createElement('style');
  style.id = 'hauteur-visible';
  style.textContent = `
    @supports (height: 100dvh) {
      html, body, #root { height: 100dvh; }
    }
    body { overscroll-behavior: none; }
  `;
  document.head.appendChild(style);
}

export default function App() {
  const [fontsLoaded, fontError] = useFonts({
    Cinzel_600SemiBold,
    Cinzel_700Bold,
    EBGaramond_400Regular,
    EBGaramond_600SemiBold,
    Caveat_600SemiBold,
    // Police des icônes de la barre d'onglets, chargée d'avance pour éviter
    // un affichage vide au premier rendu.
    ...Ionicons.font,
  });

  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (fontsLoaded || fontError) {
      setReady(true);
    }
  }, [fontsLoaded, fontError]);

  if (!ready) {
    return null;
  }

  // Les réglages (dont le thème) sont chargés par PreferencesProvider avant
  // tout affichage ; l'écran de démarrage reste visible jusque-là.
  // SafeAreaProvider : fournit les marges des zones système (barre de gestes /
  // boutons Android, encoche et barre d'accueil iPhone) pour que la barre
  // d'onglets se place toujours au-dessus, jamais dessous.
  return (
    <SafeAreaProvider>
      <PreferencesProvider>
        <Racine />
      </PreferencesProvider>
    </SafeAreaProvider>
  );
}

// Fond de l'application et barre d'état, aux couleurs du thème choisi
// (re-rendu à chaque changement de thème, via usePreferences).
function Racine() {
  usePreferences();
  const sombre = themeActuel().sombre;

  const onLayoutRootView = useCallback(async () => {
    await SplashScreen.hideAsync();
  }, []);

  const application = (
    <AuthProvider>
      <AppNavigator />
    </AuthProvider>
  );

  // Dans un navigateur : l'application occupe une colonne centrée de largeur
  // limitée, avec des marges de chaque côté (teinte des panneaux du thème).
  // Sur téléphone : plein écran, comme avant.
  return (
    <View
      style={{ flex: 1, backgroundColor: EST_WEB ? theme.colors.surface : theme.colors.background }}
      onLayout={onLayoutRootView}
    >
      <StatusBar style={sombre ? 'light' : 'dark'} />
      {EST_WEB ? (
        <View
          style={{
            flex: 1,
            width: '100%',
            maxWidth: LARGEUR_MAX_WEB,
            alignSelf: 'center',
            backgroundColor: theme.colors.background,
            overflow: 'hidden',
          }}
        >
          {application}
        </View>
      ) : (
        application
      )}
    </View>
  );
}
