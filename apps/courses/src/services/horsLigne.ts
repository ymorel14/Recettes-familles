import AsyncStorage from '@react-native-async-storage/async-storage';
import { changerEtat, type Article, type EtatArticle } from './courses';

// Au magasin, le réseau est souvent faible : la dernière version de chaque
// liste est gardée sur le téléphone, et les appuis faits sans réseau
// (article mis au caddie, introuvable, ressorti) attendent ici, puis sont
// envoyés dès que la connexion revient. Le dernier geste gagne.
// Clés préfixées par « courses. » (le site web commun partage le stockage
// du navigateur entre les apps).

const CLE_CACHE = (listeId: string) => `courses.cache.liste.${listeId}`;
const CLE_ATTENTE = 'courses.attente';

export type ActionEnAttente = { articleId: string; listeId: string; etat: EtatArticle; le: string };

// Erreur de réseau (pas de connexion, délai dépassé) plutôt qu'un refus de
// la base : seules celles-ci se rejouent plus tard.
export function estErreurReseau(e: unknown): boolean {
  if (e instanceof TypeError) return true;
  const message = String((e as any)?.message ?? e ?? '');
  return /fetch|network|réseau|timeout|timed out|load failed|offline/i.test(message);
}

export async function enregistrerCache<T>(listeId: string, donnees: T): Promise<void> {
  try {
    await AsyncStorage.setItem(CLE_CACHE(listeId), JSON.stringify({ ...donnees, enregistreLe: new Date().toISOString() }));
  } catch {
    // stockage plein ou indisponible : sans conséquence
  }
}

export async function lireCache<T>(listeId: string): Promise<(T & { enregistreLe: string }) | null> {
  try {
    const brut = await AsyncStorage.getItem(CLE_CACHE(listeId));
    return brut ? JSON.parse(brut) : null;
  } catch {
    return null;
  }
}

export async function lireAttente(): Promise<ActionEnAttente[]> {
  try {
    const brut = await AsyncStorage.getItem(CLE_ATTENTE);
    return brut ? (JSON.parse(brut) as ActionEnAttente[]) : [];
  } catch {
    return [];
  }
}

async function ecrireAttente(actions: ActionEnAttente[]): Promise<void> {
  try {
    if (actions.length === 0) await AsyncStorage.removeItem(CLE_ATTENTE);
    else await AsyncStorage.setItem(CLE_ATTENTE, JSON.stringify(actions));
  } catch {
    // rien à faire
  }
}

// Une seule action par article : la plus récente remplace les précédentes.
export async function mettreEnAttente(action: Omit<ActionEnAttente, 'le'>): Promise<void> {
  const actions = (await lireAttente()).filter((a) => a.articleId !== action.articleId);
  actions.push({ ...action, le: new Date().toISOString() });
  await ecrireAttente(actions);
}

// Applique les actions en attente sur des articles (affichage hors ligne).
export function appliquerAttente(articles: Article[], actions: ActionEnAttente[]): Article[] {
  if (actions.length === 0) return articles;
  const parArticle = new Map(actions.map((a) => [a.articleId, a.etat]));
  return articles.map((a) => (parArticle.has(a.id) ? { ...a, etat: parArticle.get(a.id)! } : a));
}

let rejeuEnCours: Promise<number> | null = null;

// Envoie les actions en attente, dans l'ordre. S'arrête à la première
// erreur de réseau (on réessaiera) ; une action refusée par la base
// (article supprimé entre-temps) est abandonnée. Renvoie le nombre
// d'actions restantes.
export function rejouerAttente(): Promise<number> {
  if (rejeuEnCours) return rejeuEnCours;
  rejeuEnCours = (async () => {
    const actions = await lireAttente();
    const restantes = [...actions];
    for (const action of actions) {
      try {
        await changerEtat(action.articleId, action.etat);
        restantes.shift();
      } catch (e) {
        if (estErreurReseau(e)) break;
        restantes.shift();
      }
    }
    // Des actions ont pu s'ajouter pendant l'envoi : on les garde.
    const ajoutees = (await lireAttente()).filter((a) => !actions.some((x) => x.articleId === a.articleId && x.le === a.le));
    const finales = [...restantes, ...ajoutees];
    await ecrireAttente(finales);
    return finales.length;
  })().finally(() => {
    rejeuEnCours = null;
  });
  return rejeuEnCours;
}
