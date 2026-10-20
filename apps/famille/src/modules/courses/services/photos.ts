import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { supabase } from './supabase';
import { cleProduit, majusculeInitiale } from '../utils/texte';

// Photo d'un produit (la bonne marque, le bon format) : gardée avec le
// produit dans la mémoire du foyer (courses.produits.photo), pas avec
// l'article de la liste — elle revient chaque fois que ce produit est de
// nouveau sur une liste. Espace PRIVÉ « courses-photos », dossier = foyer,
// adresses signées (même méthode que les inventaires de Quotidien).

export const BUCKET_PHOTOS = 'courses-photos';
// 1280 pixels au plus sur le grand côté, JPEG (150 à 300 Ko) : assez net
// pour lire une étiquette au magasin.
const COTE_MAX = 1280;
const QUALITE = 0.7;
const DUREE_ADRESSE_S = 24 * 60 * 60;

export async function choisirPhoto(source: 'galerie' | 'camera'): Promise<string | null> {
  const permission =
    source === 'camera'
      ? await ImagePicker.requestCameraPermissionsAsync()
      : Platform.OS === 'web'
        ? { granted: true }
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) throw new Error('Autorisez l’accès à l’appareil photo et aux photos dans les réglages du téléphone.');
  const options = { mediaTypes: ['images' as const], quality: 0.9 };
  const resultat =
    source === 'camera' ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
  if (resultat.canceled || !resultat.assets?.[0]) return null;
  return resultat.assets[0].uri;
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function base64VersOctets(b64: string): ArrayBuffer {
  const propre = b64.replace(/^data:[^,]*,/, '').replace(/[^A-Za-z0-9+/]/g, '');
  const octets = new Uint8Array(Math.floor((propre.length * 3) / 4));
  let o = 0;
  for (let i = 0; i < propre.length; i += 4) {
    const a = B64.indexOf(propre[i]);
    const b = B64.indexOf(propre[i + 1]);
    const c = i + 2 < propre.length ? B64.indexOf(propre[i + 2]) : -1;
    const d = i + 3 < propre.length ? B64.indexOf(propre[i + 3]) : -1;
    octets[o++] = (a << 2) | (b >> 4);
    if (c >= 0) octets[o++] = ((b & 15) << 4) | (c >> 2);
    if (c >= 0 && d >= 0) octets[o++] = ((c & 3) << 6) | d;
  }
  return octets.slice(0, o).buffer;
}

async function envoyerPhoto(foyerId: string, uriLocale: string): Promise<string> {
  const brute = await ImageManipulator.manipulate(uriLocale).renderAsync();
  const contexte = ImageManipulator.manipulate(uriLocale);
  if (Math.max(brute.width, brute.height) > COTE_MAX) {
    contexte.resize(brute.width >= brute.height ? { width: COTE_MAX } : { height: COTE_MAX });
  }
  const image = await contexte.renderAsync();
  const resultat = await image.saveAsync({ compress: QUALITE, format: SaveFormat.JPEG, base64: true });
  if (!resultat.base64) throw new Error('Impossible de préparer la photo.');
  const chemin = `${foyerId}/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.jpg`;
  const { error } = await supabase.storage
    .from(BUCKET_PHOTOS)
    .upload(chemin, base64VersOctets(resultat.base64), { contentType: 'image/jpeg' });
  if (error) throw new Error(`Envoi de la photo impossible : ${error.message}`);
  return chemin;
}

async function supprimerFichier(chemin: string | null | undefined): Promise<void> {
  if (!chemin) return;
  await supabase.storage.from(BUCKET_PHOTOS).remove([chemin]).then(
    () => adresses.delete(chemin),
    () => {}
  );
}

// Donne (ou retire, avec null) la photo d'un produit du foyer de la liste.
// Renvoie le chemin enregistré.
export async function definirPhotoProduit(foyerId: string, libelle: string, uriLocale: string | null): Promise<string | null> {
  const cle = cleProduit(libelle);
  if (!cle) throw new Error('Article sans nom.');
  const { data: existant } = await supabase
    .from('produits')
    .select('photo')
    .eq('foyer_id', foyerId)
    .eq('cle', cle)
    .maybeSingle();
  const ancienne: string | null = (existant as any)?.photo ?? null;
  const chemin = uriLocale ? await envoyerPhoto(foyerId, uriLocale) : null;
  try {
    const { error } = existant
      ? await supabase.from('produits').update({ photo: chemin }).eq('foyer_id', foyerId).eq('cle', cle)
      : await supabase.from('produits').insert({ foyer_id: foyerId, cle, libelle: majusculeInitiale(libelle), photo: chemin });
    if (error) throw error;
  } catch (e) {
    await supprimerFichier(chemin);
    throw e;
  }
  if (ancienne && ancienne !== chemin) await supprimerFichier(ancienne);
  return chemin;
}

// Adresses signées, gardées en mémoire (valables 24 h, relues après 12 h).
const adresses = new Map<string, { url: string; le: number }>();

async function signer(chemins: string[]): Promise<void> {
  const limite = Date.now() - (DUREE_ADRESSE_S * 1000) / 2;
  const manquants = Array.from(new Set(chemins)).filter((c) => (adresses.get(c)?.le ?? 0) < limite);
  if (manquants.length === 0) return;
  const { data } = await supabase.storage.from(BUCKET_PHOTOS).createSignedUrls(manquants, DUREE_ADRESSE_S);
  (data ?? []).forEach((s: any) => {
    if (s.path && s.signedUrl) adresses.set(s.path, { url: s.signedUrl, le: Date.now() });
  });
}

// Adresses affichables des photos demandées (chemin → adresse).
export function useAdressesPhotos(chemins: (string | null | undefined)[]): Map<string, string> {
  const liste = chemins.filter((c): c is string => !!c);
  const cle = Array.from(new Set(liste)).sort().join('|');
  const lire = () => {
    const m = new Map<string, string>();
    liste.forEach((c) => {
      const a = adresses.get(c);
      if (a) m.set(c, a.url);
    });
    return m;
  };
  const [resultat, setResultat] = useState<Map<string, string>>(lire);
  useEffect(() => {
    let actif = true;
    if (!cle) {
      setResultat(new Map());
      return;
    }
    signer(cle.split('|'))
      .catch(() => {})
      .then(() => actif && setResultat(lire()));
    return () => {
      actif = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cle]);
  return resultat;
}

// Retire un fichier photo devenu inutile (produit oublié).
export const supprimerPhoto = (chemin: string | null | undefined) => supprimerFichier(chemin);
