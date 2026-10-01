import React, { useEffect, useState } from 'react';
import { ScrollView } from 'react-native';
import { theme, creerStylesThemes } from '../theme/theme';
import { alerte } from '../utils/alerte';
import { formaterDate, lireDateSaisie } from '../services/personnes';
import { enregistrerRepas, MOMENTS, supprimerRepas, type MomentRepas, type Repas } from '../services/repas';
import { messageErreurVoyage, obtenirVoyage } from '../services/voyage';
import { Aide, Champ, Erreur, Libelle, Puces } from '../components/formulaire';
import { Bouton } from '../components/ui';

function joursEntre(debut: string, fin: string): string[] {
  const jours: string[] = [];
  const [a, m, j] = debut.split('-').map(Number);
  for (let d = new Date(a, m - 1, j); ; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    if (iso > fin || jours.length > 14) break;
    jours.push(iso);
  }
  return jours;
}

// Ajouter ou modifier un repas (organisateurs) : nom, moment, jour.
export default function RepasFormScreen({ route, navigation }: any) {
  const voyageId: string = route.params?.voyageId;
  const existant: Repas | undefined = route.params?.repas;

  const [titre, setTitre] = useState(existant?.titre ?? '');
  const [moment, setMoment] = useState<MomentRepas>(existant?.moment ?? 'dejeuner');
  const [jours, setJours] = useState<string[]>([]);
  const [jour, setJour] = useState<string>(existant?.jour ?? 'aucun');
  const [jourTexte, setJourTexte] = useState('');
  const [notes, setNotes] = useState(existant?.notes ?? '');
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    navigation.setOptions({ title: existant ? 'Modifier le repas' : 'Nouveau repas' });
    obtenirVoyage(voyageId)
      .then((v) => {
        if (v.date_debut && v.date_fin) {
          // Le jour d'avant compte aussi (réveillon la veille).
          const [a, m, j] = v.date_debut.split('-').map(Number);
          const veille = new Date(a, m - 1, j - 1);
          const veilleIso = `${veille.getFullYear()}-${String(veille.getMonth() + 1).padStart(2, '0')}-${String(veille.getDate()).padStart(2, '0')}`;
          setJours(joursEntre(veilleIso, v.date_fin));
        }
      })
      .catch(() => {});
  }, [voyageId, existant, navigation]);

  const choisirMoment = (m: MomentRepas) => {
    setMoment(m);
    if (!titre.trim()) setTitre(MOMENTS.find((x) => x.id === m)?.libelle ?? '');
  };

  const valider = async () => {
    setErreur(null);
    if (!titre.trim()) return setErreur('Donnez un nom au repas (ex. « Réveillon »).');
    let jourIso: string | null = null;
    if (jours.length) jourIso = jour === 'aucun' ? null : jour;
    else if (jourTexte.trim()) {
      jourIso = lireDateSaisie(jourTexte);
      if (!jourIso) return setErreur('Date invalide (JJ/MM/AAAA).');
    } else jourIso = existant?.jour ?? null;
    setEnCours(true);
    try {
      await enregistrerRepas({ voyage_id: voyageId, titre: titre.trim(), jour: jourIso, moment, notes: notes.trim() || null }, existant?.id);
      navigation.goBack();
    } catch (e) {
      setErreur(messageErreurVoyage(e));
      setEnCours(false);
    }
  };

  const supprimer = () =>
    alerte(`Supprimer « ${existant!.titre} » ?`, 'Son menu et la répartition des tâches seront supprimés.', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: async () => {
          try {
            await supprimerRepas(existant!.id);
            navigation.pop(2);
          } catch (e) {
            setErreur(messageErreurVoyage(e));
          }
        },
      },
    ]);

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.contenu} keyboardShouldPersistTaps="handled">
      <Libelle>Moment</Libelle>
      <Puces options={MOMENTS} valeur={moment} onChange={choisirMoment} />

      <Libelle nativeID="libelle-titre-repas">Nom</Libelle>
      <Champ value={titre} onChangeText={setTitre} placeholder="Ex. Réveillon, déjeuner de Noël…" accessibilityLabelledBy="libelle-titre-repas" />

      <Libelle>Jour</Libelle>
      {jours.length ? (
        <Puces
          options={[...jours.map((j) => ({ id: j, libelle: formaterDate(j) })), { id: 'aucun', libelle: 'À préciser' }]}
          valeur={jour}
          onChange={setJour}
        />
      ) : (
        <>
          <Champ value={jourTexte} onChangeText={setJourTexte} placeholder="JJ/MM/AAAA (facultatif)" accessibilityLabel="Jour du repas" />
          <Aide>Le jour se choisira plus facilement une fois la date de l’événement retenue.</Aide>
        </>
      )}

      <Libelle nativeID="libelle-notes-repas">Notes (facultatif)</Libelle>
      <Champ value={notes} onChangeText={setNotes} multiline placeholder="Ex. 14 adultes, 5 enfants ; Léo sans gluten" accessibilityLabelledBy="libelle-notes-repas" />

      <Erreur texte={erreur} />
      <Bouton titre="Enregistrer" onPress={valider} enCours={enCours} style={styles.bouton} />
      {existant && <Bouton titre="Supprimer ce repas" variante="discret" onPress={supprimer} />}
    </ScrollView>
  );
}

const styles = creerStylesThemes(() => ({
  flex: { flex: 1, backgroundColor: theme.colors.background },
  contenu: { padding: theme.spacing.md, gap: theme.spacing.sm, paddingBottom: theme.spacing.xl },
  bouton: { marginTop: theme.spacing.md },
}));
