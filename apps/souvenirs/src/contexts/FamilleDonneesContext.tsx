import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth } from './AuthContext';
import { listerPersonnes, listerPersonnesParIds, type Personne } from '../services/personnes';
import { categorieDe, listerCategories, type Categorie, type PersonneDuSouvenir } from '../services/souvenirs';

// Données de référence partagées par tous les écrans : les catégories de
// souvenirs et les personnes de la famille active (avec ou sans compte),
// chargées une fois puis à chaque changement de famille.
type Valeur = {
  categories: Categorie[];
  categorie: (code: string) => Categorie;
  personnes: Personne[]; // personnes de la famille active, par prénom
  personne: (id: string) => Personne | undefined;
  // Moi et les personnes sans compte de mon foyer (pour « J'y étais »).
  mesPersonnes: Personne[];
  // Complète la liste avec des personnes d'ailleurs (autre famille…).
  completer: (ids: string[]) => Promise<void>;
  // Ligne des prénoms d'une carte : « Sybille · avec Yann, Léo ».
  lignePrenoms: (personnes: PersonneDuSouvenir[], autres?: string[]) => string | null;
  recharger: () => Promise<void>;
};

const Contexte = createContext<Valeur | undefined>(undefined);

export function FamilleDonneesProvider({ children }: { children: React.ReactNode }) {
  const { session, famille, foyer, foyersFamille } = useAuth();
  const [categories, setCategories] = useState<Categorie[]>([]);
  const [personnes, setPersonnes] = useState<Personne[]>([]);
  const [autres, setAutres] = useState<Personne[]>([]);

  const recharger = useCallback(async () => {
    if (!session || !famille) return;
    const foyers = Array.from(new Set([...(foyersFamille ?? []), ...(foyer ? [foyer.id] : [])]));
    const [c, p] = await Promise.all([listerCategories(), listerPersonnes(foyers)]);
    setCategories(c);
    setPersonnes(p);
  }, [session, famille?.id, foyer?.id, foyersFamille]);

  useEffect(() => {
    recharger().catch(() => {});
  }, [recharger]);

  const toutes = useMemo(() => {
    const parId = new Map<string, Personne>();
    [...autres, ...personnes].forEach((p) => parId.set(p.id, p));
    return parId;
  }, [personnes, autres]);

  const completer = useCallback(
    async (ids: string[]) => {
      const manquants = ids.filter((id) => !toutes.has(id));
      if (manquants.length === 0) return;
      const trouves = await listerPersonnesParIds(manquants);
      setAutres((avant) => [...avant, ...trouves]);
    },
    [toutes]
  );

  const valeur = useMemo<Valeur>(() => {
    const moi = session?.user.id;
    const mesPersonnes = personnes.filter(
      (p) => p.utilisateur_id === moi || (!p.utilisateur_id && foyer && p.foyer_id === foyer.id)
    );
    const nom = (id: string) => toutes.get(id)?.prenom;
    const lignePrenoms = (liste: PersonneDuSouvenir[], autres: string[] = []) => {
      const principaux = liste.filter((p) => p.role === 'principal').map((p) => nom(p.personne_id)).filter(Boolean);
      const presentsFamille = liste.filter((p) => p.role === 'present').map((p) => nom(p.personne_id)).filter(Boolean);
      const presents = [...presentsFamille, ...autres];
      if (principaux.length && presents.length) return `${principaux.join(', ')} · avec ${presents.join(', ')}`;
      if (principaux.length) return principaux.join(', ');
      // Seulement des prénoms hors famille (enfants gardés…) : ce sont eux le sujet.
      if (!presentsFamille.length && autres.length) return autres.join(', ');
      return presents.length ? `Avec ${presents.join(', ')}` : null;
    };
    return {
      lignePrenoms,
      categories,
      categorie: (code) => categorieDe(categories, code),
      personnes,
      personne: (id) => toutes.get(id),
      mesPersonnes,
      completer,
      recharger,
    };
  }, [categories, personnes, toutes, session, foyer, completer, recharger]);

  return <Contexte.Provider value={valeur}>{children}</Contexte.Provider>;
}

export function useFamilleDonnees() {
  const ctx = useContext(Contexte);
  if (!ctx) throw new Error('useFamilleDonnees doit être utilisé à l’intérieur de <FamilleDonneesProvider>');
  return ctx;
}
