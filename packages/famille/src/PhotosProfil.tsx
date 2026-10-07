import React, { useState } from 'react';
import { ActivityIndicator, Platform, Pressable, Text, View } from 'react-native';
import { colors, radii, spacing } from '@apps-famille/theme';
import { useAuth } from './AuthContext';
import { Avatar } from './Avatar';
import {
  choisirPhotoProfil,
  envoyerPhotoProfil,
  fichePhoto,
  gereLesPhotos,
  peutChangerPhoto,
  retirerPhotoProfil,
  toutesLesFiches,
  usePhotosFamille,
  type FichePhoto,
} from './photos';
import type { PolicesFamille } from './PassageConnexion';

// Section du Profil, la même dans toutes les apps : « Ma photo » (choisir,
// prendre, retirer) puis, s'il y en a, les photos que l'on peut poser pour
// d'autres — personnes sans compte de son foyer, ou toute la famille pour un
// gestionnaire des photos (voir la migration 20261003130000_photos_profil).
export function PhotosProfil({ polices = {} }: { polices?: PolicesFamille }) {
  usePhotosFamille();
  const { session, foyer, foyersFamille } = useAuth();
  const moi = session?.user.id ?? null;
  const [occupe, setOccupe] = useState<string | null>(null);
  const [message, setMessage] = useState<{ texte: string; erreur: boolean } | null>(null);

  const maFiche = moi ? fichePhoto({ utilisateurId: moi }) : undefined;
  const foyersActifs = new Set([...(foyersFamille ?? []), ...(foyer ? [foyer.id] : [])]);
  const autres = toutesLesFiches()
    .filter((f) => f.utilisateurId !== moi && f.foyerId && foyersActifs.has(f.foyerId))
    .filter((f) => peutChangerPhoto(f, moi, foyer?.id))
    .sort(
      (a, b) =>
        Number(b.foyerId === foyer?.id) - Number(a.foyerId === foyer?.id) ||
        (a.foyerNom ?? '').localeCompare(b.foyerNom ?? '', 'fr') ||
        a.prenom.localeCompare(b.prenom, 'fr')
    );

  const changer = async (fiche: FichePhoto, source: 'galerie' | 'camera') => {
    setMessage(null);
    try {
      const uri = await choisirPhotoProfil(source);
      if (!uri) return;
      setOccupe(fiche.personneId);
      await envoyerPhotoProfil(fiche.personneId, uri);
      setMessage({ texte: 'Photo enregistrée.', erreur: false });
    } catch (e) {
      setMessage({ texte: e instanceof Error ? e.message : 'La photo n’a pas pu être enregistrée.', erreur: true });
    } finally {
      setOccupe(null);
    }
  };

  const retirer = async (fiche: FichePhoto) => {
    setMessage(null);
    setOccupe(fiche.personneId);
    try {
      await retirerPhotoProfil(fiche.personneId);
    } catch (e) {
      setMessage({ texte: e instanceof Error ? e.message : 'La photo n’a pas pu être retirée.', erreur: true });
    } finally {
      setOccupe(null);
    }
  };

  const lien = (titre: string, onPress: () => void, desactive = false) => (
    <Pressable
      onPress={onPress}
      disabled={desactive}
      accessibilityRole="button"
      hitSlop={6}
      style={({ pressed }) => ({
        minHeight: 36,
        justifyContent: 'center',
        paddingHorizontal: spacing.sm,
        borderRadius: radii.md,
        borderWidth: 1,
        borderColor: colors.accent,
        opacity: desactive ? 0.5 : pressed ? 0.7 : 1,
      })}
    >
      <Text style={{ fontFamily: polices.gras, fontSize: 14, color: colors.accent }}>{titre}</Text>
    </Pressable>
  );

  if (!maFiche) return null;

  return (
    <View style={{ gap: spacing.sm }}>
      <Text style={{ fontFamily: polices.titre, fontSize: 18, color: colors.text }}>Ma photo</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <Avatar personneId={maFiche.personneId} prenom={maFiche.prenom} taille={72} />
        <View style={{ flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
          {occupe === maFiche.personneId ? (
            <ActivityIndicator color={colors.accent} />
          ) : (
            <>
              {lien(maFiche.url ? 'Changer' : 'Choisir une photo', () => changer(maFiche, 'galerie'), !!occupe)}
              {Platform.OS !== 'web' && lien('Prendre une photo', () => changer(maFiche, 'camera'), !!occupe)}
              {maFiche.url && lien('Retirer', () => retirer(maFiche), !!occupe)}
            </>
          )}
        </View>
      </View>
      <Text style={{ fontFamily: polices.corps, fontSize: 13, color: colors.textMuted }}>
        Elle apparaît en petit à côté de votre prénom, dans toutes les apps de la famille.
      </Text>
      {message && (
        <Text
          style={{ fontFamily: polices.corps, fontSize: 14, color: message.erreur ? colors.warning : colors.textMuted }}
        >
          {message.texte}
        </Text>
      )}

      {autres.length > 0 && (
        <>
          <Text style={{ fontFamily: polices.titre, fontSize: 18, color: colors.text, marginTop: spacing.md }}>
            Photos de la famille
          </Text>
          <Text style={{ fontFamily: polices.corps, fontSize: 13, color: colors.textMuted }}>
            {gereLesPhotos()
              ? 'Vous pouvez poser la photo de chacun ; chacun pourra ensuite changer la sienne.'
              : 'Les personnes sans compte de votre foyer.'}
          </Text>
          {autres.map((f) => (
            <View
              key={f.personneId}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: spacing.sm,
                paddingVertical: spacing.xs,
                borderBottomWidth: 1,
                borderBottomColor: colors.border,
              }}
            >
              <Avatar personneId={f.personneId} prenom={f.prenom} taille={40} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: polices.gras, fontSize: 15, color: colors.text }}>
                  {f.prenom || 'Sans prénom'}
                </Text>
                {f.foyerNom && f.foyerId !== foyer?.id && (
                  <Text style={{ fontFamily: polices.corps, fontSize: 12, color: colors.textMuted }}>{f.foyerNom}</Text>
                )}
              </View>
              {occupe === f.personneId ? (
                <ActivityIndicator color={colors.accent} />
              ) : (
                <View style={{ flexDirection: 'row', gap: spacing.xs }}>
                  {lien(f.url ? 'Changer' : 'Ajouter', () => changer(f, 'galerie'), !!occupe)}
                  {f.url && lien('Retirer', () => retirer(f), !!occupe)}
                </View>
              )}
            </View>
          ))}
        </>
      )}

    </View>
  );
}
