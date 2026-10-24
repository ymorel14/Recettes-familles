import * as FileSystem from 'expo-file-system/legacy';
import { decode } from 'base64-arraybuffer';
import { Platform } from 'react-native';
import { supabase, BUCKET_PHOTOS_RECETTES } from './supabase';
import { creerRecette, listerRecettesPourLiaison } from './recettes';
import { lireSauvegarde, extrairePhoto, cleTitre } from './myRecipeBox';
import type { SauvegardeMyRecipeBox, RecetteImportable } from './myRecipeBox';

// Import d'une sauvegarde My Recipe Box (.rtk) dans le foyer : lecture du
// fichier choisi sur l'appareil, repérage des recettes déjà présentes, puis
// enregistrement des recettes cochées avec leur photo. La conversion
// elle-même est dans services/myRecipeBox.ts.

export type { SauvegardeMyRecipeBox, RecetteImportable };

// Fichier choisi (adresse locale, ou "blob:" dans un navigateur) → recettes.
export async function ouvrirSauvegarde(uri: string): Promise<SauvegardeMyRecipeBox> {
  let octets: Uint8Array;
  if (Platform.OS === 'web') {
    octets = new Uint8Array(await (await fetch(uri)).arrayBuffer());
  } else {
    octets = new Uint8Array(decode(await FileSystem.readAsStringAsync(uri, { encoding: 'base64' })));
  }
  return lireSauvegarde(octets);
}

// Clés (cle) des recettes de la sauvegarde qui existent déjà dans le foyer,
// à titre égal (accents et casse ignorés).
export async function repererDoublons(foyerId: string, recettes: RecetteImportable[]): Promise<Set<string>> {
  const existantes = new Set((await listerRecettesPourLiaison(foyerId)).map((r) => cleTitre(r.titre)));
  return new Set(recettes.filter((r) => existantes.has(cleTitre(r.formulaire.titre))).map((r) => r.cle));
}

// Type réel d'une image d'après ses premiers octets : My Recipe Box nomme
// ".png" des photos qui sont en fait des JPEG.
function typeImage(octets: Uint8Array): { extension: string; type: string } {
  const [a, b, c, d] = octets;
  if (a === 0x89 && b === 0x50 && c === 0x4e && d === 0x47) return { extension: 'png', type: 'image/png' };
  if (a === 0x47 && b === 0x49 && c === 0x46) return { extension: 'gif', type: 'image/gif' };
  if (a === 0x52 && b === 0x49 && c === 0x46 && d === 0x46) return { extension: 'webp', type: 'image/webp' };
  return { extension: 'jpg', type: 'image/jpeg' };
}

// Photo extraite de l'archive → espace de stockage des recettes (même
// espace et même nommage que televerserPhoto). null si elle est illisible :
// la recette s'importe alors sans photo.
async function televerserPhotoArchive(sauvegarde: SauvegardeMyRecipeBox, fichier: string): Promise<string | null> {
  const octets = extrairePhoto(sauvegarde.archive, fichier);
  if (!octets || octets.length === 0) return null;
  const { extension, type } = typeImage(octets);
  const nomFichier = `${Date.now()}-${Math.round(Math.random() * 1e6)}.${extension}`;
  const { error } = await supabase.storage.from(BUCKET_PHOTOS_RECETTES).upload(nomFichier, octets, { contentType: type });
  if (error) return null;
  return supabase.storage.from(BUCKET_PHOTOS_RECETTES).getPublicUrl(nomFichier).data.publicUrl;
}

export type BilanImport = { importees: number; echecs: string[]; arrete: boolean };

// Enregistre les recettes une par une (une erreur n'arrête pas les
// suivantes). nomsCategories : catégories ajoutées à chaque recette, en plus
// de celles que la sauvegarde donnerait. doitArreter : consulté avant chaque
// recette (bouton « Arrêter »).
export async function importerRecettes(
  sauvegarde: SauvegardeMyRecipeBox,
  recettes: RecetteImportable[],
  foyerId: string,
  utilisateurId: string,
  nomsCategories: string[],
  surProgression: (faites: number, total: number, titre: string) => void,
  doitArreter: () => boolean = () => false
): Promise<BilanImport> {
  const bilan: BilanImport = { importees: 0, echecs: [], arrete: false };
  for (let i = 0; i < recettes.length; i += 1) {
    if (doitArreter()) {
      bilan.arrete = true;
      break;
    }
    const recette = recettes[i];
    surProgression(i, recettes.length, recette.formulaire.titre);
    try {
      const urlPhoto = recette.fichierPhoto ? await televerserPhotoArchive(sauvegarde, recette.fichierPhoto) : null;
      const categories = Array.from(new Set([...recette.formulaire.nomsCategories, ...nomsCategories]));
      await creerRecette(foyerId, utilisateurId, {
        ...recette.formulaire,
        nomsCategories: categories,
        // Photo déjà hébergée : passée comme une photo existante.
        photos: urlPhoto ? [{ clefId: `photo-${recette.cle}`, uriLocale: null, urlExistante: urlPhoto }] : [],
      });
      bilan.importees += 1;
    } catch {
      bilan.echecs.push(recette.formulaire.titre);
    }
  }
  surProgression(recettes.length, recettes.length, '');
  return bilan;
}
