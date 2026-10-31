import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator, ScrollView, Platform, Modal, Vibration, TextInput } from 'react-native';
import { useFocusEffect, useIsFocused } from '@react-navigation/native';
import { useKeepAwake } from 'expo-keep-awake';
import * as Speech from 'expo-speech';
import { usePreferences } from '../../contexts/PreferencesContext';
import { useAuth } from '../../contexts/AuthContext';
import { astucesParEtape } from '../../services/essais';
import type { PointEssai } from '../../types/models';
import { theme, creerStylesThemes } from '../../theme/theme';
import {
  obtenirRecette,
  appliquerVariantes,
  choixValides,
  resoudreLibelleIngredient,
  resoudreEtapePourAffichage,
} from '../../services/recettes';
import type { ChoixVariantes, RecetteComplete } from '../../types/models';
import { ingredientsDeLEtape, lienAFaire } from '../../services/ingredientsCites';
import { relierIngredientsEtapes } from '../../services/lienIngredients';
import ReglageQuantites, { AJUSTEMENT_INITIAL, type AjustementQuantites } from '../../components/ReglageQuantites';
import { BarreMinuteurs, FenetreMinuteur } from '../../components/Minuteurs';
import { useEcouteVocale, ecouteDisponible } from '../../hooks/useEcouteVocale';
import { useMinuteurs, type Minuteur } from '../../hooks/useMinuteurs';
import {
  analyserCommande,
  commandeInterruption,
  commandeSureEnProvisoire,
  nombreDeMotsPhrase,
  trouverIngredient,
  trouverParNom,
  MOTS_COMMANDES,
  TEXTE_AIDE,
  type CommandeVocale,
} from '../../services/commandesVocales';
import { dureesDansTexte, formaterDureeCourte, formaterDureeParlee } from '../../services/durees';
import {
  lireProgression,
  enregistrerProgression,
  effacerProgression,
  formaterAnciennete,
} from '../../services/progressionAssistant';
import {
  poserQuestionCuisine,
  ressembleALaLecture,
  ressembleAUneQuestion,
  texteRecettePourAssistant,
  type EchangeCuisine,
} from '../../../../services/questionCuisine';
import { ErreurAssistant, messageErreurAssistant } from '../../../../services/assistant';
import { FeuilleBas } from '../../../../composants/FeuilleBas';
import { useEcranLarge } from '../../../../theme/theme';
import { Bouton, Icone, IconeGlyphe } from '../../../../composants/ui';

// Commandes vocales, minuteurs et reprise (étape 1 de l'assistant
// interactif, sans IA) :
// - Micro (bouton 🎙) : la personne pilote le déroulé à la voix — suivant,
//   précédent, répète, pause, reprends, étape 3, combien de beurre,
//   minuteur 10 minutes pour les pâtes… (voir services/commandesVocales.ts).
//   Micro activé = lecture vocale automatique des étapes, pour un vrai
//   fonctionnement mains libres.
// - Minuteurs : plusieurs à la fois, nommés, lancés à la voix, avec le
//   bouton ⏱ ou d'un geste depuis une durée repérée dans l'étape active
//   ("cuire 20 minutes" → ⏱ 20 min). À zéro : vibration + annonce vocale,
//   répétées jusqu'à « c'est bon » (ou le bouton OK).
// - Reprise : étapes cochées, quantités et minuteurs sont enregistrés sur
//   l'appareil ; en rouvrant la recette (même le lendemain), on reprend là
//   où on en était (voir services/progressionAssistant.ts).

const NOMBRE_MAX_RAPPELS_SONNERIE = 15; // ~5 minutes à raison d'un rappel toutes les 20 s

function premiereMajuscule(texte: string): string {
  return texte.charAt(0).toUpperCase() + texte.slice(1);
}

// Déroulé de la recette sous forme de liste complète d'étapes à cocher une à
// une, plutôt qu'un défilement pas-à-pas (retour utilisateur — cahier des
// charges §8) : chaque étape a sa case à cocher, et l'étape suivant la
// dernière validée est mise en surbrillance pour montrer où on en est,
// jusqu'à ce qu'elle soit à son tour cochée. Les ingrédients cités dans le
// texte de chaque étape sont repérés automatiquement (voir
// `detecterIngredientsCites`) et rappelés avec leur quantité, recalculée
// selon le nombre de parts choisi.
//
// Lecture à voix haute (retour utilisateur : les mains occupées en cuisine,
// sans aucun dialogue vocal avec l'app — juste une synthèse vocale à sens
// unique) : dès qu'une étape devient l'étape active, son texte est lu
// automatiquement via `expo-speech` (activable/désactivable). Chaque étape
// est découpée en phrases (`decouperEnPhrases`) et lue phrase par phrase :
// sur iOS, `Speech.pause()`/`resume()` reprennent nativement pile où la
// voix s'était arrêtée (y compris en plein milieu d'une phrase) ; sur
// Android, dont le moteur de synthèse ne sait pas mettre en pause, "pause"
// arrête net et "reprendre" relance à partir de la phrase interrompue
// plutôt que depuis le tout début de l'étape (retour utilisateur : pouvoir
// interrompre le temps d'une sous-étape puis reprendre simplement).
// `derniereEtapeLue` évite de relire la même étape à chaque re-rendu (ex.
// quand on ajuste les parts) ; `etapeActivePrecedenteId` coupe la voix dès
// que l'étape active change, même si la lecture auto est désactivée.
function decouperEnPhrases(texte: string): string[] {
  const phrases = texte.match(/[^.!?]+[.!?]*/g);
  return (phrases ?? [texte]).map((p) => p.trim()).filter(Boolean);
}

type EtatLecture = 'arret' | 'parle' | 'pause';

