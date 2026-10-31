import AsyncStorage from '@react-native-async-storage/async-storage';
import { clientPourSchema } from '../../../services/supabase';
import { supabase } from './supabase';
import { lireAnnonce } from './annonces';
import { creerVoyage, definirSecret, PERIODES, type NatureVoyage, type Participation, type Periode, type TypeSejour } from './voyage';
import { enregistrerPlat, enregistrerRepas, type EtapeRepas, type MomentRepas } from './repas';
import type { Personne } from './personnes';

// Création pas à pas d'un voyage (6 étapes) ou d'un repas (4 étapes) —
// refonte Événements § 5 à 7. Tout reste dans un BROUILLON local jusqu'à
// « Proposer » : rien n'est créé (ni invité, ni notifié) avant.

export type ModeTransport = 'voiture' | 'moto' | 'train' | 'avion' | 'bateau' | 'bus' | 'velo' | 'autre';

export const MODES_TRANSPORT: { id: ModeTransport; libelle: string }[] = [
  { id: 'voiture', libelle: 'Voiture' },
  { id: 'moto', libelle: 'Moto' },
  { id: 'train', libelle: 'Train' },
  { id: 'avion', libelle: 'Avion' },
  { id: 'bateau', libelle: 'Bateau' },
  { id: 'bus', libelle: 'Bus' },
  { id: 'velo', libelle: 'Vélo' },
  { id: 'autre', libelle: 'Autre' },
];

export type Occasion = 'repas' | 'noel' | 'nouvel_an' | 'paques' | 'anniversaire';

export const OCCASIONS: { id: Occasion; libelle: string }[] = [
  { id: 'repas', libelle: 'Un repas' },
  { id: 'noel', libelle: 'Noël' },
  { id: 'nouvel_an', libelle: 'Nouvel an' },
  { id: 'paques', libelle: 'Pâques' },
  { id: 'anniversaire', libelle: 'Un anniversaire' },
];

export type Plage = { debut: string; fin: string };

// Une proposition saisie librement (texte ou lien) : logement, trajet, activité.
export type Idee = {
  cle: string;
  nom: string;
  detail: string;
  lien: string | null;
  site: string | null;
  ville: string | null;
  prix: number | null;
  image: string | null;
  capacite: number | null;
  chambres: number | null;
  type: string | null; // type de logement déduit du lien
  mode: ModeTransport | null; // trajet
  lecture: boolean; // lien en cours de lecture
  assistant?: boolean; // idée proposée par l'assistant
};

export type Decision = 'vote' | 'decide';

export type PlatPrevu = { cle: string; titre: string; etape: EtapeRepas | 'autre'; moi: boolean };

export type Brouillon = {
  nature: NatureVoyage;
  etape: number; // étape affichée
  vus: number; // dernière étape atteinte
  // Où, quand
  destination: string;
  aChoisir: boolean; // « On choisira ensemble »
  periode: Periode;
  anneePeriode: number | null;
  typeSejour: TypeSejour;
  plages: Plage[];
  plusieursJours: boolean;
  // Qui
  participation: Participation;
  invites: string[];
  surprise: boolean;
  cachees: string[];
  // Voyage : logement, trajet, activités
  logements: Idee[];
  trajets: Idee[];
  activites: Idee[];
  decisions: { logement: Decision | null; trajet: Decision | null; activites: Decision | null };
  retenus: { logement: string | null; trajet: string | null };
  modeTrajet: ModeTransport;
  // Repas
  occasion: Occasion;
  fetePersonneId: string | null;
  hote: string; // id de foyer, 'ailleurs' ou 'decider'
  lieu: string;
  moment: Extract<MomentRepas, 'dejeuner' | 'diner'>;
  heure: string; // 'HH:MM' ou ''
  listeEnvies: boolean;
  plats: PlatPrevu[];
  // Titre (calculé tant qu'on ne l'a pas modifié)
  titre: string;
  titreModifie: boolean;
};

