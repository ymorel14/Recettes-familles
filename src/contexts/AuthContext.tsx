import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { AppState } from 'react-native';
import type { Session } from '@supabase/supabase-js';
import { supabase, schemaFamille } from '../services/supabase';
import {
  choisirFamilleActive,
  listerFoyersFamilleActive,
  listerMesFamilles,
  type FamilleResume,
} from '../services/famille';
import type { Famille, Foyer } from '../types/models';

type AuthContextValue = {
  session: Session | null;
  chargement: boolean;
  // Famille ACTIVE (commune à toutes les apps de la famille).
  famille: Famille | null;
  // Toutes les familles de l'utilisateur (deux au plus en pratique).
  familles: FamilleResume[];
  foyer: Foyer | null;
  // Foyers de la famille active (le sien compris) : filtre des écrans
  // "Toute la famille", la base laissant lire toutes ses familles.
  foyersFamille: string[];
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
  // Change la famille active, ici et dans les autres apps de la famille.
  changerFamille: (idFamille: string) => Promise<void>;
  deconnexion: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function memeContenu(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const ensemble = new Set(a);
  return b.every((x) => ensemble.has(x));
}

// Fournit la session Supabase, la famille active et le foyer de l'utilisateur.
// Un utilisateur vit dans un seul foyer, qui peut appartenir à plusieurs
// familles ; la famille active est enregistrée en base (famille.famille_active)
// pour être la même dans toutes les apps. Elle est relue à chaque retour de
// l'app au premier plan, au cas où elle aurait été changée dans une autre app.
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [chargement, setChargement] = useState(true);
  const [famille, setFamille] = useState<Famille | null>(null);
  const [familles, setFamilles] = useState<FamilleResume[]>([]);
  const [foyer, setFoyer] = useState<Foyer | null>(null);
  const [foyersFamille, setFoyersFamille] = useState<string[]>([]);
  const [chargementFoyer, setChargementFoyer] = useState(true);
  const [erreurFoyer, setErreurFoyer] = useState<string | null>(null);
  // Numéro du dernier chargement lancé : le résultat d'un chargement plus
  // ancien (parti par exemple avec un jeton expiré) est ignoré s'il arrive
  // après un plus récent, au lieu de l'écraser.
  const numeroChargement = useRef(0);

  const utilisateurId = session?.user.id ?? null;

  // Lit les familles (dont l'active) et le foyer de l'utilisateur. Toute
  // erreur de requête est remontée (jamais confondue avec "pas de famille /
  // pas de foyer").
  const lireFamilleEtFoyer = useCallback(async (id: string) => {
    const [listeFamilles, reponseFoyer] = await Promise.all([
      listerMesFamilles(),
      schemaFamille().from('foyer_membres').select('foyer_id').eq('utilisateur_id', id).limit(1).maybeSingle(),
    ]);
    if (reponseFoyer.error) throw reponseFoyer.error;

    const active = listeFamilles.find((f) => f.active) ?? listeFamilles[0] ?? null;

    const [reponseFamilleDetail, reponseFoyerDetail, foyersActifs] = await Promise.all([
      active
        ? schemaFamille().from('familles').select('*').eq('id', active.id).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      reponseFoyer.data
        ? schemaFamille().from('foyers').select('*').eq('id', reponseFoyer.data.foyer_id).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      active ? listerFoyersFamilleActive() : Promise.resolve([] as string[]),
    ]);
    if (reponseFamilleDetail.error) throw reponseFamilleDetail.error;
    if (reponseFoyerDetail.error) throw reponseFoyerDetail.error;

    return {
      famille: (reponseFamilleDetail.data as Famille | null) ?? null,
      familles: listeFamilles,
      foyer: (reponseFoyerDetail.data as Foyer | null) ?? null,
      foyersFamille: foyersActifs,
    };
  }, []);

  const rafraichirFoyer = useCallback(async () => {
    const numero = ++numeroChargement.current;
    if (!utilisateurId) {
      setFamille(null);
      setFamilles([]);
      setFoyer(null);
      setFoyersFamille([]);
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
      setFamilles(resultat.familles);
      setFoyer(resultat.foyer);
      // Même contenu → même tableau, pour ne pas recharger les écrans qui
      // en dépendent à chaque retour au premier plan.
      setFoyersFamille((avant) =>
        memeContenu(avant, resultat.foyersFamille) ? avant : resultat.foyersFamille
      );
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
      setFamilles([]);
      setFoyer(null);
      setFoyersFamille([]);
      setErreurFoyer(null);
      setChargementFoyer(false);
      return;
    }
    setChargementFoyer(true);
    rafraichirFoyer().finally(() => setChargementFoyer(false));
  }, [utilisateurId, rafraichirFoyer]);

  // La famille active a pu être changée dans une autre app de la famille
  // (CadeauCommun…) : on la relit quand l'app revient au premier plan.
  useEffect(() => {
    if (!utilisateurId) return;
    const abonnement = AppState.addEventListener('change', (etat) => {
      if (etat === 'active') rafraichirFoyer();
    });
    return () => abonnement.remove();
  }, [utilisateurId, rafraichirFoyer]);

  const changerFamille = useCallback(
    async (idFamille: string) => {
      await choisirFamilleActive(idFamille);
      await rafraichirFoyer();
    },
    [rafraichirFoyer]
  );

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
        familles,
        foyer,
        foyersFamille,
        chargementFoyer,
        erreurFoyer,
        estCreateurFamille,
        estCreateurFoyer,
        rafraichirFoyer,
        changerFamille,
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
