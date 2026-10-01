import React, { useCallback, useState } from 'react';
import { View, Text, FlatList, Pressable } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { theme, creerStylesThemes } from '../theme/theme';
import { useAuth } from '../contexts/AuthContext';
import { extraireMessageErreur } from '@apps-famille/famille';
import { creerDepuisVoyage, listerVoyagesPasses, type VoyagePasse } from '../services/souvenirs';
import { Chargement, MessageVide } from '../components/ui';
import { aujourdhuiIso, formaterDateSouvenir } from '../utils/dates';

// Voyages passés de VoyageCommun (famille active). Toucher un voyage crée son
// souvenir (titre, dates, destination, participants), ou ouvre celui qui
// existe déjà, pour y ajouter les photos.
export default function DepuisVoyageScreen({ navigation }: any) {
  const { famille } = useAuth();
  const [voyages, setVoyages] = useState<VoyagePasse[] | null>(null);
  const [enCours, setEnCours] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!famille) return;
      listerVoyagesPasses(famille.id, aujourdhuiIso())
        .then(setVoyages)
        .catch((e) => {
          setVoyages([]);
          setErreur(extraireMessageErreur(e, 'Impossible de lire les voyages.'));
        });
    }, [famille?.id])
  );

  const ouvrir = async (v: VoyagePasse) => {
    if (v.souvenir_id) {
      navigation.replace('Souvenir', { id: v.souvenir_id });
      return;
    }
    setEnCours(v.id);
    setErreur(null);
    try {
      const id = await creerDepuisVoyage(v.id);
      navigation.replace('Souvenir', { id });
    } catch (e) {
      setErreur(extraireMessageErreur(e, 'Création impossible.'));
      setEnCours(null);
    }
  };

  if (!voyages) return <Chargement />;

  return (
    <FlatList
      style={styles.flex}
      contentContainerStyle={styles.contenu}
      data={voyages}
      keyExtractor={(v) => v.id}
      ItemSeparatorComponent={() => <View style={{ height: theme.spacing.sm }} />}
      ListHeaderComponent={
        <View style={{ gap: theme.spacing.xs, marginBottom: theme.spacing.sm }}>
          <Text style={styles.aide}>
            Le souvenir reprend le titre, les dates, la destination et les participants du voyage. Vous y ajouterez
            ensuite les photos.
          </Text>
          {erreur && <Text style={styles.erreur}>{erreur}</Text>}
        </View>
      }
      ListEmptyComponent={
        <MessageVide
          titre="Aucun voyage passé"
          texte="Les voyages terminés de VoyageCommun apparaîtront ici."
        />
      }
      renderItem={({ item }) => {
        const date = item.date_debut
          ? formaterDateSouvenir(item.date_debut, item.date_fin, 'jour')
          : item.annee
            ? String(item.annee)
            : 'Dates non fixées';
        const lieu = [item.destination, item.pays].filter(Boolean).join(', ');
        return (
          <Pressable
            onPress={() => ouvrir(item)}
            disabled={enCours !== null}
            style={({ pressed }) => [styles.carte, (pressed || enCours === item.id) && styles.appuye]}
            accessibilityRole="button"
          >
            <Ionicons name="airplane-outline" size={24} color={theme.colors.accent} />
            <View style={styles.textes}>
              <Text style={styles.titre}>{item.titre}</Text>
              <Text style={styles.detail}>
                {date}
                {lieu ? ` · ${lieu}` : ''}
              </Text>
              {item.souvenir_id ? <Text style={styles.deja}>Déjà dans les souvenirs : toucher pour l'ouvrir</Text> : null}
            </View>
            <Ionicons
              name={enCours === item.id ? 'hourglass-outline' : item.souvenir_id ? 'chevron-forward' : 'add-circle-outline'}
              size={22}
              color={theme.colors.accent}
            />
          </Pressable>
        );
      }}
    />
  );
}

const styles = creerStylesThemes(() => ({
  flex: { flex: 1, backgroundColor: theme.colors.background },
  contenu: { padding: theme.spacing.md, paddingBottom: theme.spacing.xl },
  aide: { fontFamily: theme.fontBody, fontSize: 14, color: theme.colors.textMuted, lineHeight: 20 },
  erreur: { fontFamily: theme.fontBody, fontSize: 14, color: theme.colors.warning },
  carte: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    padding: theme.spacing.md,
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radii.lg,
  },
  appuye: { opacity: 0.6 },
  textes: { flex: 1, gap: 2 },
  titre: { fontFamily: theme.fontTitle, fontSize: 17, color: theme.colors.text },
  detail: { fontFamily: theme.fontBody, fontSize: 14, color: theme.colors.textMuted },
  deja: { fontFamily: theme.fontBody, fontSize: 13, color: theme.colors.accent },
}));
