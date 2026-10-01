// Tests des dates et âges des souvenirs : npm run test:dates (dans apps/souvenirs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ageSouvenir,
  formaterAge,
  formaterDateSouvenir,
  ilYaAns,
  lireDateSaisie,
  moisEntre,
  versSaisie,
} from '../src/utils/dates.ts';

test('affichage selon la précision', () => {
  assert.equal(formaterDateSouvenir('2021-03-14', null, 'jour'), '14 mars 2021');
  assert.equal(formaterDateSouvenir('2021-03-01', null, 'jour'), '1er mars 2021');
  assert.equal(formaterDateSouvenir('2021-03-01', null, 'mois'), 'mars 2021');
  assert.equal(formaterDateSouvenir('2021-01-01', null, 'annee'), '2021');
  assert.equal(formaterDateSouvenir('1985-01-01', null, 'environ'), 'vers 1985');
  assert.equal(formaterDateSouvenir(null, null, 'jour'), 'Date inconnue');
});

test('périodes', () => {
  assert.equal(formaterDateSouvenir('2019-07-05', '2019-07-19', 'jour'), 'du 5 au 19 juillet 2019');
  assert.equal(formaterDateSouvenir('2019-06-28', '2019-07-03', 'jour'), 'du 28 juin au 3 juillet 2019');
  assert.equal(formaterDateSouvenir('2019-12-30', '2020-01-02', 'jour'), 'du 30 décembre 2019 au 2 janvier 2020');
  assert.equal(formaterDateSouvenir('2019-07-01', '2019-08-01', 'mois'), 'de juillet à août 2019');
  assert.equal(formaterDateSouvenir('2021-03-14', '2021-03-14', 'jour'), '14 mars 2021');
});

test('saisie et retour au champ', () => {
  assert.equal(lireDateSaisie('14/03/2021', 'jour'), '2021-03-14');
  assert.equal(lireDateSaisie('31/02/2021', 'jour'), null);
  assert.equal(lireDateSaisie('3/2021', 'mois'), '2021-03-01');
  assert.equal(lireDateSaisie('13/2021', 'mois'), null);
  assert.equal(lireDateSaisie('1985', 'environ'), '1985-01-01');
  assert.equal(lireDateSaisie('85', 'annee'), null);
  assert.equal(versSaisie('2021-03-14', 'jour'), '14/03/2021');
  assert.equal(versSaisie('2021-03-01', 'mois'), '03/2021');
  assert.equal(versSaisie('2021-01-01', 'annee'), '2021');
});

test('âges', () => {
  assert.equal(moisEntre('2020-02-10', '2021-03-14'), 13);
  assert.equal(moisEntre('2020-02-10', '2021-03-09'), 12);
  assert.equal(moisEntre('2020-02-10', '2019-01-01'), null);
  assert.equal(formaterAge(0), 'nouveau-né');
  assert.equal(formaterAge(13), '13 mois');
  assert.equal(formaterAge(23), '23 mois');
  assert.equal(formaterAge(80), '6 ans');
  assert.equal(ageSouvenir('2020-02-10', '2021-03-14', 'jour'), '13 mois');
  assert.equal(ageSouvenir('2015-06-01', '2021-01-01', 'annee'), 'vers 5 ans');
  assert.equal(ageSouvenir('2020-06-01', '2021-01-01', 'annee'), null);
  assert.equal(ageSouvenir(null, '2021-01-01', 'jour'), null);
});

test('il y a…', () => {
  assert.equal(ilYaAns('2021-03-14', new Date(2026, 2, 14)), 'il y a 5 ans');
  assert.equal(ilYaAns('2025-03-14', new Date(2026, 2, 14)), 'il y a un an');
});
