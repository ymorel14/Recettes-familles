// Tests des options de trajet (src/services/optionsTrajet.ts) :
//   node --experimental-strip-types --test scripts/tester-options-trajet.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { etapesDe, etapesDuBudget, lieuRendezVous, resumerOption, vueOption } from '../src/services/optionsTrajet.ts';

const foyers = { yann: 'Morel', claire: 'Morel', leo: 'Morel', marc: 'Dupont' };
const foyerDe = (id) => foyers[id] ?? null;
const e = (id, option_id, ordre, mode, cout_total, duree_minutes, passagers) => ({
  id, option_id, ordre, mode, cout_total, duree_minutes, passagers: passagers.map((personne_id) => ({ personne_id })),
});

// Caen → Londres. Ferry : chaque foyer va au port, puis ferry commun, puis route.
const ferry = [
  e('f1', 'ferry', 1, 'voiture', '22.40', 20, ['yann', 'claire', 'leo']),
  e('f2', 'ferry', 2, 'voiture', 51.84, 150, ['marc']),
  e('f3', 'ferry', 3, 'bateau', 620, 360, ['yann', 'claire', 'leo', 'marc']),
  e('f4', 'ferry', 4, 'voiture', 30, 120, ['yann', 'claire', 'leo', 'marc']),
];
const avion = [
  e('a1', 'avion', 1, 'voiture', 40, 150, ['yann', 'claire', 'leo', 'marc']),
  e('a2', 'avion', 2, 'avion', 1300, null, ['yann', 'claire', 'leo', 'marc']),
];
const attendus = ['yann', 'claire', 'leo', 'marc', 'mamie'];

test('résumé d’une option à étapes partagées', () => {
  const r = resumerOption(ferry, attendus, foyerDe);
  assert.equal(r.cout, 724.24);
  assert.equal(r.voyageurs, 4);
  assert.equal(r.coutParVoyageur, 181.06);
  assert.equal(r.dureeMax, 150 + 360 + 120); // Marc : la plus longue
  assert.equal(r.dureeIncomplete, false);
  assert.deepEqual(r.modes, ['voiture', 'bateau']);
  assert.deepEqual(r.sansPlace, ['mamie']);
  assert.equal(r.etapesPartagees, 2);
});

test('durée inconnue signalée', () => {
  const r = resumerOption(avion, attendus, foyerDe);
  assert.equal(r.dureeMax, 150);
  assert.equal(r.dureeIncomplete, true);
});

test('budget : option retenue, seule option, ou la moins chère', () => {
  const tout = [...avion, ...ferry];
  const opts = (sa, sf) => [{ id: 'avion', nom: 'Avion', statut: sa }, { id: 'ferry', nom: 'Ferry', statut: sf }];
  let b = etapesDuBudget(opts('retenue', 'ecartee'), tout);
  assert.deepEqual(b.etapes.map((x) => x.id), ['a1', 'a2']);
  assert.equal(b.note, null);
  b = etapesDuBudget(opts('proposee', 'proposee'), tout);
  assert.deepEqual(b.etapes.map((x) => x.id), ['f1', 'f2', 'f3', 'f4']);
  assert.match(b.note, /moins chère.*Ferry/);
  b = etapesDuBudget(opts('ecartee', 'proposee'), tout);
  assert.equal(b.option.id, 'ferry');
  assert.equal(b.note, null);
  b = etapesDuBudget([], tout);
  assert.equal(b.etapes.length, 6);
});

test('ordre des étapes', () => {
  assert.deepEqual(etapesDe('ferry', [...ferry].reverse()).map((x) => x.id), ['f1', 'f2', 'f3', 'f4']);
});

test('durées saisies à la main', async () => {
  const { lireDuree } = await import('../src/services/optionsTrajet.ts');
  assert.equal(lireDuree('6 h 30'), 390);
  assert.equal(lireDuree('6h30'), 390);
  assert.equal(lireDuree('6h'), 360);
  assert.equal(lireDuree('1:45'), 105);
  assert.equal(lireDuree('90 min'), 90);
  assert.equal(lireDuree('2'), 120);
  assert.equal(lireDuree('1,5'), 90);
  assert.equal(lireDuree(''), null);
  assert.equal(lireDuree('demain'), null);
});

