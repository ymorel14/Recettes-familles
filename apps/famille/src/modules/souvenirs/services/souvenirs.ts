import * as FileSystem from 'expo-file-system/legacy';
import { decode } from 'base64-arraybuffer';
import { Platform } from 'react-native';
import { supabase } from './supabase';
import type { PrecisionDate } from '../utils/dates';
import { compresserPhoto } from '../utils/compression';

// Accès aux données de SouvenirsFamille (schéma "souvenirs",
// supabase/migrations/20261001100000_souvenirs.sql). Qui voit et qui modifie
// quoi est garanti par les règles RLS de la base : l'app ne fait qu'afficher
// ce que la base lui renvoie.
//
// Les fichiers (photos, vidéos, audio, PDF) vivent dans l'espace PRIVÉ
// "souvenirs-medias", rangés par souvenir : "<id du souvenir>/<nom>.<ext>".
// Ils s'affichent par des adresses signées (valables une heure). La base ne
// peut pas effacer un fichier : l'app l'efface du stockage avant la ligne.

export const BUCKET_MEDIAS = 'souvenirs-medias';
const DUREE_ADRESSE = 3600; // secondes

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Categorie = {
  code: string;
  libelle: string;
  icone: string; // nom Ionicons
  ordre: number;
};

export type Visibilite = 'famille' | 'foyer' | 'personnes' | 'prive';

export const VISIBILITES: { id: Visibilite; titre: string; aide: string }[] = [
  { id: 'famille', titre: 'Toute la famille', aide: 'Visible de tous les membres de la famille.' },
  { id: 'foyer', titre: 'Mon foyer', aide: 'Visible des seuls membres de votre foyer.' },
  { id: 'personnes', titre: 'Les personnes du souvenir', aide: 'Visible des personnes citées (et des parents d’un enfant cité).' },
  { id: 'prive', titre: 'Moi seulement', aide: 'Votre journal personnel : personne d’autre ne le voit.' },
];

export type RolePersonne = 'principal' | 'present';

export type PersonneDuSouvenir = {
  personne_id: string;
  role: RolePersonne;
};

export type TypeMedia = 'photo' | 'video' | 'audio' | 'document';

export type Media = {
  id: string;
  souvenir_id: string;
  chemin: string;
  type: TypeMedia;
  legende: string | null;
  pris_le: string | null;
  largeur: number | null;
  hauteur: number | null;
  duree_secondes: number | null;
  ordre: number;
  ajoute_par: string | null;
  cree_le: string;
};

export type Commentaire = {
  id: string;
  souvenir_id: string;
  media_id: string | null;
  auteur: string;
  texte: string;
  cree_le: string;
  maj_le: string;
};

export type Souvenir = {
  id: string;
  famille_id: string;
  foyer_id: string | null;
  titre: string;
  recit: string | null;
  categorie: string;
  date_debut: string | null;
  date_fin: string | null;
  precision_date: PrecisionDate;
  lieu: string | null;
  pays: string | null;
  etiquettes: string[];
  // Prénoms libres de personnes hors famille (enfants gardés, amis…).
  autres_personnes: string[];
  visibilite: Visibilite;
  voyage_id: string | null;
  couverture_id: string | null;
  cree_par: string | null;
  cree_le: string;
  maj_le: string;
};

// Souvenir complet (écran Souvenir).
export type SouvenirDetaille = Souvenir & {
  personnes: PersonneDuSouvenir[];
  medias: Media[];
  commentaires: Commentaire[];
};

// Carte du fil : le souvenir, ses personnes, sa couverture et ses compteurs.
export type CarteSouvenir = Souvenir & {
  personnes: PersonneDuSouvenir[];
  couverture: string | null; // chemin dans le stockage
  nb_medias: number;
};

