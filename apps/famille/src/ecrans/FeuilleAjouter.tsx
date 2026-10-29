import React, { useEffect, useRef, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { useAuth } from '@apps-famille/famille';
import { FeuilleBas } from '../composants/FeuilleBas';
import { Bouton, Icone, PastilleModule, PuceFiltre } from '../composants/ui';
import { BandeauBrouillon, ChargementAssistant, Etincelle, MessageAssistant } from '../composants/assistant';
import { ChampAssistant } from '../composants/ChampAssistant';
import { ResultatsRecherche, ouvrirResultat } from '../composants/ResultatsRecherche';
import { executerConsigne } from '../services/consignes';
import { useFamillesVues } from '../services/familles';
import { useToast } from '../composants/Toast';
import { arrondis, couleurs, couleursModule, creerStyles, espaces, polices, texte, type IdModule } from '../theme/theme';
import { apresFermetureFeuille, navigationRef, ouvrirModule, ouvrirOngletModule } from '../navigation/navigationRef';
import { ID_SANS_CATEGORIE } from '../modules/recettes/services/recettes';
import { appelerAssistant, ErreurAssistant, messageErreurAssistant } from '../services/assistant';
import {
  ajouterArticles,
  creerEnvieProposee,
  creerSouvenirPropose,
  creerTacheProposee,
  listeVisee,
  retirerArticles,
  retirerSouvenir,
  retirerTache,
  tacheVersLigne,
  type ActionProposee,
  type ReponsePlus,
  ACTIONS_IMMEDIATES,
} from '../services/actionsAssistant';
import { listerListes, type ListeResume } from '../modules/courses/services/courses';
import { listerPersonnes } from '../modules/quotidien/services/personnes';
import { libellePlanif } from '../modules/quotidien/services/maison';
import { listeDe, listerPersonnes as personnesCadeaux, obtenirMaPersonne } from '../modules/cadeaux/services/wishlist';
import { choisirPhotos, COTE_CLASSEMENT, ErreurPhoto, photoPourAssistant, type PhotoChoisie } from '../services/photosAssistant';

// Feuille « ⊕ Ajouter » (spécification § 4.6.1, charte § 7.1 et § 7.4) :
// on dit ou écrit ce qu'on veut ajouter ; l'assistant propose une carte par
// action (couleur du module, case cochée, « Modifier ») ; RIEN n'est créé
// avant « Tout ajouter ». Puis un toast « 3 ajouts : … » avec « Annuler ».
// En dessous, les 8 raccourcis de création, sans assistant, sur une seule
// rangée (retour de test P-1) ; « Recette » ouvre un petit choix (écrire,
// photo, lien, My Recipe Box). Plus de boutons Photo / Galerie ici (P-4) :
// la photo passe par l'écran qui sait la lire.

const RACCOURCIS: { module: IdModule; titre: string; icone: string; ouvrir: () => void }[] = [
  // « Recette » : remplacé par le petit choix (voir etape 'recette').
  { module: 'recettes', titre: 'Recette', icone: 'restaurant-outline', ouvrir: () => ouvrirModule('recettes', 'CreationRecette') },
  { module: 'courses', titre: 'Courses', icone: 'cart-outline', ouvrir: () => ouvrirModule('courses', 'ListeForm') },
  // Refonte Quotidien § 2.3 : trois raccourcis à la place de « Tâche ».
  { module: 'quotidien', titre: 'Tâche maison', icone: 'checkbox-outline', ouvrir: () => ouvrirModule('quotidien', 'TacheForm', { type: 'maison' }) },
  { module: 'quotidien', titre: 'Tâche enfant', icone: 'happy-outline', ouvrir: () => ouvrirModule('quotidien', 'TacheEnfantForm') },
  { module: 'quotidien', titre: 'Activité', icone: 'football-outline', ouvrir: () => ouvrirModule('quotidien', 'ActiviteForm') },
  { module: 'cadeaux', titre: 'Envie', icone: 'heart-outline', ouvrir: () => ouvrirOngletModule('cadeaux', 'MesEnvies') },
  // Refonte Événements § 2.3 : deux raccourcis à la place de « Voyage ».
  { module: 'voyages', titre: 'Voyage', icone: 'briefcase-outline', ouvrir: () => ouvrirModule('voyages', 'NouveauVoyage', { nature: 'voyage' }) },
  { module: 'voyages', titre: 'Repas', icone: 'restaurant-outline', ouvrir: () => ouvrirModule('voyages', 'NouveauVoyage', { nature: 'repas' }) },
  { module: 'souvenirs', titre: 'Souvenir', icone: 'images-outline', ouvrir: () => ouvrirModule('souvenirs', 'SouvenirForm') },
];

// « Recette » : comment l'ajouter (retours de test P-1, R-1).
const CHOIX_RECETTE: { titre: string; detail: string; icone: string; ecran: string }[] = [
  { titre: 'L’écrire', detail: 'Titre, ingrédients, étapes', icone: 'create-outline', ecran: 'CreationRecette' },
  { titre: 'Depuis une photo', detail: 'Livre, fiche, carnet…', icone: 'camera-outline', ecran: 'ScanRecette' },
  { titre: 'Depuis un lien', detail: 'Site de recettes, vidéo', icone: 'link-outline', ecran: 'ImportWeb' },
  { titre: 'My Recipe Box', detail: 'Importer une sauvegarde', icone: 'archive-outline', ecran: 'ImportMyRecipeBox' },
];

// Le ⊕ est-il ouvert depuis le module Événements (refonte § 2.3) ? Renvoie
// l'onglet actif, qui fixe l'ordre des tuiles ; null ailleurs.
function contexteEvenements(): 'voyage' | 'repas' | null {
  if (!navigationRef.isReady()) return null;
  const noms: string[] = [];
  const parcourir = (etat: any) => {
    const r = etat?.routes?.[etat.index ?? 0];
    if (!r) return;
    noms.push(r.name);
    parcourir(r.state);
  };
  parcourir(navigationRef.getRootState());
  if (!noms.includes('Voyages')) return null;
  return noms.includes('RepasFamille') ? 'repas' : 'voyage';
}

// Catégorie de l'écran d'où le ⊕ est ouvert (retour de test R-15) : ouvert
// depuis la catégorie « Plats », une nouvelle recette y est pré-rangée.
function categorieOuverte(): string | undefined {
  if (!navigationRef.isReady()) return undefined;
  const r = navigationRef.getCurrentRoute();
  const p = r?.params as { categorieId?: string; categorieNom?: string } | undefined;
  if (r?.name !== 'RecettesCategorie' || !p?.categorieNom || p.categorieId === ID_SANS_CATEGORIE) return undefined;
  return p.categorieNom;
}

const MODULE_DE: Record<ActionProposee['type'], IdModule> = {
  courses: 'courses',
  tache: 'quotidien',
  envie: 'cadeaux',
  souvenir: 'souvenirs',
  recette: 'recettes',
  cuisiner: 'recettes',
  ouvrir: 'recettes',
  rechercher: 'recettes',
};
const NOM_MODULE: Record<IdModule, string> = {
  recettes: 'Recettes',
  courses: 'Courses',
  quotidien: 'Quotidien',
  cadeaux: 'Cadeaux',
  voyages: 'Événements',
  souvenirs: 'Souvenirs',
};

type Carte = {
  cle: string;
  action: ActionProposee;
  cochee: boolean;
  articlesCoches: boolean[];
  listeId: string | null;
  titre: string; // modifiable (tâche, envie, souvenir)
  edition: boolean;
  probleme: string | null; // tâche qui ne peut pas être créée telle quelle
};

type Etape = 'saisie' | 'lecture' | 'confirmation' | 'photo' | 'recette' | 'choixCuisine';

// ⊕ avec une photo (§ 4.6.1) : Haiku dit de quoi il s'agit, puis l'écran qui
// sait la lire s'ouvre avec la photo (lecture par Sonnet, brouillon à vérifier).
type TypePhoto = 'recette' | 'planning' | 'objet' | 'lettre' | 'autre';
const CHOIX_PHOTO: { type: Exclude<TypePhoto, 'autre'>; titre: string; module: IdModule; icone: string }[] = [
  { type: 'recette', titre: 'Une recette', module: 'recettes', icone: 'restaurant-outline' },
  { type: 'planning', titre: 'Un planning', module: 'quotidien', icone: 'calendar-outline' },
  { type: 'objet', titre: 'Un objet à offrir', module: 'cadeaux', icone: 'gift-outline' },
  { type: 'lettre', titre: 'Une lettre au Père Noël', module: 'cadeaux', icone: 'mail-outline' },
];

function dateCourte(iso: string | null): string {
  if (!iso) return '';
  const [a, m, j] = iso.split('-').map(Number);
  return new Date(a, m - 1, j).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
}

export function FeuilleAjouter({ visible, onFermer }: { visible: boolean; onFermer: () => void }) {
  const { session, foyer, famille, foyersFamille } = useAuth();
  const famillesVues = useFamillesVues();
  // « Lance ma recette de… » avec plusieurs recettes possibles (P-3).
  const [choixCuisine, setChoixCuisine] = useState<{ id: string; titre: string }[]>([]);
  const { afficher } = useToast();
  const [etape, setEtape] = useState<Etape>('saisie');
  const [saisie, setSaisie] = useState('');
  const [cartes, setCartes] = useState<Carte[]>([]);
  const [question, setQuestion] = useState<string | null>(null);
  const [erreur, setErreur] = useState<ErreurAssistant | null>(null);
  const [listes, setListes] = useState<ListeResume[]>([]);
  const [personnes, setPersonnes] = useState<{ id: string; prenom: string; utilisateur_id: string | null }[]>([]);
  const [enCours, setEnCours] = useState(false);
  const annulation = useRef<AbortController | null>(null);
  const [photo, setPhoto] = useState<PhotoChoisie | null>(null);
  const [classement, setClassement] = useState<{ type: TypePhoto; explication: string } | null>(null);
  const [enfants, setEnfants] = useState<{ id: string; prenom: string }[] | null>(null);
  // Catégorie à pré-remplir pour une nouvelle recette (R-15).
  const [categorie, setCategorie] = useState<string | undefined>(undefined);
  // Ouvert depuis Événements : la feuille ne propose que voyage / repas.
  const [contexte, setContexte] = useState<'voyage' | 'repas' | null>(null);

  useEffect(() => {
    if (visible) {
      setCategorie(categorieOuverte());
      setContexte(contexteEvenements());
    }
  }, [visible]);

  useEffect(() => {
    if (!visible || !foyer) return;
    listerListes().then(setListes).catch(() => setListes([]));
    listerPersonnes([foyer.id])
      .then((ps) => setPersonnes(ps.map((p) => ({ id: p.id, prenom: p.prenom, utilisateur_id: p.utilisateur_id }))))
      .catch(() => setPersonnes([]));
  }, [visible, foyer?.id]);

  const recommencer = () => {
    setEtape('saisie');
    setCartes([]);
    setQuestion(null);
    setErreur(null);
    setPhoto(null);
    setClassement(null);
    setEnfants(null);
  };

  const ouvrirLettre = async (enfant: { id: string; prenom: string }, p: PhotoChoisie) => {
    const listeId = await listeDe(enfant.id);
    fermer();
    apresFermetureFeuille(() => ouvrirModule('cadeaux', 'ImportLettre', { listeId, prenom: enfant.prenom, photos: [p] }));
  };

  // Ouvre l'écran qui sait lire ce type de photo.
  const aiguiller = async (type: Exclude<TypePhoto, 'autre'>, p: PhotoChoisie) => {
    setErreur(null);
    try {
      if (type === 'recette') {
        fermer();
        apresFermetureFeuille(() => ouvrirModule('recettes', 'ScanRecette', { photos: [p] }));
      } else if (type === 'planning') {
        fermer();
        apresFermetureFeuille(() => ouvrirModule('quotidien', 'ImportPlanning', { photos: [p] }));
      } else if (type === 'objet') {
        if (!session) return;
        const moi = await obtenirMaPersonne(session.user.id);
        if (!moi) throw new Error('Fiche personne introuvable.');
        const listeId = await listeDe(moi.id);
        fermer();
        apresFermetureFeuille(() => ouvrirModule('cadeaux', 'Souhait', { listeId, photo: p.uri }));
      } else {
        // Lettre : la liste d'un enfant sans compte du foyer, gérée par le parent.
        const ps = foyer ? await personnesCadeaux([foyer.id]) : [];
        const sansCompte = ps.filter((x) => !x.utilisateur_id).map((x) => ({ id: x.id, prenom: x.prenom }));
        if (sansCompte.length === 1) return ouvrirLettre(sansCompte[0], p);
        setEnfants(sansCompte);
        setClassement({ type: 'lettre', explication: '' });
        setEtape('photo');
      }
    } catch {
      setErreur(new ErreurAssistant('indisponible', 'Impossible d’ouvrir l’écran. Réessayez dans un instant.'));
      setEtape('saisie');
    }
  };

  // Classement automatique d'une photo (fonction « photo-classer »). Les
  // boutons Photo / Galerie ont quitté la feuille (P-4) ; gardé pour plus
  // tard (consigne vocale « scanne… », P-3).
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const envoyerPhoto = async (source: 'camera' | 'galerie') => {
    setErreur(null);
    setQuestion(null);
    let p: PhotoChoisie | undefined;
    try {
      [p] = await choisirPhotos(source, 1);
    } catch (e) {
      setErreur(new ErreurAssistant('entree', e instanceof ErreurPhoto ? e.message : 'Impossible d’ouvrir les photos.'));
      return;
    }
    if (!p) return;
    setPhoto(p);
    setEtape('lecture');
    const controle = new AbortController();
    annulation.current = controle;
    try {
      const petite = await photoPourAssistant(p, COTE_CLASSEMENT);
      const r = await appelerAssistant<{ type: TypePhoto; explication: string }>('photo-classer', { fichiers: [petite] }, { signal: controle.signal });
      if (controle.signal.aborted) return;
      if (r.type === 'autre') {
        setClassement(r);
        setEtape('photo');
        return;
      }
      await aiguiller(r.type, p);
    } catch (e) {
      if (controle.signal.aborted) return;
      if (e instanceof ErreurPhoto) setErreur(new ErreurAssistant('entree', e.message));
      else setErreur(e instanceof ErreurAssistant ? e : new ErreurAssistant('indisponible', messageErreurAssistant(e)));
      setEtape('saisie');
    }
  };

  const fermer = () => {
    annulation.current?.abort();
    onFermer();
    setTimeout(() => {
      recommencer();
      setSaisie('');
    }, 300);
  };

  const envoyer = async () => {
    const texteSaisi = saisie.trim();
    if (!texteSaisi) return;
    setErreur(null);
    setQuestion(null);
    setPhoto(null);
    setEtape('lecture');
    const controle = new AbortController();
    annulation.current = controle;
    try {
      const r = await appelerAssistant<ReponsePlus>('plus', { texte: texteSaisi }, { signal: controle.signal });
      if (controle.signal.aborted) return;
      // Consigne qui ouvre un écran (P-3) : exécutée tout de suite.
      const immediate = r.actions.find((a) => ACTIONS_IMMEDIATES.includes(a.type));
      if (immediate && foyer && r.actions.every((a) => ACTIONS_IMMEDIATES.includes(a.type))) {
        const issue = await executerConsigne(immediate, { foyerId: foyer.id, foyersFamille, familles: famillesVues });
        if (controle.signal.aborted) return;
        if (issue.type === 'ouvrir') {
          fermer();
          apresFermetureFeuille(() => ouvrirResultat(issue.resultat));
        } else if (issue.type === 'choisir') {
          setChoixCuisine(issue.recettes);
          setEtape('choixCuisine');
        } else if (issue.type === 'rechercher') {
          setSaisie(issue.texte);
          setEtape('saisie');
        } else {
          setQuestion(issue.texte);
          setEtape('saisie');
        }
        return;
      }
      if (!r.actions.length) {
        setQuestion(r.question ?? 'Je n’ai pas compris quoi ajouter. Pouvez-vous préciser ?');
        setEtape('saisie');
        return;
      }
      setQuestion(r.question);
      setCartes(
        r.actions.map((a, i) => {
          const probleme = a.type === 'tache' && a.tache ? tacheVersLigne(a.tache, personnes) : null;
          return {
            cle: `${i}-${a.type}`,
            action: a,
            cochee: !a.incertain && typeof probleme !== 'string',
            articlesCoches: a.articles.map((x) => !x.suggestion),
            listeId: a.type === 'courses' ? listeVisee(listes, a.liste)?.id ?? null : null,
            titre: a.tache?.libelle ?? a.envie?.titre ?? a.souvenir?.titre ?? a.resume,
            edition: false,
            probleme: typeof probleme === 'string' ? probleme : null,
          };
        })
      );
      setEtape('confirmation');
    } catch (e) {
      if (controle.signal.aborted) return;
      setErreur(e instanceof ErreurAssistant ? e : new ErreurAssistant('indisponible', messageErreurAssistant(e)));
      setEtape('saisie');
    }
  };

  const changer = (cle: string, maj: Partial<Carte>) => setCartes((cs) => cs.map((c) => (c.cle === cle ? { ...c, ...maj } : c)));

  const aAjouter = cartes.filter(
    (c) => c.cochee && (c.action.type !== 'courses' || (c.listeId && c.articlesCoches.some(Boolean)))
  );

  const toutAjouter = async () => {
    if (!session || !foyer || !famille) return;
    setEnCours(true);
    const annulations: (() => Promise<void>)[] = [];
    const faits: IdModule[] = [];
    const ratees: string[] = [];
    let recetteAOuvrir: string | null = null;
    for (const c of aAjouter) {
      const a = c.action;
      try {
        if (a.type === 'courses' && c.listeId) {
          const ids = await ajouterArticles(c.listeId, foyer.id, a.articles.filter((_x, i) => c.articlesCoches[i]));
          annulations.push(() => retirerArticles(ids));
        } else if (a.type === 'tache' && a.tache) {
          const id = await creerTacheProposee({ ...a.tache, libelle: c.titre }, foyer.id, personnes);
          annulations.push(() => retirerTache(id));
        } else if (a.type === 'envie' && a.envie) {
          await creerEnvieProposee({ ...a.envie, titre: c.titre }, session.user.id);
        } else if (a.type === 'souvenir' && a.souvenir) {
          const id = await creerSouvenirPropose({ ...a.souvenir, titre: c.titre }, famille.id, session.user.id, personnes);
          annulations.push(() => retirerSouvenir(id));
        } else if (a.type === 'recette' && a.lien) {
          recetteAOuvrir = a.lien;
        }
        faits.push(MODULE_DE[a.type]);
      } catch {
        ratees.push(c.titre);
      }
    }
    setEnCours(false);
    fermer();
    const modules = [...new Set(faits.filter((m) => m !== 'recettes'))].map((m) => NOM_MODULE[m]);
    const nb = faits.filter((m) => m !== 'recettes').length;
    if (ratees.length) {
      afficher(`Pas pu ajouter : ${ratees.join(', ')}. Réessayez dans un instant.`);
    } else if (nb > 0) {
      afficher(`${nb === 1 ? '1 ajout' : `${nb} ajouts`} : ${modules.join(', ')}`, annulations.length ? { annuler: () => annulations.forEach((f) => f()) } : undefined);
    }
    if (recetteAOuvrir) apresFermetureFeuille(() => ouvrirModule('recettes', 'ImportWeb', { url: recetteAOuvrir }));
  };

  // Ajout aux courses sans assistant (pas de réseau, pause du plafond…).
  const ajouterTelQuel = async () => {
    if (!foyer) return;
    const liste = listeVisee(listes, null);
    if (!liste) return;
    const morceaux = saisie.split(/,(?!\d)|;|\n| et /).map((s) => s.trim()).filter(Boolean);
    setEnCours(true);
    try {
      const ids = await ajouterArticles(
        liste.id,
        foyer.id,
        morceaux.map((m) => ({ libelle: m, quantite: null, unite: null, suggestion: false }))
      );
      fermer();
      afficher(`${morceaux.length === 1 ? 'Ajouté' : `${morceaux.length} articles ajoutés`} à « ${liste.nom} ».`, {
        annuler: () => retirerArticles(ids),
      });
    } catch {
      afficher('Pas de connexion. Réessayez dans un instant.');
    } finally {
      setEnCours(false);
    }
  };

  const modifierTache = (c: Carte) => {
    if (!c.action.tache) return;
    setCartes((cs) => cs.filter((x) => x.cle !== c.cle));
    if (cartes.length <= 1) fermer();
    else onFermer();
    const brouillon = { ...c.action.tache, libelle: c.titre };
    apresFermetureFeuille(() => ouvrirModule('quotidien', 'TacheForm', { brouillon }));
  };

  return (
    <FeuilleBas visible={visible} titre={etape === 'confirmation' ? 'Vérifiez avant d’ajouter' : contexte && etape === 'saisie' ? 'Ajouter dans Événements' : 'Ajouter'} onFermer={fermer}>
      {etape === 'lecture' ? (
        <ChargementAssistant
          etapes={photo ? ['Je regarde la photo…', 'Je cherche où la ranger…'] : ['Je lis votre demande…', 'Je range par module…', 'Presque fini…']}
          onAnnuler={() => {
            annulation.current?.abort();
            setEtape('saisie');
          }}
        />
      ) : null}

      {etape === 'saisie' && contexte ? (
        <>
          {(contexte === 'repas' ? (['repas', 'voyage'] as const) : (['voyage', 'repas'] as const)).map((nature) => (
            <Pressable
              key={nature}
              onPress={() => {
                fermer();
                apresFermetureFeuille(() => ouvrirModule('voyages', 'NouveauVoyage', { nature }));
              }}
              accessibilityRole="button"
              accessibilityLabel={nature === 'repas' ? 'Créer : un repas de famille' : 'Créer : un voyage'}
              style={({ pressed }) => [styles.tuileEvenement, pressed && { opacity: 0.7 }]}
            >
              <PastilleModule module="voyages" icone={nature === 'repas' ? 'restaurant-outline' : 'briefcase-outline'} taille={44} />
              <View style={{ flex: 1 }}>
                <Text style={styles.tuileEvenementTitre}>{nature === 'repas' ? 'Un repas de famille' : 'Un voyage'}</Text>
                <Text style={styles.tuileEvenementDetail}>
                  {nature === 'repas' ? 'Noël, anniversaire, dimanche chez Mamie…' : 'Une destination ou juste une période'}
                </Text>
              </View>
              <Icone nom="chevron-forward" taille={20} couleur={couleurs.encreDouce} />
            </Pressable>
          ))}
          <Bouton variante="lien" titre="Autre chose (assistant, recette, courses…)" onPress={() => setContexte(null)} />
        </>
      ) : null}

      {etape === 'saisie' && !contexte ? (
        <>
          {/* Un seul champ (P-1) : on cherche pendant la frappe (P-2), « Entrée »
              ou le bouton envoie la phrase à l'assistant ; grand bouton
              « Assistant » pour parler (P-3). */}
          <ChampAssistant
            valeur={saisie}
            onChange={setSaisie}
            onValider={envoyer}
            placeholder="Rechercher ou demander… (« lance le bourguignon »)"
            grandMicro
          />
          {question ? (
            <View style={styles.question}>
              <Etincelle />
              <Text style={styles.questionTexte}>{question}</Text>
            </View>
          ) : null}
          {erreur ? (
            <MessageAssistant
              message={erreur.message}
              pause={erreur.code === 'plafond'}
              onReessayer={erreur.code === 'reseau' || erreur.code === 'indisponible' ? envoyer : undefined}
            />
          ) : null}
          {erreur && listes.length ? (
            <Bouton variante="secondaire" petit icone="cart-outline" titre="Ajouter aux courses tel quel" onPress={ajouterTelQuel} enCours={enCours} />
          ) : null}
          {saisie.trim() ? (
            <Bouton titre="Envoyer à l’assistant" icone="arrow-up" onPress={envoyer} />
          ) : null}
          {saisie.trim().length >= 2 && !erreur && !question ? (
            <ResultatsRecherche
              texte={saisie}
              onOuvrir={(r) => {
                fermer();
                apresFermetureFeuille(() => ouvrirResultat(r));
              }}
            />
          ) : null}

          <Text style={styles.sousTitre}>Créer</Text>
          {/* 9 raccourcis : une rangée de 5 et une de 4. */}
          {[RACCOURCIS.slice(0, 5), RACCOURCIS.slice(5)].map((rangee, numero) => (
          <View key={numero} style={styles.rangee}>
            {rangee.map((r) => (
              <Pressable
                key={r.titre}
                onPress={() => {
                  if (r.module === 'recettes') return setEtape('recette');
                  fermer();
                  apresFermetureFeuille(r.ouvrir);
                }}
                accessibilityRole="button"
                accessibilityLabel={`Créer : ${r.titre}`}
                style={({ pressed }) => [styles.raccourciCompact, pressed && { opacity: 0.7 }]}
              >
                <PastilleModule module={r.module} icone={r.icone} taille={44} />
                <Text style={styles.raccourciCompactTexte} numberOfLines={1}>
                  {r.titre}
                </Text>
              </Pressable>
            ))}
          </View>
          ))}
        </>
      ) : null}

      {etape === 'recette' ? (
        <>
          <Text style={styles.sousTitre}>Nouvelle recette{categorie ? ` · ${categorie}` : ''}</Text>
          <View style={{ gap: espaces.s }}>
            {CHOIX_RECETTE.map((c) => (
              <Pressable
                key={c.ecran}
                onPress={() => {
                  fermer();
                  apresFermetureFeuille(() =>
                    ouvrirModule(
                      'recettes',
                      c.ecran,
                      c.ecran === 'CreationRecette' && categorie ? { categoriePreselectionnee: categorie } : undefined
                    )
                  );
                }}
                accessibilityRole="button"
                style={({ pressed }) => [styles.raccourci, styles.choixRecette, pressed && { opacity: 0.8 }]}
              >
                <PastilleModule module="recettes" icone={c.icone} taille={40} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.raccourciTexte}>{c.titre}</Text>
                  <Text style={styles.carteDetail}>{c.detail}</Text>
                </View>
              </Pressable>
            ))}
          </View>
          <Bouton variante="lien" titre="Retour" onPress={() => setEtape('saisie')} />
        </>
      ) : null}

      {etape === 'photo' && photo ? (
        <>
          {classement?.type === 'lettre' ? (
            enfants && enfants.length ? (
              <>
                <Text style={styles.questionTexte}>La lettre de qui ?</Text>
                <View style={styles.choixPhoto}>
                  {enfants.map((e) => (
                    <PuceFiltre key={e.id} libelle={e.prenom} actif={false} onPress={() => ouvrirLettre(e, photo)} />
                  ))}
                </View>
              </>
            ) : (
              <MessageAssistant message="Aucun enfant sans compte dans votre foyer. Ajoutez-le dans Moi › Famille, puis ouvrez sa liste dans Cadeaux." />
            )
          ) : (
            <>
              <View style={styles.question}>
                <Etincelle />
                <Text style={styles.questionTexte}>
                  {`Je ne sais pas quoi faire de cette photo${classement?.explication ? ` (${classement.explication.replace(/\.$/, '')})` : ''}. Qu’est-ce que c’est ?`}
                </Text>
              </View>
              <View style={styles.grille}>
                {CHOIX_PHOTO.map((ch) => (
                  <Pressable
                    key={ch.type}
                    onPress={() => aiguiller(ch.type, photo)}
                    accessibilityRole="button"
                    style={({ pressed }) => [styles.raccourci, pressed && { opacity: 0.8 }]}
                  >
                    <PastilleModule module={ch.module} icone={ch.icone} taille={40} />
                    <Text style={styles.raccourciTexte} numberOfLines={2}>
                      {ch.titre}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </>
          )}
          <Bouton variante="secondaire" titre="Annuler" onPress={recommencer} />
        </>
      ) : null}

      {etape === 'choixCuisine' ? (
        <>
          <Text style={styles.sousTitre}>Quelle recette ?</Text>
          <View style={{ gap: espaces.s }}>
            {choixCuisine.map((r) => (
              <Pressable
                key={r.id}
                onPress={() => {
                  fermer();
                  apresFermetureFeuille(() => ouvrirModule('recettes', 'AssistantRecette', { recetteId: r.id }));
                }}
                accessibilityRole="button"
                style={({ pressed }) => [styles.raccourci, styles.choixRecette, pressed && { opacity: 0.8 }]}
              >
                <PastilleModule module="recettes" icone="restaurant-outline" taille={40} />
                <Text style={styles.raccourciTexte}>{r.titre}</Text>
              </Pressable>
            ))}
          </View>
          <Bouton variante="lien" titre="Retour" onPress={() => setEtape('saisie')} />
        </>
      ) : null}

      {etape === 'confirmation' ? (
        <>
          <BandeauBrouillon />
          <Text style={styles.rappel} numberOfLines={2}>
            « {saisie.trim()} »
          </Text>
          {cartes.map((c) => (
            <CarteAction
              key={c.cle}
              carte={c}
              listes={listes}
              onChanger={(maj) => changer(c.cle, maj)}
              onModifierTache={() => modifierTache(c)}
            />
          ))}
          {question ? (
            <View style={styles.question}>
              <Etincelle />
              <Text style={styles.questionTexte}>{question}</Text>
            </View>
          ) : null}
          <Bouton
            titre={aAjouter.length > 1 ? `Tout ajouter (${aAjouter.length})` : aAjouter.length === 1 ? 'Ajouter' : 'Rien à ajouter'}
            onPress={toutAjouter}
            enCours={enCours}
            desactive={aAjouter.length === 0}
          />
          <Bouton variante="secondaire" titre="Modifier ma phrase" onPress={recommencer} />
        </>
      ) : null}
    </FeuilleBas>
  );
}

// Une carte par action proposée (charte § 7.4).
function CarteAction({
  carte: c,
  listes,
  onChanger,
  onModifierTache,
}: {
  carte: Carte;
  listes: ListeResume[];
  onChanger: (maj: Partial<Carte>) => void;
  onModifierTache: () => void;
}) {
  const a = c.action;
  const module = MODULE_DE[a.type];
  const m = couleursModule(module);
  const liste = listes.find((l) => l.id === c.listeId);

  let entete = NOM_MODULE[module];
  let detail: string | null = null;
  if (a.type === 'courses') entete = `Courses · ${liste?.nom ?? 'liste à choisir'}`;
  if (a.type === 'tache' && a.tache) {
    const ligne = tacheVersLigne({ ...a.tache, libelle: c.titre || 'x' }, []);
    detail = typeof ligne === 'string' ? ligne : libellePlanif({ planif: ligne.planif, recurrence: ligne.recurrence, debut: ligne.periode_debut, fin: ligne.periode_fin }) || 'Une fois, sans date';
    if (a.tache.pour.length) detail += ` · pour ${a.tache.pour.join(', ')}`;
  }
  if (a.type === 'envie') entete = 'Cadeaux · Mes envies';
  if (a.type === 'envie' && a.envie?.prix != null) detail = `≈ ${a.envie.prix.toLocaleString('fr-FR')} €`;
  if (a.type === 'souvenir' && a.souvenir) detail = [dateCourte(a.souvenir.date) || 'Aujourd’hui', a.souvenir.personnes.join(', ')].filter(Boolean).join(' · ');
  if (a.type === 'recette') {
    entete = 'Recettes · importer';
    detail = a.lien;
  }
  const aVerifier = a.type === 'tache' && (a.tache?.a_verifier.length ?? 0) > 0;

  return (
    <View style={[styles.carte, !c.cochee && styles.carteDecochee]}>
      <View style={styles.carteLigne}>
        <PastilleModule module={module} taille={40} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={[styles.carteEntete, { color: m.encre }]}>{entete}</Text>
          {a.type !== 'courses' ? (
            c.edition ? (
              <TextInput
                value={c.titre}
                onChangeText={(t) => onChanger({ titre: t })}
                style={styles.carteChamp}
                autoFocus
                onBlur={() => onChanger({ edition: false })}
                accessibilityLabel="Modifier"
              />
            ) : (
              <Text style={styles.carteTitre}>{a.type === 'recette' ? a.resume : c.titre}</Text>
            )
          ) : null}
          {detail ? <Text style={[styles.carteDetail, (c.probleme || aVerifier) && { color: couleurs.attention }]}>{detail}</Text> : null}
          {a.incertain ? <Text style={styles.incertain}>Suggestion de l’assistant : à vous de voir</Text> : null}
        </View>
        <Pressable
          onPress={() => onChanger({ cochee: !c.cochee })}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: c.cochee }}
          accessibilityLabel={`${entete} ${c.titre}`}
          hitSlop={8}
          style={[styles.caseACocher, c.cochee && { backgroundColor: couleurs.succes, borderColor: couleurs.succes }]}
        >
          {c.cochee ? <Icone nom="checkmark" taille={18} couleur="#FFFFFF" /> : null}
        </Pressable>
      </View>

      {a.type === 'courses' ? (
        <View style={styles.articles}>
          {a.articles.map((x, i) => {
            const coche = c.articlesCoches[i];
            const libelle = [x.quantite != null ? `${x.quantite}${x.unite ? ` ${x.unite}` : ''}` : '', x.libelle].filter(Boolean).join(' ');
            return (
              <Pressable
                key={`${x.libelle}-${i}`}
                onPress={() => onChanger({ articlesCoches: c.articlesCoches.map((v, j) => (j === i ? !v : v)) })}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: coche }}
                style={[styles.article, coche ? { backgroundColor: m.fond, borderColor: m.fond } : null]}
              >
                <Icone nom={coche ? 'checkmark-circle' : 'ellipse-outline'} taille={16} couleur={coche ? m.encre : couleurs.encreDouce} />
                <Text style={[styles.articleTexte, coche && { color: m.encre }]}>{libelle}</Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      {a.type === 'courses' && c.edition && listes.length > 1 ? (
        <View style={styles.articles}>
          {listes.map((l) => (
            <PuceFiltre key={l.id} libelle={l.nom} actif={l.id === c.listeId} onPress={() => onChanger({ listeId: l.id, edition: false })} />
          ))}
        </View>
      ) : null}

      {a.type !== 'recette' && !(a.type === 'courses' && listes.length < 2) ? (
        <Pressable
          onPress={() => (a.type === 'tache' ? onModifierTache() : onChanger({ edition: !c.edition }))}
          accessibilityRole="button"
          hitSlop={6}
          style={styles.modifier}
        >
          <Text style={styles.modifierTexte}>
            {a.type === 'tache' ? 'Modifier dans le formulaire' : a.type === 'courses' ? (listes.length > 1 ? 'Changer de liste' : '') : 'Modifier'}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = creerStyles(() => ({
  sousTitre: { ...texte.libelleSection(), marginTop: espaces.s },
  tuileEvenement: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaces.m,
    padding: espaces.m,
    minHeight: 64,
    borderRadius: arrondis.carte,
    borderWidth: 1,
    borderColor: couleurs.ligneCarte,
    backgroundColor: couleurs.surface,
  },
  tuileEvenementTitre: { fontFamily: polices.texteGras, fontSize: 16, color: couleurs.encre },
  tuileEvenementDetail: { fontFamily: polices.texte, fontSize: 13, color: couleurs.encreDouce },
  rangee: { flexDirection: 'row', justifyContent: 'space-between', gap: 4 },
  raccourciCompact: { flex: 1, alignItems: 'center', gap: 6, paddingVertical: 6, borderRadius: arrondis.champ },
  raccourciCompactTexte: { fontFamily: polices.texteDemiGras, fontSize: 12, color: couleurs.encre },
  choixRecette: { flexBasis: 'auto', flexGrow: 0 },
  choixPhoto: { flexDirection: 'row', flexWrap: 'wrap', gap: espaces.s },
  grille: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  raccourci: {
    flexBasis: '47%',
    flexGrow: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaces.m,
    minHeight: 64,
    padding: espaces.m,
    borderRadius: arrondis.champ,
    borderWidth: 1,
    borderColor: couleurs.ligneCarte,
    backgroundColor: couleurs.surface,
  },
  raccourciTexte: { flex: 1, fontFamily: polices.texteDemiGras, fontSize: 14, color: couleurs.encre },
  question: {
    flexDirection: 'row',
    gap: espaces.s,
    alignItems: 'flex-start',
    padding: espaces.l,
    borderRadius: arrondis.champ,
    backgroundColor: couleurs.segment,
  },
  questionTexte: { flex: 1, fontFamily: polices.texteDemiGras, fontSize: 15, lineHeight: 21, color: couleurs.encre },
  rappel: { fontFamily: polices.texte, fontSize: 14, fontStyle: 'italic', color: couleurs.encreDouce },
  carte: {
    gap: espaces.m,
    padding: espaces.l,
    borderRadius: arrondis.carte,
    borderWidth: 1,
    borderColor: couleurs.ligneCarte,
    backgroundColor: couleurs.surface,
  },
  carteDecochee: { opacity: 0.75, borderStyle: 'dashed' },
  carteLigne: { flexDirection: 'row', alignItems: 'center', gap: espaces.m },
  carteEntete: { fontFamily: polices.texteGras, fontSize: 12, letterSpacing: 0.3, textTransform: 'uppercase' },
  carteTitre: { fontFamily: polices.texteGras, fontSize: 15, lineHeight: 20, color: couleurs.encre },
  carteChamp: {
    fontFamily: polices.texteGras,
    fontSize: 15,
    color: couleurs.encre,
    borderBottomWidth: 1.5,
    borderBottomColor: couleurs.encre,
    paddingVertical: 4,
  },
  carteDetail: { fontFamily: polices.texteMoyen, fontSize: 13, color: couleurs.encreDouce },
  incertain: { fontFamily: polices.texteDemiGras, fontSize: 12, color: couleurs.attention },
  caseACocher: {
    width: 28,
    height: 28,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: couleurs.ligne,
    alignItems: 'center',
    justifyContent: 'center',
  },
  articles: { flexDirection: 'row', flexWrap: 'wrap', gap: espaces.s },
  article: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 36,
    paddingHorizontal: 12,
    borderRadius: arrondis.pilule,
    borderWidth: 1,
    borderColor: couleurs.ligne,
  },
  articleTexte: { fontFamily: polices.texteDemiGras, fontSize: 14, color: couleurs.encreDouce },
  modifier: { alignSelf: 'flex-start' },
  modifierTexte: { fontFamily: polices.texteGras, fontSize: 13, color: couleurs.encre, textDecorationLine: 'underline' },
}));
