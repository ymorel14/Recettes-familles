import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TextInput, Pressable, ScrollView, ActivityIndicator, FlatList } from 'react-native';
import { alerte } from '../../utils/alerte';
import { theme, creerStylesThemes } from '../../theme/theme';
import { useAuth } from '../../contexts/AuthContext';
import {
  obtenirNoteUtile,
  creerNoteUtile,
  mettreAJourNoteUtile,
  listerNotesUtiles,
  themesUtilises,
} from '../../services/notesUtiles';
import ZoneClavier from '../../components/ZoneClavier';

// Formulaire de création/modification d'une fiche "Aide-mémoire" (voir
// AideMemoireScreen). Le champ "Thème" est un simple texte libre — pas de
// liste fermée à configurer à l'avance (retour utilisateur) — mais on
// propose en dessous les thèmes déjà utilisés dans le foyer, en un seul
// geste (toucher une suggestion la recopie dans le champ).
export default function NoteUtileFormScreen({ route, navigation }: any) {
  const noteId: string | undefined = route.params?.noteId;
  const { foyer, session } = useAuth();
  const [titre, setTitre] = useState('');
  const [themeSaisi, setThemeSaisi] = useState('');
  const [contenu, setContenu] = useState('');
  const [themesSuggeres, setThemesSuggeres] = useState<string[]>([]);
  const [chargement, setChargement] = useState(!!noteId);
  const [enregistrement, setEnregistrement] = useState(false);

  useEffect(() => {
    if (!foyer) return;
    listerNotesUtiles(foyer.id).then((notes) => setThemesSuggeres(themesUtilises(notes)));
  }, [foyer]);

  useEffect(() => {
    if (!noteId) return;
    obtenirNoteUtile(noteId).then((note) => {
      setTitre(note.titre);
      setThemeSaisi(note.theme);
      setContenu(note.contenu);
      setChargement(false);
    });
  }, [noteId]);

  useEffect(() => {
    navigation.setOptions?.({ title: noteId ? 'Modifier la fiche' : 'Nouvelle fiche' });
  }, [navigation, noteId]);

  const suggestionsAffichees = useMemo(
    () => themesSuggeres.filter((t) => t.toLowerCase() !== themeSaisi.trim().toLowerCase()),
    [themesSuggeres, themeSaisi]
  );

  const enregistrer = async () => {
    if (!titre.trim()) {
      alerte('Titre manquant', 'Donnez un titre à cette fiche.');
      return;
    }
    if (!foyer || !session) return;
    setEnregistrement(true);
    try {
      const form = { titre, theme: themeSaisi, contenu };
      if (noteId) {
        await mettreAJourNoteUtile(noteId, form);
      } else {
        await creerNoteUtile(foyer.id, session.user.id, form);
      }
      navigation.goBack();
    } catch (e) {
      alerte('Échec de l\'enregistrement', e instanceof Error ? e.message : 'Veuillez réessayer.');
    } finally {
      setEnregistrement(false);
    }
  };

  if (chargement) {
    return (
      <View style={styles.centre}>
        <ActivityIndicator color={theme.colors.accent} />
      </View>
    );
  }

  return (
    <ZoneClavier>
    <ScrollView style={styles.container} contentContainerStyle={styles.contenuScroll} keyboardShouldPersistTaps="handled">
      <Text style={styles.label}>Titre</Text>
      <TextInput
        style={styles.champ}
        placeholder="Ex. Températures à cœur des viandes"
        placeholderTextColor={theme.colors.textMuted}
        value={titre}
        onChangeText={setTitre}
      />

      <Text style={styles.label}>Thème</Text>
      <TextInput
        style={styles.champ}
        placeholder="Ex. Viandes & cuissons"
        placeholderTextColor={theme.colors.textMuted}
        value={themeSaisi}
        onChangeText={setThemeSaisi}
      />
      {suggestionsAffichees.length > 0 && (
        <FlatList
          horizontal
          data={suggestionsAffichees}
          keyExtractor={(item) => item}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.suggestionsListe}
          style={styles.suggestionsZone}
          renderItem={({ item }) => (
            <Pressable style={styles.suggestionPuce} onPress={() => setThemeSaisi(item)}>
              <Text style={styles.suggestionPuceTexte}>{item}</Text>
            </Pressable>
          )}
        />
      )}

      <Text style={styles.label}>Contenu</Text>
      <TextInput
        style={[styles.champ, styles.champContenu]}
        placeholder="Notes libres : températures, temps, conversions..."
        placeholderTextColor={theme.colors.textMuted}
        value={contenu}
        onChangeText={setContenu}
        multiline
        textAlignVertical="top"
      />

      <Pressable style={styles.boutonEnregistrer} onPress={enregistrer} disabled={enregistrement}>
        {enregistrement ? (
          <ActivityIndicator color={theme.colors.background} />
        ) : (
          <Text style={styles.boutonEnregistrerTexte}>Enregistrer</Text>
        )}
      </Pressable>
    </ScrollView>
    </ZoneClavier>
  );
}

const styles = creerStylesThemes(() => ({
  container: { flex: 1, backgroundColor: theme.colors.background },
  centre: { flex: 1, backgroundColor: theme.colors.background, alignItems: 'center', justifyContent: 'center' },
  contenuScroll: { padding: theme.spacing.md, gap: theme.spacing.xs },
  label: { fontFamily: theme.fontBodyBold, color: theme.colors.textMuted, fontSize: 13, marginTop: theme.spacing.sm },
  champ: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radii.md,
    padding: theme.spacing.sm,
    color: theme.colors.text,
    fontFamily: theme.fontBody,
    fontSize: 16,
  },
  champContenu: { minHeight: 220 },
  suggestionsZone: { flexGrow: 0, marginTop: theme.spacing.xs },
  suggestionsListe: { gap: theme.spacing.xs },
  suggestionPuce: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radii.lg,
    paddingVertical: 6,
    paddingHorizontal: theme.spacing.sm,
  },
  suggestionPuceTexte: { fontFamily: theme.fontBody, color: theme.colors.textMuted, fontSize: 13 },
  boutonEnregistrer: {
    backgroundColor: theme.colors.accent,
    borderRadius: theme.radii.md,
    paddingVertical: theme.spacing.sm,
    alignItems: 'center',
    marginTop: theme.spacing.lg,
    marginBottom: theme.spacing.xl,
  },
  boutonEnregistrerTexte: { fontFamily: theme.fontBodyBold, color: theme.colors.background, fontSize: 16 },
}));
