import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { theme, creerStylesThemes } from '../theme/theme';
import { Bouton } from './ui';

// Cadre commun de la création pas à pas (refonte Événements § 5.1) : barre
// d'étapes (les étapes déjà vues passent en ✓ et restent cliquables, les
// autres sont grisées), contenu, pied « Retour / Continuer ».
export function AssistantPasAPas({
  etapes,
  etape,
  vus,
  onEtape,
  onRetour,
  onContinuer,
  libelleContinuer,
  enCours,
  children,
}: {
  etapes: string[];
  etape: number;
  vus: number;
  onEtape: (i: number) => void;
  onRetour: () => void;
  onContinuer: () => void;
  libelleContinuer: string;
  enCours?: boolean;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.flex}>
      <View style={styles.entete}>
        <Text style={styles.compteur} accessibilityLiveRegion="polite">
          {etape + 1} / {etapes.length}
        </Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.barre}>
          {etapes.map((libelle, i) => {
            const actuelle = i === etape;
            const faite = i < etape || (i <= vus && !actuelle);
            const accessible = i <= vus;
            return (
              <Pressable
                key={libelle}
                disabled={!accessible}
                onPress={() => onEtape(i)}
                accessibilityRole="button"
                accessibilityState={{ selected: actuelle, disabled: !accessible }}
                accessibilityLabel={`Étape ${i + 1} sur ${etapes.length} : ${libelle}${faite ? ', vue' : ''}`}
                style={[styles.etape, actuelle && styles.etapeActuelle, !accessible && styles.etapeGrisee]}
              >
                <View style={[styles.rond, actuelle && styles.rondActuel, faite && styles.rondFait]}>
                  <Text style={[styles.rondTexte, (actuelle || faite) && styles.rondTexteClair]}>{faite ? '✓' : i + 1}</Text>
                </View>
                <Text style={[styles.etapeTexte, actuelle && styles.etapeTexteActuelle]}>{libelle}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      <ScrollView style={styles.flex} contentContainerStyle={styles.contenu} keyboardShouldPersistTaps="handled">
        {children}
      </ScrollView>

      <View style={styles.pied}>
        {etape > 0 ? <Bouton titre="Retour" variante="contour" onPress={onRetour} style={styles.retour} /> : null}
        <Bouton titre={libelleContinuer} onPress={onContinuer} enCours={enCours} style={styles.continuer} />
      </View>
    </View>
  );
}

const styles = creerStylesThemes(() => ({
  flex: { flex: 1, backgroundColor: theme.colors.background },
  entete: { paddingTop: theme.spacing.sm, borderBottomWidth: 1, borderBottomColor: theme.colors.border },
  compteur: {
    fontFamily: theme.fontBodyBold,
    fontSize: 12,
    color: theme.colors.textMuted,
    paddingHorizontal: theme.spacing.md,
    marginBottom: theme.spacing.xs,
  },
  barre: { paddingHorizontal: theme.spacing.md, gap: theme.spacing.sm, paddingBottom: theme.spacing.sm },
  etape: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 44,
    paddingHorizontal: theme.spacing.sm,
    borderRadius: theme.radii.md,
  },
  etapeActuelle: { backgroundColor: theme.colors.selection },
  etapeGrisee: { opacity: 0.45 },
  rond: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rondActuel: { backgroundColor: theme.colors.accent, borderColor: theme.colors.accent },
  rondFait: { backgroundColor: theme.colors.success, borderColor: theme.colors.success },
  rondTexte: { fontFamily: theme.fontBodyBold, fontSize: 12, color: theme.colors.textMuted },
  rondTexteClair: { color: theme.colors.background },
  etapeTexte: { fontFamily: theme.fontBody, fontSize: 13, color: theme.colors.textMuted },
  etapeTexteActuelle: { fontFamily: theme.fontBodyBold, color: theme.colors.text },
  contenu: { padding: theme.spacing.md, gap: theme.spacing.md, paddingBottom: theme.spacing.xl },
  pied: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    padding: theme.spacing.md,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  retour: { flex: 1 },
  continuer: { flex: 2 },
}));
