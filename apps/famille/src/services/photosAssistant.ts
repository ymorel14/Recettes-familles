import { Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

// Photos et PDF envoyés à l'assistant (étape 5). Les photos sont réduites
// sur le téléphone AVANT l'envoi (spécification § 3.2) : 1 568 px au plus
// sur le grand côté, JPEG qualité 0,8. Moins de tokens, envoi plus rapide.
// Rien n'est enregistré : la photo ne fait que passer par l'assistant.

export type FichierAssistant = { type: 'image' | 'pdf'; media_type: string; donnees: string };
export type PhotoChoisie = { uri: string; largeur?: number; hauteur?: number };

export const COTE_MAX_ASSISTANT = 1568;
// Classement d'une photo du ⊕ : une petite image suffit (et coûte 10 fois moins).
export const COTE_CLASSEMENT = 512;
const PDF_MAX_OCTETS = 5 * 1024 * 1024;

export class ErreurPhoto extends Error {}

// Appareil photo ou galerie. `max` > 1 : choix multiple dans la galerie.
export async function choisirPhotos(source: 'camera' | 'galerie', max = 1): Promise<PhotoChoisie[]> {
  const permission =
    source === 'camera'
      ? await ImagePicker.requestCameraPermissionsAsync()
      : Platform.OS === 'web'
        ? { granted: true }
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    throw new ErreurPhoto('Autorisez l’accès à l’appareil photo et aux photos dans les réglages du téléphone.');
  }
  const options: ImagePicker.ImagePickerOptions = {
    mediaTypes: ['images'],
    quality: 1,
    ...(source === 'galerie' && max > 1 ? { allowsMultipleSelection: true, selectionLimit: max } : {}),
  };
  const r = source === 'camera' ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
  if (r.canceled) return [];
  return (r.assets ?? []).slice(0, max).map((a) => ({ uri: a.uri, largeur: a.width, hauteur: a.height }));
}

// Réduit une photo et la renvoie en base64 (JPEG).
export async function photoPourAssistant(photo: PhotoChoisie, cote = COTE_MAX_ASSISTANT): Promise<FichierAssistant> {
  try {
    let largeur = photo.largeur ?? 0;
    let hauteur = photo.hauteur ?? 0;
    if (!largeur || !hauteur) {
      const brute = await ImageManipulator.manipulate(photo.uri).renderAsync();
      largeur = brute.width;
      hauteur = brute.height;
    }
    const contexte = ImageManipulator.manipulate(photo.uri);
    if (Math.max(largeur, hauteur) > cote) {
      contexte.resize(largeur >= hauteur ? { width: cote } : { height: cote });
    }
    const image = await contexte.renderAsync();
    const r = await image.saveAsync({ compress: 0.8, format: SaveFormat.JPEG, base64: true });
    if (!r.base64) throw new Error('vide');
    return { type: 'image', media_type: 'image/jpeg', donnees: r.base64.replace(/^data:[^,]*,/, '') };
  } catch {
    throw new ErreurPhoto('Je n’ai pas pu préparer cette photo. Essayez-en une autre.');
  }
}

export async function photosPourAssistant(photos: PhotoChoisie[], cote = COTE_MAX_ASSISTANT): Promise<FichierAssistant[]> {
  const fichiers: FichierAssistant[] = [];
  for (const p of photos) fichiers.push(await photoPourAssistant(p, cote));
  return fichiers;
}

function lireEnBase64(uri: string): Promise<string> {
  return fetch(uri)
    .then((r) => r.blob())
    .then(
      (blob) =>
        new Promise<string>((resoudre, rejeter) => {
          if (blob.size > PDF_MAX_OCTETS) return rejeter(new ErreurPhoto('PDF trop lourd (5 Mo au plus). Envoyez plutôt une photo de la page.'));
          const lecteur = new FileReader();
          lecteur.onerror = () => rejeter(new ErreurPhoto('PDF illisible.'));
          lecteur.onload = () => resoudre(String(lecteur.result ?? '').replace(/^data:[^,]*,/, ''));
          lecteur.readAsDataURL(blob);
        })
    );
}

// Un PDF (planning du club, mot de l'école).
export async function choisirPdf(): Promise<{ nom: string; fichier: FichierAssistant } | null> {
  const r = await DocumentPicker.getDocumentAsync({ type: 'application/pdf', copyToCacheDirectory: true, multiple: false });
  if (r.canceled || !r.assets?.[0]) return null;
  const a = r.assets[0];
  if (a.size && a.size > PDF_MAX_OCTETS) throw new ErreurPhoto('PDF trop lourd (5 Mo au plus). Envoyez plutôt une photo de la page.');
  const donnees = await lireEnBase64(a.uri);
  return { nom: a.name, fichier: { type: 'pdf', media_type: 'application/pdf', donnees } };
}
