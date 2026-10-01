import React from 'react';
import { Pressable, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { theme, creerStylesThemes } from '../theme/theme';
import { Vignette } from './medias';
import { formaterDateSouvenir, type PrecisionDate } from '../utils/dates';
import type { Categorie } from '../services/souvenirs';

// Carte d'un souvenir dans le fil, la recherche ou « Ce jour-là » : photo de
// couverture, titre, date, catégorie, prénoms et une ligne de détail.
export default function CarteSouvenir({
  titre,
  categorie,
  dateDebut,
  dateFin,
  precision,
  lieu,
  prenoms,
  detail,
  adresseCouverture,
  nbMedias,
  onPress,
}: {
  titre: string;
  categorie: Categorie;
  dateDebut: string | null;
  dateFin: string | null;
  precision: PrecisionDate;
  lieu?: string | null;
  prenoms?: string | null;
  detail?: string | null;
  adresseCouverture?: string | null;
  nbMedias?: number;
  onPress: () => void;
}) {
  const date = formaterDateSouvenir(dateDebut, dateFin, precision);
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.carte, pressed && styles.appuye]}
      accessibilityRole="button"
      accessibilityLabel={`${titre}, ${date}`}
    >
      {adresseCouverture ? (
        <Vignette uri={adresseCouverture} style={styles.photo} libelle={titre} />
      ) : (
        <View style={[styles.photo, styles.sansPhoto]}>
          <Ionicons name={categorie.icone as any} size={30} color={theme.colors.accent} />
        </View>
      )}
      <View style={styles.textes}>
        <Text style={styles.titre} numberOfLines={2}>
          {titre}
        </Text>
        <View style={styles.ligne}>
          <Ionicons name={categorie.icone as any} size={14} color={theme.colors.textMuted} />
          <Text style={styles.date} numberOfLines={1}>
            {date}
            {lieu ? ` · ${lieu}` : ''}
          </Text>
        </View>
        {prenoms ? (
          <Text style={styles.prenoms} numberOfLines={1}>
            {prenoms}
          </Text>
        ) : null}
        {detail ? (
          <Text style={styles.detail} numberOfLines={2}>
            {detail}
          </Text>
        ) : null}
        {nbMedias ? (
          <Text style={styles.compteur}>
            {nbMedias} média{nbMedias > 1 ? 's' : ''}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = creerStylesThemes(() => ({
  carte: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    padding: theme.spacing.sm,
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radii.lg,
  },
  appuye: { opacity: 0.7 },
  photo: { width: 84, height: 84, borderRadius: theme.radii.md },
  sansPhoto: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.selectionTransparent,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  textes: { flex: 1, gap: 3, justifyContent: 'center' },
  titre: { fontFamily: theme.fontTitle, fontSize: 17, color: theme.colors.text },
  ligne: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  date: { flex: 1, fontFamily: theme.fontBodyBold, fontSize: 13, color: theme.colors.textMuted },
  prenoms: { fontFamily: theme.fontBody, fontSize: 13, color: theme.colors.accent },
  detail: { fontFamily: theme.fontBody, fontSize: 13, color: theme.colors.text, lineHeight: 18 },
  compteur: { fontFamily: theme.fontBody, fontSize: 12, color: theme.colors.textMuted },
}));
