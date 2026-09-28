import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';
import { supabase } from './supabase';
import { nouvelIngredientBrouillon, nouvelleEtapeBrouillon } from './recettes';
import type { IngredientBrouillon, EtapeBrouillon } from './recettes';

// Numérisation d'une recette existante (cahier des charges §5, feuille de
// route §7 — Phase 2) : l'utilisateur dessine lui-même, sur la photo, la
// zone à associer à chaque champ (Titre, Ingrédients, Étapes, Parts,
// Préparation, Cuisson) — voir ScanRecetteScreen. Chaque zone dessinée est
// recadrée côté app puis envoyée à la fonction Edge Supabase "ocr-recette",
// qui appelle Google Cloud Vision côté serveur (voir
// supabase/functions/ocr-recette) — la clé d'API n'est jamais exposée dans
// l'app. Le texte reconnu pour une zone est concaténé au texte déjà présent
// pour ce champ, librement corrigeable ensuite ("mode édition").

export type BlocTexte = { id: string; texte: string };

// Photo → texte base64. Dans un navigateur, la photo est une adresse
// "data:" ou "blob:" (expo-file-system n'y existe pas).
async function lireEnBase64(uri: string): Promise<string> {
  if (Platform.OS !== 'web') return FileSystem.readAsStringAsync(uri, { encoding: 'base64' });
  const fichier = await (await fetch(uri)).blob();
  const dataUrl: string = await new Promise((resolve, reject) => {
    const lecteur = new FileReader();
    lecteur.onload = () => resolve(String(lecteur.result));
    lecteur.onerror = () => reject(new Error('Impossible de lire la photo.'));
    lecteur.readAsDataURL(fichier);
  });
  return dataUrl.slice(dataUrl.indexOf(',') + 1);
}

export async function reconnaitreTexte(uriPhotoLocale: string): Promise<BlocTexte[]> {
  const base64 = await lireEnBase64(uriPhotoLocale);

  const { data, error } = await supabase.functions.invoke('ocr-recette', {
    body: { image: base64 },
  });

  if (error) {
    throw new Error(await extraireMessageErreur(error));
  }
  if (data?.erreur) {
    throw new Error(data.erreur as string);
  }

  return (data?.blocs ?? []) as BlocTexte[];
}

// Variante pour une zone dessinée par l'utilisateur (photo déjà recadrée sur
// un seul champ) : on n'a plus besoin des blocs séparés de Google Vision,
// juste du texte reconnu dans la zone, ligne à ligne.
export async function reconnaitreTexteZone(uriPhotoRecadree: string): Promise<string> {
  const blocs = await reconnaitreTexte(uriPhotoRecadree);
  return blocs.map((bloc) => bloc.texte).join('\n').trim();
}

