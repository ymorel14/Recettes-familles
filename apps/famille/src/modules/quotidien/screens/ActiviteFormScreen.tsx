import React, { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { theme, creerStylesThemes } from '../theme/theme';
import { Bouton } from '../components/ui';
import { alerte } from '../utils/alerte';
import { extraireMessageErreur } from '@apps-famille/famille';
import { lireDateSaisie } from '../services/personnes';
import { creerActivite, JOURS, lireHeureSaisie } from '../services/quotidien';
import { BandeauBrouillon } from '../../../composants/assistant';
import { ajouterHeures, type ActiviteLue } from '../../../services/planningAssistant';

function isoVersFr(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const [a, m, j] = iso.split('-');
  return `${j}/${m}/${a}`;
}

function dateFr(d: Date): string {
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

// Fin de l'année scolaire en cours : 30 juin.
function finAnneeScolaire(): Date {
  const auj = new Date();
  return new Date(auj.getMonth() >= 6 ? auj.getFullYear() + 1 : auj.getFullYear(), 5, 30);
}

// Activité récurrente du groupe (jour, horaires, lieu, période) : ses
// séances et leurs trajets aller et retour sont créés aussitôt, vacances
// scolaires de la zone du groupe sautées.
export default function ActiviteFormScreen({ route, navigation }: any) {
  const { groupeId, zone, brouillon } = route.params as { groupeId: string; zone: string | null; brouillon?: ActiviteLue };
  // Brouillon lu par l'assistant sur un planning (ImportPlanning) : tout
  // reste modifiable avant « Ajouter l'activité ».
  const [nom, setNom] = useState(brouillon?.nom ?? '');
  const [lieu, setLieu] = useState(brouillon?.lieu ?? '');
  const [jour, setJour] = useState<number>(brouillon?.jour ?? 3);
  const [debut, setDebut] = useState(brouillon?.heure_debut ?? '14:00');
  const [fin, setFin] = useState(brouillon?.heure_fin ?? (brouillon ? ajouterHeures(brouillon.heure_debut, 1) : '16:00'));
  const [du, setDu] = useState(isoVersFr(brouillon?.date_debut) ?? dateFr(new Date()));
  const [au, setAu] = useState(isoVersFr(brouillon?.date_fin) ?? dateFr(finAnneeScolaire()));
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const valider = async () => {
    setErreur(null);
    const hDebut = lireHeureSaisie(debut);
    const hFin = lireHeureSaisie(fin);
    const dDu = lireDateSaisie(du);
    const dAu = lireDateSaisie(au);
    if (!nom.trim()) return setErreur('Indiquez le nom de l’activité.');
    if (!hDebut || !hFin) return setErreur('Heures attendues au format 14:00 ou 14h.');
    if (hFin <= hDebut) return setErreur('L’heure de fin doit suivre l’heure de début.');
    if (!dDu || !dAu) return setErreur('Dates attendues au format JJ/MM/AAAA.');
    if (dAu < dDu) return setErreur('La date de fin doit suivre la date de début.');
    setEnCours(true);
    try {
      const n = await creerActivite({
        groupe_id: groupeId,
        nom: nom.trim(),
        lieu: lieu.trim() || null,
        jour_semaine: jour,
        heure_debut: hDebut,
        heure_fin: hFin,
        date_debut: dDu,
        date_fin: dAu,
      });
      alerte('Activité ajoutée', `${n} séance${n > 1 ? 's' : ''} créée${n > 1 ? 's' : ''}, avec leurs trajets aller et retour.`);
      navigation.goBack();
    } catch (e) {
      setErreur(extraireMessageErreur(e, 'Enregistrement impossible.'));
    } finally {
      setEnCours(false);
    }
  };

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.contenu} keyboardShouldPersistTaps="handled">
      {brouillon ? <BandeauBrouillon /> : null}
      <Text style={styles.libelle}>Activité</Text>
      <TextInput
        style={styles.champ}
        value={nom}
        onChangeText={setNom}
        placeholder="ex. Entraînement de foot"
        placeholderTextColor={theme.colors.textMuted}
        accessibilityLabel="Nom de l'activité"
      />
      <Text style={styles.libelle}>Lieu</Text>
      <TextInput
        style={styles.champ}
        value={lieu}
        onChangeText={setLieu}
        placeholder="ex. Stade municipal (pas une adresse personnelle)"
        placeholderTextColor={theme.colors.textMuted}
        accessibilityLabel="Lieu de l'activité"
      />
      <Text style={styles.libelle}>Jour</Text>
      <View style={styles.puces}>
        {JOURS.map((j, i) => (
          <Pressable
            key={j}
            onPress={() => setJour(i + 1)}
            style={[styles.puce, jour === i + 1 && styles.puceActive]}
            accessibilityRole="radio"
            accessibilityState={{ selected: jour === i + 1 }}
          >
            <Text style={[styles.puceTexte, jour === i + 1 && { color: theme.colors.background }]}>
              {j.charAt(0).toUpperCase() + j.slice(1, 3)}
            </Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.deux}>
        <View style={styles.moitie}>
          <Text style={styles.libelle}>Début</Text>
          <TextInput style={styles.champ} value={debut} onChangeText={setDebut} accessibilityLabel="Heure de début" />
        </View>
        <View style={styles.moitie}>
          <Text style={styles.libelle}>Fin</Text>
          <TextInput style={styles.champ} value={fin} onChangeText={setFin} accessibilityLabel="Heure de fin" />
        </View>
      </View>
      <View style={styles.deux}>
        <View style={styles.moitie}>
          <Text style={styles.libelle}>Du</Text>
          <TextInput style={styles.champ} value={du} onChangeText={setDu} keyboardType="numbers-and-punctuation" accessibilityLabel="Première date" />
        </View>
        <View style={styles.moitie}>
          <Text style={styles.libelle}>Au</Text>
          <TextInput style={styles.champ} value={au} onChangeText={setAu} keyboardType="numbers-and-punctuation" accessibilityLabel="Dernière date" />
        </View>
      </View>
      <Text style={styles.aide}>
        {zone
          ? `Les vacances scolaires (${zone === 'Corse' ? 'Corse' : `zone ${zone}`}) sont sautées.`
          : 'Aucune zone de vacances choisie pour ce groupe : une séance chaque semaine, vacances comprises.'}
      </Text>
      {erreur && <Text style={styles.erreur}>{erreur}</Text>}
      <Bouton titre="Ajouter l’activité" onPress={valider} enCours={enCours} />
    </ScrollView>
  );
}

const styles = creerStylesThemes(() => ({
  flex: { flex: 1, backgroundColor: theme.colors.background },
  contenu: { padding: theme.spacing.md, gap: theme.spacing.xs, paddingBottom: theme.spacing.xl },
  libelle: { fontFamily: theme.fontBodyBold, fontSize: 14, color: theme.colors.text, marginTop: theme.spacing.sm },
  aide: { fontFamily: theme.fontBody, fontSize: 13, color: theme.colors.textMuted, marginVertical: theme.spacing.sm },
  champ: {
    minHeight: 44,
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radii.md,
    paddingHorizontal: theme.spacing.sm,
    color: theme.colors.text,
    fontFamily: theme.fontBody,
    fontSize: 16,
  },
  deux: { flexDirection: 'row', gap: theme.spacing.sm },
  moitie: { flex: 1 },
  puces: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.xs },
  puce: {
    minHeight: 40,
    minWidth: 48,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: theme.colors.accent,
  },
  puceActive: { backgroundColor: theme.colors.accent },
  puceTexte: { fontFamily: theme.fontBodyBold, fontSize: 14, color: theme.colors.accent },
  erreur: { fontFamily: theme.fontBody, fontSize: 14, color: theme.colors.warning },
}));
