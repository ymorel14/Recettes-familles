import React, { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts, Cinzel_600SemiBold, Cinzel_700Bold } from '@expo-google-fonts/cinzel';
import { EBGaramond_400Regular, EBGaramond_600SemiBold } from '@expo-google-fonts/eb-garamond';
import AppNavigator from './src/navigation/AppNavigator';
import { AuthProvider } from './src/contexts/AuthContext';
import { theme } from './src/theme/theme';

SplashScreen.preventAutoHideAsync().catch(() => {
  // Ignoré : l'écran de démarrage a pu déjà être masqué (ex. rechargement web).
});

export default function App() {
  const [fontsLoaded, fontError] = useFonts({
    Cinzel_600SemiBold,
    Cinzel_700Bold,
    EBGaramond_400Regular,
    EBGaramond_600SemiBold,
  });

  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (fontsLoaded || fontError) {
      setReady(true);
    }
  }, [fontsLoaded, fontError]);

  const onLayoutRootView = useCallback(async () => {
    if (ready) {
      await SplashScreen.hideAsync();
    }
  }, [ready]);

  if (!ready) {
    return null;
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }} onLayout={onLayoutRootView}>
      <AuthProvider>
        <AppNavigator />
      </AuthProvider>
    </View>
  );
}
