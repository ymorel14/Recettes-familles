import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { supabase } from './supabase';

// Rappels de la veille sur ce téléphone : le jeton de notification Expo
// est inscrit dans quotidien.appareils (fonction enregistrer_appareil) ;
// la fonction Edge rappels-veille s'en sert chaque soir.
// Clés préfixées par l'app (stockage partagé avec les autres apps sur le web).
const CLE_JETON = 'quotidien.rappels.jeton';
const CLE_PLUS_TARD = 'quotidien.rappels.plusTard';

export type ResultatRappels = 'ok' | 'web' | 'simulateur' | 'refuse' | 'sans_projet';

// Notification reçue pendant que l'app est ouverte : affichée quand même.
if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

export function rappelsPossibles(): boolean {
  return Platform.OS !== 'web';
}

// Jeton inscrit sur ce téléphone (null = rappels pas activés ici).
export async function jetonRappels(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(CLE_JETON);
  } catch {
    return null;
  }
}

// Demande l'autorisation, obtient le jeton et l'inscrit pour le compte
// connecté. Sans fenêtre d'autorisation si elle a déjà été accordée.
export async function activerRappels(): Promise<ResultatRappels> {
  if (Platform.OS === 'web') return 'web';
  if (!Device.isDevice) return 'simulateur';
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('rappels', {
      name: 'Rappels de trajets',
      importance: Notifications.AndroidImportance.HIGH,
    });
  }
  let { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') status = (await Notifications.requestPermissionsAsync()).status;
  if (status !== 'granted') return 'refuse';
  // Identifiant du projet EAS (app.json > extra.eas.projectId, ajouté par « eas init »).
  const projectId = (Constants.expoConfig?.extra as any)?.eas?.projectId ?? (Constants as any).easConfig?.projectId;
  if (!projectId) return 'sans_projet';
  const jeton = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  const { error } = await supabase.rpc('enregistrer_appareil', {
    jeton_expo: jeton,
    plateforme_appareil: Platform.OS === 'ios' ? 'ios' : 'android',
  });
  if (error) throw error;
  await AsyncStorage.setItem(CLE_JETON, jeton);
  return 'ok';
}

// Ré-inscription discrète au démarrage (le jeton peut changer), seulement
// si les rappels étaient activés et l'autorisation toujours accordée.
export async function rafraichirRappels(): Promise<void> {
  if (Platform.OS === 'web' || !(await jetonRappels())) return;
  const { status } = await Notifications.getPermissionsAsync();
  if (status === 'granted') await activerRappels().catch(() => {});
}

export async function desactiverRappels(): Promise<void> {
  const jeton = await jetonRappels();
  if (jeton) await supabase.from('appareils').delete().eq('jeton', jeton);
  await AsyncStorage.removeItem(CLE_JETON);
}

// « Plus tard » sur la proposition de l'accueil.
export async function propositionMasquee(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(CLE_PLUS_TARD)) === '1';
  } catch {
    return false;
  }
}

export async function masquerProposition(): Promise<void> {
  await AsyncStorage.setItem(CLE_PLUS_TARD, '1').catch(() => {});
}

export function messageResultat(r: ResultatRappels): string {
  switch (r) {
    case 'ok':
      return 'Vous recevrez un rappel la veille de vos trajets, et une alerte quand un trajet n’a pas de conducteur.';
    case 'refuse':
      return 'Les notifications sont refusées : autorisez-les pour Quotidien dans les réglages du téléphone.';
    case 'simulateur':
      return 'Les notifications ne fonctionnent que sur un vrai téléphone.';
    case 'sans_projet':
      return 'Cette version de l’app n’est pas encore reliée au service de notifications (projet EAS manquant).';
    default:
      return 'Les rappels ne sont disponibles que dans l’app sur téléphone.';
  }
}
