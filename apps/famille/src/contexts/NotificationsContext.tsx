import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { AppState } from 'react-native';
import { useAuth } from '@apps-famille/famille';
import {
  listerNotifications,
  marquerActionFaite as marquerActionFaiteService,
  marquerLue as marquerLueService,
  toutMarquerLu as toutMarquerLuService,
  type NotificationFamille,
} from '../services/notifications';
import { usePreferences } from './PreferencesContext';
import type { IdModule } from '../theme/jetons';

// Notifications de l'utilisateur, partagées par la barre du bas (pastille
// d'Activité), l'accueil (« À faire pour vous », pastilles des tuiles,
// « Nouveautés ») et l'écran Activité. Relues au retour de l'app au premier
// plan et toutes les 2 minutes.

type Valeur = {
  notifications: NotificationFamille[];
  nonLues: number;
  nonLuesParModule: Record<IdModule, number>;
  chargement: boolean;
  rafraichir: () => Promise<void>;
  marquerLue: (id: string) => Promise<void>;
  toutMarquerLu: (module?: IdModule) => Promise<void>;
  marquerActionFaite: (id: string) => Promise<void>;
};

const VIDE: Record<IdModule, number> = { recettes: 0, courses: 0, quotidien: 0, cadeaux: 0, voyages: 0, souvenirs: 0 };
const Contexte = createContext<Valeur | undefined>(undefined);

export function NotificationsProvider({ children }: { children: React.ReactNode }) {
  const { session } = useAuth();
  const { notificationsModules } = usePreferences();
  const [toutes, setToutes] = useState<NotificationFamille[]>([]);
  const [chargement, setChargement] = useState(true);
  const utilisateur = session?.user.id ?? null;

  const rafraichir = useCallback(async () => {
    if (!utilisateur) {
      setToutes([]);
      setChargement(false);
      return;
    }
    try {
      setToutes(await listerNotifications());
    } catch {
      // Réseau absent : on garde ce qu'on avait.
    } finally {
      setChargement(false);
    }
  }, [utilisateur]);

  useEffect(() => {
    rafraichir();
    const minuteur = setInterval(rafraichir, 120000);
    const abonnement = AppState.addEventListener('change', (etat) => etat === 'active' && rafraichir());
    return () => {
      clearInterval(minuteur);
      abonnement.remove();
    };
  }, [rafraichir]);

  const notifications = useMemo(() => toutes.filter((n) => notificationsModules[n.module] !== false), [toutes, notificationsModules]);

  const nonLuesParModule = useMemo(() => {
    const r = { ...VIDE };
    notifications.forEach((n) => {
      if (!n.lue_le && r[n.module] != null) r[n.module] += 1;
    });
    return r;
  }, [notifications]);

  const nonLues = useMemo(() => notifications.filter((n) => !n.lue_le).length, [notifications]);

  const marquerLue = useCallback(async (id: string) => {
    const maintenant = new Date().toISOString();
    setToutes((l) => l.map((n) => (n.id === id ? { ...n, lue_le: n.lue_le ?? maintenant } : n)));
    await marquerLueService(id).catch(() => {});
  }, []);

  const toutMarquerLu = useCallback(async (module?: IdModule) => {
    const maintenant = new Date().toISOString();
    setToutes((l) => l.map((n) => (!module || n.module === module ? { ...n, lue_le: n.lue_le ?? maintenant } : n)));
    await toutMarquerLuService(module).catch(() => {});
  }, []);

  const marquerActionFaite = useCallback(async (id: string) => {
    const maintenant = new Date().toISOString();
    setToutes((l) => l.map((n) => (n.id === id ? { ...n, action_faite_le: maintenant, lue_le: n.lue_le ?? maintenant } : n)));
    await marquerActionFaiteService(id).catch(() => {});
  }, []);

  return (
    <Contexte.Provider
      value={{ notifications, nonLues, nonLuesParModule, chargement, rafraichir, marquerLue, toutMarquerLu, marquerActionFaite }}
    >
      {children}
    </Contexte.Provider>
  );
}

export function useNotifications(): Valeur {
  const ctx = useContext(Contexte);
  if (!ctx) throw new Error('useNotifications doit être utilisé dans <NotificationsProvider>');
  return ctx;
}
