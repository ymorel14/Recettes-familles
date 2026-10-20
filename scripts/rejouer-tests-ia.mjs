// Rejoue les jeux de tests de l'assistant (tests/ia/<route>/*.json) contre la
// fonction Edge « ia » déployée, avec un compte de test. Voir tests/ia/LISEZMOI.md.
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const racine = join(dirname(fileURLToPath(import.meta.url)), '..');
const dossier = join(racine, 'tests', 'ia');
const { SUPABASE_URL, SUPABASE_ANON_KEY, TEST_EMAIL, TEST_MOT_DE_PASSE } = process.env;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !TEST_EMAIL || !TEST_MOT_DE_PASSE) {
  console.error('Renseignez SUPABASE_URL, SUPABASE_ANON_KEY, TEST_EMAIL et TEST_MOT_DE_PASSE.');
  process.exit(1);
}

const sansAccents = (t) => String(t).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

function comparer(attendu, obtenu, chemin = '') {
  const ecarts = [];
  for (const [cle, valeur] of Object.entries(attendu)) {
    const ici = chemin ? `${chemin}.${cle}` : cle;
    const v = obtenu?.[cle];
    if (valeur === '*') {
      if (v == null || v === '' || (Array.isArray(v) && v.length === 0)) ecarts.push(`${ici} : vide`);
    } else if (typeof valeur === 'string' && valeur.startsWith('~')) {
      if (!sansAccents(v ?? '').includes(sansAccents(valeur.slice(1)))) ecarts.push(`${ici} : « ${v} » ne contient pas « ${valeur.slice(1)} »`);
    } else if (Array.isArray(valeur) && valeur.length === 1 && typeof valeur[0] === 'number') {
      if (!Array.isArray(v) || v.length < valeur[0]) ecarts.push(`${ici} : ${Array.isArray(v) ? v.length : 0} élément(s), ${valeur[0]} attendu(s) au moins`);
    } else if (valeur && typeof valeur === 'object') {
      ecarts.push(...comparer(valeur, v ?? {}, ici));
    } else if (v !== valeur) {
      ecarts.push(`${ici} : ${JSON.stringify(v)} au lieu de ${JSON.stringify(valeur)}`);
    }
  }
  return ecarts;
}

// Remplace "@chemin/photo.jpg" par le contenu du fichier en base64.
function preparer(entree, dossierCas) {
  if (typeof entree === 'string' && entree.startsWith('@')) {
    return readFileSync(join(dossierCas, entree.slice(1))).toString('base64');
  }
  if (Array.isArray(entree)) return entree.map((x) => preparer(x, dossierCas));
  if (entree && typeof entree === 'object') return Object.fromEntries(Object.entries(entree).map(([k, v]) => [k, preparer(v, dossierCas)]));
  return entree;
}

const connexion = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
  method: 'POST',
  headers: { apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: TEST_EMAIL, password: TEST_MOT_DE_PASSE }),
});
const session = await connexion.json();
if (!session.access_token) {
  console.error('Connexion du compte de test impossible :', session.error_description ?? session.msg ?? session);
  process.exit(1);
}

const demandees = process.argv.slice(2);
const routes = existsSync(dossier)
  ? readdirSync(dossier, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name)
  : [];
let reussis = 0;
let rates = 0;

for (const route of routes.filter((r) => !demandees.length || demandees.includes(r))) {
  const dossierRoute = join(dossier, route);
  const cas = readdirSync(dossierRoute).filter((f) => f.endsWith('.json')).sort();
  console.log(`\n▶ ${route} (${cas.length} cas)`);
  for (const fichier of cas) {
    const test = JSON.parse(readFileSync(join(dossierRoute, fichier), 'utf8'));
    const debut = Date.now();
    const reponse = await fetch(`${SUPABASE_URL}/functions/v1/ia/${route}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${session.access_token}`, apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(preparer(test.entree ?? {}, dossierRoute)),
    });
    const corps = await reponse.json().catch(() => ({}));
    const duree = ((Date.now() - debut) / 1000).toFixed(1);
    const ecarts = test.erreurAttendue
      ? corps?.erreur?.code === test.erreurAttendue ? [] : [`erreur « ${test.erreurAttendue} » attendue, reçu ${JSON.stringify(corps?.erreur ?? corps)}`]
      : corps?.erreur
        ? [`erreur ${corps.erreur.code} : ${corps.erreur.message}`]
        : comparer(test.attendu ?? {}, corps?.resultat ?? {});
    if (ecarts.length === 0) {
      reussis++;
      console.log(`  ✔ ${fichier} (${duree} s)`);
    } else {
      rates++;
      console.log(`  ✘ ${fichier} (${duree} s)\n      ${ecarts.join('\n      ')}`);
    }
  }
}

console.log(`\n${reussis} réussi(s), ${rates} raté(s).`);
process.exit(rates ? 1 : 0);
