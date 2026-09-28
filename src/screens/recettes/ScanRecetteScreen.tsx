import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  ActivityIndicator,
  PanResponder,
  Modal,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Image as ImageExpo } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { theme, creerStylesThemes, useLargeurContenu } from '../../theme/theme';
import {
  formulaireVide,
  nouvelIngredientBrouillon,
  nouvelleEtapeBrouillon,
  nouvellePhotoBrouillonLocale,
} from '../../services/recettes';
import type { RecetteFormulaire } from '../../services/recettes';
import { reconnaitreTexteZone, decouperIngredients, decouperEtapes, extrairePremierNombre } from '../../services/ocr';
import ZoneClavier from '../../components/ZoneClavier';

// Écran de numérisation d'une recette existante (cahier des charges §5,
// feuille de route §7 — Phase 2).
//
// Principe : la photo reste affichée à l'écran et l'utilisateur dessine
// lui-même, du doigt, un ou plusieurs rectangles autour des zones à associer
// à un champ (Titre, Ingrédients, Étapes, Parts, Préparation, Cuisson).
// Chaque zone dessinée est aussitôt étiquetée (on choisit son champ juste
// après l'avoir tracée) ; une fois toutes les zones voulues dessinées et
// étiquetées, un seul bouton « Scanner » lance la reconnaissance de texte
// sur toutes ces zones à la suite. Pour chacune, une fenêtre d'édition
// dédiée s'ouvre (dans l'ordre) où l'utilisateur peut :
//  - corriger le texte à la main ;
//  - redessiner une nouvelle zone si des lettres ont été tronquées
//    (« Rescanner ») — le nouveau texte reconnu remplace ou complète le
//    brouillon en cours, selon le contexte (voir `validerModale`) ;
//  - valider, ce qui concatène (ou remplace, en édition globale d'un champ
//    déjà rempli) le texte du champ concerné, puis enchaîne automatiquement
//    sur la zone suivante de la file s'il y en a une.
// Ce n'est qu'au moment de continuer vers la fiche recette que le découpage
// silencieux (quantités, unités, lignes d'ingrédients / étapes) est appliqué.
type ClefChamp = 'titre' | 'ingredients' | 'etapes' | 'parts' | 'preparation' | 'cuisson';

const CHAMPS: { cle: ClefChamp; libelle: string }[] = [
  { cle: 'titre', libelle: 'Titre' },
  { cle: 'ingredients', libelle: 'Ingrédients' },
  { cle: 'etapes', libelle: 'Préparation' },
  { cle: 'parts', libelle: 'Parts' },
  { cle: 'preparation', libelle: 'Prépa. (min)' },
  { cle: 'cuisson', libelle: 'Cuisson (min)' },
];

type Rectangle = { x: number; y: number; largeur: number; hauteur: number };
type TailleImage = { width: number; height: number };
type TextesChamps = Record<ClefChamp, string>;

// 'nouvelle-zone' : la modale montre UNIQUEMENT le fragment tout juste
// reconnu (pas encore ajouté au champ) — valider le CONCATÈNE au texte déjà
// présent ; redessiner REMPLACE ce fragment (on corrige un recadrage raté).
// 'edition-globale' : la modale montre le texte COMPLET déjà accumulé pour
// le champ (ouverte via le crayon) — valider REMPLACE le champ par le
// brouillon édité ; redessiner AJOUTE le nouveau texte reconnu à la suite du
// brouillon en cours (on complète un champ déjà en partie rempli).
type ModeModaleEdition = 'nouvelle-zone' | 'edition-globale';
type ModaleEdition = { champ: ClefChamp; texte: string; mode: ModeModaleEdition };

// Zone tracée par l'utilisateur, en attente d'étiquetage (champ non choisi)
// ou déjà étiquetée mais pas encore envoyée à l'OCR (en attente du bouton
// « Scanner »).
type ZoneEnAttente = { id: string; rect: Rectangle; champ: ClefChamp | null };

// Une zone étiquetée, prête à être passée à l'OCR (file de scan groupé).
type ZoneAScanner = { champ: ClefChamp; rect: Rectangle };

function textesVides(): TextesChamps {
  return { titre: '', ingredients: '', etapes: '', parts: '', preparation: '', cuisson: '' };
}

function nouvelIdZone(): string {
  return Math.random().toString(36).slice(2, 10);
}

// Normalise un rectangle tracé (l'utilisateur peut dessiner dans n'importe
// quel sens) et rejette les tracés trop petits (probable simple tapotement).
function normaliserRectangle(zone: Rectangle): Rectangle | null {
  const x = Math.max(0, Math.min(zone.x, zone.x + zone.largeur));
  const y = Math.max(0, Math.min(zone.y, zone.y + zone.hauteur));
  const largeur = Math.abs(zone.largeur);
  const hauteur = Math.abs(zone.hauteur);
  if (largeur < 12 || hauteur < 12) return null;
  return { x, y, largeur, hauteur };
}

