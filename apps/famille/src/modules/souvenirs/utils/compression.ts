import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import type { FichierLocal } from '../services/souvenirs';

// Compression des photos avant l'envoi à Supabase, pour économiser l'espace
// de stockage (1 Go sur le plan gratuit) et le temps d'envoi :
//   - le plus grand côté est ramené à 2 048 pixels (assez pour un écran,
//     même une tablette, et pour un tirage 10 × 15) ;
//   - l'image est réenregistrée en JPEG qualité 75 %.
// Une photo de téléphone de 3 à 6 Mo pèse ensuite environ 300 à 700 Ko.
// Les photos HEIC des iPhone deviennent des JPEG, lisibles partout (web
// compris). Les GIF (animés) et les vidéos, sons et documents sont envoyés
// tels quels. En cas d'échec, la photo d'origine est envoyée.

export const COTE_MAX = 2048;
export const QUALITE = 0.75;

export async function compresserPhoto(f: FichierLocal): Promise<FichierLocal> {
  if (f.type !== 'photo' || f.mimeType === 'image/gif' || /\.gif$/i.test(f.nom ?? '')) return f;
  try {
    let largeur = f.largeur ?? null;
    let hauteur = f.hauteur ?? null;
    // Dimensions inconnues : on les lit sur l'image elle-même.
    if (!largeur || !hauteur) {
      const brute = await ImageManipulator.manipulate(f.uri).renderAsync();
      largeur = brute.width;
      hauteur = brute.height;
    }
    const contexte = ImageManipulator.manipulate(f.uri);
    if (Math.max(largeur, hauteur) > COTE_MAX) {
      contexte.resize(largeur >= hauteur ? { width: COTE_MAX } : { height: COTE_MAX });
    }
    const image = await contexte.renderAsync();
    const resultat = await image.saveAsync({ compress: QUALITE, format: SaveFormat.JPEG });
    return {
      ...f,
      uri: resultat.uri,
      mimeType: 'image/jpeg',
      nom: f.nom ? f.nom.replace(/\.[^.]+$/, '') + '.jpg' : null,
      largeur: resultat.width,
      hauteur: resultat.height,
    };
  } catch {
    return f;
  }
}
