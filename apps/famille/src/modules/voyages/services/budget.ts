// Calcul du budget d'un voyage. Module sans accès à la base (fonctions
// pures), testé seul : scripts/tester-budget.ts.
//
// Règles (cahier des charges, décisions du 29 septembre 2026) :
//  - sont comptés tous les invités qui n'ont pas décliné ;
//  - frais communs = hébergement(s) retenu(s) + postes divers "une fois" ou
//    "par nuit" ; ils se partagent selon la répartition du voyage :
//      par_adulte   : par personne, enfants gratuits (défaut),
//      par_personne : par personne, enfants compris,
//      par_foyer    : à parts égales entre foyers ;
//  - postes "par personne" et "par personne et par nuit" : à la charge de
//    chaque personne (enfants compris), donc de son foyer ;
//  - tant qu'aucun hébergement n'est retenu, le budget prend la proposition
//    la moins chère (et affiche la fourchette) ;
//  - transport (décision du 13 octobre 2026), selon le paiement de chaque
//    étape :
//      foyer     : à la charge du foyer du trajet (sa voiture : chacun paie
//                  son essence, même s'il emmène d'autres passagers) ;
//                  défaut des trajets en voiture,
//      commun    : payé en commun, réparti comme l'hébergement (règle du
//                  voyage) entre les passagers de l'étape ; défaut des
//                  autres modes (le ferry, l'avion),
//      passagers : chaque passager sa part, enfants compris ;
//    sans passager connu, l'étape est à la charge du foyer du trajet ;
//  - un hébergement retenu peut être à la charge de certains foyers
//    seulement (pour_foyers) : réparti selon la règle du voyage entre les
//    personnes de ces foyers ;
//  - loisirs : activités retenues ; prix adulte ou enfant selon l'âge au
//    premier jour, gratuit sous l'âge indiqué, pour chaque invité qui n'a
//    pas répondu « non » ; le forfait de groupe est un frais commun.

export const AGE_ADULTE = 18;

export type RepartitionBudget = 'par_adulte' | 'par_personne' | 'par_foyer';
export type BasePoste = 'total' | 'par_personne' | 'par_personne_nuit' | 'par_nuit';

export type PersonneBudget = {
  id: string;
  prenom: string;
  foyer_id: string | null;
  foyer_nom: string | null;
  date_naissance: string | null;
};

export type HebergementBudget = {
  nom: string;
  statut: 'propose' | 'retenu' | 'ecarte';
  // Foyers qui paient cet hébergement ; vide ou absent : frais communs.
  pour_foyers?: string[] | null;
  prix_total: number | string | null;
  prix_nuit: number | string | null;
  frais_annexes: number | string | null;
};

export type PosteBudget = {
  id?: string;
  libelle: string;
  categorie: string;
  montant: number | string;
  base: BasePoste;
};

export type TrajetBudget = {
  id?: string;
  mode: string;
  libelle: string | null;
  ville_depart: string | null;
  foyer_id: string | null;
  aller_retour: boolean;
  distance_km: number | string | null;
  consommation: number | string | null;
  prix_unitaire: number | string | null;
  peages: number | string | null;
  prix_billets: number | string | null;
  // Qui paie l'étape (voir en tête) ; absent : selon le mode.
  paiement?: PaiementEtape | null;
  // Étape d'un foyer jusqu'au rendez-vous : payée par lui par défaut.
  propre_foyer?: boolean | null;
  passagers: { personne_id: string }[];
};

export type PaiementEtape = 'foyer' | 'commun' | 'passagers';

// Paiement d'une étape quand rien n'est précisé : la voiture par son foyer,
// le reste (ferry, avion, train…) en commun.
// Par défaut : la voiture, et toute étape propre à un foyer (son trajet
// jusqu'au rendez-vous), par ce foyer ; le reste en commun.
export function paiementEtape(t: { mode: string; paiement?: PaiementEtape | null; propre_foyer?: boolean | null }): PaiementEtape {
  return t.paiement ?? (t.mode === 'voiture' || t.propre_foyer ? 'foyer' : 'commun');
}

export type ActiviteBudget = {
  id?: string;
  titre: string;
  statut: 'propose' | 'retenu' | 'ecarte';
  prix_adulte: number | string | null;
  prix_enfant: number | string | null;
  age_max_enfant: number | null;
  age_gratuit: number | null;
  prix_forfait: number | string | null;
  avis: { personne_id: string; avis: 'partant' | 'pourquoi_pas' | 'non' }[];
};