export function brouillonVide(nature: NatureVoyage, foyerId: string | null): Brouillon {
  return {
    nature,
    etape: 0,
    vus: 0,
    destination: '',
    aChoisir: false,
    periode: 'ete',
    anneePeriode: null,
    typeSejour: 'vacances',
    plages: [],
    plusieursJours: false,
    participation: 'famille',
    invites: [],
    surprise: false,
    cachees: [],
    logements: [],
    trajets: [],
    activites: [],
    decisions: { logement: null, trajet: null, activites: null },
    retenus: { logement: null, trajet: null },
    modeTrajet: 'voiture',
    occasion: 'repas',
    fetePersonneId: null,
    hote: foyerId ?? 'decider',
    lieu: '',
    moment: 'diner',
    heure: '',
    listeEnvies: true,
    plats: [],
    titre: '',
    titreModifie: false,
  };
}

// ---------------------------------------------------------------------------
// Brouillon gardé sur l'appareil
// ---------------------------------------------------------------------------

const CLE_BROUILLON = 'brouillon-retrouvailles';

export async function lireBrouillonLocal(nature: NatureVoyage): Promise<Brouillon | null> {
  try {
    const texte = await AsyncStorage.getItem(`${CLE_BROUILLON}.${nature}`);
    if (!texte) return null;
    const b = JSON.parse(texte) as Brouillon;
    return b && b.nature === nature ? b : null;
  } catch {
    return null;
  }
}

export async function garderBrouillonLocal(b: Brouillon): Promise<void> {
  try {
    await AsyncStorage.setItem(`${CLE_BROUILLON}.${b.nature}`, JSON.stringify(b));
  } catch {
    /* sans stockage : le brouillon reste en mémoire */
  }
}

export async function effacerBrouillonLocal(nature: NatureVoyage): Promise<void> {
  try {
    await AsyncStorage.removeItem(`${CLE_BROUILLON}.${nature}`);
  } catch {
    /* rien */
  }
}

// Le brouillon contient-il quelque chose qui vaille la peine d'être repris ?
export function brouillonUtile(b: Brouillon): boolean {
  return (
    b.destination.trim().length > 0 ||
    b.plages.length > 0 ||
    b.logements.length + b.trajets.length + b.activites.length + b.plats.length > 0 ||
    b.titreModifie ||
    b.etape > 0
  );
}

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

export function nuitsEntre(debut: string, fin: string): number {
  const [a1, m1, j1] = debut.split('-').map(Number);
  const [a2, m2, j2] = fin.split('-').map(Number);
  return Math.round((new Date(a2, m2 - 1, j2).getTime() - new Date(a1, m1 - 1, j1).getTime()) / 86400000);
}

const deux = (n: number) => String(n).padStart(2, '0');
const iso = (a: number, m: number, j: number) => `${a}-${deux(m)}-${deux(j)}`;

// Dimanche de Pâques (algorithme de Meeus/Jones/Butcher).
export function paques(annee: number): string {
  const a = annee % 19;
  const b = Math.floor(annee / 100);
  const c = annee % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mois = Math.floor((h + l - 7 * m + 114) / 31);
  const jour = ((h + l - 7 * m + 114) % 31) + 1;
  return iso(annee, mois, jour);
}

// Prochain anniversaire d'une date de naissance (aujourd'hui compris) et âge atteint.
export function prochainAnniversaire(naissance: string, aujourdHui = new Date()): { date: string; age: number } | null {
  const [a, m, j] = naissance.split('-').map(Number);
  if (!a || !m || !j) return null;
  let annee = aujourdHui.getFullYear();
  const debut = new Date(aujourdHui.getFullYear(), aujourdHui.getMonth(), aujourdHui.getDate());
  if (new Date(annee, m - 1, j) < debut) annee += 1;
  return { date: iso(annee, m, j), age: annee - a };
}

