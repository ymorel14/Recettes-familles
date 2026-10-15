// Tests du calcul du budget (src/services/budget.ts), sans base ni appli :
//   node --experimental-strip-types --test scripts/tester-budget.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculerBudget, prixSejour, ageA } from '../src/services/budget.ts';

const famille = [
  { id: 'yann', prenom: 'Yann', foyer_id: 'A', foyer_nom: 'Morel', date_naissance: '1980-04-02' },
  { id: 'claire', prenom: 'Claire', foyer_id: 'A', foyer_nom: 'Morel', date_naissance: '1982-06-10' },
  { id: 'leo', prenom: 'Léo', foyer_id: 'A', foyer_nom: 'Morel', date_naissance: '2018-05-01' },
  { id: 'marc', prenom: 'Marc', foyer_id: 'C', foyer_nom: 'Dupont', date_naissance: null },
];
const gite = { nom: 'Gîte', statut: 'retenu', prix_total: null, prix_nuit: 180, frais_annexes: 60 };

test('prix du séjour et âge', () => {
  assert.equal(prixSejour({ prix_total: 1400, prix_nuit: null, frais_annexes: null }, 7), 1400);
  assert.equal(prixSejour({ prix_total: null, prix_nuit: '180', frais_annexes: '60' }, 7), 1320);
  assert.equal(prixSejour({ prix_total: null, prix_nuit: 180, frais_annexes: null }, null), null);
  assert.equal(ageA('2018-05-01', '2027-04-30'), 8);
  assert.equal(ageA('2018-05-01', '2027-05-01'), 9);
  assert.equal(ageA('2009-08-08', '2027-08-07'), 17);
  assert.equal(ageA('2009-08-07', '2027-08-07'), 18);
});

test('par personne, enfants gratuits : Léo ne paie pas les frais communs', () => {
  const r = calculerBudget({
    nuits: 7, repartition: 'par_adulte', dateReference: '2027-08-07', personnes: famille,
    hebergements: [gite], postes: [],
  });
  assert.equal(r.total, 1320);
  assert.equal(r.nbAdultes, 3); // Marc sans date de naissance : compté adulte
  assert.equal(r.nbEnfants, 1);
  assert.deepEqual(r.agesInconnus, ['Marc']);
  assert.equal(r.partCommune, 440);
  const morel = r.parFoyer.find((f) => f.foyer_id === 'A');
  const dupont = r.parFoyer.find((f) => f.foyer_id === 'C');
  assert.equal(morel.montant, 880); // Yann + Claire
  assert.equal(dupont.montant, 440);
  assert.equal(morel.montant + dupont.montant, r.total);
});

test('par personne enfants compris, et par foyer', () => {
  const base = { nuits: 7, dateReference: '2027-08-07', personnes: famille, hebergements: [gite], postes: [] };
  const p = calculerBudget({ ...base, repartition: 'par_personne' });
  assert.equal(p.partCommune, 330);
  assert.equal(p.parFoyer.find((f) => f.foyer_id === 'A').montant, 990);
  const f = calculerBudget({ ...base, repartition: 'par_foyer' });
  assert.equal(f.partCommune, 660);
  assert.equal(f.parFoyer.find((x) => x.foyer_id === 'C').montant, 660);
});

test('postes divers : communs et individuels', () => {
  const r = calculerBudget({
    nuits: 7, repartition: 'par_adulte', dateReference: '2027-08-07', personnes: famille, hebergements: [gite],
    postes: [
      { libelle: 'Assurance', categorie: 'assurance', montant: 90, base: 'total' },
      { libelle: 'Bois', categorie: 'autre', montant: '10', base: 'par_nuit' },
      { libelle: 'Courses', categorie: 'courses', montant: 15, base: 'par_personne_nuit' },
      { libelle: 'Restaurant', categorie: 'repas', montant: 30, base: 'par_personne' },
    ],
  });
  // commun : 1320 + 90 + 70 = 1480 ; individuel : (15×7 + 30) × 4 = 540
  assert.equal(r.totalCommun, 1480);
  assert.equal(r.total, 2020);
  const somme = r.parFoyer.reduce((a, f) => a + f.montant, 0);
  assert.ok(Math.abs(somme - r.total) < 0.02);
  // Dupont : 1480 / 3 + 135 = 628,33
  assert.equal(r.parFoyer.find((f) => f.foyer_id === 'C').montant, 628.33);
});

test('sans hébergement retenu : la proposition la moins chère, avec la fourchette', () => {
  const r = calculerBudget({
    nuits: 2, repartition: 'par_adulte', dateReference: '2027-04-10', personnes: famille,
    hebergements: [
      { nom: 'Hôtel', statut: 'propose', prix_total: null, prix_nuit: 250, frais_annexes: null },
      { nom: 'Mas', statut: 'propose', prix_total: 380, prix_nuit: null, frais_annexes: 20 },
      { nom: 'Écarté', statut: 'ecarte', prix_total: 100, prix_nuit: null, frais_annexes: null },
    ],
    postes: [],
  });
  assert.equal(r.hebergement.retenu, false);
  assert.equal(r.hebergement.nom, 'Mas');
  assert.deepEqual(r.hebergement.fourchette, [400, 500]);
  assert.equal(r.total, 400);
});

