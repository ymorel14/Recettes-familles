import React, { useState } from 'react';
import { FlatList, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNotifications } from '../contexts/NotificationsContext';
import { ilYA, type NotificationFamille } from '../services/notifications';
import { EtatVide, PastilleModule, PuceFiltre } from '../composants/ui';
import { useToast } from '../composants/Toast';
import { MODULES, couleurs, creerStyles, espaces, margePage, polices, texte, type IdModule } from '../theme/theme';
import { ouvrirCible } from '../navigation/navigationRef';

// Activité (spécification § 2.4, charte § 8.3) : toutes les notifications,
// filtre par module, non lues en gras sur fond blanc, « Tout marquer lu ».

export default function ActiviteScreen() {
  const insets = useSafeAreaInsets();
  const { notifications, nonLues, chargement, rafraichir, marquerLue, toutMarquerLu } = useNotifications();
  const { afficher } = useToast();
  const [filtre, setFiltre] = useState<IdModule | null>(null);
  const [actualisation, setActualisation] = useState(false);

  const liste = filtre ? notifications.filter((n) => n.module === filtre) : notifications;
  const nonLuesFiltre = liste.filter((n) => !n.lue_le).length;
  const modulesPresents = MODULES.filter((m) => notifications.some((n) => n.module === m.id));

  const ouvrir = (n: NotificationFamille) => {
    marquerLue(n.id);
    ouvrirCible(n.cible);
  };

  return (
    <View style={{ flex: 1, backgroundColor: couleurs.fond, paddingTop: insets.top + espaces.l }}>
      <View style={styles.entete}>
        <Text style={[texte.titreEcran(), { flex: 1 }]} accessibilityRole="header">
          Activité
        </Text>
        {nonLuesFiltre > 0 ? (
          <Pressable
            onPress={async () => {
              await toutMarquerLu(filtre ?? undefined);
              afficher('Tout est marqué comme lu.');
            }}
            accessibilityRole="button"
            hitSlop={8}
            style={styles.toutLu}
          >
            <Text style={styles.toutLuTexte}>Tout marquer lu</Text>
          </Pressable>
        ) : null}
      </View>
      <Text style={styles.resume}>
        {nonLues === 0 ? 'Vous êtes à jour.' : nonLues === 1 ? '1 nouveauté non lue' : `${nonLues} nouveautés non lues`}
      </Text>

      {modulesPresents.length > 1 ? (
        <View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filtres}>
            <PuceFiltre libelle="Tout" actif={filtre === null} onPress={() => setFiltre(null)} />
            {modulesPresents.map((m) => (
              <PuceFiltre key={m.id} libelle={m.nom} actif={filtre === m.id} onPress={() => setFiltre(m.id)} />
            ))}
          </ScrollView>
        </View>
      ) : null}

      <FlatList
        data={liste}
        keyExtractor={(n) => n.id}
        contentContainerStyle={styles.liste}
        refreshControl={
          <RefreshControl
            refreshing={actualisation}
            onRefresh={async () => {
              setActualisation(true);
              await rafraichir();
              setActualisation(false);
            }}
            tintColor={couleurs.encre}
          />
        }
        ListEmptyComponent={
          <EtatVide
            texte={chargement ? 'Je regarde les nouveautés…' : 'Aucune nouveauté pour l’instant. Les votes, réservations et propositions de la famille arriveront ici.'}
          />
        }
        renderItem={({ item: n }) => {
          const nonLue = !n.lue_le;
          return (
            <Pressable
              onPress={() => ouvrir(n)}
              accessibilityRole="button"
              accessibilityLabel={`${nonLue ? 'Non lu. ' : ''}${n.message}, ${ilYA(n.cree_le)}`}
              style={({ pressed }) => [styles.ligne, nonLue && styles.ligneNonLue, pressed && { opacity: 0.8 }]}
            >
              <PastilleModule module={n.module} taille={40} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={[styles.message, nonLue && { fontFamily: polices.texteGras }]}>{n.message}</Text>
                <Text style={styles.quand}>{ilYA(n.cree_le)}</Text>
              </View>
              {nonLue ? <View style={styles.pointNonLu} accessibilityElementsHidden /> : null}
            </Pressable>
          );
        }}
      />
    </View>
  );
}

const styles = creerStyles(() => ({
  entete: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: margePage },
  toutLu: { minHeight: 44, justifyContent: 'center' },
  toutLuTexte: { fontFamily: polices.texteGras, fontSize: 14, color: couleurs.encre },
  resume: { ...texte.secondaire(), paddingHorizontal: margePage, marginTop: 4 },
  filtres: { gap: espaces.s, paddingHorizontal: margePage, paddingVertical: espaces.l },
  liste: { paddingHorizontal: margePage, paddingBottom: espaces.xxxl * 2, gap: 6, paddingTop: espaces.s },
  ligne: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaces.m,
    padding: espaces.m,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  ligneNonLue: { backgroundColor: couleurs.surface, borderColor: couleurs.ligneCarte },
  message: { fontFamily: polices.texte, fontSize: 15, lineHeight: 21, color: couleurs.encre },
  quand: texte.secondaire(),
  pointNonLu: { width: 10, height: 10, borderRadius: 5, backgroundColor: couleurs.accent },
}));
