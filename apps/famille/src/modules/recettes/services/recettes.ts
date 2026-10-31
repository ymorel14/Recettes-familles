import * as FileSystem from 'expo-file-system/legacy';
import { decode } from 'base64-arraybuffer';
import { Platform } from 'react-native';
import { supabase, BUCKET_PHOTOS_RECETTES } from './supabase';
import { trouverOuCreerCategorie } from './categories';
import { normaliserTexte } from '../utils/texte';
import type {
  RecetteComplete,
  Ingredient,
  Etape,
  Categorie,
  PhotoRecette,
  RecetteLiee,
  ElementRecette,
  ChoixVariantes,
} from '../types/models';

// clefId : identifiant local (côté formulaire, avant enregistrement) utilisé
// pour référencer un ingrédient dans le texte d'une étape via le jeton
// {{ingredient:<clefId>}} — résolu en "quantité + unité + libellé" au moment
// de l'affichage (rappel des quantités, cahier des charges §8).
export type IngredientBrouillon = {
  clefId: string;
  libelle: string;
  quantite: string;
  unite: string;
  // Élément auquel appartient l'ingrédient (voir ElementBrouillon).
  elementClef?: string | null;
};

// Élément de la recette dans le formulaire (ex. "La pâte"). Son clefId est
// aussi son identifiant en base, comme pour les étapes. Un formulaire a
// toujours au moins un élément ; s'il n'y en a qu'un, sans nom, la recette
// est enregistrée sans élément (recette d'un seul tenant).
// varianteDe : clefId de l'élément principal que celui-ci peut remplacer
// (variante au choix, ex. pâte sablée à la place de la pâte brisée) ; absent
// ou null pour un élément principal. Dans la liste, chaque élément principal
// est suivi de ses variantes (voir normaliserElements).
export type ElementBrouillon = { clefId: string; nom: string; varianteDe?: string | null };
// recetteLieeId : id d'une autre recette du foyer que cette étape référence
// (ex. "faire une pâte brisée" pointe vers la recette de la pâte brisée —
// §8/§4) ; recetteLieeTitre n'est là que pour l'affichage immédiat dans le
// formulaire (choix fait dans le sélecteur), sans avoir à recharger la
// recette liée — non persisté tel quel, seul recetteLieeId est enregistré.
export type EtapeBrouillon = {
  clefId: string;
  elementClef?: string | null;
  texte: string;
  recetteLieeId: string | null;
  recetteLieeTitre: string | null;
};

// Une photo du formulaire : soit une photo déjà en ligne (édition, url
// inchangée), soit une photo tout juste choisie sur l'appareil (uriLocale,
// à téléverser à l'enregistrement) — jamais les deux à la fois. L'ordre du
// tableau `RecetteFormulaire.photos` fait foi : la première est la
// couverture (voir `televerserPhotosDuFormulaire`).
export type PhotoBrouillon = { clefId: string; uriLocale: string | null; urlExistante: string | null };

export type RecetteFormulaire = {
  titre: string;
  photos: PhotoBrouillon[];
  partsDefaut: number;
  tempsPreparationMinutes: number | null;
  tempsCuissonMinutes: number | null;
  notes: string;
  // Note personnelle de 1 à 4 étoiles (null = pas encore notée) — retour
  // utilisateur, en plus du champ "notes" en texte libre.
  note: number | null;
  nomsCategories: string[];
  ingredients: IngredientBrouillon[];
  etapes: EtapeBrouillon[];
  // Éléments de la recette (au moins un, voir ElementBrouillon).
  elements?: ElementBrouillon[];
  // Origine de la recette (§5 — 'scan' pour une recette créée via l'écran
  // de numérisation, cahier des charges §5 / feuille de route §7 ; 'web'
  // pour une recette importée depuis une page web, §6).
  source: 'manuelle' | 'scan' | 'web';
  // Lien vers la page d'origine (import web uniquement), conservé et
  // affiché sur la fiche recette (§6 : "conservation d'un lien vers la page
  // d'origine").
  sourceUrl: string | null;
  // Recette surprise (voir `etatSurprise`) : à qui elle est cachée, et date
  // de révélation automatique facultative (AAAA-MM-JJ).
  cachee?: 'moi' | 'foyer' | null;
  reveleeLe?: string | null;
};

function nouvelleClefLocale(): string {
  return Math.random().toString(36).slice(2, 10);
}

