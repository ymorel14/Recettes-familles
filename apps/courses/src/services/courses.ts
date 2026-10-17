import { supabase, schemaFamille } from './supabase';
import { cleProduit, majusculeInitiale, normaliserTexte } from '../utils/texte';
import { RAYONS_DEPART, RAYON_AUTRES, devinerRayonDictionnaire, type Rayon } from './rayons';
import type { Saisie } from './saisie';

// Données de l'app Courses (schéma "courses", migration
// 20261017100000_courses.sql). Qui voit quoi est garanti par les règles RLS
// de la base ; ce fichier ne fait que lire et écrire.

export type Portee = 'foyer' | 'moi';
export type EtatArticle = 'a_acheter' | 'caddie' | 'introuvable';

export type Liste = {
  id: string;
  foyer_id: string;
  nom: string;
  icone: string;
  couleur: string | null;
  portee: Portee;
  principale: boolean;
  cree_par: string;
  cree_le: string;
};

export type ListeResume = Liste & { nbAAcheter: number; invites: string[] };

export type Article = {
  id: string;
  liste_id: string;
  libelle: string;
  quantite: number | null;
  unite: string | null;
  note: string | null;
  rayon_id: string;
  etat: EtatArticle;
  ajoute_par: string | null;
  ajoute_le: string;
  caddie_par: string | null;
  caddie_le: string | null;
  maj_le: string;
};

// Icônes et couleurs proposées pour une liste.
export const ICONES_LISTE = [
  'cart-outline',
  'storefront-outline',
  'leaf-outline',
  'hammer-outline',
  'medkit-outline',
  'gift-outline',
  'paw-outline',
  'wine-outline',
] as const;
export const COULEURS_LISTE = ['#2F5D3A', '#1F5F8B', '#8C2F1B', '#7A4A21', '#6B3FA0', '#B07A12'] as const;

// --- Listes ---------------------------------------------------------------

// Liste principale du foyer (« Courses »), créée au premier passage.
export async function assurerListePrincipale(foyerId: string): Promise<string> {
  const { data, error } = await supabase.rpc('assurer_liste_principale', { id_foyer: foyerId });
  if (error) throw error;
  return data as string;
}

// Toutes les listes que je vois : celles de mon foyer (portée foyer), les
// miennes, et celles où l'on m'a invité. La principale d'abord.
export async function listerListes(): Promise<ListeResume[]> {
  const { data, error } = await supabase
    .from('listes')
    .select('*, invites(utilisateur_id), articles(etat)')
    .order('principale', { ascending: false })
    .order('cree_le', { ascending: true });
  if (error) throw error;
  return (data ?? []).map((l: any) => {
    const { invites, articles, ...liste } = l;
    return {
      ...(liste as Liste),
      invites: (invites ?? []).map((i: any) => i.utilisateur_id),
      nbAAcheter: (articles ?? []).filter((a: any) => a.etat !== 'caddie').length,
    };
  });
}

export async function obtenirListe(id: string): Promise<ListeResume | null> {
  const { data, error } = await supabase
    .from('listes')
    .select('*, invites(utilisateur_id), articles(etat)')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const { invites, articles, ...liste } = data as any;
  return {
    ...(liste as Liste),
    invites: (invites ?? []).map((i: any) => i.utilisateur_id),
    nbAAcheter: (articles ?? []).filter((a: any) => a.etat !== 'caddie').length,
  };
}

export type ChampsListe = { nom: string; icone: string; couleur: string | null; portee: Portee };

export async function creerListe(foyerId: string, champs: ChampsListe): Promise<string> {
  const { data: utilisateur } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from('listes')
    .insert({ ...champs, nom: champs.nom.trim(), foyer_id: foyerId, cree_par: utilisateur.user?.id })
    .select('id')
    .single();
  if (error) throw error;
  return data.id;
}

export async function modifierListe(id: string, champs: Partial<ChampsListe>): Promise<void> {
  const { error } = await supabase
    .from('listes')
    .update(champs.nom !== undefined ? { ...champs, nom: champs.nom.trim() } : champs)
    .eq('id', id);
  if (error) throw error;
}

export async function supprimerListe(id: string): Promise<void> {
  const { error } = await supabase.from('listes').delete().eq('id', id);
  if (error) throw error;
}

// Vider une liste (la principale ne se supprime pas).
export async function viderListe(id: string): Promise<void> {
  const { error } = await supabase.from('articles').delete().eq('liste_id', id);
  if (error) throw error;
}

// --- Invités et personnes -------------------------------------------------

export type PersonneCompte = {
  personneId: string;
  utilisateurId: string;
  prenom: string;
  foyerId: string | null;
  foyerNom: string | null;
};