// Aplatit un texte multi-lignes en une seule phrase continue (espaces au
// lieu de sauts de ligne) — utilisé pour le champ Préparation : les sauts de
// ligne renvoyés par l'OCR ne marquent en général que la largeur de la page
// imprimée, pas une nouvelle étape (une étape découpée sur deux lignes se
// retrouvait sinon coupée en deux étapes distinctes). C'est ensuite
// l'utilisateur qui marque les vraies coupures d'étape en insérant lui-même
// un retour à la ligne dans la fenêtre d'édition (voir son texte d'aide).
function aplatirEnPhrase(texte: string): string {
  return texte.replace(/\s*\n+\s*/g, ' ').replace(/\s{2,}/g, ' ').trim();
}

export default function ScanRecetteScreen({ navigation }: any) {
  const { width: largeurFenetre, height: hauteurFenetre } = useLargeurContenu();
  const largeurMaxImage = largeurFenetre - 2 * theme.spacing.md;
  // Fenêtre de zonage agrandie vers le bas : on lui laisse jusqu'à ~60 % de
  // la hauteur d'écran (au lieu de se limiter à la largeur de l'écran), pour
  // rendre le dessin d'une zone plus précis, surtout sur une photo au format
  // paysage.
  const hauteurMaxImage = hauteurFenetre * 0.6;

  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [tailleImage, setTailleImage] = useState<TailleImage | null>(null);
  const [zoneEnCours, setZoneEnCours] = useState<Rectangle | null>(null);
  const [chargementZone, setChargementZone] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const [textes, setTextes] = useState<TextesChamps>(textesVides());

  // Zones tracées sur la photo courante, pas encore envoyées à l'OCR :
  // certaines attendent encore qu'on choisisse leur champ (`champ: null`),
  // d'autres sont déjà étiquetées et prêtes pour le scan groupé.
  const [zonesEnAttente, setZonesEnAttente] = useState<ZoneEnAttente[]>([]);
  // Identifiant de la zone pour laquelle le panneau de choix du champ est
  // actuellement affiché (toujours la zone qui vient d'être tracée).
  const [zoneEnEtiquetage, setZoneEnEtiquetage] = useState<string | null>(null);
  // Nombre de zones encore à traiter après celle en cours de scan, pour
  // afficher un état d'avancement pendant le scan groupé.
  const [zonesRestantesFile, setZonesRestantesFile] = useState(0);

  // Fenêtre d'édition dédiée (voir le commentaire de ModeModaleEdition
  // ci-dessus) — une seule grande zone de texte, bien plus confortable à
  // corriger qu'un champ minuscule.
  const [modaleEdition, setModaleEdition] = useState<ModaleEdition | null>(null);
  // Mémorise, le temps d'un redessin demandé depuis la modale ("Rescanner"),
  // le champ/mode/texte de départ à reprendre une fois la nouvelle zone
  // reconnue — ce n'est qu'une ref (pas un state) car elle n'a aucun effet
  // sur le rendu tant que le nouveau tracé n'est pas terminé.
  const attenteApresScanRef = useRef<{ champ: ClefChamp; mode: ModeModaleEdition; texteBase: string } | null>(null);
  // File des zones étiquetées restant à scanner (scan groupé) — une simple
  // ref suffit : elle n'a d'effet sur l'affichage qu'au travers de
  // `zonesRestantesFile` et de l'ouverture successive des modales.
  const fileScanRef = useRef<ZoneAScanner[]>([]);

  // Le PanResponder est créé une seule fois : on lui fournit l'état courant
  // via des refs (sinon il resterait figé sur les valeurs du premier rendu —
  // "stale closure").
  const photoUriRef = useRef(photoUri);
  const tailleImageRef = useRef(tailleImage);
  const chargementZoneRef = useRef(chargementZone);
  const zoneEnEtiquetageRef = useRef(zoneEnEtiquetage);

  // Calcule la taille d'affichage en ajustant la photo (à son ratio réel)
  // dans un rectangle borné en largeur ET en hauteur, plutôt que de se caler
  // uniquement sur la largeur de l'écran — c'est ce qui permet d'agrandir la
  // fenêtre de zonage vers le bas pour une photo au format paysage. Tant que
  // la taille réelle n'est pas connue (ou invalide), on affiche un cadre
  // carré par défaut plutôt qu'un cadre de hauteur nulle (invisible).
  let largeurImage = largeurMaxImage;
  let hauteurImage = Math.min(largeurMaxImage, hauteurMaxImage);
  if (tailleImage && tailleImage.width > 0 && tailleImage.height > 0) {
    hauteurImage = (largeurMaxImage * tailleImage.height) / tailleImage.width;
    if (hauteurImage > hauteurMaxImage) {
      hauteurImage = hauteurMaxImage;
      largeurImage = (hauteurMaxImage * tailleImage.width) / tailleImage.height;
    }
  }
  // Comme le PanResponder ci-dessous n'est créé qu'une seule fois (voir son
  // commentaire), `largeurImage` doit lui aussi être lu via une ref à jour —
  // sinon le recadrage utiliserait toujours la largeur du tout premier rendu
  // (avant même le choix d'une photo), fausse dès qu'une photo au format
  // paysage réduit l'image affichée pour tenir dans `hauteurMaxImage`.
  const largeurImageRef = useRef(largeurImage);
  useEffect(() => {
    photoUriRef.current = photoUri;
    tailleImageRef.current = tailleImage;
    chargementZoneRef.current = chargementZone;
    zoneEnEtiquetageRef.current = zoneEnEtiquetage;
    largeurImageRef.current = largeurImage;
  }, [photoUri, tailleImage, chargementZone, zoneEnEtiquetage, largeurImage]);

  // Sur iPad (et parfois ailleurs), le geste de dessin d'une zone était
  // capturé par le défilement de la ScrollView parente au lieu de notre
  // PanResponder : impossible de terminer le tracé, tout l'écran défilait à
  // la place. On verrouille donc le défilement pendant le tracé, et on
  // empêche explicitement la ScrollView de reprendre la main en cours de
  // route.
  const [scrollVerrouille, setScrollVerrouille] = useState(false);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponderCapture: () => !chargementZoneRef.current && !zoneEnEtiquetageRef.current,
      onMoveShouldSetPanResponderCapture: () => !chargementZoneRef.current && !zoneEnEtiquetageRef.current,
      onStartShouldSetPanResponder: () => !chargementZoneRef.current && !zoneEnEtiquetageRef.current,
      onMoveShouldSetPanResponder: () => !chargementZoneRef.current && !zoneEnEtiquetageRef.current,
      onPanResponderTerminationRequest: () => false,
      onShouldBlockNativeResponder: () => true,
      onPanResponderGrant: (evenement) => {
        setErreur(null);
        setScrollVerrouille(true);
        const { locationX, locationY } = evenement.nativeEvent;
        setZoneEnCours({ x: locationX, y: locationY, largeur: 0, hauteur: 0 });
      },
      onPanResponderMove: (evenement) => {
        const { locationX, locationY } = evenement.nativeEvent;
        setZoneEnCours((zone) => {
          if (!zone) return zone;
          return { ...zone, largeur: locationX - zone.x, hauteur: locationY - zone.y };
        });
      },
      onPanResponderRelease: () => {
        setScrollVerrouille(false);
        setZoneEnCours((zone) => {
          if (zone) gererNouvelleZoneDessinee(zone);
          return null;
        });
      },
      onPanResponderTerminate: () => {
        setScrollVerrouille(false);
        setZoneEnCours(null);
      },
    })
  ).current;

  // Reprend la file de scan groupé s'il en reste, sauf si une reprise
  // ("Rescanner") est en attente d'un nouveau tracé — dans ce cas on ne
  // touche à rien tant que ce tracé correctif n'est pas terminé.
  const avancerFileSiPossible = () => {
    if (attenteApresScanRef.current) return;
    const prochaine = fileScanRef.current.shift();
    setZonesRestantesFile(fileScanRef.current.length);
    if (prochaine) {
      lancerScanUnique(prochaine.champ, prochaine.rect);
    }
  };

  // Si une reprise ("Rescanner") était en attente et que le nouveau tracé
  // échoue ou est ignoré, on rouvre la modale sur son état précédent plutôt
  // que de laisser l'utilisateur sans fenêtre d'édition ; sinon (tracé libre
  // ou zone de la file), on enchaîne simplement sur la suite de la file.
  const restaurerOuAvancer = () => {
    const attente = attenteApresScanRef.current;
    attenteApresScanRef.current = null;
    if (attente) {
      setModaleEdition({ champ: attente.champ, texte: attente.texteBase, mode: attente.mode });
    } else {
      avancerFileSiPossible();
    }
  };

  // Recadre la zone donnée, lance l'OCR dessus, puis ouvre la modale de
  // relecture — utilisé aussi bien pour un tracé correctif ("Rescanner")
  // que pour chaque zone de la file de scan groupé.
  const lancerScanUnique = async (champ: ClefChamp, zoneEcran: Rectangle) => {
    const uri = photoUriRef.current;
    const taille = tailleImageRef.current;
    if (!uri || !taille) {
      restaurerOuAvancer();
      return;
    }

    setErreur(null);
    setChargementZone(true);
    try {
      const { uri: uriRecadree } = await recadrerImage(uri, taille, largeurImageRef.current, zoneEcran);
      const texteReconnuBrut = (await reconnaitreTexteZone(uriRecadree)).trim();
      // Voir `aplatirEnPhrase` : pour la Préparation, on aplatit les sauts de
      // ligne de l'OCR (simples retours à la ligne d'imprimerie) plutôt que
      // de les traiter comme des coupures d'étape.
      const texteReconnu = champ === 'etapes' ? aplatirEnPhrase(texteReconnuBrut) : texteReconnuBrut;

      const attente = attenteApresScanRef.current;
      attenteApresScanRef.current = null;
      if (attente && attente.champ === champ) {
        // Reprise depuis "Rescanner" : en mode 'nouvelle-zone' (on corrige un
        // recadrage raté) le nouveau texte REMPLACE le fragment précédent —
        // sauf s'il est vide, pour ne pas effacer un résultat partiel par un
        // échec total. En mode 'edition-globale' (on complète un champ déjà
        // rempli), le nouveau texte est simplement ajouté à la suite.
        const texteRepris =
          attente.mode === 'nouvelle-zone'
            ? texteReconnu || attente.texteBase
            : [attente.texteBase, texteReconnu].filter(Boolean).join('\n');
        setModaleEdition({ champ, texte: texteRepris, mode: attente.mode });
      } else {
        // Zone "de zéro" (tracé libre ou zone de la file) : ouvre la modale
        // sur le fragment tout juste reconnu — le champ n'est concaténé
        // qu'au moment de valider (voir `validerModale`).
        setModaleEdition({ champ, texte: texteReconnu, mode: 'nouvelle-zone' });
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Une erreur est survenue pendant la reconnaissance de texte.';
      setErreur(message);
      restaurerOuAvancer();
    } finally {
      setChargementZone(false);
    }
  };

  // Appelé à chaque fin de tracé sur la photo. Deux cas : un tracé correctif
  // demandé depuis la modale ("Rescanner", champ déjà connu) — on scanne
  // aussitôt ; ou un tracé libre — on ajoute la zone à la liste en attente
  // d'étiquetage plutôt que de scanner immédiatement, pour permettre de
  // dessiner plusieurs zones avant de lancer un scan groupé.
  const gererNouvelleZoneDessinee = (zoneEcran: Rectangle) => {
    const rect = normaliserRectangle(zoneEcran);
    if (!rect) {
      restaurerOuAvancer();
      return;
    }

    const attente = attenteApresScanRef.current;
    if (attente) {
      lancerScanUnique(attente.champ, rect);
      return;
    }

    const id = nouvelIdZone();
    setZonesEnAttente((zs) => [...zs, { id, rect, champ: null }]);
    setZoneEnEtiquetage(id);
  };

  const etiqueterZone = (champ: ClefChamp) => {
    if (!zoneEnEtiquetage) return;
    const id = zoneEnEtiquetage;
    setZonesEnAttente((zs) => zs.map((z) => (z.id === id ? { ...z, champ } : z)));
    setZoneEnEtiquetage(null);
  };

  const supprimerZoneEnAttente = (id: string) => {
    setZonesEnAttente((zs) => zs.filter((z) => z.id !== id));
    setZoneEnEtiquetage((courant) => (courant === id ? null : courant));
  };

  // Lance le scan de toutes les zones déjà étiquetées, dans l'ordre où elles
  // ont été dessinées ; les zones pas encore étiquetées restent affichées.
  const lancerScanGroupe = () => {
    const aScanner = zonesEnAttente.filter(
      (z): z is ZoneEnAttente & { champ: ClefChamp } => z.champ !== null
    );
    if (aScanner.length === 0) return;
    fileScanRef.current = aScanner.map(({ champ, rect }) => ({ champ, rect }));
    setZonesEnAttente((zs) => zs.filter((z) => z.champ === null));
    avancerFileSiPossible();
  };

  const choisirPhoto = (uri: string, largeurOriginale: number, hauteurOriginale: number) => {
    setPhotoUri(uri);
    setTailleImage({ width: largeurOriginale, height: hauteurOriginale });
    setTextes(textesVides());
    setErreur(null);
    setModaleEdition(null);
    setZonesEnAttente([]);
    setZoneEnEtiquetage(null);
    setZonesRestantesFile(0);
    attenteApresScanRef.current = null;
    fileScanRef.current = [];
  };

  const prendrePhoto = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) return;
    const resultat = await ImagePicker.launchCameraAsync({ quality: 0.8 });
    if (!resultat.canceled && resultat.assets[0]) {
      const asset = resultat.assets[0];
      choisirPhoto(asset.uri, asset.width, asset.height);
    }
  };

  const choisirDansGalerie = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return;
    const resultat = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
    if (!resultat.canceled && resultat.assets[0]) {
      const asset = resultat.assets[0];
      choisirPhoto(asset.uri, asset.width, asset.height);
    }
  };

  // Ouvre la modale d'édition sur le texte déjà accumulé pour un champ
  // (déclenché par le crayon d'une carte) plutôt que d'éditer en ligne dans
  // une zone de texte minuscule.
  const ouvrirEditionGlobale = (champ: ClefChamp) => {
    setModaleEdition({ champ, texte: textes[champ], mode: 'edition-globale' });
  };

  const validerModale = () => {
    if (!modaleEdition) return;
    const { champ, texte, mode } = modaleEdition;
    if (mode === 'nouvelle-zone') {
      const propre = texte.trim();
      if (propre) {
        setTextes((t) => ({ ...t, [champ]: t[champ] ? `${t[champ]}\n${propre}` : propre }));
      }
    } else {
      setTextes((t) => ({ ...t, [champ]: texte }));
    }
    setModaleEdition(null);
    avancerFileSiPossible();
  };

  const annulerModale = () => {
    attenteApresScanRef.current = null;
    setModaleEdition(null);
    avancerFileSiPossible();
  };

  // Referme la modale et renvoie à la photo pour dessiner une nouvelle zone
  // — utile quand des lettres ont été tronquées par un recadrage trop juste.
  // On n'avance pas la file ici : elle reprendra une fois ce tracé correctif
  // résolu (voir `restaurerOuAvancer` / `lancerScanUnique`).
  const rescannerDepuisModale = () => {
    if (!modaleEdition) return;
    attenteApresScanRef.current = { champ: modaleEdition.champ, mode: modaleEdition.mode, texteBase: modaleEdition.texte };
    setModaleEdition(null);
  };

  // Fonction silencieuse (aucune interaction utilisateur) : ne s'exécute
  // qu'au moment de continuer, pour détecter quantités/unités des
  // ingrédients et pré-découper les étapes.
  const continuer = () => {
    if (!photoUri) return;
    const form: RecetteFormulaire = {
      ...formulaireVide(),
      photos: [nouvellePhotoBrouillonLocale(photoUri)],
      source: 'scan',
      titre: textes.titre.split('\n')[0]?.trim() ?? '',
      partsDefaut: extrairePremierNombre(textes.parts) ?? formulaireVide().partsDefaut,
      tempsPreparationMinutes: extrairePremierNombre(textes.preparation),
      tempsCuissonMinutes: extrairePremierNombre(textes.cuisson),
      ingredients: decouperIngredients(textes.ingredients),
      etapes: decouperEtapes(textes.etapes),
    };
    if (form.ingredients.length === 0) form.ingredients = [nouvelIngredientBrouillon()];
    if (form.etapes.length === 0) form.etapes = [nouvelleEtapeBrouillon()];

    navigation.navigate('CreationRecette', { formulaireInitial: form });
  };

  const auMoinsUnTexte = Object.values(textes).some((t) => t.trim());
  const libelleChampModale = modaleEdition ? CHAMPS.find((c) => c.cle === modaleEdition.champ)?.libelle : '';
  const zoneActive = zonesEnAttente.find((z) => z.id === zoneEnEtiquetage) ?? null;
  const zonesEtiquetees = zonesEnAttente.filter((z) => z.champ !== null);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contenu} scrollEnabled={!scrollVerrouille}>
      {!photoUri ? (
        <View style={styles.choixPhoto}>
          <Text style={styles.aide}>
            Photographiez ou importez une recette existante (livre, feuille manuscrite ou imprimée) : vous
            pourrez ensuite entourer chaque partie du texte (titre, ingrédients, préparation…) pour la
            reconnaître automatiquement.
          </Text>
          <Pressable style={styles.boutonPrincipal} onPress={prendrePhoto}>
            <Text style={styles.boutonPrincipalTexte}>Prendre une photo</Text>
          </Pressable>
          <Pressable style={styles.boutonSecondaire} onPress={choisirDansGalerie}>
            <Text style={styles.boutonSecondaireTexte}>Choisir dans la galerie</Text>
          </Pressable>
        </View>
      ) : (
        <>
          <Text style={styles.label}>
            Entourez sur la photo une ou plusieurs zones. Après chaque tracé, indiquez le champ concerné, puis
            lancez le scan une fois toutes vos zones dessinées.
          </Text>

          <View style={[styles.zoneImage, { width: largeurImage, height: hauteurImage }]} {...panResponder.panHandlers}>
            <ImageExpo
              source={{ uri: photoUri ?? undefined }}
              // Taille explicite plutôt que StyleSheet.absoluteFillObject :
              // un enfant en position absolue à 100% dans un parent dont la
              // largeur/hauteur vient d'un style calculé en ligne peut être
              // mesuré à une taille nulle par le moteur de mise en page
              // (Fabric/New Architecture) alors même que le cadre parent
              // s'affiche correctement.
              style={{ width: largeurImage, height: hauteurImage }}
              contentFit="contain"
              onLoad={(evenement) => {
                // La taille renvoyée par le sélecteur de photo n'est pas
                // toujours fiable (0, absente, ou inversée selon l'EXIF) : on
                // la recale ici sur la taille réelle de l'image décodée, seule
                // source fiable pour calculer le recadrage plus tard.
                const { width, height } = evenement.source;
                if (width && height) setTailleImage({ width, height });
              }}
              onError={(evenement) => {
                setErreur(`Impossible d'afficher la photo (${evenement.error ?? 'raison inconnue'}).`);
              }}
            />
            {zonesEnAttente.map((zone, index) => (
              <View
                key={zone.id}
                pointerEvents="none"
                style={[
                  styles.rectangleZoneAttente,
                  zone.id === zoneEnEtiquetage && styles.rectangleZoneAttenteActive,
                  {
                    left: zone.rect.x,
                    top: zone.rect.y,
                    width: zone.rect.largeur,
                    height: zone.rect.hauteur,
                  },
                ]}
              >
                <View style={styles.badgeNumero}>
                  <Text style={styles.badgeNumeroTexte}>{index + 1}</Text>
                </View>
              </View>
            ))}
            {zoneEnCours && (
              <View
                pointerEvents="none"
                style={[
                  styles.rectangleTrace,
                  {
                    left: Math.min(zoneEnCours.x, zoneEnCours.x + zoneEnCours.largeur),
                    top: Math.min(zoneEnCours.y, zoneEnCours.y + zoneEnCours.hauteur),
                    width: Math.abs(zoneEnCours.largeur),
                    height: Math.abs(zoneEnCours.hauteur),
                  },
                ]}
              />
            )}
            {chargementZone && (
              <View style={styles.voileChargement} pointerEvents="none">
                <ActivityIndicator color={theme.colors.accent} />
              </View>
            )}
          </View>

          <Pressable onPress={choisirDansGalerie}>
            <Text style={styles.lienChangerPhoto}>Changer de photo</Text>
          </Pressable>

          {chargementZone && (
            <Text style={styles.statutFile}>
              Reconnaissance du texte en cours…
              {zonesRestantesFile > 0
                ? ` (encore ${zonesRestantesFile} zone${zonesRestantesFile > 1 ? 's' : ''} après celle-ci)`
                : ''}
            </Text>
          )}

          {erreur && !modaleEdition && <Text style={styles.erreur}>{erreur}</Text>}

          {zoneActive && (
            <View style={styles.panneauEtiquetage}>
              <Text style={styles.sousLabel}>
                Zone {zonesEnAttente.findIndex((z) => z.id === zoneActive.id) + 1} — à quel champ correspond-elle ?
              </Text>
              <View style={styles.chips}>
                {CHAMPS.map((champ) => (
                  <Pressable key={champ.cle} style={styles.chip} onPress={() => etiqueterZone(champ.cle)}>
                    <Text style={styles.chipTexte}>{champ.libelle}</Text>
                  </Pressable>
                ))}
              </View>
              <Pressable onPress={() => supprimerZoneEnAttente(zoneActive.id)}>
                <Text style={styles.lienSupprimerZone}>Supprimer cette zone</Text>
              </Pressable>
            </View>
          )}

          {!zoneActive && zonesEnAttente.length > 0 && (
            <View style={styles.listeZonesAttente}>
              {zonesEnAttente.map((zone, index) => (
                <Pressable key={zone.id} style={styles.ligneZoneAttente} onPress={() => setZoneEnEtiquetage(zone.id)}>
                  <Text style={styles.ligneZoneAttenteTexte}>
                    Zone {index + 1} — {zone.champ ? CHAMPS.find((c) => c.cle === zone.champ)?.libelle : 'à étiqueter'}
                  </Text>
                  <Pressable hitSlop={8} onPress={() => supprimerZoneEnAttente(zone.id)}>
                    <Text style={styles.ligneZoneAttenteSuppr}>✕</Text>
                  </Pressable>
                </Pressable>
              ))}
            </View>
          )}

          {zonesEtiquetees.length > 0 && (
            <Pressable style={styles.boutonPrincipal} onPress={lancerScanGroupe} disabled={chargementZone}>
              <Text style={styles.boutonPrincipalTexte}>
                Scanner {zonesEtiquetees.length > 1 ? `les ${zonesEtiquetees.length} zones` : 'cette zone'}
              </Text>
            </Pressable>
          )}

          <View style={styles.cartesChamps}>
            {CHAMPS.map((champ) => (
              <View key={champ.cle} style={styles.carteChamp}>
                <View style={styles.enTeteCarteChamp}>
                  <Text style={styles.sousLabel}>{champ.libelle}</Text>
                  <Pressable hitSlop={8} onPress={() => ouvrirEditionGlobale(champ.cle)}>
                    <Text style={styles.crayon}>✎</Text>
                  </Pressable>
                </View>
                <Text style={styles.apercuChamp} numberOfLines={3}>
                  {textes[champ.cle].trim() || '—'}
                </Text>
              </View>
            ))}
          </View>

          <Pressable
            style={[styles.boutonPrincipal, !auMoinsUnTexte && styles.boutonDesactive]}
            onPress={continuer}
            disabled={!auMoinsUnTexte}
          >
            <Text style={styles.boutonPrincipalTexte}>Continuer vers la fiche recette</Text>
          </Pressable>
        </>
      )}

      <Modal visible={modaleEdition !== null} animationType="slide" onRequestClose={annulerModale}>
        <ZoneClavier sansEnTete style={styles.modaleConteneur}>
          <Text style={styles.modaleTitre}>{libelleChampModale}</Text>
          <Text style={styles.modaleAide}>
            {modaleEdition?.mode === 'nouvelle-zone'
              ? "Corrigez le texte reconnu pour cette zone si besoin. « Rescanner » remplace ce texte si des lettres ont été tronquées ; « Valider » l'ajoute au champ."
              : "Modifiez librement le texte déjà accumulé pour ce champ. « Rescanner » ajoute le texte d'une nouvelle zone à la suite ; « Valider » remplace le champ par ce texte."}
          </Text>
          {modaleEdition?.champ === 'etapes' && (
            <Text style={styles.modaleAide}>
              Chaque retour à la ligne dans ce texte marque le début d'une nouvelle étape. Le texte reconnu est
              affiché en un seul bloc (les retours à la ligne de l'OCR ne sont que des fins de ligne
              d'imprimerie) : placez le curseur juste avant le début d'une étape et appuyez sur « Entrée » pour
              la séparer de la précédente.
            </Text>
          )}
          <TextInput
            style={styles.modaleTexte}
            multiline
            autoFocus
            value={modaleEdition?.texte ?? ''}
            onChangeText={(v) => setModaleEdition((m) => (m ? { ...m, texte: v } : m))}
            placeholder="Aucun texte reconnu — saisissez-le à la main ou redessinez la zone."
            placeholderTextColor={theme.colors.textMuted}
          />
          {erreur && <Text style={styles.erreur}>{erreur}</Text>}
          <View style={styles.modaleActions}>
            <Pressable style={styles.modaleBoutonTertiaire} onPress={annulerModale}>
              <Text style={styles.modaleBoutonTertiaireTexte}>Annuler</Text>
            </Pressable>
            <Pressable style={styles.modaleBoutonSecondaire} onPress={rescannerDepuisModale}>
              <Text style={styles.modaleBoutonSecondaireTexte}>Rescanner</Text>
            </Pressable>
            <Pressable style={styles.modaleBoutonPrincipal} onPress={validerModale}>
              <Text style={styles.modaleBoutonPrincipalTexte}>Valider</Text>
            </Pressable>
          </View>
        </ZoneClavier>
      </Modal>
    </ScrollView>
  );
}