// Rendez-vous : chaque foyer part de chez lui, rejoint le groupe au ferry
// (Morel, Dupont) ou à Portsmouth (Mamie), ou va directement (Paul).
const b = (id, ordre, mode, depart, arrivee, passagers, extra = {}) => ({
  id, option_id: 'o', ordre, mode, cout_total: 0, duree_minutes: 60, ville_depart: depart, ville_arrivee: arrivee,
  passagers: passagers.map((personne_id) => ({ personne_id })), ...extra,
});
const rdv = [
  b('morel', 1, 'voiture', 'Rouen', 'Ouistreham', ['yann', 'leo'], { propre_foyer: true, foyer_id: 'M', rejoint_id: 'ferry' }),
  b('dupont1', 2, 'train', 'Paris', 'Caen', ['marc'], { propre_foyer: true, foyer_id: 'D', rejoint_id: 'ferry' }),
  b('dupont2', 3, 'bus', 'Caen', 'Ouistreham', ['marc'], { propre_foyer: true, foyer_id: 'D', rejoint_id: 'ferry' }),
  b('ferry', 4, 'bateau', 'Ouistreham', 'Portsmouth', ['yann', 'leo', 'marc']),
  b('route', 5, 'voiture', 'Portsmouth', 'Londres', ['yann', 'leo', 'marc', 'mamie']),
  b('mamie', 6, 'train', 'Lyon', 'Portsmouth', ['mamie'], { propre_foyer: true, foyer_id: 'G', rejoint_id: 'route' }),
  b('paul', 7, 'avion', 'Marseille', 'Londres', ['paul'], { propre_foyer: true, foyer_id: 'P', rejoint_id: null }),
  b('ferryR', 8, 'bateau', 'Portsmouth', 'Ouistreham', ['yann'], { sens: 'retour' }),
];

test('vue d’une option à rendez-vous', () => {
  const v = vueOption(rdv, 'aller');
  assert.deepEqual(v.tronc.map((e) => e.id), ['ferry', 'route']);
  const auFerry = v.branches.get('ferry');
  assert.deepEqual(auFerry.map((x) => x.foyer_id), ['M', 'D']);
  assert.deepEqual(auFerry[1].etapes.map((e) => e.id), ['dupont1', 'dupont2']);
  assert.deepEqual(auFerry[1].personnes, ['marc']);
  assert.deepEqual(v.branches.get('route').map((x) => x.foyer_id), ['G']);
  assert.deepEqual(v.directes.map((x) => x.foyer_id), ['P']);
  assert.equal(lieuRendezVous(v.tronc[0]), 'Ouistreham');
  const r = vueOption(rdv, 'retour');
  assert.deepEqual(r.tronc.map((e) => e.id), ['ferryR']);
  assert.equal(lieuRendezVous(r.tronc[0]), 'Ouistreham');
});

test('rendez-vous disparu : la branche va directement', () => {
  const v = vueOption([b('x', 1, 'voiture', 'A', 'B', ['yann'], { propre_foyer: true, foyer_id: 'M', rejoint_id: 'inconnu' })], 'aller');
  assert.equal(v.directes.length, 1);
});

test('durée : l’aller seulement ; le retour compte dans le coût', () => {
  const etapes = [
    b('a', 1, 'bateau', 'Caen', 'Portsmouth', ['yann'], { sens: 'aller', cout_total: 300, duree_minutes: 360 }),
    b('r', 2, 'bateau', 'Portsmouth', 'Caen', ['yann'], { sens: 'retour', cout_total: 300, duree_minutes: 420 }),
  ];
  const r = resumerOption(etapes, ['yann'], foyerDe);
  assert.equal(r.dureeMax, 360);
  assert.equal(r.cout, 600);
  assert.equal(r.voyageurs, 1);
});
