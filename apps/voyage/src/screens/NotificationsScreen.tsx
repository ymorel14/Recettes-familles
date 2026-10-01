import React, { useCallback, useState } from 'react';
import { View, Text, FlatList, Pressable } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { theme, creerStylesThemes } from '../theme/theme';
import {
  effacerLues,
  ilYA,
  listerNotifications,
  marquerLue,
  toutMarquerLu,
  type Notification,
} from '../services/notifications';
import { messageErreurVoyage } from '../services/voyage';
import { Bouton, Chargement, MessageVide } from '../components/ui';

const ICONES: Record<string, string> = {
  invitation: 'mail-outline',
  dates_proposees: 'calendar-outline',
  dates_retenues: 'calendar',
  hebergement_propose: 'home-outline',
  hebergement_retenu: 'home',
  activite_proposee: 'ticket-outline',
  activite_retenue: 'ticket',
  plat_propose: 'restaurant-outline',
  tache_confiee: 'hand-right-outline',
};

// Nouveautés : ce qui a bougé dans mes voyages (invitations, dates,
// hébergements, activités). Toucher une ligne ouvre l'écran concerné.
export default function NotificationsScreen({ navigation }: any) {
  const [notifications, setNotifications] = useState<Notification[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  const charger = useCallback(async () => {
    try {
      setErreur(null);
      setNotifications(await listerNotifications());
    } catch (e) {
      setErreur(messageErreurVoyage(e));
      setNotifications([]);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      charger();
    }, [charger])
  );

  if (notifications === null) return <Chargement />;
  const nonLues = notifications.filter((n) => !n.lue_le).length;

  const ouvrir = async (n: Notification) => {
    if (!n.lue_le) marquerLue(n.id).catch(() => {});
    navigation.navigate(n.ecran, { voyageId: n.voyage_id });
  };

  return (
    <FlatList
      style={styles.flex}
      contentContainerStyle={styles.contenu}
      data={notifications}
      keyExtractor={(n) => n.id}
      ListHeaderComponent={
        notifications.length > 0 ? (
          <View style={styles.actions}>
            {nonLues > 0 && (
              <Bouton titre="Tout marquer comme lu" variante="contour" onPress={() => toutMarquerLu().then(charger)} />
            )}
            {notifications.length > nonLues && (
              <Bouton titre="Effacer les lues" variante="discret" onPress={() => effacerLues().then(charger)} />
            )}
            {erreur && <Text style={styles.erreur}>{erreur}</Text>}
          </View>
        ) : null
      }
      ListEmptyComponent={
        <MessageVide
          titre="Rien de nouveau"
          texte={erreur ?? 'Vous verrez ici les invitations, les dates proposées, les hébergements et les activités.'}
        />
      }
      renderItem={({ item }) => (
        <Pressable
          style={[styles.ligne, !item.lue_le && styles.ligneNonLue]}
          onPress={() => ouvrir(item)}
          accessibilityRole="button"
          accessibilityLabel={`${item.lue_le ? '' : 'Non lue : '}${item.message}`}
        >
          <Ionicons name={(ICONES[item.type] ?? 'notifications-outline') as any} size={22} color={theme.colors.accent} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={[styles.message, !item.lue_le && styles.messageNonLu]}>{item.message}</Text>
            <Text style={styles.date}>{ilYA(item.cree_le)}</Text>
          </View>
          {!item.lue_le && <View style={styles.point} />}
        </Pressable>
      )}
    />
  );
}

const styles = creerStylesThemes(() => ({
  flex: { flex: 1, backgroundColor: theme.colors.background },
  contenu: { padding: theme.spacing.md, gap: theme.spacing.sm, paddingBottom: theme.spacing.xl },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm, marginBottom: theme.spacing.xs },
  ligne: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    padding: theme.spacing.md,
    borderRadius: theme.radii.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.background,
  },
  ligneNonLue: { backgroundColor: theme.colors.surface },
  message: { fontFamily: theme.fontBody, fontSize: 15, color: theme.colors.text },
  messageNonLu: { fontFamily: theme.fontBodyBold },
  date: { fontFamily: theme.fontBody, fontSize: 13, color: theme.colors.textMuted },
  point: { width: 10, height: 10, borderRadius: 5, backgroundColor: theme.colors.accent },
  erreur: { fontFamily: theme.fontBody, fontSize: 14, color: theme.colors.warning },
}));
