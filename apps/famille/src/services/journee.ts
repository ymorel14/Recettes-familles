import { personnesMasqueesFamilleActive } from '@apps-famille/famille';
import type { Familles } from './familles';
import {
  activitesSemaine,
  definirResponsable,
  heureCourte,
  type SeanceSemaine,
} from '../modules/quotidien/services/quotidien';
import { listerPersonnes as listerPersonnesFoyer } from '../modules/quotidien/services/personnes';
import { lundiDe, tachesCalendrier, tachesDuJour, type TacheDuJour } from '../modules/quotidien/services/maison';
import { listerVoyages } from '../modules/voyages/services/voyage';
import { listerPersonnes, mesParticipations, mesReservations, type MaParticipation, type MaReservation } from '../modules/cadeaux/services/wishlist';
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

// familleId : toutes les familles du foyer (vue unique, G-2).
type Contexte = { familleId: Familles; foyerId: string; foyersFamille: string[] };

// --- Activités et trajets (Quotidien) ----------------------------------------

// Séances des enfants du foyer entre deux dates (incluses), séances annulées
// exclues. Un appel par semaine (lundi → dimanche).
async function lireSeances(du: string, au: string): Promise<SeanceSemaine[]> {
  const lundis: string[] = [];
  for (let l = lundiDe(du); l <= au; l = ajouterJours(l, 7)) lundis.push(l);
  const lots = await Promise.all(lundis.map((l) => activitesSemaine(l)));
  return lots.flat().filter((s) => s.statut !== 'annulee' && s.date >= du && s.date <= au);
}

function trajetsVersElements(s: SeanceSemaine): ElementAgenda[] {
  const enfants = s.enfants.join(', ');
  return s.trajets.map((t) => {
    let statut: ElementAgenda['statut'];
    if (t.vide) statut = { texte: 'Personne', ton: 'alerte' };
    else if (t.responsable) statut = { texte: t.moi ? 'Vous conduisez' : `${t.responsable} conduit`, ton: 'succes' };
    else if (t.propose) statut = { texte: t.foyer ? 'Proposé : à accepter' : `${t.conducteur ?? 'Quelqu’un'} : à confirmer`, ton: 'attention' };
    else statut = { texte: t.foyer ? 'Notre foyer conduit' : `${t.conducteur ?? 'Quelqu’un'} conduit`, ton: 'succes' };
    return {
      cle: `trajet-${t.id}`,
      module: 'quotidien' as const,
      date: s.date,
      heure: heureCourte(t.heure),
      titre: `${s.activite} · ${t.sens === 'aller' ? 'aller' : 'retour'}`,
      detail: [s.lieu, enfants].filter(Boolean).join(' · ') || null,
      statut,
      cible: { onglet: 'Activites' },
    };
  });
}

// « Je m'en occupe » : l'adulte connecté devient responsable du trajet.
export async function jeMEnOccuper(idTrajet: string, foyerId: string, utilisateurId: string): Promise<void> {
  const personnes = await listerPersonnesFoyer([foyerId]);
  const moi = personnes.find((p) => p.utilisateur_id === utilisateurId);
  if (!moi) throw new Error('Votre fiche personne est introuvable.');
  await definirResponsable(idTrajet, { personneId: moi.id });
}

// --- Agenda complet ----------------------------------------------------------

