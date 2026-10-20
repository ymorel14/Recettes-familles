import React, { useEffect, useState } from 'react';
import { View, ScrollView } from 'react-native';
import { theme, creerStylesThemes } from '../theme/theme';
import { useAuth } from '../contexts/AuthContext';
import { alerte } from '../utils/alerte';
import { lireEntier, lireMontant } from '../services/hebergements';
import { ENERGIES, enregistrerVehicule, infoEnergie, supprimerVehicule } from '../services/transport';
import { messageErreurVoyage, type Energie, type Vehicule } from '../services/voyage';
import { Aide, Champ, Erreur, Libelle, Puces } from '../components/formulaire';
import { Bouton } from '../components/ui';

// Ajouter ou modifier un véhicule du foyer.
export default function VehiculeFormScreen({ route, navigation }: any) {
  const existant: Vehicule | undefined = route.params?.vehicule;
  const { foyer } = useAuth();

  const [nom, setNom] = useState(existant?.nom ?? '');
  const [energie, setEnergie] = useState<Energie>(existant?.energie ?? 'gazole');
  const [consommation, setConsommation] = useState(
    existant ? String(existant.consommation).replace('.', ',') : String(infoEnergie('gazole').consommation).replace('.', ',')
  );
  const [places, setPlaces] = useState(existant?.places ? String(existant.places) : '5');
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    navigation.setOptions({ title: existant ? 'Modifier le véhicule' : 'Nouveau véhicule' });
  }, [existant, navigation]);

  const choisirEnergie = (e: Energie) => {
    setEnergie(e);
    if (!existant) setConsommation(String(infoEnergie(e).consommation).replace('.', ','));
  };

  const valider = async () => {
    setErreur(null);
    const conso = lireMontant(consommation);
    const nbPlaces = places.trim() ? lireEntier(places) : null;
    if (!nom.trim()) return setErreur('Donnez un nom (ex. « Scénic »).');
    if (conso === null || conso <= 0) return setErreur('Consommation invalide.');
    if (places.trim() && (nbPlaces === null || nbPlaces < 1 || nbPlaces > 9)) return setErreur('Nombre de places invalide.');
    if (!foyer) return;
    setEnCours(true);
    try {
      await enregistrerVehicule(
        { foyer_id: existant?.foyer_id ?? foyer.id, nom: nom.trim(), energie, consommation: conso, places: nbPlaces },
        existant?.id
      );
      navigation.goBack();
    } catch (e) {
      setErreur(messageErreurVoyage(e));
      setEnCours(false);
    }
  };

  const supprimer = () =>
    alerte(`Retirer ${existant!.nom} ?`, 'Les trajets déjà saisis gardent leurs valeurs.', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Retirer',
        style: 'destructive',
        onPress: async () => {
          try {
            await supprimerVehicule(existant!.id);
            navigation.goBack();
          } catch (e) {
            setErreur(messageErreurVoyage(e));
          }
        },
      },
    ]);

  const unite = infoEnergie(energie).unite;

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.contenu} keyboardShouldPersistTaps="handled">
      <Libelle nativeID="libelle-nom">Nom</Libelle>
      <Champ value={nom} onChangeText={setNom} placeholder="Ex. Scénic, la Clio de Claire…" accessibilityLabelledBy="libelle-nom" />

      <Libelle>Énergie</Libelle>
      <Puces options={ENERGIES} valeur={energie} onChange={choisirEnergie} />

      <View style={styles.ligne}>
        <View style={styles.colonne}>
          <Libelle nativeID="libelle-conso">Consommation ({unite}/100 km)</Libelle>
          <Champ value={consommation} onChangeText={setConsommation} keyboardType="decimal-pad" accessibilityLabelledBy="libelle-conso" />
        </View>
        <View style={styles.colonne}>
          <Libelle nativeID="libelle-places">Places</Libelle>
          <Champ value={places} onChangeText={setPlaces} keyboardType="number-pad" accessibilityLabelledBy="libelle-places" />
        </View>
      </View>
      <Aide>La consommation réelle sur autoroute, chargé : souvent un peu plus que celle annoncée.</Aide>

      <Erreur texte={erreur} />
      <Bouton titre="Enregistrer" onPress={valider} enCours={enCours} style={styles.bouton} />
      {existant && <Bouton titre="Retirer ce véhicule" variante="discret" onPress={supprimer} />}
    </ScrollView>
  );
}

const styles = creerStylesThemes(() => ({
  flex: { flex: 1, backgroundColor: theme.colors.background },
  contenu: { padding: theme.spacing.md, gap: theme.spacing.sm, paddingBottom: theme.spacing.xl },
  ligne: { flexDirection: 'row', gap: theme.spacing.md },
  colonne: { flex: 1, gap: theme.spacing.sm },
  bouton: { marginTop: theme.spacing.md },
}));
