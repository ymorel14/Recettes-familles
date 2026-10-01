import React, { useState } from 'react';
import { View, Text, Pressable, TextInput } from 'react-native';
import { theme, creerStylesThemes } from '../theme/theme';
import { formaterDate, lireDateSaisie, versIso, aujourdhui } from '../services/congelateur';

// Réglage "Recette surprise" du formulaire de recette : la cacher (à tous
// sauf moi, ou au reste de la famille sauf mon foyer) et, si on veut, la
// révéler automatiquement à une date (le jour du repas). La surprise est
// garantie par la base (voir migration 20261001130000_recettes_surprise.sql).
export type ValeurSurprise = { cachee: 'moi' | 'foyer' | null; reveleeLe: string | null };

const PORTEES: { cle: 'moi' | 'foyer'; libelle: string; aide: string }[] = [
  { cle: 'moi', libelle: 'Visible de moi seul', aide: 'Cachée à tout le monde, y compris à mon foyer.' },
  { cle: 'foyer', libelle: 'Visible de mon foyer', aide: 'Cachée au reste de la famille.' },
];

export default function ReglageSurprise({
  valeur,
  onChange,
}: {
  valeur: ValeurSurprise;
  onChange: (v: ValeurSurprise) => void;
}) {
  const active = valeur.cachee !== null;
  const [saisieDate, setSaisieDate] = useState(valeur.reveleeLe ? formaterDate(valeur.reveleeLe) : '');

  const basculer = () => {
    if (active) {
      onChange({ cachee: null, reveleeLe: null });
      setSaisieDate('');
    } else {
      onChange({ cachee: 'moi', reveleeLe: null });
    }
  };

  const changerDate = (texte: string) => {
    setSaisieDate(texte);
    const iso = texte.trim() ? lireDateSaisie(texte) : null;
    onChange({ ...valeur, reveleeLe: iso });
  };

  const isoSaisi = saisieDate.trim() ? lireDateSaisie(saisieDate) : null;
  const dateInvalide = saisieDate.trim() !== '' && !isoSaisi;
  const datePassee = !!isoSaisi && isoSaisi <= versIso(aujourdhui());
  const aideActive = PORTEES.find((p) => p.cle === valeur.cachee)?.aide;

  return (
    <View style={styles.zone}>
      <Pressable style={styles.ligne} onPress={basculer} accessibilityRole="checkbox" accessibilityState={{ checked: active }}>
        <View style={[styles.case, active && styles.caseCochee]}>
          {active && <Text style={styles.coche}>✓</Text>}
        </View>
        <View style={styles.ligneTextes}>
          <Text style={styles.titre}>🤫 Recette surprise</Text>
          <Text style={styles.aide}>Pour un repas de famille : la recette reste cachée jusqu'au jour J.</Text>
        </View>
      </Pressable>

      {active && (
        <>
          <View style={styles.puces}>
            {PORTEES.map((p) => {
              const choisie = valeur.cachee === p.cle;
              return (
                <Pressable
                  key={p.cle}
                  style={[styles.puce, choisie && styles.puceActive]}
                  onPress={() => onChange({ ...valeur, cachee: p.cle })}
                >
                  <Text style={[styles.puceTexte, choisie && styles.puceTexteActive]}>{p.libelle}</Text>
                </Pressable>
              );
            })}
          </View>
          {aideActive && <Text style={styles.aide}>{aideActive}</Text>}

          <Text style={styles.label}>Révéler automatiquement le (facultatif)</Text>
          <TextInput
            style={[styles.champ, (dateInvalide || datePassee) && styles.champErreur]}
            placeholder="JJ/MM/AAAA — ex. le jour du repas"
            placeholderTextColor={theme.colors.textMuted}
            value={saisieDate}
            onChangeText={changerDate}
            keyboardType="numbers-and-punctuation"
          />
          <Text style={[styles.aide, (dateInvalide || datePassee) && { color: theme.colors.warning }]}>
            {dateInvalide
              ? 'Date non reconnue (ex. 25/12/2026).'
              : datePassee
                ? 'Cette date est déjà passée : la recette serait visible de tous tout de suite.'
                : isoSaisi
                  ? `Visible de toute la famille à partir du ${formaterDate(isoSaisi)}.`
                  : 'Sans date, elle reste cachée jusqu’à ce que vous touchiez « Révéler » sur la fiche.'}
          </Text>
        </>
      )}
    </View>
  );
}

const styles = creerStylesThemes(() => ({
  zone: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radii.md,
    padding: theme.spacing.md,
    gap: theme.spacing.xs,
    marginTop: theme.spacing.md,
  },
  ligne: { flexDirection: 'row', alignItems: 'flex-start', gap: theme.spacing.sm },
  ligneTextes: { flex: 1, gap: 2 },
  case: {
    width: 24,
    height: 24,
    borderRadius: theme.radii.sm,
    borderWidth: 1,
    borderColor: theme.colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  caseCochee: { backgroundColor: theme.colors.accent },
  coche: { color: theme.colors.background, fontSize: 15, fontFamily: theme.fontBodyBold },
  titre: { fontFamily: theme.fontBodyBold, color: theme.colors.text, fontSize: 16 },
  aide: { fontFamily: theme.fontBody, color: theme.colors.textMuted, fontSize: 13 },
  label: { fontFamily: theme.fontBodyBold, color: theme.colors.textMuted, fontSize: 13, marginTop: theme.spacing.sm },
  puces: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.xs, marginTop: theme.spacing.sm },
  puce: {
    backgroundColor: theme.colors.background,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radii.lg,
    paddingVertical: 6,
    paddingHorizontal: theme.spacing.sm,
  },
  puceActive: { backgroundColor: theme.colors.selection, borderColor: theme.colors.accent },
  puceTexte: { fontFamily: theme.fontBody, color: theme.colors.textMuted, fontSize: 14 },
  puceTexteActive: { color: theme.colors.accent, fontFamily: theme.fontBodyBold },
  champ: {
    backgroundColor: theme.colors.background,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radii.md,
    padding: theme.spacing.sm,
    color: theme.colors.text,
    fontFamily: theme.fontBody,
    fontSize: 16,
  },
  champErreur: { borderColor: theme.colors.warning },
}));
