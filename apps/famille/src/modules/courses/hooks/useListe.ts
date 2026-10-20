import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../contexts/AuthContext';
import {
  listerArticles,
  listerContributions,
  rangerArticlesRepris,
  suivreContributions,
  listerOrdresRayons,
  listerPersonnesAvecCompte,
  listerProduits,
  listerRayons,
  obtenirListe,
  suivreArticles,
  type Article,
  type Contribution,
  type ListeResume,
  type OrdreRayons,
  type PersonneCompte,
  type Produit,
} from '../services/courses';
import { RAYONS_DEPART, ordonnerRayons, type Rayon } from '../services/rayons';
import { appliquerAttente, enregistrerCache, lireAttente, lireCache, rejouerAttente } from '../services/horsLigne';

type Cache = {
  liste: ListeResume;
  articles: Article[];
  rayons: Rayon[];
  ordres: OrdreRayons[];
  personnes: PersonneCompte[];
  produits: Produit[];
};

// Tout ce qu'il faut pour afficher une liste : la liste, ses articles (mis
// à jour en direct), les rayons dans MON ordre, les prénoms des personnes
// et la mémoire des produits du foyer. Sans réseau : la dernière version
// gardée sur le téléphone, avec les appuis en attente d'envoi.
export function useListe(listeId: string) {
  const { session } = useAuth();
  const moi = session?.user.id ?? null;
  const [liste, setListe] = useState<ListeResume | null>(null);
  const [articles, setArticles] = useState<Article[]>([]);
  const [rayons, setRayons] = useState<Rayon[]>(RAYONS_DEPART);
  const [ordres, setOrdres] = useState<OrdreRayons[]>([]);
  const [personnes, setPersonnes] = useState<PersonneCompte[]>([]);
  const [produits, setProduits] = useState<Produit[]>([]);
  // Détail par recette (ingrédients envoyés par l'app Recettes).
  const [contributions, setContributions] = useState<Contribution[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  // Affichage de la version gardée sur le téléphone (pas de réseau).
  const [horsLigne, setHorsLigne] = useState(false);
  // Appuis faits sans réseau, pas encore envoyés.
  const [enAttente, setEnAttente] = useState(0);
  const minuteur = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Articles reçus de la base, corrigés des appuis pas encore envoyés.
  const avecAttente = useCallback(
    async (a: Article[]) => {
      const attente = (await lireAttente()).filter((x) => x.listeId === listeId);
      setEnAttente(attente.length);
      return appliquerAttente(a, attente);
    },
    [listeId]
  );

  const rechargerArticles = useCallback(async () => {
    try {
      setArticles(await avecAttente(await listerArticles(listeId)));
    } catch {
      // réseau momentané : on garde ce qu'on a
    }
  }, [listeId, avecAttente]);

  const recharger = useCallback(async () => {
    try {
      const l = await obtenirListe(listeId);
      setListe(l);
      if (!l) {
        setErreur('Cette liste n’existe plus ou ne vous est plus partagée.');
        return;
      }
      let [a, r, o, p, prod, contrib] = await Promise.all([
        listerArticles(listeId),
        listerRayons(),
        listerOrdresRayons(listeId).catch(() => []),
        listerPersonnesAvecCompte().catch(() => []),
        listerProduits(l.foyer_id),
        listerContributions(listeId),
      ]);
      // Articles repris de l'ancienne liste de Recettes : rangés dans leur
      // rayon à la première ouverture.
      if (await rangerArticlesRepris(a, prod).catch(() => false)) a = await listerArticles(listeId);
      setContributions(contrib);
      setArticles(await avecAttente(a));
      setRayons(r);
      setOrdres(o);
      setPersonnes(p);
      setProduits(prod);
      setErreur(null);
      setHorsLigne(false);
      enregistrerCache<Cache>(listeId, { liste: l, articles: a, rayons: r, ordres: o, personnes: p, produits: prod });
    } catch {
      // Pas de réseau : la dernière version gardée sur le téléphone.
      const cache = await lireCache<Cache>(listeId);
      if (cache) {
        setListe(cache.liste);
        setArticles(await avecAttente(cache.articles));
        setRayons(cache.rayons);
        setOrdres(cache.ordres);
        setPersonnes(cache.personnes);
        setProduits(cache.produits);
        setHorsLigne(true);
        setErreur(null);
      } else {
        setErreur('Impossible de charger la liste. Vérifiez votre connexion.');
      }
    } finally {
      setChargement(false);
    }
  }, [listeId, avecAttente]);

  // Tant qu'on est hors ligne ou que des appuis attendent : on réessaie
  // toutes les 10 secondes d'envoyer, puis de recharger.
  useEffect(() => {
    if (!horsLigne && enAttente === 0) return;
    const minuterie = setInterval(async () => {
      const restantes = await rejouerAttente();
      setEnAttente(restantes);
      if (restantes === 0) recharger();
    }, 10000);
    return () => clearInterval(minuterie);
  }, [horsLigne, enAttente, recharger]);

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
    const arreterContributions = suivreContributions(listeId, () => {
      listerContributions(listeId).then(setContributions);
    });
    return () => {
      arreter();
      arreterContributions();
      if (minuteur.current) clearTimeout(minuteur.current);
    };
  }, [listeId, rechargerArticles]);

  const monOrdre = useMemo(() => ordres.find((o) => o.utilisateurId === moi)?.rayons ?? null, [ordres, moi]);
  const rayonsOrdonnes = useMemo(() => ordonnerRayons(rayons, monOrdre), [rayons, monOrdre]);
  const parUtilisateur = useMemo(() => new Map(personnes.map((p) => [p.utilisateurId, p])), [personnes]);
  // Photo de chaque produit du foyer (clé du produit → chemin de la photo).
  const photos = useMemo(
    () => new Map(produits.filter((p) => p.photo).map((p) => [p.cle, p.photo as string])),
    [produits]
  );

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
    photos,
    contributions,
    setContributions,
    chargement,
    erreur,
    horsLigne,
    enAttente,
    setEnAttente,
    recharger,
    rechargerArticles,
  };
}
