// Tests du passage de connexion entre apps (connexionPartagee.ts).
// Lancement : node --experimental-strip-types scripts/tester-connexion.mjs
import { register } from 'node:module';
register('./crochets.mjs', import.meta.url);

const { test } = await import('node:test');
const assert = (await import('node:assert/strict')).default;
const { journal } = await import('./simul.mjs#react-native');
const { configurerFamille } = await import('../src/client.ts');
const { APPS_FAMILLE, baseWeb } = await import('../src/appsFamille.ts');
const C = await import('../src/connexionPartagee.ts');

// Faux client Supabase : verifyOtp et functions.invoke enregistrés.
const appels = [];
let reponseFonction = { data: { jeton: 'abc/def+==' }, error: null };
let otpValides = new Set(['bon-jeton']);
const faux = {
  auth: {
    async verifyOtp(p) { appels.push(['verifyOtp', p]); return { error: otpValides.has(p.token_hash) && p.type === 'email' ? null : { message: 'invalid' } }; },
  },
  functions: { async invoke(nom, opts) { appels.push(['invoke', nom, opts]); return reponseFonction; } },
};
const app = (id) => APPS_FAMILLE.find((a) => a.id === id);
const ETAT = '0123456789abcdef0123456789abcdef';

test('la base web est normalisée', () => {
  configurerFamille(faux, { app: 'voyagecommun', baseWeb: 'voyages/' });
  assert.equal(baseWeb(), '/voyages');
  configurerFamille(faux, { app: 'voyagecommun', baseWeb: undefined });
  assert.equal(baseWeb(), '');
});

test('lecture des liens', () => {
  configurerFamille(faux, { app: 'cuisine' });
  const d = C.lireLienConnexion(`recettesfamiliales://partager-connexion?pour=voyagecommun&etat=${ETAT}`);
  assert.equal(d.genre, 'demande');
  assert.equal(d.demandeur.id, 'voyagecommun');
  // Variante « scheme:///chemin »
  assert.equal(C.lireLienConnexion(`recettesfamiliales:///partager-connexion?pour=cadeaucommun&etat=${ETAT}`)?.demandeur.id, 'cadeaucommun');
  // Lien destiné à une autre app, app inconnue, soi-même, état mal formé : ignorés
  assert.equal(C.lireLienConnexion(`voyagecommun://partager-connexion?pour=cadeaucommun&etat=${ETAT}`), null);
  assert.equal(C.lireLienConnexion(`recettesfamiliales://partager-connexion?pour=pirate&etat=${ETAT}`), null);
  assert.equal(C.lireLienConnexion(`recettesfamiliales://partager-connexion?pour=recettesfamiliales&etat=${ETAT}`), null);
  assert.equal(C.lireLienConnexion(`recettesfamiliales://partager-connexion?pour=voyagecommun&etat=court`), null);
  assert.equal(C.lireLienConnexion(`recettesfamiliales://recette/12`), null);
  assert.equal(C.lireLienConnexion(null), null);
  const r = C.lireLienConnexion(`recettesfamiliales://connexion-partagee?etat=${ETAT}&jeton=bon-jeton`);
  assert.deepEqual(r, { genre: 'reponse', etat: ETAT, jeton: 'bon-jeton', erreur: null });
});

test('B demande, A accorde, B se connecte', async () => {
  // B = VoyageCommun, pas connecté
  configurerFamille(faux, { app: 'voyagecommun' });
  journal.ouverts.length = 0;
  assert.equal(await C.demanderConnexion(app('cuisine')), true);
  const demandeUrl = journal.ouverts.pop();
  const etat = new URL(demandeUrl).searchParams.get('etat');
  assert.match(demandeUrl, /^recettesfamiliales:\/\/partager-connexion\?pour=voyagecommun&etat=[0-9a-f]{32}$/);

  // A = Cuisine, connecté : lit la demande et accorde
  configurerFamille(faux, { app: 'cuisine' });
  const demande = C.lireLienConnexion(demandeUrl);
  reponseFonction = { data: { jeton: 'bon-jeton' }, error: null };
  await C.accorderConnexion(demande);
  assert.deepEqual(appels.at(-1), ['invoke', 'transfert-session', { body: {} }]);
  const reponseUrl = journal.ouverts.pop();
  assert.equal(reponseUrl, `voyagecommun://connexion-partagee?etat=${etat}&jeton=bon-jeton`);

  // B reçoit la réponse
  configurerFamille(faux, { app: 'voyagecommun' });
  const reponse = C.lireLienConnexion(reponseUrl);
  assert.equal(await C.recevoirConnexion(reponse), null);
  assert.deepEqual(appels.at(-1), ['verifyOtp', { token_hash: 'bon-jeton', type: 'email' }]);
  // Le même lien rejoué ne marche plus (état consommé)
  assert.match(await C.recevoirConnexion(reponse), /expiré/);
});

test('réponse à une autre demande, refus, erreurs', async () => {
  configurerFamille(faux, { app: 'cadeaucommun' });
  await C.demanderConnexion(app('souvenirsfamille'));
  const etat = new URL(journal.ouverts.pop()).searchParams.get('etat');
  // État différent : refusé, sans appeler Supabase
  const n = appels.length;
  assert.match(await C.recevoirConnexion({ genre: 'reponse', etat: ETAT, jeton: 'bon-jeton', erreur: null }), /expiré/);
  assert.equal(appels.length, n);

  await C.demanderConnexion(app('souvenirsfamille'));
  const e2 = new URL(journal.ouverts.pop()).searchParams.get('etat');
  assert.match(await C.recevoirConnexion({ genre: 'reponse', etat: e2, jeton: null, erreur: 'refus' }), /refusée/);

  await C.demanderConnexion(app('souvenirsfamille'));
  const e3 = new URL(journal.ouverts.pop()).searchParams.get('etat');
  assert.match(await C.recevoirConnexion({ genre: 'reponse', etat: e3, jeton: null, erreur: 'non_connecte' }), /pas connectée/);

  await C.demanderConnexion(app('souvenirsfamille'));
  const e4 = new URL(journal.ouverts.pop()).searchParams.get('etat');
  assert.match(await C.recevoirConnexion({ genre: 'reponse', etat: e4, jeton: 'perime', erreur: null }), /plus valable/);
  assert.notEqual(etat, e2);
});

test('app pas installée', async () => {
  configurerFamille(faux, { app: 'voyagecommun' });
  journal.refuserOuverture = true;
  assert.equal(await C.demanderConnexion(app('cadeaucommun')), false);
  journal.refuserOuverture = false;
});

test('A ne peut pas fabriquer le code : B est prévenu', async () => {
  configurerFamille(faux, { app: 'cuisine' });
  const demande = { genre: 'demande', demandeur: app('voyagecommun'), etat: ETAT };
  reponseFonction = { data: null, error: { message: 'boom' } };
  await assert.rejects(C.accorderConnexion(demande), /Impossible de transmettre/);
  assert.equal(journal.ouverts.pop(), `voyagecommun://connexion-partagee?etat=${ETAT}&erreur=echec`);
  // Jeton avec caractères spéciaux : encodé dans le lien, relu tel quel
  reponseFonction = { data: { jeton: 'a/b+c=' }, error: null };
  await C.accorderConnexion(demande);
  const url = journal.ouverts.pop();
  configurerFamille(faux, { app: 'voyagecommun' });
  assert.equal(C.lireLienConnexion(url).jeton, 'a/b+c=');
});
