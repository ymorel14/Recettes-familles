import React, { useEffect, useState } from 'react';
import { ScrollView } from 'react-native';
import { theme, creerStylesThemes } from '../theme/theme';
import { alerte } from '../utils/alerte';
import { lireMontant } from '../services/hebergements';
import {
  BASES_POSTE,
  CATEGORIES_POSTE,
  enregistrerPoste,
  messageErreurVoyage,
  supprimerPoste,
  type BasePoste,
  type CategoriePoste,
  type Poste,
} from '../services/voyage';
import { Aide, Champ, Erreur, Libelle, Puces } from '../components/formulaire';
import { Bouton } from '../components/ui';

// Ajouter ou modifier une dépense diverse du budget (organisateurs).
export default function PosteFormScreen({ route, navigation }: any) {
  const voyageId: string = route.params?.voyageId;
  const existant: Poste | undefined = route.params?.poste;

  const [libelle, setLibelle] = useState(existant?.libelle ?? '');
  const [categorie, setCategorie] = useState<CategoriePoste>(existant?.categorie ?? 'repas');
  const [montant, setMontant] = useState(existant ? String(existant.montant).replace('.', ',') : '');
  const [base, setBase] = useState<BasePoste>(existant?.base ?? 'total');
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    navigation.setOptions({ title: existant ? 'Modifier la dépense' : 'Nouvelle dépense' });
  }, [existant, navigation]);

  const choisirCategorie = (c: CategoriePoste) => {
    setCategorie(c);
    if (!libelle.trim()) setLibelle(CATEGORIES_POSTE.find((x) => x.id === c)?.libelle ?? '');
  };

  const valider = async () => {
    setErreur(null);
    const m = lireMontant(montant);
    if (!libelle.trim()) return setErreur('Donnez un nom à la dépense.');
    if (m === null) return setErreur('Montant invalide.');
    setEnCours(true);
    try {
      await enregistrerPoste({ voyage_id: voyageId, libelle: libelle.trim(), categorie, montant: m, base }, existant?.id);
      navigation.goBack();
    } catch (e) {
      setErreur(messageErreurVoyage(e));
      setEnCours(false);
    }
  };

  const supprimer = () =>
    alerte('Supprimer cette dépense ?', undefined, [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: async () => {
          try {
            await supprimerPoste(existant!.id);
            navigation.goBack();
          } catch (e) {
            setErreur(messageErreurVoyage(e));
          }
        },
      },
    ]);

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.contenu} keyboardShouldPersistTaps="handled">
      <Libelle>Catégorie</Libelle>
      <Puces options={CATEGORIES_POSTE} valeur={categorie} onChange={choisirCategorie} />

      <Libelle nativeID="libelle-nom">Nom</Libelle>
      <Champ value={libelle} onChangeText={setLibelle} placeholder="Ex. Courses sur place" accessibilityLabelledBy="libelle-nom" />

      <Libelle nativeID="libelle-montant">Montant (€)</Libelle>
      <Champ value={montant} onChangeText={setMontant} keyboardType="decimal-pad" accessibilityLabelledBy="libelle-montant" />

      <Libelle>Compté</Libelle>
      <Puces options={BASES_POSTE} valeur={base} onChange={setBase} />
      <Aide>
        « Une fois » et « par nuit » sont des frais communs, partagés selon le réglage du voyage. « Par personne » est
        compté pour chacun, enfants compris.
      </Aide>

      <Erreur texte={erreur} />
      <Bouton titre="Enregistrer" onPress={valider} enCours={enCours} style={styles.bouton} />
      {existant && <Bouton titre="Supprimer cette dépense" variante="discret" onPress={supprimer} />}
    </ScrollView>
  );
}

const styles = creerStylesThemes(() => ({
  flex: { flex: 1, backgroundColor: theme.colors.background },
  contenu: { padding: theme.spacing.md, gap: theme.spacing.sm, paddingBottom: theme.spacing.xl },
  bouton: { marginTop: theme.spacing.md },
}));
