import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { theme, creerStylesThemes } from '../theme/theme';
import { BandeauDemo, Carte, TitreSection } from '../components/elements';
import { TIRELIRES_DEMO, formaterPoints } from '../donnees/demo';

// Argent de poche VIRTUEL : un compteur par enfant, sans aucun flux d'argent
// réel (pas de paiement, pas de carte, pas de lien bancaire).
// Phase 0 : données de démonstration.
export default function ArgentPocheScreen() {
  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.contenu}>
      <BandeauDemo />
      {TIRELIRES_DEMO.map((t) => {
        const progression = t.objectif ? Math.min(1, t.solde / t.objectif.points) : 0;
        return (
          <View key={t.enfant} style={styles.bloc}>
            <TitreSection titre={t.enfant} detail={`${t.hebdomadaire} points par semaine`} />
            <Carte>
              <Text style={styles.solde}>{formaterPoints(t.solde)}</Text>
              {t.objectif && (
                <View style={styles.objectif}>
                  <Text style={styles.detail}>
                    Objectif : {t.objectif.libelle}, {formaterPoints(t.objectif.points)}
                  </Text>
                  <View style={styles.barreFond} accessibilityLabel={`${Math.round(progression * 100)} % de l'objectif`}>
                    <View style={[styles.barre, { width: `${progression * 100}%` }]} />
                  </View>
                </View>
              )}
              {t.mouvements.map((m) => (
                <View key={m.id} style={styles.mouvement}>
                  <Text style={styles.date}>{m.date}</Text>
                  <Text style={styles.libelle} numberOfLines={1}>
                    {m.libelle}
                  </Text>
                  <Text style={[styles.montant, { color: m.points < 0 ? theme.colors.warning : theme.colors.success }]}>
                    {m.points < 0 ? '−' : ''}
                    {formaterPoints(m.points, true)}
                  </Text>
                </View>
              ))}
            </Carte>
          </View>
        );
      })}
      <Text style={styles.aide}>Argent fictif : rien n'est versé ni prélevé. Les euros entre parenthèses ne sont qu'un repère.</Text>
    </ScrollView>
  );
}

const styles = creerStylesThemes(() => ({
  flex: { flex: 1, backgroundColor: theme.colors.background },
  contenu: { padding: theme.spacing.md, gap: theme.spacing.sm, paddingBottom: theme.spacing.xl },
  bloc: { gap: theme.spacing.xs },
  solde: { fontFamily: theme.fontTitle, fontSize: 26, color: theme.colors.accent },
  objectif: { gap: 6, marginBottom: theme.spacing.xs },
  barreFond: { height: 10, borderRadius: 5, backgroundColor: theme.colors.selectionTransparent },
  barre: { height: 10, borderRadius: 5, backgroundColor: theme.colors.accent },
  mouvement: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, minHeight: 28 },
  date: { width: 44, fontFamily: theme.fontBody, fontSize: 13, color: theme.colors.textMuted },
  libelle: { flex: 1, fontFamily: theme.fontBody, fontSize: 14, color: theme.colors.text },
  montant: { fontFamily: theme.fontBodyBold, fontSize: 14 },
  detail: { fontFamily: theme.fontBody, fontSize: 14, color: theme.colors.textMuted },
  aide: { fontFamily: theme.fontBody, fontSize: 13, color: theme.colors.textMuted, textAlign: 'center' },
}));
