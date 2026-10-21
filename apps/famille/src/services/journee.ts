import { personnesMasqueesFamilleActive } from '@apps-famille/famille';
import {
  heureCourte,
  listerGroupes,
  listerParticipants,
  listerTrajets,
  mesParticipants,
  type Trajet,
} from '../modules/quotidien/services/quotidien';
import { tachesCalendrier, tachesDuJour, type TacheDuJour } from '../modules/quotidien/services/maison';
import { listerVoyages } from '../modules/voyages/services/voyage';
import { listerPersonnes } from '../modules/cadeaux/services/wishlist';
import { ceJourLa, type Souvenir } from '../modules/souvenirs/services/souvenirs';
import { listerARacheter, rythmeAchat, type ARacheter } from '../modules/courses/services/courses';
import { clientPourSchema } from './supabase';
import type { IdModule } from '../theme/jetons';

// Lectures communes de l'accueil et de l'Agenda, tous modules confondus
// (spécification § 2.4). Uniquement les fonctions des modules, donc les
// mêmes règles RLS : chacun ne voit que ce qu'il a le droit de voir (rien
// de caché pour les surprises). Une source en panne n'empêche pas les autres.

export type ElementAgenda = {
  cle: string;
  module: IdModule;
  date: string; // AAAA-MM-JJ
  heure: string | null; // "17:30"
  titre: string;
  detail: string | null;
  statut: { texte: string; ton: 'succes' | 'attention' | 'alerte' | 'neutre' } | null;
  cible: { ecran?: string; params?: Record<string, any>; onglet?: string };
};

export type ActionAFaire = {
  cle: string;
  module: IdModule;
  titre: string;
  detail: string;
  bouton: string;
  executer: () => Promise<void>;
  cible?: ElementAgenda['cible'];
};

