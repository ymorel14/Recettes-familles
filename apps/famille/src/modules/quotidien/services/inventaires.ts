import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { supabase } from './supabase';

// Inventaires de la maison (schéma "quotidien",
// supabase/migrations/20261012100000_quotidien_inventaires.sql) : ce que l'on
// possède, où c'est rangé (lieu, contenant), depuis quand, et les prêts.
// Tout reste dans le foyer (règles RLS). Photos dans l'espace PRIVÉ
// "quotidien-inventaires", affichées par adresses signées.

export type Inventaire = { id: string; nom: string; icone: string | null };
export type Lieu = { id: string; nom: string; photo: string | null };
export type Contenant = { id: string; nom: string; numero: number | null; lieu_id: string | null; photo: string | null };
export type Objet = {
  id: string;
  inventaire_id: string;
  nom: string;
  description: string | null;
  quantite: number;
  lieu_id: string | null;
  contenant_id: string | null;
  range_depuis: string | null;
  possede_depuis: string | null;
  photo: string | null;
};
export type Pret = {
  id: string;
  objet_id: string;
  personne_id: string | null;
  emprunteur: string;
  quantite: number;
  prete_le: string;
  retour_prevu: string | null;
  rendu_le: string | null;
  note: string | null;
};

// Tout l'inventaire du foyer en une fois (quelques centaines de lignes au
// plus) : les écrans filtrent et cherchent ensuite sur le téléphone.
export type DonneesInventaires = {
  inventaires: Inventaire[];
  lieux: Lieu[];
  contenants: Contenant[];
  objets: Objet[];
  pretsEnCours: Pret[];
};

const CHAMPS_OBJET =
  'id, inventaire_id, nom, description, quantite, lieu_id, contenant_id, range_depuis, possede_depuis, photo';
const CHAMPS_PRET = 'id, objet_id, personne_id, emprunteur, quantite, prete_le, retour_prevu, rendu_le, note';

export async function chargerInventaires(): Promise<DonneesInventaires> {
  const [inv, li, co, ob, pr] = await Promise.all([
    supabase.from('inventaires').select('id, nom, icone').order('nom'),
    supabase.from('lieux').select('id, nom, photo').order('nom'),
    supabase.from('contenants').select('id, nom, numero, lieu_id, photo').order('nom').order('numero'),
    supabase.from('objets').select(CHAMPS_OBJET).order('nom'),
    supabase.from('prets').select(CHAMPS_PRET).is('rendu_le', null).order('prete_le'),
  ]);
  for (const r of [inv, li, co, ob, pr]) if (r.error) throw r.error;
  return {
    inventaires: (inv.data as Inventaire[]) ?? [],
    lieux: (li.data as Lieu[]) ?? [],
    contenants: (co.data as Contenant[]) ?? [],
    objets: (ob.data as Objet[]) ?? [],
    pretsEnCours: (pr.data as Pret[]) ?? [],
  };
}

// ---------------------------------------------------------------------------
// Affichage
// ---------------------------------------------------------------------------

// « Boîte n° 12 », ou « Placard de l'entrée » sans numéro.
export function nomContenant(c: Pick<Contenant, 'nom' | 'numero'>): string {
  return c.numero != null ? `${c.nom} n° ${c.numero}` : c.nom;
}

// Lieu réel d'un objet : celui de son contenant, sinon le sien.
export function lieuDeObjet(o: Objet, contenants: Contenant[]): string | null {
  if (o.contenant_id) return contenants.find((c) => c.id === o.contenant_id)?.lieu_id ?? null;
  return o.lieu_id;
}

// « Garage › Boîte n° 12 », « Cave », « Sans emplacement ».
export function emplacement(o: Objet, lieux: Lieu[], contenants: Contenant[]): string {
  const contenant = o.contenant_id ? contenants.find((c) => c.id === o.contenant_id) : undefined;
  const idLieu = contenant ? contenant.lieu_id : o.lieu_id;
  const lieu = idLieu ? lieux.find((l) => l.id === idLieu) : undefined;
  const parties = [lieu?.nom, contenant ? nomContenant(contenant) : undefined].filter(Boolean);
  return parties.length ? parties.join(' › ') : 'Sans emplacement';
}

