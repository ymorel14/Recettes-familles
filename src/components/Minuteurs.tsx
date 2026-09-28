import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, Modal, TextInput } from 'react-native';
import { theme, creerStylesThemes } from '../theme/theme';
import { formaterCompteARebours } from '../services/durees';
import type { Minuteur } from '../hooks/useMinuteurs';
import ZoneClavier from './ZoneClavier';

// Minuteurs du mode assistant : la barre des minuteurs en cours (compte à
// rebours, sonnerie) et la fenêtre pour en lancer un à la main.

export function BarreMinuteurs({
  minuteurs,
  maintenant,
  onRetirer,
  onAcquitter,
}: {
  minuteurs: Minuteur[];
  maintenant: number;
  onRetirer: (id: string) => void;
  onAcquitter: () => void;
}) {
  if (minuteurs.length === 0) return null;
  return (
    <View style={styles.barre}>
      {minuteurs.map((m) =>
        m.sonne ? (
          <Pressable key={m.id} style={[styles.puce, styles.puceSonne]} onPress={onAcquitter}>
            <Text style={styles.puceSonneTexte}>⏰ {m.nom} : terminé · OK</Text>
          </Pressable>
        ) : (
          <View key={m.id} style={styles.puce}>
            <Text style={styles.puceTexte}>
              ⏱ {m.nom} · <Text style={styles.puceTemps}>{formaterCompteARebours(m.finA - maintenant)}</Text>
            </Text>
            <Pressable onPress={() => onRetirer(m.id)} hitSlop={8} accessibilityLabel={`Annuler le minuteur ${m.nom}`}>
              <Text style={styles.puceFermer}>✕</Text>
            </Pressable>
          </View>
        )
      )}
    </View>
  );
}

const PRESELECTIONS = [1, 3, 5, 10, 15, 20, 30, 45, 60];

export function FenetreMinuteur({
  visible,
  nomParDefaut,
  onValider,
  onFermer,
}: {
  visible: boolean;
  nomParDefaut: string;
  onValider: (nom: string, dureeMs: number) => void;
  onFermer: () => void;
}) {
  const [minutes, setMinutes] = useState(10);
  const [nom, setNom] = useState('');

  useEffect(() => {
    if (visible) {
      setMinutes(10);
      setNom('');
    }
  }, [visible]);

  const changer = (delta: number) => setMinutes((m) => Math.min(24 * 60, Math.max(1, m + delta)));

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onFermer}>
      <ZoneClavier sansEnTete>
        <View style={styles.fond}>
          <View style={styles.carte}>
            <Text style={styles.titre}>Nouveau minuteur</Text>

            <View style={styles.reglage}>
              <Pressable style={styles.boutonPas} onPress={() => changer(-5)}>
                <Text style={styles.boutonPasTexte}>−5</Text>
              </Pressable>
              <Pressable style={styles.boutonPas} onPress={() => changer(-1)}>
                <Text style={styles.boutonPasTexte}>−1</Text>
              </Pressable>
              <Text style={styles.valeur}>{minutes} min</Text>
              <Pressable style={styles.boutonPas} onPress={() => changer(1)}>
                <Text style={styles.boutonPasTexte}>+1</Text>
              </Pressable>
              <Pressable style={styles.boutonPas} onPress={() => changer(5)}>
                <Text style={styles.boutonPasTexte}>+5</Text>
              </Pressable>
            </View>

            <View style={styles.preselections}>
              {PRESELECTIONS.map((p) => (
                <Pressable
                  key={p}
                  style={[styles.preselection, p === minutes && styles.preselectionActive]}
                  onPress={() => setMinutes(p)}
                >
                  <Text style={[styles.preselectionTexte, p === minutes && styles.preselectionTexteActive]}>
                    {p < 60 ? `${p} min` : '1 h'}
                  </Text>
                </Pressable>
              ))}
            </View>

            <TextInput
              style={styles.champ}
              placeholder={`Nom (facultatif) — ex. ${nomParDefaut}`}
              placeholderTextColor={theme.colors.textMuted}
              value={nom}
              onChangeText={setNom}
            />

            <View style={styles.actions}>
              <Pressable style={styles.boutonSecondaire} onPress={onFermer}>
                <Text style={styles.boutonSecondaireTexte}>Annuler</Text>
              </Pressable>
              <Pressable
                style={styles.boutonPrincipal}
                onPress={() => onValider(nom.trim() || nomParDefaut, minutes * 60 * 1000)}
              >
                <Text style={styles.boutonPrincipalTexte}>Lancer</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </ZoneClavier>
    </Modal>
  );
}

