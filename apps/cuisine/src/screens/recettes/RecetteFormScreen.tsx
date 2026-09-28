import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Pressable,
  ScrollView,
  Image,
  ActivityIndicator,
  Modal,
  Platform,
} from 'react-native';
import { alerte } from '../../utils/alerte';
import * as ImagePicker from 'expo-image-picker';
import { theme, creerStylesThemes } from '../../theme/theme';
import { useAuth } from '../../contexts/AuthContext';
import SelecteurCategories from '../../components/SelecteurCategories';
import RecadragePhotoModal from '../../components/RecadragePhotoModal';
import SelecteurRecetteLieeModal from '../../components/SelecteurRecetteLieeModal';
import {
  creerRecette,
  mettreAJourRecette,
  obtenirRecette,
  recetteVersFormulaire,
  formulaireVide,
  normaliserElements,
  nouvelElementBrouillon,
  nouvelIngredientBrouillon,
  nouvelleEtapeBrouillon,
  nouvellePhotoBrouillonLocale,
  listerRecettesPourLiaison,
} from '../../services/recettes';
import type { RecetteFormulaire, PhotoBrouillon, EtapeBrouillon } from '../../services/recettes';
import type { RecetteLiee } from '../../types/models';
import ZoneClavier from '../../components/ZoneClavier';
import ChampExtensible from '../../components/ChampExtensible';
import { decouperIngredients, reconnaitreTexteZone, texteScanneEnEtape } from '../../services/ocr';