// Résultat de souvenirs.rechercher (âge en mois calculé par la base).
export type ResultatRecherche = {
  id: string;
  titre: string;
  categorie: string;
  date_debut: string | null;
  date_fin: string | null;
  precision_date: PrecisionDate;
  lieu: string | null;
  pays: string | null;
  extrait: string | null;
  couverture: string | null;
  nb_medias: number;
  nb_commentaires: number;
  personnes: { id: string; prenom: string; role: RolePersonne; age_mois: number | null }[];
  autres_personnes: string[];
  pertinence: number;
};

export type FormulaireSouvenir = {
  titre: string;
  categorie: string;
  precision_date: PrecisionDate;
  date_debut: string | null;
  date_fin: string | null;
  lieu: string;
  pays: string;
  recit: string;
  etiquettes: string[];
  autres_personnes: string[];
  visibilite: Visibilite;
  personnes: PersonneDuSouvenir[];
};

// ---------------------------------------------------------------------------
// Catégories (lecture seule, mises en cache)
// ---------------------------------------------------------------------------

let categoriesEnCache: Categorie[] | null = null;

export async function listerCategories(): Promise<Categorie[]> {
  if (categoriesEnCache) return categoriesEnCache;
  const { data, error } = await supabase.from('categories').select('code, libelle, icone, ordre').order('ordre');
  if (error) throw error;
  categoriesEnCache = (data ?? []) as Categorie[];
  return categoriesEnCache;
}

export function categorieDe(categories: Categorie[], code: string): Categorie {
  return categories.find((c) => c.code === code) ?? { code, libelle: code, icone: 'ellipse-outline', ordre: 999 };
}

// ---------------------------------------------------------------------------
// Fil et souvenir
// ---------------------------------------------------------------------------

const SELECTION_SOUVENIR =
  'id, famille_id, foyer_id, titre, recit, categorie, date_debut, date_fin, precision_date, lieu, pays, ' +
  'etiquettes, autres_personnes, visibilite, voyage_id, couverture_id, cree_par, cree_le, maj_le';

function premierePhoto(medias: { id: string; chemin: string; type: TypeMedia; ordre: number }[], couvertureId: string | null) {
  const couverture = couvertureId ? medias.find((m) => m.id === couvertureId) : undefined;
  if (couverture) return couverture.chemin;
  const photos = medias.filter((m) => m.type === 'photo').sort((a, b) => a.ordre - b.ordre);
  return photos[0]?.chemin ?? null;
}

