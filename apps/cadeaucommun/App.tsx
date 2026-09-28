import React, { useCallback, useEffect, useState } from 'react';
import { View, Platform } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts, Fraunces_500Medium, Fraunces_700Bold } from '@expo-google-fonts/fraunces';
import { Karla_400Regular, Karla_700Bold } from '@expo-google-fonts/karla';
import Ionicons from '@expo/vector-icons/Ionicons';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import './src/services/supabase';
import AppNavigator from './src/navigation/AppNavigator';
import { AuthProvider } from './src/contexts/AuthContext';
import { PreferencesProvider, usePreferences } from './src/contexts/PreferencesContext';
import { theme, themeActuel, LARGEUR_MAX_WEB } from './src/theme/theme';

SplashScreen.preventAutoHideAsync().catch(() => {});

const EST_WEB = Platform.OS === 'web';

// Version web sur téléphone : la hauteur suit la zone réellement visible
// (barre d'adresse du navigateur comprise), comme dans l'app Cuisine.
if (EST_WEB && typeof document !== 'undefined') {
  const style = document.createElement('style');
  style.textContent = `
    @supports (height: 100dvh) { html, body, #root { height: 100dvh; } }
    body { overscroll-behavior: none; }
  `;
  document.head.appendChild(style);
}

export default function App() {
  const [fontsLoaded, fontError] = useFonts({
    Fraunces_500Medium,
    Fraunces_700Bold,
    Karla_400Regular,
    Karla_700Bold,
    ...Ionicons.font,
  });
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (fontsLoaded || fontError) setReady(true);
  }, [fontsLoaded, fontError]);

  if (!ready) return null;

  return (
    <SafeAreaProvider>
      <PreferencesProvider>
        <Racine />
      </PreferencesProvider>
    </SafeAreaProvider>
  );
}

function Racine() {
  usePreferences(); // re-rendu à chaque changement de thème
  const onLayout = useCallback(async () => {
    await SplashScreen.hideAsync();
  }, []);

  const application = (
    <AuthProvider>
      <AppNavigator />
    </AuthProvider>
  );

  return (
    <View
      style={{ flex: 1, backgroundColor: EST_WEB ? theme.colors.surface : theme.colors.background }}
      onLayout={onLayout}
    >
      <StatusBar style={themeActuel().sombre ? 'light' : 'dark'} />
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
