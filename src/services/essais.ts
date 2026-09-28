import { supabase } from './supabase';
import { prenomsDe } from './profils';
import { televerserPhoto } from './recettes';
import type {
  DifficulteRessentie,
  EssaiComplet,
  NatureReponse,
  PointEssai,
  ReponsePoint,
  TempsRessenti,
  Verdict,
} from '../types/models';

// "Nos essais" : retours d'expérience des membres de la famille sur une
// recette (supabase/setup.sql, tables essais et essai_points). Un essai peut
// être rempli en deux temps : après la réalisation (difficulté, temps,
// soucis), puis après dégustation (verdict).

export const LIBELLES_VERDICT: Record<Verdict, string> = {
  1: 'Bof',
  2: 'Correcte',
  3: 'Bonne',
  4: 'À refaire !',
};

export const LIBELLES_DIFFICULTE: Record<DifficulteRessentie, string> = {
  facile: 'Facile',
  moyenne: 'Moyenne',
  difficile: 'Difficile',
};

export const LIBELLES_TEMPS: Record<TempsRessenti, string> = {
  comme_prevu: 'Temps comme prévu',
  plus_long: 'Plus long que prévu',
  plus_court: 'Plus court que prévu',
};

export type ReponseBrouillon = {
  clefId: string;
  texte: string;
  nature: NatureReponse;
};

// Un souci et ses astuces (autant que voulu).
export type PointBrouillon = {
  clefId: string;
  souci: string;
  reponses: ReponseBrouillon[];
  // Rattachement à une étape conservé pour les anciens essais (plus modifiable).
  etapeId: string | null;
};

export type EssaiFormulaire = {
  verdict: Verdict | null;
  difficulte: DifficulteRessentie | null;
  temps: TempsRessenti | null;
  commentaire: string;
  points: PointBrouillon[];
  // Photo du résultat : nouvelle (uri locale) ou déjà enregistrée (url).
  photoLocale: string | null;
  photoUrl: string | null;
};