// Recadre la photo sur le rectangle dessiné à l'écran, en convertissant les
// coordonnées écran (relatives à `largeurAffichee`) vers les coordonnées
// réelles de l'image (résolution d'origine) via un simple facteur d'échelle.
// API expo-image-manipulator SDK 57 (chaînable) : manipulate(uri).crop(...).renderAsync() → saveAsync().
async function recadrerImage(
  uri: string,
  tailleReelle: TailleImage,
  largeurAffichee: number,
  zoneEcran: { x: number; y: number; largeur: number; hauteur: number }
): Promise<{ uri: string; rectanglePixels: { originX: number; originY: number; width: number; height: number } }> {
  const echelle = tailleReelle.width / largeurAffichee;
  const originX = Math.max(0, Math.round(zoneEcran.x * echelle));
  const originY = Math.max(0, Math.round(zoneEcran.y * echelle));
  const width = Math.max(1, Math.min(Math.round(zoneEcran.largeur * echelle), tailleReelle.width - originX));
  const height = Math.max(1, Math.min(Math.round(zoneEcran.hauteur * echelle), tailleReelle.height - originY));

  const contexte = ImageManipulator.ImageManipulator.manipulate(uri);
  contexte.crop({ originX, originY, width, height });
  const image = await contexte.renderAsync();
  const resultat = await image.saveAsync({ format: ImageManipulator.SaveFormat.JPEG, compress: 0.8 });
  return { uri: resultat.uri, rectanglePixels: { originX, originY, width, height } };
}