// Date proposée par l'occasion (à modifier ou compléter).
export function dateDeLOccasion(occasion: Occasion, fete: Personne | null, aujourdHui = new Date()): string | null {
  const debut = new Date(aujourdHui.getFullYear(), aujourdHui.getMonth(), aujourdHui.getDate());
  const prochaine = (m: number, j: number) => {
    let a = aujourdHui.getFullYear();
    if (new Date(a, m - 1, j) < debut) a += 1;
    return iso(a, m, j);
  };
  if (occasion === 'noel') return prochaine(12, 25);
  if (occasion === 'nouvel_an') return prochaine(12, 31);
  if (occasion === 'paques') {
    const a = aujourdHui.getFullYear();
    const p = paques(a);
    return new Date(Number(p.slice(0, 4)), Number(p.slice(5, 7)) - 1, Number(p.slice(8, 10))) < debut ? paques(a + 1) : p;
  }
  if (occasion === 'anniversaire' && fete?.date_naissance) return prochainAnniversaire(fete.date_naissance, aujourdHui)?.date ?? null;
  return null;
}

// Période (saison) d'une date, pour les champs du voyage.
export function periodeDe(dateIso: string): Periode {
  const m = Number(dateIso.slice(5, 7));
  if (m === 12) return 'noel';
  if (m <= 2) return 'hiver';
  if (m <= 5) return 'printemps';
  if (m <= 8) return 'ete';
  if (m === 10 || m === 11) return 'automne';
  return 'automne';
}

export function typeSejourDe(nuits: number | null): TypeSejour {
  if (nuits === null) return 'vacances';
  if (nuits <= 3) return 'weekend';
  if (nuits <= 5) return 'court_sejour';
  return 'vacances';
}

// ---------------------------------------------------------------------------
// Propositions libres : texte ou lien
// ---------------------------------------------------------------------------

export const estLien = (texte: string) => /^(https?:\/\/|www\.)/i.test(texte.trim());

export function adresseComplete(texte: string): string {
  const t = texte.trim();
  return /^https?:\/\//i.test(t) ? t : `https://${t}`;
}

export function domaine(lien: string): string {
  try {
    return new URL(adresseComplete(lien)).hostname.replace(/^www\./, '');
  } catch {
    return lien;
  }
}

// Moyen de transport déduit du site d'un lien.
export function modeDepuisLien(lien: string): ModeTransport | null {
  const d = domaine(lien).toLowerCase();
  if (/brittany|ferries|corsica|dfds|condor|stena|baleària|balearia/.test(d)) return 'bateau';
  if (/sncf|trainline|oui\.sncf|ouigo|eurostar|thalys|trenitalia|renfe/.test(d)) return 'train';
  if (/airfrance|easyjet|ryanair|transavia|volotea|vueling|lufthansa|skyscanner|kayak|google\.[a-z]+\/travel\/flights/.test(d)) return 'avion';
  if (/blablacar|covoiturage/.test(d)) return 'voiture';
  if (/flixbus|blablabus|ouibus/.test(d)) return 'bus';
  return null;
}

export function typeLogementDepuisLien(lien: string): string {
  const l = lien.toLowerCase();
  if (l.includes('airbnb.')) return 'airbnb';
  if (l.includes('gites-de-france')) return 'gites_de_france';
  if (l.includes('abritel.')) return 'abritel';
  if (l.includes('booking.')) return 'booking';
  return 'autre';
}

const euros = (n: number) => `${new Intl.NumberFormat('fr-FR').format(n)} €`;

