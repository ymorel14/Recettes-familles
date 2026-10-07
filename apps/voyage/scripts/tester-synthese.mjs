// Tests de la synthèse des dates proposées (src/services/syntheseDates.ts) :
//   node --experimental-strip-types --test scripts/tester-synthese.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { regrouperProches, synthetiser } from '../src/services/syntheseDates.ts';

const p = (id, date_debut, date_fin, votes = []) => ({ id, date_debut, date_fin, votes });
const v = (personne_id, reponse) => ({ personne_id, reponse });

test('regroupe les propositions qui se chevauchent ou sont proches', () => {
  const a = p('a', '2027-08-07', '2027-08-14');
  const b = p('b', '2027-08-10', '2027-08-17');
  const c = p('c', '2027-08-19', '2027-08-26'); // 2 jours après b : proche
  const d = p('d', '2027-12-24', '2027-12-26'); // seule
  const groupes = regrouperProches([d, c, a, b]);
  assert.equal(groupes.length, 1);
  assert.deepEqual(groupes[0].map((x) => x.id), ['a', 'b', 'c']);
  assert.equal(regrouperProches([a, d]).length, 0);
});

test('ne regroupe pas au-delà de la durée lisible', () => {
  const g = regrouperProches([p('a', '2027-07-01', '2027-07-20'), p('b', '2027-07-21', '2027-08-30')], 3, 45);
  assert.equal(g.length, 0);
});

test('meilleure réponse par jour et par personne', () => {
  const s = synthetiser([
    p('a', '2027-08-07', '2027-08-14', [v('yann', 'oui'), v('claire', 'non'), v('marc', 'si_besoin')]),
    p('b', '2027-08-10', '2027-08-17', [v('yann', 'non'), v('claire', 'oui'), v('marc', 'oui')]),
  ]);
  assert.equal(s.jours.length, 11);
  const jour = (d) => s.jours.find((j) => j.date === d);
  assert.deepEqual([jour('2027-08-07').oui, jour('2027-08-07').possible, jour('2027-08-07').non], [1, 1, 1]);
  // Du 10 au 14 : tout le monde a dit oui à au moins une proposition qui couvre ce jour.
  assert.deepEqual([jour('2027-08-12').oui, jour('2027-08-12').possible, jour('2027-08-12').non], [3, 0, 0]);
  assert.deepEqual([jour('2027-08-17').oui, jour('2027-08-17').non], [2, 1]);
  assert.deepEqual(s.meilleurs, { debut: '2027-08-10', fin: '2027-08-14', oui: 3, possible: 0 });
  assert.equal(jour('2027-08-07').weekend, true); // samedi
  assert.deepEqual(s.barres.map((b) => [b.id, b.debut, b.duree, b.score]), [['a', 0, 8, 3], ['b', 3, 8, 4]]);
});

test('sans votes : pas de meilleurs jours', () => {
  const s = synthetiser([p('a', '2027-08-07', '2027-08-08'), p('b', '2027-08-08', '2027-08-09')]);
  assert.equal(s.meilleurs, null);
  assert.equal(s.jours.length, 3);
});