export type LigneBudget = {
  poste: 'hebergement' | 'divers' | 'transport' | 'activite';
  posteId?: string;
  libelle: string;
  detail: string;
  montant: number;
  commun: boolean;
  // Qui paie, en clair (ex. « payé en commun par les passagers »), quand ce
  // n'est ni les frais communs du voyage ni la charge de chacun.
  charge?: string;
};

export type PartFoyer = {
  foyer_id: string;
  foyer_nom: string;
  personnes: string[];
  // Identifiants des mêmes personnes, dans le même ordre (photos).
  personneIds: string[];
  payants: number; // personnes qui paient une part des frais communs
  montant: number;
};

export type ResultatBudget = {
  nuits: number | null;
  nbPersonnes: number;
  nbAdultes: number;
  nbEnfants: number;
  agesInconnus: string[]; // prénoms comptés adultes faute de date de naissance
  hebergement: {
    montant: number | null;
    retenu: boolean;
    nom: string | null;
    fourchette: [number, number] | null;
  };
  lignes: LigneBudget[];
  totalCommun: number;
  total: number;
  parFoyer: PartFoyer[];
  // Coût moyen par personne (total / personnes) et part des frais communs
  // pour une personne qui paie (selon la répartition).
  moyenParPersonne: number | null;
  partCommune: number | null;
  transport: number;
  loisirs: number; // activités retenues (prix par personne + forfaits)
  avertissements: string[];
};

const nombre = (v: number | string | null | undefined): number | null =>
  v === null || v === undefined || v === '' ? null : Number(v);

const arrondi = (n: number) => Math.round(n * 100) / 100;

// Prix du séjour : prix total, sinon prix par nuit × nuits ; frais annexes en
// plus. null si aucun prix n'est connu.
export function prixSejour(
  h: { prix_total: number | string | null; prix_nuit: number | string | null; frais_annexes: number | string | null },
  nuits: number | null
): number | null {
  const total = nombre(h.prix_total);
  const parNuit = nombre(h.prix_nuit);
  const base = total !== null ? total : parNuit !== null && nuits !== null ? parNuit * nuits : null;
  if (base === null) return null;
  return base + (nombre(h.frais_annexes) ?? 0);
}

// Âge en années révolues à une date "AAAA-MM-JJ".
export function ageA(dateNaissance: string, dateIso: string): number {
  const [an, mn, jn] = dateNaissance.split('-').map(Number);
  const [a, m, j] = dateIso.split('-').map(Number);
  let age = a - an;
  if (m < mn || (m === mn && j < jn)) age -= 1;
  return age;
}

// Coût d'un trajet, aller-retour compris : même formule que la colonne
// cout_total de la base.
export function coutTrajet(t: Omit<TrajetBudget, 'passagers' | 'foyer_id' | 'libelle' | 'ville_depart'>): number {
  if (t.mode === 'voiture') {
    const km = nombre(t.distance_km);
    const conso = nombre(t.consommation);
    const prix = nombre(t.prix_unitaire);
    const carburant = km !== null && conso !== null && prix !== null ? (km * conso) / 100 * prix : 0;
    return arrondi((carburant + (nombre(t.peages) ?? 0)) * (t.aller_retour ? 2 : 1));
  }
  return arrondi(nombre(t.prix_billets) ?? 0);
}

// Prix d'une activité pour une personne d'un âge donné (null = âge inconnu,
// compté adulte).
export function prixActivitePour(
  a: Pick<ActiviteBudget, 'prix_adulte' | 'prix_enfant' | 'age_max_enfant' | 'age_gratuit'>,
  age: number | null
): number {
  if (age !== null && a.age_gratuit !== null && age < a.age_gratuit) return 0;
  const enfant = nombre(a.prix_enfant);
  if (age !== null && enfant !== null && a.age_max_enfant !== null && age <= a.age_max_enfant) return enfant;
  return nombre(a.prix_adulte) ?? 0;
}

