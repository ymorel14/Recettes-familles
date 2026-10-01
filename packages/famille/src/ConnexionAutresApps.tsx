import React, { useState } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors, radii, spacing } from '@apps-famille/theme';
import { APPS_FAMILLE, obtenirAppCourante } from './appsFamille';
import { demanderConnexion } from './connexionPartagee';
import type { PolicesFamille } from './PassageConnexion';

// Sur l'écran de connexion (téléphone uniquement) : « Déjà connecté dans une
// autre app de la famille ? » et un bouton par app. Le bouton ouvre l'app
// choisie, qui demande l'accord puis renvoie ici, connecté (voir
// PassageConnexion). Sur le web, inutile : le site commun partage déjà la
// connexion entre les apps.
export function ConnexionAutresApps({ polices = {} }: { polices?: PolicesFamille }) {
  const [message, setMessage] = useState<string | null>(null);
  const moi = obtenirAppCourante();
  if (Platform.OS === 'web' || !moi) return null;
  const autres = APPS_FAMILLE.filter((a) => a.id !== moi.id);

  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderColor: colors.border,
        borderWidth: 1,
        borderRadius: radii.lg,
        padding: spacing.md,
        gap: spacing.sm,
      }}
    >
      <Text style={{ fontFamily: polices.titre, fontSize: 18, color: colors.text }}>Déjà connecté ailleurs ?</Text>
      <Text style={{ fontFamily: polices.corps, fontSize: 14, color: colors.textMuted }}>
        Si une autre app de la famille est connectée sur ce téléphone, continuez avec le même compte, sans mot de
        passe.
      </Text>
      {autres.map((app) => (
        <Pressable
          key={app.id}
          onPress={async () => {
            setMessage(null);
            const ouverte = await demanderConnexion(app).catch(() => false);
            if (!ouverte) setMessage(`${app.nom} n’est pas installée sur ce téléphone.`);
          }}
          accessibilityRole="button"
          accessibilityLabel={`Continuer avec mon compte ${app.nom}`}
          style={({ pressed }) => ({
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.sm,
            minHeight: 48,
            paddingHorizontal: spacing.sm,
            borderRadius: radii.md,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.background,
            opacity: pressed ? 0.8 : 1,
          })}
        >
          <Ionicons name={app.icone as any} size={20} color={colors.accent} />
          <Text style={{ flex: 1, fontFamily: polices.gras, fontSize: 15, color: colors.text }}>
            Continuer avec {app.nom}
          </Text>
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </Pressable>
      ))}
      {message && <Text style={{ fontFamily: polices.corps, fontSize: 14, color: colors.warning }}>{message}</Text>}
    </View>
  );
}
