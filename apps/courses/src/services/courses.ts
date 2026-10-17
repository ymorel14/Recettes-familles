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

// --- Checklist du foyer (Phase 2) ----------------------------------------

// Endroits de la maison proposés pour ranger la checklist (on fait le tour
// une seule fois).
export const ENDROITS = ['Frigo', 'Congélateur', 'Placards', 'Salle de bain', 'Cellier', 'Autre'] as const;

export type AVerifier = { id: string; foyer_id: string; libelle: string; endroit: string; ordre: number };

export async function listerChecklist(foyerId: string): Promise<AVerifier[]> {
  const { data, error } = await supabase
    .from('a_verifier')
    .select('id, foyer_id, libelle, endroit, ordre')
    .eq('foyer_id', foyerId)
    .order('ordre')
    .order('libelle');
  if (error) throw error;
  return (data ?? []) as AVerifier[];
}

export async function ajouterAVerifier(foyerId: string, libelle: string, endroit: string): Promise<AVerifier> {
  const propre = majusculeInitiale(libelle);
  const existants = await listerChecklist(foyerId);
  const doublon = existants.find((a) => cleProduit(a.libelle) === cleProduit(propre));
  if (doublon) return doublon;
  const { data, error } = await supabase
    .from('a_verifier')
    .insert({ foyer_id: foyerId, libelle: propre, endroit, ordre: existants.length })
    .select('id, foyer_id, libelle, endroit, ordre')
    .single();
  if (error) throw error;
  return data as AVerifier;
}

export async function modifierAVerifier(id: string, champs: Partial<Pick<AVerifier, 'libelle' | 'endroit'>>): Promise<void> {
  const { error } = await supabase.from('a_verifier').update(champs).eq('id', id);
  if (error) throw error;
}

export async function supprimerAVerifier(id: string): Promise<void> {
  const { error } = await supabase.from('a_verifier').delete().eq('id', id);
  if (error) throw error;
}

// --- Préparation (« Préparer les courses ») ------------------------------

export type Reponse = 'en_stock' | 'a_acheter';
export type Verification = { a_verifier_id: string; reponse: Reponse; par: string | null; le: string };

// Préparation en cours de la liste (partagée par le foyer), créée si besoin.
export async function preparationEnCours(listeId: string): Promise<string> {
  const { data, error } = await supabase.rpc('preparation_en_cours', { id_liste: listeId });
  if (error) throw error;
  return data as string;
}

export async function listerVerifications(preparationId: string): Promise<Verification[]> {
  const { data, error } = await supabase
    .from('verifications')
    .select('a_verifier_id, reponse, par, le')
    .eq('preparation_id', preparationId);
  if (error) throw error;
  return (data ?? []) as Verification[];
}

export async function repondre(preparationId: string, aVerifierId: string, reponse: Reponse): Promise<void> {
  const { data: utilisateur } = await supabase.auth.getUser();
  const { error } = await supabase
    .from('verifications')
    .upsert(
      { preparation_id: preparationId, a_verifier_id: aVerifierId, reponse, par: utilisateur.user?.id, le: new Date().toISOString() },
      { onConflict: 'preparation_id,a_verifier_id' }
    );
  if (error) throw error;
}

export async function annulerReponse(preparationId: string, aVerifierId: string): Promise<void> {
  const { error } = await supabase
    .from('verifications')
    .delete()
    .eq('preparation_id', preparationId)
    .eq('a_verifier_id', aVerifierId);
  if (error) throw error;
}

export async function terminerPreparation(preparationId: string): Promise<void> {
  const { error } = await supabase
    .from('preparations')
    .update({ terminee_le: new Date().toISOString() })
    .eq('id', preparationId);
  if (error) throw error;
}

export function suivreVerifications(preparationId: string, rappel: () => void): () => void {
  const canal = supabase
    .channel(`courses-verifications-${preparationId}-${Math.random().toString(36).slice(2, 10)}`)
    .on('postgres_changes', { event: '*', schema: 'courses', table: 'verifications', filter: `preparation_id=eq.${preparationId}` }, rappel)
    .subscribe();
  return () => {
    supabase.removeChannel(canal);
  };
}

// --- Habituels et historique ----------------------------------------------

export type Habituel = {
  cle: string;
  libelle: string;
  nb_achats: number;
  dernier_achat: string | null;
  quantite: number | null;
  unite: string | null;
  rayon_id: string | null;
  epingle: boolean;
};

// Produits achetés le plus souvent avec cette liste (vide pour un invité
// d'un autre foyer).
export async function listerHabituels(listeId: string, nombre = 30): Promise<Habituel[]> {
  const { data, error } = await supabase.rpc('habituels', { id_liste: listeId, nombre });
  if (error) return [];
  return ((data ?? []) as any[]).map((h) => ({ ...h, nb_achats: Number(h.nb_achats) }));
}

async function reglerProduit(foyerId: string, cle: string, libelle: string, champs: { epingle?: boolean; masque?: boolean }) {
  const { data: existant } = await supabase.from('produits').select('cle').eq('foyer_id', foyerId).eq('cle', cle).maybeSingle();
  const { error } = existant
    ? await supabase.from('produits').update(champs).eq('foyer_id', foyerId).eq('cle', cle)
    : await supabase.from('produits').insert({ foyer_id: foyerId, cle, libelle, ...champs });
  if (error) throw error;
}

export const epinglerProduit = (foyerId: string, h: Pick<Habituel, 'cle' | 'libelle'>, epingle: boolean) =>
  reglerProduit(foyerId, h.cle, h.libelle, { epingle });
export const masquerProduit = (foyerId: string, h: Pick<Habituel, 'cle' | 'libelle'>) =>
  reglerProduit(foyerId, h.cle, h.libelle, { masque: true, epingle: false });

export type Passage = {
  id: string;
  termine_par: string | null;
  termine_le: string;
  articles: { libelle: string; quantite: number | null; unite: string | null; rayon_id: string | null }[];
};

// Courses terminées de cette liste, les plus récentes d'abord (foyer seul).
export async function listerPassages(listeId: string, nombre = 30): Promise<Passage[]> {
  const { data, error } = await supabase
    .from('passages')
    .select('id, termine_par, termine_le, articles:passage_articles(libelle, quantite, unite, rayon_id)')
    .eq('liste_id', listeId)
    .order('termine_le', { ascending: false })
    .limit(nombre);
  if (error) throw error;
  return (data ?? []) as Passage[];
}
