import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, TextInput, ActivityIndicator } from 'react-native';
import { alerte } from '../../utils/alerte';
import { useFocusEffect } from '@react-navigation/native';
import { theme, creerStylesThemes } from '../../theme/theme';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../services/supabase';
import { listerNotesUtiles, supprimerNoteUtile, themesUtilises } from '../../services/notesUtiles';
import { normaliserTexte } from '../../utils/texte';
import type { NoteUtile } from '../../types/models';

// Écran "Aide-mémoire" : fiches pratiques transversales (températures à
// cœur des viandes, congélation, conversions...), indépendantes des
// recettes — voir supabase/setup.sql (table notes_utiles) et le service
// notesUtiles.ts. Recherche texte + filtre par thème, fiches repliées par
// défaut (on ouvre celle qu'on veut lire, comme le détail par recette dans
// la liste de courses).
export default function AideMemoireScreen({ navigation }: any) {
  const { foyer, session } = useAuth();
  const [notes, setNotes] = useState<NoteUtile[]>([]);
  const [chargement, setChargement] = useState(true);
  const [recherche, setRecherche] = useState('');
  const [themeChoisi, setThemeChoisi] = useState<string | null>(null);
  const [fichesDepliees, setFichesDepliees] = useState<Set<string>>(new Set());

  const charger = useCallback(async () => {
    if (!foyer) return;
    const chargees = await listerNotesUtiles(foyer.id);
    setNotes(chargees);
    setChargement(false);
  }, [foyer]);

  useFocusEffect(
    useCallback(() => {
      charger();
    }, [charger])
  );

  // Synchronisation temps réel entre appareils du foyer (§9), même principe
  // que les autres écrans partagés.
  useEffect(() => {
    if (!foyer) return;
    const canal = supabase
      .channel(`notes-utiles-foyer-${foyer.id}-${Math.random().toString(36).slice(2, 10)}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'recettes', table: 'notes_utiles', filter: `foyer_id=eq.${foyer.id}` },
        () => charger()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(canal);
    };
  }, [foyer, charger]);

  const themes = useMemo(() => themesUtilises(notes), [notes]);

  const notesFiltrees = useMemo(() => {
    const rechercheNormalisee = normaliserTexte(recherche.trim());
    return notes.filter((n) => {
      if (themeChoisi && n.theme !== themeChoisi) return false;
      if (!rechercheNormalisee) return true;
      return (
        normaliserTexte(n.titre).includes(rechercheNormalisee) ||
        normaliserTexte(n.contenu).includes(rechercheNormalisee)
      );
    });
  }, [notes, recherche, themeChoisi]);

  const basculerFiche = (id: string) => {
    setFichesDepliees((prev) => {
      const suivant = new Set(prev);
      if (suivant.has(id)) suivant.delete(id);
      else suivant.add(id);
      return suivant;
    });
  };

  const demanderSuppression = (note: NoteUtile) => {
    alerte('Supprimer cette fiche ?', `"${note.titre}" sera définitivement supprimée.`, [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: async () => {
          try {
            await supprimerNoteUtile(note.id);
            await charger();
          } catch (e) {
            alerte('Échec de la suppression', e instanceof Error ? e.message : 'Veuillez réessayer.');
          }
        },
      },
    ]);
  };

  if (chargement) {
    return (
      <View style={styles.centre}>
        <ActivityIndicator color={theme.colors.accent} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.enTete}>
        <Text style={styles.titre}>Aide-mémoire</Text>
        <Pressable style={styles.boutonAjouter} onPress={() => navigation.navigate('FormulaireNoteUtile')}>
          <Text style={styles.boutonAjouterTexte}>+ Nouvelle fiche</Text>
        </Pressable>
      </View>

      <TextInput
        style={styles.champRecherche}
        placeholder="Rechercher..."
        placeholderTextColor={theme.colors.textMuted}
        value={recherche}
        onChangeText={setRecherche}
      />

      {themes.length > 0 && (
        <FlatList
          horizontal
          data={themes}
          keyExtractor={(item) => item}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.themesListe}
          style={styles.themesZone}
          renderItem={({ item }) => {
            const actif = themeChoisi === item;
            return (
              <Pressable
                style={[styles.themePuce, actif && styles.themePuceActive]}
                onPress={() => setThemeChoisi(actif ? null : item)}
              >
                <Text style={[styles.themePuceTexte, actif && styles.themePuceTexteActif]}>{item}</Text>
              </Pressable>
            );
          }}
        />
      )}

      <FlatList
        data={notesFiltrees}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.liste}
        ListEmptyComponent={
          <Text style={styles.vide}>
            {notes.length === 0
              ? "Aucune fiche pour l'instant."
              : 'Aucune fiche ne correspond à cette recherche.'}
          </Text>
        }
        renderItem={({ item }) => {
          const depliee = fichesDepliees.has(item.id);
          const estCreateur = session?.user.id === item.cree_par;
          return (
            <Pressable style={styles.carte} onPress={() => basculerFiche(item.id)}>
              <View style={styles.carteEnTete}>
                <View style={styles.carteTextes}>
                  <Text style={styles.carteTitre}>{item.titre}</Text>
                  {item.theme.trim() !== '' && <Text style={styles.carteTheme}>{item.theme}</Text>}
                </View>
                <View style={styles.carteActions}>
                  <Pressable
                    hitSlop={8}
                    onPress={() => navigation.navigate('FormulaireNoteUtile', { noteId: item.id })}
                  >
                    <Text style={styles.carteActionTexte}>✎</Text>
                  </Pressable>
                  {estCreateur && (
                    <Pressable hitSlop={8} onPress={() => demanderSuppression(item)}>
                      <Text style={[styles.carteActionTexte, styles.carteActionSupprimer]}>✕</Text>
                    </Pressable>
                  )}
                </View>
              </View>
              {depliee && item.contenu.trim() !== '' && (
                <Text style={styles.carteContenu}>{item.contenu}</Text>
              )}
            </Pressable>
          );
        }}
      />
    </View>
  );
}

const styles = creerStylesThemes(() => ({
  container: { flex: 1, backgroundColor: theme.colors.background, padding: theme.spacing.md },
  centre: { flex: 1, backgroundColor: theme.colors.background, alignItems: 'center', justifyContent: 'center' },
  enTete: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.sm,
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
  },
  titre: { fontFamily: theme.fontTitle, fontSize: 26, color: theme.colors.accent },
  boutonAjouter: {
    backgroundColor: theme.colors.accent,
    borderRadius: theme.radii.md,
    paddingVertical: theme.spacing.xs,
    paddingHorizontal: theme.spacing.sm,
  },
  boutonAjouterTexte: { fontFamily: theme.fontBodyBold, color: theme.colors.background, fontSize: 13 },
  champRecherche: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radii.md,
    padding: theme.spacing.sm,
    color: theme.colors.text,
    fontFamily: theme.fontBody,
    marginBottom: theme.spacing.sm,
  },
  themesZone: { flexGrow: 0, marginBottom: theme.spacing.sm },
  themesListe: { gap: theme.spacing.xs },
  themePuce: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radii.lg,
    paddingVertical: 6,
    paddingHorizontal: theme.spacing.sm,
  },
  themePuceActive: { backgroundColor: theme.colors.selection, borderColor: theme.colors.accent },
  themePuceTexte: { fontFamily: theme.fontBody, color: theme.colors.textMuted, fontSize: 13 },
  themePuceTexteActif: { color: theme.colors.accent, fontFamily: theme.fontBodyBold },
  liste: { gap: theme.spacing.sm, paddingBottom: theme.spacing.xl },
  vide: { fontFamily: theme.fontBody, color: theme.colors.textMuted, textAlign: 'center', marginTop: theme.spacing.lg },
  carte: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radii.md,
    padding: theme.spacing.md,
    gap: theme.spacing.xs,
  },
  carteEnTete: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: theme.spacing.sm },
  carteTextes: { flex: 1, gap: 2 },
  carteTitre: { fontFamily: theme.fontBodyBold, color: theme.colors.text, fontSize: 16 },
  carteTheme: { fontFamily: theme.fontBody, color: theme.colors.accent, fontSize: 12 },
  carteActions: { flexDirection: 'row', gap: theme.spacing.sm },
  carteActionTexte: { color: theme.colors.textMuted, fontSize: 16, paddingHorizontal: 2 },
  carteActionSupprimer: { color: theme.colors.warning },
  carteContenu: {
    fontFamily: theme.fontBody,
    color: theme.colors.text,
    fontSize: 15,
    lineHeight: 21,
    marginTop: theme.spacing.xs,
  },
}));
