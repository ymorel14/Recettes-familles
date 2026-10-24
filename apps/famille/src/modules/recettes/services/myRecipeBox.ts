import { unzipSync, strFromU8 } from 'fflate';
import { analyserLigneIngredient, extrairePremierNombre } from './ocr';
import { formulaireVide, nouvelleEtapeBrouillon } from './recettes';
import type { RecetteFormulaire, IngredientBrouillon, EtapeBrouillon } from './recettes';
import { normaliserTexte } from '../utils/texte';

// Lecture d'une sauvegarde de l'application « My Recipe Box » (RecetteTek),
// fichier .rtk. Un .rtk est une archive ZIP qui contient :
//   - un ou plusieurs fichiers recipes_<n>.json : la liste des recettes ;
//   - les photos des recettes (fichiers .png/.jpg nommés par un identifiant) ;
//   - dans une sauvegarde complète, éventuellement categories.json.
// Chaque recette y est décrite par des champs texte : title, quantity
// ("4 personnes"), preparationTime / cookingTime / totalTime ("15",
// "20 mn", "1 h 30"), ingredients (une ligne par ingrédient), instructions
// (étapes séparées par des lignes vides, souvent précédées d'un numéro
// seul : "1\nÉmincez…"), description, notes, nutrition, url, pictures
// (chemins sur le téléphone d'origine : seul le nom du fichier compte).
//
// Rien ici ne touche à la base : ce module transforme la sauvegarde en
// formulaires de recette (les mêmes que pour le scan ou l'import web),
// enregistrés ensuite par services/importMyRecipeBox.ts.

type RecetteBrute = Record<string, unknown>;

export type RecetteImportable = {
  // Identifiant dans la sauvegarde (uuid de My Recipe Box, sinon rang).
  cle: string;
  formulaire: RecetteFormulaire;
  // Nom, dans l'archive, de la photo de couverture (null si aucune).
  fichierPhoto: string | null;
  // Résumé pour la liste de choix ("8 ingrédients · 5 étapes").
  resume: string;
};

export type SauvegardeMyRecipeBox = {
  recettes: RecetteImportable[];
  // Contenu brut de l'archive, gardé pour en extraire les photos une à une
  // au moment de l'enregistrement (plutôt que toutes d'un coup en mémoire).
  archive: Uint8Array;
};

function texte(valeur: unknown): string {
  return typeof valeur === 'string' ? valeur.replace(/\r\n?/g, '\n').trim() : '';
}

// "15" → 15 ; "20 mn", "20 min" → 20 ; "1 h 30", "1h30" → 90 ; "2 h" → 120 ;
// "PT1H30M" → 90 ; texte sans durée ("Lidl.fr") → null.
export function dureeEnMinutes(valeur: unknown): number | null {
  const brut = texte(valeur).replace(/[  ]/g, ' ').toLowerCase();
  if (!brut) return null;
  if (/^\d+$/.test(brut)) return Number(brut) || null;
  const iso = brut.match(/^pt(?:(\d+)h)?(?:(\d+)m)?/);
  if (iso && (iso[1] || iso[2])) return Number(iso[1] ?? 0) * 60 + Number(iso[2] ?? 0) || null;
  const heures = brut.match(/(\d+)\s*h(?:eures?)?\s*(\d+)?/);
  if (heures) return Number(heures[1]) * 60 + Number(heures[2] ?? 0) || null;
  const minutes = brut.match(/(\d+)\s*(?:mn|min)/);
  if (minutes) return Number(minutes[1]) || null;
  return null;
}

// Intertitres de la liste d'ingrédients ("Ingrédients :", "Pour la pâte :") :
// ignorés, comme pour le scan.
function estIntertitre(ligne: string): boolean {
  return /:\s*$/.test(ligne) || /^ingr[ée]dients?$/i.test(ligne);
}

