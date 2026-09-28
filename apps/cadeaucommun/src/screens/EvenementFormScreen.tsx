import React, { useState } from 'react';
import { View, Text, TextInput, ScrollView, Pressable } from 'react-native';
import { theme, creerStylesThemes } from '../theme/theme';
import { useAuth } from '../contexts/AuthContext';
import { extraireMessageErreur } from '@apps-famille/famille';
import { creerEvenement, lireDateSaisie, TYPES_EVENEMENT, type TypeEvenement } from '../services/wishlist';
import { Bouton } from '../components/ui';

// Prochaine date d'un jour/mois fixe (Noël : 25/12) au format JJ/MM/AAAA.
function prochaineDate(jour: number, mois: number): string {
  const aujourdHui = new Date();
  let annee = aujourdHui.getFullYear();
  const cette = new Date(annee, mois - 1, jour);
  if (cette < new Date(annee, aujourdHui.getMonth(), aujourdHui.getDate())) annee += 1;
  return `${String(jour).padStart(2, '0')}/${String(mois).padStart(2, '0')}/${annee}`;
}

// Nouvel événement dans la famille active.
export default function EvenementFormScreen({ navigation }: any) {
  const { famille, session } = useAuth();
  const [type, setType] = useState<TypeEvenement>('noel');
  const [titre, setTitre] = useState(`Noël ${prochaineDate(25, 12).slice(-4)}`);
  const [date, setDate] = useState(prochaineDate(25, 12));
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const choisirType = (t: TypeEvenement) => {
    setType(t);
    if (t === 'noel') {
      const d = prochaineDate(25, 12);
      setDate(d);
      setTitre(`Noël ${d.slice(-4)}`);
    } else if (titre.startsWith('Noël')) {
      setTitre('');
      setDate('');
    }
  };

  const enregistrer = async () => {
    setErreur(null);
    const iso = lireDateSaisie(date);
    if (!titre.trim()) return setErreur('Donnez un nom à l’événement.');
    if (!iso) return setErreur('Date attendue au format JJ/MM/AAAA, par exemple 25/12/2026.');
    if (!famille || !session) return;
    setEnCours(true);
    try {
      const id = await creerEvenement({ familleId: famille.id, type, titre, date: iso, auteurId: session.user.id });
      navigation.replace('Evenement', { evenementId: id });
    } catch (e) {
      setErreur(extraireMessageErreur(e, 'Impossible de créer l’événement.'));
    } finally {
      setEnCours(false);
    }
  };

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.contenu} keyboardShouldPersistTaps="handled">
      <Text style={styles.libelle}>Type</Text>
      <View style={styles.puces}>
        {TYPES_EVENEMENT.map((t) => (
          <Pressable
            key={t.id}
            onPress={() => choisirType(t.id)}
            style={[styles.puce, type === t.id && styles.puceActive]}
            accessibilityRole="radio"
            accessibilityState={{ selected: type === t.id }}
          >
            <Text style={[styles.puceTexte, type === t.id && styles.puceTexteActive]}>{t.libelle}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.libelle} nativeID="libelle-titre">Nom</Text>
      <TextInput
        style={styles.champ}
        value={titre}
        onChangeText={setTitre}
        placeholder="Ex. Anniversaire de Léa"
        placeholderTextColor={theme.colors.textMuted}
        accessibilityLabelledBy="libelle-titre"
      />

      <Text style={styles.libelle} nativeID="libelle-date">Date</Text>
      <TextInput
        style={styles.champ}
        value={date}
        onChangeText={setDate}
        placeholder="JJ/MM/AAAA"
        placeholderTextColor={theme.colors.textMuted}
        keyboardType="numbers-and-punctuation"
        accessibilityLabelledBy="libelle-date"
      />
      <Text style={styles.aide}>
        L'événement est visible par toute la famille {famille?.nom}. Chacun pourra y créer sa liste de souhaits.
      </Text>

      {erreur && <Text style={styles.erreur}>{erreur}</Text>}
      <Bouton titre="Créer l’événement" onPress={enregistrer} enCours={enCours} />
    </ScrollView>
  );
}

const styles = creerStylesThemes(() => ({
  flex: { flex: 1, backgroundColor: theme.colors.background },
  contenu: { padding: theme.spacing.md, gap: theme.spacing.sm },
  libelle: { fontFamily: theme.fontBodyBold, fontSize: 15, color: theme.colors.text, marginTop: theme.spacing.sm },
  puces: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.xs },
  puce: {
    minHeight: 40,
    justifyContent: 'center',
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  puceActive: { backgroundColor: theme.colors.accent, borderColor: theme.colors.accent },
  puceTexte: { fontFamily: theme.fontBody, fontSize: 14, color: theme.colors.text },
  puceTexteActive: { fontFamily: theme.fontBodyBold, color: theme.colors.background },
  champ: {
    minHeight: 44,
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radii.md,
    paddingHorizontal: theme.spacing.sm,
    color: theme.colors.text,
    fontFamily: theme.fontBody,
    fontSize: 16,
  },
  aide: { fontFamily: theme.fontBody, fontSize: 13, color: theme.colors.textMuted },
  erreur: { fontFamily: theme.fontBody, fontSize: 14, color: theme.colors.warning },
}));
