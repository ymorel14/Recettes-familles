import { z, ErreurIA, type Route } from '../../_partage/ia.ts';
import { aujourdHuiParis, texteRecu } from '../../_partage/contexte.ts';
import { CONSIGNE } from '../../_partage/consignes/voyage-brouillon.ts';

// Brouillon de voyage (spécification § 4.5.1) : « Organise-nous un week-end
// en Bretagne en novembre ». Contexte lu AU JETON DE L'UTILISATEUR (règles
// RLS) : invités (nombre d'adultes, âges des enfants : jamais de nom),
// périodes où ils ne sont pas libres (calendrier commun, sans les motifs),
// adresse de départ de son foyer. Sonnet 5.5, effort medium, recherche web
// (5 au plus). Le résultat est un BROUILLON : l'app le montre, l'organisateur
// coche ce qu'il garde, et la création passe par les fonctions existantes
// (qui appliquent la règle « surprise »). ~0,15 $.
const TYPES_SEJOUR = ['weekend', 'court_sejour', 'vacances', 'etranger', 'autre'];
const PERIODES = ['printemps', 'ete', 'automne', 'toussaint', 'noel', 'hiver', 'autre'];
const TYPES_HEBERGEMENT = ['airbnb', 'gites_de_france', 'abritel', 'booking', 'hotel', 'camping', 'location', 'chez_famille', 'autre'];
const CATEGORIES = ['visite', 'chateau', 'musee', 'parc_attraction', 'parc_animalier', 'restaurant', 'nature', 'plage', 'sport', 'spectacle', 'marche', 'autre'];

const NATURES = ['voyage', 'repas'];
const OCCASIONS = ['repas', 'noel', 'nouvel_an', 'paques', 'anniversaire'];

const Schema = z.object({
  nature: z.string(),
  occasion: z.string().nullable(),
  fete_prenom: z.string().nullable(),
  titre: z.string(),
  destination: z.string().nullable(),
  pays: z.string().nullable(),
  type_sejour: z.string(),
  periode: z.string(),
  annee: z.number().nullable(),
  nb_nuits: z.number().nullable(),
  dates: z.array(z.object({ debut: z.string(), fin: z.string(), raison: z.string().nullable() })),
  hebergements: z.array(
    z.object({
      nom: z.string(),
      type: z.string(),
      lien: z.string(),
      ville: z.string().nullable(),
      capacite: z.number().nullable(),
      nb_chambres: z.number().nullable(),
      prix_total: z.number().nullable(),
      prix_nuit: z.number().nullable(),
      description: z.string().nullable(),
    })
  ),
  activites: z.array(
    z.object({
      titre: z.string(),
      categorie: z.string(),
      description: z.string().nullable(),
      lien: z.string().nullable(),
      prix_adulte: z.number().nullable(),
      prix_enfant: z.number().nullable(),
    })
  ),
  programme: z.array(z.string()),
  budget: z.object({ min: z.number().nullable(), max: z.number().nullable(), detail: z.string().nullable() }),
  question: z.string().nullable(),
});

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const ISO = (d: Date) => d.toISOString().slice(0, 10);

function jourParis(): string {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' });
}

function ajouter(iso: string, jours: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + jours);
  return ISO(d);
}

function age(naissance: string | null, jour: string): number | null {
  if (!naissance || !DATE.test(naissance)) return null;
  let a = Number(jour.slice(0, 4)) - Number(naissance.slice(0, 4));
  if (jour.slice(5) < naissance.slice(5)) a -= 1;
  return a >= 0 && a < 130 ? a : null;
}

// Même page : même hôte (sans « www. ») et même chemin, sans paramètres.
function cleUrl(u: string): string | null {
  try {
    const x = new URL(u.trim());
    if (!/^https?:$/.test(x.protocol)) return null;
    return `${x.hostname.replace(/^www\./, '').toLowerCase()}${x.pathname.replace(/\/+$/, '')}`;
  } catch {
    return null;
  }
}

type Periode = { personne_id: string; debut: string; fin: string; etat: string };

