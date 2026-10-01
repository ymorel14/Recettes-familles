import React, { useEffect, useState } from 'react';
import { View, ScrollView, Image } from 'react-native';
import { theme, creerStylesThemes } from '../theme/theme';
import { alerte } from '../utils/alerte';
import {
  lireEntier,
  lireMontant,
  modifierHebergement,
  proposerHebergement,
  supprimerHebergement,
  typeDepuisLien,
  TYPES_HEBERGEMENT,
  type Hebergement,
  type TypeHebergement,
} from '../services/hebergements';
import { messageErreurVoyage } from '../services/voyage';
import { lireAnnonce } from '../services/annonces';
import { formaterEuros } from '../services/hebergements';
import { Aide, Champ, Erreur, Libelle, Puces } from '../components/formulaire';
import { Bouton } from '../components/ui';

const texte = (n: number | null | undefined) => (n == null ? '' : String(n).replace('.', ','));

// Proposer ou modifier un hébergement.
export default function HebergementFormScreen({ route, navigation }: any) {
  const voyageId: string = route.params?.voyageId;
  const existant: Hebergement | undefined = route.params?.hebergement;

  const [lien, setLien] = useState(existant?.lien ?? '');
  const [nom, setNom] = useState(existant?.nom ?? '');
  const [type, setType] = useState<TypeHebergement>(existant?.type ?? 'airbnb');
  const [ville, setVille] = useState(existant?.ville ?? '');
  const [adresse, setAdresse] = useState(existant?.adresse ?? '');
  const [capacite, setCapacite] = useState(texte(existant?.capacite));
  const [chambres, setChambres] = useState(texte(existant?.nb_chambres));
  const [modePrix, setModePrix] = useState<'total' | 'nuit'>(existant?.prix_total == null && existant?.prix_nuit != null ? 'nuit' : 'total');
  const [prix, setPrix] = useState(texte(existant?.prix_total ?? existant?.prix_nuit));
  const [frais, setFrais] = useState(texte(existant?.frais_annexes));
  const [description, setDescription] = useState(existant?.description ?? '');
  const [image, setImage] = useState<string | null>(existant?.image ?? null);
  const [lecture, setLecture] = useState(false);
  const [trouve, setTrouve] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    navigation.setOptions({ title: existant ? 'Modifier l’hébergement' : 'Proposer un hébergement' });
  }, [existant, navigation]);

  const changerLien = (l: string) => {
    setLien(l);
    const t = typeDepuisLien(l);
    if (t) setType(t);
  };

  // Remplit les champs encore vides à partir de la page de l'annonce.
  const remplirDepuisLien = async () => {
    setErreur(null);
    setTrouve(null);
    if (!/^https?:\/\//i.test(lien.trim())) return setErreur('Collez d’abord le lien de l’annonce.');
    setLecture(true);
    try {
      const a = await lireAnnonce(lien.trim());
      if (a.titre && !nom.trim()) setNom(a.titre.slice(0, 120));
      if (a.ville && !ville.trim()) setVille(a.ville);
      if (a.adresse && !adresse.trim()) setAdresse(a.adresse.replace(/,?\s*\d{5}\s+[^,]+$/, '') || a.adresse);
      if (a.capacite && !capacite.trim()) setCapacite(String(a.capacite));
      if (a.chambres && !chambres.trim()) setChambres(String(a.chambres));
      if (a.description && !description.trim()) setDescription(a.description);
      if (a.image) setImage(a.image);
      const infos = [a.site ? `Lu sur ${a.site}` : 'Annonce lue'];
      if (a.prix) infos.push(`prix affiché : ${formaterEuros(a.prix)} (à reporter selon qu’il s’agit du séjour ou d’une nuit)`);
      setTrouve(infos.join(' · ') + '. Vérifiez et complétez.');
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Lecture impossible.');
    } finally {
      setLecture(false);
    }
  };

  const valider = async () => {
    setErreur(null);
    if (!nom.trim()) return setErreur('Donnez un nom (ex. « Gîte des Tilleuls »).');
    const lienNet = lien.trim();
    if (lienNet && !/^https?:\/\//i.test(lienNet)) return setErreur('Le lien doit commencer par http:// ou https://');
    const montant = prix.trim() ? lireMontant(prix) : null;
    if (prix.trim() && montant === null) return setErreur('Prix invalide.');
    const montantFrais = frais.trim() ? lireMontant(frais) : null;
    if (frais.trim() && montantFrais === null) return setErreur('Frais invalides.');
    const cap = capacite.trim() ? lireEntier(capacite) : null;
    if (capacite.trim() && (cap === null || cap === 0)) return setErreur('Nombre de couchages invalide.');
    const ch = chambres.trim() ? lireEntier(chambres) : null;
    if (chambres.trim() && ch === null) return setErreur('Nombre de chambres invalide.');

    const donnees = {
      voyage_id: voyageId,
      nom: nom.trim(),
      type,
      lien: lienNet || null,
      ville: ville.trim() || null,
      adresse: adresse.trim() || null,
      capacite: cap,
      nb_chambres: ch,
      prix_total: modePrix === 'total' ? montant : null,
      prix_nuit: modePrix === 'nuit' ? montant : null,
      frais_annexes: montantFrais,
      description: description.trim() || null,
      image,
    };
    setEnCours(true);
    try {
      if (existant) await modifierHebergement(existant.id, donnees);
      else await proposerHebergement(donnees);
      navigation.goBack();
    } catch (e) {
      setErreur(messageErreurVoyage(e));
      setEnCours(false);
    }
  };

  const supprimer = () =>
    alerte('Retirer cette proposition ?', 'Les avis donnés dessus seront supprimés.', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Retirer',
        style: 'destructive',
        onPress: async () => {
          try {
            await supprimerHebergement(existant!.id);
            navigation.goBack();
          } catch (e) {
            setErreur(messageErreurVoyage(e));
          }
        },
      },
    ]);

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.contenu} keyboardShouldPersistTaps="handled">
      <Libelle nativeID="libelle-lien">Lien de l’annonce (facultatif)</Libelle>
      <Champ
        value={lien}
        onChangeText={changerLien}
        placeholder="https://…"
        autoCapitalize="none"
        keyboardType="url"
        accessibilityLabelledBy="libelle-lien"
      />

      <Bouton titre="Remplir depuis le lien" variante="contour" onPress={remplirDepuisLien} enCours={lecture} desactive={!lien.trim()} />
      {trouve && <Aide>{trouve}</Aide>}
      {image ? <Image source={{ uri: image }} style={styles.photo} accessibilityLabel="Photo de l’annonce" /> : null}

      <Libelle nativeID="libelle-nom">Nom</Libelle>
      <Champ value={nom} onChangeText={setNom} placeholder="Ex. Gîte des Tilleuls" accessibilityLabelledBy="libelle-nom" />

      <Libelle>Type</Libelle>
      <Puces options={TYPES_HEBERGEMENT} valeur={type} onChange={setType} />

      <View style={styles.ligne}>
        <View style={styles.colonne}>
          <Libelle nativeID="libelle-ville">Ville</Libelle>
          <Champ value={ville} onChangeText={setVille} accessibilityLabelledBy="libelle-ville" />
        </View>
        <View style={styles.colonne}>
          <Libelle nativeID="libelle-adresse">Adresse</Libelle>
          <Champ value={adresse} onChangeText={setAdresse} accessibilityLabelledBy="libelle-adresse" />
        </View>
      </View>

      <View style={styles.ligne}>
        <View style={styles.colonne}>
          <Libelle nativeID="libelle-capacite">Couchages</Libelle>
          <Champ value={capacite} onChangeText={setCapacite} keyboardType="number-pad" accessibilityLabelledBy="libelle-capacite" />
        </View>
        <View style={styles.colonne}>
          <Libelle nativeID="libelle-chambres">Chambres</Libelle>
          <Champ value={chambres} onChangeText={setChambres} keyboardType="number-pad" accessibilityLabelledBy="libelle-chambres" />
        </View>
      </View>

      <Libelle>Prix</Libelle>
      <Puces
        options={[
          { id: 'total', libelle: 'Pour tout le séjour' },
          { id: 'nuit', libelle: 'Par nuit' },
        ]}
        valeur={modePrix}
        onChange={setModePrix}
      />
      <View style={styles.ligne}>
        <View style={styles.colonne}>
          <Libelle nativeID="libelle-prix">{modePrix === 'total' ? 'Prix du séjour (€)' : 'Prix par nuit (€)'}</Libelle>
          <Champ value={prix} onChangeText={setPrix} keyboardType="decimal-pad" accessibilityLabelledBy="libelle-prix" />
        </View>
        <View style={styles.colonne}>
          <Libelle nativeID="libelle-frais">Frais annexes (€)</Libelle>
          <Champ value={frais} onChangeText={setFrais} keyboardType="decimal-pad" accessibilityLabelledBy="libelle-frais" />
        </View>
      </View>
      <Aide>Frais annexes : ménage, taxe de séjour… (la caution n’est pas un coût).</Aide>

      <Libelle nativeID="libelle-description">Pourquoi celui-ci ? (facultatif)</Libelle>
      <Champ
        value={description}
        onChangeText={setDescription}
        multiline
        placeholder="Ex. Piscine, grand jardin, à 20 min du parc…"
        accessibilityLabelledBy="libelle-description"
      />

      <Erreur texte={erreur} />
      <Bouton titre={existant ? 'Enregistrer' : 'Proposer'} onPress={valider} enCours={enCours} style={styles.bouton} />
      {existant && <Bouton titre="Retirer cette proposition" variante="discret" onPress={supprimer} />}
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
