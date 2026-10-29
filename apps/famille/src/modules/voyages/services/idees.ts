import { clientPourSchema } from '../../../services/supabase';
import { appelerAssistant } from '../../../services/assistant';
import { enregistrerPlat, type EtapeRepas } from './repas';
import { supabase } from './supabase';
import { typeLogementDepuisLien, type Brouillon, type Idee, type ModeTransport, type Occasion } from './creation';
import { PERIODES, TYPES_SEJOUR, type Periode, type TypeSejour } from './voyage';
import type { BrouillonVoyage } from '../../../services/brouillonVoyage';

// Idées de l'assistant pendant la création d'un événement (refonte § 5.6,
// routes idees-etape et menu-repas de la fonction ia). Ce sont des BROUILLONS :
// rien n'est ajouté sans que la personne touche « + Ajouter ».

export type EtapeIdees = 'hebergement' | 'trajet' | 'activites';

export type IdeeAssistant = {
  nom: string;
  detail: string;
  lien: string | null;
  prix: number | null;
  mode: string | null;
};

export async function demanderIdees(o: {
  etape: EtapeIdees;
  destination: string;
  dateDebut: string | null;
  dateFin: string | null;
  nbPersonnes: number;
  villesFoyers: string[];
  signal?: AbortSignal;
}): Promise<IdeeAssistant[]> {
  const r = await appelerAssistant<{ idees: IdeeAssistant[] }>(
    'idees-etape',
    {
      etape: o.etape,
      destination: o.destination,
      ...(o.dateDebut ? { date_debut: o.dateDebut, date_fin: o.dateFin ?? o.dateDebut } : {}),
      nb_personnes: o.nbPersonnes,
      villes_foyers: o.villesFoyers,
    },
    { signal: o.signal, delaiMs: o.etape === 'trajet' ? 30000 : 90000 }
  );
  return r.idees;
}

const MODES: ModeTransport[] = ['voiture', 'moto', 'train', 'avion', 'bateau', 'bus', 'velo', 'autre'];

const euros = (n: number) => `${new Intl.NumberFormat('fr-FR').format(n)} €`;