export const voyageBrouillon: Route = async (corps, ctx) => {
  const demande = texteRecu(corps, 'demande', 500);
  if (demande.length < 8) throw new ErreurIA('entree', 'Décrivez le voyage en une phrase : où, quand, avec qui.');
  const jour = jourParis();

  // --- Contexte, avec les droits de la personne -------------------------
  const famille = ctx.client.schema('famille');
  const choisis: string[] = Array.isArray(corps?.personnes) ? corps.personnes.filter((x: any) => typeof x === 'string').slice(0, 60) : [];
  let personnes: { id: string; prenom: string | null; date_naissance: string | null; utilisateur_id: string | null }[] = [];
  if (choisis.length) {
    const { data } = await famille.from('personnes').select('id, prenom, date_naissance, utilisateur_id').in('id', choisis);
    personnes = (data as any[]) ?? [];
    const { data: moi } = await famille.from('personnes').select('id, prenom, date_naissance, utilisateur_id').eq('utilisateur_id', ctx.utilisateurId).maybeSingle();
    if (moi && !personnes.some((p) => p.id === (moi as any).id)) personnes.push(moi as any);
  } else {
    const [{ data: foyers }, { data: masquees }] = await Promise.all([
      famille.rpc('foyers_famille_active'),
      famille.rpc('personnes_masquees_famille_active'),
    ]);
    const idsFoyers = ((foyers as any[]) ?? []).map((f) => (typeof f === 'string' ? f : Object.values(f)[0]));
    const caches = new Set(((masquees as any[]) ?? []).map((m) => (typeof m === 'string' ? m : Object.values(m)[0])));
    if (idsFoyers.length) {
      const { data } = await famille.from('personnes').select('id, prenom, date_naissance, utilisateur_id').in('foyer_id', idsFoyers);
      personnes = ((data as any[]) ?? []).filter((p) => !caches.has(p.id));
    }
  }
  const ages = personnes.map((p) => age(p.date_naissance, jour));
  const enfants = ages.filter((a): a is number => a != null && a < 18).sort((a, b) => a - b);
  const adultes = personnes.length - enfants.length;

  const ids = new Set(personnes.map((p) => p.id));
  let occupees: Periode[] = [];
  const { data: calendrier, error: erreurCalendrier } = await ctx.client
    .schema('voyage')
    .rpc('calendrier', { debut: jour, fin: ajouter(jour, 400) });
  if (!erreurCalendrier) {
    occupees = ((calendrier as any[]) ?? [])
      .filter((d) => ids.has(d.personne_id) && (d.etat === 'indisponible' || d.etat === 'peut_etre'))
      .map((d) => ({ personne_id: d.personne_id, debut: d.date_debut, fin: d.date_fin, etat: d.etat }));
  }
  const { data: adresse } = await ctx.client
    .schema('voyage')
    .from('adresses_foyers')
    .select('adresse')
    .eq('foyer_id', ctx.foyerId)
    .maybeSingle();

  // Périodes occupées, sans dire qui (seulement combien de personnes).
  const parPlage = new Map<string, { n: Set<string>; etat: string }>();
  occupees.forEach((o) => {
    const cle = `${o.debut}|${o.fin}|${o.etat}`;
    const v = parPlage.get(cle) ?? { n: new Set(), etat: o.etat };
    v.n.add(o.personne_id);
    parPlage.set(cle, v);
  });
  const lignesOccupees = [...parPlage.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(0, 60)
    .map(([cle, v]) => {
      const [debut, fin] = cle.split('|');
      return `- du ${debut} au ${fin} : ${v.n.size} personne${v.n.size > 1 ? 's' : ''} ${v.etat === 'indisponible' ? 'pas libre' : 'peut-être libre'}`;
    });

  const contenu = [
    aujourdHuiParis(),
    `Demande : « ${demande} »`,
    '',
    `Groupe : ${adultes} adulte${adultes > 1 ? 's' : ''}${enfants.length ? `, ${enfants.length} enfant${enfants.length > 1 ? 's' : ''} (${enfants.map((a) => `${a} an${a > 1 ? 's' : ''}`).join(', ')})` : ', pas d’enfant'}.`,
    adresse ? `Départ : ${String((adresse as any).adresse).slice(0, 200)}.` : 'Départ : non précisé (France).',
    lignesOccupees.length ? `Périodes où des invités ne sont pas libres :\n${lignesOccupees.join('\n')}` : 'Aucune indisponibilité connue dans le calendrier commun.',
  ].join('\n');

  const r = await ctx.extraire({
    modele: 'claude-sonnet-5-5',
    consigne: CONSIGNE,
    contenu,
    schema: Schema,
    effort: 'medium',
    maxTokens: 8000,
    outils: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 5, user_location: { type: 'approximate', country: 'FR', timezone: 'Europe/Paris' } }],
  });
  const b = r.brouillon;

  // --- Contrôles : rien d'inventé, calendrier respecté ---------------------
  const sources = new Set(r.urls.map(cleUrl).filter(Boolean) as string[]);
  const lienSur = (u: string | null) => {
    const cle = u ? cleUrl(u) : null;
    return cle && sources.has(cle) ? u!.trim() : null;
  };
  const pasLibre = occupees.filter((o) => o.etat === 'indisponible');
  const dates = b.dates
    .filter((d) => DATE.test(d.debut) && DATE.test(d.fin) && d.debut > jour && d.fin >= d.debut && d.fin <= ajouter(d.debut, 60))
    .filter((d) => !pasLibre.some((o) => o.debut <= d.fin && o.fin >= d.debut))
    .filter((d, i, t) => t.findIndex((x) => x.debut === d.debut && x.fin === d.fin) === i)
    .slice(0, 3)
    .map((d) => ({ debut: d.debut, fin: d.fin, raison: d.raison?.trim() || null }));
  // Un repas n'a ni logement ni activités.
  const hebergements = (b.nature === 'repas' ? [] : b.hebergements)
    .map((h) => ({ ...h, lien: lienSur(h.lien) }))
    .filter((h): h is typeof h & { lien: string } => !!h.lien && !!h.nom.trim())
    .slice(0, 3)
    .map((h) => ({
      nom: h.nom.trim().slice(0, 120),
      type: TYPES_HEBERGEMENT.includes(h.type) ? h.type : 'autre',
      lien: h.lien,
      ville: h.ville?.trim() || null,
      capacite: h.capacite != null && h.capacite > 0 && h.capacite < 100 ? Math.round(h.capacite) : null,
      nb_chambres: h.nb_chambres != null && h.nb_chambres >= 0 && h.nb_chambres < 50 ? Math.round(h.nb_chambres) : null,
      prix_total: h.prix_total != null && h.prix_total >= 0 ? Math.round(h.prix_total * 100) / 100 : null,
      prix_nuit: h.prix_nuit != null && h.prix_nuit >= 0 ? Math.round(h.prix_nuit * 100) / 100 : null,
      description: h.description?.trim().slice(0, 500) || null,
    }));
  const activites = (b.nature === 'repas' ? [] : b.activites)
    .filter((a) => a.titre.trim())
    .slice(0, 6)
    .map((a) => ({
      titre: a.titre.trim().slice(0, 120),
      categorie: CATEGORIES.includes(a.categorie) ? a.categorie : 'autre',
      description: a.description?.trim().slice(0, 500) || null,
      lien: lienSur(a.lien),
      prix_adulte: a.prix_adulte != null && a.prix_adulte >= 0 ? a.prix_adulte : null,
      prix_enfant: a.prix_enfant != null && a.prix_enfant >= 0 ? a.prix_enfant : null,
    }));

  // Nature de l'événement, occasion et personne fêtée (refonte Événements :
  // « Un repas : Les 50 ans de Tata Sophie… »). La personne fêtée n'est
  // reconnue que si son prénom désigne UNE seule personne parmi les invités
  // visibles ; sinon fete_personne_id = null et l'app laisse choisir.
  const nature = NATURES.includes(b.nature) ? b.nature : 'voyage';
  const occasion = nature === 'repas' ? (OCCASIONS.includes(b.occasion ?? '') ? b.occasion : 'repas') : null;
  const prenomFete = occasion === 'anniversaire' ? b.fete_prenom?.trim().toLowerCase() : null;
  const candidats = prenomFete ? personnes.filter((p) => p.prenom?.trim().toLowerCase() === prenomFete) : [];
  const fetePersonneId = candidats.length === 1 ? candidats[0].id : null;

  return {
    nature,
    occasion,
    fete_personne_id: fetePersonneId,
    titre: b.titre.trim().slice(0, 80) || (nature === 'repas' ? 'Repas de famille' : 'Voyage'),
    destination: b.destination?.trim() || null,
    pays: b.pays?.trim() || null,
    type_sejour: TYPES_SEJOUR.includes(b.type_sejour) ? b.type_sejour : 'autre',
    periode: PERIODES.includes(b.periode) ? b.periode : 'autre',
    annee: b.annee != null && Number.isInteger(b.annee) && b.annee >= 2000 && b.annee <= 2100 ? b.annee : null,
    nb_nuits: b.nb_nuits != null && b.nb_nuits >= 0 && b.nb_nuits <= 365 ? Math.round(b.nb_nuits) : null,
    dates,
    hebergements,
    activites,
    programme: b.programme.map((l) => l.trim()).filter(Boolean).slice(0, 10),
    budget: {
      min: b.budget.min != null && b.budget.min >= 0 ? Math.round(b.budget.min) : null,
      max: b.budget.max != null && b.budget.max >= 0 ? Math.round(b.budget.max) : null,
      detail: b.budget.detail?.trim() || null,
    },
    question: b.question?.trim() || null,
    // Ce qui a été écarté par les contrôles (lien introuvable, date prise).
    ecartes: {
      dates: b.dates.length - dates.length,
      hebergements: (nature === 'repas' ? 0 : Math.min(b.hebergements.length, 3)) - hebergements.length,
    },
  };
};