// Formulaire de création ET de modification d'une recette (cahier des
// charges §4) : titre, photo, catégories, parts, ingrédients, étapes — avec
// insertion de rappels de quantité dans les étapes (§8). Peut être pré-rempli
// depuis l'écran de scan (route.params.formulaireInitial — §5), ou depuis une
// recette déjà enregistrée à modifier (route.params.recetteId — crayon ✎ sur
// la fiche recette), tout en restant entièrement modifiable avant
// l'enregistrement.
export default function RecetteFormScreen({ navigation, route }: any) {
  const { foyer, session } = useAuth();
  const recetteId: string | undefined = route?.params?.recetteId;
  const modeEdition = Boolean(recetteId);
  // Catégorie déjà sélectionnée si on arrive depuis l'écran d'une catégorie
  // (vignette "Ajouter" — voir RecettesCategorieScreen) : on la pré-remplit
  // pour éviter à l'utilisateur de la resaisir.
  const categoriePreselectionnee: string | undefined = route?.params?.categoriePreselectionnee;

  const [form, setForm] = useState<RecetteFormulaire>(() => {
    const initial: RecetteFormulaire = normaliserElements(route?.params?.formulaireInitial ?? formulaireVide());
    if (!modeEdition && categoriePreselectionnee && !initial.nomsCategories.includes(categoriePreselectionnee)) {
      return { ...initial, nomsCategories: [...initial.nomsCategories, categoriePreselectionnee] };
    }
    return initial;
  });
  const [chargementInitial, setChargementInitial] = useState(modeEdition);
  const [enregistrement, setEnregistrement] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  // File d'attente de recadrage : chaque photo choisie (ou déjà présente,
  // via le bouton ✂ sur une vignette) passe par la modale de recadrage
  // avant d'être ajoutée/mise à jour dans le formulaire (retour utilisateur
  // : pouvoir recadrer chaque photo avant de l'insérer dans la recette).
  // `photoEnRecadrage` est l'uri en cours de traitement (modale ouverte),
  // `fileRecadrage` les suivantes en attente lors d'un ajout multiple.
  const [photoEnRecadrage, setPhotoEnRecadrage] = useState<string | null>(null);
  const [fileRecadrage, setFileRecadrage] = useState<string[]>([]);
  // Si renseigné, la validation remplace cette photo déjà présente au lieu
  // d'en ajouter une nouvelle — cas du recadrage d'une vignette existante.
  const [clefPhotoRecadree, setClefPhotoRecadree] = useState<string | null>(null);

  // Filet de sécurité pour la fusion d'étapes (retour utilisateur : pouvoir
  // revenir en arrière en cas de mauvaise manipulation) : l'état des étapes
  // juste avant la dernière fusion, pour pouvoir la défaire d'un tap. Effacé
  // dès qu'une autre fusion a lieu ou qu'on l'utilise.
  const [etapesAvantFusion, setEtapesAvantFusion] = useState<EtapeBrouillon[] | null>(null);
  // Étape issue de la dernière fusion : le bouton d'annulation s'affiche
  // juste sous elle (et pas seulement en haut de la liste, hors de vue).
  const [etapeFusionnee, setEtapeFusionnee] = useState<string | null>(null);
  // Changement d'élément d'un ingrédient ou d'une étape (bouton ⇄) : ligne
  // concernée, et option "avec les suivants" (ex. étapes 5 à 8 → garniture).
  // "Coller une liste" d'ingrédients : élément visé (null = fenêtre fermée)
  // et texte collé.
  const [collageElement, setCollageElement] = useState<string | null>(null);
  // Scan du texte d'une étape (à tout moment, même recette déjà
  // enregistrée) : étape visée, photo en cours de recadrage, lecture en cours.
  // `type` : texte d'une étape, ou liste d'ingrédients d'un élément
  // (clefId = l'élément visé).
  const [scanEtape, setScanEtape] = useState<{ type: 'etape' | 'ingredients'; clefId: string; uri: string } | null>(
    null
  );
  const [lectureScan, setLectureScan] = useState<string | null>(null);
  const [texteColle, setTexteColle] = useState('');
  const [aDeplacer, setADeplacer] = useState<{ type: 'ingredient' | 'etape'; clefId: string } | null>(null);
  const [avecSuivants, setAvecSuivants] = useState(true);

  // Sélecteur "Lier à une recette" (retour utilisateur : pouvoir référencer
  // une sous-recette, ex. "faire une pâte brisée", depuis une étape — §8).
  // `recettesDisponibles` : recettes du foyer pouvant être liées (chargées
  // une fois, hors la recette en cours d'édition). `etapeEnLiaison` : clefId
  // de l'étape pour laquelle le sélecteur est ouvert (null = fermé).
  const [recettesDisponibles, setRecettesDisponibles] = useState<RecetteLiee[]>([]);
  const [etapeEnLiaison, setEtapeEnLiaison] = useState<string | null>(null);

  useEffect(() => {
    if (!foyer) return;
    listerRecettesPourLiaison(foyer.id, recetteId).then(setRecettesDisponibles).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [foyer, recetteId]);

  const choisirRecetteLiee = (recette: RecetteLiee | null) => {
    setForm((f) => ({
      ...f,
      etapes: f.etapes.map((e) =>
        e.clefId === etapeEnLiaison
          ? { ...e, recetteLieeId: recette?.id ?? null, recetteLieeTitre: recette?.titre ?? null }
          : e
      ),
    }));
    setEtapeEnLiaison(null);
  };

  // Sauvegarde automatique en arrière-plan (retour utilisateur), en plus du
  // bouton "Enregistrer" manuel qui reste inchangé. Volontairement limitée à
  // la MODIFICATION d'une recette déjà enregistrée : pour une création, on
  // attend le premier enregistrement manuel afin de ne pas créer de recette
  // vide ou incomplète en base pendant la saisie.
  const [dernierEnregistrementAuto, setDernierEnregistrementAuto] = useState<Date | null>(null);
  const [autoEnregistrementEnCours, setAutoEnregistrementEnCours] = useState(false);
  const [erreurAuto, setErreurAuto] = useState<string | null>(null);
  // Ignore le tout premier passage de l'effet juste après le chargement
  // initial de la recette (le formulaire vient d'être rempli depuis la
  // base : rien à réenregistrer).
  const ignorerProchaineAuto = useRef(true);
  const delaiAutoRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!modeEdition || !recetteId) return;
    obtenirRecette(recetteId)
      .then((r) => setForm(recetteVersFormulaire(r)))
      .catch((e) => setErreur(e instanceof Error ? e.message : 'Impossible de charger la recette.'))
      .finally(() => setChargementInitial(false));
  }, [modeEdition, recetteId]);

  useEffect(() => {
    if (!modeEdition || !recetteId || chargementInitial) return;
    if (ignorerProchaineAuto.current) {
      ignorerProchaineAuto.current = false;
      return;
    }
    // Pas de sauvegarde silencieuse sur un état invalide (titre vide ou
    // aucune catégorie) — mêmes règles que l'enregistrement manuel.
    if (!form.titre.trim() || form.nomsCategories.length === 0) return;
    if (delaiAutoRef.current) clearTimeout(delaiAutoRef.current);
    delaiAutoRef.current = setTimeout(async () => {
      setAutoEnregistrementEnCours(true);
      try {
        await mettreAJourRecette(recetteId, form);
        setErreurAuto(null);
        setDernierEnregistrementAuto(new Date());
      } catch (e) {
        setErreurAuto(e instanceof Error ? e.message : 'Échec de la sauvegarde automatique.');
      } finally {
        setAutoEnregistrementEnCours(false);
      }
    }, 1500);
    return () => {
      if (delaiAutoRef.current) clearTimeout(delaiAutoRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form, modeEdition, recetteId, chargementInitial]);

  // Démarre la file de recadrage sur les photos données (une ou plusieurs) —
  // voir le commentaire sur `photoEnRecadrage`/`fileRecadrage` ci-dessus.
  const demarrerFileRecadrage = (uris: string[]) => {
    if (uris.length === 0) return;
    const [premiere, ...suivantes] = uris;
    setClefPhotoRecadree(null);
    setFileRecadrage(suivantes);
    setPhotoEnRecadrage(premiere);
  };

  // Prend une nouvelle photo avec l'appareil photo (retour utilisateur :
  // pouvoir photographier directement, pas seulement choisir dans la
  // galerie), recadrée ensuite comme toute autre photo.
  const prendrePhotoAppareil = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) return;
    const resultat = await ImagePicker.launchCameraAsync({ quality: 0.9 });
    if (!resultat.canceled && resultat.assets[0]) {
      demarrerFileRecadrage([resultat.assets[0].uri]);
    }
  };

  // Choisit une ou plusieurs photos dans la galerie (retour utilisateur :
  // pouvoir en ajouter plusieurs par recette, pas une seule). Chacune passe
  // ensuite par la modale de recadrage, l'une après l'autre.
  const choisirPhotosGalerie = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return;
    const resultat = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.9,
      allowsMultipleSelection: true,
    });
    if (!resultat.canceled && resultat.assets.length > 0) {
      demarrerFileRecadrage(resultat.assets.map((asset) => asset.uri));
    }
  };

  // Propose le choix appareil photo / galerie avant d'ajouter une photo. La
  // première photo du tableau sert de couverture (affichée en vignette
  // partout ailleurs dans l'appli) — voir `enregistrerPhotos` côté service.
  const ajouterPhotos = () => {
    // Navigateur : son propre sélecteur de fichiers (qui propose aussi
    // l'appareil photo sur téléphone).
    if (Platform.OS === 'web') {
      choisirPhotosGalerie();
      return;
    }
    alerte('Ajouter une photo', undefined, [
      { text: 'Prendre une photo', onPress: prendrePhotoAppareil },
      { text: 'Choisir dans la galerie', onPress: choisirPhotosGalerie },
      { text: 'Annuler', style: 'cancel' },
    ]);
  };

  // Rouvre la modale de recadrage sur une photo déjà ajoutée (locale ou déjà
  // en ligne), pour la recadrer à nouveau ou différemment.
  const recadrerPhotoExistante = (photo: PhotoBrouillon) => {
    setClefPhotoRecadree(photo.clefId);
    setFileRecadrage([]);
    setPhotoEnRecadrage(uriPhoto(photo));
  };

  // Passe à la photo suivante de la file (nouvel ajout multiple), ou ferme
  // la modale s'il n'y en a plus.
  const passerALaPhotoSuivante = () => {
    setFileRecadrage((file) => {
      const [suivante, ...reste] = file;
      setPhotoEnRecadrage(suivante ?? null);
      return reste;
    });
  };

  const validerRecadragePhoto = (uriRecadree: string) => {
    if (clefPhotoRecadree) {
      setForm((f) => ({
        ...f,
        photos: f.photos.map((p) =>
          p.clefId === clefPhotoRecadree ? { ...p, uriLocale: uriRecadree, urlExistante: null } : p
        ),
      }));
      setClefPhotoRecadree(null);
      setPhotoEnRecadrage(null);
    } else {
      setForm((f) => ({ ...f, photos: [...f.photos, nouvellePhotoBrouillonLocale(uriRecadree)] }));
      passerALaPhotoSuivante();
    }
  };

  const annulerRecadragePhoto = () => {
    if (clefPhotoRecadree) {
      setClefPhotoRecadree(null);
      setPhotoEnRecadrage(null);
    } else {
      passerALaPhotoSuivante();
    }
  };

  const supprimerPhoto = (clefId: string) => {
    setForm((f) => ({ ...f, photos: f.photos.filter((p) => p.clefId !== clefId) }));
  };

  // Fait passer une photo en couverture (première position) — pas de
  // réordonnancement complet, juste un moyen simple de choisir laquelle des
  // photos ajoutées sert de vignette.
  const definirCommeCouverture = (clefId: string) => {
    setForm((f) => {
      const photo = f.photos.find((p) => p.clefId === clefId);
      if (!photo) return f;
      return { ...f, photos: [photo, ...f.photos.filter((p) => p.clefId !== clefId)] };
    });
  };

  const uriPhoto = (photo: PhotoBrouillon): string =>
    (photo.uriLocale ?? photo.urlExistante) as string;

  const majIngredient = (clefId: string, champ: 'libelle' | 'quantite' | 'unite', valeur: string) => {
    setForm((f) => ({
      ...f,
      ingredients: f.ingredients.map((i) => (i.clefId === clefId ? { ...i, [champ]: valeur } : i)),
    }));
  };

  const supprimerIngredient = (clefId: string) => {
    setForm((f) => ({ ...f, ingredients: f.ingredients.filter((i) => i.clefId !== clefId) }));
  };

  const majEtape = (clefId: string, texte: string) => {
    setForm((f) => ({ ...f, etapes: f.etapes.map((e) => (e.clefId === clefId ? { ...e, texte } : e)) }));
  };

  // Déplace une étape : d'un cran vers le haut ou le bas, ou tout en haut
  // (retour utilisateur : "pouvoir la déplacer, en première place par
  // exemple"). L'étape garde son identifiant, et donc ses astuces.
  const deplacerEtape = (clefId: string, vers: 'haut' | 'bas' | 'premier') => {
    setForm((f) => {
      const etape = f.etapes.find((e) => e.clefId === clefId);
      if (!etape) return f;
      // On se déplace parmi les étapes du même élément.
      const memeElement = f.etapes.filter((e) => e.elementClef === etape.elementClef);
      const position = memeElement.findIndex((e) => e.clefId === clefId);
      const cible = vers === 'premier' ? 0 : vers === 'haut' ? position - 1 : position + 1;
      if (cible < 0 || cible >= memeElement.length || cible === position) return f;
      const reordonnees = [...memeElement];
      const [deplacee] = reordonnees.splice(position, 1);
      reordonnees.splice(cible, 0, deplacee);
      // Réinsère les étapes de l'élément à leurs emplacements d'origine.
      let i = 0;
      return {
        ...f,
        etapes: f.etapes.map((e) => (e.elementClef === etape.elementClef ? reordonnees[i++] : e)),
      };
    });
  };

  // Range un ingrédient ou une étape (et, au choix, les suivants du même
  // élément) dans un autre élément. Les lignes vides de l'élément d'arrivée
  // (ajoutées automatiquement à sa création) sont retirées au passage.
  const deplacerVersElement = (clefElementCible: string) => {
    if (!aDeplacer) return;
    const { type, clefId } = aDeplacer;
    setForm((f) => {
      const cle = type === 'ingredient' ? 'ingredients' : 'etapes';
      const liste = f[cle] as { clefId: string; elementClef?: string | null }[];
      const item = liste.find((x) => x.clefId === clefId);
      if (!item || item.elementClef === clefElementCible) return f;
      const memeElement = liste.filter((x) => x.elementClef === item.elementClef);
      const position = memeElement.findIndex((x) => x.clefId === clefId);
      const clefsDeplacees = new Set(
        (avecSuivants ? memeElement.slice(position) : [item]).map((x) => x.clefId)
      );
      const estVide = (x: any) => (type === 'ingredient' ? !x.libelle?.trim() : !x.texte?.trim());
      const restants = liste.filter(
        (x) => !clefsDeplacees.has(x.clefId) && !(x.elementClef === clefElementCible && estVide(x))
      );
      const deplaces = liste
        .filter((x) => clefsDeplacees.has(x.clefId))
        .map((x) => ({ ...x, elementClef: clefElementCible }));
      return { ...f, [cle]: [...restants, ...deplaces] };
    });
    setADeplacer(null);
  };

  // Ajoute les ingrédients d'une liste collée (un par ligne) à la fin de
  // l'élément visé, en retirant d'abord ses lignes d'ingrédient restées vides.
  const ingredientsColles = decouperIngredients(texteColle);
  const validerCollage = () => {
    const clefElement = collageElement;
    if (!clefElement || ingredientsColles.length === 0) return;
    setForm((f) => {
      const estVide = (i: (typeof f.ingredients)[number]) => !i.libelle.trim() && !i.quantite.trim() && !i.unite.trim();
      const conserves = f.ingredients.filter((i) => !(i.elementClef === clefElement && estVide(i)));
      return {
        ...f,
        ingredients: [...conserves, ...ingredientsColles.map((i) => ({ ...i, elementClef: clefElement }))],
      };
    });
    setCollageElement(null);
    setTexteColle('');
  };

  // Photo du livre (appareil ou galerie) → zone à lire → texte ajouté à la
  // fin de l'étape.
  const scannerEtape = (clefId: string, type: 'etape' | 'ingredients' = 'etape') => {
    const depuis = async (source: 'camera' | 'galerie') => {
      const permission =
        source === 'camera'
          ? await ImagePicker.requestCameraPermissionsAsync()
          : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) return;
      const resultat =
        source === 'camera'
          ? await ImagePicker.launchCameraAsync({ quality: 0.9 })
          : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.9 });
      if (!resultat.canceled && resultat.assets[0]) setScanEtape({ type, clefId, uri: resultat.assets[0].uri });
    };
    if (Platform.OS === 'web') {
      depuis('galerie');
      return;
    }
    alerte(type === 'etape' ? 'Scanner le texte de l’étape' : 'Scanner la liste d’ingrédients', undefined, [
      { text: 'Prendre une photo', onPress: () => depuis('camera') },
      { text: 'Choisir dans la galerie', onPress: () => depuis('galerie') },
      { text: 'Annuler', style: 'cancel' },
    ]);
  };

  const lireZoneScannee = async (uriZone: string) => {
    const cible = scanEtape;
    setScanEtape(null);
    if (!cible) return;
    setLectureScan(cible.clefId);
    try {
      const texteBrut = await reconnaitreTexteZone(uriZone);
      if (cible.type === 'ingredients') {
        // Liste lue : on ouvre la fenêtre "Coller une liste" déjà remplie,
        // pour vérifier ou corriger avant d'ajouter les ingrédients.
        if (!texteBrut.trim()) {
          alerte('Aucun texte reconnu', 'Essayez avec une photo plus nette ou une zone plus précise.');
          return;
        }
        setTexteColle(texteBrut.trim());
        setCollageElement(cible.clefId);
        return;
      }
      const texte = texteScanneEnEtape(texteBrut);
      if (!texte) {
        alerte('Aucun texte reconnu', 'Essayez avec une photo plus nette ou une zone plus précise.');
        return;
      }
      setForm((f) => ({
        ...f,
        etapes: f.etapes.map((e) =>
          e.clefId === cible.clefId ? { ...e, texte: e.texte.trim() ? `${e.texte.trim()} ${texte}` : texte } : e
        ),
      }));
    } catch (e) {
      alerte('Lecture impossible', e instanceof Error ? e.message : 'Veuillez réessayer.');
    } finally {
      setLectureScan(null);
    }
  };

  // ---- Éléments de la recette (ex. la pâte, la garniture) ----
  const elements = form.elements ?? [];
  const recetteDecoupee = elements.length > 1;

  const ajouterElement = () =>
    setForm((f) => {
      const normalise = normaliserElements(f);
      // Nouvel élément vide : seuls ses liens "+ Ajouter un ingrédient" et
      // "+ Ajouter une étape" s'affichent (un élément "Montage" peut n'avoir
      // aucun ingrédient).
      const nouveau = nouvelElementBrouillon();
      return { ...normalise, elements: [...(normalise.elements ?? []), nouveau] };
    });

  const renommerElement = (clefId: string, nom: string) =>
    setForm((f) => ({ ...f, elements: (f.elements ?? []).map((e) => (e.clefId === clefId ? { ...e, nom } : e)) }));

  const deplacerElement = (clefId: string, vers: 'haut' | 'bas') =>
    setForm((f) => {
      const liste = [...(f.elements ?? [])];
      const index = liste.findIndex((e) => e.clefId === clefId);
      const cible = vers === 'haut' ? index - 1 : index + 1;
      if (index === -1 || cible < 0 || cible >= liste.length) return f;
      [liste[index], liste[cible]] = [liste[cible], liste[index]];
      return { ...f, elements: liste };
    });

  const retirerElement = (clefId: string) =>
    setForm((f) => {
      const restants = (f.elements ?? []).filter((e) => e.clefId !== clefId);
      if (restants.length === 0) return f;
      return {
        ...f,
        elements: restants,
        ingredients: f.ingredients.filter((i) => i.elementClef !== clefId),
        etapes: f.etapes.filter((e) => e.elementClef !== clefId),
      };
    });

  const demanderRetraitElement = (clefId: string, nom: string) => {
    const aDuContenu =
      form.ingredients.some((i) => i.elementClef === clefId && i.libelle.trim()) ||
      form.etapes.some((e) => e.elementClef === clefId && e.texte.trim());
    if (!aDuContenu) {
      retirerElement(clefId);
      return;
    }
    alerte(
      'Retirer cet élément ?',
      `« ${nom.trim() || 'Sans nom'} » sera retiré, avec ses ingrédients et ses étapes.`,
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Retirer', style: 'destructive', onPress: () => retirerElement(clefId) },
      ]
    );
  };

  const supprimerEtape = (clefId: string) => {
    setForm((f) => ({ ...f, etapes: f.etapes.filter((e) => e.clefId !== clefId) }));
  };

  // Fusionne une étape avec la suivante (retour utilisateur : certains
  // imports, ex. depuis Umami, découpent trop finement les instructions —
  // ex. un sous-titre "1. Préparer le terrain :" comme étape à part entière
  // de son instruction). Les deux textes sont concaténés (retour à la ligne
  // entre les deux, retour utilisateur) dans l'étape courante, qui garde sa
  // position ; la suivante est retirée. Si l'une des deux étapes avait un
  // lien vers une sous-recette, il est conservé (celui de l'étape courante
  // en priorité).
  const fusionnerEtapeSuivante = (clefId: string) => {
    setForm((f) => {
      const actuelle = f.etapes.find((e) => e.clefId === clefId);
      if (!actuelle) return f;
      // Étape suivante du même élément.
      const memeElement = f.etapes.filter((e) => e.elementClef === actuelle.elementClef);
      const position = memeElement.findIndex((e) => e.clefId === clefId);
      const suivante = memeElement[position + 1];
      if (!suivante) return f;
      setEtapesAvantFusion(f.etapes);
      setEtapeFusionnee(clefId);
      const texteFusionne = [actuelle.texte.trim(), suivante.texte.trim()].filter(Boolean).join('\n');
      return {
        ...f,
        etapes: f.etapes
          .filter((e) => e.clefId !== suivante.clefId)
          .map((e) =>
            e.clefId === clefId
              ? {
                  ...e,
                  texte: texteFusionne,
                  recetteLieeId: actuelle.recetteLieeId ?? suivante.recetteLieeId,
                  recetteLieeTitre: actuelle.recetteLieeTitre ?? suivante.recetteLieeTitre,
                }
              : e
          ),
      };
    });
  };

  // Restaure les étapes telles qu'elles étaient juste avant la dernière
  // fusion (bouton ↩ affiché uniquement après une fusion).
  const annulerFusion = () => {
    setEtapeFusionnee(null);
    setEtapesAvantFusion((etapesPrecedentes) => {
      if (!etapesPrecedentes) return null;
      setForm((f) => ({ ...f, etapes: etapesPrecedentes }));
      return null;
    });
  };

  const enregistrer = async () => {
    if (!foyer || !session) return;
    if (!form.titre.trim()) {
      setErreur('Le titre de la recette est obligatoire.');
      return;
    }
    // Sans catégorie, la recette ne serait accessible nulle part dans
    // l'appli (l'écran d'accueil liste les recettes par catégorie) — on
    // oblige donc au moins un choix avant d'enregistrer.
    if (form.nomsCategories.length === 0) {
      setErreur('Choisissez au moins une catégorie.');
      return;
    }
    setErreur(null);
    setEnregistrement(true);
    // Évite qu'une sauvegarde automatique déjà programmée ne se déclenche
    // juste après (ou pendant) l'enregistrement manuel.
    if (delaiAutoRef.current) clearTimeout(delaiAutoRef.current);
    try {
      if (modeEdition && recetteId) {
        await mettreAJourRecette(recetteId, form);
      } else {
        await creerRecette(foyer.id, session.user.id, form);
      }
      navigation.goBack();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Impossible d’enregistrer la recette.');
    } finally {
      setEnregistrement(false);
    }
  };

  if (chargementInitial) {
    return (
      <View style={styles.centre}>
        <ActivityIndicator color={theme.colors.accent} />
      </View>
    );
  }

  // Ingrédients puis étapes d'un élément (ou de toute la recette si elle
  // n'est pas découpée en éléments).
  const rendreIngredientsEtEtapes = (clefElement: string) => {
    const etapesElement = form.etapes.filter((e) => e.elementClef === clefElement);
    return (
      <>
      <Text style={recetteDecoupee ? styles.sousLabel : styles.label}>Ingrédients</Text>
      {form.ingredients.filter((i) => i.elementClef === clefElement).map((ingredient) => (
        <View key={ingredient.clefId} style={styles.ligneIngredient}>
          <TextInput
            style={[styles.champ, styles.champQuantite]}
            placeholder="Qté"
            placeholderTextColor={theme.colors.textMuted}
            keyboardType="numeric"
            value={ingredient.quantite}
            onChangeText={(v) => majIngredient(ingredient.clefId, 'quantite', v)}
          />
          <TextInput
            style={[styles.champ, styles.champUnite]}
            placeholder="unité"
            placeholderTextColor={theme.colors.textMuted}
            value={ingredient.unite}
            onChangeText={(v) => majIngredient(ingredient.clefId, 'unite', v)}
          />
          <TextInput
            style={[styles.champ, styles.champLibelle]}
            placeholder="Ingrédient"
            placeholderTextColor={theme.colors.textMuted}
            value={ingredient.libelle}
            onChangeText={(v) => majIngredient(ingredient.clefId, 'libelle', v)}
          />
          {recetteDecoupee && (
            <Pressable
              hitSlop={6}
              onPress={() => setADeplacer({ type: 'ingredient', clefId: ingredient.clefId })}
              accessibilityLabel="Changer d'élément"
            >
              <Text style={styles.changerElement}>⇄</Text>
            </Pressable>
          )}
          <Pressable onPress={() => supprimerIngredient(ingredient.clefId)}>
            <Text style={styles.supprimer}>✕</Text>
          </Pressable>
        </View>
      ))}
      <Pressable
        style={styles.boutonAjouter}
        onPress={() =>
          setForm((f) => ({
            ...f,
            ingredients: [...f.ingredients, { ...nouvelIngredientBrouillon(), elementClef: clefElement }],
          }))
        }
      >
        <Text style={styles.boutonAjouterTexte}>+ Ajouter un ingrédient</Text>
      </Pressable>
      <Pressable style={styles.boutonAjouter} onPress={() => setCollageElement(clefElement)}>
        <Text style={styles.boutonAjouterTexte}>📋 Coller une liste d'ingrédients</Text>
      </Pressable>
      {lectureScan === clefElement ? (
        <View style={[styles.boutonAjouter, styles.lectureScan]}>
          <ActivityIndicator size="small" color={theme.colors.accent} />
          <Text style={styles.boutonAjouterTexte}>Lecture de la liste…</Text>
        </View>
      ) : (
        <Pressable
          style={styles.boutonAjouter}
          onPress={() => scannerEtape(clefElement, 'ingredients')}
          disabled={lectureScan !== null}
        >
          <Text style={styles.boutonAjouterTexte}>📷 Scanner une liste d'ingrédients</Text>
        </Pressable>
      )}

      <View style={styles.enteteSection}>
        <Text style={recetteDecoupee ? styles.sousLabel : styles.label}>Étapes</Text>
        {etapesAvantFusion && !recetteDecoupee && (
          <Pressable style={styles.boutonAnnulerFusion} onPress={annulerFusion}>
            <Text style={styles.boutonAnnulerFusionTexte}>↩ Annuler la fusion</Text>
          </Pressable>
        )}
      </View>
      {!recetteDecoupee && (
        <Text style={styles.aide}>
          Écrivez chaque étape normalement, en citant les ingrédients dans la phrase (ex. « Mélanger la farine et les
          œufs »). Ils seront repérés automatiquement et rappelés avec leur quantité en mode assistant — inutile de les
          sélectionner à la main.
        </Text>
      )}
      {etapesElement.map((etape, index) => (
        <View key={etape.clefId} style={styles.blocEtape}>
          <View style={styles.enteteEtape}>
            <Text style={styles.numeroEtape}>Étape {index + 1}</Text>
            <View style={styles.actionsEtape}>
              {index > 1 && (
                <Pressable
                  hitSlop={6}
                  style={styles.boutonDeplacer}
                  onPress={() => deplacerEtape(etape.clefId, 'premier')}
                  accessibilityLabel="Placer en première étape"
                >
                  <Text style={styles.boutonDeplacerTexte}>⤒ 1re</Text>
                </Pressable>
              )}
              {index > 0 && (
                <Pressable
                  hitSlop={6}
                  style={styles.boutonDeplacer}
                  onPress={() => deplacerEtape(etape.clefId, 'haut')}
                  accessibilityLabel="Monter l'étape"
                >
                  <Text style={styles.boutonDeplacerTexte}>▲</Text>
                </Pressable>
              )}
              {index < etapesElement.length - 1 && (
                <Pressable
                  hitSlop={6}
                  style={styles.boutonDeplacer}
                  onPress={() => deplacerEtape(etape.clefId, 'bas')}
                  accessibilityLabel="Descendre l'étape"
                >
                  <Text style={styles.boutonDeplacerTexte}>▼</Text>
                </Pressable>
              )}
              {recetteDecoupee && (
                <Pressable
                  hitSlop={6}
                  style={styles.boutonDeplacer}
                  onPress={() => setADeplacer({ type: 'etape', clefId: etape.clefId })}
                  accessibilityLabel="Changer d'élément"
                >
                  <Text style={styles.boutonDeplacerTexte}>⇄ élément</Text>
                </Pressable>
              )}
              <Pressable hitSlop={6} onPress={() => supprimerEtape(etape.clefId)}>
                <Text style={styles.supprimer}>✕</Text>
              </Pressable>
            </View>
          </View>
          <ChampExtensible
            style={styles.champ}
            placeholder="Ex. Mélanger la farine et les œufs."
            placeholderTextColor={theme.colors.textMuted}
            value={etape.texte}
            onChangeText={(v) => majEtape(etape.clefId, v)}
          />
          {etape.recetteLieeId ? (
            <Pressable style={styles.chipRecetteLiee} onPress={() => setEtapeEnLiaison(etape.clefId)}>
              <Text style={styles.chipRecetteLieeTexte}>🔗 {etape.recetteLieeTitre ?? 'Recette liée'}</Text>
            </Pressable>
          ) : (
            <Pressable style={styles.boutonLierRecette} onPress={() => setEtapeEnLiaison(etape.clefId)}>
              <Text style={styles.boutonLierRecetteTexte}>🔗 Lier à une recette</Text>
            </Pressable>
          )}
          {lectureScan === etape.clefId ? (
            <View style={styles.lectureScan}>
              <ActivityIndicator size="small" color={theme.colors.accent} />
              <Text style={styles.boutonLierRecetteTexte}>Lecture du texte…</Text>
            </View>
          ) : (
            <Pressable style={styles.boutonLierRecette} onPress={() => scannerEtape(etape.clefId)} disabled={lectureScan !== null}>
              <Text style={styles.boutonLierRecetteTexte}>📷 Scanner du texte</Text>
            </Pressable>
          )}
          {etapesAvantFusion && etapeFusionnee === etape.clefId && (
            <Pressable style={styles.boutonAnnulerFusionEtape} onPress={annulerFusion}>
              <Text style={styles.boutonAnnulerFusionTexte}>↩ Annuler la fusion</Text>
            </Pressable>
          )}
          {index < etapesElement.length - 1 && (
            <Pressable style={styles.boutonFusionner} onPress={() => fusionnerEtapeSuivante(etape.clefId)}>
              <Text style={styles.boutonFusionnerTexte}>⌄ Fusionner avec l'étape suivante</Text>
            </Pressable>
          )}
        </View>
      ))}
      <Pressable
        style={styles.boutonAjouter}
        onPress={() =>
          setForm((f) => ({ ...f, etapes: [...f.etapes, { ...nouvelleEtapeBrouillon(), elementClef: clefElement }] }))
        }
      >
        <Text style={styles.boutonAjouterTexte}>+ Ajouter une étape</Text>
      </Pressable>
      </>
    );
  };

  return (
    <>
    <ZoneClavier>
    <ScrollView style={styles.container} contentContainerStyle={styles.contenu} keyboardShouldPersistTaps="handled">
      {modeEdition && (autoEnregistrementEnCours || erreurAuto || dernierEnregistrementAuto) && (
        <View style={styles.statutAuto}>
          {autoEnregistrementEnCours ? (
            <Text style={styles.statutAutoTexte}>Enregistrement automatique…</Text>
          ) : erreurAuto ? (
            <Text style={[styles.statutAutoTexte, styles.statutAutoErreur]}>
              Sauvegarde automatique impossible : {erreurAuto}
            </Text>
          ) : (
            <Text style={styles.statutAutoTexte}>
              Enregistré automatiquement à{' '}
              {dernierEnregistrementAuto!.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
            </Text>
          )}
        </View>
      )}
      <Text style={styles.label}>Photos</Text>
      {form.photos.length > 0 && (
        <Text style={styles.aide}>La première photo sert de couverture. Appuyez sur ★ pour en changer.</Text>
      )}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rangeePhotos}>
        {form.photos.map((photo, index) => (
          <View key={photo.clefId} style={styles.vignettePhoto}>
            <Image source={{ uri: uriPhoto(photo) }} style={styles.photo} />
            {index > 0 && (
              <Pressable
                style={styles.boutonCouverture}
                hitSlop={6}
                onPress={() => definirCommeCouverture(photo.clefId)}
              >
                <Text style={styles.boutonCouvertureTexte}>★</Text>
              </Pressable>
            )}
            <Pressable style={styles.boutonSupprimerPhoto} hitSlop={6} onPress={() => supprimerPhoto(photo.clefId)}>
              <Text style={styles.boutonSupprimerPhotoTexte}>✕</Text>
            </Pressable>
            <Pressable
              style={styles.boutonRecadrerPhoto}
              hitSlop={6}
              onPress={() => recadrerPhotoExistante(photo)}
            >
              <Text style={styles.boutonRecadrerPhotoTexte}>✂ Recadrer</Text>
            </Pressable>
          </View>
        ))}
        <Pressable style={styles.photoZoneAjouter} onPress={ajouterPhotos}>
          <Text style={styles.photoTexte}>+ Ajouter{form.photos.length > 0 ? '' : ' une photo'}</Text>
        </Pressable>
      </ScrollView>

      <Text style={styles.label}>Titre</Text>
      <TextInput
        style={styles.champ}
        placeholder="Ex. Tarte aux pommes de grand-mère"
        placeholderTextColor={theme.colors.textMuted}
        value={form.titre}
        onChangeText={(v) => setForm((f) => ({ ...f, titre: v }))}
      />

      <View style={styles.ligne}>
        <View style={styles.colonne}>
          <Text style={styles.label}>Parts</Text>
          <TextInput
            style={styles.champ}
            keyboardType="number-pad"
            value={String(form.partsDefaut)}
            onChangeText={(v) => setForm((f) => ({ ...f, partsDefaut: Number(v) || 1 }))}
          />
        </View>
        <View style={styles.colonne}>
          <Text style={styles.label}>Préparation (min)</Text>
          <TextInput
            style={styles.champ}
            keyboardType="number-pad"
            value={form.tempsPreparationMinutes ? String(form.tempsPreparationMinutes) : ''}
            onChangeText={(v) => setForm((f) => ({ ...f, tempsPreparationMinutes: v ? Number(v) : null }))}
          />
        </View>
        <View style={styles.colonne}>
          <Text style={styles.label}>Cuisson (min)</Text>
          <TextInput
            style={styles.champ}
            keyboardType="number-pad"
            value={form.tempsCuissonMinutes ? String(form.tempsCuissonMinutes) : ''}
            onChangeText={(v) => setForm((f) => ({ ...f, tempsCuissonMinutes: v ? Number(v) : null }))}
          />
        </View>
      </View>

      <Text style={styles.label}>Catégories</Text>
      <SelecteurCategories
        selection={form.nomsCategories}
        onChange={(nomsCategories) => setForm((f) => ({ ...f, nomsCategories }))}
      />

      {recetteDecoupee ? (
        <>
          <Text style={styles.label}>Éléments de la recette</Text>
          <Text style={styles.aide}>
            Chaque élément (ex. la pâte, la garniture) a ses propres ingrédients et étapes.
          </Text>
        </>
      ) : null}
      {elements.map((element, indexElement) => (
        <View key={element.clefId} style={recetteDecoupee ? styles.blocElement : undefined}>
          {recetteDecoupee && (
            <View style={styles.enteteElement}>
              <TextInput
                style={[styles.champ, styles.champNomElement]}
                placeholder="Nom de l’élément (ex. La pâte)"
                placeholderTextColor={theme.colors.textMuted}
                value={element.nom}
                onChangeText={(v) => renommerElement(element.clefId, v)}
              />
              {indexElement > 0 && (
                <Pressable hitSlop={6} style={styles.boutonDeplacer} onPress={() => deplacerElement(element.clefId, 'haut')}>
                  <Text style={styles.boutonDeplacerTexte}>▲</Text>
                </Pressable>
              )}
              {indexElement < elements.length - 1 && (
                <Pressable hitSlop={6} style={styles.boutonDeplacer} onPress={() => deplacerElement(element.clefId, 'bas')}>
                  <Text style={styles.boutonDeplacerTexte}>▼</Text>
                </Pressable>
              )}
              <Pressable hitSlop={6} onPress={() => demanderRetraitElement(element.clefId, element.nom)}>
                <Text style={styles.supprimer}>✕</Text>
              </Pressable>
            </View>
          )}
          {rendreIngredientsEtEtapes(element.clefId)}
        </View>
      ))}
      <Pressable style={styles.boutonAjouterElement} onPress={ajouterElement}>
        <Text style={styles.boutonAjouterElementTexte}>
          {recetteDecoupee ? '+ Ajouter un élément' : '+ Découper en éléments (ex. la pâte, la garniture)'}
        </Text>
      </Pressable>

      <Text style={styles.label}>Note de départ</Text>
      <Text style={styles.aide}>
        Remplacée par la moyenne des verdicts de la famille dès qu’un essai goûté est raconté.
      </Text>
      <View style={styles.rangeeEtoiles}>
        {[1, 2, 3, 4].map((valeur) => (
          <Pressable
            key={valeur}
            hitSlop={6}
            onPress={() => setForm((f) => ({ ...f, note: f.note === valeur ? null : valeur }))}
          >
            <Text style={styles.etoile}>{form.note != null && valeur <= form.note ? '★' : '☆'}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.label}>Notes</Text>
      <Text style={styles.aide}>
        Vos propres remarques sur la recette (ex. « mettre moins de sel », « bien pour la fête des voisins »).
      </Text>
      <ChampExtensible
        style={styles.champ}
        placeholder="Notes personnelles…"
        placeholderTextColor={theme.colors.textMuted}
        value={form.notes}
        onChangeText={(v) => setForm((f) => ({ ...f, notes: v }))}
      />

      {erreur && <Text style={styles.erreur}>{erreur}</Text>}

      <Pressable style={styles.boutonPrincipal} onPress={enregistrer} disabled={enregistrement}>
        {enregistrement ? (
          <ActivityIndicator color={theme.colors.background} />
        ) : (
          <Text style={styles.boutonPrincipalTexte}>
            {modeEdition ? 'Enregistrer les modifications' : 'Enregistrer la recette'}
          </Text>
        )}
      </Pressable>
    </ScrollView>
    </ZoneClavier>
    <RecadragePhotoModal
      uri={photoEnRecadrage}
      onAnnuler={annulerRecadragePhoto}
      onValider={validerRecadragePhoto}
    />
    <RecadragePhotoModal
      uri={scanEtape?.uri ?? null}
      titre={scanEtape?.type === 'ingredients' ? 'Liste à lire' : 'Texte à lire'}
      aide={
        scanEtape?.type === 'ingredients'
          ? "Dessinez un rectangle autour de la liste d'ingrédients, ou validez pour lire toute la photo."
          : "Dessinez un rectangle autour du texte de l'étape, ou validez pour lire toute la photo."
      }
      libelleValider="Lire le texte"
      onAnnuler={() => setScanEtape(null)}
      onValider={lireZoneScannee}
    />
    <Modal visible={collageElement !== null} transparent animationType="fade" onRequestClose={() => setCollageElement(null)}>
      <ZoneClavier sansEnTete>
      <Pressable style={styles.fondModale} onPress={() => setCollageElement(null)}>
        <Pressable style={styles.modale} onPress={() => {}}>
          <Text style={styles.modaleTitre}>Coller une liste d'ingrédients</Text>
          <Text style={styles.aideCollage}>
            Un ingrédient par ligne, par exemple « 200 g de farine » ou « 3 œufs ». Quantité et unité sont
            reconnues automatiquement, vous pourrez corriger ensuite.
          </Text>
          <TextInput
            style={[styles.champ, styles.champCollage]}
            multiline
            autoFocus
            placeholder="Collez la liste ici"
            placeholderTextColor={theme.colors.textMuted}
            value={texteColle}
            onChangeText={setTexteColle}
          />
          <Pressable
            style={[styles.boutonCollage, ingredientsColles.length === 0 && styles.boutonCollageInactif]}
            onPress={validerCollage}
            disabled={ingredientsColles.length === 0}
          >
            <Text style={styles.boutonCollageTexte}>
              {ingredientsColles.length === 0
                ? 'Ajouter'
                : `Ajouter ${ingredientsColles.length} ingrédient${ingredientsColles.length > 1 ? 's' : ''}`}
            </Text>
          </Pressable>
          <Pressable style={styles.annulerModale} onPress={() => setCollageElement(null)}>
            <Text style={styles.annulerModaleTexte}>Annuler</Text>
          </Pressable>
        </Pressable>
      </Pressable>
      </ZoneClavier>
    </Modal>
    <Modal visible={aDeplacer !== null} transparent animationType="fade" onRequestClose={() => setADeplacer(null)}>
      <Pressable style={styles.fondModale} onPress={() => setADeplacer(null)}>
        <Pressable style={styles.modale} onPress={() => {}}>
          <Text style={styles.modaleTitre}>
            {aDeplacer?.type === 'etape' ? 'Ranger cette étape dans…' : 'Ranger cet ingrédient dans…'}
          </Text>
          <Pressable style={styles.optionSuivants} onPress={() => setAvecSuivants((v) => !v)}>
            <View style={[styles.caseOption, avecSuivants && styles.caseOptionCochee]}>
              {avecSuivants && <Text style={styles.caseOptionTexte}>✓</Text>}
            </View>
            <Text style={styles.optionSuivantsTexte}>
              {aDeplacer?.type === 'etape' ? 'avec toutes les étapes suivantes' : 'avec tous les ingrédients suivants'}
            </Text>
          </Pressable>
          {elements.map((el, i) => {
            const liste = aDeplacer?.type === 'etape' ? form.etapes : form.ingredients;
            const actuel = liste.find((x) => x.clefId === aDeplacer?.clefId)?.elementClef === el.clefId;
            return (
              <Pressable
                key={el.clefId}
                style={[styles.choixElement, actuel && styles.choixElementActuel]}
                onPress={() => deplacerVersElement(el.clefId)}
                disabled={actuel}
              >
                <Text style={styles.choixElementTexte}>{el.nom.trim() || `Élément ${i + 1} (sans nom)`}</Text>
                {actuel && <Text style={styles.changerElement}>✓</Text>}
              </Pressable>
            );
          })}
          <Pressable style={styles.annulerModale} onPress={() => setADeplacer(null)}>
            <Text style={styles.annulerModaleTexte}>Annuler</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
    <SelecteurRecetteLieeModal
      visible={etapeEnLiaison != null}
      recettes={recettesDisponibles}
      lienActuel={
        (() => {
          const etape = form.etapes.find((e) => e.clefId === etapeEnLiaison);
          return etape?.recetteLieeId ? { id: etape.recetteLieeId, titre: etape.recetteLieeTitre ?? '' } : null;
        })()
      }
      onFermer={() => setEtapeEnLiaison(null)}
      onChoisir={choisirRecetteLiee}
    />
    </>
  );
}

const styles = creerStylesThemes(() => ({
  container: { flex: 1, backgroundColor: theme.colors.background },
  centre: { flex: 1, backgroundColor: theme.colors.background, alignItems: 'center', justifyContent: 'center' },
  contenu: { padding: theme.spacing.md, gap: theme.spacing.sm },
  label: {
    fontFamily: theme.fontBodyBold,
    color: theme.colors.text,
    fontSize: 14,
    marginTop: theme.spacing.sm,
  },
  aide: {
    fontFamily: theme.fontBody,
    color: theme.colors.textMuted,
    fontSize: 12,
  },
  champ: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radii.md,
    padding: theme.spacing.sm,
    color: theme.colors.text,
    fontFamily: theme.fontBody,
  },
  rangeePhotos: { gap: theme.spacing.sm, paddingVertical: theme.spacing.xs },
  vignettePhoto: {
    width: 140,
    height: 140,
    borderRadius: theme.radii.md,
    overflow: 'hidden',
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: 1,
  },
  photoZoneAjouter: {
    width: 140,
    height: 140,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photo: { width: '100%', height: '100%' },
  photoTexte: { fontFamily: theme.fontBody, color: theme.colors.textMuted, textAlign: 'center' },
  boutonCouverture: {
    position: 'absolute',
    top: 4,
    left: 4,
    backgroundColor: theme.colors.voile,
    borderRadius: theme.radii.sm,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  boutonCouvertureTexte: { color: theme.colors.accent, fontSize: 14 },
  boutonSupprimerPhoto: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: theme.colors.voile,
    borderRadius: theme.radii.sm,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  boutonSupprimerPhotoTexte: { color: theme.colors.warning, fontSize: 14 },
  boutonRecadrerPhoto: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: theme.colors.voile,
    paddingVertical: 3,
    alignItems: 'center',
  },
  boutonRecadrerPhotoTexte: { color: theme.colors.text, fontSize: 11, fontFamily: theme.fontBody },
  ligne: { flexDirection: 'row', gap: theme.spacing.sm },
  colonne: { flex: 1 },
  ligneIngredient: { flexDirection: 'row', gap: theme.spacing.xs, alignItems: 'center' },
  champQuantite: { flex: 2 },
  champUnite: { flex: 2 },
  champLibelle: { flex: 5 },
  champEtape: { minHeight: 70, textAlignVertical: 'top' },
  champNotes: { minHeight: 70, textAlignVertical: 'top' },
  rangeeEtoiles: { flexDirection: 'row', gap: theme.spacing.xs },
  etoile: { color: theme.colors.accent, fontSize: 28 },
  supprimer: { color: theme.colors.warning, fontSize: 16, paddingHorizontal: theme.spacing.xs },
  boutonAjouter: { paddingVertical: theme.spacing.xs },
  boutonAjouterTexte: { fontFamily: theme.fontBody, color: theme.colors.accent },
  blocEtape: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radii.md,
    padding: theme.spacing.sm,
    gap: theme.spacing.xs,
  },
  enteteEtape: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  actionsEtape: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs },
  boutonDeplacer: {
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radii.sm,
    paddingVertical: 2,
    paddingHorizontal: theme.spacing.sm,
  },
  boutonDeplacerTexte: { fontFamily: theme.fontBodyBold, color: theme.colors.accent, fontSize: 13 },
  numeroEtape: { fontFamily: theme.fontBodyBold, color: theme.colors.textMuted, fontSize: 12 },
  boutonFusionner: { alignSelf: 'flex-start', paddingTop: theme.spacing.xs },
  boutonFusionnerTexte: { fontFamily: theme.fontBody, color: theme.colors.accent, fontSize: 12 },
  boutonLierRecette: { alignSelf: 'flex-start' },
  lectureScan: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs },
  boutonLierRecetteTexte: { fontFamily: theme.fontBody, color: theme.colors.accent, fontSize: 12 },
  chipRecetteLiee: {
    alignSelf: 'flex-start',
    backgroundColor: theme.colors.selection,
    borderRadius: theme.radii.sm,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 4,
  },
  chipRecetteLieeTexte: { fontFamily: theme.fontBody, color: theme.colors.accent, fontSize: 12 },
  changerElement: { fontFamily: theme.fontBodyBold, color: theme.colors.accent, fontSize: 18, paddingHorizontal: 4 },
  fondModale: { flex: 1, backgroundColor: theme.colors.voileFort, justifyContent: 'center', padding: theme.spacing.lg },
  modale: {
    // Largeur limitée (navigateur) ; sans effet sur téléphone, plus étroit.
    width: '100%',
    maxWidth: 440,
    alignSelf: 'center',
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radii.lg,
    padding: theme.spacing.md,
    gap: theme.spacing.xs,
  },
  modaleTitre: { fontFamily: theme.fontBodyBold, fontSize: 17, color: theme.colors.text },
  optionSuivants: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, paddingVertical: theme.spacing.xs },
  caseOption: {
    width: 22,
    height: 22,
    borderRadius: theme.radii.sm,
    borderWidth: 2,
    borderColor: theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  caseOptionCochee: { backgroundColor: theme.colors.accent, borderColor: theme.colors.accent },
  caseOptionTexte: { color: theme.colors.background, fontFamily: theme.fontBodyBold, fontSize: 14 },
  optionSuivantsTexte: { fontFamily: theme.fontBody, fontSize: 14, color: theme.colors.textMuted, flexShrink: 1 },
  choixElement: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.sm,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  choixElementActuel: { backgroundColor: theme.colors.selectionTransparent, borderColor: theme.colors.accent },
  choixElementTexte: { fontFamily: theme.fontBody, fontSize: 16, color: theme.colors.text },
  aideCollage: { fontFamily: theme.fontBody, fontSize: 13, color: theme.colors.textMuted },
  champCollage: { minHeight: 160, maxHeight: 320, textAlignVertical: 'top' },
  boutonCollage: {
    backgroundColor: theme.colors.accent,
    borderRadius: theme.radii.md,
    paddingVertical: theme.spacing.sm,
    alignItems: 'center',
    marginTop: theme.spacing.xs,
  },
  boutonCollageInactif: { opacity: 0.5 },
  boutonCollageTexte: { fontFamily: theme.fontBodyBold, fontSize: 15, color: theme.colors.background },
  annulerModale: { alignItems: 'center', paddingVertical: theme.spacing.sm },
  annulerModaleTexte: { fontFamily: theme.fontBody, color: theme.colors.textMuted, textDecorationLine: 'underline' },
  blocElement: {
    borderColor: theme.colors.accent,
    borderWidth: 1,
    borderRadius: theme.radii.md,
    padding: theme.spacing.sm,
    gap: theme.spacing.xs,
    marginTop: theme.spacing.sm,
  },
  enteteElement: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs },
  champNomElement: { flex: 1, fontFamily: theme.fontBodyBold, fontSize: 16 },
  sousLabel: {
    fontFamily: theme.fontBodyBold,
    fontSize: 14,
    color: theme.colors.textMuted,
    marginTop: theme.spacing.xs,
  },
  boutonAjouterElement: {
    alignSelf: 'flex-start',
    borderColor: theme.colors.accent,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: theme.radii.md,
    paddingVertical: theme.spacing.xs,
    paddingHorizontal: theme.spacing.md,
    marginTop: theme.spacing.sm,
  },
  boutonAjouterElementTexte: { fontFamily: theme.fontBody, color: theme.colors.accent },
  enteteSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: theme.spacing.sm,
  },
  boutonAnnulerFusion: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radii.sm,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 4,
  },
  boutonAnnulerFusionEtape: {
    alignSelf: 'flex-start',
    backgroundColor: theme.colors.background,
    borderColor: theme.colors.accent,
    borderWidth: 1,
    borderRadius: theme.radii.sm,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 4,
  },
  boutonAnnulerFusionTexte: { fontFamily: theme.fontBody, color: theme.colors.accent, fontSize: 12 },
  statutAuto: { paddingBottom: theme.spacing.xs },
  statutAutoTexte: { fontFamily: theme.fontBody, color: theme.colors.textMuted, fontSize: 12 },
  statutAutoErreur: { color: theme.colors.warning },
  erreur: { fontFamily: theme.fontBody, color: theme.colors.warning },
  boutonPrincipal: {
    backgroundColor: theme.colors.accent,
    borderRadius: theme.radii.md,
    paddingVertical: theme.spacing.md,
    alignItems: 'center',
    marginTop: theme.spacing.md,
    marginBottom: theme.spacing.xl,
  },
  boutonPrincipalTexte: { fontFamily: theme.fontBodyBold, fontSize: 16, color: theme.colors.background },
}));
