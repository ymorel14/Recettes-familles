import React, { useState } from 'react';
import { ActivityIndicator, Image, Platform, Pressable, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { theme, creerStylesThemes } from '../theme/theme';
import { alerte } from '../utils/alerte';
import { choisirPhoto, useAdressesPhotos, type EtatPhoto } from '../services/inventaires';

// Photos des inventaires (objet, lieu, contenant) : vignette dans les
// listes, grande photo dans les fiches, et champ photo des formulaires.

type IconeIonicons = keyof typeof Ionicons.glyphMap;

// Petite photo carrée (ou icône à la place).
export function Vignette({
  chemin,
  taille = 52,
  icone = 'cube-outline',
}: {
  chemin: string | null;
  taille?: number;
  icone?: IconeIonicons;
}) {
  const url = useAdressesPhotos([chemin]).get(chemin ?? '');
  return (
    <View style={[styles.vignette, { width: taille, height: taille }]}>
      {url ? (
        <Image source={{ uri: url }} style={{ width: taille, height: taille }} resizeMode="cover" accessibilityIgnoresInvertColors />
      ) : (
        <Ionicons name={icone} size={Math.round(taille * 0.45)} color={theme.colors.textMuted} />
      )}
    </View>
  );
}

// Grande photo d'une fiche (rien si pas de photo).
export function GrandePhoto({ chemin, legende }: { chemin: string | null; legende?: string }) {
  const url = useAdressesPhotos([chemin]).get(chemin ?? '');
  if (!chemin) return null;
  return (
    <View style={styles.grande} accessible accessibilityLabel={legende ? `Photo : ${legende}` : 'Photo'}>
      {url ? (
        <Image source={{ uri: url }} style={styles.grandeImage} resizeMode="contain" />
      ) : (
        <ActivityIndicator color={theme.colors.accent} />
      )}
    </View>
  );
}

// Champ photo d'un formulaire : rien n'est envoyé avant « Enregistrer »
// (voir avecPhoto dans services/inventaires).
export function ChampPhoto({
  valeur,
  onChange,
  libelle = 'Photo',
}: {
  valeur: EtatPhoto;
  onChange: (v: EtatPhoto) => void;
  libelle?: string;
}) {
  const [occupe, setOccupe] = useState(false);
  const enregistree = useAdressesPhotos([valeur.retiree ? null : valeur.chemin]).get(valeur.chemin ?? '');
  const affichee = valeur.nouvelle ?? (valeur.retiree ? undefined : enregistree);
  const aPhoto = !!valeur.nouvelle || (!!valeur.chemin && !valeur.retiree);

  const prendre = async (source: 'galerie' | 'camera') => {
    setOccupe(true);
    try {
      const uri = await choisirPhoto(source);
      if (uri) onChange({ ...valeur, nouvelle: uri, retiree: false });
    } catch (e) {
      alerte('Photo', e instanceof Error ? e.message : 'La photo n’a pas pu être choisie.');
    } finally {
      setOccupe(false);
    }
  };

  const lien = (titre: string, icone: IconeIonicons, onPress: () => void) => (
    <Pressable
      onPress={onPress}
      disabled={occupe}
      accessibilityRole="button"
      accessibilityLabel={titre}
      style={({ pressed }) => [styles.lien, (pressed || occupe) && { opacity: 0.6 }]}
    >
      <Ionicons name={icone} size={18} color={theme.colors.accent} />
      <Text style={styles.lienTexte}>{titre}</Text>
    </Pressable>
  );

  return (
    <View style={{ gap: theme.spacing.xs }}>
      <Text style={styles.libelle}>{libelle}</Text>
      {aPhoto && (
        <View style={styles.grande}>
          {affichee ? (
            <Image source={{ uri: affichee }} style={styles.grandeImage} resizeMode="contain" />
          ) : (
            <ActivityIndicator color={theme.colors.accent} />
          )}
        </View>
      )}
      <View style={styles.liens}>
        {occupe ? (
          <ActivityIndicator color={theme.colors.accent} />
        ) : (
          <>
            {Platform.OS !== 'web' && lien(aPhoto ? 'Reprendre' : 'Prendre une photo', 'camera-outline', () => prendre('camera'))}
            {lien(aPhoto ? 'Autre photo' : 'Choisir une photo', 'images-outline', () => prendre('galerie'))}
            {aPhoto &&
              lien('Retirer', 'trash-outline', () => onChange({ ...valeur, nouvelle: null, retiree: !!valeur.chemin }))}
          </>
        )}
      </View>
    </View>
  );
}

const styles = creerStylesThemes(() => ({
  vignette: {
    borderRadius: theme.radii.md,
    overflow: 'hidden',
    backgroundColor: theme.colors.selectionTransparent,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  grande: {
    width: '100%',
    height: 240,
    borderRadius: theme.radii.lg,
    overflow: 'hidden',
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  grandeImage: { width: '100%', height: '100%' },
  libelle: { fontFamily: theme.fontBodyBold, fontSize: 14, color: theme.colors.text, marginTop: theme.spacing.sm },
  liens: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.xs },
  lien: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 40,
    paddingHorizontal: 12,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    borderColor: theme.colors.accent,
  },
  lienTexte: { fontFamily: theme.fontBodyBold, fontSize: 14, color: theme.colors.accent },
}));
