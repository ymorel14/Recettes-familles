import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { theme, creerStylesThemes } from '../theme/theme';
import { useAuth } from '../contexts/AuthContext';
import { Bouton, Chargement } from '../components/ui';
import { alerte } from '../utils/alerte';
import {
  ENDROITS,
  ajouterAVerifier,
  listerChecklist,
  modifierAVerifier,
  supprimerAVerifier,
  type AVerifier,
} from '../services/courses';

// Checklist du foyer : les articles à contrôler à la maison avant chaque
// course, une seule pour toutes les listes du foyer, rangés par endroit
// (frigo, placards…) pour faire le tour une seule fois.
export default function ChecklistScreen() {
  const { foyer } = useAuth();
  const [articles, setArticles] = useState<AVerifier[] | null>(null);
  const [libelle, setLibelle] = useState('');
  const [endroit, setEndroit] = useState<string>('Frigo');
  const [deplace, setDeplace] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const charger = useCallback(async () => {
    if (!foyer) return;
    try {
      setArticles(await listerChecklist(foyer.id));
    } catch {
      setMessage('Chargement impossible. Vérifiez votre connexion.');
      setArticles((a) => a ?? []);
    }
  }, [foyer]);

  useFocusEffect(
    useCallback(() => {
      charger();
    }, [charger])
  );

  const parEndroit = useMemo(() => {
    const groupes = new Map<string, AVerifier[]>();
    (articles ?? []).forEach((a) => groupes.set(a.endroit, [...(groupes.get(a.endroit) ?? []), a]));
    const ordre = [...ENDROITS] as string[];
    return Array.from(groupes.entries()).sort(
      ([a], [b]) => (ordre.indexOf(a) === -1 ? 99 : ordre.indexOf(a)) - (ordre.indexOf(b) === -1 ? 99 : ordre.indexOf(b))
    );
  }, [articles]);

  const ajouter = async () => {
    if (!foyer || !libelle.trim()) return;
    setEnCours(true);
    setMessage(null);
    try {
      await ajouterAVerifier(foyer.id, libelle, endroit);
      setLibelle('');
      await charger();
    } catch {
      setMessage('Ajout impossible.');
    } finally {
      setEnCours(false);
    }
  };

  const changerEndroit = async (a: AVerifier, nouvel: string) => {
    setDeplace(null);
    setArticles((liste) => (liste ?? []).map((x) => (x.id === a.id ? { ...x, endroit: nouvel } : x)));
    await modifierAVerifier(a.id, { endroit: nouvel }).catch(() => setMessage('Modification non enregistrée.'));
  };

  const retirer = (a: AVerifier) =>
    alerte(`Retirer « ${a.libelle} » de la checklist ?`, undefined, [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Retirer',
        style: 'destructive',
        onPress: async () => {
          setArticles((liste) => (liste ?? []).filter((x) => x.id !== a.id));
          await supprimerAVerifier(a.id).catch(() => setMessage('Suppression impossible.'));
        },
      },
    ]);

  if (articles === null) return <Chargement />;

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.contenu} keyboardShouldPersistTaps="handled">
      <Text style={styles.intro}>
        Avant chaque course, « Préparer les courses » vous fait passer cette liste article par article : ce qui
        manque s’ajoute à la liste de courses. Une seule checklist pour tout le foyer {foyer?.nom ?? ''}.
      </Text>

      <View style={styles.section}>
        <Text style={styles.titreSection}>Ajouter un article à vérifier</Text>
        <TextInput
          style={styles.champ}
          value={libelle}
          onChangeText={setLibelle}
          onSubmitEditing={ajouter}
          placeholder="Lait, papier toilette, croquettes…"
          placeholderTextColor={theme.colors.textMuted}
          accessibilityLabel="Article à vérifier"
        />
        <View style={styles.puces}>
          {ENDROITS.map((e) => (
            <Pressable
              key={e}
              onPress={() => setEndroit(e)}
              style={[styles.puce, e === endroit && styles.puceActive]}
              accessibilityRole="radio"
              accessibilityState={{ selected: e === endroit }}
            >
              <Text style={[styles.puceTexte, e === endroit && styles.puceTexteActive]}>{e}</Text>
            </Pressable>
          ))}
        </View>
        <Bouton titre="Ajouter" onPress={ajouter} enCours={enCours} desactive={!libelle.trim()} />
      </View>

      {message && <Text style={styles.erreur}>{message}</Text>}

      {articles.length === 0 && (
        <Text style={styles.aide}>
          La checklist est vide. Ajoutez les produits qu’il faut toujours vérifier : lait, œufs, beurre, papier
          toilette, liquide vaisselle…
        </Text>
      )}

      {parEndroit.map(([nom, liste]) => (
        <View key={nom} style={styles.section}>
          <Text style={styles.endroit}>{nom}</Text>
          {liste.map((a) => (
            <View key={a.id}>
              <View style={styles.ligne}>
                <Text style={styles.libelle}>{a.libelle}</Text>
                <Pressable
                  onPress={() => setDeplace(deplace === a.id ? null : a.id)}
                  hitSlop={8}
                  style={styles.icone}
                  accessibilityRole="button"
                  accessibilityLabel={`Changer l’endroit de ${a.libelle}`}
                >
                  <Ionicons name="swap-horizontal-outline" size={20} color={theme.colors.accent} />
                </Pressable>
                <Pressable
                  onPress={() => retirer(a)}
                  hitSlop={8}
                  style={styles.icone}
                  accessibilityRole="button"
                  accessibilityLabel={`Retirer ${a.libelle}`}
                >
                  <Ionicons name="trash-outline" size={20} color={theme.colors.textMuted} />
                </Pressable>
              </View>
              {deplace === a.id && (
                <View style={[styles.puces, styles.deplacement]}>
                  {ENDROITS.filter((e) => e !== a.endroit).map((e) => (
                    <Pressable key={e} onPress={() => changerEndroit(a, e)} style={styles.puce} accessibilityRole="button">
                      <Text style={styles.puceTexte}>{e}</Text>
                    </Pressable>
                  ))}
                </View>
              )}
            </View>
          ))}
        </View>
      ))}
    </ScrollView>
  );
}

