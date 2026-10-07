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
import { PassageConnexion } from '@apps-famille/famille';
import { AuthProvider } from './src/contexts/AuthContext';
import { PreferencesProvider, usePreferences } from './src/contexts/PreferencesContext';
import { theme, themeActuel, LARGEUR_MAX_WEB } from './src/theme/theme';
import InviteScreen from './src/screens/InviteScreen';
import { jetonDansAdresse } from './src/services/quotidien';

// Parent invité sans compte (lien …/quotidien/invite/<jeton>, web) : page
// à part, sans connexion.
const JETON_INVITE = jetonDansAdresse();

// Police des icônes. Sur le site web commun (EXPO_PUBLIC_BASE_WEB défini),
// elle est servie depuis <app>/polices/Ionicons.ttf, copiée là par
// scripts/construire-site.mjs : la copie automatique d'Expo (rangée sous
// assets/__node_modules/@expo/vector-icons/build/vendor/…) n'arrivait pas
// jusqu'au site Netlify, d'où des carrés vides à la place des icônes.
// Ailleurs (téléphones, développement), police fournie par le paquet.
const BASE_WEB = process.env.EXPO_PUBLIC_BASE_WEB;
const POLICE_ICONES: Record<string, any> =
  Platform.OS === 'web' && BASE_WEB ? { ionicons: `${BASE_WEB}/polices/Ionicons.ttf` } : Ionicons.font;

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
    ...POLICE_ICONES,
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

  const application = JETON_INVITE ? (
    <InviteScreen jeton={JETON_INVITE} />
  ) : (
    <AuthProvider>
      <AppNavigator />
      {/* Connexion transmise par une autre app de la famille (téléphone) */}
      <PassageConnexion polices={{ titre: theme.fontTitle, corps: theme.fontBody, gras: theme.fontBodyBold }} />
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
