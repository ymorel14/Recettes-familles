import React, { useCallback, useEffect, useState } from 'react';
import { Platform, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts, BricolageGrotesque_700Bold } from '@expo-google-fonts/bricolage-grotesque';
import {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
} from '@expo-google-fonts/plus-jakarta-sans';
import Ionicons from '@expo/vector-icons/Ionicons';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import './src/services/supabase';
// Affichage des rappels de trajets reçus app ouverte (téléphone).
import './src/modules/quotidien/services/notifications';
import { AuthProvider } from '@apps-famille/famille';
import { PreferencesProvider, usePreferences } from './src/contexts/PreferencesContext';
import { NotificationsProvider } from './src/contexts/NotificationsContext';
import { ToastProvider } from './src/composants/Toast';
import Navigation from './src/navigation/Navigation';
import { useNotificationsTelephone } from './src/services/notificationsTelephone';
import { couleurs, LARGEUR_MAX_WEB } from './src/theme/theme';

// App « Famille » (V1 de l'app unique, spécification « V1-specification-dev.md ») :
// les six apps réunies, une seule navigation, le thème « Famille » de la charte.
// Même base Supabase que les six apps actuelles, qui continuent de marcher.

const BASE_WEB = process.env.EXPO_PUBLIC_BASE_WEB;
const EST_WEB = Platform.OS === 'web';
// Police des icônes : sur le site commun, servie à une adresse simple (voir
// scripts/construire-site.mjs), comme pour les autres apps.
const POLICE_ICONES: Record<string, any> = EST_WEB && BASE_WEB ? { ionicons: `${BASE_WEB}/polices/Ionicons.ttf` } : Ionicons.font;

SplashScreen.preventAutoHideAsync().catch(() => {});

if (EST_WEB && typeof document !== 'undefined') {
  const style = document.createElement('style');
  style.textContent = `
    @supports (height: 100dvh) { html, body, #root { height: 100dvh; } }
    body { overscroll-behavior: none; }
    :focus-visible { outline: 3px solid #2F5BD3; outline-offset: 2px; }
  `;
  document.head.appendChild(style);
}

export default function App() {
  const [policesChargees, erreurPolices] = useFonts({
    BricolageGrotesque_700Bold,
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
    ...POLICE_ICONES,
  });
  const [pret, setPret] = useState(false);
  useEffect(() => {
    if (policesChargees || erreurPolices) setPret(true);
  }, [policesChargees, erreurPolices]);
  if (!pret) return null;

  return (
    <SafeAreaProvider>
      <PreferencesProvider>
        <Racine />
      </PreferencesProvider>
    </SafeAreaProvider>
  );
}

function Racine() {
  const { mode } = usePreferences();
  const onLayout = useCallback(async () => {
    await SplashScreen.hideAsync();
  }, []);

  const application = (
    <AuthProvider>
      <NotificationsProvider>
        <ToastProvider>
          <NotificationsTelephone />
          <Navigation />
        </ToastProvider>
      </NotificationsProvider>
    </AuthProvider>
  );

  return (
    <View style={{ flex: 1, backgroundColor: EST_WEB ? couleurs.segment : couleurs.fond }} onLayout={onLayout}>
      <StatusBar style={mode === 'sombre' ? 'light' : 'dark'} />
      {EST_WEB ? (
        <View style={{ flex: 1, width: '100%', maxWidth: LARGEUR_MAX_WEB, alignSelf: 'center', backgroundColor: couleurs.fond, overflow: 'hidden' }}>
          {application}
        </View>
      ) : (
        application
      )}
    </View>
  );
}

// Notifications sur le téléphone : ré-inscription et ouverture au toucher.
function NotificationsTelephone() {
  useNotificationsTelephone();
  return null;
}
