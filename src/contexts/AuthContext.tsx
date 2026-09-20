import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../services/supabase';
import type { Foyer } from '../types/models';

type AuthContextValue = {
  session: Session | null;
  chargement: boolean;
  foyer: Foyer | null;
  chargementFoyer: boolean;
  rafraichirFoyer: () => Promise<void>;
  deconnexion: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

// Fournit la session Supabase et le foyer courant de l'utilisateur (§3 du
// cahier des charges). Simplification Phase 1 : un utilisateur peut a priori
// appartenir à plusieurs foyers, mais on n'en affiche qu'un seul (le premier
// trouvé) — cohérent avec l'hypothèse validée d'un foyer par famille (§13).
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [chargement, setChargement] = useState(true);
  const [foyer, setFoyer] = useState<Foyer | null>(null);
  const [chargementFoyer, setChargementFoyer] = useState(false);

  const rafraichirFoyer = useCallback(async () => {
    setChargementFoyer(true);
    try {
      const { data: membre } = await supabase
        .from('foyer_membres')
        .select('foyer_id')
        .limit(1)
        .maybeSingle();

      if (!membre) {
        setFoyer(null);
        return;
      }

      const { data: foyerTrouve } = await supabase
        .from('foyers')
        .select('*')
        .eq('id', membre.foyer_id)
        .maybeSingle();

      setFoyer(foyerTrouve ?? null);
    } finally {
      setChargementFoyer(false);
    }
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setChargement(false);
    });

    const { data: abonnement } = supabase.auth.onAuthStateChange((_event, nouvelleSession) => {
      setSession(nouvelleSession);
    });

    return () => {
      abonnement.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (session) {
      rafraichirFoyer();
    } else {
      setFoyer(null);
    }
  }, [session, rafraichirFoyer]);

  const deconnexion = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  return (
    <AuthContext.Provider
      value={{ session, chargement, foyer, chargementFoyer, rafraichirFoyer, deconnexion }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth doit être utilisé à l’intérieur de <AuthProvider>');
  }
  return ctx;
}
