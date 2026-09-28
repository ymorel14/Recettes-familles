import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { appliquerTheme, THEME_PAR_DEFAUT, type IdTheme } from '../theme/theme';

// Réglages propres à cet appareil (non partagés avec le foyer), enregistrés
// localement. Modifiables depuis l'écran Profil.

// Valeur par défaut de la lecture vocale automatique dans l'assistant de
// recette, tant que l'utilisateur ne l'a pas changée dans son Profil.
export const LECTURE_AUTO_ASSISTANT_PAR_DEFAUT = false;

const CLE_LECTURE_AUTO_ASSISTANT = 'preferences.lectureAutoAssistant';
const CLE_THEME = 'preferences.theme';

type PreferencesContextValue = {
  lectureAutoAssistant: boolean;
  definirLectureAutoAssistant: (valeur: boolean) => void;
  // Thème de couleurs choisi (voir theme.ts). Change → tout l'affichage est
  // redessiné avec les nouvelles couleurs (voir AppNavigator).
  themeId: IdTheme;
  definirTheme: (id: IdTheme) => void;
};

const PreferencesContext = createContext<PreferencesContextValue | undefined>(undefined);

export function PreferencesProvider({ children }: { children: React.ReactNode }) {
  const [pret, setPret] = useState(false);
  const [lectureAutoAssistant, setLectureAutoAssistant] = useState(LECTURE_AUTO_ASSISTANT_PAR_DEFAUT);
  const [themeId, setThemeId] = useState<IdTheme>(THEME_PAR_DEFAUT);

  // Chargement des réglages AVANT le premier affichage : le thème doit être
  // appliqué avant que les écrans ne lisent leurs couleurs (sinon on verrait
  // brièvement le thème par défaut).
  useEffect(() => {
    AsyncStorage.multiGet([CLE_LECTURE_AUTO_ASSISTANT, CLE_THEME])
      .then((valeurs) => {
        const lecture = valeurs.find(([cle]) => cle === CLE_LECTURE_AUTO_ASSISTANT)?.[1];
        const themeEnregistre = valeurs.find(([cle]) => cle === CLE_THEME)?.[1];
        if (lecture != null) setLectureAutoAssistant(lecture === 'true');
        setThemeId(appliquerTheme(themeEnregistre).id);
      })
      .catch(() => {
        // Lecture impossible : on garde les valeurs par défaut.
      })
      .finally(() => setPret(true));
  }, []);

  const definirLectureAutoAssistant = useCallback((valeur: boolean) => {
    setLectureAutoAssistant(valeur);
    AsyncStorage.setItem(CLE_LECTURE_AUTO_ASSISTANT, String(valeur)).catch(() => {
      // Échec d'enregistrement : le réglage reste valable jusqu'à la fermeture de l'app.
    });
  }, []);

  const definirTheme = useCallback((id: IdTheme) => {
    appliquerTheme(id);
    setThemeId(id);
    AsyncStorage.setItem(CLE_THEME, id).catch(() => {
      // Échec d'enregistrement : le thème reste actif jusqu'à la fermeture de l'app.
    });
  }, []);

  if (!pret) return null;

  return (
    <PreferencesContext.Provider
      value={{ lectureAutoAssistant, definirLectureAutoAssistant, themeId, definirTheme }}
    >
      {children}
    </PreferencesContext.Provider>
  );
}

export function usePreferences() {
  const ctx = useContext(PreferencesContext);
  if (!ctx) {
    throw new Error('usePreferences doit être utilisé à l’intérieur de <PreferencesProvider>');
  }
  return ctx;
}