test('nuits inconnues : avertissement, pas de plantage', () => {
  const r = calculerBudget({
    nuits: null, repartition: 'par_adulte', dateReference: '2027-04-10', personnes: famille,
    hebergements: [], postes: [{ libelle: 'Bois', categorie: 'autre', montant: 10, base: 'par_nuit' }],
  });
  assert.equal(r.total, 0);
  assert.ok(r.avertissements.length >= 2);
});

import { coutTrajet, prixActivitePour, coutActivite } from '../src/services/budget.ts';

test('coût d’un trajet : même formule que la base', () => {
  // 420 km, 6,5 L/100 à 1,75 €/L, 38,40 € de péages, aller-retour → 172,35 € (vérifié sur la base)
  assert.equal(coutTrajet({ mode: 'voiture', aller_retour: true, distance_km: 420, consommation: 6.5, prix_unitaire: 1.75, peages: 38.4, prix_billets: null }), 172.35);
  assert.equal(coutTrajet({ mode: 'voiture', aller_retour: false, distance_km: '100', consommation: '5', prix_unitaire: '2', peages: null, prix_billets: null }), 10);
  assert.equal(coutTrajet({ mode: 'train', aller_retour: true, distance_km: null, consommation: null, prix_unitaire: null, peages: null, prix_billets: '236.5' }), 236.5);
});

test('tarifs d’une activité selon l’âge', () => {
  const puy = { prix_adulte: 65, prix_enfant: 52, age_max_enfant: 13, age_gratuit: 3 };
  assert.equal(prixActivitePour(puy, 40), 65);
  assert.equal(prixActivitePour(puy, 13), 52);
  assert.equal(prixActivitePour(puy, 14), 65);
  assert.equal(prixActivitePour(puy, 2), 0);
  assert.equal(prixActivitePour(puy, null), 65);
  assert.equal(prixActivitePour({ prix_adulte: 20, prix_enfant: null, age_max_enfant: null, age_gratuit: null }, 5), 20);
  // Exemple du cahier des charges : 2 adultes et un enfant de 8 ans → 182 €
  const c = coutActivite({ titre: 'Puy du Fou', statut: 'retenu', ...puy, prix_forfait: null, avis: [] },
    famille.filter((p) => p.id !== 'marc'), '2027-04-16');
  assert.equal(c.total, 182);
  assert.equal(c.detail, '2 × 65 € + 1 × 52 €');
});

test('budget complet : transport par passager, loisirs, « non » exclu', () => {
  const r = calculerBudget({
    nuits: 7, repartition: 'par_adulte', dateReference: '2027-08-07', personnes: famille, hebergements: [gite], postes: [],
    trajets: [
      { mode: 'voiture', libelle: null, ville_depart: 'Rouen', foyer_id: 'A', aller_retour: true, distance_km: 420, consommation: 6.5, prix_unitaire: 1.75, peages: 38.4, prix_billets: null,
        passagers: [{ personne_id: 'yann' }, { personne_id: 'claire' }, { personne_id: 'leo' }] },
      { mode: 'train', libelle: 'TGV', ville_depart: 'Lyon', foyer_id: 'C', aller_retour: true, distance_km: null, consommation: null, prix_unitaire: null, peages: null, prix_billets: 120, passagers: [] },
    ],
    activites: [
      { titre: 'Parc', statut: 'retenu', prix_adulte: 30, prix_enfant: 20, age_max_enfant: 12, age_gratuit: null, prix_forfait: 40,
        avis: [{ personne_id: 'marc', avis: 'non' }] },
      { titre: 'Pas retenue', statut: 'propose', prix_adulte: 999, prix_enfant: null, age_max_enfant: null, age_gratuit: null, prix_forfait: null, avis: [] },
    ],
  });
  // transport 172,35 + 120 ; loisirs 30 + 30 + 20 + 40 = 120 ; commun 1320 + 40
  assert.equal(r.transport, 292.35);
  assert.equal(r.loisirs, 120);
  assert.equal(r.totalCommun, 1360);
  assert.equal(r.total, 1320 + 292.35 + 120);
  const morel = r.parFoyer.find((f) => f.foyer_id === 'A').montant;
  const dupont = r.parFoyer.find((f) => f.foyer_id === 'C').montant;
  // Morel : 2/3 de 1360 + 172,35 + 80 ; Dupont : 1/3 de 1360 + 120 (Marc ne vient pas au parc)
  assert.equal(morel, 1159.02);
  assert.equal(dupont, 573.33);
  assert.ok(Math.abs(morel + dupont - r.total) < 0.02);
});

test('activité au forfait seul : pas de « gratuits » dans le détail', () => {
  const c = coutActivite({ titre: 'Dîner', statut: 'retenu', prix_adulte: null, prix_enfant: null, age_max_enfant: null, age_gratuit: null, prix_forfait: 120, avis: [] },
    famille, '2027-04-16');
  assert.equal(c.total, 120);
  assert.equal(c.detail, 'forfait 120 €');
});

