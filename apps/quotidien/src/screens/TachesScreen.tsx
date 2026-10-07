import React, { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { theme, creerStylesThemes } from '../theme/theme';
import { BandeauDemo, TitreSection } from '../components/elements';
import { TACHES_DEMO, type TacheDemo } from '../donnees/demo';

// Tâches de la maison : à faire, faites (à valider par un parent), validées.
// Phase 0 : données de démonstration ; cocher ne fait que changer l'affichage.
export default function TachesScreen() {
  const [taches, setTaches] = useState<TacheDemo[]>(TACHES_DEMO);

  const basculer = (id: string) =>
    setTaches((liste) =>
      liste.map((t) =>
        t.id !== id ? t : { ...t, etat: t.etat === 'a_faire' ? 'faite' : t.etat === 'faite' ? 'validee' : 'a_faire' }
      )
    );

  const groupes: { titre: string; etat: TacheDemo['etat'] }[] = [
    { titre: 'À faire', etat: 'a_faire' },
    { titre: 'À valider', etat: 'faite' },
    { titre: 'Validées', etat: 'validee' },
  ];

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.contenu}>
      <BandeauDemo />
      {groupes.map((g) => {
        const liste = taches.filter((t) => t.etat === g.etat);
        if (!liste.length) return null;
        return (
          <View key={g.etat} style={styles.groupe}>
            <TitreSection titre={g.titre} detail={`${liste.length}`} />
            {liste.map((t) => (
              <Pressable
                key={t.id}
                style={styles.tache}
                onPress={() => basculer(t.id)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: t.etat !== 'a_faire' }}
                accessibilityLabel={`${t.libelle}, pour ${t.pour}`}
              >
                <Ionicons
                  name={t.etat === 'a_faire' ? 'ellipse-outline' : t.etat === 'faite' ? 'checkmark-circle-outline' : 'checkmark-circle'}
                  size={26}
                  color={t.etat === 'validee' ? theme.colors.success : theme.colors.accent}
                />
                <View style={styles.textes}>
                  <Text style={[styles.libelle, t.etat === 'validee' && styles.barre]}>{t.libelle}</Text>
                  <Text style={styles.detail}>
                    {t.pour}
                    {t.recurrence ? ` · ${t.recurrence}` : ''}
                  </Text>
                </View>
                <Text style={styles.points}>+{t.points} pts</Text>
              </Pressable>
            ))}
          </View>
        );
      })}
      <Text style={styles.aide}>Touchez une tâche : à faire → faite → validée par un parent.</Text>
    </ScrollView>
  );
}

const styles = creerStylesThemes(() => ({
  flex: { flex: 1, backgroundColor: theme.colors.background },
  contenu: { padding: theme.spacing.md, gap: theme.spacing.sm, paddingBottom: theme.spacing.xl },
  groupe: { gap: theme.spacing.xs },
  tache: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radii.lg,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  textes: { flex: 1, gap: 2 },
  libelle: { fontFamily: theme.fontBodyBold, fontSize: 16, color: theme.colors.text },
  barre: { textDecorationLine: 'line-through', color: theme.colors.textMuted },
  detail: { fontFamily: theme.fontBody, fontSize: 13, color: theme.colors.textMuted },
  points: { fontFamily: theme.fontBodyBold, fontSize: 15, color: theme.colors.accent },
  aide: { fontFamily: theme.fontBody, fontSize: 13, color: theme.colors.textMuted, textAlign: 'center' },
}));