function cle(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

const majuscule = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

// Proposition « ajoutée à la main » ; le lien se lit ensuite avec lireLien.
export function nouvelleIdee(texte: string, genre: 'hebergement' | 'trajet' | 'activite', mode: ModeTransport): Idee {
  const t = texte.trim();
  const lien = estLien(t);
  return {
    cle: cle(),
    nom: lien ? domaine(t) : majuscule(t),
    detail: lien ? 'Lecture du lien…' : 'Ajouté à la main · lieu et prix facultatifs',
    lien: lien ? adresseComplete(t) : null,
    site: lien ? domaine(t) : null,
    ville: null,
    prix: null,
    image: null,
    capacite: null,
    chambres: null,
    type: lien && genre === 'hebergement' ? typeLogementDepuisLien(t) : null,
    mode: genre === 'trajet' ? (lien ? modeDepuisLien(t) ?? mode : mode) : null,
    lecture: lien,
  };
}

// Lit le lien (fonction Edge lire-annonce) ; en cas d'échec, la proposition
// garde le domaine comme nom et le message explique quoi faire.
export async function lireLien(idee: Idee): Promise<Idee> {
  if (!idee.lien) return { ...idee, lecture: false };
  try {
    const a = await lireAnnonce(idee.lien);
    const depart = a.ville_depart ?? null;
    const arrivee = a.ville_arrivee ?? null;
    const trajet = depart && arrivee ? `${depart} → ${arrivee}` : depart ? `Départ : ${depart}` : arrivee ? `Arrivée : ${arrivee}` : null;
    const morceaux = [
      trajet ?? (a.ville ? `Lieu : ${a.ville}` : null),
      a.prix != null ? `Prix : ${euros(a.prix)}` : null,
    ].filter(Boolean);
    return {
      ...idee,
      nom: a.titre?.trim() || idee.nom,
      // Trajet : le moyen lu sur la page l'emporte sur le moyen choisi ou
      // déduit du site.
      mode: idee.mode && a.mode ? a.mode : idee.mode,
      ville: a.ville ?? arrivee,
      prix: a.prix,
      image: a.image,
      capacite: a.capacite,
      chambres: a.chambres,
      detail: morceaux.length ? morceaux.join(' · ') : 'Lien lu · complétez la fiche si besoin',
      lecture: false,
    };
  } catch (e: any) {
    return { ...idee, detail: String(e?.message ?? 'Lecture impossible : remplissez la fiche à la main.'), lecture: false };
  }
}

// Décision effective d'une liste : une seule proposition vaut décision.
export function decisionEffective(nb: number, choix: Decision | null): Decision {
  if (nb <= 1) return 'decide';
  return choix ?? 'vote';
}

// ---------------------------------------------------------------------------
// Titre automatique
// ---------------------------------------------------------------------------

const MOIS_LONGS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

export function titreAutomatique(
  b: Brouillon,
  personnes: Personne[],
  foyerNom: (id: string) => string | null
): string {
  const premiere = b.plages[0];
  if (b.nature === 'voyage') {
    const dest = b.destination.trim();
    const nuits = premiere ? nuitsEntre(premiere.debut, premiere.fin) : null;
    const quand = premiere
      ? `${MOIS_LONGS[Number(premiere.debut.slice(5, 7)) - 1]} ${premiere.debut.slice(0, 4)}`
      : `${PERIODES.find((p) => p.id === b.periode)?.libelle.toLowerCase() ?? ''} ${b.anneePeriode ?? ''}`.trim();
    if (dest && !b.aChoisir) {
      return nuits !== null && nuits >= 1 && nuits <= 3 ? `Week-end à ${dest}` : `${dest} · ${quand}`;
    }
    return `Voyage en famille · ${quand}`;
  }
  // Repas
  const fete = personnes.find((p) => p.id === b.fetePersonneId) ?? null;
  const chez =
    b.hote === 'ailleurs' ? (b.lieu.trim() ? b.lieu.trim() : null) : b.hote !== 'decider' ? foyerNom(b.hote) : null;
  if (b.occasion === 'anniversaire' && fete) {
    const anniv = fete.date_naissance ? prochainAnniversaire(fete.date_naissance, premiere ? new Date(Number(premiere.debut.slice(0, 4)), Number(premiere.debut.slice(5, 7)) - 1, Number(premiere.debut.slice(8, 10))) : undefined) : null;
    return anniv ? `Les ${anniv.age} ans de ${fete.prenom}` : `Anniversaire de ${fete.prenom}`;
  }
  if (b.occasion === 'noel') return chez ? `Noël chez ${chez}` : 'Noël en famille';
  if (b.occasion === 'nouvel_an') return chez ? `Nouvel an chez ${chez}` : 'Nouvel an en famille';
  if (b.occasion === 'paques') return chez ? `Pâques chez ${chez}` : 'Pâques en famille';
  return chez ? `Repas chez ${chez}` : 'Repas de famille';
}

// ---------------------------------------------------------------------------
// Création
// ---------------------------------------------------------------------------

export type ResultatCreation = { id: string; prevenus: number; vote: boolean };

// Crée l'événement et tout ce que contient le brouillon. Les secrets sont
// posés AVANT les propositions : les personnes cachées ne reçoivent rien.
export async function creerEvenement(
  b: Brouillon,
  ctx: { familleId: string; maPersonneId: string | null; personnes: Personne[] }
): Promise<ResultatCreation> {
  const repas = b.nature === 'repas';
  const premiere = b.plages[0];
  const nuitsPremiere = premiere ? nuitsEntre(premiere.debut, premiere.fin) : null;
  const periode = premiere ? periodeDe(premiere.debut) : b.periode;
  const annee = premiere ? Number(premiere.debut.slice(0, 4)) : b.anneePeriode;

  const formulaire: any = {
    famille_id: ctx.familleId,
    titre: b.titre.trim() || 'Sans titre',
    destination: repas ? (b.hote === 'ailleurs' ? b.lieu.trim() || null : null) : b.aChoisir ? null : b.destination.trim() || null,
    pays: null,
    periode,
    annee,
    type_sejour: repas ? 'autre' : b.plages.length ? typeSejourDe(nuitsPremiere) : b.typeSejour,
    nb_nuits: repas ? 0 : b.plages.length === 1 ? nuitsPremiere : null,
    participation: b.participation,
    description: null,
    nature: b.nature,
    foyer_hote: repas && b.hote !== 'ailleurs' && b.hote !== 'decider' ? b.hote : null,
  };
  if (repas) {
    // Colonnes de la migration 20261028150000 : seulement pour un repas.
    formulaire.occasion = b.occasion === 'repas' ? 'repas' : b.occasion;
    formulaire.fete_personne_id = b.occasion === 'anniversaire' ? b.fetePersonneId : null;
    formulaire.heure_debut = b.heure.trim() || null;
  }

  const id = await creerVoyage(formulaire, b.participation === 'famille' ? [] : b.invites);

  // Propositions venues de l'assistant : marquées à part (voyage.proposes_assistant).
  const marques: { objet_id: string; voyage_id: string; nature: string }[] = [];

  // 1. Surprise : avant tout le reste.
  if (b.surprise) {
    for (const p of b.cachees) await definirSecret(id, p, 'cache').catch(() => {});
  }

  // 2. Dates : une plage = date fixée ; plusieurs = vote (règle posée par la base).
  for (const p of b.plages) {
    const { error } = await supabase.from('propositions_dates').insert({ voyage_id: id, date_debut: p.debut, date_fin: p.fin });
    if (error && (error as any).code !== '23505') throw error;
  }

  if (!repas) {
    // 3. Logement
    const idsLogements: Record<string, string> = {};
    for (const l of b.logements) {
      const { data } = await supabase
        .from('hebergements')
        .insert({
          voyage_id: id,
          nom: l.nom,
          type: l.type ?? 'autre',
          lien: l.lien,
          image: l.image,
          ville: l.ville,
          capacite: l.capacite,
          nb_chambres: l.chambres,
          prix_total: l.prix,
          description: l.lien ? null : 'Ajouté à la main',
        })
        .select('id')
        .single();
      if (data) idsLogements[l.cle] = (data as any).id;
      if (data && l.assistant) marques.push({ objet_id: (data as any).id, voyage_id: id, nature: 'hebergement' });
    }
    if (decisionEffective(b.logements.length, b.decisions.logement) === 'decide' && b.logements.length) {
      const choisi = idsLogements[b.retenus.logement ?? b.logements[0].cle] ?? Object.values(idsLogements)[0];
      if (choisi) await supabase.rpc('retenir_hebergement', { id_hebergement: choisi, garder_autres: false });
    }

    // 4. Trajet
    const idsTrajets: Record<string, string> = {};
    for (const t of b.trajets) {
      const { data } = await supabase
        .from('options_trajet')
        .insert({
          voyage_id: id,
          nom: t.nom,
          description: t.detail,
          mode: t.mode ?? b.modeTrajet,
          lien: t.lien,
          prix: t.prix,
        })
        .select('id')
        .single();
      if (data) idsTrajets[t.cle] = (data as any).id;
      if (data && t.assistant) marques.push({ objet_id: (data as any).id, voyage_id: id, nature: 'trajet' });
    }
    if (decisionEffective(b.trajets.length, b.decisions.trajet) === 'decide' && b.trajets.length) {
      const choisi = idsTrajets[b.retenus.trajet ?? b.trajets[0].cle] ?? Object.values(idsTrajets)[0];
      if (choisi) await supabase.rpc('retenir_option_trajet', { id_option: choisi, retenir: true });
    }

    // 5. Activités : toutes retenues si « C'est décidé », toutes au vote sinon.
    const retenir = decisionEffective(b.activites.length, b.decisions.activites) === 'decide';
    for (const a of b.activites) {
      const { data } = await supabase
        .from('activites')
        .insert({
          voyage_id: id,
          titre: a.nom,
          categorie: 'autre',
          description: a.lien ? null : 'Ajouté à la main',
          lien: a.lien,
          image: a.image,
          adresse: a.ville,
          prix_forfait: a.prix,
        })
        .select('id')
        .single();
      if (data && a.assistant) marques.push({ objet_id: (data as any).id, voyage_id: id, nature: 'activite' });
      if (data && retenir) await supabase.from('activites').update({ statut: 'retenu' }).eq('id', (data as any).id);
    }
  } else {
    // Repas : un repas principal et ses plats. Rien n'est attribué aux invités.
    const jour = premiere?.debut ?? null;
    await enregistrerRepas({ voyage_id: id, titre: b.titre.trim() || 'Repas', jour, moment: b.moment, notes: null });
    if (b.plats.length) {
      const { data: repasCree } = await supabase.from('repas').select('id').eq('voyage_id', id).limit(1).single();
      const repasId = (repasCree as any)?.id as string | undefined;
      if (repasId) {
        for (const p of b.plats) {
          await enregistrerPlat(
            { repas_id: repasId, etape: p.etape as EtapeRepas, titre: p.titre, recette_id: null, quantite: null, notes: null },
            p.moi && ctx.maPersonneId ? [ctx.maPersonneId] : []
          );
        }
      }
    }
    // Liste d'envies de la personne fêtée, liée automatiquement.
    if (b.occasion === 'anniversaire' && b.listeEnvies && b.fetePersonneId) {
      try {
        const { data: liste } = await clientPourSchema('wishlist')
          .from('listes')
          .select('id')
          .eq('destinataire_id', b.fetePersonneId)
          .limit(1)
          .maybeSingle();
        if (liste) await supabase.from('listes_envies').insert({ voyage_id: id, liste_id: (liste as any).id });
      } catch {
        /* liaison facultative : modifiable ensuite depuis l'événement */
      }
    }
  }

  for (const nature of ['hebergement', 'trajet', 'activite']) {
    const lot = marques.filter((m) => m.nature === nature);
    if (lot.length) await supabase.from('proposes_assistant').insert(lot);
  }

  const invitesReels = b.participation === 'famille' ? ctx.personnes.filter((p) => p.utilisateur_id).length - 1 : b.invites.length;
  const prevenus = Math.max(0, invitesReels - (b.surprise ? b.cachees.length : 0));
  return { id, prevenus, vote: b.plages.length >= 2 };
}