function nouvelleClef(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function nouvelleReponse(nature: NatureReponse = 'solution'): ReponseBrouillon {
  return { clefId: nouvelleClef(), texte: '', nature };
}

export function nouveauPoint(): PointBrouillon {
  return { clefId: nouvelleClef(), souci: '', reponses: [nouvelleReponse()], etapeId: null };
}

export function essaiVide(): EssaiFormulaire {
  return {
    verdict: null,
    difficulte: null,
    temps: null,
    commentaire: '',
    points: [nouveauPoint()],
    photoLocale: null,
    photoUrl: null,
  };
}

export function essaiVersFormulaire(essai: EssaiComplet): EssaiFormulaire {
  return {
    verdict: essai.verdict,
    difficulte: essai.difficulte,
    temps: essai.temps,
    commentaire: essai.commentaire ?? '',
    points:
      essai.points.length > 0
        ? essai.points.map((p) => ({
            clefId: p.id,
            souci: p.souci ?? '',
            reponses:
              p.reponses.length > 0
                ? p.reponses.map((r) => ({ clefId: r.id, texte: r.texte, nature: r.nature }))
                : [nouvelleReponse()],
            etapeId: p.etape_id,
          }))
        : [nouveauPoint()],
    photoLocale: null,
    photoUrl: essai.photo_url,
  };
}

const SELECTION_ESSAI = '*, foyer:foyers(nom), essai_points(*, essai_point_reponses(*))';

function mettreEnFormePoints(lignes: any[]): PointEssai[] {
  return (lignes ?? [])
    .map((p: any) => ({
      ...p,
      reponses: ((p.essai_point_reponses ?? []) as ReponsePoint[]).sort((a, b) => a.ordre - b.ordre),
    }))
    .sort((a: PointEssai, b: PointEssai) => a.ordre - b.ordre);
}

// Essais d'une recette, du plus récent au plus ancien, avec le prénom de
// l'auteur et le nom de son foyer.
export async function listerEssais(recetteId: string): Promise<EssaiComplet[]> {
  const { data, error } = await supabase
    .from('essais')
    .select(SELECTION_ESSAI)
    .eq('recette_id', recetteId)
    .order('realise_le', { ascending: false })
    .order('cree_le', { ascending: false });
  if (error) throw error;
  const lignes = data ?? [];
  const prenoms = await prenomsDe(lignes.map((l: any) => l.auteur_id));
  return lignes.map((l: any) => ({
    ...l,
    points: mettreEnFormePoints(l.essai_points),
    auteurPrenom: prenoms.get(l.auteur_id) ?? null,
    foyerNom: l.foyer?.nom ?? null,
  }));
}

export async function obtenirEssai(id: string): Promise<EssaiComplet> {
  const { data, error } = await supabase
    .from('essais')
    .select(SELECTION_ESSAI)
    .eq('id', id)
    .single();
  if (error) throw error;
  const prenoms = await prenomsDe([data.auteur_id]);
  return {
    ...data,
    points: mettreEnFormePoints(data.essai_points),
    auteurPrenom: prenoms.get(data.auteur_id) ?? null,
    foyerNom: data.foyer?.nom ?? null,
  };
}

// Points à enregistrer : ceux qui ont un souci ou au moins une astuce.
function pointsARenseigner(form: EssaiFormulaire) {
  return form.points
    .map((p) => ({ ...p, reponses: p.reponses.filter((r) => r.texte.trim()) }))
    .filter((p) => p.souci.trim() || p.reponses.length > 0);
}

// Remplace tous les points (et leurs astuces) de l'essai par ceux du formulaire.
async function enregistrerPoints(essaiId: string, form: EssaiFormulaire): Promise<void> {
  const { error: erreurSuppression } = await supabase.from('essai_points').delete().eq('essai_id', essaiId);
  if (erreurSuppression) throw erreurSuppression;

  const points = pointsARenseigner(form);
  for (let index = 0; index < points.length; index += 1) {
    const point = points[index];
    const { data, error } = await supabase
      .from('essai_points')
      .insert({ essai_id: essaiId, souci: point.souci.trim() || null, etape_id: point.etapeId, ordre: index })
      .select('id')
      .single();
    if (error) throw error;
    if (point.reponses.length > 0) {
      const { error: erreurReponses } = await supabase.from('essai_point_reponses').insert(
        point.reponses.map((r, ordre) => ({ point_id: data.id, texte: r.texte.trim(), nature: r.nature, ordre }))
      );
      if (erreurReponses) throw erreurReponses;
    }
  }
}

async function urlPhoto(form: EssaiFormulaire): Promise<string | null> {
  if (form.photoLocale) return televerserPhoto(form.photoLocale);
  return form.photoUrl;
}

export async function creerEssai(recetteId: string, foyerId: string, form: EssaiFormulaire): Promise<string> {
  const photo_url = await urlPhoto(form);
  const { data, error } = await supabase
    .from('essais')
    .insert({
      recette_id: recetteId,
      foyer_id: foyerId,
      verdict: form.verdict,
      difficulte: form.difficulte,
      temps: form.temps,
      commentaire: form.commentaire.trim() || null,
      photo_url,
    })
    .select('id')
    .single();
  if (error) throw error;
  await enregistrerPoints(data.id, form);
  return data.id;
}

export async function mettreAJourEssai(essaiId: string, form: EssaiFormulaire): Promise<void> {
  const photo_url = await urlPhoto(form);
  const { error } = await supabase
    .from('essais')
    .update({
      verdict: form.verdict,
      difficulte: form.difficulte,
      temps: form.temps,
      commentaire: form.commentaire.trim() || null,
      photo_url,
      maj_le: new Date().toISOString(),
    })
    .eq('id', essaiId);
  if (error) throw error;
  await enregistrerPoints(essaiId, form);
}

export async function supprimerEssai(essaiId: string): Promise<void> {
  const { error } = await supabase.from('essais').delete().eq('id', essaiId);
  if (error) throw error;
}

// Astuces rattachées aux étapes d'une recette (pour le mode assistant) :
// étape → liste des points (souci + réponse) laissés par la famille.
export async function astucesParEtape(recetteId: string): Promise<Map<string, PointEssai[]>> {
  const { data, error } = await supabase
    .from('essai_points')
    .select('*, essai_point_reponses(*), essais!inner(recette_id)')
    .eq('essais.recette_id', recetteId)
    .not('etape_id', 'is', null);
  if (error) throw error;
  const resultat = new Map<string, PointEssai[]>();
  mettreEnFormePoints(data ?? []).forEach((p) => {
    const liste = resultat.get(p.etape_id as string) ?? [];
    liste.push(p);
    resultat.set(p.etape_id as string, liste);
  });
  return resultat;
}

// Synthèse affichée sous le titre de la recette : "Réalisée 5 fois ·
// 4 × À refaire · plutôt facile · souvent plus long que prévu".
export function syntheseEssais(essais: EssaiComplet[]): string | null {
  if (essais.length === 0) return null;
  const morceaux: string[] = [`Réalisée ${essais.length} fois`];

  const aRefaire = essais.filter((e) => e.verdict === 4).length;
  if (aRefaire > 0) morceaux.push(`${aRefaire} × À refaire`);

  const plusFrequent = <T extends string>(valeurs: (T | null)[]): T | null => {
    const comptes = new Map<T, number>();
    valeurs.forEach((v) => v && comptes.set(v, (comptes.get(v) ?? 0) + 1));
    let meilleur: T | null = null;
    let max = 0;
    comptes.forEach((n, v) => {
      if (n > max) {
        max = n;
        meilleur = v;
      }
    });
    return meilleur;
  };

  const difficulte = plusFrequent(essais.map((e) => e.difficulte));
  if (difficulte) morceaux.push(`plutôt ${LIBELLES_DIFFICULTE[difficulte].toLowerCase()}`);

  const temps = plusFrequent(essais.map((e) => e.temps));
  if (temps === 'plus_long') morceaux.push('souvent plus long que prévu');
  if (temps === 'plus_court') morceaux.push('souvent plus rapide que prévu');

  return morceaux.join(' · ');
}