// Texte d'une étape scannée : les retours à la ligne de l'imprimé ne sont que
// la largeur de la page, on les remplace par des espaces (et on recolle les
// mots coupés en fin de ligne : "mélan-\nger" → "mélanger").
export function texteScanneEnEtape(texte: string): string {
  return texte
    .replace(/([A-Za-zÀ-ÿœæ])-\s*\n\s*([a-zà-ÿœæ])/g, '$1$2')
    .replace(/\s*\n+\s*/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

// La fonction Edge renvoie un corps JSON détaillé même en cas d'échec
// ({ erreur: "..." }), mais supabase-js range toute réponse non-2xx dans
// `error` sans en lire le corps : on va le chercher nous-mêmes pour éviter
// d'afficher un message générique qui masque la vraie cause (clé Google
// Vision absente, fonction non déployée, quota dépassé, etc.).
async function extraireMessageErreur(error: unknown): Promise<string> {
  const contexte = (error as { context?: Response })?.context;
  if (contexte && typeof contexte.json === 'function') {
    try {
      const corps = await contexte.clone().json();
      if (corps?.erreur) return corps.erreur as string;
    } catch {
      // Corps non JSON (ex. la fonction n'existe pas encore) : on retombe
      // sur le message générique ci-dessous.
    }
  }
  if (error instanceof Error && error.message) {
    return `Impossible de lire le texte de la photo (${error.message}).`;
  }
  return "Impossible de lire le texte de la photo. Vérifiez votre connexion et réessayez.";
}

// Unités reconnues pour découper une ligne d'ingrédient en quantité / unité /
// libellé (repli : toute la ligne devient le libellé, à corriger à la main —
// cahier des charges §5 : "l'OCR n'étant jamais fiable à 100 %"). Les unités
// composées (ex. "cuillère à café") doivent être listées avant leurs formes
// courtes : le tri par longueur ci-dessous s'en charge automatiquement.
type UniteConnue = { motifs: string[]; canonique: string };

const UNITES_CONNUES: UniteConnue[] = [
  { motifs: ['cuillères à café', 'cuillère à café', 'cuillères à c.', 'cuillère à c.', 'c. à café', 'c à café', 'c.à.c', 'càc', 'cac'], canonique: 'c. à café' },
  { motifs: ['cuillères à soupe', 'cuillère à soupe', 'cuillères à s.', 'cuillère à s.', 'c. à soupe', 'c à soupe', 'c.à.s', 'càs', 'cas'], canonique: 'c. à soupe' },
  { motifs: ['kilogrammes', 'kilogramme', 'kilos', 'kilo', 'kg'], canonique: 'kg' },
  { motifs: ['milligrammes', 'milligramme', 'mg'], canonique: 'mg' },
  { motifs: ['grammes', 'gramme', 'gr', 'g'], canonique: 'g' },
  { motifs: ['millilitres', 'millilitre', 'ml'], canonique: 'ml' },
  { motifs: ['centilitres', 'centilitre', 'cl'], canonique: 'cl' },
  { motifs: ['décilitres', 'décilitre', 'dl'], canonique: 'dl' },
  { motifs: ['litres', 'litre', 'l'], canonique: 'l' },
  { motifs: ['pincées', 'pincée'], canonique: 'pincée' },
  { motifs: ['sachets', 'sachet'], canonique: 'sachet' },
  { motifs: ['tranches', 'tranche'], canonique: 'tranche' },
  { motifs: ['gousses', 'gousse'], canonique: 'gousse' },
  { motifs: ['verres', 'verre'], canonique: 'verre' },
  { motifs: ['tasses', 'tasse'], canonique: 'tasse' },
  { motifs: ['pots', 'pot'], canonique: 'pot' },
  { motifs: ['boîtes', 'boites', 'boîte', 'boite'], canonique: 'boîte' },
  { motifs: ['bottes', 'botte'], canonique: 'botte' },
  { motifs: ['bouquets', 'bouquet'], canonique: 'bouquet' },
  { motifs: ['brins', 'brin'], canonique: 'brin' },
  { motifs: ['branches', 'branche'], canonique: 'branche' },
  { motifs: ['morceaux', 'morceau'], canonique: 'morceau' },
  { motifs: ['feuilles', 'feuille'], canonique: 'feuille' },
  { motifs: ['zestes', 'zeste'], canonique: 'zeste' },
  { motifs: ['traits', 'trait'], canonique: 'trait' },
  { motifs: ['filets', 'filet'], canonique: 'filet' },
  { motifs: ['bols', 'bol'], canonique: 'bol' },
  { motifs: ['pièces', 'pièce', 'unités', 'unité'], canonique: 'pièce' },
  { motifs: ['noix'], canonique: 'noix' },
];

const MOTIFS_UNITES = UNITES_CONNUES
  .flatMap(({ motifs, canonique }) => motifs.map((motif) => ({ motif: motif.toLowerCase(), canonique })))
  .sort((a, b) => b.motif.length - a.motif.length);

// Cherche une unité connue en tête de `reste` (ex. "cuillères à café de sel"),
// avec vérification de frontière de mot pour éviter qu'une unité courte comme
// "l" ne matche par erreur le début de "litre" (déjà couvert plus haut, mais
// aussi de mots sans rapport comme "légumes").
function detecterUnite(reste: string): { unite: string; libelle: string } | null {
  const resteMinuscule = reste.toLowerCase();
  for (const { motif, canonique } of MOTIFS_UNITES) {
    if (!resteMinuscule.startsWith(motif)) continue;
    const caractereSuivant = reste.charAt(motif.length);
    if (caractereSuivant && /[a-zà-ÿ]/i.test(caractereSuivant)) continue;
    const libelle = reste.slice(motif.length).trim().replace(/^(de |d')/i, '').trim();
    return { unite: canonique, libelle };
  }
  return null;
}

const FRACTIONS_UNICODE: Record<string, string> = {
  '½': '0,5', '⅓': '0,33', '⅔': '0,67', '¼': '0,25', '¾': '0,75',
};

export function analyserLigneIngredient(ligneBrute: string): IngredientBrouillon {
  const brouillon = nouvelIngredientBrouillon();
  // Puces et cases à cocher des listes copiées depuis un site (▢ 200 g…),
  // espaces insécables ("200\u00a0g") ramenées à des espaces simples.
  const ligne = ligneBrute
    .replace(/[\u00a0\u202f\t]/g, ' ')
    .replace(/^[-–—•*·▢□☐☑✓✔]+\s*/, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  if (!ligne) return brouillon;

  const ligneNormalisee = ligne.replace(/[½⅓⅔¼¾]/g, (c) => FRACTIONS_UNICODE[c] ?? c);

  const correspondanceQuantite = ligneNormalisee.match(/^(\d+(?:[.,]\d+)?(?:\s*\/\s*\d+)?)\s*(.*)$/);
  if (!correspondanceQuantite) {
    return { ...brouillon, libelle: ligne };
  }

  const [, quantiteBrute, resteApresQuantite] = correspondanceQuantite;
  // Une fraction ("1/2") doit être convertie en décimal : laissée telle
  // quelle, elle n'est pas un nombre valide une fois enregistrée (voir
  // `creerRecette`/`mettreAJourRecette`, qui font `Number(quantite)`) et la
  // ligne se retrouve avec une quantité vide plutôt que 0,5.
  const correspondanceFraction = quantiteBrute.match(/^(\d+)\s*\/\s*(\d+)$/);
  const quantite = correspondanceFraction
    ? String(Math.round((Number(correspondanceFraction[1]) / Number(correspondanceFraction[2])) * 100) / 100).replace('.', ',')
    : quantiteBrute.replace('.', ',');
  const reste = resteApresQuantite.trim();

  const resultatUnite = detecterUnite(reste);
  if (resultatUnite) {
    return { ...brouillon, quantite, unite: resultatUnite.unite, libelle: resultatUnite.libelle || ligne };
  }

  return { ...brouillon, quantite, unite: '', libelle: reste || ligne };
}

export function decouperIngredients(texte: string): IngredientBrouillon[] {
  return texte
    .split(/\r?\n/)
    .map((ligne) => ligne.trim())
    // Lignes vides et intertitres ("Ingrédients", "Pour la pâte :") ignorés.
    .filter((ligne) => ligne && !/:\s*$/.test(ligne) && !/^ingr[ée]dients?$/i.test(ligne))
    .map(analyserLigneIngredient)
    .filter((ingredient) => ingredient.libelle.trim());
}

export function decouperEtapes(texte: string): EtapeBrouillon[] {
  return texte
    .split('\n')
    .map((ligne) =>
      ligne
        .replace(/^\s*(?:[-•*]|\d+[.)])\s*/, '')
        .replace(/\s{2,}/g, ' ')
        .trim()
    )
    .filter(Boolean)
    .map((texteEtape) => ({ ...nouvelleEtapeBrouillon(), texte: texteEtape }));
}

export function extrairePremierNombre(texte: string): number | null {
  const correspondance = texte.match(/\d+/);
  return correspondance ? Number(correspondance[0]) : null;
}
