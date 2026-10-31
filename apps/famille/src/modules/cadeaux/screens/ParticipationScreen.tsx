import React, { useCallback, useState } from 'react';
import { View, Text, TextInput, ScrollView } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { theme, creerStylesThemes } from '../theme/theme';
import { useAuth } from '../contexts/AuthContext';
import { extraireMessageErreur } from '@apps-famille/famille';
import { alerte } from '../utils/alerte';
import {
  etatPots,
  formaterPrix,
  lireMontant,
  obtenirSouhait,
  participer,
  retirerParticipation,
  type EtatPot,
  type Souhait,
} from '../services/wishlist';
import { Bouton, Chargement } from '../components/ui';
import JaugePot from '../components/JaugePot';

// Participation d'un proche au pot commun d'un cadeau. Le montant saisi
// n'est lisible que par lui (règles RLS de la migration 7) ; il voit aussi
// la somme réunie par toute la famille, sans savoir qui a donné combien.
export default function ParticipationScreen({ route, navigation }: any) {
  const { listeId, souhaitId, prenom } = route.params as { listeId: string; souhaitId: string; prenom?: string };
  const { session } = useAuth();
  const [souhait, setSouhait] = useState<Souhait | null>(null);
  const [pot, setPot] = useState<EtatPot | null>(null);
  const [montant, setMontant] = useState('');
  const [enCours, setEnCours] = useState<'enregistrer' | 'retirer' | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  const moiId = session?.user.id ?? '';

  const charger = useCallback(async () => {
    try {
      setErreur(null);
      const [s, pots] = await Promise.all([obtenirSouhait(souhaitId), etatPots(listeId)]);
      const p = pots.get(souhaitId) ?? { souhait_id: souhaitId, total: 0, ma_participation: null };
      setSouhait(s);
      setPot(p);
      setMontant(p.ma_participation != null ? String(p.ma_participation).replace('.', ',') : '');
      navigation.setOptions({ title: p.ma_participation != null ? 'Ma participation' : 'Participer' });
    } catch (e) {
      setErreur(extraireMessageErreur(e, 'Chargement impossible.'));
    }
  }, [listeId, souhaitId, navigation]);

  useFocusEffect(
    useCallback(() => {
      charger();
    }, [charger])
  );

  if (!souhait || !pot) return erreur ? <Text style={styles.erreur}>{erreur}</Text> : <Chargement />;

  const dejaParticipe = pot.ma_participation != null;
  // Pot fermé (retiré de la liste, ou n'est plus un pot commun) : on peut
  // seulement retirer sa participation.
  const ferme = !souhait.pot_commun || !!souhait.supprime_le;
  const pour = prenom ?? 'la personne';

  const enregistrer = async () => {
    setErreur(null);
    const valeur = lireMontant(montant);
    if (valeur == null || valeur <= 0) return setErreur('Indiquez un montant, par exemple 30.');
    setEnCours('enregistrer');
    try {
      await participer(souhaitId, moiId, valeur);
      navigation.goBack();
    } catch (e) {
      setErreur(extraireMessageErreur(e, 'Enregistrement impossible.'));
    } finally {
      setEnCours(null);
    }
  };

  const retirer = () =>
    alerte('Retirer votre participation ?', undefined, [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Retirer',
        style: 'destructive',
        onPress: async () => {
          setEnCours('retirer');
          try {
            await retirerParticipation(souhaitId, moiId);
            navigation.goBack();
          } catch (e) {
            setErreur(extraireMessageErreur(e, 'Impossible de retirer votre participation.'));
          } finally {
            setEnCours(null);
          }
        },
      },
    ]);

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.contenu} keyboardShouldPersistTaps="handled">
      <Text style={styles.surtitre}>Pot commun pour {pour}</Text>
      <Text style={styles.titre}>{souhait.titre}</Text>

      <View style={styles.carte}>
        <JaugePot total={pot.total} objectif={souhait.prix} />
        <Text style={styles.aide}>
          Somme promise par toute la famille, vous compris. Personne ne sait qui a donné combien.
        </Text>
      </View>

      {ferme ? (
        <View style={styles.bandeau}>
          <Ionicons name="alert-circle-outline" size={20} color={theme.colors.warning} />
          <Text style={styles.bandeauTexte}>
            {souhait.supprime_le
              ? `${pour} a retiré ce cadeau de sa liste.`
              : 'Ce cadeau n’est plus en pot commun.'}{' '}
            {dejaParticipe ? `Vous aviez promis ${formaterPrix(pot.ma_participation)}.` : ''}
          </Text>
        </View>
      ) : (
        <>
          <Text style={styles.libelle} nativeID="libelle-montant">
            Votre participation (€)
          </Text>
          <TextInput
            style={styles.champ}
            value={montant}
            onChangeText={setMontant}
            placeholder="30"
            placeholderTextColor={theme.colors.textMuted}
            keyboardType="decimal-pad"
            accessibilityLabelledBy="libelle-montant"
            autoFocus={!dejaParticipe}
          />
          <View style={styles.discret}>
            <Ionicons name="lock-closed-outline" size={14} color={theme.colors.accent} />
            <Text style={styles.discretTexte}>
              Vous seul voyez ce montant. {pour} ne voit ni la somme, ni qui participe.
            </Text>
          </View>
        </>
      )}

      {erreur && <Text style={styles.erreur}>{erreur}</Text>}
      {!ferme && (
        <Bouton
          titre={dejaParticipe ? 'Modifier ma participation' : 'Participer'}
          onPress={enregistrer}
          enCours={enCours === 'enregistrer'}
          style={styles.bouton}
        />
      )}
      {dejaParticipe && (
        <Bouton variante="discret" titre="Retirer ma participation" onPress={retirer} enCours={enCours === 'retirer'} />
      )}
    </ScrollView>
  );
}

const styles = creerStylesThemes(() => ({
  flex: { flex: 1, backgroundColor: theme.colors.background },
  contenu: { padding: theme.spacing.md, gap: theme.spacing.sm, paddingBottom: theme.spacing.xl },
  surtitre: {
    fontFamily: theme.fontBodyBold,
    fontSize: 12,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: theme.colors.textMuted,
  },
  titre: { fontFamily: theme.fontTitle, fontSize: 28, color: theme.colors.text },
  carte: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radii.lg,
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
    marginVertical: theme.spacing.xs,
  },
  aide: { fontFamily: theme.fontBody, fontSize: 13, color: theme.colors.textMuted },
  libelle: { fontFamily: theme.fontBodyBold, fontSize: 15, color: theme.colors.text, marginTop: theme.spacing.xs },
  champ: {
    minHeight: 52,
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radii.md,
    paddingHorizontal: theme.spacing.sm,
    color: theme.colors.text,
    fontFamily: theme.fontTitle,
    fontSize: 22,
  },
  discret: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  discretTexte: { flex: 1, fontFamily: theme.fontBody, fontSize: 13, color: theme.colors.textMuted },
  bandeau: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    alignItems: 'flex-start',
    backgroundColor: theme.colors.accentTransparent,
    borderRadius: theme.radii.md,
    padding: theme.spacing.sm,
  },
  bandeauTexte: { flex: 1, fontFamily: theme.fontBody, fontSize: 14, color: theme.colors.text },
  bouton: { marginTop: theme.spacing.md },
  erreur: { fontFamily: theme.fontBody, fontSize: 14, color: theme.colors.warning, padding: theme.spacing.sm },
}));
