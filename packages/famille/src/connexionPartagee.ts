import { Linking } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { clientSupabase } from './client';
import { appParScheme, obtenirAppCourante, type AppFamille } from './appsFamille';

// Passage de connexion entre les apps de la famille sur un même téléphone
// (« Continuer avec mon compte »). Une app ne peut pas lire la session d'une
// autre : l'app qui n'est pas connectée (B) ouvre une app déjà connectée
// (A), qui demande l'accord de la personne puis renvoie à B un code de
// connexion à usage unique (fonction Edge transfert-session). B l'échange
// contre sa propre session.
//
// Liens échangés (scheme de chaque app, voir appsFamille.ts) :
//   A ← B   <scheme A>://partager-connexion?pour=<scheme B>&etat=<aléa>
//   B ← A   <scheme B>://connexion-partagee?etat=<aléa>&jeton=<code>
//           <scheme B>://connexion-partagee?etat=<aléa>&erreur=refus|non_connecte|echec
// L'« état » (aléa gardé par B) garantit que B n'accepte que la réponse à
// SA demande.

const CLE_ETAT = 'famille.connexionPartagee.etat';
// Une demande vaut 10 minutes : au-delà, on recommence.
const DUREE_DEMANDE_MS = 10 * 60 * 1000;

export type LienConnexion =
  | { genre: 'demande'; demandeur: AppFamille; etat: string }
  | { genre: 'reponse'; etat: string; jeton: string | null; erreur: string | null };

function alea(): string {
  const octets = new Uint8Array(16);
  const c: any = (globalThis as any).crypto;
  if (c?.getRandomValues) c.getRandomValues(octets);
  else for (let i = 0; i < octets.length; i++) octets[i] = Math.floor(Math.random() * 256);
  return Array.from(octets, (o) => o.toString(16).padStart(2, '0')).join('');
}

// Lit un lien reçu par l'app ; null s'il ne concerne pas la connexion.
export function lireLienConnexion(url: string | null | undefined): LienConnexion | null {
  if (!url) return null;
  let adresse: URL;
  try {
    adresse = new URL(url);
  } catch {
    return null;
  }
  const moi = obtenirAppCourante();
  if (!moi || adresse.protocol !== `${moi.scheme}:`) return null;
  // « scheme://chemin?… » : selon la plateforme, « chemin » arrive comme
  // hôte ou comme début du chemin.
  const chemin = (adresse.host || adresse.pathname.replace(/^\/+/, '')).replace(/\/+$/, '');
  const p = adresse.searchParams;
  const etat = p.get('etat') ?? '';
  if (!/^[0-9a-f]{32}$/.test(etat)) return null;

  if (chemin === 'partager-connexion') {
    const demandeur = appParScheme(p.get('pour'));
    if (!demandeur || demandeur.id === moi.id) return null;
    return { genre: 'demande', demandeur, etat };
  }
  if (chemin === 'connexion-partagee') {
    return { genre: 'reponse', etat, jeton: p.get('jeton'), erreur: p.get('erreur') };
  }
  return null;
}

// --- Côté app pas encore connectée (B) ---

// Ouvre l'app « cible » pour lui demander la connexion. Faux si l'app n'est
// pas installée sur ce téléphone.
export async function demanderConnexion(cible: AppFamille): Promise<boolean> {
  const moi = obtenirAppCourante();
  if (!moi) throw new Error('App non configurée : configurerFamille(supabase, { app }).');
  const etat = alea();
  await AsyncStorage.setItem(CLE_ETAT, JSON.stringify({ etat, le: Date.now() }));
  try {
    await Linking.openURL(`${cible.scheme}://partager-connexion?pour=${moi.scheme}&etat=${etat}`);
    return true;
  } catch {
    await AsyncStorage.removeItem(CLE_ETAT).catch(() => {});
    return false;
  }
}

// Termine la connexion avec la réponse de l'autre app. Renvoie un message
// d'erreur, ou null si la session est ouverte.
export async function recevoirConnexion(lien: Extract<LienConnexion, { genre: 'reponse' }>): Promise<string | null> {
  let attendu: { etat: string; le: number } | null = null;
  try {
    attendu = JSON.parse((await AsyncStorage.getItem(CLE_ETAT)) ?? 'null');
  } catch {
    attendu = null;
  }
  if (!attendu || attendu.etat !== lien.etat || Date.now() - attendu.le > DUREE_DEMANDE_MS) {
    return 'Cette demande de connexion a expiré. Recommencez depuis l’écran de connexion.';
  }
  await AsyncStorage.removeItem(CLE_ETAT).catch(() => {});

  if (lien.erreur === 'refus') return 'Connexion refusée dans l’autre app.';
  if (lien.erreur === 'non_connecte') return 'L’autre app n’est pas connectée non plus : connectez-vous ici avec votre email.';
  if (lien.erreur || !lien.jeton) return 'La connexion n’a pas pu être transmise. Réessayez, ou connectez-vous avec votre email.';

  const auth = clientSupabase().auth;
  let { error } = await auth.verifyOtp({ token_hash: lien.jeton, type: 'email' });
  if (error) ({ error } = await auth.verifyOtp({ token_hash: lien.jeton, type: 'magiclink' }));
  if (error) return 'Ce code de connexion n’est plus valable. Recommencez depuis l’écran de connexion.';
  return null;
}

// --- Côté app déjà connectée (A) ---

function repondre(demande: Extract<LienConnexion, { genre: 'demande' }>, suite: string) {
  return Linking.openURL(`${demande.demandeur.scheme}://connexion-partagee?etat=${demande.etat}&${suite}`);
}

// La personne accepte : on fabrique le code et on rouvre l'app demandeuse.
export async function accorderConnexion(demande: Extract<LienConnexion, { genre: 'demande' }>): Promise<void> {
  const { data, error } = await clientSupabase().functions.invoke('transfert-session', { body: {} });
  const jeton: string | undefined = (data as any)?.jeton;
  if (error || !jeton) {
    await repondre(demande, 'erreur=echec').catch(() => {});
    throw new Error('Impossible de transmettre la connexion. Vérifiez la connexion internet et réessayez.');
  }
  await repondre(demande, `jeton=${encodeURIComponent(jeton)}`);
}

export async function refuserConnexion(
  demande: Extract<LienConnexion, { genre: 'demande' }>,
  raison: 'refus' | 'non_connecte' = 'refus'
): Promise<void> {
  await repondre(demande, `erreur=${raison}`).catch(() => {});
}
