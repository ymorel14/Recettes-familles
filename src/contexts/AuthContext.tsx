import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../services/supabase';
import type { Famille, Foyer } from '../types/models';

type AuthContextValue = {
  session: Session | null;
  chargement: boolean;
  famille: Famille | null;
  foyer: Foyer | null;
  // Vrai tant que la famille et le foyer n'ont pas été chargés une première
  // fois pour l'utilisateur connecté (évite d'afficher brièvement l'écran
  // de bienvenue à un utilisateur qui a déjà un foyer).
  chargementFoyer: boolean;
  // Famille/foyer impossibles à charger (réseau, session expirée…) : on ne
  // les considère PAS comme absents — l'écran propose de réessayer au lieu
  // d'envoyer vers "Créez votre foyer".
  erreurFoyer: string | null;
  estCreateurFamille: boolean;
  estCreateurFoyer: boolean;
  rafraichirFoyer: () => Promise<void>;
  deconnexion: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

// Fournit la session Supabase, la famille et le foyer de l'utilisateur.
// Un utilisateur appartient à une seule famille et à un seul foyer.
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [chargement, setChargement] = useState(true);
  const [famille, setFamille] = useState<Famille | null>(null);
  const [foyer, setFoyer] = useState<Foyer | null>(null);
  const [chargementFoyer, setChargementFoyer] = useState(true);
  const [erreurFoyer, setErreurFoyer] = useState<string | null>(null);
  // Numéro du dernier chargement lancé : le résultat d'un chargement plus
  // ancien (parti par exemple avec un jeton expiré) est ignoré s'il arrive
  // après un plus récent, au lieu de l'écraser.
  const numeroChargement = useRef(0);

  const utilisateurId = session?.user.id ?? null;

  // Lit la famille et le foyer de l'utilisateur. Toute erreur de requête est
  // remontée (jamais confondue avec "pas de famille / pas de foyer").
  const lireFamilleEtFoyer = useCallback(async (id: string) => {
    const [reponseFamille, reponseFoyer] = await Promise.all([
      supabase.from('famille_membres').select('famille_id').eq('utilisateur_id', id).maybeSingle(),
      supabase.from('foyer_membres').select('foyer_id').eq('utilisateur_id', id).limit(1).maybeSingle(),
    ]);
    if (reponseFamille.error) throw reponseFamille.error;
    if (reponseFoyer.error) throw reponseFoyer.error;

    const [reponseFamilleDetail, reponseFoyerDetail] = await Promise.all([
      reponseFamille.data
        ? supabase.from('familles').select('*').eq('id', reponseFamille.data.famille_id).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      reponseFoyer.data
        ? supabase.from('foyers').select('*').eq('id', reponseFoyer.data.foyer_id).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);
    if (reponseFamilleDetail.error) throw reponseFamilleDetail.error;
    if (reponseFoyerDetail.error) throw reponseFoyerDetail.error;

    return {
      famille: (reponseFamilleDetail.data as Famille | null) ?? null,
      foyer: (reponseFoyerDetail.data as Foyer | null) ?? null,
    };
  }, []);

  const rafraichirFoyer = useCallback(async () => {
    const numero = ++numeroChargement.current;
    if (!utilisateurId) {
      setFamille(null);
      setFoyer(null);
      setErreurFoyer(null);
      return;
    }
    try {
      let resultat;
      try {
        resultat = await lireFamilleEtFoyer(utilisateurId);
      } catch {
        // Souvent un jeton expiré (application rouverte après un long
        // moment) : on renouvelle la session puis on réessaie une fois.
        await supabase.auth.refreshSession().catch(() => {});
        resultat = await lireFamilleEtFoyer(utilisateurId);
      }
      if (numero !== numeroChargement.current) return; // résultat périmé
      setFamille(resultat.famille);
      setFoyer(resultat.foyer);
      setErreurFoyer(null);
    } catch (e) {
      if (numero !== numeroChargement.current) return;
      console.warn('[Auth] chargement famille/foyer impossible', e);
      setErreurFoyer(
        e && typeof e === 'object' && 'message' in e ? String((e as any).message) : 'Connexion impossible.'
      );
    }
  }, [utilisateurId, lireFamilleEtFoyer]);

  useEffect(() => {
    // La session (éventuellement renouvelée si le jeton avait expiré) arrive
    // par l'événement INITIAL_SESSION, puis à chaque connexion/déconnexion.
    const { data: abonnement } = supabase.auth.onAuthStateChange((evenement, nouvelleSession) => {
      setSession(nouvelleSession);
      if (evenement === 'INITIAL_SESSION') setChargement(false);
    });
    // Filet de sécurité si INITIAL_SESSION n'arrivait pas.
    supabase.auth.getSession().finally(() => setChargement(false));

    return () => {
      abonnement.subscription.unsubscribe();
    };
  }, []);

  // Rechargé uniquement quand l'utilisateur change (et non à chaque
  // rafraîchissement du jeton, qui produit un nouvel objet session).
  useEffect(() => {
    if (!utilisateurId) {
      numeroChargement.current += 1;
      setFamille(null);
      setFoyer(null);
      setErreurFoyer(null);
      setChargementFoyer(false);
      return;
    }
    setChargementFoyer(true);
    rafraichirFoyer().finally(() => setChargementFoyer(false));
  }, [utilisateurId, rafraichirFoyer]);

  const deconnexion = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  const estCreateurFamille = !!famille && !!utilisateurId && famille.cree_par === utilisateurId;
  const estCreateurFoyer = !!foyer && !!utilisateurId && foyer.cree_par === utilisateurId;

  return (
    <AuthContext.Provider
      value={{
        session,
        chargement,
        famille,
        foyer,
        chargementFoyer,
        erreurFoyer,
        estCreateurFamille,
        estCreateurFoyer,
        rafraichirFoyer,
        deconnexion,
      }}
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
