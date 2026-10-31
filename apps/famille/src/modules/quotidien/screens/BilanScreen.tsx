import React, { useCallback, useMemo, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { theme, creerStylesThemes } from '../theme/theme';
import { Carte, TitreSection } from '../components/elements';
import { Bouton, Chargement, MessageVide, Pastille } from '../components/ui';
import { Puce, Puces } from '../components/formulaire';
import { alerte } from '../utils/alerte';
import { extraireMessageErreur } from '@apps-famille/famille';
import {
  annulerBilan,
  annulerRealisation,
  bilanSemaine,
  formaterCentimes,
  lundiDe,
  validerBilan,
  validerRealisation,
  type BilanEnfant,
  type BilanSemaine,
  type DecisionBilan,
} from '../services/maison';
import { aujourdhuiIso, heureCourte, jourLong, nomDuJour } from '../utils/semaine';

// Bilan de la semaine (refonte Quotidien § 4.6) : une carte par enfant avec
// le montant, ce qui manque et, si la semaine est incomplète, le choix
// « Ne pas verser » / « Verser quand même ». Les réalisations encore en
// attente sont listées en haut : il faut les trancher avant de valider.
// Argent fictif : rien n'est versé ni prélevé.
export default function BilanScreen({ route, navigation }: any) {
  const lundi: string = route.params?.lundi ?? lundiDe(aujourdhuiIso());
  const [bilan, setBilan] = useState<BilanSemaine | null>(null);
  const [choix, setChoix] = useState<Record<string, DecisionBilan>>({});
  const [enCours, setEnCours] = useState<string | null>(null);

  const charger = useCallback(async () => {
    navigation.setOptions({ title: 'Bilan de la semaine' });
    try {
      setBilan(await bilanSemaine(lundi));
    } catch (e) {
      alerte('Chargement impossible', extraireMessageErreur(e, 'Veuillez réessayer.'));
    }
  }, [lundi, navigation]);

  useFocusEffect(
    useCallback(() => {
      charger();
    }, [charger])
  );

  // Décision effective d'un enfant : choix du parent, sinon par défaut.
  const decisionDe = useCallback(
    (b: BilanEnfant): DecisionBilan => b.decision ?? choix[b.personne_id] ?? (b.complete ? 'verse' : 'non_verse'),
    [choix]
  );

  const aMettre = useMemo(
    () =>
      (bilan?.bilans ?? [])
        .filter((b) => !b.decision && decisionDe(b) === 'verse')
        .reduce((total, b) => total + b.montant_prevu, 0),
    [bilan, decisionDe]
  );

  const agir = async (cle: string, action: () => Promise<void>) => {
    setEnCours(cle);
    try {
      await action();
      await charger();
    } catch (e) {
      alerte('Action impossible', extraireMessageErreur(e, 'Veuillez réessayer.'));
    } finally {
      setEnCours(null);
    }
  };

  if (!bilan) return <Chargement />;

  const enAttente = bilan.en_attente.length > 0;
  const aDecider = bilan.bilans.filter((b) => !b.decision);
  const annulable = bilan.bilans.some((b) => b.annulable);
  const pasTerminee = aujourdhuiIso() < bilan.dimanche;

  const valider = () =>
    agir('valider', async () => {
      const decisions: Record<string, DecisionBilan> = {};
      aDecider.forEach((b) => {
        decisions[b.personne_id] = decisionDe(b);
      });
      await validerBilan(bilan.lundi, decisions);
      alerte('Semaine validée', 'Vous pouvez annuler pendant 24 heures.');
    });

  const detail = (b: BilanEnfant): string => {
    if (b.complete) {
      return `Obligatoires faites chaque jour · coups de main ${b.aides_faites} sur ${b.aides_prevues}`;
    }
    return b.manquant.length > 0 ? b.manquant.join(' · ') : 'La semaine n’est pas complète.';
  };

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.contenu}>
      <Text style={styles.periode}>
        Du {jourLong(bilan.lundi)} au {jourLong(bilan.dimanche)}
      </Text>

      {bilan.bilans.length === 0 ? (
        <MessageVide
          titre="Pas de bilan cette semaine"
          texte="Un bilan est préparé pour chaque enfant qui a un montant d’argent de poche et au moins une tâche."
        />
      ) : null}

      {enAttente ? (
        <>
          <TitreSection titre="À trancher d’abord" detail="avant de valider la semaine" />
          {bilan.en_attente.map((r) => (
            <Carte key={r.realisation_id}>
              <Text style={styles.nom}>
                {r.libelle} · {r.prenom ?? ''}
              </Text>
              <Text style={styles.detail}>
                {r.prenom ?? 'L’enfant'} dit l’avoir fait {r.date === bilan.dimanche ? 'dimanche' : `le ${nomDuJour(r.date)}`} à {heureCourte(r.cree_le)}
              </Text>
              <View style={styles.ligne}>
                <View style={{ flex: 1 }}>
                  <Bouton
                    titre="Pas fait"
                    variante="contour"
                    enCours={enCours === `refus:${r.realisation_id}`}
                    onPress={() => agir(`refus:${r.realisation_id}`, () => annulerRealisation(r.realisation_id))}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Bouton
                    titre="Valider"
                    enCours={enCours === `ok:${r.realisation_id}`}
                    onPress={() => agir(`ok:${r.realisation_id}`, () => validerRealisation(r.realisation_id))}
                  />
                </View>
              </View>
            </Carte>
          ))}
        </>
      ) : null}

      {bilan.bilans.map((b) => {
        const decision = decisionDe(b);
        const montant = b.decision ? b.montant_verse ?? 0 : decision === 'verse' ? b.montant_prevu : 0;
        return (
          <Carte key={b.personne_id} accent={!b.decision && b.complete}>
            <View style={styles.ligne}>
              <Text style={[styles.nom, { flex: 1, fontSize: 20 }]}>{b.prenom}</Text>
              <Text style={[styles.montant, { color: montant > 0 ? theme.colors.success : theme.colors.textMuted }]}>
                {montant > 0 ? formaterCentimes(montant, true) : '0 €'}
              </Text>
            </View>
            <Pastille
              texte={b.complete ? 'Semaine complète' : 'Il manque quelque chose'}
              ton={b.complete ? 'succes' : 'alerte'}
            />
            <Text style={styles.detail}>{detail(b)}</Text>
            {b.decision ? (
              <Text style={styles.detail}>
                {b.decision === 'verse' ? `Versé : ${formaterCentimes(b.montant_verse ?? 0)}` : 'Rien versé cette semaine'}
              </Text>
            ) : !b.complete ? (
              <Puces>
                <Puce
                  texte="Ne pas verser"
                  actif={decision === 'non_verse'}
                  onPress={() => setChoix({ ...choix, [b.personne_id]: 'non_verse' })}
                />
                <Puce
                  texte="Verser quand même"
                  actif={decision === 'verse'}
                  onPress={() => setChoix({ ...choix, [b.personne_id]: 'verse' })}
                />
              </Puces>
            ) : null}
          </Carte>
        );
      })}

      {aDecider.length > 0 ? (
        <Carte>
          <Text style={styles.detail}>À mettre dans les tirelires</Text>
          <Text style={styles.montant}>{formaterCentimes(aMettre)}</Text>
          {pasTerminee ? <Text style={styles.detail}>Le bilan se valide à partir de dimanche.</Text> : null}
          {enAttente ? <Text style={styles.detail}>Validez ou refusez d’abord les tâches ci-dessus.</Text> : null}
          <Bouton titre="Valider la semaine" onPress={valider} enCours={enCours === 'valider'} desactive={enAttente || pasTerminee} />
        </Carte>
      ) : null}

      {annulable ? (
        <Bouton
          titre="Annuler la validation"
          variante="pointille"
          enCours={enCours === 'annuler'}
          onPress={() =>
            alerte('Annuler la validation ?', 'Les montants mis dans les tirelires cette semaine seront retirés.', [
              { text: 'Non', style: 'cancel' },
              { text: 'Annuler la validation', style: 'destructive', onPress: () => agir('annuler', () => annulerBilan(bilan.lundi)) },
            ])
          }
        />
      ) : null}

      <Text style={styles.detail}>Argent fictif : rien n’est versé ni prélevé, les euros ne sont qu’un repère.</Text>
    </ScrollView>
  );
}

const styles = creerStylesThemes(() => ({
  flex: { flex: 1, backgroundColor: theme.colors.background },
  contenu: { padding: theme.spacing.md, gap: theme.spacing.sm, paddingBottom: theme.spacing.xl },
  ligne: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
  periode: { fontFamily: theme.fontTitle, fontSize: 20, color: theme.colors.text },
  nom: { fontFamily: theme.fontBodyBold, fontSize: 16, color: theme.colors.text },
  montant: { fontFamily: theme.fontTitle, fontSize: 24, color: theme.colors.accent },
  detail: { fontFamily: theme.fontBody, fontSize: 14, color: theme.colors.textMuted },
}));