export function ingredientsDepuisTexte(brut: string): IngredientBrouillon[] {
  return brut
    .split('\n')
    .map((ligne) => ligne.trim())
    .filter((ligne) => ligne && !estIntertitre(ligne))
    .map((ligne) => {
      // Fourchette ("1 à 2 pommes de terre", "10 à 12 aiguillettes") : la
      // ligne reste entière dans le libellé plutôt que de devenir
      // « 1 » + « à 2 pommes de terre ».
      const sansPuce = ligne.replace(/^[-–—•*·▢□☐]+\s*/, '');
      if (/^\d+(?:[.,]\d+)?\s*(?:à|-|–)\s*\d/.test(sansPuce)) {
        return { ...analyserLigneIngredient(''), libelle: sansPuce };
      }
      return analyserLigneIngredient(ligne);
    })
    .filter((ingredient) => ingredient.libelle.trim());
}

// Ligne qui n'est qu'un repère d'étape : "1", "2.", "Etape: 1", "Étape 3".
const REPERE_ETAPE = /^(?:(?:[ée]tape|step)\s*:?\s*\d*|\d+)\s*[.):]?$/i;
// Restes de boutons de partage copiés avec la page d'origine.
const BOUTONS_PARTAGE = /^(?:facebook|pinterest|whatsapp|x|twitter|e-?mail|imprimer|partager)$/i;

export function etapesDepuisTexte(brut: string): EtapeBrouillon[] {
  // Étapes séparées par des lignes vides ; à défaut, une étape par ligne.
  const paragraphes = /\n\s*\n/.test(brut) ? brut.split(/\n\s*\n/) : brut.split('\n');
  return paragraphes
    .map((paragraphe) => {
      const lignes = paragraphe
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l && !REPERE_ETAPE.test(l) && !BOUTONS_PARTAGE.test(l));
      if (lignes.length === 0) return '';
      lignes[0] = lignes[0]
        .replace(/^(?:[ée]tape|step)\s*\d+\s*[:.)–-]\s*/i, '')
        .replace(/^(?:[-•*]|\d+\s*[.)])\s*/, '');
      // Petit intertitre en tête ("Pour finir") : gardé, suivi de « : ».
      if (lignes.length > 1 && lignes[0].length <= 40 && !/[.!?…]$/.test(lignes[0])) {
        return `${lignes[0].replace(/\s*:$/, '')} : ${lignes.slice(1).join(' ')}`;
      }
      return lignes.join(' ');
    })
    .map((t) => t.replace(/\s{2,}/g, ' ').trim())
    .filter(Boolean)
    .map((t) => ({ ...nouvelleEtapeBrouillon(), texte: t }));
}

// Catégories d'une recette, quand la sauvegarde en donne (sauvegarde
// complète) : liste de noms ou d'objets { title } / { name }.
function categoriesDe(recette: RecetteBrute): string[] {
  const liste = recette.categories;
  if (!Array.isArray(liste)) return [];
  return liste
    .map((c) => (typeof c === 'string' ? c : texte((c as any)?.title ?? (c as any)?.name)))
    .map((c) => c.trim())
    .filter(Boolean);
}

function nomFichier(chemin: string): string {
  return chemin.split(/[\\/]/).pop() ?? chemin;
}