export function isoDu(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function dateDe(iso: string): Date {
  const [a, m, j] = iso.split('-').map(Number);
  return new Date(a, m - 1, j);
}

export function ajouterJours(iso: string, n: number): string {
  const d = dateDe(iso);
  d.setDate(d.getDate() + n);
  return isoDu(d);
}

// « Lundi 19 octobre »
export function dateEnClair(iso: string): string {
  const t = dateDe(iso).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  return t.charAt(0).toUpperCase() + t.slice(1);
}

// « aujourd'hui », « demain », « dans 12 jours »
export function dansCombien(iso: string, aujourdHui = isoDu(new Date())): string {
  const jours = Math.round((dateDe(iso).getTime() - dateDe(aujourdHui).getTime()) / 86400000);
  if (jours === 0) return 'aujourd’hui';
  if (jours === 1) return 'demain';
  if (jours < 0) return `il y a ${-jours} jour${jours < -1 ? 's' : ''}`;
  return `dans ${jours} jours`;
}

// "17:30" → "17h30"
export function heureEnClair(heure: string | null): string {
  if (!heure) return '';
  const [h, m] = heure.split(':');
  return `${Number(h)}h${m}`;
}

async function sansErreur<T>(promesse: Promise<T>, defaut: T): Promise<T> {
  try {
    return await promesse;
  } catch {
    return defaut;
  }
}

type Contexte = { familleId: string; foyerId: string; foyersFamille: string[] };

// --- Trajets (Quotidien) -----------------------------------------------------

type DonneesTrajets = { trajets: Trajet[]; mesParticipantsIds: Set<string>; noms: Map<string, string> };

async function lireTrajets(du: string, au: string, foyerId: string): Promise<DonneesTrajets> {
  const groupes = await listerGroupes();
  if (!groupes.length) return { trajets: [], mesParticipantsIds: new Set(), noms: new Map() };
  const [trajets, participants] = await Promise.all([listerTrajets(du, au), listerParticipants(groupes.map((g) => g.id))]);
  return {
    trajets: trajets.filter((t) => t.statut !== 'annulee'),
    mesParticipantsIds: new Set(mesParticipants(participants, foyerId).map((p) => p.id)),
    noms: new Map(participants.map((p) => [p.id, p.nom_affiche])),
  };
}

function trajetVersElement(t: Trajet, d: DonneesTrajets): ElementAgenda {
  const moi = !!t.conducteur_id && d.mesParticipantsIds.has(t.conducteur_id);
  const conducteur = t.conducteur_id ? d.noms.get(t.conducteur_id) ?? 'Quelqu’un' : null;
  const enfants = t.enfants.map((e) => e.prenom).join(', ');
  let statut: ElementAgenda['statut'] = null;
  if (!t.conducteur_id) statut = { texte: 'Conducteur à trouver', ton: 'alerte' };
  else if (t.propose) statut = { texte: moi ? 'Proposé : à accepter' : `${conducteur} : à confirmer`, ton: 'attention' };
  else statut = { texte: moi ? 'Vous conduisez' : `${conducteur} conduit`, ton: 'succes' };
  return {
    cle: `trajet-${t.id}`,
    module: 'quotidien',
    date: t.date,
    heure: heureCourte(t.heure),
    titre: `${t.activite} · ${t.sens === 'aller' ? 'aller' : 'retour'}`,
    detail: [t.lieu, enfants].filter(Boolean).join(' · ') || null,
    statut,
    cible: { ecran: 'Groupe', params: { id: t.groupe_id } },
  };
}

// --- Agenda complet ----------------------------------------------------------

export async function elementsAgenda(du: string, au: string, ctx: Contexte): Promise<ElementAgenda[]> {
  const [trajets, taches, voyages, personnes, masquees] = await Promise.all([
    sansErreur(lireTrajets(du, au, ctx.foyerId), null),
    sansErreur(tachesCalendrier(du, au), []),
    sansErreur(listerVoyages(ctx.familleId), []),
    sansErreur(listerPersonnes(ctx.foyersFamille.length ? ctx.foyersFamille : [ctx.foyerId]), []),
    sansErreur(personnesMasqueesFamilleActive(), new Set<string>()),
  ]);
  const elements: ElementAgenda[] = [];

  if (trajets) trajets.trajets.forEach((t) => elements.push(trajetVersElement(t, trajets)));

  taches.forEach((t) => {
    const date = t.planif === 'avant' ? t.fin : t.debut;
    if (!date) return;
    const jour = date < du && t.en_retard ? du : date;
    if (jour < du || jour > au) return;
    elements.push({
      cle: `tache-${t.tache_id}-${t.debut}`,
      module: 'quotidien',
      date: jour,
      heure: null,
      titre: t.libelle,
      detail:
        t.planif === 'avant'
          ? `Avant le ${dateDe(t.fin).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}`
          : t.planif === 'entre'
            ? `Jusqu’au ${dateDe(t.fin).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}`
            : t.domaine,
      statut: t.fait_le
        ? { texte: 'Fait', ton: 'succes' }
        : t.en_retard
          ? { texte: 'En retard', ton: 'alerte' }
          : null,
      cible: { onglet: 'Taches' },
    });
  });

  voyages.forEach((v) => {
    if (!v.date_debut || v.statut === 'annule') return;
    const fin = v.date_fin ?? v.date_debut;
    if (fin < du || v.date_debut > au) return;
    const date = v.date_debut < du ? du : v.date_debut;
    elements.push({
      cle: `voyage-${v.id}`,
      module: 'voyages',
      date,
      heure: null,
      titre: v.titre,
      detail:
        v.nature === 'repas'
          ? 'Repas de famille'
          : fin !== v.date_debut
            ? `Jusqu’au ${dateDe(fin).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}`
            : 'Voyage',
      statut: v.statut === 'confirme' ? { texte: 'Confirmé', ton: 'succes' } : v.statut === 'organisation' ? { texte: 'En préparation', ton: 'neutre' } : null,
      cible: { ecran: 'Voyage', params: { voyageId: v.id } },
    });
  });

  // Anniversaires (date de naissance renseignée), sans les enfants masqués
  // dans la famille affichée.
  const debutAnnee = dateDe(du).getFullYear();
  personnes.forEach((p) => {
    if (!p.date_naissance || masquees.has(p.id)) return;
    const [an, m, j] = p.date_naissance.split('-').map(Number);
    for (const annee of [debutAnnee, debutAnnee + 1]) {
      const iso = `${annee}-${String(m).padStart(2, '0')}-${String(j).padStart(2, '0')}`;
      if (iso < du || iso > au) continue;
      elements.push({
        cle: `anniv-${p.id}-${annee}`,
        module: 'cadeaux',
        date: iso,
        heure: null,
        titre: `Anniversaire de ${p.prenom}`,
        detail: an ? `${annee - an} ans` : null,
        statut: null,
        cible: { onglet: 'Famille' },
      });
    }
  });

  return elements.sort((a, b) => (a.date + (a.heure ?? '00:00')).localeCompare(b.date + (b.heure ?? '00:00')));
}

// --- Actions directes (« À faire pour vous ») -------------------------------

export async function actionsAFaire(
  ctx: Contexte,
  fonctions: {
    prendreTrajet: (id: string) => Promise<void>;
    accepterTrajet: (id: string) => Promise<void>;
    validerRealisation: (id: string) => Promise<void>;
  }
): Promise<ActionAFaire[]> {
  const aujourdHui = isoDu(new Date());
  const [trajets, taches, aRacheter] = await Promise.all([
    sansErreur(lireTrajets(aujourdHui, ajouterJours(aujourdHui, 2), ctx.foyerId), null),
    sansErreur(tachesDuJour(aujourdHui), [] as TacheDuJour[]),
    sansErreur(listerARacheter(), [] as ARacheter[]),
  ]);
  const actions: ActionAFaire[] = [];

  trajets?.trajets.forEach((t) => {
    const quand = `${dansCombien(t.date, aujourdHui)} à ${heureEnClair(heureCourte(t.heure))}`;
    if (t.propose && t.conducteur_id && trajets.mesParticipantsIds.has(t.conducteur_id)) {
      actions.push({
        cle: `accepter-${t.id}`,
        module: 'quotidien',
        titre: `Conduire ${t.activite} (${t.sens})`,
        detail: `Le planning vous propose ce trajet, ${quand}`,
        bouton: 'J’accepte',
        executer: () => fonctions.accepterTrajet(t.id),
        cible: { ecran: 'Groupe', params: { id: t.groupe_id } },
      });
    } else if (!t.conducteur_id) {
      actions.push({
        cle: `conduire-${t.id}`,
        module: 'quotidien',
        titre: `Conducteur à trouver : ${t.activite}`,
        detail: `${t.sens === 'aller' ? 'Aller' : 'Retour'} ${quand}`,
        bouton: 'Je conduis',
        executer: () => fonctions.prendreTrajet(t.id),
        cible: { ecran: 'Groupe', params: { id: t.groupe_id } },
      });
    }
  });

  taches.forEach((t) => {
    if (t.realisation?.etat === 'faite') {
      actions.push({
        cle: `valider-${t.realisation.id}`,
        module: 'quotidien',
        titre: `${t.realisation.prenom ?? 'Quelqu’un'} a fini : ${t.libelle}`,
        detail: `${t.points} points à valider`,
        bouton: 'Valider',
        executer: () => fonctions.validerRealisation(t.realisation!.id),
        cible: { onglet: 'Taches' },
      });
    }
  });

  // « Café à racheter ? » (spécification § 4.2.2) : deux au plus, ajoutés à
  // la liste principale du foyer d'un appui.
  aRacheter
    .filter((r) => r.foyer_id === ctx.foyerId)
    .slice(0, 2)
    .forEach((r) => {
      actions.push({
        cle: `racheter-${r.cle}`,
        module: 'courses',
        titre: `${r.libelle} à racheter ?`,
        detail: `Acheté ${rythmeAchat(r)}, la dernière fois ${dansCombien(r.dernier_achat, aujourdHui)}`,
        bouton: 'Ajouter',
        executer: () => ajouterAListePrincipale(ctx.foyerId, r),
        cible: { onglet: 'Listes' },
      });
    });

  return actions;
}

// Ajoute un produit à racheter dans la liste principale du foyer.
async function ajouterAListePrincipale(foyerId: string, r: ARacheter): Promise<void> {
  const courses = clientPourSchema('courses');
  const { data: liste, error } = await courses
    .from('listes')
    .select('id')
    .eq('foyer_id', foyerId)
    .eq('principale', true)
    .maybeSingle();
  if (error || !liste) throw error ?? new Error('Pas de liste principale.');
  const { error: erreurAjout } = await courses.from('articles').insert({
    liste_id: (liste as any).id,
    libelle: r.libelle,
    quantite: r.quantite,
    unite: r.unite,
    ...(r.rayon_id ? { rayon_id: r.rayon_id } : {}),
  });
  if (erreurAjout) throw erreurAjout;
}

// Tâches du jour pas encore faites (bloc « Aujourd'hui »).
export async function tachesAFaireAujourdhui(): Promise<TacheDuJour[]> {
  const t = await sansErreur(tachesDuJour(isoDu(new Date())), [] as TacheDuJour[]);
  return t.filter((x) => !x.realisation);
}

// Souvenirs de ce jour-là, les années précédentes (« Il y a un an »).
export async function souvenirsDuJour(familleId: string): Promise<Souvenir[]> {
  return sansErreur(ceJourLa(isoDu(new Date()), familleId), [] as Souvenir[]);
}
