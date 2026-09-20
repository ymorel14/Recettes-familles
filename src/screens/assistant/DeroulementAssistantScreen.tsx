import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { useKeepAwake } from 'expo-keep-awake';
import { theme } from '../../theme/theme';
import { obtenirRecette, resoudreEtapePourAffichage } from '../../services/recettes';
import type { RecetteComplete } from '../../types/models';

// Déroulé pas-à-pas d'une vraie recette, avec rappel automatique des
// quantités et recalcul selon le nombre de parts choisi (cahier des charges §8).
export default function DeroulementAssistantScreen({ route }: any) {
  const { recetteId } = route.params;
  const [recette, setRecette] = useState<RecetteComplete | null>(null);
  const [etapeIndex, setEtapeIndex] = useState(0);
  const [partsSouhaitees, setPartsSouhaitees] = useState<number | null>(null);

  useKeepAwake();

  useEffect(() => {
    obtenirRecette(recetteId).then((r) => {
      setRecette(r);
      setPartsSouhaitees(r.parts_defaut);
    });
  }, [recetteId]);

  if (!recette || partsSouhaitees === null) {
    return (
      <View style={styles.centre}>
        <ActivityIndicator color={theme.colors.accent} />
      </View>
    );
  }

  if (recette.etapes.length === 0) {
    return (
      <View style={styles.centre}>
        <Text style={styles.texteVide}>Cette recette n'a pas encore d'étapes renseignées.</Text>
      </View>
    );
  }

  const facteurEchelle = partsSouhaitees / (recette.parts_defaut || 1);
  const etape = recette.etapes[etapeIndex];
  const derniere = etapeIndex === recette.etapes.length - 1;

  return (
    <View style={styles.container}>
      <View style={styles.partsZone}>
        <Text style={styles.partsLabel}>Parts :</Text>
        <Pressable
          style={styles.partsBouton}
          onPress={() => setPartsSouhaitees((p) => Math.max(1, (p ?? 1) - 1))}
        >
          <Text style={styles.partsBoutonTexte}>−</Text>
        </Pressable>
        <Text style={styles.partsValeur}>{partsSouhaitees}</Text>
        <Pressable style={styles.partsBouton} onPress={() => setPartsSouhaitees((p) => (p ?? 1) + 1)}>
          <Text style={styles.partsBoutonTexte}>+</Text>
        </Pressable>
      </View>

      <Text style={styles.compteur}>
        Étape {etapeIndex + 1} / {recette.etapes.length}
      </Text>
      <Text style={styles.etape}>
        {resoudreEtapePourAffichage(etape.texte, recette.ingredients, facteurEchelle)}
      </Text>

      <View style={styles.nav}>
        <Pressable
          style={[styles.bouton, etapeIndex === 0 && styles.boutonDesactive]}
          disabled={etapeIndex === 0}
          onPress={() => setEtapeIndex((e) => Math.max(0, e - 1))}
        >
          <Text style={styles.boutonTexte}>Précédent</Text>
        </Pressable>
        <Pressable
          style={[styles.bouton, derniere && styles.boutonDesactive]}
          disabled={derniere}
          onPress={() => setEtapeIndex((e) => Math.min(recette.etapes.length - 1, e + 1))}
        >
          <Text style={styles.boutonTexte}>Suivant</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background, padding: theme.spacing.lg, justifyContent: 'center' },
  centre: { flex: 1, backgroundColor: theme.colors.background, alignItems: 'center', justifyContent: 'center', padding: theme.spacing.lg },
  texteVide: { fontFamily: theme.fontBody, color: theme.colors.textMuted, textAlign: 'center' },
  partsZone: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: theme.spacing.sm, marginBottom: theme.spacing.lg },
  partsLabel: { fontFamily: theme.fontBody, color: theme.colors.textMuted },
  partsBouton: { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, borderWidth: 1, borderRadius: theme.radii.sm, width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  partsBoutonTexte: { fontFamily: theme.fontBodyBold, color: theme.colors.accent, fontSize: 18 },
  partsValeur: { fontFamily: theme.fontBodyBold, color: theme.colors.text, fontSize: 16, minWidth: 24, textAlign: 'center' },
  compteur: { fontFamily: theme.fontBody, fontSize: 14, color: theme.colors.textMuted, textAlign: 'center', marginBottom: theme.spacing.md },
  etape: { fontFamily: theme.fontTitle, fontSize: 26, color: theme.colors.text, textAlign: 'center', lineHeight: 36 },
  nav: { flexDirection: 'row', justifyContent: 'space-between', marginTop: theme.spacing.xl, gap: theme.spacing.md },
  bouton: { flex: 1, backgroundColor: theme.colors.accent, borderRadius: theme.radii.md, paddingVertical: theme.spacing.md, alignItems: 'center' },
  boutonDesactive: { backgroundColor: theme.colors.selection, opacity: 0.5 },
  boutonTexte: { fontFamily: theme.fontBodyBold, fontSize: 16, color: theme.colors.background },
});
