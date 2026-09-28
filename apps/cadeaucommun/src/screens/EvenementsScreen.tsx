import React, { useCallback, useState } from 'react';
import { View, Text, FlatList, Pressable, RefreshControl } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { theme, creerStylesThemes } from '../theme/theme';
import { useAuth } from '../contexts/AuthContext';
import {
  formaterDate,
  joursAvant,
  libelleCompteARebours,
  listerEvenements,
  TYPES_EVENEMENT,
  type Evenement,
  dateCle,
  libelleDates,
} from '../services/wishlist';
import { Bouton, Chargement, MessageVide, Pastille } from '../components/ui';

// Onglet "Événements" : Noël, anniversaires… de la famille active, les
// prochains d'abord, puis les passés.
export default function EvenementsScreen({ navigation }: any) {
  const { famille } = useAuth();
  const [evenements, setEvenements] = useState<Evenement[] | null>(null);
  const [rechargement, setRechargement] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const charger = useCallback(async () => {
    if (!famille) return;
    try {
      setErreur(null);
      setEvenements(await listerEvenements(famille.id));
    } catch (e: any) {
      setErreur(e?.message ?? 'Chargement impossible.');
      setEvenements([]);
    }
  }, [famille]);

  useFocusEffect(
    useCallback(() => {
      charger();
    }, [charger])
  );

  if (evenements === null) return <Chargement />;

  const tries = [...evenements].sort((a, b) => dateCle(a).localeCompare(dateCle(b)));
  const aVenir = tries.filter((e) => joursAvant(dateCle(e)) >= 0);
  const passes = tries.filter((e) => joursAvant(dateCle(e)) < 0).reverse();
  const lignes = [...aVenir, ...passes];

  return (
    <FlatList
      style={styles.flex}
      contentContainerStyle={styles.contenu}
      data={lignes}
      keyExtractor={(e) => e.id}
      refreshControl={
        <RefreshControl
          refreshing={rechargement}
          onRefresh={async () => {
            setRechargement(true);
            await charger();
            setRechargement(false);
          }}
          tintColor={theme.colors.accent}
        />
      }
      ListHeaderComponent={
        <View style={styles.entete}>
          <Bouton titre="+ Nouvel événement" onPress={() => navigation.navigate('NouvelEvenement')} />
          {erreur && <Text style={styles.erreur}>{erreur}</Text>}
        </View>
      }
      ListEmptyComponent={
        <MessageVide
          titre="Aucun événement pour l'instant"
          texte="Créez Noël, un anniversaire ou une naissance : chacun pourra y ajouter sa liste de souhaits."
        />
      }
      renderItem={({ item, index }) => {
        const passe = joursAvant(dateCle(item)) < 0;
        const premierPasse = passe && index === aVenir.length;
        return (
          <>
            {premierPasse && <Text style={styles.section}>Passés</Text>}
            <Pressable
              style={[styles.carte, passe && styles.cartePassee]}
              onPress={() => navigation.navigate('Evenement', { evenementId: item.id })}
              accessibilityRole="button"
            >
              <View style={styles.carteHaut}>
                <Text style={styles.type}>
                  {TYPES_EVENEMENT.find((t) => t.id === item.type)?.libelle ?? 'Événement'}
                </Text>
                <Pastille texte={libelleCompteARebours(dateCle(item))} ton={passe ? 'neutre' : 'accent'} />
              </View>
              <Text style={styles.titre}>{item.titre}</Text>
              <Text style={styles.date}>{libelleDates(item)}</Text>
            </Pressable>
          </>
        );
      }}
    />
  );
}

const styles = creerStylesThemes(() => ({
  flex: { flex: 1, backgroundColor: theme.colors.background },
  contenu: { padding: theme.spacing.md, gap: theme.spacing.sm, paddingBottom: theme.spacing.xl },
  entete: { gap: theme.spacing.sm, marginBottom: theme.spacing.sm },
  section: {
    fontFamily: theme.fontTitle,
    fontSize: 18,
    color: theme.colors.textMuted,
    marginTop: theme.spacing.md,
    marginBottom: theme.spacing.xs,
  },
  carte: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radii.lg,
    padding: theme.spacing.md,
    gap: 4,
  },
  cartePassee: { opacity: 0.7 },
  carteHaut: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  type: {
    fontFamily: theme.fontBodyBold,
    fontSize: 12,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: theme.colors.textMuted,
  },
  titre: { fontFamily: theme.fontTitle, fontSize: 22, color: theme.colors.text },
  date: { fontFamily: theme.fontBody, fontSize: 14, color: theme.colors.textMuted },
  erreur: { fontFamily: theme.fontBody, fontSize: 14, color: theme.colors.warning },
}));
