import React from 'react';
import { Pressable, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { theme, creerStylesThemes } from '../theme/theme';
import type { EtatJour, ObligatoireSemaine } from '../services/maison';
import { JOURS_COURTS, JOURS_LONGS } from '../utils/semaine';

// Grille de la semaine des tâches obligatoires (refonte Quotidien § 4.3) :
// une ligne par tâche, une case par jour. Un état n'est jamais porté par la
// couleur seule : ✓, ✕, « – » et le libellé accessible le disent aussi.

const LIBELLE_ETAT: Record<EtatJour, string> = {
  fait: 'fait',
  attente: 'en attente de validation',
  a_faire: 'à faire',
  a_venir: 'à venir',
  non_prevu: 'pas prévu',
  oublie: 'oublié',
};

export default function GrilleSemaine({
  obligatoires,
  aujourdhui,
  onCase,
}: {
  obligatoires: ObligatoireSemaine[];
  aujourdhui: string;
  // Le parent touche une case « à faire » ou « oubliée » pour la cocher.
  onCase?: (tache: ObligatoireSemaine, date: string, etat: EtatJour) => void;
}) {
  const jours = obligatoires[0]?.jours ?? [];
  return (
    <View style={styles.grille}>
      <View style={styles.rangee} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {jours.map((j, i) => (
          <View key={j.date} style={[styles.casePlace, j.date === aujourdhui && styles.enteteAujourdhui]}>
            <Text style={[styles.enteteTexte, j.date === aujourdhui && styles.enteteTexteAujourdhui]}>{JOURS_COURTS[i]}</Text>
          </View>
        ))}
      </View>
      {obligatoires.map((t) => (
        <View key={t.id} style={styles.tache}>
          <Text style={styles.libelle}>{t.libelle}</Text>
          <View style={styles.rangee}>
            {t.jours.map((j, i) => {
              const touchable = !!onCase && (j.etat === 'a_faire' || j.etat === 'oublie');
              const etiquette = `${t.libelle}, ${JOURS_LONGS[i]} : ${LIBELLE_ETAT[j.etat]}`;
              return (
                <View key={j.date} style={styles.casePlace}>
                  <Pressable
                    disabled={!touchable}
                    onPress={() => onCase?.(t, j.date, j.etat)}
                    accessibilityRole={touchable ? 'button' : 'text'}
                    accessibilityLabel={etiquette}
                    style={styles.zone}
                  >
                    <Rond etat={j.etat} />
                  </Pressable>
                </View>
              );
            })}
          </View>
        </View>
      ))}
    </View>
  );
}

function Rond({ etat }: { etat: EtatJour }) {
  if (etat === 'non_prevu') return <Text style={styles.tiret}>–</Text>;
  if (etat === 'fait') {
    return (
      <View style={[styles.rond, styles.rondFait]}>
        <Ionicons name="checkmark" size={18} color={theme.colors.background} />
      </View>
    );
  }
  if (etat === 'attente') {
    return (
      <View style={[styles.rond, styles.rondAnneau]}>
        <Ionicons name="time-outline" size={18} color={theme.colors.accent} />
      </View>
    );
  }
  if (etat === 'a_faire') return <View style={[styles.rond, styles.rondAnneau]} />;
  if (etat === 'oublie') {
    return (
      <View style={[styles.rond, styles.rondOublie]}>
        <Ionicons name="close" size={18} color={theme.colors.warning} />
      </View>
    );
  }
  return <View style={[styles.rond, styles.rondAVenir]} />;
}

const styles = creerStylesThemes(() => ({
  grille: { gap: theme.spacing.sm },
  rangee: { flexDirection: 'row' },
  casePlace: { flex: 1, alignItems: 'center' },
  zone: { minHeight: 44, minWidth: 40, alignItems: 'center', justifyContent: 'center' },
  enteteAujourdhui: { backgroundColor: theme.colors.accentTransparent, borderRadius: 10 },
  enteteTexte: { fontFamily: theme.fontBody, fontSize: 12, color: theme.colors.textMuted, paddingVertical: 4 },
  enteteTexteAujourdhui: { fontFamily: theme.fontBodyBold, color: theme.colors.accent },
  tache: { gap: 2 },
  libelle: { fontFamily: theme.fontBodyBold, fontSize: 15, color: theme.colors.text },
  rond: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  rondFait: { backgroundColor: theme.colors.accent },
  rondAnneau: { borderWidth: 2, borderColor: theme.colors.accent },
  rondAVenir: { backgroundColor: theme.colors.selectionTransparent, borderWidth: 1, borderColor: theme.colors.border },
  rondOublie: { borderWidth: 2, borderColor: theme.colors.warning },
  tiret: { fontFamily: theme.fontBody, fontSize: 18, color: theme.colors.textMuted },
}));
