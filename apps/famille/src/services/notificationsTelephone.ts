import { useEffect } from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { useAuth } from '@apps-famille/famille';
import {
  activerRappels,
  desactiverRappels,
  jetonRappels,
  rafraichirRappels,
  type ResultatRappels,
} from '../modules/quotidien/services/notifications';
import { navigationRef, ouvrirCible } from '../navigation/navigationRef';
import { supabase } from './supabase';
import type { IdModule } from '../theme/jetons';

// Notifications sur le téléphone (spécification § 2.5) : un seul réglage
// dans Moi. Le jeton Expo du téléphone est inscrit
//   - dans famille.appareils : toutes les nouveautés de la famille (écran
//     Activité), envoyées par la fonction Edge envoyer-notifications ;
//   - dans quotidien.appareils : rappels de la veille des trajets
//     (rappels-veille), comme dans l'app Quotidien.
// Toucher une notification ouvre l'écran concerné.

export const notificationsPossibles = () => Platform.OS !== 'web';

async function inscrireFamille(jeton: string): Promise<void> {
  const { error } = await supabase.rpc('enregistrer_appareil', {
    jeton_expo: jeton,
    plateforme_appareil: Platform.OS === 'ios' ? 'ios' : 'android',
  });
  // Sans la migration famille_notifications_modules : seulement les rappels.
  if (error && !/function|schema cache|PGRST202/i.test(`${error.code} ${error.message}`)) throw error;
}

export async function activerNotificationsTelephone(): Promise<ResultatRappels> {
  const r = await activerRappels();
  if (r !== 'ok') return r;
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('nouveautes', {
      name: 'Nouveautés de la famille',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }
  const jeton = await jetonRappels();
  if (jeton) await inscrireFamille(jeton);
  return 'ok';
}

export async function desactiverNotificationsTelephone(): Promise<void> {
  const jeton = await jetonRappels();
  if (jeton) await supabase.from('appareils').delete().eq('jeton', jeton);
  await desactiverRappels();
}

export function messageNotifications(r: ResultatRappels): string {
  switch (r) {
    case 'ok':
      return 'Les nouveautés de la famille et les rappels de vos trajets arriveront sur ce téléphone.';
    case 'refuse':
      return 'Les notifications sont refusées : autorisez-les pour Famille dans les réglages du téléphone.';
    case 'simulateur':
      return 'Les notifications ne fonctionnent que sur un vrai téléphone.';
    case 'sans_projet':
      return 'Cette version de l’app n’est pas encore reliée au service de notifications (projet EAS manquant).';
    default:
      return 'Les notifications ne sont disponibles que dans l’app sur téléphone.';
  }
}

// Nouveautés d'un module envoyées ou non sur le téléphone (côté serveur,
// pour envoyer-notifications). Sans la migration : sans effet.
export async function reglerModuleTelephone(module: IdModule, actif: boolean): Promise<void> {
  await supabase
    .from('reglages_notifications')
    .upsert({ module, telephone: actif, maj_le: new Date().toISOString() }, { onConflict: 'utilisateur_id,module' });
}

// Ouvre l'écran d'une notification touchée (dès que la navigation est prête).
function ouvrirQuandPret(cible: string, essais = 20) {
  if (navigationRef.isReady()) ouvrirCible(cible);
  else if (essais > 0) setTimeout(() => ouvrirQuandPret(cible, essais - 1), 250);
}

function cibleDe(reponse: Notifications.NotificationResponse | null): string | null {
  const cible = reponse?.notification.request.content.data?.cible;
  return typeof cible === 'string' && cible ? cible : null;
}

// À monter une fois, sous l'AuthProvider : ré-inscription discrète du
// téléphone (le jeton peut changer) et ouverture au toucher.
export function useNotificationsTelephone(): void {
  const { session } = useAuth();
  const connecte = !!session;

  useEffect(() => {
    if (!notificationsPossibles() || !connecte) return;
    (async () => {
      const jeton = await jetonRappels();
      if (!jeton) return;
      await rafraichirRappels().catch(() => {});
      const nouveau = await jetonRappels();
      if (nouveau) await inscrireFamille(nouveau).catch(() => {});
    })();
  }, [connecte]);

  useEffect(() => {
    if (!notificationsPossibles() || !connecte) return;
    Notifications.getLastNotificationResponseAsync()
      .then((r) => {
        const cible = cibleDe(r);
        if (cible) ouvrirQuandPret(cible);
      })
      .catch(() => {});
    const abonnement = Notifications.addNotificationResponseReceivedListener((r) => {
      const cible = cibleDe(r);
      if (cible) ouvrirQuandPret(cible);
    });
    return () => abonnement.remove();
  }, [connecte]);
}
