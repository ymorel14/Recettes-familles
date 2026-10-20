import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator, Modal } from 'react-native';
import { alerte } from '../utils/alerte';
import { theme, creerStylesThemes } from '../theme/theme';
import { classerCategorie, useGroupesCategories } from '../services/categories';
import type { IdGroupeCategorie } from '../types/models';

type Props = {
  // Catégorie à ranger (null = fenêtre fermée).
  categorie: { id: string; nom: string; groupeActuel: string } | null;
  onFermer: () => void;
  onClassee: () => void;
};

// Fenêtre "Ranger « X » dans…" : choix du groupe d'une catégorie (appui long
// sur sa vignette). La liste des catégories étant commune à tous les foyers,
// ce classement vaut pour tout le monde.
export default function ChoixGroupeModal({ categorie, onFermer, onClassee }: Props) {
  const [enCours, setEnCours] = useState(false);
  const { groupes } = useGroupesCategories();

  const choisir = async (groupeId: IdGroupeCategorie) => {
    if (!categorie) return;
    setEnCours(true);
    try {
      await classerCategorie(categorie.id, groupeId);
      onClassee();
    } catch (e) {
      alerte('Échec du classement', e instanceof Error ? e.message : 'Veuillez réessayer.');
    } finally {
      setEnCours(false);
    }
  };

  return (
    <Modal visible={categorie !== null} transparent animationType="fade" onRequestClose={onFermer}>
      <Pressable style={styles.fond} onPress={onFermer}>
        <Pressable style={styles.modale} onPress={() => {}}>
          <Text style={styles.titre}>Ranger « {categorie?.nom} » dans…</Text>
          <Text style={styles.aide}>
            Ce classement est commun à tous les foyers qui utilisent cette catégorie.
          </Text>
          {groupes.map((g) => {
            const actuel = g.id === categorie?.groupeActuel;
            return (
              <Pressable
                key={g.id}
                style={[styles.choix, actuel && styles.choixActuel]}
                onPress={() => choisir(g.id)}
                disabled={enCours || actuel}
              >
                <Text style={styles.choixTexte}>{g.nom}</Text>
                {actuel && <Text style={styles.coche}>✓</Text>}
              </Pressable>
            );
          })}
          {enCours ? (
            <ActivityIndicator color={theme.colors.accent} />
          ) : (
            <Pressable style={styles.annuler} onPress={onFermer}>
              <Text style={styles.annulerTexte}>Annuler</Text>
            </Pressable>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = creerStylesThemes(() => ({
  fond: {
    flex: 1,
    backgroundColor: theme.colors.voileFort,
    justifyContent: 'center',
    padding: theme.spacing.lg,
  },
  modale: {
    // Largeur limitée (navigateur) ; sans effet sur téléphone, plus étroit.
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
  aide: {
    fontFamily: theme.fontBody,
    fontSize: 12,
    color: theme.colors.textMuted,
    marginBottom: theme.spacing.xs,
  },
  choix: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.sm,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  choixActuel: { backgroundColor: theme.colors.selectionTransparent, borderColor: theme.colors.accent },
  choixTexte: { fontFamily: theme.fontBody, fontSize: 16, color: theme.colors.text },
  coche: { fontFamily: theme.fontBodyBold, color: theme.colors.accent },
  annuler: { alignItems: 'center', paddingVertical: theme.spacing.sm },
  annulerTexte: {
    fontFamily: theme.fontBody,
    color: theme.colors.textMuted,
    textDecorationLine: 'underline',
  },
}));
