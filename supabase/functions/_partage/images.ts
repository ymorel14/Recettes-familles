// Photos et PDF reçus de l'app pour l'assistant (étape 5 : recette, planning,
// objet, lettre, ⊕ photo). L'app les réduit avant l'envoi (1 568 px au plus
// sur le grand côté, JPEG 0,8 : spécification § 3.2) ; ici on vérifie
// seulement la forme, le type et la taille, puis on en fait des blocs pour
// le modèle. Rien n'est enregistré : les images ne font que passer.
import type Anthropic from 'npm:@anthropic-ai/sdk@0.135.0';
import { ErreurIA } from './ia.ts';

export type FichierRecu = {
  type: 'image' | 'pdf';
  media_type: string;
  donnees: string; // base64, sans préfixe « data: »
};

const TYPES_IMAGE = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_IMAGE = 5 * 1024 * 1024; // 5 Mo par image (base64 ≈ 6,7 M caractères)
const MAX_PDF = 5 * 1024 * 1024; // 5 Mo pour un PDF
const MAX_TOTAL = 8 * 1024 * 1024;

function tailleOctets(base64: string): number {
  return Math.floor((base64.length * 3) / 4);
}

function propre(base64: string): string {
  // « data:image/jpeg;base64,… » accepté aussi (web).
  const i = base64.indexOf('base64,');
  return (i >= 0 ? base64.slice(i + 7) : base64).replace(/\s/g, '');
}

// Lit `corps.fichiers` (ou `corps.images`) et renvoie les blocs de contenu.
// `pdf` : accepte aussi un PDF (planning).
export function fichiersRecus(
  corps: any,
  { max = 3, pdf = false }: { max?: number; pdf?: boolean } = {}
): Anthropic.ContentBlockParam[] {
  const liste: any[] = Array.isArray(corps?.fichiers) ? corps.fichiers : Array.isArray(corps?.images) ? corps.images : [];
  if (!liste.length) throw new ErreurIA('entree', pdf ? 'Ajoutez une photo ou un PDF.' : 'Ajoutez une photo.');
  if (liste.length > max) throw new ErreurIA('entree', `${max} photo${max > 1 ? 's' : ''} au plus.`);
  let total = 0;
  return liste.map((f): Anthropic.ContentBlockParam => {
    const donnees = typeof f?.donnees === 'string' ? propre(f.donnees) : '';
    if (!donnees || !/^[A-Za-z0-9+/=]+$/.test(donnees)) throw new ErreurIA('entree', 'Fichier illisible.');
    const octets = tailleOctets(donnees);
    total += octets;
    if (total > MAX_TOTAL) throw new ErreurIA('entree', 'Fichiers trop lourds. Envoyez moins de pages.');
    const mediaType = String(f?.media_type ?? '').toLowerCase();
    if (f?.type === 'pdf' || mediaType === 'application/pdf') {
      if (!pdf) throw new ErreurIA('entree', 'Envoyez une photo (pas de PDF ici).');
      if (octets > MAX_PDF) throw new ErreurIA('entree', 'PDF trop lourd (5 Mo au plus). Envoyez plutôt une photo de la page.');
      return { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: donnees } } as any;
    }
    if (!TYPES_IMAGE.includes(mediaType)) throw new ErreurIA('entree', 'Format de photo non pris en charge (JPEG, PNG ou WebP).');
    if (octets > MAX_IMAGE) throw new ErreurIA('entree', 'Photo trop lourde.');
    return { type: 'image', source: { type: 'base64', media_type: mediaType as any, data: donnees } };
  });
}

// Le contenu d'un message : d'abord les fichiers, puis le texte (les modèles
// lisent mieux une image placée avant la question).
export function contenuAvecFichiers(fichiers: Anthropic.ContentBlockParam[], texte: string): Anthropic.ContentBlockParam[] {
  return [...fichiers, { type: 'text', text: texte }];
}