// Pour chercher sans se soucier des accents ni des majuscules.
export function normaliser(texte: string): string {
  return texte
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

// L'objet correspond-il à la recherche ? Tous les mots doivent se trouver
// dans son nom, sa description, son emplacement ou son inventaire.
export function correspond(o: Objet, recherche: string, contexte: string): boolean {
  const mots = normaliser(recherche).split(/\s+/).filter(Boolean);
  if (mots.length === 0) return true;
  const texte = normaliser(`${o.nom} ${o.description ?? ''} ${contexte}`);
  return mots.every((m) => texte.includes(m));
}

export function aujourdhuiIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// "2026-03-07" → "07/03/2026" (saisie), et l'inverse avec lireDateSaisie.
export function dateSaisie(iso: string | null): string {
  if (!iso) return '';
  const [a, m, j] = iso.split('-');
  return `${j}/${m}/${a}`;
}

export function pretEnRetard(p: Pret): boolean {
  return !p.rendu_le && !!p.retour_prevu && p.retour_prevu < aujourdhuiIso();
}

export const SUGGESTIONS_INVENTAIRES = ['Outils', 'Bricolage', 'Livres', 'Jeux de société', 'Cave à vin', 'Camping', 'Décorations de Noël', 'Vêtements rangés'];
export const SUGGESTIONS_LIEUX = ['Garage', 'Cave', 'Atelier', 'Grenier', 'Cellier', 'Abri de jardin', 'Buanderie'];
export const SUGGESTIONS_CONTENANTS = ['Boîte', 'Carton', 'Caisse', 'Placard', 'Armoire', 'Étagère', 'Tiroir'];

// ---------------------------------------------------------------------------
// Inventaires, lieux, contenants, objets
// ---------------------------------------------------------------------------

export async function creerInventaire(foyerId: string, nom: string, icone: string | null = null): Promise<string> {
  const { data, error } = await supabase
    .from('inventaires')
    .insert({ foyer_id: foyerId, nom: nom.trim(), icone })
    .select('id')
    .single();
  if (error) throw error;
  return data.id as string;
}

export async function modifierInventaire(id: string, nom: string, icone: string | null): Promise<void> {
  const { error } = await supabase.from('inventaires').update({ nom: nom.trim(), icone }).eq('id', id);
  if (error) throw error;
}

// Supprime l'inventaire, ses objets et leurs prêts, puis les photos des objets.
export async function supprimerInventaire(id: string): Promise<void> {
  const { data } = await supabase.from('objets').select('photo').eq('inventaire_id', id).not('photo', 'is', null);
  const { error } = await supabase.from('inventaires').delete().eq('id', id);
  if (error) throw error;
  await supprimerFichiers(((data as any[]) ?? []).map((l) => l.photo));
}

export type LieuSaisi = { nom: string; photo: string | null };

export async function enregistrerLieu(foyerId: string, id: string | null, l: LieuSaisi): Promise<string> {
  const ligne = { nom: l.nom.trim(), photo: l.photo };
  if (id) {
    const { error } = await supabase.from('lieux').update(ligne).eq('id', id);
    if (error) throw error;
    return id;
  }
  const { data, error } = await supabase.from('lieux').insert({ ...ligne, foyer_id: foyerId }).select('id').single();
  if (error) throw error;
  return data.id as string;
}

export async function supprimerLieu(l: Lieu): Promise<void> {
  const { error } = await supabase.from('lieux').delete().eq('id', l.id);
  if (error) throw error;
  await supprimerFichiers([l.photo]);
}

export type ContenantSaisi = { nom: string; numero: number | null; lieu_id: string | null; photo: string | null };

export async function enregistrerContenant(foyerId: string, id: string | null, c: ContenantSaisi): Promise<string> {
  const ligne = { ...c, nom: c.nom.trim() };
  if (id) {
    const { error } = await supabase.from('contenants').update(ligne).eq('id', id);
    if (error) throw error;
    return id;
  }
  const { data, error } = await supabase.from('contenants').insert({ ...ligne, foyer_id: foyerId }).select('id').single();
  if (error) throw error;
  return data.id as string;
}

export async function supprimerContenant(c: Contenant): Promise<void> {
  const { error } = await supabase.from('contenants').delete().eq('id', c.id);
  if (error) throw error;
  await supprimerFichiers([c.photo]);
}

// Numéro suivant pour un contenant de ce nom (« Boîte » n° 13 après n° 12).
export function numeroSuivant(nom: string, contenants: Contenant[]): number {
  const n = normaliser(nom);
  const numeros = contenants.filter((c) => normaliser(c.nom) === n && c.numero != null).map((c) => c.numero as number);
  return numeros.length ? Math.max(...numeros) + 1 : 1;
}

export type ObjetSaisi = Omit<Objet, 'id'>;

export async function enregistrerObjet(foyerId: string, id: string | null, o: ObjetSaisi): Promise<string> {
  const ligne = {
    ...o,
    nom: o.nom.trim(),
    description: o.description?.trim() || null,
  };
  if (id) {
    const { error } = await supabase.from('objets').update(ligne).eq('id', id);
    if (error) throw error;
    return id;
  }
  const { data, error } = await supabase.from('objets').insert({ ...ligne, foyer_id: foyerId }).select('id').single();
  if (error) throw error;
  return data.id as string;
}

export async function supprimerObjet(o: Objet): Promise<void> {
  const { error } = await supabase.from('objets').delete().eq('id', o.id);
  if (error) throw error;
  await supprimerFichiers([o.photo]);
}

// ---------------------------------------------------------------------------
// Prêts
// ---------------------------------------------------------------------------

export async function listerPretsObjet(objetId: string): Promise<Pret[]> {
  const { data, error } = await supabase
    .from('prets')
    .select(CHAMPS_PRET)
    .eq('objet_id', objetId)
    .order('prete_le', { ascending: false });
  if (error) throw error;
  return (data as Pret[]) ?? [];
}

export type PretSaisi = {
  personne_id: string | null;
  emprunteur: string;
  quantite: number;
  prete_le: string;
  retour_prevu: string | null;
  note: string | null;
};

export async function preter(foyerId: string, objetId: string, p: PretSaisi): Promise<void> {
  const { error } = await supabase.from('prets').insert({
    ...p,
    foyer_id: foyerId,
    objet_id: objetId,
    emprunteur: p.emprunteur.trim(),
    note: p.note?.trim() || null,
  });
  if (error) throw error;
}

export async function marquerRendu(idPret: string, le: string = aujourdhuiIso()): Promise<void> {
  const { error } = await supabase.from('prets').update({ rendu_le: le }).eq('id', idPret);
  if (error) throw error;
}

export async function annulerRendu(idPret: string): Promise<void> {
  const { error } = await supabase.from('prets').update({ rendu_le: null }).eq('id', idPret);
  if (error) throw error;
}

export async function supprimerPret(idPret: string): Promise<void> {
  const { error } = await supabase.from('prets').delete().eq('id', idPret);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Photos (objet, lieu, contenant)
// ---------------------------------------------------------------------------

export const BUCKET_INVENTAIRES = 'quotidien-inventaires';
// Photo envoyée : 1280 pixels au plus sur le grand côté, JPEG (150 à 300 Ko) :
// assez net pour lire une étiquette ou un numéro de boîte.
const COTE_MAX = 1280;
const QUALITE = 0.7;
const DUREE_ADRESSE_S = 24 * 60 * 60;

// Photo en cours de saisie dans un formulaire : le chemin déjà enregistré,
// une nouvelle image locale à envoyer, ou la photo retirée. Rien n'est
// envoyé avant « Enregistrer ».
export type EtatPhoto = { chemin: string | null; nouvelle: string | null; retiree: boolean };

export function etatPhoto(chemin: string | null): EtatPhoto {
  return { chemin, nouvelle: null, retiree: false };
}

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
  const grand = Math.max(brute.width, brute.height);
  if (grand > COTE_MAX) {
    contexte.resize(brute.width >= brute.height ? { width: COTE_MAX } : { height: COTE_MAX });
  }
  const image = await contexte.renderAsync();
  const resultat = await image.saveAsync({ compress: QUALITE, format: SaveFormat.JPEG, base64: true });
  if (!resultat.base64) throw new Error('Impossible de préparer la photo.');
  const chemin = `${foyerId}/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.jpg`;
  const { error } = await supabase.storage
    .from(BUCKET_INVENTAIRES)
    .upload(chemin, base64VersOctets(resultat.base64), { contentType: 'image/jpeg' });
  if (error) throw new Error(`Envoi de la photo impossible : ${error.message}`);
  return chemin;
}

async function supprimerFichiers(chemins: (string | null | undefined)[]): Promise<void> {
  const liste = chemins.filter((c): c is string => !!c);
  if (liste.length === 0) return;
  await supabase.storage.from(BUCKET_INVENTAIRES).remove(liste).then(
    () => liste.forEach((c) => adresses.delete(c)),
    () => {}
  );
}

// Enregistre une fiche avec sa photo : envoie la nouvelle photo, appelle
// `sauver(chemin)`, puis supprime l'ancienne. Si l'enregistrement échoue, la
// photo tout juste envoyée est retirée.
export async function avecPhoto<T>(foyerId: string, etat: EtatPhoto, sauver: (chemin: string | null) => Promise<T>): Promise<T> {
  let chemin = etat.retiree ? null : etat.chemin;
  let envoyee: string | null = null;
  if (etat.nouvelle) {
    envoyee = await envoyerPhoto(foyerId, etat.nouvelle);
    chemin = envoyee;
  }
  try {
    const resultat = await sauver(chemin);
    if (etat.chemin && etat.chemin !== chemin) await supprimerFichiers([etat.chemin]);
    return resultat;
  } catch (e) {
    if (envoyee) await supprimerFichiers([envoyee]);
    throw e;
  }
}

// Adresses signées, gardées en mémoire (valables 24 h, relues après 12 h).
const adresses = new Map<string, { url: string; le: number }>();

async function signer(chemins: string[]): Promise<void> {
  const limite = Date.now() - (DUREE_ADRESSE_S * 1000) / 2;
  const manquants = Array.from(new Set(chemins)).filter((c) => (adresses.get(c)?.le ?? 0) < limite);
  if (manquants.length === 0) return;
  const { data } = await supabase.storage.from(BUCKET_INVENTAIRES).createSignedUrls(manquants, DUREE_ADRESSE_S);
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