const styles = creerStylesThemes(() => ({
  container: { flex: 1, backgroundColor: theme.colors.background },
  contenu: { padding: theme.spacing.md, gap: theme.spacing.sm, paddingBottom: theme.spacing.xl },
  choixPhoto: { gap: theme.spacing.sm, marginTop: theme.spacing.lg },
  aide: { fontFamily: theme.fontBody, color: theme.colors.textMuted, fontSize: 13 },
  label: { fontFamily: theme.fontBodyBold, color: theme.colors.text, fontSize: 15 },
  sousLabel: { fontFamily: theme.fontBodyBold, color: theme.colors.text, fontSize: 14 },

  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.xs },
  chip: {
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radii.lg,
    paddingVertical: 6,
    paddingHorizontal: theme.spacing.sm,
  },
  chipTexte: { fontFamily: theme.fontBody, color: theme.colors.textMuted, fontSize: 13 },

  zoneImage: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radii.md,
    overflow: 'hidden',
    alignSelf: 'center',
  },
  rectangleTrace: {
    position: 'absolute',
    borderWidth: 2,
    borderColor: theme.colors.accent,
    backgroundColor: theme.colors.accentTransparent,
  },
  rectangleZoneAttente: {
    position: 'absolute',
    borderWidth: 2,
    borderColor: theme.colors.selection,
    backgroundColor: theme.colors.selectionTransparent,
  },
  rectangleZoneAttenteActive: {
    borderColor: theme.colors.accent,
    backgroundColor: theme.colors.accentTransparent,
  },
  badgeNumero: {
    position: 'absolute',
    top: -10,
    left: -10,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 4,
    backgroundColor: theme.colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeNumeroTexte: { fontFamily: theme.fontBodyBold, fontSize: 12, color: theme.colors.background },
  voileChargement: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: theme.colors.voileLeger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lienChangerPhoto: {
    fontFamily: theme.fontBody,
    color: theme.colors.accent,
    fontSize: 13,
    textAlign: 'center',
  },
  statutFile: {
    fontFamily: theme.fontBody,
    color: theme.colors.textMuted,
    fontSize: 13,
    textAlign: 'center',
  },
  erreur: { fontFamily: theme.fontBody, color: theme.colors.warning },

  panneauEtiquetage: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.accent,
    borderWidth: 1,
    borderRadius: theme.radii.md,
    padding: theme.spacing.sm,
    gap: theme.spacing.sm,
  },
  lienSupprimerZone: {
    fontFamily: theme.fontBody,
    color: theme.colors.warning,
    fontSize: 13,
  },

  listeZonesAttente: {
    gap: theme.spacing.xs,
  },
  ligneZoneAttente: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radii.md,
    paddingVertical: theme.spacing.xs,
    paddingHorizontal: theme.spacing.sm,
  },
  ligneZoneAttenteTexte: { fontFamily: theme.fontBody, color: theme.colors.text, fontSize: 14 },
  ligneZoneAttenteSuppr: { fontFamily: theme.fontBodyBold, color: theme.colors.warning, fontSize: 14, paddingHorizontal: 4 },

  cartesChamps: { gap: theme.spacing.sm, marginTop: theme.spacing.xs },
  carteChamp: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radii.md,
    padding: theme.spacing.sm,
    gap: theme.spacing.xs,
  },
  enTeteCarteChamp: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  crayon: { fontSize: 16, color: theme.colors.accent, paddingHorizontal: 4 },
  apercuChamp: { fontFamily: theme.fontBody, color: theme.colors.text, fontSize: 14 },

  boutonPrincipal: {
    backgroundColor: theme.colors.accent,
    borderRadius: theme.radii.md,
    paddingVertical: theme.spacing.md,
    alignItems: 'center',
    marginTop: theme.spacing.md,
  },
  boutonDesactive: { opacity: 0.5 },
  boutonPrincipalTexte: { fontFamily: theme.fontBodyBold, fontSize: 16, color: theme.colors.background },
  boutonSecondaire: {
    borderColor: theme.colors.accent,
    borderWidth: 1,
    borderRadius: theme.radii.md,
    paddingVertical: theme.spacing.md,
    alignItems: 'center',
  },
  boutonSecondaireTexte: { fontFamily: theme.fontBodyBold, fontSize: 16, color: theme.colors.accent },

  // Fenêtre d'édition dédiée (Modal plein écran) — un seul champ de texte
  // large, bien plus confortable que la petite carte pour corriger le
  // résultat d'un scan.
  modaleConteneur: {
    flex: 1,
    backgroundColor: theme.colors.background,
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  modaleTitre: { fontFamily: theme.fontTitle, fontSize: 22, color: theme.colors.accent, marginTop: theme.spacing.lg },
  modaleAide: { fontFamily: theme.fontBody, color: theme.colors.textMuted, fontSize: 13 },
  modaleTexte: {
    flex: 1,
    fontFamily: theme.fontBody,
    color: theme.colors.text,
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radii.md,
    padding: theme.spacing.sm,
    fontSize: 16,
    textAlignVertical: 'top',
  },
  modaleActions: { flexDirection: 'row', gap: theme.spacing.sm, marginBottom: theme.spacing.md },
  modaleBoutonPrincipal: {
    flex: 1,
    backgroundColor: theme.colors.accent,
    borderRadius: theme.radii.md,
    paddingVertical: theme.spacing.md,
    alignItems: 'center',
  },
  modaleBoutonPrincipalTexte: { fontFamily: theme.fontBodyBold, fontSize: 16, color: theme.colors.background },
  modaleBoutonSecondaire: {
    flex: 1,
    borderColor: theme.colors.accent,
    borderWidth: 1,
    borderRadius: theme.radii.md,
    paddingVertical: theme.spacing.md,
    alignItems: 'center',
  },
  modaleBoutonSecondaireTexte: { fontFamily: theme.fontBodyBold, fontSize: 16, color: theme.colors.accent },
  modaleBoutonTertiaire: {
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.sm,
    alignItems: 'center',
  },
  modaleBoutonTertiaireTexte: { fontFamily: theme.fontBody, fontSize: 15, color: theme.colors.textMuted },
}));