// Coût d'une activité pour le groupe : chaque personne qui vient (tout
// invité qui n'a pas répondu « non ») + le forfait.
export function coutActivite(
  a: ActiviteBudget,
  personnes: PersonneBudget[],
  dateReference: string
): { total: number; parPersonne: Map<string, number>; forfait: number; venants: number; detail: string } {
  const parPersonne = new Map<string, number>();
  const tarifs = new Map<number, number>(); // prix → nombre de personnes
  for (const p of personnes) {
    if (a.avis.some((x) => x.personne_id === p.id && x.avis === 'non')) continue;
    const age = p.date_naissance ? ageA(p.date_naissance, dateReference) : null;
    const prix = prixActivitePour(a, age);
    parPersonne.set(p.id, prix);
    tarifs.set(prix, (tarifs.get(prix) ?? 0) + 1);
  }
  const forfait = nombre(a.prix_forfait) ?? 0;
  const total = arrondi([...parPersonne.values()].reduce((x, y) => x + y, 0) + forfait);
  const tarifParPersonne = nombre(a.prix_adulte) !== null || nombre(a.prix_enfant) !== null;
  const morceaux = [...tarifs.entries()]
    .filter(() => tarifParPersonne)
    .sort((x, y) => y[0] - x[0])
    .map(([prix, n]) => (prix === 0 ? `${n} gratuit${n > 1 ? 's' : ''}` : `${n} × ${prix} €`));
  if (forfait) morceaux.push(`forfait ${forfait} €`);
  return { total, parPersonne, forfait, venants: parPersonne.size, detail: morceaux.join(' + ') };
}

