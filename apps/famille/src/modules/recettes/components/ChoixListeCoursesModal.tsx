import React from 'react';
import { Text, Pressable, Modal } from 'react-native';
import { theme, creerStylesThemes } from '../theme/theme';
import type { ListeCourses } from '../services/listesCourses';

type Props = {
  // Listes proposées (null = fenêtre fermée).
  listes: ListeCourses[] | null;
  onChoisir: (liste: ListeCourses) => void;
  onFermer: () => void;
};

// Fenêtre « Ajouter à quelle liste ? » : choix de la liste de l'app
// Courses qui reçoit les ingrédients (la liste principale en tête).
export default function ChoixListeCoursesModal({ listes, onChoisir, onFermer }: Props) {
  return (
    <Modal visible={listes !== null} transparent animationType="fade" onRequestClose={onFermer}>
      <Pressable style={styles.fond} onPress={onFermer}>
        <Pressable style={styles.modale} onPress={() => {}}>
          <Text style={styles.titre}>Ajouter à quelle liste ?</Text>
          <Text style={styles.aide}>Les listes de courses sont dans l’app Courses.</Text>
          {(listes ?? []).map((l) => (
            <Pressable
              key={l.id}
              style={({ pressed }) => [styles.choix, l.principale && styles.choixPrincipal, pressed && styles.appuye]}
              onPress={() => onChoisir(l)}
              accessibilityRole="button"
            >
              <Text style={styles.choixTexte}>{l.nom}</Text>
              {l.principale && <Text style={styles.etiquette}>principale</Text>}
            </Pressable>
          ))}
          <Pressable style={styles.annuler} onPress={onFermer} accessibilityRole="button">
            <Text style={styles.annulerTexte}>Annuler</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = creerStylesThemes(() => ({
  fond: { flex: 1, backgroundColor: theme.colors.voileFort, justifyContent: 'center', padding: theme.spacing.lg },
  modale: {
    width: '100%',
    maxWidth: 440,
    alignSelf: 'center',
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radii.lg,
    padding: theme.spacing.md,
    gap: theme.spacing.xs,
  },
  titre: { fontFamily: theme.fontBodyBold, fontSize: 17, color: theme.colors.text },
  aide: { fontFamily: theme.fontBody, fontSize: 13, color: theme.colors.textMuted, marginBottom: theme.spacing.xs },
  choix: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    minHeight: 44,
    paddingHorizontal: theme.spacing.sm,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  choixPrincipal: { borderColor: theme.colors.accent },
  appuye: { opacity: 0.6 },
  choixTexte: { fontFamily: theme.fontBody, fontSize: 16, color: theme.colors.text },
  etiquette: { fontFamily: theme.fontBody, fontSize: 12, color: theme.colors.textMuted },
  annuler: { alignItems: 'center', paddingVertical: theme.spacing.sm },
  annulerTexte: { fontFamily: theme.fontBody, color: theme.colors.textMuted, textDecorationLine: 'underline' },
}));