// Personnes avec compte que je vois dans mes familles (règle commune :
// enfants masqués exclus) — candidates à une invitation, et prénoms
// affichés à côté des articles.
export async function listerPersonnesAvecCompte(): Promise<PersonneCompte[]> {
  const { data, error } = await schemaFamille()
    .from('personnes')
    .select('id, utilisateur_id, prenom, foyer_id, foyer:foyers(nom)')
    .not('utilisateur_id', 'is', null)
    .order('prenom');
  if (error) throw error;
  return (data ?? []).map((p: any) => {
    const foyerNom = p.foyer?.nom ?? null;
    const prenom = (p.prenom ?? '').trim();
    return {
      personneId: p.id,
      utilisateurId: p.utilisateur_id,
      prenom: prenom || (foyerNom ? `Quelqu’un de ${foyerNom}` : 'Sans prénom'),
      foyerId: p.foyer_id,
      foyerNom,
    };
  });
}

export async function inviter(listeId: string, utilisateurId: string): Promise<void> {
  const { error } = await supabase.from('invites').insert({ liste_id: listeId, utilisateur_id: utilisateurId });
  if (error) throw error;
}

export async function retirerInvite(listeId: string, utilisateurId: string): Promise<void> {
  const { error } = await supabase.from('invites').delete().eq('liste_id', listeId).eq('utilisateur_id', utilisateurId);
  if (error) throw error;
}

// --- Rayons et ordre de chacun -------------------------------------------

export async function listerRayons(): Promise<Rayon[]> {
  const { data, error } = await supabase.from('rayons').select('id, nom, icone, ordre').order('ordre');
  if (error || !data || data.length === 0) return RAYONS_DEPART;
  return data as Rayon[];
}

export type OrdreRayons = { utilisateurId: string; rayons: string[] };

// Ordres de rayons enregistrés sur cette liste (le mien et ceux des autres,
// pour « Utiliser l'ordre de… »).
export async function listerOrdresRayons(listeId: string): Promise<OrdreRayons[]> {
  const { data, error } = await supabase.from('ordres_rayons').select('utilisateur_id, rayons').eq('liste_id', listeId);
  if (error) throw error;
  return (data ?? []).map((o: any) => ({ utilisateurId: o.utilisateur_id, rayons: o.rayons ?? [] }));
}

export async function enregistrerMonOrdre(listeId: string, rayons: string[]): Promise<void> {
  const { data: utilisateur } = await supabase.auth.getUser();
  const { error } = await supabase
    .from('ordres_rayons')
    .upsert(
      { utilisateur_id: utilisateur.user?.id, liste_id: listeId, rayons, maj_le: new Date().toISOString() },
      { onConflict: 'utilisateur_id,liste_id' }
    );
  if (error) throw error;
}

// --- Mémoire du foyer par produit ----------------------------------------

export type Produit = { cle: string; libelle: string; rayon_id: string | null; nb_achats: number; dernier_achat: string | null };

// Produits connus du foyer (rayon choisi, nombre d'achats). Vide pour un
// invité d'un autre foyer (règles RLS) : on se rabat alors sur le
// dictionnaire.
export async function listerProduits(foyerId: string): Promise<Produit[]> {
  const { data, error } = await supabase
    .from('produits')
    .select('cle, libelle, rayon_id, nb_achats, dernier_achat')
    .eq('foyer_id', foyerId)
    .eq('masque', false)
    .order('nb_achats', { ascending: false })
    .limit(500);
  if (error) return [];
  return (data ?? []) as Produit[];
}

// Retient le rayon choisi pour ce produit (« ricotta » déplacée en
// Crèmerie une fois : c'est retenu pour le foyer). Sans effet pour un invité.
export async function memoriserRayon(foyerId: string, libelle: string, rayonId: string): Promise<void> {
  const cle = cleProduit(libelle);
  if (!cle) return;
  const { data: existant } = await supabase
    .from('produits')
    .select('cle')
    .eq('foyer_id', foyerId)
    .eq('cle', cle)
    .maybeSingle();
  if (existant) {
    await supabase.from('produits').update({ rayon_id: rayonId }).eq('foyer_id', foyerId).eq('cle', cle);
  } else {
    await supabase.from('produits').insert({ foyer_id: foyerId, cle, libelle: majusculeInitiale(libelle), rayon_id: rayonId });
  }
}

// Rayon d'un nouvel article : 1. ce que le foyer a déjà choisi pour ce
// produit ; 2. le dictionnaire intégré ; 3. « Autres ».
export function devinerRayon(libelle: string, produits: Produit[]): string {
  const cle = cleProduit(libelle);
  const connu = produits.find((p) => p.cle === cle && p.rayon_id);
  if (connu?.rayon_id) return connu.rayon_id;
  return devinerRayonDictionnaire(libelle) ?? RAYON_AUTRES;
}

// Suggestions pendant la saisie : produits du foyer qui commencent par (ou
// contiennent) le texte tapé, les plus achetés d'abord.
export function suggestions(produits: Produit[], texte: string, dejaSurLaListe: Set<string>, max = 6): Produit[] {
  const t = normaliserTexte(texte.trim());
  if (t.length < 2) return [];
  const debut: Produit[] = [];
  const dedans: Produit[] = [];
  for (const p of produits) {
    if (dejaSurLaListe.has(p.cle)) continue;
    const n = normaliserTexte(p.libelle);
    if (n.startsWith(t)) debut.push(p);
    else if (n.includes(t)) dedans.push(p);
  }
  return [...debut, ...dedans].slice(0, max);
}

