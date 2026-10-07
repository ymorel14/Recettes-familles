import React, { useState } from 'react';
import { Text, Pressable, ActivityIndicator, Modal } from 'react-native';
import { alerte } from '../utils/alerte';
import { theme, creerStylesThemes } from '../theme/theme';
import { useAuth } from '../contexts/AuthContext';
import { extraireMessageErreur } from '@apps-famille/famille';

type Props = {
  visible: boolean;
  onFermer: () => void;
};

// Fenêtre "Afficher la famille…" : choix de la famille active quand
// l'utilisateur en a plusieurs (ex. grands-parents de deux branches). Le
// choix est enregistré en base : il vaut aussi pour les autres apps de la
// famille (Cuisine…).
export default function SelecteurFamilleModal({ visible, onFermer }: Props) {
  const { familles, changerFamille } = useAuth();
  const [enCours, setEnCours] = useState(false);

  const choisir = async (idFamille: string) => {
    setEnCours(true);
    try {
      await changerFamille(idFamille);
      onFermer();
    } catch (e) {
      alerte('Changement impossible', extraireMessageErreur(e, 'Veuillez réessayer.'));
    } finally {
      setEnCours(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onFermer}>
      <Pressable style={styles.fond} onPress={onFermer}>
        <Pressable style={styles.modale} onPress={() => {}}>
          <Text style={styles.titre}>Afficher la famille…</Text>
          <Text style={styles.aide}>Ce choix vaut aussi pour les autres applications de la famille.</Text>
          {familles.map((f) => (
            <Pressable
              key={f.id}
              style={[styles.choix, f.active && styles.choixActuel]}
              onPress={() => choisir(f.id)}
              disabled={enCours || f.active}
              accessibilityRole="radio"
              accessibilityState={{ selected: f.active }}
            >
              <Text style={styles.choixTexte}>{f.nom}</Text>
              {f.active && <Text style={styles.coche}>✓</Text>}
            </Pressable>
          ))}
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
