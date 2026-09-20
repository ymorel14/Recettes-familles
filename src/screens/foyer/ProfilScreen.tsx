import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator, Share } from 'react-native';
import { supabase } from '../../services/supabase';
import { theme } from '../../theme/theme';
import { useAuth } from '../../contexts/AuthContext';
import type { Invitation } from '../../types/models';

// Écran "Profil" : nom du foyer, code d'invitation à partager, déconnexion.
export default function ProfilScreen() {
  const { session, foyer, deconnexion } = useAuth();
  const [invitation, setInvitation] = useState<Invitation | null>(null);
  const [chargement, setChargement] = useState(true);

  useEffect(() => {
    if (!foyer) return;
    supabase
      .from('invitations')
      .select('*')
      .eq('foyer_id', foyer.id)
      .order('creee_le', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        setInvitation(data ?? null);
        setChargement(false);
      });
  }, [foyer]);

  const partagerCode = async () => {
    if (!invitation) return;
    await Share.share({
      message: `Rejoins notre foyer "${foyer?.nom}" sur Recettes familiales avec le code : ${invitation.code}`,
    });
  };

  return (
    <View style={styles.container}>
      <Text style={styles.titre}>{foyer?.nom ?? 'Mon foyer'}</Text>
      <Text style={styles.email}>{session?.user.email}</Text>

      <View style={styles.section}>
        <Text style={styles.sectionTitre}>Code d'invitation</Text>
        {chargement ? (
          <ActivityIndicator color={theme.colors.accent} />
        ) : (
          <>
            <Text style={styles.code}>{invitation?.code ?? '—'}</Text>
            <Text style={styles.aide}>
              Partagez ce code avec les membres de votre famille pour qu'ils rejoignent le foyer.
            </Text>
            <Pressable style={styles.bouton} onPress={partagerCode} disabled={!invitation}>
              <Text style={styles.boutonTexte}>Partager le code</Text>
            </Pressable>
          </>
        )}
      </View>

      <Pressable style={styles.boutonSecondaire} onPress={deconnexion}>
        <Text style={styles.boutonSecondaireTexte}>Se déconnecter</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
    padding: theme.spacing.lg,
    gap: theme.spacing.lg,
  },
  titre: {
    fontFamily: theme.fontTitle,
    fontSize: 26,
    color: theme.colors.accent,
  },
  email: {
    fontFamily: theme.fontBody,
    color: theme.colors.textMuted,
  },
  section: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radii.md,
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  sectionTitre: {
    fontFamily: theme.fontBodyBold,
    fontSize: 16,
    color: theme.colors.text,
  },
  code: {
    fontFamily: theme.fontTitle,
    fontSize: 32,
    letterSpacing: 4,
    color: theme.colors.accent,
    textAlign: 'center',
  },
  aide: {
    fontFamily: theme.fontBody,
    fontSize: 13,
    color: theme.colors.textMuted,
  },
  bouton: {
    backgroundColor: theme.colors.accent,
    borderRadius: theme.radii.md,
    paddingVertical: theme.spacing.md,
    alignItems: 'center',
  },
  boutonTexte: {
    fontFamily: theme.fontBodyBold,
    fontSize: 16,
    color: theme.colors.background,
  },
  boutonSecondaire: {
    borderColor: theme.colors.warning,
    borderWidth: 1,
    borderRadius: theme.radii.md,
    paddingVertical: theme.spacing.md,
    alignItems: 'center',
  },
  boutonSecondaireTexte: {
    fontFamily: theme.fontBodyBold,
    fontSize: 16,
    color: theme.colors.warning,
  },
});
