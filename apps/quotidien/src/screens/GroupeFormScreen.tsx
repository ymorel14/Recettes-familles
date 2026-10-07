import React, { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { theme, creerStylesThemes } from '../theme/theme';
import { Bouton } from '../components/ui';
import { extraireMessageErreur } from '@apps-famille/famille';
import { creerGroupe, rejoindreGroupe, ZONES_VACANCES, type ZoneVacances } from '../services/quotidien';

// Rejoindre un groupe avec le code reçu d'un autre parent, ou créer le
// groupe d'une équipe, d'un club, d'une classe.
export default function GroupeFormScreen({ navigation }: any) {
  const [code, setCode] = useState('');
  const [nom, setNom] = useState('');
  const [zone, setZone] = useState<ZoneVacances | null>(null);
  const [enCours, setEnCours] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  const executer = async (cle: string, action: () => Promise<string>) => {
    setErreur(null);
    setEnCours(cle);
    try {
      const id = await action();
      navigation.replace('Groupe', { id });
    } catch (e) {
      const brut = extraireMessageErreur(e, 'Action impossible.');
      setErreur(brut);
    } finally {
      setEnCours(null);
    }
  };

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.contenu} keyboardShouldPersistTaps="handled">
      <View style={styles.carte}>
        <Text style={styles.carteTitre}>J'ai un code de groupe</Text>
        <Text style={styles.aide}>Le code à 6 caractères envoyé par un autre parent.</Text>
        <TextInput
          style={styles.champ}
          value={code}
          onChangeText={setCode}
          autoCapitalize="characters"
          placeholder="Code du groupe"
          placeholderTextColor={theme.colors.textMuted}
          accessibilityLabel="Code du groupe"
        />
        <Bouton
          titre="Rejoindre le groupe"
          onPress={() => executer('code', () => rejoindreGroupe(code))}
          enCours={enCours === 'code'}
          desactive={!code.trim()}
        />
      </View>

      <View style={styles.carte}>
        <Text style={styles.carteTitre}>Créer un groupe</Text>
        <Text style={styles.aide}>
          Un groupe par équipe, club ou classe. Les autres parents ne verront que ses trajets et le prénom des enfants.
        </Text>
        <TextInput
          style={styles.champ}
          value={nom}
          onChangeText={setNom}
          placeholder="Nom (ex. U11 foot — mercredi)"
          placeholderTextColor={theme.colors.textMuted}
          accessibilityLabel="Nom du groupe"
        />
        <Text style={styles.libelle}>Zone de vacances scolaires</Text>
        <Text style={styles.aide}>Pour ne pas créer de séances pendant les vacances.</Text>
        <View style={styles.choix}>
          {[null, ...ZONES_VACANCES].map((z) => (
            <Pressable
              key={z ?? 'aucune'}
              onPress={() => setZone(z)}
              style={[styles.puce, zone === z && styles.puceActive]}
              accessibilityRole="radio"
              accessibilityState={{ selected: zone === z }}
            >
              <Text style={[styles.puceTexte, zone === z && { color: theme.colors.background }]}>
                {z === null ? 'Aucune' : z === 'Corse' ? 'Corse' : `Zone ${z}`}
              </Text>
            </Pressable>
          ))}
        </View>
        <Bouton
          variante="contour"
          titre="Créer le groupe"
          onPress={() => executer('groupe', () => creerGroupe(nom, zone))}
          enCours={enCours === 'groupe'}
          desactive={!nom.trim()}
        />
      </View>
      {erreur && <Text style={styles.erreur}>{erreur}</Text>}
    </ScrollView>
  );
}

const styles = creerStylesThemes(() => ({
  flex: { flex: 1, backgroundColor: theme.colors.background },
  contenu: { padding: theme.spacing.md, gap: theme.spacing.md },
  carte: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radii.lg,
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  carteTitre: { fontFamily: theme.fontBodyBold, fontSize: 17, color: theme.colors.text },
  libelle: { fontFamily: theme.fontBodyBold, fontSize: 14, color: theme.colors.text, marginTop: theme.spacing.xs },
  aide: { fontFamily: theme.fontBody, fontSize: 13, color: theme.colors.textMuted },
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
  choix: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.xs },
  puce: {
    minHeight: 36,
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: theme.colors.accent,
  },
  puceActive: { backgroundColor: theme.colors.accent },
  puceTexte: { fontFamily: theme.fontBodyBold, fontSize: 14, color: theme.colors.accent },
  erreur: { fontFamily: theme.fontBody, fontSize: 14, color: theme.colors.warning },
}));