const styles = creerStylesThemes(() => ({
  flex: { flex: 1, backgroundColor: theme.colors.background },
  contenu: { padding: theme.spacing.md, gap: theme.spacing.md, paddingBottom: theme.spacing.xl },
  intro: { fontFamily: theme.fontBody, fontSize: 15, color: theme.colors.text, lineHeight: 21 },
  section: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radii.lg,
    padding: theme.spacing.md,
    gap: theme.spacing.xs,
  },
  titreSection: { fontFamily: theme.fontBodyBold, fontSize: 16, color: theme.colors.text },
  endroit: { fontFamily: theme.fontBodyBold, fontSize: 14, color: theme.colors.accent, textTransform: 'uppercase', letterSpacing: 0.5 },
  champ: {
    minHeight: 44,
    backgroundColor: theme.colors.background,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radii.md,
    paddingHorizontal: theme.spacing.sm,
    color: theme.colors.text,
    fontFamily: theme.fontBody,
    fontSize: 16,
  },
  puces: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  deplacement: { paddingBottom: theme.spacing.sm },
  puce: {
    minHeight: 34,
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.sm,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.background,
  },
  puceActive: { backgroundColor: theme.colors.accent, borderColor: theme.colors.accent },
  puceTexte: { fontFamily: theme.fontBody, fontSize: 14, color: theme.colors.text },
  puceTexteActive: { color: theme.colors.background, fontFamily: theme.fontBodyBold },
  ligne: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, minHeight: 44 },
  libelle: { flex: 1, fontFamily: theme.fontBody, fontSize: 16, color: theme.colors.text },
  icone: { minWidth: 40, minHeight: 40, alignItems: 'center', justifyContent: 'center' },
  aide: { fontFamily: theme.fontBody, fontSize: 14, color: theme.colors.textMuted },
  erreur: { fontFamily: theme.fontBody, fontSize: 14, color: theme.colors.warning },
}));
