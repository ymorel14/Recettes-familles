import React, { useEffect, useState } from 'react';
import { View, ScrollView } from 'react-native';
import { theme, creerStylesThemes } from '../theme/theme';
import { useAuth } from '../contexts/AuthContext';
import { alerte } from '../utils/alerte';
import { lireDateSaisie, listerPersonnes, type Personne } from '../services/personnes';
import {
  ajouterDispo,
  ETATS,
  modifierDispo,
  supprimerDispo,
  type EtatDispo,
  type PeriodeDispo,
} from '../services/calendrier';
import { mesPersonnes, messageErreurVoyage } from '../services/voyage';
import { Aide, CaseACocher, Champ, Erreur, Libelle, Puces } from '../components/formulaire';
import { Bouton, Chargement } from '../components/ui';

// "2026-10-12" → "12/10/2026"
function versSaisie(iso: string | undefined): string {
  if (!iso) return '';
  const [a, m, j] = iso.split('-');
  return `${j}/${m}/${a}`;
}

// Ajouter ou modifier une période du calendrier commun, pour soi ou pour un
// enfant sans compte de son foyer.
export default function DisponibiliteScreen({ route, navigation }: any) {
  const existante: PeriodeDispo | undefined = route.params?.periode;
  const dateInitiale: string | undefined = route.params?.date;
  const { session, foyer } = useAuth();
  const moiId = session?.user.id ?? '';

  const [personnes, setPersonnes] = useState<Personne[] | null>(null);
  const [personneId, setPersonneId] = useState<string | null>(existante?.personne_id ?? null);
  const [debut, setDebut] = useState(versSaisie(existante?.date_debut ?? dateInitiale));
  const [fin, setFin] = useState(versSaisie(existante?.date_fin ?? dateInitiale));
  const [etat, setEtat] = useState<EtatDispo>(existante?.etat ?? 'indisponible');
  const [motif, setMotif] = useState(existante?.motif ?? '');
  const [prive, setPrive] = useState(existante?.prive ?? false);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    navigation.setOptions({ title: existante ? 'Modifier la période' : 'Nouvelle période' });
    listerPersonnes(foyer ? [foyer.id] : [])
      .then((liste) => {
        const miennes = mesPersonnes(liste, moiId, foyer?.id ?? null);
        setPersonnes(miennes);
        setPersonneId((id) => id ?? miennes.find((p) => p.utilisateur_id === moiId)?.id ?? miennes[0]?.id ?? null);
      })
      .catch(() => setPersonnes([]));
  }, [foyer, moiId, existante, navigation]);

  const valider = async () => {
    setErreur(null);
    const d = lireDateSaisie(debut);
    const f = fin.trim() ? lireDateSaisie(fin) : d;
    if (!personneId) return setErreur('Choisissez pour qui.');
    if (!d) return setErreur('Date de début invalide (JJ/MM/AAAA).');
    if (!f) return setErreur('Date de fin invalide (JJ/MM/AAAA).');
    if (f < d) return setErreur('La fin doit être après le début.');
    const donnees = {
      personne_id: personneId,
      date_debut: d,
      date_fin: f,
      etat,
      motif: motif.trim() || null,
      prive: prive && !!motif.trim(),
    };
    setEnCours(true);
    try {
      if (existante) await modifierDispo(existante.id, donnees);
      else await ajouterDispo(donnees);
      navigation.goBack();
    } catch (e) {
      setErreur(messageErreurVoyage(e));
      setEnCours(false);
    }
  };

  const supprimer = () =>
    alerte('Supprimer cette période ?', undefined, [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: async () => {
          try {
            await supprimerDispo(existante!.id);
            navigation.goBack();
          } catch (e) {
            setErreur(messageErreurVoyage(e));
          }
        },
      },
    ]);

  if (personnes === null) return <Chargement />;

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.contenu} keyboardShouldPersistTaps="handled">
      {personnes.length > 1 && (
        <>
          <Libelle>Pour qui ?</Libelle>
          <Puces
            options={personnes.map((p) => ({ id: p.id, libelle: p.utilisateur_id === moiId ? `${p.prenom} (moi)` : p.prenom }))}
            valeur={personneId}
            onChange={setPersonneId}
          />
        </>
      )}

      <Libelle>État</Libelle>
      <Puces options={ETATS} valeur={etat} onChange={setEtat} />

      <View style={styles.ligne}>
        <View style={styles.colonne}>
          <Libelle nativeID="libelle-debut">Du</Libelle>
          <Champ
            value={debut}
            onChangeText={setDebut}
            placeholder="JJ/MM/AAAA"
            keyboardType="numbers-and-punctuation"
            accessibilityLabelledBy="libelle-debut"
          />
        </View>
        <View style={styles.colonne}>
          <Libelle nativeID="libelle-fin">Au (inclus)</Libelle>
          <Champ
            value={fin}
            onChangeText={setFin}
            placeholder="JJ/MM/AAAA"
            keyboardType="numbers-and-punctuation"
            accessibilityLabelledBy="libelle-fin"
          />
        </View>
      </View>
      <Aide>Pour un seul jour, laissez la fin vide.</Aide>

      <Libelle nativeID="libelle-motif">Motif (facultatif)</Libelle>
      <Champ
        value={motif}
        onChangeText={setMotif}
        placeholder="Ex. Congés, colonie, travail…"
        accessibilityLabelledBy="libelle-motif"
      />
      <CaseACocher
        coche={prive}
        onChange={setPrive}
        libelle="Motif privé"
        aide="Les autres verront seulement l’état, pas le motif."
      />

      <Erreur texte={erreur} />
      <Bouton titre="Enregistrer" onPress={valider} enCours={enCours} style={styles.bouton} />
      {existante && <Bouton titre="Supprimer cette période" variante="discret" onPress={supprimer} />}
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
