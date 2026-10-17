import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../contexts/AuthContext';
import {
  listerArticles,
  listerOrdresRayons,
  listerPersonnesAvecCompte,
  listerProduits,
  listerRayons,
  obtenirListe,
  suivreArticles,
  type Article,
  type ListeResume,
  type OrdreRayons,
  type PersonneCompte,
  type Produit,
} from '../services/courses';
import { RAYONS_DEPART, ordonnerRayons, type Rayon } from '../services/rayons';

// Tout ce qu'il faut pour afficher une liste : la liste, ses articles (mis
// à jour en direct), les rayons dans MON ordre, les prénoms des personnes
// et la mémoire des produits du foyer.
export function useListe(listeId: string) {
  const { session } = useAuth();
  const moi = session?.user.id ?? null;
  const [liste, setListe] = useState<ListeResume | null>(null);
  const [articles, setArticles] = useState<Article[]>([]);
  const [rayons, setRayons] = useState<Rayon[]>(RAYONS_DEPART);
  const [ordres, setOrdres] = useState<OrdreRayons[]>([]);
  const [personnes, setPersonnes] = useState<PersonneCompte[]>([]);
  const [produits, setProduits] = useState<Produit[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const minuteur = useRef<ReturnType<typeof setTimeout> | null>(null);

  const rechargerArticles = useCallback(async () => {
    try {
      setArticles(await listerArticles(listeId));
    } catch {
      // réseau momentané : on garde ce qu'on a
    }
  }, [listeId]);

  const recharger = useCallback(async () => {
    try {
      const l = await obtenirListe(listeId);
      setListe(l);
      if (!l) {
        setErreur('Cette liste n’existe plus ou ne vous est plus partagée.');
        return;
      }
      const [a, r, o, p, prod] = await Promise.all([
        listerArticles(listeId),
        listerRayons(),
        listerOrdresRayons(listeId).catch(() => []),
        listerPersonnesAvecCompte().catch(() => []),
        listerProduits(l.foyer_id),
      ]);
      setArticles(a);
      setRayons(r);
      setOrdres(o);
      setPersonnes(p);
      setProduits(prod);
      setErreur(null);
    } catch {
      setErreur('Impossible de charger la liste. Vérifiez votre connexion.');
    } finally {
      setChargement(false);
    }
  }, [listeId]);

  useFocusEffect(
    useCallback(() => {
      recharger();
    }, [recharger])
  );

  // Temps réel : regroupe les rafales (plusieurs cases cochées d'affilée).
  useEffect(() => {
    const arreter = suivreArticles(listeId, () => {
      if (minuteur.current) clearTimeout(minuteur.current);
      minuteur.current = setTimeout(rechargerArticles, 250);
    });
    return () => {
      arreter();
      if (minuteur.current) clearTimeout(minuteur.current);
    };
  }, [listeId, rechargerArticles]);

  const monOrdre = useMemo(() => ordres.find((o) => o.utilisateurId === moi)?.rayons ?? null, [ordres, moi]);
  const rayonsOrdonnes = useMemo(() => ordonnerRayons(rayons, monOrdre), [rayons, monOrdre]);
  const parUtilisateur = useMemo(() => new Map(personnes.map((p) => [p.utilisateurId, p])), [personnes]);

  return {
    moi,
    liste,
    articles,
    setArticles,
    rayons,
    rayonsOrdonnes,
    monOrdre,
    ordres,
    setOrdres,
    personnes,
    parUtilisateur,
    produits,
    setProduits,
    chargement,
    erreur,
    recharger,
    rechargerArticles,
  };
}