// Décision du 13 octobre 2026 : étapes payées en commun, voitures payées
// par leur foyer, hébergement commun ou à la charge de certains foyers.
const voiture = (foyer_id, km, passagers, extra = {}) => ({
  mode: 'voiture', libelle: null, ville_depart: null, foyer_id, aller_retour: false, distance_km: km, consommation: 5, prix_unitaire: 2,
  peages: null, prix_billets: null, passagers: passagers.map((personne_id) => ({ personne_id })), ...extra,
});
const ferry = (prix, passagers, extra = {}) => ({
  mode: 'bateau', libelle: 'Ferry', ville_depart: 'Ouistreham', foyer_id: 'A', aller_retour: true, distance_km: null, consommation: null,
  prix_unitaire: null, peages: null, prix_billets: prix, passagers: passagers.map((personne_id) => ({ personne_id })), ...extra,
});
const tous = ['yann', 'claire', 'leo', 'marc'];
const part = (r, f) => r.parFoyer.find((x) => x.foyer_id === f).montant;

test('ferry payé en commun : réparti comme l’hébergement (Léo, enfant, ne paie pas)', () => {
  const r = calculerBudget({ nuits: 0, repartition: 'par_adulte', dateReference: '2027-08-07', personnes: famille, hebergements: [], postes: [],
    trajets: [ferry(600, tous)] });
  // 3 adultes : 200 € chacun → Morel 400, Dupont 200
  assert.equal(part(r, 'A'), 400);
  assert.equal(part(r, 'C'), 200);
  assert.match(r.lignes[0].charge, /commun/);
  // Même ferry « chaque passager sa part » : enfants compris, 150 € chacun
  const r2 = calculerBudget({ nuits: 0, repartition: 'par_adulte', dateReference: '2027-08-07', personnes: famille, hebergements: [], postes: [],
    trajets: [ferry(600, tous, { paiement: 'passagers' })] });
  assert.equal(part(r2, 'A'), 450);
  assert.equal(part(r2, 'C'), 150);
});

test('chacun paie l’essence de sa voiture, même avec des passagers d’un autre foyer', () => {
  // Voiture des Morel : 100 km × 5 L × 2 € = 10 € ; Marc est dedans mais ne paie rien.
  const r = calculerBudget({ nuits: 0, repartition: 'par_adulte', dateReference: '2027-08-07', personnes: famille, hebergements: [], postes: [],
    trajets: [voiture('A', 100, tous), voiture('C', 300, ['marc'])] });
  assert.equal(part(r, 'A'), 10);
  assert.equal(part(r, 'C'), 30);
  assert.equal(r.total, 40);
  // À la demande : voiture partagée entre ses passagers
  const r2 = calculerBudget({ nuits: 0, repartition: 'par_adulte', dateReference: '2027-08-07', personnes: famille, hebergements: [], postes: [],
    trajets: [voiture('A', 100, tous, { paiement: 'passagers' })] });
  assert.equal(part(r2, 'C'), 2.5);
});

test('hébergement à la charge de certains foyers', () => {
  const hotel = { nom: 'Hôtel d’étape', statut: 'retenu', prix_total: 180, prix_nuit: null, frais_annexes: null, pour_foyers: ['A'] };
  const r = calculerBudget({ nuits: 7, repartition: 'par_adulte', dateReference: '2027-08-07', personnes: famille, hebergements: [gite, hotel], postes: [] });
  // Gîte commun 1320 : 440 par adulte ; hôtel 180 pour les Morel seuls
  assert.equal(r.totalCommun, 1320);
  assert.equal(part(r, 'A'), 880 + 180);
  assert.equal(part(r, 'C'), 440);
  assert.equal(r.total, 1500);
  assert.match(r.lignes.find((l) => l.libelle === 'Hôtel d’étape').charge, /Morel/);
});

test('par foyer : le ferry commun se partage entre les foyers de ses passagers', () => {
  const r = calculerBudget({ nuits: 0, repartition: 'par_foyer', dateReference: '2027-08-07', personnes: famille, hebergements: [], postes: [],
    trajets: [ferry(600, tous)] });
  assert.equal(part(r, 'A'), 300);
  assert.equal(part(r, 'C'), 300);
});

// Décision du 15 octobre 2026 : le trajet d'un foyer jusqu'au rendez-vous
// (étape propre à un foyer) est payé par lui, quel que soit le mode.
test('trajet jusqu’au rendez-vous payé par son foyer', () => {
  const train = { ...ferry(90, ['marc'], { foyer_id: 'C', propre_foyer: true }), mode: 'train', libelle: null, ville_depart: 'Paris' };
  const r = calculerBudget({ nuits: 0, repartition: 'par_adulte', dateReference: '2027-08-07', personnes: famille, hebergements: [], postes: [],
    trajets: [train, ferry(600, tous)] });
  assert.equal(part(r, 'C'), 90 + 200);
  assert.equal(part(r, 'A'), 400);
  assert.match(r.lignes.find((l) => l.libelle === 'Depuis Paris').charge, /Dupont/);
});
