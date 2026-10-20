import React, { useEffect, useState } from 'react';
import { ScrollView } from 'react-native';
import { theme, creerStylesThemes } from '../theme/theme';
import { alerte } from '../utils/alerte';
import {
  dupliquerOption,
  enregistrerOption,
  listerOptions,
  listerTrajets,
  supprimerOption,
  type OptionTrajet,
  type Trajet,
} from '../services/transport';
import { messageErreurVoyage } from '../services/voyage';
import { Aide, Champ, Erreur, Libelle, Puces } from '../components/formulaire';
import { Bouton } from '../components/ui';

const SUGGESTIONS = ['En voiture', 'En train', 'En avion', 'En bateau', 'En covoiturage'];

// Proposer (ou renommer) une façon d'aller au voyage : « En bateau »,
// « En avion depuis Paris »… Ses étapes s'ajoutent ensuite depuis l'écran
// Transport. On peut partir d'une copie d'une option existante, pour une
// variante.
export default function OptionTrajetFormScreen({ route, navigation }: any) {
  const voyageId: string = route.params?.voyageId;
  const existante: OptionTrajet | undefined = route.params?.option;

  const [nom, setNom] = useState(existante?.nom ?? '');
  const [description, setDescription] = useState(existante?.description ?? '');
  const [autres, setAutres] = useState<OptionTrajet[]>([]);
  const [etapes, setEtapes] = useState<Trajet[]>([]);
  const [modele, setModele] = useState<string>('vide');
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    navigation.setOptions({ title: existante ? 'Modifier l’option' : 'Une façon d’y aller' });
    if (!existante) {
      Promise.all([listerOptions(voyageId), listerTrajets(voyageId)])
        .then(([o, t]) => {
          setAutres(o.filter((x) => t.some((e) => e.option_id === x.id)));
          setEtapes(t);
        })
        .catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voyageId]);

  const valider = async () => {
    setErreur(null);
    if (!nom.trim()) return setErreur('Donnez un nom (ex. « En bateau »).');
    setEnCours(true);
    try {
      const source = autres.find((o) => o.id === modele);
      if (existante) {
        await enregistrerOption({ voyage_id: voyageId, nom: nom.trim(), description: description.trim() || null }, existante.id);
      } else if (source) {
        const id = await dupliquerOption({ ...source, description: description.trim() || source.description }, etapes, nom.trim());
        void id;
      } else {
        await enregistrerOption({ voyage_id: voyageId, nom: nom.trim(), description: description.trim() || null });
      }
      navigation.goBack();
    } catch (e) {
      setErreur(messageErreurVoyage(e));
      setEnCours(false);
    }
  };

  const supprimer = () =>
    alerte(`Supprimer « ${existante!.nom} » ?`, 'Ses étapes et ses commentaires seront supprimés aussi.', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: async () => {
          try {
            await supprimerOption(existante!.id);
            navigation.goBack();
          } catch (e) {
            setErreur(messageErreurVoyage(e));
          }
        },
      },
    ]);

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.contenu} keyboardShouldPersistTaps="handled">
      <Libelle nativeID="libelle-nom-option">Nom</Libelle>
      <Champ value={nom} onChangeText={setNom} placeholder="Ex. En bateau" accessibilityLabelledBy="libelle-nom-option" />
      {!existante && (
        <Puces options={SUGGESTIONS.map((s) => ({ id: s, libelle: s }))} valeur={nom} onChange={setNom} />
      )}

      <Libelle nativeID="libelle-description-option">En quelques mots (facultatif)</Libelle>
      <Champ
        value={description}
        onChangeText={setDescription}
        multiline
        placeholder="Ex. Ferry de nuit Ouistreham–Portsmouth, cabines pour tous"
        accessibilityLabelledBy="libelle-description-option"
      />

      {!existante && autres.length > 0 && (
        <>
          <Libelle>Partir de</Libelle>
          <Puces
            options={[{ id: 'vide', libelle: 'Rien (étapes à ajouter)' }, ...autres.map((o) => ({ id: o.id, libelle: `Copie de « ${o.nom} »` }))]}
            valeur={modele}
            onChange={setModele}
          />
          <Aide>Une copie reprend toutes les étapes et leurs passagers : il ne reste qu’à changer ce qui diffère.</Aide>
        </>
      )}

      <Erreur texte={erreur} />
      <Bouton titre={existante ? 'Enregistrer' : 'Proposer'} onPress={valider} enCours={enCours} style={styles.bouton} />
      {existante && <Bouton titre="Supprimer cette option" variante="discret" onPress={supprimer} />}
    </ScrollView>
  );
}

const styles = creerStylesThemes(() => ({
  flex: { flex: 1, backgroundColor: theme.colors.background },
  contenu: { padding: theme.spacing.md, gap: theme.spacing.sm, paddingBottom: theme.spacing.xl },
  bouton: { marginTop: theme.spacing.md },
}));
