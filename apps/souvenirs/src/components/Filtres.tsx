import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { theme, creerStylesThemes } from '../theme/theme';
import { useFamilleDonnees } from '../contexts/FamilleDonneesContext';
import type { CarteSouvenir } from '../services/souvenirs';

export type FiltresActifs = { categorie: string | null; personne: string | null };

export const AUCUN_FILTRE: FiltresActifs = { categorie: null, personne: null };

export function appliquerFiltres(souvenirs: CarteSouvenir[], f: FiltresActifs): CarteSouvenir[] {
  return souvenirs.filter(
    (s) =>
      (!f.categorie || s.categorie === f.categorie) &&
      (!f.personne || s.personnes.some((p) => p.personne_id === f.personne))
  );
}

// Bouton « Filtrer » qui déplie les catégories et les personnes présentes
// dans les souvenirs ; replié, il rappelle les filtres actifs.
export default function Filtres({
  souvenirs,
  valeur,
  onChange,
}: {
  souvenirs: CarteSouvenir[];
  valeur: FiltresActifs;
  onChange: (f: FiltresActifs) => void;
}) {
  const { categories, personnes, categorie, personne } = useFamilleDonnees();
  const [ouvert, setOuvert] = useState(false);

  const categoriesUtilisees = useMemo(() => {
    const codes = new Set(souvenirs.map((s) => s.categorie));
    return categories.filter((c) => codes.has(c.code));
  }, [souvenirs, categories]);
  const personnesUtilisees = useMemo(() => {
    const ids = new Set(souvenirs.flatMap((s) => s.personnes.map((p) => p.personne_id)));
    return personnes.filter((p) => ids.has(p.id));
  }, [souvenirs, personnes]);

  if (categoriesUtilisees.length < 2 && personnesUtilisees.length < 2 && !valeur.categorie && !valeur.personne) {
    return null;
  }

  const actifs = [
    valeur.categorie ? categorie(valeur.categorie).libelle : null,
    valeur.personne ? personne(valeur.personne)?.prenom : null,
  ].filter(Boolean) as string[];

  return (
    <View style={styles.bloc}>
      <View style={styles.ligne}>
        <Pressable
          onPress={() => setOuvert((o) => !o)}
          style={[styles.bouton, actifs.length > 0 && styles.boutonActif]}
          accessibilityRole="button"
          accessibilityState={{ expanded: ouvert }}
        >
          <Ionicons name="options-outline" size={16} color={actifs.length ? theme.colors.background : theme.colors.accent} />
          <Text style={[styles.boutonTexte, actifs.length > 0 && styles.boutonTexteActif]}>
            {actifs.length ? actifs.join(' · ') : 'Filtrer'}
          </Text>
        </Pressable>
        {actifs.length > 0 && (
          <Pressable onPress={() => onChange(AUCUN_FILTRE)} hitSlop={8} accessibilityRole="button" accessibilityLabel="Retirer les filtres">
            <Text style={styles.effacer}>Tout afficher</Text>
          </Pressable>
        )}
      </View>
      {ouvert && (
        <>
          {categoriesUtilisees.length > 1 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.puces}>
              {categoriesUtilisees.map((c) => (
                <Puce
                  key={c.code}
                  libelle={c.libelle}
                  icone={c.icone}
                  actif={valeur.categorie === c.code}
                  onPress={() => onChange({ ...valeur, categorie: valeur.categorie === c.code ? null : c.code })}
                />
              ))}
            </ScrollView>
          )}
          {personnesUtilisees.length > 1 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.puces}>
              {personnesUtilisees.map((p) => (
                <Puce
                  key={p.id}
                  libelle={p.prenom}
                  icone="person-outline"
                  actif={valeur.personne === p.id}
                  onPress={() => onChange({ ...valeur, personne: valeur.personne === p.id ? null : p.id })}
                />
              ))}
            </ScrollView>
          )}
        </>
      )}
    </View>
  );
}

function Puce({ libelle, icone, actif, onPress }: { libelle: string; icone: string; actif: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.puce, actif && styles.puceActive]}
      accessibilityRole="button"
      accessibilityState={{ selected: actif }}
    >
      <Ionicons name={icone as any} size={14} color={actif ? theme.colors.background : theme.colors.textMuted} />
      <Text style={[styles.puceTexte, actif && styles.puceTexteActive]}>{libelle}</Text>
    </Pressable>
  );
}

const styles = creerStylesThemes(() => ({
  bloc: { gap: theme.spacing.xs },
  ligne: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md },
  bouton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 36,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.colors.accent,
    alignSelf: 'flex-start',
  },
  boutonActif: { backgroundColor: theme.colors.accent },
  boutonTexte: { fontFamily: theme.fontBodyBold, fontSize: 14, color: theme.colors.accent },
  boutonTexteActif: { color: theme.colors.background },
  effacer: { fontFamily: theme.fontBody, fontSize: 13, color: theme.colors.textMuted, textDecorationLine: 'underline' },
  puces: { gap: theme.spacing.xs, paddingVertical: 2 },
  puce: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minHeight: 34,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  puceActive: { backgroundColor: theme.colors.accent, borderColor: theme.colors.accent },
  puceTexte: { fontFamily: theme.fontBody, fontSize: 14, color: theme.colors.text },
  puceTexteActive: { fontFamily: theme.fontBodyBold, color: theme.colors.background },
}));
