import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { theme, creerStylesThemes } from '../theme/theme';
import { useAuth } from '../contexts/AuthContext';
import { extraireMessageErreur } from '@apps-famille/famille';
import {
  formaterDate,
  joursAvant,
  libelleCompteARebours,
  mesListes,
  obtenirMaPersonne,
  type Evenement,
  type Liste,
  dateCle,
  libelleDates,
} from '../services/wishlist';
import { Bouton, Chargement, MessageVide, Pastille } from '../components/ui';

// Onglet "Mes envies" : mes listes de souhaits, événement par événement.
export default function MesEnviesScreen({ navigation }: any) {
  const { session } = useAuth();
  const [listes, setListes] = useState<(Liste & { evenement: Evenement })[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  const charger = useCallback(async () => {
    if (!session) return;
    try {
      setErreur(null);
      const moi = await obtenirMaPersonne(session.user.id);
      setListes(moi ? await mesListes(moi.id) : []);
    } catch (e) {
      setErreur(extraireMessageErreur(e, 'Chargement impossible.'));
      setListes([]);
    }
  }, [session]);

  useFocusEffect(
    useCallback(() => {
      charger();
    }, [charger])
  );

  if (listes === null) return <Chargement />;

  const aVenir = listes.filter((l) => l.evenement && joursAvant(dateCle(l.evenement)) >= 0);
  const passees = listes.filter((l) => l.evenement && joursAvant(dateCle(l.evenement)) < 0);

  const carte = (l: Liste & { evenement: Evenement }) => (
    <Pressable
      key={l.id}
      style={styles.carte}
      onPress={() => navigation.navigate('Liste', { listeId: l.id })}
      accessibilityRole="button"
    >
      <View style={styles.carteHaut}>
        <Text style={styles.carteTitre}>{l.evenement.titre}</Text>
        <Pastille texte={libelleCompteARebours(dateCle(l.evenement))} ton={joursAvant(dateCle(l.evenement)) < 0 ? 'neutre' : 'accent'} />
      </View>
      <Text style={styles.detail}>
        {libelleDates(l.evenement)} ·{' '}
        {l.statut === 'brouillon' ? 'brouillon, pas encore publiée' : 'visible par la famille'}
      </Text>
    </Pressable>
  );

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.contenu}>
      <Text style={styles.intro}>
        Vos listes de souhaits. Vous ne voyez jamais ce que la famille réserve ou suggère : la surprise reste entière.
      </Text>
      {erreur && <Text style={styles.erreur}>{erreur}</Text>}
      {listes.length === 0 ? (
        <>
          <MessageVide
            titre="Pas encore de liste"
            texte="Ouvrez un événement (Noël, votre anniversaire…) et touchez « Créer ma liste »."
          />
          <Bouton variante="contour" titre="Voir les événements" onPress={() => navigation.navigate('Evenements')} />
        </>
      ) : (
        <>
          {aVenir.map(carte)}
          {passees.length > 0 && <Text style={styles.section}>Passées</Text>}
          {passees.map(carte)}
        </>
      )}
    </ScrollView>
  );
}

const styles = creerStylesThemes(() => ({
  flex: { flex: 1, backgroundColor: theme.colors.background },
  contenu: { padding: theme.spacing.md, gap: theme.spacing.sm, paddingBottom: theme.spacing.xl },
  intro: { fontFamily: theme.fontBody, fontSize: 14, color: theme.colors.textMuted, marginBottom: theme.spacing.xs },
  section: { fontFamily: theme.fontTitle, fontSize: 18, color: theme.colors.textMuted, marginTop: theme.spacing.md },
  carte: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radii.lg,
    padding: theme.spacing.md,
    gap: 4,
  },
  carteHaut: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: theme.spacing.sm },
  carteTitre: { flex: 1, fontFamily: theme.fontTitle, fontSize: 20, color: theme.colors.text },
  detail: { fontFamily: theme.fontBody, fontSize: 14, color: theme.colors.textMuted },
  erreur: { fontFamily: theme.fontBody, fontSize: 14, color: theme.colors.warning },
}));