export function calculerBudget(entree: {
  nuits: number | null;
  repartition: RepartitionBudget;
  dateReference: string; // premier jour du voyage (ou date estimée)
  personnes: PersonneBudget[];
  hebergements: HebergementBudget[];
  postes: PosteBudget[];
  trajets?: TrajetBudget[];
  activites?: ActiviteBudget[];
}): ResultatBudget {
  const { nuits, repartition, dateReference, personnes } = entree;
  const avertissements: string[] = [];
  const lignes: LigneBudget[] = [];

  // Adultes / enfants.
  const agesInconnus: string[] = [];
  const estAdulte = new Map<string, boolean>();
  for (const p of personnes) {
    if (!p.date_naissance) {
      agesInconnus.push(p.prenom);
      estAdulte.set(p.id, true);
    } else {
      estAdulte.set(p.id, ageA(p.date_naissance, dateReference) >= AGE_ADULTE);
    }
  }
  const nbAdultes = personnes.filter((p) => estAdulte.get(p.id)).length;

  // Hébergement.
  const retenus = entree.hebergements.filter((h) => h.statut === 'retenu');
  const candidats = entree.hebergements.filter((h) => h.statut === 'propose');
  const prixCandidats = candidats
    .map((h) => ({ h, prix: prixSejour(h, nuits) }))
    .filter((x): x is { h: HebergementBudget; prix: number } => x.prix !== null)
    .sort((a, b) => a.prix - b.prix);
  let hebergement: ResultatBudget['hebergement'] = { montant: null, retenu: false, nom: null, fourchette: null };
  // Frais partagés entre certaines personnes seulement (étape payée en
  // commun, hébergement de certains foyers), répartis plus bas selon la
  // règle du voyage.
  const pots: { montant: number; concernes: PersonneBudget[] }[] = [];
  const chargesFoyer = new Map<string, number>(); // à la charge d'un foyer précis
  const nomFoyer = (id: string) => {
    const nom = personnes.find((p) => p.foyer_id === id)?.foyer_nom;
    return nom ? `foyer ${nom}` : 'un autre foyer';
  };
  let hebergementCommun = 0;
  if (retenus.length > 0) {
    let somme = 0;
    let complet = true;
    for (const h of retenus) {
      const prix = prixSejour(h, nuits);
      if (prix === null) complet = false;
      else {
        somme += prix;
        const payeurs = (h.pour_foyers ?? []).filter(Boolean);
        if (payeurs.length === 0) {
          hebergementCommun += prix;
          lignes.push({ poste: 'hebergement', libelle: h.nom, detail: 'Hébergement retenu', montant: arrondi(prix), commun: true });
        } else {
          const concernes = personnes.filter((p) => p.foyer_id && payeurs.includes(p.foyer_id));
          if (concernes.length) pots.push({ montant: prix, concernes });
          else for (const f of payeurs) chargesFoyer.set(f, (chargesFoyer.get(f) ?? 0) + prix / payeurs.length);
          lignes.push({
            poste: 'hebergement',
            libelle: h.nom,
            detail: 'Hébergement retenu',
            montant: arrondi(prix),
            commun: false,
            charge: `à la charge de ${payeurs.map(nomFoyer).join(', ')}`,
          });
        }
      }
    }
    if (!complet) avertissements.push('Un hébergement retenu n’a pas de prix (ou le nombre de nuits manque).');
    hebergement = { montant: arrondi(somme), retenu: true, nom: retenus.map((h) => h.nom).join(', '), fourchette: null };
  } else if (prixCandidats.length > 0) {
    const moinsCher = prixCandidats[0];
    hebergement = {
      montant: arrondi(moinsCher.prix),
      retenu: false,
      nom: moinsCher.h.nom,
      fourchette: [arrondi(moinsCher.prix), arrondi(prixCandidats[prixCandidats.length - 1].prix)],
    };
    hebergementCommun = moinsCher.prix;
    lignes.push({
      poste: 'hebergement',
      libelle: moinsCher.h.nom,
      detail: 'Proposition la moins chère (aucun hébergement retenu)',
      montant: hebergement.montant!,
      commun: true,
    });
  } else {
    avertissements.push('Aucun hébergement chiffré pour l’instant.');
  }

  // Postes divers.
  const parPersonne = new Map<string, number>(); // charges individuelles
  let communDivers = 0;
  for (const poste of entree.postes) {
    const m = Number(poste.montant);
    if (!Number.isFinite(m)) continue;
    const n = nuits ?? 0;
    if ((poste.base === 'par_nuit' || poste.base === 'par_personne_nuit') && nuits === null) {
      avertissements.push(`« ${poste.libelle} » est compté par nuit, mais le nombre de nuits n’est pas connu.`);
    }
    if (poste.base === 'total' || poste.base === 'par_nuit') {
      const montant = poste.base === 'total' ? m : m * n;
      communDivers += montant;
      lignes.push({
        poste: 'divers',
        posteId: poste.id,
        libelle: poste.libelle,
        detail: poste.base === 'total' ? 'Une fois' : `${m} € × ${n} nuit${n > 1 ? 's' : ''}`,
        montant: arrondi(montant),
        commun: true,
      });
    } else {
      const unitaire = poste.base === 'par_personne' ? m : m * n;
      for (const p of personnes) parPersonne.set(p.id, (parPersonne.get(p.id) ?? 0) + unitaire);
      lignes.push({
        poste: 'divers',
        posteId: poste.id,
        libelle: poste.libelle,
        detail:
          poste.base === 'par_personne'
            ? `${m} € × ${personnes.length} pers.`
            : `${m} € × ${personnes.length} pers. × ${n} nuit${n > 1 ? 's' : ''}`,
        montant: arrondi(unitaire * personnes.length),
        commun: false,
      });
    }
  }

  // Transport : selon le paiement de chaque étape (voir en tête).
  let transport = 0;
  let transportAttribue = 0;
  for (const t of entree.trajets ?? []) {
    const cout = coutTrajet(t);
    transport += cout;
    const passagers = t.passagers.filter((x) => personnes.some((p) => p.id === x.personne_id));
    let paiement = paiementEtape(t);
    if (paiement === 'foyer' && !t.foyer_id) paiement = 'passagers';
    if (paiement !== 'foyer' && passagers.length === 0) paiement = 'foyer';
    let charge: string;
    if (paiement === 'foyer') {
      if (t.foyer_id) {
        chargesFoyer.set(t.foyer_id, (chargesFoyer.get(t.foyer_id) ?? 0) + cout);
        transportAttribue += cout;
        charge = `à la charge de ${nomFoyer(t.foyer_id)}`;
      } else {
        avertissements.push(`Le trajet « ${t.libelle ?? t.ville_depart ?? t.mode} » n’a ni passager ni foyer : compté dans le total seulement.`);
        charge = 'sans payeur';
      }
    } else if (paiement === 'commun') {
      pots.push({ montant: cout, concernes: personnes.filter((p) => passagers.some((x) => x.personne_id === p.id)) });
      transportAttribue += cout;
      charge = 'payé en commun par les passagers';
    } else {
      for (const x of passagers) parPersonne.set(x.personne_id, (parPersonne.get(x.personne_id) ?? 0) + cout / passagers.length);
      transportAttribue += cout;
      charge = 'chaque passager sa part';
    }
    const km = nombre(t.distance_km);
    lignes.push({
      poste: 'transport',
      posteId: t.id,
      libelle: t.libelle || (t.ville_depart ? `Depuis ${t.ville_depart}` : 'Trajet'),
      detail:
        t.mode === 'voiture'
          ? `Voiture${km !== null ? `, ${String(km).replace('.', ',')} km` : ''}${t.aller_retour ? ' aller-retour' : ''}${passagers.length ? ` · ${passagers.length} pers.` : ''}`
          : `${t.mode.charAt(0).toUpperCase()}${t.mode.slice(1)}${passagers.length ? ` · ${passagers.length} pers.` : ''}`,
      montant: cout,
      commun: false,
      charge,
    });
  }

  // Loisirs : activités retenues.
  let loisirs = 0;
  let forfaitsCommuns = 0;
  for (const a of (entree.activites ?? []).filter((x) => x.statut === 'retenu')) {
    const c = coutActivite(a, personnes, dateReference);
    loisirs += c.total;
    forfaitsCommuns += c.forfait;
    for (const [id, prix] of c.parPersonne) parPersonne.set(id, (parPersonne.get(id) ?? 0) + prix);
    lignes.push({ poste: 'activite', posteId: a.id, libelle: a.titre, detail: c.detail || 'Gratuit', montant: c.total, commun: false });
  }

  const totalCommun = arrondi(hebergementCommun + communDivers + forfaitsCommuns);
  const totalIndividuel = [...parPersonne.values()].reduce((a, b) => a + b, 0);
  const totalAutresFoyers = [...chargesFoyer.values()].reduce((a, b) => a + b, 0);
  const totalPots = pots.reduce((a, p) => a + p.montant, 0);
  const sansAttribution = transport - transportAttribue;
  const total = arrondi(totalCommun + totalIndividuel + totalAutresFoyers + totalPots + sansAttribution);

  // Répartition des frais communs.
  const foyers = new Map<string, PartFoyer>();
  for (const p of personnes) {
    const cle = p.foyer_id ?? `sans-foyer-${p.id}`;
    if (!foyers.has(cle)) {
      foyers.set(cle, { foyer_id: cle, foyer_nom: p.foyer_nom ?? p.prenom, personnes: [], personneIds: [], payants: 0, montant: 0 });
    }
    const f = foyers.get(cle)!;
    f.personnes.push(p.prenom);
    f.personneIds.push(p.id);
    f.montant += parPersonne.get(p.id) ?? 0;
  }

  for (const [foyerId, montant] of chargesFoyer) {
    if (!foyers.has(foyerId)) {
      foyers.set(foyerId, { foyer_id: foyerId, foyer_nom: 'Autre foyer', personnes: [], personneIds: [], payants: 0, montant: 0 });
    }
    foyers.get(foyerId)!.montant += montant;
  }

  // Frais partagés entre certaines personnes : même règle que les frais
  // communs, appliquée aux seules personnes concernées.
  const foyerDe = (p: PersonneBudget) => foyers.get(p.foyer_id ?? `sans-foyer-${p.id}`)!;
  for (const pot of pots) {
    if (pot.concernes.length === 0) continue;
    if (repartition === 'par_foyer') {
      const fs = [...new Set(pot.concernes.map(foyerDe))];
      for (const f of fs) f.montant += pot.montant / fs.length;
    } else {
      let payants = pot.concernes.filter((p) => repartition === 'par_personne' || estAdulte.get(p.id) === true);
      if (payants.length === 0) payants = pot.concernes;
      for (const p of payants) foyerDe(p).montant += pot.montant / payants.length;
    }
  }

  let partCommune: number | null = null;
  if (personnes.length > 0 && totalCommun > 0) {
    if (repartition === 'par_foyer') {
      const foyersInvites = [...foyers.values()].filter((f) => f.personnes.length > 0);
      partCommune = totalCommun / foyersInvites.length;
      for (const f of foyersInvites) {
        f.payants = f.personnes.length;
        f.montant += partCommune;
      }
    } else {
      const payent = (p: PersonneBudget) => repartition === 'par_personne' || estAdulte.get(p.id) === true;
      let payants = personnes.filter(payent);
      if (payants.length === 0) payants = personnes; // que des enfants : tout le monde paie
      partCommune = totalCommun / payants.length;
      for (const p of payants) {
        const f = foyers.get(p.foyer_id ?? `sans-foyer-${p.id}`)!;
        f.payants += 1;
        f.montant += partCommune;
      }
    }
  }

  return {
    nuits,
    nbPersonnes: personnes.length,
    nbAdultes,
    nbEnfants: personnes.length - nbAdultes,
    agesInconnus,
    hebergement,
    lignes,
    totalCommun,
    total,
    parFoyer: [...foyers.values()]
      .map((f) => ({ ...f, montant: arrondi(f.montant) }))
      .sort((a, b) => b.montant - a.montant || a.foyer_nom.localeCompare(b.foyer_nom)),
    moyenParPersonne: personnes.length ? arrondi(total / personnes.length) : null,
    partCommune: partCommune === null ? null : arrondi(partCommune),
    transport: arrondi(transport),
    loisirs: arrondi(loisirs),
    avertissements,
  };
}