// Tous les souvenirs visibles de la famille (active), du plus récent au plus
// ancien ; les souvenirs sans date viennent à la fin.
export async function listerSouvenirs(familleId: string): Promise<CarteSouvenir[]> {
  const { data, error } = await supabase
    .from('souvenirs')
    .select(SELECTION_CARTE)
    .eq('famille_id', familleId)
    .order('date_debut', { ascending: false, nullsFirst: false })
    .order('cree_le', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(versCarte);
}

const SELECTION_CARTE = `${SELECTION_SOUVENIR}, souvenir_personnes(personne_id, role), medias!medias_souvenir_id_fkey(id, chemin, type, ordre)`;

function versCarte(s: any): CarteSouvenir {
  return {
    ...s,
    etiquettes: s.etiquettes ?? [],
    autres_personnes: s.autres_personnes ?? [],
    personnes: s.souvenir_personnes ?? [],
    couverture: premierePhoto(s.medias ?? [], s.couverture_id),
    nb_medias: (s.medias ?? []).length,
  };
}

export async function obtenirSouvenir(id: string): Promise<SouvenirDetaille | null> {
  const { data, error } = await supabase
    .from('souvenirs')
    .select(
      `${SELECTION_SOUVENIR}, souvenir_personnes(personne_id, role), ` +
        'medias!medias_souvenir_id_fkey(id, souvenir_id, chemin, type, legende, pris_le, largeur, hauteur, duree_secondes, ordre, ajoute_par, cree_le), ' +
        'commentaires(id, souvenir_id, media_id, auteur, texte, cree_le, maj_le)'
    )
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const s: any = data;
  return {
    ...s,
    etiquettes: s.etiquettes ?? [],
    autres_personnes: s.autres_personnes ?? [],
    personnes: s.souvenir_personnes ?? [],
    medias: ((s.medias ?? []) as Media[]).sort((a, b) => a.ordre - b.ordre || a.cree_le.localeCompare(b.cree_le)),
    commentaires: ((s.commentaires ?? []) as Commentaire[]).sort((a, b) => a.cree_le.localeCompare(b.cree_le)),
  };
}

function lignePourBase(f: FormulaireSouvenir) {
  return {
    titre: f.titre.trim(),
    categorie: f.categorie,
    precision_date: f.precision_date,
    date_debut: f.date_debut,
    date_fin: f.date_fin && f.date_debut && f.date_fin > f.date_debut ? f.date_fin : null,
    lieu: f.lieu.trim() || null,
    pays: f.pays.trim() || null,
    recit: f.recit.trim() || null,
    etiquettes: f.etiquettes.map((e) => e.trim()).filter(Boolean),
    autres_personnes: f.autres_personnes.map((e) => e.trim()).filter(Boolean),
    visibilite: f.visibilite,
  };
}

// Remplace les personnes du souvenir par celles du formulaire.
async function enregistrerPersonnes(souvenirId: string, personnes: PersonneDuSouvenir[]) {
  const { data: actuelles, error } = await supabase
    .from('souvenir_personnes')
    .select('personne_id')
    .eq('souvenir_id', souvenirId);
  if (error) throw error;
  const gardees = new Set(personnes.map((p) => p.personne_id));
  const aRetirer = (actuelles ?? []).map((p: any) => p.personne_id as string).filter((id) => !gardees.has(id));
  if (aRetirer.length > 0) {
    const { error: e } = await supabase
      .from('souvenir_personnes')
      .delete()
      .eq('souvenir_id', souvenirId)
      .in('personne_id', aRetirer);
    if (e) throw e;
  }
  if (personnes.length > 0) {
    const { error: e } = await supabase
      .from('souvenir_personnes')
      .upsert(personnes.map((p) => ({ souvenir_id: souvenirId, personne_id: p.personne_id, role: p.role })));
    if (e) throw e;
  }
}

export async function creerSouvenir(familleId: string, auteurId: string, f: FormulaireSouvenir): Promise<string> {
  const { data, error } = await supabase
    .from('souvenirs')
    .insert({ ...lignePourBase(f), famille_id: familleId, cree_par: auteurId })
    .select('id')
    .single();
  if (error) throw error;
  await enregistrerPersonnes(data.id, f.personnes);
  return data.id as string;
}

export async function modifierSouvenir(id: string, f: FormulaireSouvenir): Promise<void> {
  const { error } = await supabase.from('souvenirs').update(lignePourBase(f)).eq('id', id);
  if (error) throw error;
  await enregistrerPersonnes(id, f.personnes);
}

// Efface d'abord les fichiers du souvenir, puis le souvenir (ses médias,
// personnes et commentaires suivent).
export async function supprimerSouvenir(id: string): Promise<void> {
  const { data: chemins, error } = await supabase.rpc('fichiers_du_souvenir', { id_souvenir: id });
  if (error) throw error;
  const liste = ((chemins as string[] | null) ?? []).filter(Boolean);
  if (liste.length > 0) {
    const { error: e } = await supabase.storage.from(BUCKET_MEDIAS).remove(liste);
    if (e) throw e;
  }
  const { error: e2 } = await supabase.from('souvenirs').delete().eq('id', id);
  if (e2) throw e2;
}

// Même règle que souvenirs.peut_modifier dans la base (qui reste seule
// juge) : l'auteur, ou un membre de son foyer sauf pour un souvenir privé.
export function peutModifierSouvenir(
  s: Pick<Souvenir, 'cree_par' | 'foyer_id' | 'visibilite'>,
  moi: string | null | undefined,
  monFoyer: string | null | undefined
): boolean {
  if (!moi) return false;
  if (s.cree_par === moi) return true;
  return s.visibilite !== 'prive' && !!monFoyer && s.foyer_id === monFoyer;
}

// « J'y étais » : ajoute une personne (moi ou mon enfant) comme présente.
export async function ajouterPresence(souvenirId: string, personneId: string): Promise<void> {
  const { error } = await supabase
    .from('souvenir_personnes')
    .insert({ souvenir_id: souvenirId, personne_id: personneId, role: 'present' });
  if (error && error.code !== '23505') throw error; // déjà présente : rien à faire
}

export async function retirerPresence(souvenirId: string, personneId: string): Promise<void> {
  const { error } = await supabase
    .from('souvenir_personnes')
    .delete()
    .eq('souvenir_id', souvenirId)
    .eq('personne_id', personneId);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Médias
// ---------------------------------------------------------------------------

// Fichier choisi sur l'appareil (galerie, appareil photo, documents).
export type FichierLocal = {
  uri: string;
  type: TypeMedia;
  mimeType?: string | null;
  nom?: string | null;
  largeur?: number | null;
  hauteur?: number | null;
  dureeSecondes?: number | null;
};

const EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/heic': 'heic',
  'image/heif': 'heif',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/webm': 'webm',
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/aac': 'aac',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/ogg': 'ogg',
  'audio/webm': 'webm',
  'application/pdf': 'pdf',
};

const TYPES_PAR_EXTENSION: Record<string, string> = Object.fromEntries(
  Object.entries(EXTENSIONS).map(([mime, ext]) => [ext, mime])
);

function extensionDe(nomOuUri: string | null | undefined): string | null {
  if (!nomOuUri || nomOuUri.startsWith('data:') || nomOuUri.startsWith('blob:')) return null;
  const propre = nomOuUri.split('?')[0].split('#')[0];
  const ext = propre.includes('.') ? propre.split('.').pop()!.toLowerCase() : '';
  return ext && ext.length <= 5 ? ext : null;
}

function typeParDefaut(type: TypeMedia): string {
  return type === 'photo' ? 'image/jpeg' : type === 'video' ? 'video/mp4' : type === 'audio' ? 'audio/mpeg' : 'application/pdf';
}

function nomAleatoire(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
}

// Envoie un fichier dans le dossier du souvenir, puis enregistre sa ligne.
export async function ajouterMedia(souvenirId: string, auteurId: string, fichier: FichierLocal, ordre: number): Promise<Media> {
  // Photos réduites et compressées avant l'envoi (voir utils/compression).
  const f = await compresserPhoto(fichier);
  let donnees: ArrayBuffer;
  let mime = f.mimeType || null;
  if (Platform.OS === 'web') {
    const blob = await (await fetch(f.uri)).blob();
    mime = mime || blob.type || null;
    donnees = await blob.arrayBuffer();
  } else {
    donnees = decode(await FileSystem.readAsStringAsync(f.uri, { encoding: 'base64' }));
  }
  const extension =
    (mime && EXTENSIONS[mime]) || extensionDe(f.nom) || extensionDe(f.uri) || EXTENSIONS[typeParDefaut(f.type)];
  mime = mime || TYPES_PAR_EXTENSION[extension] || typeParDefaut(f.type);
  const chemin = `${souvenirId}/${nomAleatoire()}.${extension}`;

  const { error } = await supabase.storage.from(BUCKET_MEDIAS).upload(chemin, donnees, { contentType: mime });
  if (error) {
    if (/exceeded|too large|payload/i.test(error.message)) {
      throw new Error('Fichier trop lourd : 50 Mo au maximum par fichier.');
    }
    throw error;
  }

  const { data, error: e } = await supabase
    .from('medias')
    .insert({
      souvenir_id: souvenirId,
      chemin,
      type: f.type,
      largeur: f.largeur ?? null,
      hauteur: f.hauteur ?? null,
      duree_secondes: f.dureeSecondes != null ? Math.round(f.dureeSecondes) : null,
      ordre,
      ajoute_par: auteurId,
      legende: f.type === 'document' || f.type === 'audio' ? (f.nom?.replace(/\.[^.]+$/, '') ?? null) : null,
    })
    .select('id, souvenir_id, chemin, type, legende, pris_le, largeur, hauteur, duree_secondes, ordre, ajoute_par, cree_le')
    .single();
  if (e) {
    // Ligne refusée : on ne laisse pas le fichier orphelin.
    await supabase.storage.from(BUCKET_MEDIAS).remove([chemin]);
    throw e;
  }
  return data as Media;
}

export async function supprimerMedia(media: Pick<Media, 'id' | 'chemin'>): Promise<void> {
  const { error } = await supabase.storage.from(BUCKET_MEDIAS).remove([media.chemin]);
  if (error) throw error;
  const { error: e } = await supabase.from('medias').delete().eq('id', media.id);
  if (e) throw e;
}

export async function modifierLegende(mediaId: string, legende: string): Promise<void> {
  const { error } = await supabase.from('medias').update({ legende: legende.trim() || null }).eq('id', mediaId);
  if (error) throw error;
}

export async function definirCouverture(souvenirId: string, mediaId: string | null): Promise<void> {
  const { error } = await supabase.from('souvenirs').update({ couverture_id: mediaId }).eq('id', souvenirId);
  if (error) throw error;
}

// Adresses signées, gardées en mémoire jusqu'à 5 minutes avant expiration.
const adresses = new Map<string, { url: string; expire: number }>();

export async function adressesSignees(chemins: string[]): Promise<Record<string, string>> {
  const maintenant = Date.now();
  const resultat: Record<string, string> = {};
  const manquants: string[] = [];
  for (const c of Array.from(new Set(chemins.filter(Boolean)))) {
    const connue = adresses.get(c);
    if (connue && connue.expire - maintenant > 5 * 60 * 1000) resultat[c] = connue.url;
    else manquants.push(c);
  }
  if (manquants.length > 0) {
    const { data, error } = await supabase.storage.from(BUCKET_MEDIAS).createSignedUrls(manquants, DUREE_ADRESSE);
    if (error) throw error;
    (data ?? []).forEach((d: any) => {
      if (d.signedUrl && d.path) {
        adresses.set(d.path, { url: d.signedUrl, expire: maintenant + DUREE_ADRESSE * 1000 });
        resultat[d.path] = d.signedUrl;
      }
    });
  }
  return resultat;
}

// ---------------------------------------------------------------------------
// Commentaires
// ---------------------------------------------------------------------------

export async function ajouterCommentaire(
  souvenirId: string,
  auteurId: string,
  texte: string,
  mediaId: string | null = null
): Promise<void> {
  const { error } = await supabase
    .from('commentaires')
    .insert({ souvenir_id: souvenirId, auteur: auteurId, texte: texte.trim(), media_id: mediaId });
  if (error) throw error;
}

export async function modifierCommentaire(id: string, texte: string): Promise<void> {
  const { error } = await supabase.from('commentaires').update({ texte: texte.trim() }).eq('id', id);
  if (error) throw error;
}

export async function supprimerCommentaire(id: string): Promise<void> {
  const { error } = await supabase.from('commentaires').delete().eq('id', id);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Recherche, « Ce jour-là », voyages
// ---------------------------------------------------------------------------

export type FiltresRecherche = {
  familleId?: string | null;
  categorie?: string | null;
  personneId?: string | null;
  depuis?: string | null;
  jusquA?: string | null;
  limite?: number;
};

export async function rechercher(question: string, filtres: FiltresRecherche = {}): Promise<ResultatRecherche[]> {
  const { data, error } = await supabase.rpc('rechercher', {
    question,
    id_famille: filtres.familleId ?? null,
    categorie_code: filtres.categorie ?? null,
    id_personne: filtres.personneId ?? null,
    depuis: filtres.depuis ?? null,
    jusqu_a: filtres.jusquA ?? null,
    limite: filtres.limite ?? 30,
  });
  if (error) throw error;
  return ((data as any[]) ?? []).map((r) => ({
    ...r,
    personnes: r.personnes ?? [],
    autres_personnes: r.autres_personnes ?? [],
  }));
}

export async function ceJourLa(jour: string, familleId: string): Promise<Souvenir[]> {
  const { data, error } = await supabase.rpc('ce_jour_la', { jour, id_famille: familleId });
  if (error) throw error;
  return (data as Souvenir[] | null) ?? [];
}

export type VoyagePasse = {
  id: string;
  titre: string;
  destination: string | null;
  pays: string | null;
  date_debut: string | null;
  date_fin: string | null;
  annee: number | null;
  souvenir_id: string | null; // déjà dans les souvenirs
};

// Voyages de VoyageCommun terminés ou passés, dans la famille active.
export async function listerVoyagesPasses(familleId: string, aujourdHui: string): Promise<VoyagePasse[]> {
  const { data, error } = await supabase
    .schema('voyage')
    .from('voyages')
    .select('id, titre, destination, pays, date_debut, date_fin, annee, statut')
    .eq('famille_id', familleId)
    .neq('statut', 'annule')
    .order('date_debut', { ascending: false, nullsFirst: false });
  if (error) throw error;
  const passes = (data ?? []).filter(
    (v: any) => v.statut === 'termine' || (v.date_fin ?? v.date_debut ?? '9999') < aujourdHui
  );
  if (passes.length === 0) return [];
  const { data: liens, error: e } = await supabase
    .from('souvenirs')
    .select('id, voyage_id')
    .in('voyage_id', passes.map((v: any) => v.id));
  if (e) throw e;
  const parVoyage = new Map((liens ?? []).map((l: any) => [l.voyage_id as string, l.id as string]));
  return passes.map((v: any) => ({
    id: v.id,
    titre: v.titre,
    destination: v.destination,
    pays: v.pays,
    date_debut: v.date_debut,
    date_fin: v.date_fin,
    annee: v.annee,
    souvenir_id: parVoyage.get(v.id) ?? null,
  }));
}

export async function creerDepuisVoyage(voyageId: string): Promise<string> {
  const { data, error } = await supabase.rpc('creer_depuis_voyage', { id_voyage: voyageId });
  if (error) throw error;
  return data as string;
}

// ---------------------------------------------------------------------------
// Albums (« Mes motos », « Les enfants que j'ai gardés »…)
// ---------------------------------------------------------------------------

export type VisibiliteAlbum = 'famille' | 'foyer' | 'prive';

export const VISIBILITES_ALBUM: { id: VisibiliteAlbum; titre: string; aide: string }[] = [
  { id: 'famille', titre: 'Toute la famille', aide: 'Chacun le voit et peut y ajouter ses propres souvenirs.' },
  { id: 'foyer', titre: 'Mon foyer', aide: 'Visible des seuls membres de votre foyer.' },
  { id: 'prive', titre: 'Moi seulement', aide: 'Un album personnel.' },
];

export type Album = {
  id: string;
  titre: string;
  description: string | null;
  visibilite: VisibiliteAlbum;
  cree_par: string | null;
  foyer_id: string | null;
  nb_souvenirs: number;
  premiere_date: string | null;
  derniere_date: string | null;
  couverture: string | null; // chemin dans le stockage
  maj_le: string;
};

export type FormulaireAlbum = {
  titre: string;
  description: string;
  visibilite: VisibiliteAlbum;
};

// Albums de la famille (active), avec le nombre de souvenirs visibles.
export async function listerAlbums(familleId: string): Promise<Album[]> {
  const { data, error } = await supabase.rpc('lister_albums', { id_famille: familleId });
  if (error) throw error;
  return (data as Album[] | null) ?? [];
}

export async function obtenirAlbum(id: string): Promise<{ album: Album; souvenirs: CarteSouvenir[] } | null> {
  const { data: a, error } = await supabase
    .from('albums')
    .select('id, famille_id, titre, description, visibilite, cree_par, foyer_id, maj_le')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  if (!a) return null;
  const { data: liens, error: e1 } = await supabase.from('album_souvenirs').select('souvenir_id').eq('album_id', id);
  if (e1) throw e1;
  const ids = (liens ?? []).map((l: any) => l.souvenir_id as string);
  let souvenirs: CarteSouvenir[] = [];
  if (ids.length > 0) {
    // Du plus ancien au plus récent : un album se lit dans l'ordre de la vie.
    const { data, error: e2 } = await supabase
      .from('souvenirs')
      .select(SELECTION_CARTE)
      .in('id', ids)
      .order('date_debut', { ascending: true, nullsFirst: false })
      .order('cree_le', { ascending: true });
    if (e2) throw e2;
    souvenirs = (data ?? []).map(versCarte);
  }
  const album: Album = {
    ...(a as any),
    nb_souvenirs: souvenirs.length,
    premiere_date: souvenirs.find((s) => s.date_debut)?.date_debut ?? null,
    derniere_date: null,
    couverture: souvenirs.find((s) => s.couverture)?.couverture ?? null,
  };
  return { album, souvenirs };
}

export async function creerAlbum(familleId: string, auteurId: string, f: FormulaireAlbum): Promise<string> {
  const { data, error } = await supabase
    .from('albums')
    .insert({
      famille_id: familleId,
      cree_par: auteurId,
      titre: f.titre.trim(),
      description: f.description.trim() || null,
      visibilite: f.visibilite,
    })
    .select('id')
    .single();
  if (error) throw error;
  return data.id as string;
}

export async function modifierAlbum(id: string, f: FormulaireAlbum): Promise<void> {
  const { error } = await supabase
    .from('albums')
    .update({ titre: f.titre.trim(), description: f.description.trim() || null, visibilite: f.visibilite })
    .eq('id', id);
  if (error) throw error;
}

// Supprime l'album seulement : ses souvenirs restent.
export async function supprimerAlbum(id: string): Promise<void> {
  const { error } = await supabase.from('albums').delete().eq('id', id);
  if (error) throw error;
}

export async function ajouterAuxAlbums(albumIds: string[], souvenirIds: string[], auteurId: string): Promise<void> {
  const lignes = albumIds.flatMap((a) => souvenirIds.map((s) => ({ album_id: a, souvenir_id: s, ajoute_par: auteurId })));
  if (lignes.length === 0) return;
  const { error } = await supabase
    .from('album_souvenirs')
    .upsert(lignes, { onConflict: 'album_id,souvenir_id', ignoreDuplicates: true });
  if (error) throw error;
}

export async function retirerDeLAlbum(albumId: string, souvenirId: string): Promise<void> {
  const { error } = await supabase.from('album_souvenirs').delete().eq('album_id', albumId).eq('souvenir_id', souvenirId);
  if (error) throw error;
}

// Albums (visibles) qui contiennent ce souvenir.
export async function albumsDuSouvenir(souvenirId: string): Promise<{ id: string; titre: string }[]> {
  const { data, error } = await supabase
    .from('album_souvenirs')
    .select('album:albums(id, titre)')
    .eq('souvenir_id', souvenirId);
  if (error) throw error;
  return (data ?? []).map((l: any) => l.album).filter(Boolean);
}

// Même règle que la base : l'auteur, ou son foyer sauf album privé.
export function peutModifierAlbum(
  a: Pick<Album, 'cree_par' | 'foyer_id' | 'visibilite'>,
  moi: string | null | undefined,
  monFoyer: string | null | undefined
): boolean {
  if (!moi) return false;
  if (a.cree_par === moi) return true;
  return a.visibilite !== 'prive' && !!monFoyer && a.foyer_id === monFoyer;
}

// Peut-on verser ce souvenir dans cet album ? (gestionnaire de l'album, ou
// album "famille" et souvenir dont on est l'auteur)
export function peutAjouterALAlbum(
  a: Pick<Album, 'cree_par' | 'foyer_id' | 'visibilite'>,
  souvenirAuteur: string | null,
  moi: string | null | undefined,
  monFoyer: string | null | undefined
): boolean {
  return peutModifierAlbum(a, moi, monFoyer) || (a.visibilite === 'famille' && !!moi && souvenirAuteur === moi);
}