// Identifiant définitif (UUID v4) attribué dès la création d'une étape dans
// le formulaire, et réutilisé comme identifiant en base : une étape garde le
// même identifiant quand on la modifie ou la déplace, ce qui préserve ce qui
// s'y rattache (astuces des essais de la famille, voir services/essais.ts).
function nouvelIdentifiantEtape(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export function nouvelIngredientBrouillon(): IngredientBrouillon {
  return { clefId: nouvelleClefLocale(), libelle: '', quantite: '', unite: '' };
}

export function nouvelleEtapeBrouillon(): EtapeBrouillon {
  return { clefId: nouvelIdentifiantEtape(), texte: '', recetteLieeId: null, recetteLieeTitre: null };
}

export function nouvellePhotoBrouillonLocale(uriLocale: string): PhotoBrouillon {
  return { clefId: nouvelleClefLocale(), uriLocale, urlExistante: null };
}

export function nouvelElementBrouillon(nom = '', varianteDe: string | null = null): ElementBrouillon {
  return { clefId: nouvelIdentifiantEtape(), nom, varianteDe };
}

// Range les éléments : chaque élément principal suivi de ses variantes.
// Une variante dont le principal n'existe plus (ou est lui-même une
// variante) redevient un élément principal.
export function ordonnerElements(elements: ElementBrouillon[]): ElementBrouillon[] {
  const principaux = new Set(elements.filter((e) => !e.varianteDe).map((e) => e.clefId));
  const propres = elements.map((e) =>
    e.varianteDe && principaux.has(e.varianteDe) && e.varianteDe !== e.clefId ? e : { ...e, varianteDe: null }
  );
  return propres
    .filter((e) => !e.varianteDe)
    .flatMap((p) => [p, ...propres.filter((v) => v.varianteDe === p.clefId)]);
}

// Garantit au moins un élément, et que chaque ingrédient/étape pointe vers
// un élément existant (sinon : le premier). Utile pour les formulaires
// venant du scan ou de l'import web, construits sans élément.
export function normaliserElements(form: RecetteFormulaire): RecetteFormulaire {
  const elements = ordonnerElements(
    form.elements && form.elements.length > 0 ? form.elements : [nouvelElementBrouillon()]
  );
  const clefs = new Set(elements.map((e) => e.clefId));
  const premier = elements[0].clefId;
  const rattacher = <T extends { elementClef?: string | null }>(item: T): T =>
    item.elementClef && clefs.has(item.elementClef) ? item : { ...item, elementClef: premier };
  return {
    ...form,
    elements,
    ingredients: form.ingredients.map(rattacher),
    etapes: form.etapes.map(rattacher),
  };
}

// La recette est-elle découpée en éléments ? (plus d'un, ou un seul nommé)
export function aDesElements(form: RecetteFormulaire): boolean {
  const elements = form.elements ?? [];
  return elements.length > 1 || (elements.length === 1 && elements[0].nom.trim().length > 0);
}

export function formulaireVide(): RecetteFormulaire {
  return {
    titre: '',
    photos: [],
    partsDefaut: 4,
    tempsPreparationMinutes: null,
    tempsCuissonMinutes: null,
    notes: '',
    note: null,
    nomsCategories: [],
    ingredients: [nouvelIngredientBrouillon()],
    etapes: [nouvelleEtapeBrouillon()],
    elements: [nouvelElementBrouillon()],
    source: 'manuelle',
    sourceUrl: null,
    cachee: null,
    reveleeLe: null,
  };
}

// `etapes!etapes_recette_id_fkey` désambiguïse explicitement quelle clé
// étrangère utiliser pour "recettes -> etapes" : depuis l'ajout de
// `recette_liee_id` (lien vers une sous-recette, §8/§4), la table `etapes`
// a DEUX clés étrangères vers `recettes` (`recette_id` et
// `recette_liee_id`), et PostgREST refuse sinon de deviner laquelle utiliser
// ("more than one relationship was found").
const SELECTION_RECETTE_COMPLETE =
  'id, foyer_id, titre, photo_url, parts_defaut, temps_preparation_minutes, temps_cuisson_minutes, notes, note, source, source_url, cree_par, cree_le, maj_le, cachee, cachee_par, revelee_le, ingredients(*), etapes!etapes_recette_id_fkey(*, recette_liee:recette_liee_id(id, titre)), recette_categories(categories(*)), photos_recette(*), elements(*), foyer:foyers(id, nom), essais(verdict)';

// Pseudo-catégorie de l'écran d'accueil qui regroupe les recettes sans
// aucune catégorie (sinon introuvables dans l'app).
export const ID_SANS_CATEGORIE = '__sans_categorie__';

// Liste légère (id + titre seulement) des recettes du foyer, pour le
// sélecteur "Lier à une recette" du formulaire (§8/§4) — exclut la recette
// en cours d'édition (pas de lien d'une recette vers elle-même).
export async function listerRecettesPourLiaison(
  foyerId: string,
  exclureRecetteId?: string
): Promise<RecetteLiee[]> {
  let requete = supabase.from('recettes').select('id, titre').eq('foyer_id', foyerId).order('titre', { ascending: true });
  if (exclureRecetteId) requete = requete.neq('id', exclureRecetteId);
  const { data, error } = await requete;
  if (error) throw error;
  return (data ?? []) as RecetteLiee[];
}

// Portée d'une liste de recettes : celles de son foyer, ou celles de toute
// la famille ACTIVE (recettes des autres foyers en lecture seule). La base
// laisse lire les recettes de toutes ses familles : on filtre donc sur les
// foyers de la famille active (foyersFamille, fourni par useAuth).
export type PorteeRecettes = 'foyer' | 'famille';

export async function listerRecettes(
  foyerId: string,
  portee: PorteeRecettes = 'foyer',
  foyersFamille: string[] = []
): Promise<RecetteComplete[]> {
  let requete = supabase.from('recettes').select(SELECTION_RECETTE_COMPLETE);
  if (portee === 'foyer') requete = requete.eq('foyer_id', foyerId);
  else requete = requete.in('foyer_id', Array.from(new Set([foyerId, ...foyersFamille])));
  const { data, error } = await requete.order('titre', { ascending: true });

  if (error) throw error;

  return (data ?? []).map((ligne: any) => mettreEnForme(ligne)).filter((r: RecetteComplete) => !suppressionsEnAttente.has(r.id));
}

// Suppression différée (retour de test R-8) : la recette disparaît tout de
// suite des listes, un message propose « Annuler », et elle n'est vraiment
// supprimée en base qu'à la fin du délai.
export const DELAI_ANNULATION_SUPPRESSION = 6000; // durée du message avec « Annuler »
const suppressionsEnAttente = new Map<string, ReturnType<typeof setTimeout>>();

export function programmerSuppressionRecette(recetteId: string, onEchec?: (e: unknown) => void): void {
  annulerSuppressionRecette(recetteId);
  const minuteur = setTimeout(() => {
    supprimerRecette(recetteId)
      .catch((e) => onEchec?.(e))
      .finally(() => suppressionsEnAttente.delete(recetteId));
  }, DELAI_ANNULATION_SUPPRESSION);
  suppressionsEnAttente.set(recetteId, minuteur);
  prevenirSuppressions();
}

export function annulerSuppressionRecette(recetteId: string): void {
  const minuteur = suppressionsEnAttente.get(recetteId);
  if (minuteur) clearTimeout(minuteur);
  if (suppressionsEnAttente.delete(recetteId)) prevenirSuppressions();
}

// Les écrans de liste se rechargent quand une suppression est programmée ou
// annulée (la recette disparaît, puis réapparaît après « Annuler »).
const abonnesSuppressions = new Set<() => void>();
function prevenirSuppressions(): void {
  abonnesSuppressions.forEach((f) => f());
}
export function surChangementSuppressions(rappel: () => void): () => void {
  abonnesSuppressions.add(rappel);
  return () => {
    abonnesSuppressions.delete(rappel);
  };
}

export async function obtenirRecette(id: string): Promise<RecetteComplete> {
  const { data, error } = await supabase
    .from('recettes')
    .select(SELECTION_RECETTE_COMPLETE)
    .eq('id', id)
    .single();

  if (error) throw error;
  return mettreEnForme(data);
}

function mettreEnForme(ligne: any): RecetteComplete {
  return {
    ...ligne,
    ingredients: ((ligne.ingredients ?? []) as Ingredient[]).sort((a, b) => a.ordre - b.ordre),
    etapes: ((ligne.etapes ?? []) as Etape[]).sort((a, b) => a.ordre - b.ordre),
    categories: ((ligne.recette_categories ?? []) as unknown as { categories: Categorie }[]).map(
      (l) => l.categories
    ),
    photos: ((ligne.photos_recette ?? []) as PhotoRecette[]).sort((a, b) => a.ordre - b.ordre),
    elements: ((ligne.elements ?? []) as ElementRecette[]).sort((a, b) => a.ordre - b.ordre),
    foyer: ligne.foyer ?? null,
    essais: ligne.essais ?? [],
  };
}

// Ingrédients et étapes regroupés par élément, dans l'ordre des éléments
// (pour l'affichage). Recette non découpée : un seul groupe sans nom.
export type GroupeElement = {
  id: string | null;
  nom: string | null;
  ingredients: Ingredient[];
  etapes: Etape[];
};

export function groupesParElement(recette: RecetteComplete): GroupeElement[] {
  const elements = recette.elements ?? [];
  if (elements.length === 0) {
    return [{ id: null, nom: null, ingredients: recette.ingredients, etapes: recette.etapes }];
  }
  const ids = new Set(elements.map((e) => e.id));
  const groupes: GroupeElement[] = [];
  const sansElement = {
    ingredients: recette.ingredients.filter((i) => !i.element_id || !ids.has(i.element_id)),
    etapes: recette.etapes.filter((e) => !e.element_id || !ids.has(e.element_id)),
  };
  if (sansElement.ingredients.length > 0 || sansElement.etapes.length > 0) {
    groupes.push({ id: null, nom: null, ...sansElement });
  }
  elements.forEach((el) =>
    groupes.push({
      id: el.id,
      nom: el.nom.trim() || null,
      ingredients: recette.ingredients.filter((i) => i.element_id === el.id),
      etapes: recette.etapes.filter((e) => e.element_id === el.id),
    })
  );
  return groupes;
}

// ---------------------------------------------------------------------------
// Variantes d'éléments (ex. tarte au citron : « Curd au citron » OU
// « Appareil à l'orange »). Une recette ne se cuisine qu'avec UNE version
// de chaque élément : la fiche, le mode assistant et la liste de courses
// travaillent sur la recette « appliquée » (appliquerVariantes).
// ---------------------------------------------------------------------------

// Élément principal et ses variantes, dans l'ordre (principal d'abord).
export type ElementAVariantes = { principal: ElementRecette; versions: ElementRecette[] };

// Éléments de la recette qui ont au moins une variante. Seuls les éléments
// présents comptent : sur une recette déjà appliquée, il n'en reste aucun.
export function elementsAVariantes(recette: Pick<RecetteComplete, 'elements'>): ElementAVariantes[] {
  const elements = recette.elements ?? [];
  const ids = new Set(elements.map((e) => e.id));
  return elements
    .filter((e) => !e.variante_de || !ids.has(e.variante_de))
    .map((principal) => ({
      principal,
      versions: [principal, ...elements.filter((v) => v.variante_de === principal.id && v.id !== principal.id)],
    }))
    .filter((g) => g.versions.length > 1);
}

// Recette ne gardant, pour chaque élément à variantes, que la version
// choisie (par défaut la principale) : ses ingrédients et étapes, et
// l'élément lui-même à la place du principal. Les autres versions
// disparaissent, ingrédients et étapes compris. Sans variante, la recette
// est renvoyée telle quelle (fonction sans effet si on l'applique deux fois).
export function appliquerVariantes<R extends RecetteComplete>(recette: R, choix: ChoixVariantes = {}): R {
  const groupes = elementsAVariantes(recette);
  if (groupes.length === 0) return recette;
  const ecartes = new Set<string>();
  const remplacement = new Map<string, ElementRecette>();
  groupes.forEach(({ principal, versions }) => {
    const retenue = versions.find((v) => v.id === choix[principal.id]) ?? principal;
    versions.forEach((v) => v.id !== retenue.id && ecartes.add(v.id));
    // La version retenue prend la place (l'ordre) du principal.
    remplacement.set(retenue.id, { ...retenue, ordre: principal.ordre });
  });
  const garde = (x: { element_id?: string | null }) => !x.element_id || !ecartes.has(x.element_id);
  return {
    ...recette,
    elements: recette.elements
      .filter((e) => !ecartes.has(e.id))
      .map((e) => remplacement.get(e.id) ?? e)
      .sort((a, b) => a.ordre - b.ordre),
    ingredients: recette.ingredients.filter(garde),
    etapes: recette.etapes.filter(garde),
  };
}

// Choix de variantes nettoyé : seulement les éléments qui existent encore
// et une version qui leur appartient, et sans les choix « principal »
// (inutiles, c'est la valeur par défaut).
export function choixValides(recette: Pick<RecetteComplete, 'elements'>, choix?: ChoixVariantes | null): ChoixVariantes {
  const resultat: ChoixVariantes = {};
  if (!choix) return resultat;
  elementsAVariantes(recette).forEach(({ principal, versions }) => {
    const id = choix[principal.id];
    if (id && id !== principal.id && versions.some((v) => v.id === id)) resultat[principal.id] = id;
  });
  return resultat;
}

// Note affichée d'une recette : moyenne des verdicts de ses essais (1 à 4),
// arrondie au demi-point ; à défaut d'essai goûté, l'ancienne note saisie
// sur la recette. Renvoie aussi le nombre d'avis pris en compte.
export function noteMoyenne(recette: RecetteComplete): { note: number | null; nbAvis: number } {
  const verdicts = (recette.essais ?? [])
    .map((e) => e.verdict)
    .filter((v): v is number => typeof v === 'number');
  if (verdicts.length === 0) return { note: recette.note ?? null, nbAvis: 0 };
  const moyenne = verdicts.reduce((a, b) => a + b, 0) / verdicts.length;
  return { note: Math.round(moyenne * 2) / 2, nbAvis: verdicts.length };
}

// "★★★½" pour une note sur 4 (demi-étoile possible).
export function etoilesDeNote(note: number): string {
  const pleines = Math.floor(note);
  const demi = note - pleines >= 0.5;
  return '★'.repeat(pleines) + (demi ? '½' : '') + '☆'.repeat(4 - pleines - (demi ? 1 : 0));
}

export async function televerserPhoto(uriLocale: string): Promise<string> {
  let extension: string;
  let donnees: ArrayBuffer;
  if (Platform.OS === 'web') {
    // Navigateur : la photo choisie est une adresse "data:" ou "blob:", lue
    // avec fetch (expo-file-system n'existe pas sur le web).
    const fichier = await (await fetch(uriLocale)).blob();
    extension = (fichier.type.split('/')[1] || 'jpeg').replace('jpeg', 'jpg');
    donnees = await fichier.arrayBuffer();
  } else {
    extension = uriLocale.split('.').pop()?.toLowerCase() ?? 'jpg';
    donnees = decode(await FileSystem.readAsStringAsync(uriLocale, { encoding: 'base64' }));
  }
  const nomFichier = `${Date.now()}-${Math.round(Math.random() * 1e6)}.${extension}`;

  const { error } = await supabase.storage
    .from(BUCKET_PHOTOS_RECETTES)
    .upload(nomFichier, donnees, {
      contentType: `image/${extension === 'jpg' ? 'jpeg' : extension}`,
    });
  if (error) throw error;

  const { data } = supabase.storage.from(BUCKET_PHOTOS_RECETTES).getPublicUrl(nomFichier);
  return data.publicUrl;
}

// Téléverse les nouvelles photos du formulaire (celles avec une `uriLocale`)
// et renvoie la liste finale des urls, dans l'ordre du formulaire — l'ordre
// choisi par l'utilisateur (première = couverture, §4) fait foi.
async function televerserPhotosDuFormulaire(form: RecetteFormulaire): Promise<string[]> {
  const urls: string[] = [];
  for (const photo of form.photos) {
    urls.push(photo.uriLocale ? await televerserPhoto(photo.uriLocale) : (photo.urlExistante as string));
  }
  return urls;
}

// Remplace intégralement les photos enregistrées d'une recette par la liste
// donnée (même logique de remplacement complet que pour les ingrédients et
// étapes, voir le commentaire sur `mettreAJourRecette`), et recopie la
// première dans `recettes.photo_url` pour les écrans qui n'affichent que la
// couverture (accueil, catégories, liste de recettes, choix assistant).
async function enregistrerPhotos(recetteId: string, urls: string[]): Promise<void> {
  const { error: erreurSuppression } = await supabase.from('photos_recette').delete().eq('recette_id', recetteId);
  if (erreurSuppression) throw erreurSuppression;

  if (urls.length > 0) {
    const { error: erreurInsertion } = await supabase
      .from('photos_recette')
      .insert(urls.map((url, index) => ({ recette_id: recetteId, url, ordre: index })));
    if (erreurInsertion) throw erreurInsertion;
  }

  const { error: erreurCouverture } = await supabase
    .from('recettes')
    .update({ photo_url: urls[0] ?? null })
    .eq('id', recetteId);
  if (erreurCouverture) throw erreurCouverture;
}

export async function creerRecette(foyerId: string, utilisateurId: string, form: RecetteFormulaire): Promise<string> {
  const urlsPhotos = await televerserPhotosDuFormulaire(form);

  const { data: recetteCreee, error: erreurRecette } = await supabase
    .from('recettes')
    .insert({
      foyer_id: foyerId,
      titre: form.titre.trim(),
      photo_url: urlsPhotos[0] ?? null,
      parts_defaut: form.partsDefaut,
      temps_preparation_minutes: form.tempsPreparationMinutes,
      temps_cuisson_minutes: form.tempsCuissonMinutes,
      notes: form.notes.trim() || null,
      note: form.note,
      source: form.source,
      source_url: form.sourceUrl,
      cree_par: utilisateurId,
      // Cachée dès sa création : jamais visible, même un instant, du reste
      // de la famille.
      cachee: form.cachee ?? null,
      revelee_le: form.cachee ? form.reveleeLe ?? null : null,
    })
    .select()
    .single();
  if (erreurRecette) throw erreurRecette;

  const recetteId = recetteCreee.id as string;
  if (urlsPhotos.length > 0) {
    const { error: erreurPhotos } = await supabase
      .from('photos_recette')
      .insert(urlsPhotos.map((url, index) => ({ recette_id: recetteId, url, ordre: index })));
    if (erreurPhotos) throw erreurPhotos;
  }
  await inserreIngredientsEtapesEtCategories(recetteId, form);
  return recetteId;
}

// Modifie une recette existante (accessible depuis la fiche recette via le
// crayon ✎ à côté du titre — voir RecetteDetailScreen). Plutôt que de tenter
// un diff fin des ingrédients/étapes/catégories, on remplace intégralement
// ces listes : plus simple et sans risque d'incohérence, au prix de nouveaux
// identifiants d'ingrédients à chaque modification — sans conséquence,
// puisque les jetons {{ingredient:...}} des étapes sont réécrits juste après
// avec ces nouveaux identifiants (voir `inserreIngredientsEtapesEtCategories`).
export async function mettreAJourRecette(recetteId: string, form: RecetteFormulaire): Promise<void> {
  const urlsPhotos = await televerserPhotosDuFormulaire(form);

  const { error: erreurRecette } = await supabase
    .from('recettes')
    .update({
      titre: form.titre.trim(),
      parts_defaut: form.partsDefaut,
      temps_preparation_minutes: form.tempsPreparationMinutes,
      temps_cuisson_minutes: form.tempsCuissonMinutes,
      notes: form.notes.trim() || null,
      note: form.note,
      cachee: form.cachee ?? null,
      revelee_le: form.cachee ? form.reveleeLe ?? null : null,
    })
    .eq('id', recetteId);
  if (erreurRecette) throw erreurRecette;

  await enregistrerPhotos(recetteId, urlsPhotos);

  // Rien n'est supprimé d'avance : les anciens ingrédients ne sont retirés
  // qu'une fois les nouveaux enregistrés, et les catégories sont remplacées
  // en premier (voir inserreIngredientsEtapesEtCategories). Une erreur en
  // cours de route (réseau…) ne peut plus laisser une recette sans
  // catégorie — donc invisible dans l'app — ni sans ingrédients.
  const { data: anciens, error: erreurAnciens } = await supabase
    .from('ingredients')
    .select('id')
    .eq('recette_id', recetteId);
  if (erreurAnciens) throw erreurAnciens;

  await inserreIngredientsEtapesEtCategories(recetteId, form, {
    anciensIngredients: (anciens ?? []).map((i: any) => i.id as string),
  });
}

// ---------------------------------------------------------------------------
// Recettes surprises
// ---------------------------------------------------------------------------

// Date du jour (heure locale) au format AAAA-MM-JJ.
function aujourdhuiIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export type EtatSurprise = { portee: 'moi' | 'foyer'; reveleeLe: string | null };

// La recette est-elle (encore) une surprise ? null si elle est visible de
// toute la famille : jamais cachée, révélée, ou date de révélation atteinte.
// Seules les personnes qui la voient malgré tout (celle qui l'a cachée, ou
// son foyer) reçoivent une recette cachée : la base filtre pour les autres.
export function etatSurprise(recette: Pick<RecetteComplete, 'cachee' | 'revelee_le'>): EtatSurprise | null {
  if (!recette.cachee) return null;
  if (recette.revelee_le && recette.revelee_le <= aujourdhuiIso()) return null;
  return { portee: recette.cachee, reveleeLe: recette.revelee_le ?? null };
}

// Rend la recette visible de toute la famille, tout de suite.
export async function revelerRecette(recetteId: string): Promise<void> {
  const { error } = await supabase.from('recettes').update({ cachee: null, revelee_le: null }).eq('id', recetteId);
  if (error) throw error;
}

// Supprime définitivement une recette (et, en cascade côté base, ses
// ingrédients, étapes et rattachements à des catégories). Réservée au
// créateur de la recette — contrôle appliqué côté interface (bouton visible
// seulement pour lui, voir RecetteDetailScreen) ET côté base via la
// politique RLS "Supprimer sa propre recette" (supabase/setup.sql), qui
// refusera silencieusement la suppression pour quiconque d'autre.
export async function supprimerRecette(recetteId: string): Promise<void> {
  const { error } = await supabase.from('recettes').delete().eq('id', recetteId);
  if (error) throw error;
}

// Insère les ingrédients, étapes et catégories d'un formulaire pour une
// recette déjà créée (utilisé à la création, et après avoir vidé ces listes
// lors d'une modification — voir `creerRecette` / `mettreAJourRecette`).
async function inserreIngredientsEtapesEtCategories(
  recetteId: string,
  formBrut: RecetteFormulaire,
  // Modification : ingrédients de la version précédente, supprimés une fois
  // les nouveaux enregistrés.
  { anciensIngredients = [] }: { anciensIngredients?: string[] } = {}
): Promise<void> {
  // Éléments : enregistrés seulement si la recette est vraiment découpée
  // (sinon aucun élément, recette d'un seul tenant). Ingrédients et étapes
  // sont remis dans l'ordre des éléments.
  const normalise = normaliserElements(formBrut);
  const avecElements = aDesElements(normalise);
  const elements = normalise.elements as ElementBrouillon[];
  const rangElement = new Map(elements.map((e, i) => [e.clefId, i]));
  const trierParElement = <T extends { elementClef?: string | null }>(items: T[]): T[] =>
    items
      .map((item, i) => ({ item, i }))
      .sort(
        (a, b) =>
          (rangElement.get(a.item.elementClef ?? '') ?? 0) - (rangElement.get(b.item.elementClef ?? '') ?? 0) ||
          a.i - b.i
      )
      .map((x) => x.item);
  const form: RecetteFormulaire = {
    ...normalise,
    ingredients: trierParElement(normalise.ingredients),
    etapes: trierParElement(normalise.etapes),
  };
  const idElement = (clef?: string | null) => (avecElements ? clef ?? null : null);

  // Catégories en premier : c'est par elles que la recette apparaît dans
  // l'app. On ajoute les nouvelles avant de retirer celles qui ne sont plus
  // cochées, si bien que la recette n'est jamais sans catégorie.
  const categories = await Promise.all(form.nomsCategories.map((nom) => trouverOuCreerCategorie(nom)));
  const idsCategories = Array.from(new Set(categories.map((c) => c.id)));
  if (idsCategories.length > 0) {
    const { error } = await supabase
      .from('recette_categories')
      .upsert(
        idsCategories.map((id) => ({ recette_id: recetteId, categorie_id: id })),
        { onConflict: 'recette_id,categorie_id', ignoreDuplicates: true }
      );
    if (error) throw error;
    const { error: erreurRetrait } = await supabase
      .from('recette_categories')
      .delete()
      .eq('recette_id', recetteId)
      .not('categorie_id', 'in', `(${idsCategories.join(',')})`);
    if (erreurRetrait) throw erreurRetrait;
  }

  if (avecElements) {
    // La colonne variante_de (migration 20261002110000) n'est envoyée que si
    // la recette a des variantes : une base sans cette migration enregistre
    // donc toujours les recettes découpées en éléments.
    const avecVariantes = elements.some((e) => e.varianteDe);
    const { error } = await supabase.from('elements').upsert(
      elements.map((e, ordre) => ({
        id: e.clefId,
        recette_id: recetteId,
        nom: e.nom.trim(),
        ordre,
        ...(avecVariantes ? { variante_de: e.varianteDe ?? null } : {}),
      }))
    );
    if (error) throw error;
  }

  // Insertion des ingrédients un par un (plutôt qu'en lot) pour récupérer
  // l'id réel de chacun et pouvoir résoudre les jetons {{ingredient:clefId}}
  // saisis dans les étapes avant de les enregistrer.
  const correspondanceClefVersId = new Map<string, string>();
  const ingredientsValides = form.ingredients.filter((i) => i.libelle.trim());
  for (let index = 0; index < ingredientsValides.length; index += 1) {
    const brouillon = ingredientsValides[index];
    const { data: ingredientCree, error } = await supabase
      .from('ingredients')
      .insert({
        recette_id: recetteId,
        libelle: brouillon.libelle.trim(),
        quantite: brouillon.quantite.trim() ? Number(brouillon.quantite.replace(',', '.')) : null,
        unite: brouillon.unite.trim() || null,
        ordre: index,
        element_id: idElement(brouillon.elementClef),
      })
      .select()
      .single();
    if (error) throw error;
    correspondanceClefVersId.set(brouillon.clefId, ingredientCree.id as string);
  }

  // Anciens ingrédients (modification) : retirés maintenant que les
  // nouveaux sont enregistrés.
  if (anciensIngredients.length > 0) {
    const { error } = await supabase.from('ingredients').delete().in('id', anciensIngredients);
    if (error) throw error;
  }

  // Étapes : chacune garde son identifiant (clefId = id en base). Les étapes
  // retirées du formulaire (ou vidées) sont supprimées ; les autres sont
  // créées ou mises à jour, avec leur nouvelle position (ordre).
  const etapesValides = form.etapes.filter((e) => e.texte.trim());
  let suppression = supabase.from('etapes').delete().eq('recette_id', recetteId);
  if (etapesValides.length > 0) {
    suppression = suppression.not('id', 'in', `(${etapesValides.map((e) => e.clefId).join(',')})`);
  }
  const { error: erreurSuppressionEtapes } = await suppression;
  if (erreurSuppressionEtapes) throw erreurSuppressionEtapes;

  if (etapesValides.length > 0) {
    const { error } = await supabase.from('etapes').upsert(
      etapesValides.map((e, index) => ({
        id: e.clefId,
        recette_id: recetteId,
        ordre: index,
        texte: resoudreClefsLocales(e.texte.trim(), correspondanceClefVersId),
        recette_liee_id: e.recetteLieeId,
        element_id: idElement(e.elementClef),
      }))
    );
    if (error) throw error;
  }

  // Éléments retirés du formulaire (ou tous, si la recette n'est plus
  // découpée) : supprimés une fois ingrédients et étapes mis à jour.
  let suppressionElements = supabase.from('elements').delete().eq('recette_id', recetteId);
  if (avecElements) {
    suppressionElements = suppressionElements.not('id', 'in', `(${elements.map((e) => e.clefId).join(',')})`);
  }
  const { error: erreurSuppressionElements } = await suppressionElements;
  if (erreurSuppressionElements) throw erreurSuppressionElements;
}

// Convertit une recette déjà enregistrée en formulaire pré-rempli, pour
// l'écran de modification (route CreationRecette avec un `recetteId` en
// paramètre — voir RecetteFormScreen). Les ingrédients reprennent leur
// identifiant réel comme `clefId` : les jetons {{ingredient:<id>}} déjà
// présents dans les étapes continuent ainsi de se résoudre correctement dans
// l'aperçu du formulaire (voir `resoudreEtapePourApercu`) sans aucune
// réécriture — ils ne sont réécrits qu'à l'enregistrement, une fois les
// ingrédients réinsérés avec de nouveaux identifiants (`mettreAJourRecette`).
export function recetteVersFormulaire(recette: RecetteComplete): RecetteFormulaire {
  return normaliserElements({
    elements: (recette.elements ?? []).map((e) => ({ clefId: e.id, nom: e.nom, varianteDe: e.variante_de ?? null })),
    titre: recette.titre,
    photos: recette.photos.map((p) => ({ clefId: p.id, uriLocale: null, urlExistante: p.url })),
    partsDefaut: recette.parts_defaut,
    tempsPreparationMinutes: recette.temps_preparation_minutes,
    tempsCuissonMinutes: recette.temps_cuisson_minutes,
    notes: recette.notes ?? '',
    note: recette.note ?? null,
    nomsCategories: recette.categories.map((c) => c.nom),
    ingredients:
      recette.ingredients.length > 0
        ? recette.ingredients.map((i) => ({
            clefId: i.id,
            elementClef: i.element_id ?? null,
            libelle: i.libelle,
            quantite: i.quantite != null ? String(i.quantite).replace('.', ',') : '',
            unite: i.unite ?? '',
          }))
        : [nouvelIngredientBrouillon()],
    etapes:
      recette.etapes.length > 0
        ? recette.etapes.map((e) => ({
            // Identifiant de l'étape en base, conservé tel quel (voir
            // nouvelIdentifiantEtape).
            clefId: e.id,
            elementClef: e.element_id ?? null,
            texte: e.texte,
            recetteLieeId: e.recette_liee_id,
            recetteLieeTitre: e.recette_liee?.titre ?? null,
          }))
        : [nouvelleEtapeBrouillon()],
    source: recette.source,
    sourceUrl: recette.source_url,
    cachee: recette.cachee ?? null,
    reveleeLe: recette.revelee_le ?? null,
  });
}

// Remplace {{ingredient:clefLocale}} par {{ingredient:idReel}} juste avant
// l'enregistrement des étapes (une fois les ingrédients réellement créés).
// Le motif inclut les tirets (`[\w-]+`, pas seulement `[a-z0-9]+`) car en
// modification `clefLocale` est l'identifiant réel (UUID) de l'ingrédient
// existant — voir `recetteVersFormulaire`.
function resoudreClefsLocales(texte: string, correspondance: Map<string, string>): string {
  return texte.replace(/\{\{ingredient:([\w-]+)\}\}/g, (jeton, clef) => {
    const idReel = correspondance.get(clef);
    return idReel ? `{{ingredient:${idReel}}}` : jeton;
  });
}

// Résout un ingrédient en "quantité unité libellé" (ou juste son libellé
// sans quantité renseignée), avec le facteur d'échelle éventuel utilisé pour
// recalculer selon le nombre de parts choisi (§8).
export function resoudreLibelleIngredient(ingredient: Ingredient, facteurEchelle: number): string {
  if (ingredient.quantite == null) return ingredient.libelle;
  let valeur = ingredient.quantite * facteurEchelle;
  // Ingrédient compté sans unité (œufs, citrons…) : arrondi à la demi-unité
  // près une fois la recette adaptée ("2,25 œufs" → "2,5 œufs").
  if (facteurEchelle !== 1 && !ingredient.unite?.trim()) valeur = Math.max(0.5, Math.round(valeur * 2) / 2);
  const quantiteAjustee = arrondirJoli(valeur);
  return [quantiteAjustee, ingredient.unite, ingredient.libelle].filter(Boolean).join(' ');
}

// Mots trop courants pour servir de "mot-clé" d'un ingrédient (ex. dans
// "Poudre à lever", on ne veut pas chercher le mot "à").
// Repérage des ingrédients cités dans une étape : services/ingredientsCites.ts
// (verbes, familles d'épices et d'herbes, pluriels — retour de test R-12).
export { detecterIngredientsCites } from './ingredientsCites';

// Remplace {{ingredient:<id>}} par "quantité unité libellé", pour l'affichage
// (fiche recette, mode assistant) — avec un facteur d'échelle optionnel
// quand l'utilisateur ajuste le nombre de parts (§8).
export function resoudreEtapePourAffichage(
  texte: string,
  ingredients: Ingredient[],
  facteurEchelle = 1
): string {
  return texte.replace(/\{\{ingredient:([\w-]+)\}\}/g, (jeton, id) => {
    const ingredient = ingredients.find((i) => i.id === id);
    return ingredient ? resoudreLibelleIngredient(ingredient, facteurEchelle) : jeton;
  });
}

function arrondirJoli(valeur: number): string {
  const arrondi = Math.round(valeur * 100) / 100;
  return arrondi.toString().replace('.', ',');
}