export async function elementsAgenda(du: string, au: string, ctx: Contexte): Promise<ElementAgenda[]> {
  const [seances, taches, voyages, personnes, masquees] = await Promise.all([
    sansErreur(lireSeances(du, au), [] as SeanceSemaine[]),
    sansErreur(tachesCalendrier(du, au), []),
    sansErreur(listerVoyages(ctx.familleId), []),
    sansErreur(listerPersonnes(ctx.foyersFamille.length ? ctx.foyersFamille : [ctx.foyerId]), []),
    sansErreur(personnesMasqueesFamilleActive(), new Set<string>()),
  ]);
  const elements: ElementAgenda[] = [];

  seances.forEach((s) => elements.push(...trajetsVersElements(s)));

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

// --- À prévoir (retour de test G-3) ----------------------------------------
// Sous « Aujourd'hui » : ce qui arrive bientôt et qu'on peut préparer.
// - tâches datées des prochains jours (7 ou 14, réglage de Moi) ;
// - anniversaires dans moins de 3 semaines pour lesquels je n'ai encore
//   rien réservé ;
// - cadeaux réservés (ou pots communs) pas encore achetés.
// Le plus proche d'abord.

export const SEUIL_RAPPEL_CADEAU_JOURS = 21;

export type ElementAPrevoir = ElementAgenda & {
  // Anniversaire : la liste de la personne s'ouvre (résolue au toucher).
  personneId?: string;
};

export async function aPrevoir(
  ctx: Contexte,
  horizonJours: number,
  monUtilisateurId: string
): Promise<ElementAPrevoir[]> {
  const aujourdHui = isoDu(new Date());
  const demain = ajouterJours(aujourdHui, 1);
  const finTaches = ajouterJours(aujourdHui, horizonJours);
  const finCadeaux = ajouterJours(aujourdHui, SEUIL_RAPPEL_CADEAU_JOURS);
  const [taches, personnes, reservations, participations] = await Promise.all([
    sansErreur(tachesCalendrier(demain, finTaches), []),
    sansErreur(listerPersonnes(ctx.foyersFamille.length ? ctx.foyersFamille : [ctx.foyerId]), []),
    sansErreur(mesReservations(), [] as MaReservation[]),
    sansErreur(mesParticipations(), [] as MaParticipation[]),
  ]);
  const elements: ElementAPrevoir[] = [];

  // Tâches à venir (pas celles d'aujourd'hui ni les retards : déjà dans
  // « Aujourd'hui »). Une tâche répétée n'apparaît qu'une fois, la prochaine.
  const vues = new Set<string>();
  taches
    .filter((t) => !t.fait_le && !t.en_retard)
    .map((t) => ({ t, date: t.planif === 'avant' ? t.fin : t.debut }))
    .filter(({ date }) => !!date && date >= demain && date <= finTaches)
    .sort((a, b) => a.date.localeCompare(b.date))
    .forEach(({ t, date }) => {
      if (vues.has(t.tache_id)) return;
      vues.add(t.tache_id);
      elements.push({
        cle: `aprevoir-tache-${t.tache_id}`,
        module: 'quotidien',
        date,
        heure: null,
        titre: t.libelle,
        detail: t.planif === 'avant' ? `Avant ${dateEnClair(date).toLowerCase()}` : capitaliser(dansCombien(date, aujourdHui)),
        statut: null,
        cible: { onglet: 'Taches' },
      });
    });

  // Cadeaux en cours (réservés ou en pot, pas encore offerts), par destinataire.
  const actifs = [...reservations, ...participations].filter((r) => !r.offert_le && !r.souhait?.supprime_le);
  const pourQui = new Set<string>();
  actifs.forEach((r) => {
    const liste = r.souhait?.liste;
    if (liste?.destinataire_id) pourQui.add(liste.destinataire_id);
    liste?.destinataires?.forEach((d) => pourQui.add(d.personne_id));
  });

  // Anniversaires proches sans rien de réservé.
  personnes.forEach((p) => {
    if (!p.date_naissance || p.utilisateur_id === monUtilisateurId || pourQui.has(p.id)) return;
    const [, m, j] = p.date_naissance.split('-').map(Number);
    for (const annee of [dateDe(aujourdHui).getFullYear(), dateDe(aujourdHui).getFullYear() + 1]) {
      const iso = `${annee}-${String(m).padStart(2, '0')}-${String(j).padStart(2, '0')}`;
      if (iso < aujourdHui || iso > finCadeaux) continue;
      elements.push({
        cle: `aprevoir-anniv-${p.id}-${annee}`,
        module: 'cadeaux',
        date: iso,
        heure: null,
        titre: `Anniversaire de ${p.prenom} ${dansCombien(iso, aujourdHui)}`,
        detail: 'Vous n’avez encore rien réservé',
        statut: null,
        cible: { onglet: 'Famille' },
        personneId: p.id,
      });
    }
  });

  // Réservés à acheter : un seul rappel, vers « À offrir ».
  const aAcheter = reservations.filter((r) => !r.offert_le && !r.achete && !r.souhait?.supprime_le).length;
  const potsAVerser = participations.filter((p) => !p.offert_le && !p.verse && !p.souhait?.supprime_le).length;
  if (aAcheter + potsAVerser > 0) {
    const morceaux = [
      aAcheter ? `${aAcheter} cadeau${aAcheter > 1 ? 'x' : ''} réservé${aAcheter > 1 ? 's' : ''} à acheter` : null,
      potsAVerser ? `${potsAVerser} participation${potsAVerser > 1 ? 's' : ''} à verser` : null,
    ].filter(Boolean);
    elements.push({
      cle: 'aprevoir-a-acheter',
      module: 'cadeaux',
      date: aujourdHui,
      heure: null,
      titre: morceaux.join(' · '),
      detail: 'Dans « À offrir »',
      statut: null,
      cible: { onglet: 'AOffrir' },
    });
  }

  return elements.sort((a, b) => a.date.localeCompare(b.date));
}

function capitaliser(t: string): string {
  return t.charAt(0).toUpperCase() + t.slice(1);
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
  const [seances, taches, aRacheter] = await Promise.all([
    sansErreur(lireSeances(aujourdHui, ajouterJours(aujourdHui, 2)), [] as SeanceSemaine[]),
    sansErreur(tachesDuJour(aujourdHui), [] as TacheDuJour[]),
    sansErreur(listerARacheter(), [] as ARacheter[]),
  ]);
  const actions: ActionAFaire[] = [];

  seances.forEach((sc) =>
    sc.trajets.forEach((t) => {
      const quand = `${dansCombien(sc.date, aujourdHui)} à ${heureEnClair(heureCourte(t.heure))}`;
      if (t.propose && t.foyer) {
        actions.push({
          cle: `accepter-${t.id}`,
          module: 'quotidien',
          titre: `Conduire ${sc.activite} (${t.sens})`,
          detail: `Le planning vous propose ce trajet, ${quand}`,
          bouton: 'J’accepte',
          executer: () => fonctions.accepterTrajet(t.id),
          cible: { onglet: 'Activites' },
        });
      } else if (t.vide) {
        actions.push({
          cle: `conduire-${t.id}`,
          module: 'quotidien',
          titre: `Personne pour ${t.sens === 'aller' ? 'emmener' : 'ramener'} : ${sc.activite}`,
          detail: `${t.sens === 'aller' ? 'Aller' : 'Retour'} ${quand}`,
          bouton: 'Je m’en occupe',
          executer: () => fonctions.prendreTrajet(t.id),
          cible: { onglet: 'Activites' },
        });
      }
    })
  );

  taches.forEach((t) => {
    if (t.realisation?.etat === 'faite') {
      actions.push({
        cle: `valider-${t.realisation.id}`,
        module: 'quotidien',
        titre: `${t.realisation.prenom ?? 'Quelqu’un'} a fini : ${t.libelle}`,
        detail: 'À valider',
        bouton: 'Valider',
        executer: () => fonctions.validerRealisation(t.realisation!.id),
        cible: { onglet: 'ArgentPoche' },
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
// Seulement les tâches de la maison : celles des enfants sont dans Argent de poche.
export async function tachesAFaireAujourdhui(): Promise<TacheDuJour[]> {
  const t = await sansErreur(tachesDuJour(isoDu(new Date())), [] as TacheDuJour[]);
  return t.filter((x) => !x.realisation && (!x.type || x.type === 'maison'));
}

// Souvenirs de ce jour-là, les années précédentes (« Il y a un an »).
export async function souvenirsDuJour(familleId: Familles): Promise<Souvenir[]> {
  return sansErreur(ceJourLa(isoDu(new Date()), familleId), [] as Souvenir[]);
}