// Une idée de l'assistant devient une proposition ordinaire de l'étape.
export function ideeDepuisAssistant(i: IdeeAssistant, genre: 'hebergement' | 'trajet' | 'activite'): Idee {
  const detail = [i.detail, i.prix != null ? `Prix : ${euros(i.prix)}` : null].filter(Boolean).join(' · ');
  let site: string | null = null;
  if (i.lien) {
    try {
      site = new URL(i.lien).hostname.replace(/^www\./, '');
    } catch {
      site = null;
    }
  }
  return {
    cle: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`,
    nom: i.nom,
    detail: detail || 'Idée de l’assistant',
    lien: i.lien,
    site,
    ville: null,
    prix: i.prix,
    image: null,
    capacite: null,
    chambres: null,
    type: null,
    mode: genre === 'trajet' ? (MODES.includes(i.mode as ModeTransport) ? (i.mode as ModeTransport) : 'autre') : null,
    lecture: false,
    assistant: true,
  };
}

// Villes de départ des foyers (jamais l'adresse complète) : le code postal
// et la ville, lus dans « 12 rue des Lilas, 35000 Rennes ».
export async function villesDesFoyers(foyerIds: string[]): Promise<string[]> {
  const ids = [...new Set(foyerIds.filter(Boolean))];
  if (!ids.length) return [];
  const { data, error } = await clientPourSchema('voyage').from('adresses_foyers').select('adresse').in('foyer_id', ids);
  if (error) return [];
  const villes = ((data ?? []) as { adresse: string | null }[])
    .map((l) => String(l.adresse ?? '').match(/\b\d{5}\s+([^,\d]{2,40})\s*$/)?.[1]?.trim() ?? null)
    .filter((v): v is string => !!v);
  return [...new Set(villes)].slice(0, 6);
}

// --- Menu d'un repas -----------------------------------------------------------

export type PlatPropose = { titre: string; categorie: EtapeRepas; quantite: string | null };

export async function demanderMenu(o: {
  occasion: Occasion;
  nbInvites: number;
  date: string | null;
  moment: 'dejeuner' | 'diner' | null;
  plats: { titre: string; categorie: string }[];
  quantites?: boolean;
  precisions?: string;
  signal?: AbortSignal;
}): Promise<{ plats: PlatPropose[]; question: string | null }> {
  return appelerAssistant(
    'menu-repas',
    {
      occasion: o.occasion,
      nb_invites: o.nbInvites,
      ...(o.date ? { date: o.date } : {}),
      ...(o.moment ? { moment: o.moment } : {}),
      plats: o.plats,
      quantites: !!o.quantites,
      ...(o.precisions ? { precisions: o.precisions } : {}),
    },
    { signal: o.signal, delaiMs: 30000 }
  );
}

// --- Brouillon de l'assistant → assistant pas à pas -----------------------------

const cleIdee = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

const OCCASIONS_CONNUES: Occasion[] = ['repas', 'noel', 'nouvel_an', 'paques', 'anniversaire'];

// Applique un brouillon de la route voyage-brouillon au brouillon de l'assistant
// pas à pas : « Dites ce que vous voulez organiser » (feuille ⊕) et « Le dire
// en une phrase à l'assistant » (étape 1 d'un voyage). Rien n'est créé : la
// personne vérifie chaque étape avant « Proposer ». Ce qui manque reste vide.
export function appliquerBrouillonAssistant(b: Brouillon, r: BrouillonVoyage): Brouillon {
  const repas = (r.nature ?? b.nature) === 'repas';
  const suivant: Brouillon = {
    ...b,
    titre: r.titre || b.titre,
    titreModifie: !!r.titre || b.titreModifie,
    plages: r.dates.length ? r.dates.map((d) => ({ debut: d.debut, fin: repas ? d.debut : d.fin })) : b.plages,
  };

  if (repas) {
    const occasion = OCCASIONS_CONNUES.includes(r.occasion as Occasion) ? (r.occasion as Occasion) : b.occasion;
    return {
      ...suivant,
      occasion,
      fetePersonneId: occasion === 'anniversaire' ? r.fete_personne_id ?? b.fetePersonneId : b.fetePersonneId,
      // Lieu cité dans la phrase (« chez Paul », « restaurant Le Relais ») : gardé tel quel.
      hote: r.destination ? 'ailleurs' : b.hote,
      lieu: r.destination ?? b.lieu,
    };
  }

  const logements: Idee[] = r.hebergements.map((h) => ({
    cle: cleIdee(),
    nom: h.nom,
    detail:
      [
        h.ville ? `Lieu : ${h.ville}` : null,
        h.prix_total != null ? `Prix : ${h.prix_total} €` : h.prix_nuit != null ? `Prix : ${h.prix_nuit} € la nuit` : null,
      ]
        .filter(Boolean)
        .join(' · ') || 'Idée de l’assistant',
    lien: h.lien,
    site: null,
    ville: h.ville,
    prix: h.prix_total,
    image: null,
    capacite: h.capacite,
    chambres: h.nb_chambres,
    type: h.type ?? typeLogementDepuisLien(h.lien),
    mode: null,
    lecture: false,
    assistant: true,
  }));
  const activites: Idee[] = r.activites.map((a) => ({
    cle: cleIdee(),
    nom: a.titre,
    detail: a.description ?? 'Idée de l’assistant',
    lien: a.lien,
    site: null,
    ville: null,
    prix: a.prix_adulte,
    image: null,
    capacite: null,
    chambres: null,
    type: null,
    mode: null,
    lecture: false,
    assistant: true,
  }));
  return {
    ...suivant,
    destination: r.destination ?? b.destination,
    aChoisir: r.destination ? false : b.aChoisir,
    periode: PERIODES.some((p) => p.id === r.periode) ? (r.periode as Periode) : b.periode,
    anneePeriode: r.annee ?? b.anneePeriode,
    typeSejour: TYPES_SEJOUR.some((t) => t.id === r.type_sejour) ? (r.type_sejour as TypeSejour) : b.typeSejour,
    logements: logements.length ? logements : b.logements,
    activites: activites.length ? activites : b.activites,
  };
}


// --- Panneau assistant de la page d'un événement (refonte § 8.1) ---------------

export type SuggestionEvenement = 'programme' | 'pluie' | 'budget' | 'equilibrer' | 'quantites' | 'dessert';

export type AjoutSuggere = { type: 'activite' | 'plat'; titre: string; detail: string | null; categorie: string | null };

export async function demanderSuggestion(o: {
  nature: 'voyage' | 'repas';
  suggestion: SuggestionEvenement;
  titre: string;
  destination: string | null;
  dateDebut: string | null;
  dateFin: string | null;
  nbPersonnes: number;
  activites?: string[];
  logement?: string | null;
  budgetTotal?: number;
  plats?: { titre: string; categorie: string }[];
  signal?: AbortSignal;
}): Promise<{ suggestion: SuggestionEvenement; reponse: string; ajouts: AjoutSuggere[] }> {
  return appelerAssistant(
    'evenement-suggestion',
    {
      nature: o.nature,
      suggestion: o.suggestion,
      titre: o.titre,
      ...(o.destination ? { destination: o.destination } : {}),
      ...(o.dateDebut ? { date_debut: o.dateDebut, date_fin: o.dateFin ?? o.dateDebut } : {}),
      nb_personnes: o.nbPersonnes,
      ...(o.activites ? { activites: o.activites } : {}),
      ...(o.logement ? { logement: o.logement } : {}),
      ...(o.budgetTotal ? { budget_total: o.budgetTotal } : {}),
      ...(o.plats ? { plats: o.plats } : {}),
    },
    { signal: o.signal, delaiMs: 30000 }
  );
}

// Ajoute à l'événement ce que la personne a coché. Les activités arrivent « proposées »
// (au vote) et marquées « Idée de l'assistant » ; les plats vont dans le premier repas,
// sans responsable. Renvoie le nombre d'éléments ajoutés.
export async function ajouterSuggestions(o: { voyageId: string; repasId: string | null; ajouts: AjoutSuggere[] }): Promise<number> {
  let n = 0;
  for (const a of o.ajouts) {
    if (a.type === 'activite') {
      const { data, error } = await supabase
        .from('activites')
        .insert({ voyage_id: o.voyageId, titre: a.titre, categorie: 'autre', description: a.detail })
        .select('id')
        .single();
      if (error) throw error;
      n++;
      if (data) await supabase.from('proposes_assistant').insert({ objet_id: (data as any).id, voyage_id: o.voyageId, nature: 'activite' });
    } else if (o.repasId) {
      const etape = (a.categorie ?? 'plat') as EtapeRepas;
      await enregistrerPlat({ repas_id: o.repasId, etape, titre: a.titre, recette_id: null, quantite: null, notes: a.detail }, []);
      n++;
    }
  }
  return n;
}
