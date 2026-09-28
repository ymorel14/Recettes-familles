import { supabase } from './supabase';
import { analyserLigneIngredient } from './ocr';
import { formulaireVide, nouvelleEtapeBrouillon } from './recettes';
import type { RecetteFormulaire } from './recettes';

// Import d'une recette depuis une page web (cahier des charges §6, feuille
// de route §8 — Phase 3). La récupération et l'analyse de la page se font
// côté serveur (voir supabase/functions/importer-recette) — la fonction
// Edge renvoie une extraction déjà structurée, prête à convertir en
// formulaire pré-rempli pour l'écran de vérification/correction (même
// principe que le scan, §5).
export type ResultatImportWeb = {
  titre: string;
  image: string | null;
  parts: number | null;
  tempsPreparationMinutes: number | null;
  tempsCuissonMinutes: number | null;
  ingredients: string[];
  etapes: string[];
  notes: string | null;
  // true si la page ne fournissait pas de données structurées "Recipe" :
  // seuls le titre et la photo (repli) ont pu être récupérés.
  repli: boolean;
};

export async function importerDepuisUrl(url: string): Promise<ResultatImportWeb> {
  const { data, error } = await supabase.functions.invoke('importer-recette', { body: { url } });

  if (error) {
    throw new Error(await extraireMessageErreur(error));
  }
  if (data?.erreur) {
    throw new Error(data.erreur as string);
  }

  return data as ResultatImportWeb;
}

// Même logique que pour l'OCR (voir ocr.ts) : supabase-js range toute
// réponse non-2xx de la fonction Edge dans `error` sans lire son corps —
// on va y chercher le message détaillé nous-mêmes.
async function extraireMessageErreur(error: unknown): Promise<string> {
  const contexte = (error as { context?: Response })?.context;
  if (contexte && typeof contexte.json === 'function') {
    try {
      const corps = await contexte.clone().json();
      if (corps?.erreur) return corps.erreur as string;
    } catch {
      // Corps non JSON (ex. la fonction n'existe pas encore) — repli ci-dessous.
    }
  }
  if (error instanceof Error && error.message) {
    return `Impossible d'importer cette recette (${error.message}).`;
  }
  return "Impossible d'importer cette recette. Vérifiez l'adresse et votre connexion.";
}

// Convertit le résultat de l'import en formulaire pré-rempli. La photo
// (résultat.image, une url externe) n'est pas reprise ici : elle est
// téléchargée séparément par l'écran d'import (voir ImportWebScreen) pour
// passer par le même circuit que toute autre photo — recadrage compris —
// avant d'être hébergée sur notre propre stockage à l'enregistrement.
export function resultatVersFormulaire(resultat: ResultatImportWeb, url: string): RecetteFormulaire {
  return {
    ...formulaireVide(),
    titre: resultat.titre,
    partsDefaut: resultat.parts ?? formulaireVide().partsDefaut,
    tempsPreparationMinutes: resultat.tempsPreparationMinutes,
    tempsCuissonMinutes: resultat.tempsCuissonMinutes,
    notes: resultat.notes ?? '',
    ingredients:
      resultat.ingredients.length > 0
        ? resultat.ingredients.map(analyserLigneIngredient)
        : formulaireVide().ingredients,
    etapes:
      resultat.etapes.length > 0
        ? resultat.etapes.map((texte) => ({ ...nouvelleEtapeBrouillon(), texte }))
        : formulaireVide().etapes,
    source: 'web',
    sourceUrl: url,
  };
}
