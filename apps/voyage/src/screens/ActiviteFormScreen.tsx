import React, { useEffect, useState } from 'react';
import { View, ScrollView, Image } from 'react-native';
import { theme, creerStylesThemes } from '../theme/theme';
import { alerte } from '../utils/alerte';
import { lireDateSaisie } from '../services/personnes';
import { lireEntier, lireMontant } from '../services/hebergements';
import {
  CATEGORIES_ACTIVITE,
  enregistrerActivite,
  supprimerActivite,
  type Activite,
  type CategorieActivite,
} from '../services/activites';
import { messageErreurVoyage } from '../services/voyage';
import { lireAnnonce, type Annonce } from '../services/annonces';
import { Aide, Champ, Erreur, Libelle, Puces } from '../components/formulaire';
import { Bouton } from '../components/ui';

const texte = (n: number | null | undefined) => (n == null ? '' : String(n).replace('.', ','));
const versSaisie = (iso: string | null | undefined) => (iso ? iso.split('-').reverse().join('/') : '');

// Proposer ou modifier une activité (visite, parc, restaurant…).
export default function ActiviteFormScreen({ route, navigation }: any) {
  const voyageId: string = route.params?.voyageId;
  const existante: Activite | undefined = route.params?.activite;

  const [titre, setTitre] = useState(existante?.titre ?? '');
  const [categorie, setCategorie] = useState<CategorieActivite>(existante?.categorie ?? 'visite');
  const [lien, setLien] = useState(existante?.lien ?? '');
  const [adresse, setAdresse] = useState(existante?.adresse ?? '');
  const [jour, setJour] = useState(versSaisie(existante?.jour));
  const [prixAdulte, setPrixAdulte] = useState(texte(existante?.prix_adulte));
  const [prixEnfant, setPrixEnfant] = useState(texte(existante?.prix_enfant));
  const [ageMaxEnfant, setAgeMaxEnfant] = useState(texte(existante?.age_max_enfant));
  const [ageGratuit, setAgeGratuit] = useState(texte(existante?.age_gratuit));
  const [forfait, setForfait] = useState(texte(existante?.prix_forfait));
  const [description, setDescription] = useState(existante?.description ?? '');
  const [image, setImage] = useState<string | null>(existante?.image ?? null);
  const [lecture, setLecture] = useState(false);
  const [trouve, setTrouve] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    navigation.setOptions({ title: existante ? 'Modifier l’activité' : 'Proposer une activité' });
  }, [existante, navigation]);

  const CATEGORIE_DU_GENRE: Partial<Record<NonNullable<Annonce['genre']>, CategorieActivite>> = {
    restaurant: 'restaurant',
    parc: 'parc_attraction',
    musee: 'musee',
    chateau: 'chateau',
    spectacle: 'spectacle',
  };

  // Remplit les champs encore vides à partir du site de l'activité.
  const remplirDepuisLien = async () => {
    setErreur(null);
    setTrouve(null);
    if (!/^https?:\/\//i.test(lien.trim())) return setErreur('Collez d’abord le lien du site.');
    setLecture(true);
    try {
      const a = await lireAnnonce(lien.trim());
      if (a.titre && !titre.trim()) setTitre(a.titre.slice(0, 120));
      if ((a.adresse || a.ville) && !adresse.trim()) setAdresse(a.adresse ?? a.ville ?? '');
      if (a.description && !description.trim()) setDescription(a.description);
      if (a.image) setImage(a.image);
      const c = a.genre ? CATEGORIE_DU_GENRE[a.genre] : undefined;
      if (c && !existante) setCategorie(c);
      if (a.prix && !prixAdulte.trim()) setPrixAdulte(String(a.prix).replace('.', ','));
      setTrouve(`${a.site ? `Lu sur ${a.site}` : 'Page lue'}. Vérifiez les tarifs et complétez.`);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Lecture impossible.');
    } finally {
      setLecture(false);
    }
  };

  const valider = async () => {
    setErreur(null);
    if (!titre.trim()) return setErreur('Donnez un nom à l’activité.');
    const montants = {
      prix_adulte: prixAdulte.trim() ? lireMontant(prixAdulte) : null,
      prix_enfant: prixEnfant.trim() ? lireMontant(prixEnfant) : null,
      prix_forfait: forfait.trim() ? lireMontant(forfait) : null,
    };
    if ((prixAdulte.trim() && montants.prix_adulte === null) || (prixEnfant.trim() && montants.prix_enfant === null) || (forfait.trim() && montants.prix_forfait === null)) {
      return setErreur('Un des prix est invalide.');
    }
    const ages = {
      age_max_enfant: ageMaxEnfant.trim() ? lireEntier(ageMaxEnfant) : null,
      age_gratuit: ageGratuit.trim() ? lireEntier(ageGratuit) : null,
    };
    if ((ageMaxEnfant.trim() && (ages.age_max_enfant === null || ages.age_max_enfant > 25)) || (ageGratuit.trim() && (ages.age_gratuit === null || ages.age_gratuit > 25))) {
      return setErreur('Un des âges est invalide.');
    }
    if (montants.prix_enfant !== null && ages.age_max_enfant === null) {
      return setErreur('Indiquez jusqu’à quel âge s’applique le tarif enfant.');
    }
    const jourIso = jour.trim() ? lireDateSaisie(jour) : null;
    if (jour.trim() && !jourIso) return setErreur('Date invalide (JJ/MM/AAAA).');
    if (lien.trim() && !/^https?:\/\//i.test(lien.trim())) return setErreur('Le lien doit commencer par http:// ou https://');

    setEnCours(true);
    try {
      await enregistrerActivite(
        {
          voyage_id: voyageId,
          titre: titre.trim(),
          categorie,
          lien: lien.trim() || null,
          adresse: adresse.trim() || null,
          jour: jourIso,
          description: description.trim() || null,
          image,
          ...montants,
          ...ages,
        },
        existante?.id
      );
      navigation.goBack();
    } catch (e) {
      setErreur(messageErreurVoyage(e));
      setEnCours(false);
    }
  };

  const supprimer = () =>
    alerte('Supprimer cette activité ?', undefined, [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: async () => {
          try {
            await supprimerActivite(existante!.id);
            navigation.goBack();
          } catch (e) {
            setErreur(messageErreurVoyage(e));
          }
        },
      },
    ]);

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.contenu} keyboardShouldPersistTaps="handled">
      <Libelle nativeID="libelle-lien-haut">Site ou billetterie (facultatif)</Libelle>
      <Champ value={lien} onChangeText={setLien} autoCapitalize="none" keyboardType="url" placeholder="https://…" accessibilityLabelledBy="libelle-lien-haut" />
      <Bouton titre="Remplir depuis le lien" variante="contour" onPress={remplirDepuisLien} enCours={lecture} desactive={!lien.trim()} />
      {trouve && <Aide>{trouve}</Aide>}
      {image ? <Image source={{ uri: image }} style={styles.photo} accessibilityLabel="Photo de l’activité" /> : null}

      <Libelle nativeID="libelle-titre">Quoi ?</Libelle>
      <Champ value={titre} onChangeText={setTitre} placeholder="Ex. Puy du Fou, château de Chambord…" accessibilityLabelledBy="libelle-titre" />

      <Libelle>Catégorie</Libelle>
      <Puces options={CATEGORIES_ACTIVITE} valeur={categorie} onChange={setCategorie} />

      <Libelle>Tarifs</Libelle>
      <View style={styles.ligne}>
        <View style={styles.colonne}>
          <Libelle nativeID="libelle-adulte">Adulte (€)</Libelle>
          <Champ value={prixAdulte} onChangeText={setPrixAdulte} keyboardType="decimal-pad" accessibilityLabelledBy="libelle-adulte" />
        </View>
        <View style={styles.colonne}>
          <Libelle nativeID="libelle-enfant">Enfant (€)</Libelle>
          <Champ value={prixEnfant} onChangeText={setPrixEnfant} keyboardType="decimal-pad" accessibilityLabelledBy="libelle-enfant" />
        </View>
      </View>
      <View style={styles.ligne}>
        <View style={styles.colonne}>
          <Libelle nativeID="libelle-agemax">Tarif enfant jusqu’à (ans)</Libelle>
          <Champ value={ageMaxEnfant} onChangeText={setAgeMaxEnfant} keyboardType="number-pad" accessibilityLabelledBy="libelle-agemax" />
        </View>
        <View style={styles.colonne}>
          <Libelle nativeID="libelle-gratuit">Gratuit avant (ans)</Libelle>
          <Champ value={ageGratuit} onChangeText={setAgeGratuit} keyboardType="number-pad" accessibilityLabelledBy="libelle-gratuit" />
        </View>
      </View>
      <Libelle nativeID="libelle-forfait">Forfait pour le groupe (€, facultatif)</Libelle>
      <Champ value={forfait} onChangeText={setForfait} keyboardType="decimal-pad" accessibilityLabelledBy="libelle-forfait" />
      <Aide>
        Ex. Puy du Fou : adulte 65 €, enfant 52 € jusqu’à 13 ans, gratuit avant 3 ans. Un restaurant : un forfait
        estimé pour le groupe. L’âge de chacun vient de sa date de naissance.
      </Aide>

      <View style={styles.ligne}>
        <View style={styles.colonne}>
          <Libelle nativeID="libelle-jour">Jour prévu</Libelle>
          <Champ value={jour} onChangeText={setJour} placeholder="JJ/MM/AAAA" accessibilityLabelledBy="libelle-jour" />
        </View>
        <View style={styles.colonne}>
          <Libelle nativeID="libelle-adresse">Lieu</Libelle>
          <Champ value={adresse} onChangeText={setAdresse} accessibilityLabelledBy="libelle-adresse" />
        </View>
      </View>

      <Libelle nativeID="libelle-description">Pourquoi y aller ? (facultatif)</Libelle>
      <Champ value={description} onChangeText={setDescription} multiline accessibilityLabelledBy="libelle-description" />

      <Erreur texte={erreur} />
      <Bouton titre={existante ? 'Enregistrer' : 'Proposer'} onPress={valider} enCours={enCours} style={styles.bouton} />
      {existante && <Bouton titre="Supprimer cette activité" variante="discret" onPress={supprimer} />}
    </ScrollView>
  );
}

const styles = creerStylesThemes(() => ({
  flex: { flex: 1, backgroundColor: theme.colors.background },
  contenu: { padding: theme.spacing.md, gap: theme.spacing.sm, paddingBottom: theme.spacing.xl },
  ligne: { flexDirection: 'row', gap: theme.spacing.md },
  colonne: { flex: 1, gap: theme.spacing.sm },
  bouton: { marginTop: theme.spacing.md },
  photo: { width: '100%', height: 180, borderRadius: theme.radii.lg, backgroundColor: theme.colors.surface },
}));
