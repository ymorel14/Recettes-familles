import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors, radii, spacing } from '@apps-famille/theme';
import { useAuth } from './AuthContext';
import { extraireMessageErreur } from './famille';
import { Avatar } from './Avatar';
import { changerVisibiliteDansFamille, listerVisibiliteEnfants, type EnfantVisibilite } from './visibilite';
import type { PolicesFamille } from './PassageConnexion';

// Section du Profil, la même dans toutes les apps : quand le foyer
// appartient à plusieurs familles (famille recomposée), choisir pour chaque
// enfant sans compte dans quelles familles il est visible. Masqué dans une
// famille, il n'apparaît plus à ses membres, dans aucune app ; le foyer le
// voit toujours. Rien ne s'affiche avec une seule famille.
// `version` : à changer quand la liste des enfants change (ajout, retrait).
// `style` : celui des sections du Profil de l'app (rien n'est affiché, même
// pas la section, quand il n'y a rien à régler).
export function VisibiliteEnfants({
  polices = {},
  version,
  style,
}: {
  polices?: PolicesFamille;
  version?: unknown;
  style?: StyleProp<ViewStyle>;
}) {
  const { foyer, familles } = useAuth();
  const [enfants, setEnfants] = useState<EnfantVisibilite[] | null>(null);
  const [occupe, setOccupe] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const plusieurs = familles.length > 1;

  const charger = useCallback(async () => {
    if (!foyer || !plusieurs) return;
    try {
      setEnfants(await listerVisibiliteEnfants(foyer.id));
    } catch (e) {
      setErreur(extraireMessageErreur(e, 'Chargement impossible.'));
    }
  }, [foyer?.id, plusieurs]);

  useEffect(() => {
    charger();
  }, [charger, version]);

  if (!plusieurs || !enfants || enfants.length === 0) return null;

  const nomFamille = (nom: string) => (/^famille\b/i.test(nom) ? nom : `Famille ${nom}`);

  const basculer = async (enfant: EnfantVisibilite, familleId: string) => {
    const visible = enfant.masqueeDans.has(familleId);
    const cle = `${enfant.personneId}-${familleId}`;
    setErreur(null);
    setOccupe(cle);
    try {
      await changerVisibiliteDansFamille(enfant.personneId, familleId, visible);
      await charger();
    } catch (e) {
      setErreur(extraireMessageErreur(e, 'Réglage impossible.'));
    } finally {
      setOccupe(null);
    }
  };

  return (
    <View style={[{ gap: spacing.sm }, style]}>
      <Text style={{ fontFamily: polices.titre, fontSize: 18, color: colors.text }}>Visibilité des enfants</Text>
      <Text style={{ fontFamily: polices.corps, fontSize: 13, color: colors.textMuted }}>
        Votre foyer fait partie de plusieurs familles. Pour chaque enfant, choisissez les familles qui le voient. Masqué
        dans une famille, il n’apparaît plus à ses membres, dans aucune app (listes de cadeaux, voyages, souvenirs…).
        Votre foyer le voit toujours.
      </Text>
      {enfants.map((enfant) => (
        <View
          key={enfant.personneId}
          style={{
            gap: spacing.xs,
            paddingVertical: spacing.xs,
            borderBottomWidth: 1,
            borderBottomColor: colors.border,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
            <Avatar personneId={enfant.personneId} prenom={enfant.prenom} taille={32} />
            <Text style={{ fontFamily: polices.gras, fontSize: 15, color: colors.text }}>{enfant.prenom}</Text>
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
            {familles.map((f) => {
              const visible = !enfant.masqueeDans.has(f.id);
              const cle = `${enfant.personneId}-${f.id}`;
              return (
                <Pressable
                  key={f.id}
                  onPress={() => basculer(enfant, f.id)}
                  disabled={!!occupe}
                  accessibilityRole="switch"
                  accessibilityState={{ checked: visible }}
                  accessibilityLabel={`${enfant.prenom} visible dans ${nomFamille(f.nom)}`}
                  style={({ pressed }) => ({
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 6,
                    minHeight: 40,
                    paddingHorizontal: spacing.sm,
                    borderRadius: radii.md,
                    borderWidth: 1,
                    borderColor: visible ? colors.accent : colors.border,
                    backgroundColor: visible ? colors.accentTransparent : 'transparent',
                    opacity: pressed ? 0.7 : 1,
                  })}
                >
                  {occupe === cle ? (
                    <ActivityIndicator color={colors.accent} />
                  ) : (
                    <Text style={{ fontFamily: polices.gras, fontSize: 14, color: visible ? colors.accent : colors.textMuted }}>
                      {visible ? '✓ ' : '✕ '}
                      {nomFamille(f.nom)}
                    </Text>
                  )}
                  <Text style={{ fontFamily: polices.corps, fontSize: 12, color: colors.textMuted }}>
                    {visible ? 'visible' : 'masqué'}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ))}
      {erreur && <Text style={{ fontFamily: polices.corps, fontSize: 14, color: colors.warning }}>{erreur}</Text>}
    </View>
  );
}
