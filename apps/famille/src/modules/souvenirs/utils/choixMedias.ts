import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { Platform } from 'react-native';
import type { FichierLocal } from '../services/souvenirs';

// Choix des fichiers à ajouter à un souvenir : photos et vidéos de la
// galerie, photo prise sur le moment, ou sons et documents (PDF).
// Renvoie une liste vide si l'utilisateur annule ; lève une erreur lisible si
// l'autorisation est refusée. Les photos sont prises en pleine qualité : la
// compression se fait une seule fois, juste avant l'envoi (utils/compression).

function depuisImagePicker(assets: ImagePicker.ImagePickerAsset[]): FichierLocal[] {
  return assets.map((a) => ({
    uri: a.uri,
    type: a.type === 'video' ? 'video' : 'photo',
    mimeType: a.mimeType ?? null,
    nom: a.fileName ?? null,
    largeur: a.width || null,
    hauteur: a.height || null,
    // La durée est en millisecondes.
    dureeSecondes: a.duration ? a.duration / 1000 : null,
  }));
}

export async function choisirDansLaGalerie(): Promise<FichierLocal[]> {
  if (Platform.OS !== 'web') {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) throw new Error('Autorisez l’accès aux photos dans les réglages du téléphone.');
  }
  const resultat = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images', 'videos'],
    allowsMultipleSelection: true,
    selectionLimit: 30,
    quality: 1,
    videoMaxDuration: 180,
  });
  return resultat.canceled ? [] : depuisImagePicker(resultat.assets);
}

export async function prendreUnePhoto(): Promise<FichierLocal[]> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) throw new Error("Autorisez l'appareil photo dans les réglages du téléphone.");
  const resultat = await ImagePicker.launchCameraAsync({ mediaTypes: ['images', 'videos'], quality: 1, videoMaxDuration: 180 });
  return resultat.canceled ? [] : depuisImagePicker(resultat.assets);
}

export async function choisirSonsOuDocuments(): Promise<FichierLocal[]> {
  const resultat = await DocumentPicker.getDocumentAsync({
    type: ['audio/*', 'application/pdf'],
    multiple: true,
    copyToCacheDirectory: true,
  });
  if (resultat.canceled) return [];
  return resultat.assets.map((a) => ({
    uri: a.uri,
    type: (a.mimeType ?? '').startsWith('audio/') || /\.(mp3|m4a|aac|wav|ogg|opus)$/i.test(a.name) ? 'audio' : 'document',
    mimeType: a.mimeType ?? null,
    nom: a.name ?? null,
  }));
}
