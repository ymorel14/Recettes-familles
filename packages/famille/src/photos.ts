import { useEffect, useSyncExternalStore } from 'react';
import { Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { clientSupabase, schemaFamille } from './client';

// Photos de profil des personnes de la famille (avec ou sans compte),
// communes à toutes les apps (migration 20261003130000_photos_profil.sql).
//
// Les fiches de toutes les familles de l'utilisateur sont lues une fois (une
// seule requête, quelques dizaines de lignes), avec des adresses signées
// pour les photos : l'espace "famille-photos" est privé. Les composants
// <Avatar> s'abonnent à ce cache et se redessinent quand il change (photo
// ajoutée, autre utilisateur connecté…).

export const BUCKET_PHOTOS_FAMILLE = 'famille-photos';
// Adresses signées valables 7 jours ; le cache est relu bien avant.
const DUREE_ADRESSE_S = 7 * 24 * 60 * 60;
// Relecture au retour de l'app au premier plan, au plus toutes les 10 minutes.
const FRAICHEUR_MS = 10 * 60 * 1000;
// Photo envoyée : carré de 320 pixels, JPEG (environ 20 à 40 Ko). Assez net
// pour la grande vignette du profil, très léger pour les petites.
const COTE_PHOTO = 320;
const QUALITE_PHOTO = 0.8;

export type FichePhoto = {
  personneId: string;
  utilisateurId: string | null;
  foyerId: string | null;
  foyerNom: string | null;
  prenom: string;
  // Chemin dans l'espace de stockage, et adresse signée pour l'afficher.
  chemin: string | null;
  url: string | null;
};

let parPersonne = new Map<string, FichePhoto>();
let parUtilisateur = new Map<string, string>(); // utilisateur → personne
let version = 0;
let chargeLe = 0;
let enCours: Promise<void> | null = null;
let gestionnaire = false;
const abonnes = new Set<() => void>();

function prevenir() {
  version += 1;
  abonnes.forEach((f) => f());
}

function abonner(f: () => void) {
  abonnes.add(f);
  return () => {
    abonnes.delete(f);
  };
}

// Vide le cache (déconnexion, changement d'utilisateur).
export function oublierPhotosFamille(): void {
  parPersonne = new Map();
  parUtilisateur = new Map();
  chargeLe = 0;
  gestionnaire = false;
  prevenir();
}

// Lit les fiches et leurs photos. Sans effet si le cache est récent, sauf
// avec forcer = true (après un changement de photo).
export function chargerPhotosFamille(forcer = false): Promise<void> {
  if (enCours) return enCours;
  if (!forcer && chargeLe && Date.now() - chargeLe < FRAICHEUR_MS) return Promise.resolve();
  enCours = (async () => {
    try {
      const { data: session } = await clientSupabase().auth.getSession();
      if (!session.session) return;
      const [{ data, error }, droits] = await Promise.all([
        schemaFamille().from('personnes').select('id, utilisateur_id, foyer_id, prenom, photo, foyer:foyers(nom)'),
        schemaFamille().rpc('gere_les_photos'),
      ]);
      if (error) throw error;
      const lignes = (data ?? []) as any[];
      const chemins = lignes.map((l) => l.photo).filter((c): c is string => !!c);
      const urls = new Map<string, string>();
      if (chemins.length > 0) {
        const { data: signees } = await clientSupabase()
          .storage.from(BUCKET_PHOTOS_FAMILLE)
          .createSignedUrls(chemins, DUREE_ADRESSE_S);
        (signees ?? []).forEach((s: any) => {
          if (s.path && s.signedUrl) urls.set(s.path, s.signedUrl);
        });
      }
      const nouveauxParPersonne = new Map<string, FichePhoto>();
      const nouveauxParUtilisateur = new Map<string, string>();
      lignes.forEach((l) => {
        nouveauxParPersonne.set(l.id, {
          personneId: l.id,
          utilisateurId: l.utilisateur_id ?? null,
          foyerId: l.foyer_id ?? null,
          foyerNom: l.foyer?.nom ?? null,
          prenom: (l.prenom ?? '').trim(),
          chemin: l.photo ?? null,
          url: l.photo ? urls.get(l.photo) ?? null : null,
        });
        if (l.utilisateur_id) nouveauxParUtilisateur.set(l.utilisateur_id, l.id);
      });
      parPersonne = nouveauxParPersonne;
      parUtilisateur = nouveauxParUtilisateur;
      gestionnaire = droits.error ? false : Boolean(droits.data);
      chargeLe = Date.now();
      prevenir();
    } catch (e) {
      // Sans photos, les apps affichent simplement les initiales.
      console.warn('[Photos] chargement impossible', e);
    } finally {
      enCours = null;
    }
  })();
  return enCours;
}

export type ReperePersonne = { personneId?: string | null; utilisateurId?: string | null };

export function fichePhoto({ personneId, utilisateurId }: ReperePersonne): FichePhoto | undefined {
  const id = personneId || (utilisateurId ? parUtilisateur.get(utilisateurId) : undefined);
  return id ? parPersonne.get(id) : undefined;
}

// Toutes les fiches connues (personnes de toutes mes familles).
export function toutesLesFiches(): FichePhoto[] {
  return Array.from(parPersonne.values());
}

// Vrai si ce compte peut changer la photo de toute personne de ses familles.
export function gereLesPhotos(): boolean {
  return gestionnaire;
}

// Abonnement au cache : le composant se redessine à chaque changement, et
// le premier abonné lance le chargement.
export function usePhotosFamille(): number {
  const v = useSyncExternalStore(abonner, () => version, () => version);
  useEffect(() => {
    if (!chargeLe) chargerPhotosFamille();
  }, []);
  return v;
}

// ---------------------------------------------------------------------------
// Choix, réduction et envoi d'une photo
// ---------------------------------------------------------------------------

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

function nomAleatoire(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

// Ouvre la galerie (ou l'appareil photo) avec un recadrage carré. Renvoie
// l'adresse locale de l'image choisie, ou null si on a annulé.
export async function choisirPhotoProfil(source: 'galerie' | 'camera'): Promise<string | null> {
  const permission =
    source === 'camera'
      ? await ImagePicker.requestCameraPermissionsAsync()
      : Platform.OS === 'web'
        ? { granted: true }
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) throw new Error('Autorisez l’accès aux photos dans les réglages du téléphone.');
  const options = { mediaTypes: ['images' as const], allowsEditing: true, aspect: [1, 1] as [number, number], quality: 0.9 };
  const resultat =
    source === 'camera' ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
  if (resultat.canceled || !resultat.assets?.[0]) return null;
  return resultat.assets[0].uri;
}

// Recadre au centre en carré, réduit à COTE_PHOTO pixels et envoie la photo
// de la personne ; l'ancienne est supprimée. Le cache est relu ensuite.
export async function envoyerPhotoProfil(personneId: string, uriLocale: string): Promise<void> {
  const brute = await ImageManipulator.manipulate(uriLocale).renderAsync();
  const cote = Math.min(brute.width, brute.height);
  const contexte = ImageManipulator.manipulate(uriLocale);
  if (brute.width !== brute.height) {
    contexte.crop({
      originX: Math.floor((brute.width - cote) / 2),
      originY: Math.floor((brute.height - cote) / 2),
      width: cote,
      height: cote,
    });
  }
  if (cote > COTE_PHOTO) contexte.resize({ width: COTE_PHOTO, height: COTE_PHOTO });
  const image = await contexte.renderAsync();
  const resultat = await image.saveAsync({ compress: QUALITE_PHOTO, format: SaveFormat.JPEG, base64: true });
  if (!resultat.base64) throw new Error('Impossible de préparer la photo.');

  const chemin = `${personneId}/${nomAleatoire()}.jpg`;
  const stockage = clientSupabase().storage.from(BUCKET_PHOTOS_FAMILLE);
  const { error } = await stockage.upload(chemin, base64VersOctets(resultat.base64), {
    contentType: 'image/jpeg',
  });
  if (error) throw new Error(`Envoi de la photo impossible : ${error.message}`);
  const { data: ancienne, error: erreurFiche } = await schemaFamille().rpc('definir_photo_personne', {
    id_personne: personneId,
    chemin,
  });
  if (erreurFiche) {
    await stockage.remove([chemin]).catch(() => {});
    throw new Error(erreurFiche.message);
  }
  if (ancienne && ancienne !== chemin) await stockage.remove([ancienne as string]).catch(() => {});
  await chargerPhotosFamille(true);
}

export async function retirerPhotoProfil(personneId: string): Promise<void> {
  const { data: ancienne, error } = await schemaFamille().rpc('definir_photo_personne', {
    id_personne: personneId,
    chemin: null,
  });
  if (error) throw new Error(error.message);
  if (ancienne) {
    await clientSupabase().storage.from(BUCKET_PHOTOS_FAMILLE).remove([ancienne as string]).catch(() => {});
  }
  await chargerPhotosFamille(true);
}

// Peut-on changer la photo de cette personne ? (même règle que la base :
// la sienne, celle d'une personne sans compte de son foyer, ou toutes pour
// un gestionnaire des photos.)
export function peutChangerPhoto(fiche: FichePhoto, moi: string | null | undefined, monFoyer: string | null | undefined): boolean {
  if (!moi) return false;
  if (fiche.utilisateurId === moi) return true;
  if (!fiche.utilisateurId && fiche.foyerId && fiche.foyerId === monFoyer) return true;
  return gestionnaire;
}