export function recetteVersImportable(
  recette: RecetteBrute,
  rang: number,
  fichiers: Set<string>
): RecetteImportable | null {
  const titre = texte(recette.title);
  if (!titre) return null;

  let preparation = dureeEnMinutes(recette.preparationTime);
  let cuisson = dureeEnMinutes(recette.cookingTime);
  const total = dureeEnMinutes(recette.totalTime);
  let totalSeul: number | null = null;
  // Temps total seul : réparti si l'autre temps est connu, sinon noté.
  if (total != null) {
    if (preparation == null && cuisson != null && total > cuisson) preparation = total - cuisson;
    else if (cuisson == null && preparation != null && total > preparation) cuisson = total - preparation;
    else if (preparation == null && cuisson == null) totalSeul = total;
  }

  const ingredients = ingredientsDepuisTexte(texte(recette.ingredients));
  const etapes = etapesDepuisTexte(texte(recette.instructions));

  const notes = [
    texte(recette.description),
    texte(recette.notes),
    totalSeul != null ? `Temps total : ${totalSeul} min` : '',
    texte(recette.cookware) ? `Ustensiles : ${texte(recette.cookware)}` : '',
    texte(recette.nutrition) ? `Valeurs nutritionnelles :\n${texte(recette.nutrition)}` : '',
    texte(recette.video) ? `Vidéo : ${texte(recette.video)}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');

  const url = texte(recette.url);
  const photos = Array.isArray(recette.pictures) ? (recette.pictures as unknown[]).map(texte).filter(Boolean) : [];
  const fichierPhoto = photos.map(nomFichier).find((nom) => fichiers.has(nom)) ?? null;
  const parts = extrairePremierNombre(texte(recette.quantity));

  const vide = formulaireVide();
  return {
    cle: texte(recette.uuid) || String(rang),
    fichierPhoto,
    resume: [
      `${ingredients.length} ingrédient${ingredients.length > 1 ? 's' : ''}`,
      `${etapes.length} étape${etapes.length > 1 ? 's' : ''}`,
      fichierPhoto ? 'photo' : '',
    ]
      .filter(Boolean)
      .join(' · '),
    formulaire: {
      ...vide,
      titre,
      partsDefaut: parts && parts > 0 && parts <= 100 ? parts : vide.partsDefaut,
      tempsPreparationMinutes: preparation,
      tempsCuissonMinutes: cuisson,
      notes,
      nomsCategories: categoriesDe(recette),
      ingredients: ingredients.length > 0 ? ingredients : vide.ingredients,
      etapes: etapes.length > 0 ? etapes : vide.etapes,
      // 'web' garde le lien vers la page d'origine, affiché sur la fiche.
      source: url ? 'web' : 'manuelle',
      sourceUrl: url || null,
    },
  };
}

// Ouvre l'archive et en lit les recettes (sans extraire les photos).
export function lireSauvegarde(archive: Uint8Array): SauvegardeMyRecipeBox {
  let jsons: Record<string, Uint8Array>;
  const fichiers = new Set<string>();
  try {
    jsons = unzipSync(archive, {
      filter: (f) => {
        fichiers.add(nomFichier(f.name));
        return /(^|\/)recipes?_?\d*\.json$/i.test(f.name);
      },
    });
  } catch {
    throw new Error("Ce fichier n'est pas une sauvegarde My Recipe Box lisible (archive .rtk attendue).");
  }
  const noms = Object.keys(jsons).sort((a, b) => a.localeCompare(b, 'fr', { numeric: true }));
  if (noms.length === 0) {
    throw new Error("Aucune recette trouvée dans ce fichier : est-ce bien une sauvegarde My Recipe Box ?");
  }

  const brutes: RecetteBrute[] = [];
  noms.forEach((nom) => {
    try {
      const contenu = JSON.parse(strFromU8(jsons[nom]));
      if (Array.isArray(contenu)) brutes.push(...contenu);
      else if (Array.isArray(contenu?.recipes)) brutes.push(...contenu.recipes);
    } catch {
      // Fichier illisible : on garde les recettes des autres.
    }
  });

  const recettes = brutes
    .map((r, i) => recetteVersImportable(r, i, fichiers))
    .filter((r): r is RecetteImportable => r !== null)
    .sort((a, b) => a.formulaire.titre.localeCompare(b.formulaire.titre, 'fr'));
  if (recettes.length === 0) throw new Error('Cette sauvegarde ne contient aucune recette.');
  return { recettes, archive };
}

// Photo de couverture d'une recette, extraite de l'archive au dernier moment.
export function extrairePhoto(archive: Uint8Array, fichier: string): Uint8Array | null {
  try {
    const trouve = unzipSync(archive, { filter: (f) => nomFichier(f.name) === fichier });
    return Object.values(trouve)[0] ?? null;
  } catch {
    return null;
  }
}

// Clé de comparaison de deux titres (accents, casse et espaces ignorés).
export function cleTitre(titre: string): string {
  return normaliserTexte(titre).replace(/[^a-z0-9]+/g, ' ').trim();
}