const styles = creerStylesThemes(() => ({
  barre: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: theme.spacing.xs,
    paddingHorizontal: theme.spacing.lg,
    marginBottom: theme.spacing.sm,
  },
  puce: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.accent,
    borderWidth: 1,
    borderRadius: theme.radii.lg,
    paddingVertical: 6,
    paddingHorizontal: theme.spacing.sm,
  },
  puceTexte: { fontFamily: theme.fontBody, color: theme.colors.text, fontSize: 15 },
  puceTemps: { fontFamily: theme.fontBodyBold, color: theme.colors.accent },
  puceFermer: { fontFamily: theme.fontBodyBold, color: theme.colors.textMuted, fontSize: 14 },
  puceSonne: { backgroundColor: theme.colors.warning, borderColor: theme.colors.warning },
  puceSonneTexte: { fontFamily: theme.fontBodyBold, color: theme.colors.background, fontSize: 15 },
  fond: {
    flex: 1,
    backgroundColor: theme.colors.voileFort,
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing.md,
  },
  carte: {
    backgroundColor: theme.colors.background,
    borderRadius: theme.radii.md,
    borderColor: theme.colors.border,
    borderWidth: 1,
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
    width: '100%',
    maxWidth: 420,
  },
  titre: { fontFamily: theme.fontTitle, fontSize: 20, color: theme.colors.accent, textAlign: 'center' },
  reglage: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: theme.spacing.xs },
  boutonPas: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radii.sm,
    minWidth: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boutonPasTexte: { fontFamily: theme.fontBodyBold, color: theme.colors.accent, fontSize: 15 },
  valeur: {
    fontFamily: theme.fontBodyBold,
    color: theme.colors.text,
    fontSize: 22,
    minWidth: 90,
    textAlign: 'center',
  },
  preselections: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: theme.spacing.xs },
  preselection: {
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radii.lg,
    paddingVertical: 4,
    paddingHorizontal: theme.spacing.sm,
  },
  preselectionActive: { backgroundColor: theme.colors.selection, borderColor: theme.colors.accent },
  preselectionTexte: { fontFamily: theme.fontBody, color: theme.colors.textMuted, fontSize: 13 },
  preselectionTexteActive: { color: theme.colors.accent, fontFamily: theme.fontBodyBold },
  champ: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radii.md,
    padding: theme.spacing.sm,
    color: theme.colors.text,
    fontFamily: theme.fontBody,
  },
  actions: { flexDirection: 'row', gap: theme.spacing.sm },
  boutonSecondaire: {
    flex: 1,
    borderColor: theme.colors.accent,
    borderWidth: 1,
    borderRadius: theme.radii.md,
    paddingVertical: theme.spacing.sm,
    alignItems: 'center',
  },
  boutonSecondaireTexte: { fontFamily: theme.fontBodyBold, color: theme.colors.accent },
  boutonPrincipal: {
    flex: 1,
    backgroundColor: theme.colors.accent,
    borderRadius: theme.radii.md,
    paddingVertical: theme.spacing.sm,
    alignItems: 'center',
  },
  boutonPrincipalTexte: { fontFamily: theme.fontBodyBold, color: theme.colors.background },
}));