export default function DeroulementAssistantScreen({ route, navigation }: any) {
  const large = useEcranLarge();
  // Astuces de la famille active seulement (voir listerEssais).
  const { foyer, foyersFamille } = useAuth();
  const { recetteId } = route.params;
  // Vrai quand cet écran a été ouvert depuis le lien "Voir la recette" d'une
  // étape d'une AUTRE recette (retour utilisateur : sous-recette, ex. "faire
  // une pâte brisée") — voir le bouton `boutonRecetteLiee` plus bas, qui
  // pousse cette route avec ce paramètre. Sert uniquement à savoir s'il faut
  // proposer, une fois toutes les étapes cochées, de revenir à la recette
  // d'origine (`navigation.goBack()` : l'écran précédent sur la pile).
  const estSousRecette: boolean = Boolean(route.params?.sousRecette);
  const [modaleTermineeVisible, setModaleTermineeVisible] = useState(false);
  // « Terminer la recette » (retour de test R-14) : toujours accessible, même
  // si toutes les étapes ne sont pas cochées ; efface la progression.
  const [modaleTerminerVisible, setModaleTerminerVisible] = useState(false);
  const termineeRef = useRef(false);
  const [recette, setRecette] = useState<RecetteComplete | null>(null);
  // Versions retenues des éléments à variantes (gardées avec la progression).
  const variantesRef = useRef<ChoixVariantes>({});
  // Quantités adaptées (parts ou "ce que j'ai") — reprises de la fiche
  // recette si elles y avaient déjà été réglées.
  const [ajustement, setAjustement] = useState<AjustementQuantites>(
    route.params?.ajustement ?? AJUSTEMENT_INITIAL
  );
  // Feuille « Ingrédients » (retour de test R-11) et ingrédients déjà sortis
  // (cochés au fur et à mesure, pour cette séance).
  const [ingredientsVisibles, setIngredientsVisibles] = useState(false);
  const [ingredientsPrets, setIngredientsPrets] = useState<Set<string>>(new Set());
  const [etapesCochees, setEtapesCochees] = useState<Set<string>>(new Set());
  // Valeur de départ : le réglage "Lecture vocale automatique" du Profil
  // (coupé par défaut). Le bouton de l'écran ne change que la séance en cours.
  const { lectureAutoAssistant } = usePreferences();
  const [lectureAuto, setLectureAuto] = useState(lectureAutoAssistant);
  const [etatLecture, setEtatLecture] = useState<EtatLecture>('arret');
  // Astuces laissées par la famille dans ses essais, rattachées aux étapes.
  const [astuces, setAstuces] = useState<Map<string, PointEssai[]>>(new Map());
  const derniereEtapeLue = useRef<string | null>(null);
  const etapeActivePrecedenteId = useRef<string | null>(null);
  const segmentsActuels = useRef<string[]>([]);
  const indexSegmentActuel = useRef(0);
  const etatLectureRef = useRef<EtatLecture>('arret');
  etatLectureRef.current = etatLecture;
  // Numéro de la lecture en cours : chaque arrêt l'incrémente, et une phrase
  // qui se termine après un arrêt ne relance donc pas la suivante. (Dans un
  // navigateur, couper la voix déclenche l'événement « fin de phrase » :
  // sans ce garde-fou, la lecture repartait sur la phrase suivante —
  // retour utilisateur : « stop » ne stoppait pas.)
  const jetonLecture = useRef(0);
  const couperVoix = () => {
    jetonLecture.current += 1;
    Speech.stop();
  };

  // Assistant en cuisine (spécification § 4.1.4) : une phrase qui n'est
  // pas une commande et ressemble à une question, ou « ✦ Poser une
  // question » au clavier. Réponse en bulle au-dessus des étapes, lue à
  // voix haute.
  const [question, setQuestion] = useState<{ texte: string; enCours: boolean; reponse: string | null; erreur: string | null; pause?: boolean } | null>(null);
  const [saisieQuestion, setSaisieQuestion] = useState<string | null>(null);
  const echangesCuisine = useRef<EchangeCuisine[]>([]);
  const questionEnCours = useRef(false);

  // Commandes vocales.
  const [ecouteVoulue, setEcouteVoulue] = useState(false);
  const [derniereEntendue, setDerniereEntendue] = useState<{ texte: string; comprise: boolean } | null>(null);
  const estFocalise = useIsFocused();
  // Micro activé = lecture automatique des étapes (mains libres).
  const lectureEffective = lectureAuto || ecouteVoulue;

  // Minuteurs.
  const [fenetreMinuteurVisible, setFenetreMinuteurVisible] = useState(false);
  const minuteursApi = useMinuteurs({
    onTermine: (m) => {
      Vibration.vibrate([0, 600, 300, 600]);
      // File d'attente de la synthèse vocale : ne coupe pas la lecture en cours.
      Speech.speak(`Le minuteur ${m.nom} est terminé.`, { language: 'fr-FR' });
    },
  });
  const { minuteurs, maintenant, ajouter: ajouterMinuteur, retirer: retirerMinuteur, acquitter, restaurer } =
    minuteursApi;
  const sonneries = minuteurs.filter((m) => m.sonne);

  // Reprise d'une recette interrompue.
  const [progressionChargee, setProgressionChargee] = useState(false);
  const [reprise, setReprise] = useState<{ numeroEtape: number; anciennete: string } | null>(null);

  useKeepAwake();

  useEffect(() => {
    astucesParEtape(recetteId, foyersFamille)
      .then(setAstuces)
      .catch(() => {
        // Sans astuces, l'assistant fonctionne normalement.
      });
  }, [recetteId, foyersFamille]);

  // Texte lu à voix haute après une étape : ses astuces de la famille.
  const texteAstuces = (etapeId: string): string => {
    const points = astuces.get(etapeId) ?? [];
    if (points.length === 0) return '';
    return (
      ' Astuce de la famille : ' +
      points.map((p) => [p.souci, ...p.reponses.map((r) => r.texte)].filter(Boolean).join(', ')).join('. Autre astuce : ') +
      '.'
    );
  };

  // Recette et éventuelle progression enregistrée, chargées ensemble : la
  // lecture automatique démarre ainsi directement sur la bonne étape.
  useEffect(() => {
    let annule = false;
    Promise.all([obtenirRecette(recetteId), lireProgression(recetteId)]).then(([brute, progression]) => {
      if (annule) return;
      // Éléments à variantes : on ne déroule que la version choisie sur la
      // fiche (ou, à la reprise, celle de la dernière fois) ; à défaut, la
      // version principale.
      const choix = choixValides(brute, route.params?.variantes ?? progression?.variantes);
      variantesRef.current = choix;
      const r = appliquerVariantes(brute, choix);
      if (progression) {
        const idsEtapes = new Set(r.etapes.map((e) => e.id));
        const cochees = progression.etapesCochees.filter((id) => idsEtapes.has(id));
        const toutesFaites = r.etapes.length > 0 && r.etapes.every((e) => cochees.includes(e.id));
        if (!toutesFaites && (cochees.length > 0 || progression.minuteurs.length > 0)) {
          setEtapesCochees(new Set(cochees));
          // Quantités : celles réglées sur la fiche recette l'emportent si on
          // arrive de là avec un réglage ; sinon celles de la dernière fois.
          if (!route.params?.ajustement) setAjustement(progression.ajustement ?? AJUSTEMENT_INITIAL);
          restaurer(progression.minuteurs);
          const indexActive = r.etapes.findIndex((e) => !cochees.includes(e.id));
          setReprise({ numeroEtape: indexActive + 1, anciennete: formaterAnciennete(progression.majLe) });
        } else {
          effacerProgression(recetteId);
        }
      }
      setRecette(r);
      setProgressionChargee(true);
    });
    return () => {
      annule = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recetteId]);

  // Lien étapes → ingrédients par l'assistant (retour de test R-12) : une
  // fois par recette (et après une modification du texte d'une étape), en
  // arrière-plan ; en attendant, le repérage par mots.
  const lienDemande = useRef<string | null>(null);
  useEffect(() => {
    if (!recette || lienDemande.current === recette.id || !lienAFaire(recette.etapes)) return;
    lienDemande.current = recette.id;
    relierIngredientsEtapes(recette, recette.foyer_id === foyer?.id).then((liens) => {
      if (!liens.size) return;
      setRecette((r) =>
        r ? { ...r, etapes: r.etapes.map((e) => (liens.has(e.id) ? { ...e, ingredients_cites: liens.get(e.id) } : e)) } : r
      );
    });
  }, [recette, foyer?.id]);

  // Enregistrement de la progression à chaque changement (étapes, quantités,
  // minuteurs). Une recette terminée — ou pas encore commencée — n'est pas
  // gardée.
  useEffect(() => {
    if (!recette || !progressionChargee || termineeRef.current) return;
    const enCours = minuteurs.filter((m) => !m.sonne);
    const toutesFaites = recette.etapes.every((e) => etapesCochees.has(e.id));
    if (toutesFaites || (etapesCochees.size === 0 && enCours.length === 0)) {
      effacerProgression(recetteId);
      return;
    }
    enregistrerProgression({
      recetteId,
      etapesCochees: [...etapesCochees],
      ajustement,
      variantes: variantesRef.current,
      minuteurs: enCours.map(({ id, nom, finA, dureeMs }) => ({ id, nom, finA, dureeMs })),
      majLe: Date.now(),
    });
  }, [recette, progressionChargee, etapesCochees, ajustement, minuteurs, recetteId]);

  // Sonnerie : tant qu'un minuteur terminé n'est pas acquitté, vibration et
  // rappel vocal toutes les 20 secondes (5 minutes au plus).
  const nombreSonneries = sonneries.length;
  const nomsSonneries = sonneries.map((m) => m.nom).join(' et ');
  useEffect(() => {
    if (nombreSonneries === 0) return;
    let rappels = 0;
    const intervalle = setInterval(() => {
      rappels += 1;
      if (rappels > NOMBRE_MAX_RAPPELS_SONNERIE) {
        clearInterval(intervalle);
        return;
      }
      Vibration.vibrate([0, 600, 300, 600]);
      Speech.speak(
        `${nombreSonneries > 1 ? 'Les minuteurs' : 'Le minuteur'} ${nomsSonneries} ${nombreSonneries > 1 ? 'sont terminés' : 'est terminé'}.`,
        { language: 'fr-FR' }
      );
    }, 20000);
    return () => clearInterval(intervalle);
  }, [nombreSonneries, nomsSonneries]);

  // Coupe la voix dès que l'écran perd le focus — pas seulement à sa
  // destruction (`useEffect` + nettoyage au démontage) : selon la
  // navigation, "sortir" de cet écran (retour, changement d'onglet) ne le
  // démonte pas forcément, il reste juste hors-focus en mémoire, et la
  // voix continuait alors à parler en arrière-plan (retour utilisateur).
  useFocusEffect(
    useCallback(() => {
      return () => {
        couperVoix();
        setEtatLecture('arret');
      };
    }, [])
  );

  const parlerSegment = (segments: string[], index: number) => {
    const jeton = jetonLecture.current;
    if (index >= segments.length) {
      setEtatLecture('arret');
      return;
    }
    indexSegmentActuel.current = index;
    Speech.speak(segments[index], {
      language: 'fr-FR',
      onDone: () => {
        if (jeton === jetonLecture.current) parlerSegment(segments, index + 1);
      },
      onError: () => {
        if (jeton === jetonLecture.current) setEtatLecture('arret');
      },
    });
  };

  const lireDepuisSegment = (segments: string[], depart: number) => {
    couperVoix();
    segmentsActuels.current = segments;
    setEtatLecture('parle');
    parlerSegment(segments, depart);
  };

  const lireTexte = (texte: string) => {
    lireDepuisSegment(decouperEnPhrases(texte), 0);
  };

  useEffect(() => {
    if (!recette) return;
    const facteur = ajustement.facteur;
    const index = recette.etapes.findIndex((e) => !etapesCochees.has(e.id));
    const etapeActiveId = index === -1 ? null : recette.etapes[index].id;

    // Nouvelle étape active (ou plus aucune) : on coupe toujours la voix de
    // l'étape précédente, même si la lecture auto est désactivée — sans ça,
    // une lecture en pause sur une étape qu'on vient de quitter resterait
    // "reprenable" à tort.
    if (etapeActivePrecedenteId.current !== etapeActiveId) {
      etapeActivePrecedenteId.current = etapeActiveId;
      couperVoix();
      setEtatLecture('arret');
    }

    if (index === -1 || !lectureEffective) return;
    const etapeActive = recette.etapes[index];
    if (derniereEtapeLue.current === etapeActive.id) return;
    derniereEtapeLue.current = etapeActive.id;
    const texte = resoudreEtapePourAffichage(etapeActive.texte, recette.ingredients, facteur);
    lireTexte(`Étape ${index + 1}. ${texte}${texteAstuces(etapeActive.id)}`);
  }, [recette, ajustement, etapesCochees, lectureEffective]);

  // Modale "sous-recette terminée" (retour utilisateur) : uniquement quand
  // cet écran a été ouvert depuis le lien d'une étape d'une autre recette —
  // s'affiche dès que la dernière étape est cochée, se referme d'elle-même
  // si on décoche une étape (on peut alors la revoir en recochant).
  useEffect(() => {
    if (!recette || !estSousRecette) return;
    const toutesCocheesMaintenant = recette.etapes.every((e) => etapesCochees.has(e.id));
    setModaleTermineeVisible(toutesCocheesMaintenant);
  }, [recette, etapesCochees, estSousRecette]);

  const relireEtapeActive = () => {
    if (!recette) return;
    const facteur = ajustement.facteur;
    const index = recette.etapes.findIndex((e) => !etapesCochees.has(e.id));
    if (index === -1) return;
    const etapeActive = recette.etapes[index];
    const texte = resoudreEtapePourAffichage(etapeActive.texte, recette.ingredients, facteur);
    lireTexte(`Étape ${index + 1}. ${texte}${texteAstuces(etapeActive.id)}`);
  };

  // Un seul bouton, à l'état qui change selon ce qui se passe :
  // - en train de parler → Pause (vraie pause sur iOS, arrêt net sur Android)
  // - en pause → Reprendre (reprend pile où on s'était arrêté sur iOS ;
  //   relance depuis la phrase interrompue sur Android)
  // - arrêté → Écouter (relance l'étape depuis le début)
  const basculerPause = () => {
    if (etatLecture === 'parle') {
      if (Platform.OS === 'ios') {
        Speech.pause();
      } else {
        couperVoix();
      }
      setEtatLecture('pause');
    } else if (etatLecture === 'pause') {
      if (Platform.OS === 'ios') {
        Speech.resume();
        setEtatLecture('parle');
      } else {
        setEtatLecture('parle');
        parlerSegment(segmentsActuels.current, indexSegmentActuel.current);
      }
    } else {
      relireEtapeActive();
    }
  };

  const basculerEtape = (etapeId: string, index: number) => {
    setEtapesCochees((precedent) => {
      const suivant = new Set(precedent);
      if (suivant.has(etapeId)) {
        // Décocher une étape décoche aussi toutes celles qui suivent, même
        // si elles étaient déjà validées : repartir d'ici veut dire refaire
        // ce qui suivait. Sans ça, les étapes suivantes restaient cochées
        // en interne sans que ce soit visible (elles n'étaient plus
        // l'étape active), ce qui faisait resurgir tout leur bloc d'un
        // coup — retour à l'étape la plus avancée — dès qu'on en recochait
        // une par erreur (retour utilisateur).
        recette?.etapes.slice(index).forEach((e) => suivant.delete(e.id));
      } else {
        suivant.add(etapeId);
      }
      return suivant;
    });
  };

  // Réponse vocale courte (à une question, à une commande) : coupe la
  // lecture en cours pour être entendue tout de suite.
  const dire = (texte: string) => {
    lireTexte(texte);
  };

  const recommencer = () => {
    couperVoix();
    setEtatLecture('arret');
    derniereEtapeLue.current = null;
    setEtapesCochees(new Set());
    setAjustement(route.params?.ajustement ?? AJUSTEMENT_INITIAL);
    restaurer([]);
    setReprise(null);
    effacerProgression(recetteId);
  };

  // Bouton « Terminer » dans l'en-tête de l'écran.
  useEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <Pressable
          onPress={() => setModaleTerminerVisible(true)}
          accessibilityRole="button"
          accessibilityLabel="Terminer la recette"
          hitSlop={8}
          style={styles.boutonTerminerEnTete}
        >
          <Text style={styles.boutonTerminerEnTeteTexte}>Terminer</Text>
        </Pressable>
      ),
    });
  }, [navigation]);

  const terminer = (raconter: boolean | 'commenter') => {
    termineeRef.current = true;
    setModaleTerminerVisible(false);
    couperVoix();
    setEtatLecture('arret');
    restaurer([]);
    effacerProgression(recetteId);
    if (raconter === 'commenter') navigation.replace('DetailRecette', { recetteId, commenter: true });
    else if (raconter) navigation.replace('EssaiRecette', { recetteId, depuisAssistant: true });
    else navigation.goBack();
  };

  const lancerMinuteur = (nom: string, dureeMs: number, annoncer: boolean) => {
    const m = ajouterMinuteur(nom, dureeMs);
    if (annoncer) dire(`Minuteur ${m.nom} lancé pour ${formaterDureeParlee(dureeMs)}.`);
  };

  const nomMinuteurParDefaut = (): string => {
    const index = recette ? recette.etapes.findIndex((e) => !etapesCochees.has(e.id)) : -1;
    return index >= 0 ? `Étape ${index + 1}` : `Minuteur ${minuteurs.length + 1}`;
  };

  const executerCommande = (commande: CommandeVocale) => {
    if (!recette) return;
    const etapes = recette.etapes;
    const indexActive = etapes.findIndex((e) => !etapesCochees.has(e.id));
    const facteur = ajustement.facteur;
    const enCours = minuteurs.filter((m) => !m.sonne);

    switch (commande.type) {
      case 'suivant':
        if (indexActive === -1) dire('Toutes les étapes sont terminées.');
        else basculerEtape(etapes[indexActive].id, indexActive);
        break;
      case 'precedent': {
        const index = indexActive === -1 ? etapes.length : indexActive;
        if (index <= 0) dire('Vous êtes à la première étape.');
        else basculerEtape(etapes[index - 1].id, index - 1);
        break;
      }
      case 'allerEtape': {
        const n = commande.numero;
        if (n < 1 || n > etapes.length) {
          dire(`Cette recette a ${etapes.length} étape${etapes.length > 1 ? 's' : ''}.`);
        } else if (n - 1 === indexActive) {
          relireEtapeActive();
        } else {
          setEtapesCochees(new Set(etapes.slice(0, n - 1).map((e) => e.id)));
        }
        break;
      }
      case 'repeter':
        if (indexActive === -1) dire('Toutes les étapes sont terminées.');
        else relireEtapeActive();
        break;
      case 'pause':
        if (etatLectureRef.current === 'parle') basculerPause();
        break;
      case 'reprendre':
        if (etatLectureRef.current !== 'parle') basculerPause();
        break;
      case 'arreter':
        couperVoix();
        setEtatLecture('arret');
        break;
      case 'position':
        dire(
          indexActive === -1
            ? 'Toutes les étapes sont terminées.'
            : `Vous êtes à l'étape ${indexActive + 1} sur ${etapes.length}.`
        );
        break;
      case 'ingredients':
        dire(
          recette.ingredients.length === 0
            ? "Cette recette n'a pas d'ingrédients renseignés."
            : `Ingrédients : ${recette.ingredients.map((i) => resoudreLibelleIngredient(i, facteur)).join(', ')}.`
        );
        break;
      case 'quantite': {
        const ingredient = trouverIngredient(commande.recherche, recette.ingredients);
        if (!ingredient) dire(`Je ne trouve pas ${commande.recherche} dans les ingrédients.`);
        else if (ingredient.quantite == null) dire(`Pas de quantité précise pour ${ingredient.libelle}.`);
        else dire(`Il faut ${resoudreLibelleIngredient(ingredient, facteur)}.`);
        break;
      }
      case 'minuteur':
        lancerMinuteur(
          commande.nom ? premiereMajuscule(commande.nom) : nomMinuteurParDefaut(),
          commande.dureeMs,
          true
        );
        break;
      case 'tempsRestant': {
        if (enCours.length === 0) {
          dire('Aucun minuteur en cours.');
          break;
        }
        const cible = trouverParNom(commande.nom, enCours) ?? (enCours.length === 1 ? enCours[0] : null);
        const liste = cible ? [cible] : enCours;
        dire(
          liste
            .map((m: Minuteur) => `${m.nom} : encore ${formaterDureeParlee(m.finA - Date.now())}`)
            .join('. ') + '.'
        );
        break;
      }
      case 'annulerMinuteur': {
        if (sonneries.length > 0) {
          acquitter();
          couperVoix();
          break;
        }
        const cible = trouverParNom(commande.nom, enCours) ?? (enCours.length === 1 ? enCours[0] : null);
        if (cible) {
          retirerMinuteur(cible.id);
          dire(`Minuteur ${cible.nom} annulé.`);
        } else if (enCours.length === 0) {
          dire('Aucun minuteur en cours.');
        } else {
          dire(`Lequel ? ${enCours.map((m) => m.nom).join(', ou ')}.`);
        }
        break;
      }
      case 'acquitter':
        if (sonneries.length > 0) {
          acquitter();
          couperVoix();
        }
        break;
      case 'aide':
        dire(TEXTE_AIDE);
        break;
      case 'inconnue':
        break;
    }
  };

  const poserQuestion = async (texte: string) => {
    if (!recette || questionEnCours.current) return;
    questionEnCours.current = true;
    const index = recette.etapes.findIndex((e) => !etapesCochees.has(e.id));
    const etape =
      index === -1
        ? null
        : `${index + 1} sur ${recette.etapes.length} : ${resoudreEtapePourAffichage(recette.etapes[index].texte, recette.ingredients, ajustement.facteur)}`;
    setQuestion({ texte, enCours: true, reponse: null, erreur: null });
    try {
      const reponse = await poserQuestionCuisine({
        question: texte,
        recette: texteRecettePourAssistant(recette, ajustement.facteur, astuces),
        etape,
        echanges: echangesCuisine.current,
      });
      echangesCuisine.current = [...echangesCuisine.current, { question: texte, reponse }].slice(-3);
      setQuestion({ texte, enCours: false, reponse, erreur: null });
      dire(reponse);
    } catch (e) {
      setQuestion({
        texte,
        enCours: false,
        reponse: null,
        erreur: messageErreurAssistant(e),
        pause: e instanceof ErreurAssistant && e.code === 'plafond',
      });
    } finally {
      questionEnCours.current = false;
    }
  };

  // Phrase entendue par le micro. Renvoie true si elle a été traitée.
  const traiterPhrase = (texte: string, definitive: boolean): boolean => {
    // Pendant que l'application parle, le micro l'entend aussi : on ne
    // retient alors que les phrases courtes (« pause », « stop »…), pas
    // l'écho des longues phrases lues à voix haute.
    let commande: CommandeVocale;
    if (etatLectureRef.current === 'parle' && nombreDeMotsPhrase(texte) > 4) {
      const interruption = commandeInterruption(texte);
      if (!interruption) return false;
      commande = interruption;
    } else {
      commande = analyserCommande(texte);
    }
    // Une sonnerie en cours : « stop », « pause », « arrête » la coupent.
    if (sonneries.length > 0 && (commande.type === 'arreter' || commande.type === 'pause')) {
      commande = { type: 'acquitter' };
    }
    if (commande.type === 'inconnue') {
      // Pas une commande : une vraie question part à l'assistant, jamais
      // pendant la lecture (l'écho de la voix n'est pas une question).
      if (
        definitive &&
        etatLectureRef.current !== 'parle' &&
        !questionEnCours.current &&
        ressembleAUneQuestion(texte) &&
        !ressembleALaLecture(texte, segmentsActuels.current.join(' '))
      ) {
        setDerniereEntendue({ texte, comprise: true });
        poserQuestion(texte);
        return true;
      }
      if (definitive) setDerniereEntendue({ texte, comprise: false });
      return false;
    }
    if (!definitive && !commandeSureEnProvisoire(commande, minuteurs.length > 0)) return false;
    setDerniereEntendue({ texte, comprise: true });
    executerCommande(commande);
    return true;
  };

  const { etat: etatEcoute, erreur: erreurEcoute } = useEcouteVocale({
    active: ecouteVoulue && estFocalise,
    motsCles: MOTS_COMMANDES,
    onPhrase: traiterPhrase,
  });

  if (!recette) {
    return (
      <View style={styles.centre}>
        <ActivityIndicator color={theme.colors.accent} />
      </View>
    );
  }

  if (recette.etapes.length === 0) {
    return (
      <View style={styles.centre}>
        <Text style={styles.texteVide}>Cette recette n'a pas encore d'étapes renseignées.</Text>
      </View>
    );
  }

  const facteurEchelle = ajustement.facteur;
  // Première étape non cochée : celle mise en avant, sur laquelle porter son
  // attention — les précédentes sont validées, les suivantes attendent leur tour.
  const indexEtapeActive = recette.etapes.findIndex((e) => !etapesCochees.has(e.id));
  const nomsElements = new Map((recette?.elements ?? []).map((e) => [e.id, e.nom.trim()] as [string, string]));
  const toutesCochees = indexEtapeActive === -1;

  // Ligne d'ingrédient à cocher (feuille « Ingrédients » ou colonne tablette).
  const ligneIngredient = (ingredient: (typeof recette.ingredients)[number], enAvant = false) => {
    const pret = ingredientsPrets.has(ingredient.id);
    return (
      <Pressable
        key={ingredient.id}
        style={[styles.ligneIngredient, enAvant && !pret && styles.ligneIngredientEnAvant]}
        onPress={() =>
          setIngredientsPrets((avant) => {
            const apres = new Set(avant);
            if (apres.has(ingredient.id)) apres.delete(ingredient.id);
            else apres.add(ingredient.id);
            return apres;
          })
        }
        accessibilityRole="checkbox"
        accessibilityState={{ checked: pret }}
      >
        <Icone nom={pret ? 'checkbox' : 'square-outline'} taille={24} couleur={pret ? theme.colors.accent : theme.colors.textMuted} />
        <Text style={[styles.ingredientListe, enAvant && styles.ingredientEnAvant, pret && styles.ingredientPret]}>
          {resoudreLibelleIngredient(ingredient, facteurEchelle)}
        </Text>
      </Pressable>
    );
  };
  // Tablette (R-10) : les étapes à gauche, les ingrédients toujours visibles à droite.
  const etapeActive = indexEtapeActive >= 0 ? recette.etapes[indexEtapeActive] : null;
  const ingredientsEtapeActive = etapeActive ? ingredientsDeLEtape(etapeActive, recette.ingredients) : [];
  const idsEtapeActive = new Set(ingredientsEtapeActive.map((i) => i.id));

  return (
    <View style={styles.container}>
      <View style={styles.partsZone}>
        <ReglageQuantites
          partsDefaut={recette.parts_defaut}
          ingredients={recette.ingredients}
          ajustement={ajustement}
          onChange={setAjustement}
        />
        {recette.ingredients.length > 0 && !large && (
          <Bouton
            variante="secondaire"
            petit
            icone="list-outline"
            titre={`Ingrédients (${recette.ingredients.length})`}
            onPress={() => setIngredientsVisibles(true)}
            accessibilityLabel={`Voir les ${recette.ingredients.length} ingrédients`}
          />
        )}
      </View>

      <FeuilleBas
        visible={ingredientsVisibles}
        titre={`Ingrédients (${recette.ingredients.length})`}
        onFermer={() => setIngredientsVisibles(false)}
      >
        <Text style={styles.aideIngredients}>Cochez ce qui est sorti ou déjà utilisé.</Text>
        <View>{recette.ingredients.map((ingredient) => ligneIngredient(ingredient))}</View>
      </FeuilleBas>

      <View style={styles.lectureZone}>
        <Pressable
          style={[styles.lectureBouton, lectureAuto && styles.lectureBoutonActif]}
          onPress={() => setLectureAuto((v) => !v)}
        >
          <Text style={[styles.lectureBoutonTexte, lectureAuto && styles.lectureBoutonTexteActif]}>
            <IconeGlyphe nom={lectureAuto ? 'volume-high-outline' : 'volume-mute-outline'} style={[styles.lectureBoutonTexte, lectureAuto && styles.lectureBoutonTexteActif]} />
            {lectureAuto ? ' Lecture auto activée' : ' Lecture auto coupée'}
          </Text>
        </Pressable>
        {!toutesCochees && (
          <Pressable style={styles.lectureBoutonPause} onPress={basculerPause}>
            <Text style={styles.lectureBoutonPauseTexte}>
              <IconeGlyphe nom={etatLecture === 'parle' ? 'pause' : 'play'} style={styles.lectureBoutonPauseTexte} />
              {etatLecture === 'parle' ? ' Pause' : etatLecture === 'pause' ? ' Reprendre' : ' Écouter'}
            </Text>
          </Pressable>
        )}
        {ecouteDisponible && (
          <Pressable
            style={[styles.lectureBouton, ecouteVoulue && styles.lectureBoutonActif]}
            onPress={() => {
              setEcouteVoulue((v) => !v);
              setDerniereEntendue(null);
            }}
            accessibilityLabel={ecouteVoulue ? 'Couper le micro' : 'Activer les commandes vocales'}
          >
            <Text style={[styles.lectureBoutonTexte, ecouteVoulue && styles.lectureBoutonTexteActif]}>
              <IconeGlyphe nom="mic-outline" style={[styles.lectureBoutonTexte, ecouteVoulue && styles.lectureBoutonTexteActif]} />
              {ecouteVoulue ? ' Micro activé' : ' Micro'}
            </Text>
          </Pressable>
        )}
        <Pressable
          style={styles.lectureBouton}
          onPress={() => setFenetreMinuteurVisible(true)}
          accessibilityLabel="Lancer un minuteur"
        >
          <Text style={styles.lectureBoutonTexte}><IconeGlyphe nom="timer-outline" style={styles.lectureBoutonTexte} />{' '}Minuteur</Text>
        </Pressable>
        <Pressable
          style={[styles.lectureBouton, saisieQuestion != null && styles.lectureBoutonActif]}
          onPress={() => setSaisieQuestion((v) => (v == null ? '' : null))}
          accessibilityRole="button"
          accessibilityLabel="Poser une question à l’assistant"
        >
          <Text style={[styles.lectureBoutonTexte, saisieQuestion != null && styles.lectureBoutonTexteActif]}>
            ✦ Poser une question
          </Text>
        </Pressable>
      </View>

      {saisieQuestion != null && (
        <View style={styles.questionSaisie}>
          <TextInput
            style={styles.questionChamp}
            value={saisieQuestion}
            onChangeText={setSaisieQuestion}
            placeholder="Par quoi remplacer la crème ? C’est normal si…"
            placeholderTextColor={theme.colors.textMuted}
            returnKeyType="send"
            autoFocus
            onSubmitEditing={() => {
              const t = saisieQuestion.trim();
              if (!t) return;
              setSaisieQuestion(null);
              poserQuestion(t);
            }}
            accessibilityLabel="Votre question"
          />
          <Pressable
            style={[styles.questionEnvoyer, !saisieQuestion.trim() && { opacity: 0.5 }]}
            disabled={!saisieQuestion.trim()}
            onPress={() => {
              const t = saisieQuestion.trim();
              setSaisieQuestion(null);
              poserQuestion(t);
            }}
            accessibilityRole="button"
            accessibilityLabel="Envoyer la question"
          >
            <Text style={styles.questionEnvoyerTexte}>Demander</Text>
          </Pressable>
        </View>
      )}

      {question && (
        <View style={styles.bulle} accessibilityLiveRegion="polite">
          <View style={styles.bulleEntete}>
            <Text style={styles.bulleQuestion} numberOfLines={2}>✦ « {question.texte} »</Text>
            <Pressable
              onPress={() => {
                if (question.reponse) couperVoix();
                setQuestion(null);
              }}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Fermer la réponse"
            >
              <IconeGlyphe nom="close" style={styles.bulleFermer} />
            </Pressable>
          </View>
          {question.enCours ? (
            <View style={styles.bulleChargement}>
              <ActivityIndicator color={theme.colors.background} />
              <Text style={styles.bulleTexte}>Je réfléchis…</Text>
            </View>
          ) : question.reponse ? (
            <Text style={styles.bulleTexte}>{question.reponse}</Text>
          ) : (
            <Text style={styles.bulleTexte}>{question.erreur}</Text>
          )}
        </View>
      )}

      {ecouteVoulue && (
        <View style={styles.ecouteZone}>
          {etatEcoute === 'erreur' && erreurEcoute ? (
            <Text style={styles.ecouteErreur}>{erreurEcoute}</Text>
          ) : (
            <Text style={styles.ecouteTexte}>
              {etatEcoute === 'ecoute'
                ? '🎙 J’écoute… Dites « aide » pour la liste des commandes.'
                : 'Activation du micro…'}
            </Text>
          )}
          {derniereEntendue && (
            <Text style={derniereEntendue.comprise ? styles.ecouteComprise : styles.ecouteIncomprise}>
              {derniereEntendue.comprise ? '✓' : '?'} « {derniereEntendue.texte} »
            </Text>
          )}
        </View>
      )}

      {reprise && (
        <View style={styles.repriseZone}>
          <Text style={styles.repriseTexte}>
            Reprise à l'étape {reprise.numeroEtape} (commencée {reprise.anciennete}).
          </Text>
          <View style={styles.repriseActions}>
            <Pressable onPress={recommencer} hitSlop={6}>
              <Text style={styles.repriseLien}>Recommencer du début</Text>
            </Pressable>
            <Pressable onPress={() => setReprise(null)} hitSlop={6} accessibilityLabel="Masquer">
              <IconeGlyphe nom="close" style={styles.repriseFermer} />
            </Pressable>
          </View>
        </View>
      )}

      <BarreMinuteurs
        minuteurs={minuteurs}
        maintenant={maintenant}
        onRetirer={retirerMinuteur}
        onAcquitter={() => {
          acquitter();
          couperVoix();
        }}
      />

      {toutesCochees && !estSousRecette && (
        <View style={styles.messageTermineZone}>
          <Text style={styles.messageTermine}>Toutes les étapes sont terminées — bon appétit !</Text>
          <Pressable
            style={styles.boutonRaconter}
            onPress={() => navigation.navigate('EssaiRecette', { recetteId, depuisAssistant: true })}
          >
            <Text style={styles.boutonRaconterTexte}>Raconter comment ça s’est passé</Text>
          </Pressable>
        </View>
      )}

      <View style={large ? styles.deuxColonnes : { flex: 1 }}>
      <View style={large ? styles.colonneEtapes : { flex: 1 }}>
      {large && !toutesCochees ? (
        // Tablette (R-10) : l'étape en cours seule, en grand, avec sa progression.
        <View style={styles.progressionTablette}>
          <Text style={styles.progressionTabletteTexte}>
            Étape {indexEtapeActive + 1} sur {recette.etapes.length}
          </Text>
          <View style={styles.progressionBarre}>
            <View style={[styles.progressionRemplie, { width: `${Math.round((indexEtapeActive / recette.etapes.length) * 100)}%` }]} />
          </View>
        </View>
      ) : null}
      <ScrollView contentContainerStyle={styles.liste}>
        {recette.etapes.map((etape, index) => {
          if (large && !toutesCochees && index !== indexEtapeActive) return null;
          const cochee = etapesCochees.has(etape.id);
          const active = index === indexEtapeActive;
          const ingredientsCites = ingredientsDeLEtape(etape, recette.ingredients).map((ingredient) =>
            resoudreLibelleIngredient(ingredient, facteurEchelle)
          );
          // L'étape active peut être cochée, et une étape déjà cochée peut
          // toujours être décochée (retour utilisateur : pouvoir revenir en
          // arrière simplement en décochant une étape précédente — elle
          // redevient alors l'étape active). Seules les étapes pas encore
          // atteintes restent verrouillées.
          const verrouillee = !active && !cochee;
          // Nom de l'élément (ex. "La pâte") avant sa première étape.
          const nomElement = etape.element_id ? nomsElements.get(etape.element_id) : undefined;
          const nouvelElement =
            !!nomElement && (index === 0 || recette.etapes[index - 1].element_id !== etape.element_id);
          return (
            <React.Fragment key={etape.id}>
            {nouvelElement && <Text style={styles.titreElement}>{nomElement}</Text>}
            <Pressable
              key={etape.id}
              style={[
                styles.ligneEtape,
                active && styles.ligneEtapeActive,
                cochee && styles.ligneEtapeCochee,
                verrouillee && styles.ligneEtapeVerrouillee,
              ]}
              disabled={verrouillee}
              onPress={() => basculerEtape(etape.id, index)}
            >
              <View style={[styles.case, cochee && styles.caseCochee]}>
                {cochee && <IconeGlyphe nom="checkmark" style={styles.caseCocheeTexte} />}
              </View>
              <View style={styles.contenuEtape}>
                <Text style={[styles.numeroEtape, active && styles.numeroEtapeActif]}>Étape {index + 1}</Text>
                {ingredientsCites.length > 0 && (
                  <View style={styles.ingredientsEtape}>
                    {ingredientsCites.map((ingredient, i) => (
                      <View key={i} style={styles.puceIngredientEtape}>
                        <Text style={styles.puceIngredientEtapeTexte}>{ingredient}</Text>
                      </View>
                    ))}
                  </View>
                )}
                <Text style={[styles.texteEtape, large && active && styles.texteEtapeGrand, cochee && styles.texteEtapeCochee]}>
                  {resoudreEtapePourAffichage(etape.texte, recette.ingredients, facteurEchelle)}
                </Text>
                {active && (
                  // Durées citées dans l'étape active ("cuire 20 minutes") :
                  // minuteur lancé d'un geste.
                  <View style={styles.dureesEtape}>
                    {dureesDansTexte(resoudreEtapePourAffichage(etape.texte, recette.ingredients, facteurEchelle)).map(
                      (duree) => (
                        <Pressable
                          key={duree}
                          style={styles.boutonDuree}
                          onPress={() => lancerMinuteur(`Étape ${index + 1}`, duree, false)}
                        >
                          <Text style={styles.boutonDureeTexte}><IconeGlyphe nom="timer-outline" style={styles.boutonDureeTexte} />{' '}{formaterDureeCourte(duree)}</Text>
                        </Pressable>
                      )
                    )}
                  </View>
                )}
                {(astuces.get(etape.id) ?? []).length > 0 && !cochee && (
                  <View style={styles.astuces}>
                    <Text style={styles.astucesTitre}>Astuces de la famille</Text>
                    {(astuces.get(etape.id) ?? []).map((p) => (
                      <Text key={p.id} style={styles.astuceTexte}>
                        {[
                          p.souci ? `⚠️ ${p.souci}` : null,
                          ...p.reponses.map((r) => `${r.nature === 'changement' ? '✏️' : '💡'} ${r.texte}`),
                        ]
                          .filter(Boolean)
                          .join('\n')}
                      </Text>
                    ))}
                  </View>
                )}
                {etape.recette_liee_id && (
                  // Sous-recette référencée par cette étape (retour utilisateur :
                  // ex. "faire une pâte brisée" renvoie vers sa propre recette).
                  // On empile simplement un nouvel écran assistant par-dessus
                  // (même route) : le retour arrière (natif) ramène pile à cette
                  // étape, sans logique de "retour" spécifique à écrire.
                  <Pressable
                    style={styles.boutonRecetteLiee}
                    onPress={() =>
                      navigation.push('AssistantRecette', {
                        recetteId: etape.recette_liee_id,
                        sousRecette: true,
                      })
                    }
                  >
                    <Text style={styles.boutonRecetteLieeTexte}>
                      → Voir la recette : {etape.recette_liee?.titre ?? '…'}
                    </Text>
                  </Pressable>
                )}
              </View>
            </Pressable>
            </React.Fragment>
          );
        })}
      </ScrollView>
      {large && !toutesCochees ? (
        <View style={styles.piedTablette}>
          {recette.etapes[indexEtapeActive + 1] ? (
            <View style={styles.apercuSuivante}>
              <Text style={styles.apercuSuivanteTitre}>Ensuite · étape {indexEtapeActive + 2}</Text>
              <Text style={styles.apercuSuivanteTexte} numberOfLines={3}>
                {resoudreEtapePourAffichage(recette.etapes[indexEtapeActive + 1].texte, recette.ingredients, facteurEchelle)}
              </Text>
            </View>
          ) : null}
          <View style={styles.boutonsTablette}>
            <Pressable
              style={[styles.boutonTablette, styles.boutonTabletteSecondaire, indexEtapeActive === 0 && { opacity: 0.4 }]}
              disabled={indexEtapeActive === 0}
              onPress={() => basculerEtape(recette.etapes[indexEtapeActive - 1].id, indexEtapeActive - 1)}
              accessibilityRole="button"
            >
              <Icone nom="arrow-back" taille={20} couleur={theme.colors.text} />
              <Text style={styles.boutonTabletteSecondaireTexte}>Précédente</Text>
            </Pressable>
            <Pressable
              style={[styles.boutonTablette, styles.boutonTablettePrincipal]}
              onPress={() => basculerEtape(recette.etapes[indexEtapeActive].id, indexEtapeActive)}
              accessibilityRole="button"
            >
              <Text style={styles.boutonTablettePrincipalTexte}>
                {indexEtapeActive === recette.etapes.length - 1 ? 'Dernière étape faite' : 'Étape faite · suivante'}
              </Text>
              <Icone nom="arrow-forward" taille={20} couleur={theme.colors.background} />
            </Pressable>
          </View>
        </View>
      ) : null}
      </View>
      {large && recette.ingredients.length > 0 ? (
        <ScrollView style={styles.colonneIngredients} contentContainerStyle={styles.colonneIngredientsContenu}>
          <View style={styles.enteteIngredients}>
            <Text style={styles.titreIngredients}>Ingrédients</Text>
            <Text style={styles.aideIngredients}>
              {ingredientsPrets.size} sur {recette.ingredients.length} utilisés
            </Text>
          </View>
          {ingredientsEtapeActive.length > 0 ? (
            <>
              <Text style={styles.sousTitreIngredients}>Pour cette étape</Text>
              {ingredientsEtapeActive.map((ingredient) => ligneIngredient(ingredient, true))}
              <Text style={[styles.sousTitreIngredients, { color: theme.colors.textMuted }]}>Toute la recette</Text>
            </>
          ) : null}
          {recette.ingredients.filter((i) => !idsEtapeActive.has(i.id)).map((ingredient) => ligneIngredient(ingredient))}
        </ScrollView>
      ) : null}
      </View>

      <FenetreMinuteur
        visible={fenetreMinuteurVisible}
        nomParDefaut={nomMinuteurParDefaut()}
        onFermer={() => setFenetreMinuteurVisible(false)}
        onValider={(nom, dureeMs) => {
          setFenetreMinuteurVisible(false);
          lancerMinuteur(nom, dureeMs, false);
        }}
      />

      <FeuilleBas visible={modaleTerminerVisible} titre="Terminer la recette ?" onFermer={() => setModaleTerminerVisible(false)}>
        <Text style={styles.modaleTexte}>
          « {recette.titre} » ne sera plus dans les recettes en cours
          {toutesCochees ? '.' : ', même si toutes les étapes ne sont pas cochées.'}
        </Text>
        {!estSousRecette && (
          <Bouton titre="Terminer et raconter mon essai" module="recettes" icone="create-outline" onPress={() => terminer(true)} />
        )}
        {!estSousRecette && (
          <Bouton titre="Terminer et laisser un commentaire" variante="secondaire" icone="chatbubble-outline" onPress={() => terminer('commenter')} />
        )}
        <Bouton
          titre={estSousRecette ? 'Terminer' : 'Terminer, raconter plus tard'}
          variante="secondaire"
          icone="checkmark-done-outline"
          onPress={() => terminer(false)}
        />
        <Bouton titre="Continuer à cuisiner" variante="lien" onPress={() => setModaleTerminerVisible(false)} />
      </FeuilleBas>

      <Modal visible={modaleTermineeVisible} transparent animationType="fade" onRequestClose={() => setModaleTermineeVisible(false)}>
        <View style={styles.modaleFond}>
          <View style={styles.modaleCarte}>
            <Text style={styles.modaleTitre}>Sous-recette terminée</Text>
            <Text style={styles.modaleTexte}>
              « {recette.titre} » est prête. Vous pouvez revenir à la recette d'origine.
            </Text>
            <View style={styles.modaleActions}>
              <Pressable style={styles.modaleBoutonSecondaire} onPress={() => setModaleTermineeVisible(false)}>
                <Text style={styles.modaleBoutonSecondaireTexte}>Rester ici</Text>
              </Pressable>
              <Pressable style={styles.modaleBoutonPrincipal} onPress={() => navigation.goBack()}>
                <Text style={styles.modaleBoutonPrincipalTexte}>← Retour à la recette</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = creerStylesThemes(() => ({
  questionSaisie: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingBottom: 8, alignItems: 'center' },
  questionChamp: {
    flex: 1,
    minHeight: 48,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radii.md,
    paddingHorizontal: 12,
    backgroundColor: theme.colors.surface,
    color: theme.colors.text,
    fontFamily: theme.fontBody,
    fontSize: 16,
  },
  questionEnvoyer: {
    minHeight: 48,
    paddingHorizontal: 16,
    borderRadius: theme.radii.md,
    backgroundColor: theme.colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  questionEnvoyerTexte: { fontFamily: theme.fontBodyBold, fontSize: 15, color: theme.colors.background },
  bulle: {
    marginHorizontal: 16,
    marginBottom: 8,
    padding: 14,
    gap: 6,
    borderRadius: 18,
    backgroundColor: theme.colors.text,
  },
  bulleEntete: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  bulleQuestion: { flex: 1, fontFamily: theme.fontBody, fontSize: 13, color: theme.colors.background, opacity: 0.8 },
  bulleFermer: { fontSize: 16, color: theme.colors.background, paddingHorizontal: 4 },
  bulleChargement: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  bulleTexte: { fontFamily: theme.fontBody, fontSize: 18, lineHeight: 26, color: theme.colors.background },
  titreElement: {
    fontFamily: theme.fontManuscrit,
    fontSize: 22,
    color: theme.colors.accent,
    marginTop: theme.spacing.sm,
    marginBottom: -theme.spacing.xs,
  },
  astuces: {
    backgroundColor: theme.colors.selectionTransparent,
    borderColor: theme.colors.accent,
    borderLeftWidth: 3,
    borderRadius: theme.radii.sm,
    padding: theme.spacing.sm,
    gap: 4,
    marginTop: theme.spacing.xs,
  },
  astucesTitre: { fontFamily: theme.fontManuscrit, fontSize: 18, color: theme.colors.accent },
  astuceTexte: { fontFamily: theme.fontBody, fontSize: 15, color: theme.colors.text, lineHeight: 21 },
  boutonRaconter: {
    marginTop: theme.spacing.sm,
    backgroundColor: theme.colors.accent,
    borderRadius: theme.radii.md,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    alignSelf: 'center',
  },
  boutonRaconterTexte: { fontFamily: theme.fontBodyBold, fontSize: 15, color: theme.colors.background },
  container: { flex: 1, backgroundColor: theme.colors.background, paddingTop: theme.spacing.lg },
  // Tablette (R-10).
  deuxColonnes: { flex: 1, flexDirection: 'row', gap: theme.spacing.md, paddingRight: theme.spacing.lg },
  colonneEtapes: { flex: 3 },
  colonneIngredients: {
    flex: 2,
    alignSelf: 'stretch',
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: 20,
    marginBottom: theme.spacing.lg,
  },
  colonneIngredientsContenu: { padding: theme.spacing.lg, gap: 2 },
  enteteIngredients: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: theme.spacing.sm },
  titreIngredients: { fontFamily: theme.fontTitleBold, fontSize: 22, color: theme.colors.text },
  sousTitreIngredients: {
    fontFamily: theme.fontBodyBold,
    fontSize: 12,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    color: theme.colors.accent,
    marginTop: theme.spacing.sm,
    marginBottom: 4,
  },
  ligneIngredientEnAvant: { backgroundColor: theme.colors.selection, borderRadius: 12, paddingHorizontal: theme.spacing.sm },
  ingredientEnAvant: { fontFamily: theme.fontBodyBold },
  texteEtapeGrand: { fontSize: 28, lineHeight: 38 },
  progressionTablette: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, paddingHorizontal: theme.spacing.lg, paddingBottom: theme.spacing.sm },
  progressionTabletteTexte: { fontFamily: theme.fontBodyBold, fontSize: 14, color: theme.colors.accent },
  progressionBarre: { flex: 1, height: 6, borderRadius: 3, backgroundColor: theme.colors.selection },
  progressionRemplie: { height: 6, borderRadius: 3, backgroundColor: theme.colors.accent },
  piedTablette: { paddingHorizontal: theme.spacing.lg, paddingBottom: theme.spacing.lg, gap: theme.spacing.md },
  apercuSuivante: { backgroundColor: theme.colors.selection, borderRadius: 18, padding: theme.spacing.md, gap: 4 },
  apercuSuivanteTitre: { fontFamily: theme.fontBodyBold, fontSize: 12, letterSpacing: 0.4, textTransform: 'uppercase', color: theme.colors.textMuted },
  apercuSuivanteTexte: { fontFamily: theme.fontBody, fontSize: 17, lineHeight: 24, color: theme.colors.text },
  boutonsTablette: { flexDirection: 'row', gap: theme.spacing.md },
  boutonTablette: { height: 60, borderRadius: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: theme.spacing.sm },
  boutonTabletteSecondaire: { flex: 1, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface },
  boutonTabletteSecondaireTexte: { fontFamily: theme.fontBodyBold, fontSize: 17, color: theme.colors.text },
  boutonTablettePrincipal: { flex: 1.4, backgroundColor: theme.colors.accent },
  boutonTablettePrincipalTexte: { fontFamily: theme.fontBodyBold, fontSize: 17, color: theme.colors.background },
  centre: { flex: 1, backgroundColor: theme.colors.background, alignItems: 'center', justifyContent: 'center', padding: theme.spacing.lg },
  texteVide: { fontFamily: theme.fontBody, color: theme.colors.textMuted, textAlign: 'center' },
  partsZone: {
    alignItems: 'center',
    gap: theme.spacing.xs,
    marginBottom: theme.spacing.sm,
    paddingHorizontal: theme.spacing.lg,
  },
  aideIngredients: { fontFamily: theme.fontBody, fontSize: 14, color: theme.colors.textMuted },
  ligneIngredient: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    minHeight: 48,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  ingredientListe: { flex: 1, fontFamily: theme.fontBody, fontSize: 16, color: theme.colors.text },
  ingredientPret: { color: theme.colors.textMuted, textDecorationLine: 'line-through' },
  partsLabel: { fontFamily: theme.fontBody, color: theme.colors.textMuted },
  partsBouton: { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, borderWidth: 1, borderRadius: theme.radii.sm, width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  partsBoutonTexte: { fontFamily: theme.fontBodyBold, color: theme.colors.accent, fontSize: 18 },
  partsValeur: { fontFamily: theme.fontBodyBold, color: theme.colors.text, fontSize: 16, minWidth: 24, textAlign: 'center' },
  ecouteZone: { paddingHorizontal: theme.spacing.lg, marginBottom: theme.spacing.sm, gap: 2 },
  ecouteTexte: { fontFamily: theme.fontBody, color: theme.colors.textMuted, fontSize: 13, textAlign: 'center' },
  ecouteErreur: { fontFamily: theme.fontBody, color: theme.colors.warning, fontSize: 13, textAlign: 'center' },
  ecouteComprise: { fontFamily: theme.fontBodyBold, color: theme.colors.success, fontSize: 14, textAlign: 'center' },
  ecouteIncomprise: { fontFamily: theme.fontBody, color: theme.colors.textMuted, fontSize: 13, textAlign: 'center' },
  repriseZone: {
    marginHorizontal: theme.spacing.lg,
    marginBottom: theme.spacing.sm,
    padding: theme.spacing.sm,
    borderRadius: theme.radii.md,
    borderColor: theme.colors.accent,
    borderWidth: 1,
    backgroundColor: theme.colors.selectionTransparent,
    gap: theme.spacing.xs,
  },
  repriseTexte: { fontFamily: theme.fontBody, color: theme.colors.text, fontSize: 15, textAlign: 'center' },
  repriseActions: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: theme.spacing.lg },
  repriseLien: { fontFamily: theme.fontBodyBold, color: theme.colors.accent, textDecorationLine: 'underline' },
  repriseFermer: { fontFamily: theme.fontBodyBold, color: theme.colors.textMuted },
  dureesEtape: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.xs },
  boutonDuree: {
    backgroundColor: theme.colors.accent,
    borderRadius: theme.radii.lg,
    paddingVertical: 4,
    paddingHorizontal: theme.spacing.sm,
  },
  boutonDureeTexte: { fontFamily: theme.fontBodyBold, color: theme.colors.background, fontSize: 14 },
  lectureZone: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'center',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
    paddingHorizontal: theme.spacing.lg,
  },
  lectureBouton: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radii.lg,
    paddingVertical: 6,
    paddingHorizontal: theme.spacing.sm,
  },
  lectureBoutonActif: {
    backgroundColor: theme.colors.selection,
    borderColor: theme.colors.accent,
  },
  lectureBoutonTexte: { fontFamily: theme.fontBody, color: theme.colors.textMuted, fontSize: 12 },
  lectureBoutonTexteActif: { color: theme.colors.accent, fontFamily: theme.fontBodyBold },
  lectureBoutonPause: {
    backgroundColor: theme.colors.accent,
    borderRadius: theme.radii.lg,
    paddingVertical: 8,
    paddingHorizontal: theme.spacing.md,
  },
  lectureBoutonPauseTexte: { fontFamily: theme.fontBodyBold, color: theme.colors.background, fontSize: 14 },
  messageTermineZone: { paddingHorizontal: theme.spacing.lg, marginBottom: theme.spacing.sm },
  messageTermine: {
    fontFamily: theme.fontBodyBold,
    color: theme.colors.success,
    textAlign: 'center',
  },
  liste: { padding: theme.spacing.lg, paddingTop: theme.spacing.xs, gap: theme.spacing.sm },
  ligneEtape: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radii.md,
    padding: theme.spacing.sm,
  },
  ligneEtapeActive: {
    borderColor: theme.colors.accent,
    borderWidth: 2,
    backgroundColor: theme.colors.selection,
  },
  ligneEtapeCochee: {
    opacity: 0.55,
  },
  ligneEtapeVerrouillee: {
    opacity: 0.4,
  },
  case: {
    width: 26,
    height: 26,
    borderRadius: theme.radii.sm,
    borderWidth: 2,
    borderColor: theme.colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  caseCochee: {
    backgroundColor: theme.colors.success,
    borderColor: theme.colors.success,
  },
  caseCocheeTexte: { color: theme.colors.background, fontFamily: theme.fontBodyBold, fontSize: 15 },
  contenuEtape: { flex: 1, gap: theme.spacing.xs },
  numeroEtape: { fontFamily: theme.fontBodyBold, color: theme.colors.textMuted, fontSize: 13 },
  numeroEtapeActif: { color: theme.colors.accent },
  ingredientsEtape: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
  },
  puceIngredientEtape: {
    backgroundColor: theme.colors.background,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radii.sm,
    paddingVertical: 3,
    paddingHorizontal: theme.spacing.sm,
  },
  puceIngredientEtapeTexte: { fontFamily: theme.fontBodyBold, color: theme.colors.text, fontSize: 15 },
  texteEtape: { fontFamily: theme.fontBody, fontSize: 18, color: theme.colors.text, lineHeight: 25 },
  texteEtapeCochee: { textDecorationLine: 'line-through', color: theme.colors.textMuted },
  boutonRecetteLiee: {
    alignSelf: 'flex-start',
    backgroundColor: theme.colors.selection,
    borderColor: theme.colors.accent,
    borderWidth: 1,
    borderRadius: theme.radii.sm,
    paddingVertical: 4,
    paddingHorizontal: theme.spacing.sm,
    marginTop: theme.spacing.xs,
  },
  boutonRecetteLieeTexte: { fontFamily: theme.fontBodyBold, color: theme.colors.accent, fontSize: 13 },
  modaleFond: {
    flex: 1,
    backgroundColor: theme.colors.voileFort,
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing.md,
  },
  modaleCarte: {
    backgroundColor: theme.colors.background,
    borderRadius: theme.radii.md,
    borderColor: theme.colors.border,
    borderWidth: 1,
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
    width: '100%',
  },
  modaleTitre: { fontFamily: theme.fontTitle, fontSize: 20, color: theme.colors.accent },
  modaleTexte: { fontFamily: theme.fontBody, color: theme.colors.text, fontSize: 15, lineHeight: 21 },
  modaleActions: { flexDirection: 'row', gap: theme.spacing.sm, marginTop: theme.spacing.xs },
  boutonTerminerEnTete: { paddingHorizontal: theme.spacing.sm, paddingVertical: 6 },
  boutonTerminerEnTeteTexte: { fontFamily: theme.fontBodyBold, fontSize: 16, color: theme.colors.accent },
  modaleBoutonSecondaire: {
    flex: 1,
    borderColor: theme.colors.accent,
    borderWidth: 1,
    borderRadius: theme.radii.md,
    paddingVertical: theme.spacing.sm,
    alignItems: 'center',
  },
  modaleBoutonSecondaireTexte: { fontFamily: theme.fontBodyBold, color: theme.colors.accent },
  modaleBoutonPrincipal: {
    flex: 1,
    backgroundColor: theme.colors.accent,
    borderRadius: theme.radii.md,
    paddingVertical: theme.spacing.sm,
    alignItems: 'center',
  },
  modaleBoutonPrincipalTexte: { fontFamily: theme.fontBodyBold, color: theme.colors.background },
}));
