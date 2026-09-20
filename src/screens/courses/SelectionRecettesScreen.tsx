import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, ActivityIndicator } from 'react-native';
import { theme } from '../../theme/theme';
import { useAuth } from '../../contexts/AuthContext';
import { listerRecettes } from '../../services/recettes';
import { obtenirOuCreerListeActive, ajouterRecettesALaListe } from '../../services/listesCourses';
import type { RecetteComplete } from '../../types/models';

// Sélection de plusieurs recettes et ajustement de leurs parts avant
// agrégation dans la liste de courses (cahier des charges §7).
export default function SelectionRecettesScreen({ route, navigation }: any) {
  const preselection: string[] = route.params?.preselection ?? [];
  const { foyer } = useAuth();
  const [recettes, setRecettes] = useState<RecetteComplete[]>([]);
  const [chargement, setChargement] = useState(true);
  const [enregistrement, setEnregistrement] = useState(false);
  const [selection, setSelection] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!foyer) return;
    listerRecettes(foyer.id).then((liste) => {
      setRecettes(liste);
      const initiale: Record<string, number> = {};
      liste.forEach((r) => {
        if (preselection.includes(r.id)) initiale[r.id] = r.parts_defaut;
      });
      setSelection(initiale);
      setChargement(false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [foyer]);

  const toggle = (recette: RecetteComplete) => {
    setSelection((prev) => {
      const copie = { ...prev };
      if (copie[recette.id] != null) {
        delete copie[recette.id];
      } else {
        copie[recette.id] = recette.parts_defaut;
      }
      return copie;
    });
  };

  const ajusterParts = (recetteId: string, delta: number) => {
    setSelection((prev) => ({ ...prev, [recetteId]: Math.max(1, (prev[recetteId] ?? 1) + delta) }));
  };

  const valider = async () => {
    if (!foyer) return;
    const choisies = recettes
      .filter((r) => selection[r.id] != null)
      .map((r) => ({ recette: r, partsSouhaitees: selection[r.id] }));
    if (choisies.length === 0) {
      navigation.goBack();
      return;
    }
    setEnregistrement(true);
    try {
      const liste = await obtenirOuCreerListeActive(foyer.id);
      await ajouterRecettesALaListe(liste.id, choisies);
      navigation.goBack();
    } finally {
      setEnregistrement(false);
    }
  };

  if (chargement) {
    return (
      <View style={styles.centre}>
        <ActivityIndicator color={theme.colors.accent} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.titre}>Choisir des recettes</Text>
      <FlatList
        data={recettes}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.liste}
        renderItem={({ item }) => {
          const choisie = selection[item.id] != null;
          return (
            <View style={styles.carte}>
              <Pressable style={styles.ligneCarte} onPress={() => toggle(item)}>
                <View style={[styles.checkbox, choisie && { backgroundColor: theme.colors.success }]} />
                <Text style={styles.carteTitre}>{item.titre}</Text>
              </Pressable>
              {choisie && (
                <View style={styles.partsZone}>
                  <Pressable style={styles.partsBouton} onPress={() => ajusterParts(item.id, -1)}>
                    <Text style={styles.partsBoutonTexte}>−</Text>
                  </Pressable>
                  <Text style={styles.partsValeur}>{selection[item.id]} parts</Text>
                  <Pressable style={styles.partsBouton} onPress={() => ajusterParts(item.id, 1)}>
                    <Text style={styles.partsBoutonTexte}>+</Text>
                  </Pressable>
                </View>
              )}
            </View>
          );
        }}
      />
      <Pressable style={styles.boutonPrincipal} onPress={valider} disabled={enregistrement}>
        {enregistrement ? (
          <ActivityIndicator color={theme.colors.background} />
        ) : (
          <Text style={styles.boutonPrincipalTexte}>Ajouter à la liste de courses</Text>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background, padding: theme.spacing.md },
  centre: { flex: 1, backgroundColor: theme.colors.background, alignItems: 'center', justifyContent: 'center' },
  titre: { fontFamily: theme.fontTitle, fontSize: 24, color: theme.colors.accent, marginBottom: theme.spacing.sm },
  liste: { gap: theme.spacing.sm, paddingBottom: theme.spacing.xl },
  carte: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radii.md,
    padding: theme.spacing.sm,
    gap: theme.spacing.xs,
  },
  ligneCarte: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
  checkbox: { width: 20, height: 20, borderRadius: theme.radii.sm, borderWidth: 2, borderColor: theme.colors.border },
  carteTitre: { fontFamily: theme.fontBodyBold, color: theme.colors.text, fontSize: 16 },
  partsZone: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, marginLeft: 28 },
  partsBouton: { backgroundColor: theme.colors.background, borderColor: theme.colors.border, borderWidth: 1, borderRadius: theme.radii.sm, width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  partsBoutonTexte: { fontFamily: theme.fontBodyBold, color: theme.colors.accent },
  partsValeur: { fontFamily: theme.fontBody, color: theme.colors.textMuted, fontSize: 13 },
  boutonPrincipal: { backgroundColor: theme.colors.accent, borderRadius: theme.radii.md, paddingVertical: theme.spacing.md, alignItems: 'center' },
  boutonPrincipalTexte: { fontFamily: theme.fontBodyBold, fontSize: 16, color: theme.colors.background },
});