// --- Articles -------------------------------------------------------------

export async function listerArticles(listeId: string): Promise<Article[]> {
  const { data, error } = await supabase
    .from('articles')
    .select('*')
    .eq('liste_id', listeId)
    .order('ajoute_le', { ascending: true });
  if (error) throw error;
  return (data ?? []) as Article[];
}

function memeUnite(a: string | null, b: string | null): boolean {
  return normaliserTexte(a ?? '') === normaliserTexte(b ?? '');
}

export type ResultatAjout = { article: Article; fusionne: boolean };

// Ajoute un article. Pas de doublon : un produit déjà sur la liste (même
// clé, même unité) n'est pas recopié — si les deux ont une quantité, elles
// s'additionnent ; sinon l'article reste seul, sans changer sa quantité.
// Un article marqué « introuvable » redevient « à acheter ».
export async function ajouterArticle(
  listeId: string,
  saisie: Saisie,
  produits: Produit[],
  articlesActuels: Article[]
): Promise<ResultatAjout> {
  const libelle = majusculeInitiale(saisie.libelle);
  if (!libelle) throw new Error('Article vide.');
  const cle = cleProduit(libelle);
  const existant = articlesActuels.find(
    (a) => a.etat !== 'caddie' && cleProduit(a.libelle) === cle && memeUnite(a.unite, saisie.unite)
  );
  if (existant) {
    const maj: Partial<Article> = {};
    if (existant.quantite != null && saisie.quantite != null) maj.quantite = existant.quantite + saisie.quantite;
    if (existant.etat === 'introuvable') maj.etat = 'a_acheter';
    if (Object.keys(maj).length === 0) return { article: existant, fusionne: true };
    const { data, error } = await supabase.from('articles').update(maj).eq('id', existant.id).select('*').single();
    if (error) throw error;
    return { article: data as Article, fusionne: true };
  }
  const { data: utilisateur } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from('articles')
    .insert({
      liste_id: listeId,
      libelle,
      quantite: saisie.quantite,
      unite: saisie.unite,
      rayon_id: devinerRayon(libelle, produits),
      ajoute_par: utilisateur.user?.id,
    })
    .select('*')
    .single();
  if (error) throw error;
  return { article: data as Article, fusionne: false };
}

export type ChampsArticle = Partial<Pick<Article, 'libelle' | 'quantite' | 'unite' | 'note' | 'rayon_id' | 'liste_id' | 'etat'>>;

export async function modifierArticle(id: string, champs: ChampsArticle): Promise<void> {
  const propres: ChampsArticle = { ...champs };
  if (propres.libelle !== undefined) propres.libelle = majusculeInitiale(propres.libelle);
  if (propres.note !== undefined) propres.note = propres.note?.trim() || null;
  if (propres.unite !== undefined) propres.unite = propres.unite?.trim() || null;
  const { error } = await supabase.from('articles').update(propres).eq('id', id);
  if (error) throw error;
}

export async function changerEtat(id: string, etat: EtatArticle): Promise<void> {
  const { error } = await supabase.from('articles').update({ etat }).eq('id', id);
  if (error) throw error;
}

export async function supprimerArticle(id: string): Promise<void> {
  const { error } = await supabase.from('articles').delete().eq('id', id);
  if (error) throw error;
}

// « Terminer les courses » : le caddie part dans l'historique, le reste
// reste sur la liste. Renvoie le nombre d'articles achetés.
export async function terminerCourses(listeId: string, articles: Article[]): Promise<number> {
  const caddie = articles.filter((a) => a.etat === 'caddie');
  const cles = Object.fromEntries(caddie.map((a) => [a.id, cleProduit(a.libelle)]));
  const { error } = await supabase.rpc('terminer_courses', { id_liste: listeId, cles });
  if (error) throw error;
  return caddie.length;
}

// --- Temps réel -----------------------------------------------------------

// Prévient à chaque changement d'article de la liste (ajout, case cochée,
// suppression), par n'importe quel téléphone. Les suppressions arrivent
// sans filtre possible côté serveur : on les filtre ici.
export function suivreArticles(listeId: string, rappel: () => void): () => void {
  const canal = supabase
    .channel(`courses-articles-${listeId}-${Math.random().toString(36).slice(2, 10)}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'courses', table: 'articles', filter: `liste_id=eq.${listeId}` }, rappel)
    .on('postgres_changes', { event: 'UPDATE', schema: 'courses', table: 'articles', filter: `liste_id=eq.${listeId}` }, rappel)
    .on('postgres_changes', { event: 'DELETE', schema: 'courses', table: 'articles' }, (charge: any) => {
      if (!charge?.old?.liste_id || charge.old.liste_id === listeId) rappel();
    })
    .subscribe();
  return () => {
    supabase.removeChannel(canal);
  };
}
