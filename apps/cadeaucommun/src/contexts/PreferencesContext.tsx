import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { appliquerTheme, THEME_PAR_DEFAUT, type IdTheme } from '../theme/theme';

// Réglages propres à cet appareil, enregistrés localement : pour l'instant,
// le thème de couleurs (modifiable depuis le Profil).
const CLE_THEME = 'preferences.theme';

type PreferencesContextValue = {
  themeId: IdTheme;
  definirTheme: (id: IdTheme) => void;
};

const PreferencesContext = createContext<PreferencesContextValue | undefined>(undefined);

export function PreferencesProvider({ children }: { children: React.ReactNode }) {
  const [pret, setPret] = useState(false);
  const [themeId, setThemeId] = useState<IdTheme>(THEME_PAR_DEFAUT);

  // Thème appliqué AVANT le premier affichage (sinon on verrait brièvement
  // le thème par défaut).
  useEffect(() => {
    AsyncStorage.getItem(CLE_THEME)
      .then((enregistre) => setThemeId(appliquerTheme(enregistre).id))
      .catch(() => {})
      .finally(() => setPret(true));
  }, []);

  const definirTheme = useCallback((id: IdTheme) => {
    appliquerTheme(id);
    setThemeId(id);
    AsyncStorage.setItem(CLE_THEME, id).catch(() => {});
  }, []);

  if (!pret) return null;

  return <PreferencesContext.Provider value={{ themeId, definirTheme }}>{children}</PreferencesContext.Provider>;
}

export function usePreferences() {
  const ctx = useContext(PreferencesContext);
  if (!ctx) throw new Error('usePreferences doit être utilisé à l’intérieur de <PreferencesProvider>');
  return ctx;
}
