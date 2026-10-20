import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { appliquerMode, modeActuel, type IdModule, type Mode } from '../theme/theme';

// Réglages propres à cet appareil (écran Moi) : apparence, lecture à voix
// haute de l'assistant de cuisine, notifications par module.
// Clés préfixées « famille. » : sur le site commun, le stockage du
// navigateur est partagé avec les six apps actuelles.
const CLE_APPARENCE = 'famille.preferences.apparence';
const CLE_LECTURE_AUTO = 'famille.preferences.lectureAutoAssistant';
const CLE_NOTIFS = 'famille.preferences.notifications';

export type Apparence = 'auto' | 'clair' | 'sombre';
export const LECTURE_AUTO_ASSISTANT_PAR_DEFAUT = false;

type Valeur = {
  apparence: Apparence;
  definirApparence: (a: Apparence) => void;
  mode: Mode;
  lectureAutoAssistant: boolean;
  definirLectureAutoAssistant: (v: boolean) => void;
  // Modules dont on veut les nouveautés (pastilles, Activité).
  notificationsModules: Record<IdModule, boolean>;
  definirNotificationModule: (id: IdModule, actif: boolean) => void;
  // Compatibilité avec le code repris des apps (clé de redessin).
  themeId: string;
};

const TOUS_ACTIFS: Record<IdModule, boolean> = {
  recettes: true,
  courses: true,
  quotidien: true,
  cadeaux: true,
  voyages: true,
  souvenirs: true,
};

const Contexte = createContext<Valeur | undefined>(undefined);

export function PreferencesProvider({ children }: { children: React.ReactNode }) {
  const systeme = useColorScheme();
  const [pret, setPret] = useState(false);
  const [apparence, setApparence] = useState<Apparence>('auto');
  const [lectureAutoAssistant, setLectureAuto] = useState(LECTURE_AUTO_ASSISTANT_PAR_DEFAUT);
  const [notificationsModules, setNotifs] = useState<Record<IdModule, boolean>>(TOUS_ACTIFS);

  useEffect(() => {
    AsyncStorage.multiGet([CLE_APPARENCE, CLE_LECTURE_AUTO, CLE_NOTIFS])
      .then((valeurs) => {
        const lire = (cle: string) => valeurs.find(([c]) => c === cle)?.[1] ?? null;
        const a = lire(CLE_APPARENCE);
        if (a === 'auto' || a === 'clair' || a === 'sombre') setApparence(a);
        const l = lire(CLE_LECTURE_AUTO);
        if (l != null) setLectureAuto(l === 'true');
        const n = lire(CLE_NOTIFS);
        if (n) {
          try {
            setNotifs({ ...TOUS_ACTIFS, ...JSON.parse(n) });
          } catch {}
        }
      })
      .catch(() => {})
      .finally(() => setPret(true));
  }, []);

  const mode: Mode = apparence === 'auto' ? (systeme === 'dark' ? 'sombre' : 'clair') : apparence;
  // Appliqué pendant le rendu, avant que les écrans ne lisent leurs couleurs.
  if (mode !== modeActuel()) appliquerMode(mode);

  const definirApparence = useCallback((a: Apparence) => {
    setApparence(a);
    AsyncStorage.setItem(CLE_APPARENCE, a).catch(() => {});
  }, []);

  const definirLectureAutoAssistant = useCallback((v: boolean) => {
    setLectureAuto(v);
    AsyncStorage.setItem(CLE_LECTURE_AUTO, String(v)).catch(() => {});
  }, []);

  const definirNotificationModule = useCallback((id: IdModule, actif: boolean) => {
    setNotifs((avant) => {
      const apres = { ...avant, [id]: actif };
      AsyncStorage.setItem(CLE_NOTIFS, JSON.stringify(apres)).catch(() => {});
      return apres;
    });
  }, []);

  const valeur = useMemo<Valeur>(
    () => ({
      apparence,
      definirApparence,
      mode,
      lectureAutoAssistant,
      definirLectureAutoAssistant,
      notificationsModules,
      definirNotificationModule,
      themeId: mode,
    }),
    [apparence, mode, lectureAutoAssistant, notificationsModules, definirApparence, definirLectureAutoAssistant, definirNotificationModule]
  );

  if (!pret) return null;
  return <Contexte.Provider value={valeur}>{children}</Contexte.Provider>;
}

export function usePreferences(): Valeur {
  const ctx = useContext(Contexte);
  if (!ctx) throw new Error('usePreferences doit être utilisé dans <PreferencesProvider>');
  return ctx;
}
