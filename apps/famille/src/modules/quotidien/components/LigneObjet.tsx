import React from 'react';
import { Pressable, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { theme, creerStylesThemes } from '../theme/theme';
import { Pastille } from './ui';
import { Vignette } from './PhotoInventaire';
import { formaterDate } from '../services/personnes';
import { emplacement, pretEnRetard, type DonneesInventaires, type Objet } from '../services/inventaires';

// Un objet dans une liste : photo, nom, emplacement, et s'il est prêté.
export function LigneObjet({
  objet,
  donnees,
  onPress,
  avecInventaire = false,
}: {
  objet: Objet;
  donnees: DonneesInventaires;
  onPress: () => void;
  avecInventaire?: boolean;
}) {
  const prets = donnees.pretsEnCours.filter((p) => p.objet_id === objet.id);
  const inventaire = avecInventaire ? donnees.inventaires.find((i) => i.id === objet.inventaire_id)?.nom : undefined;
  const ou = emplacement(objet, donnees.lieux, donnees.contenants);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${objet.nom}, ${ou}${prets.length ? ', prêté' : ''}`}
      style={({ pressed }) => [styles.ligne, pressed && { opacity: 0.7 }]}
    >
      <Vignette chemin={objet.photo} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={styles.nom} numberOfLines={2}>
          {objet.nom}
          {objet.quantite !== 1 ? <Text style={styles.quantite}>{`  ×${objet.quantite}`}</Text> : null}
        </Text>
        <Text style={styles.detail} numberOfLines={1}>
          {inventaire ? `${inventaire} · ` : ''}
          {ou}
          {objet.range_depuis ? ` · depuis le ${formaterDate(objet.range_depuis)}` : ''}
        </Text>
        {prets.length > 0 && (
          <Pastille
            ton={prets.some(pretEnRetard) ? 'accent' : 'neutre'}
            texte={`${prets.some(pretEnRetard) ? 'En retard · ' : ''}Prêté à ${prets.map((p) => p.emprunteur).join(', ')}`}
          />
        )}
      </View>
      <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />
    </Pressable>
  );
}

const styles = creerStylesThemes(() => ({
  ligne: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    minHeight: 64,
  },
  nom: { fontFamily: theme.fontBodyBold, fontSize: 16, color: theme.colors.text },
  quantite: { fontFamily: theme.fontBody, fontSize: 14, color: theme.colors.textMuted },
  detail: { fontFamily: theme.fontBody, fontSize: 13, color: theme.colors.textMuted },
}));
