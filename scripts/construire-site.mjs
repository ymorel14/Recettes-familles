// Construit le site web commun aux apps de la famille : une seule adresse,
// donc une seule connexion (le navigateur garde la session une fois pour
// toutes les apps du site).
//
//   site/dist/index.html        accueil (choix de l'app)
//   site/dist/cuisine/          Recettes familiales
//   site/dist/cadeaux/          CadeauCommun
//   site/dist/voyages/          VoyageCommun
//   site/dist/souvenirs/        SouvenirsFamille
//   site/dist/quotidien/        Quotidien
//   site/dist/courses/          Courses
//
// Lancement depuis la racine du dépôt : npm run site:export:web
// (Netlify le lance lui-même, voir netlify.toml). Pour n'en construire que
// certaines : node scripts/construire-site.mjs voyages souvenirs
// Les apps lisent EXPO_PUBLIC_SUPABASE_URL et EXPO_PUBLIC_SUPABASE_ANON_KEY
// dans leur .env (en local) ou dans les variables de Netlify.

import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const racine = join(dirname(fileURLToPath(import.meta.url)), '..');
const sortie = join(racine, 'site', 'dist');

// Mêmes chemins que APPS_FAMILLE (packages/famille/src/appsFamille.ts).
const APPS = [
  { dossier: 'cuisine', chemin: 'cuisine' },
  { dossier: 'cadeaucommun', chemin: 'cadeaux' },
  { dossier: 'voyage', chemin: 'voyages' },
  { dossier: 'souvenirs', chemin: 'souvenirs' },
  { dossier: 'quotidien', chemin: 'quotidien' },
  { dossier: 'courses', chemin: 'courses' },
];

// Anciennes adresses de l'app Cuisine, quand elle occupait seule le site :
// redirigées vers /cuisine/… pour que les favoris et liens partagés
// continuent de marcher. « courses » n'en fait plus partie : /courses/ est
// désormais l'adresse de l'app Courses.
const ANCIENNES_ADRESSES_CUISINE = [
  'connexion', 'bienvenue', 'foyer', 'congelateur', 'assistant', 'aide-memoire',
  'profil', 'categorie', 'recette', 'recette-edition', 'scanner', 'importer',
];

// Vérifie que chaque fichier demandé par l'app (polices, images…) existe bien
// dans le dossier construit : sinon le site renverrait la page de l'app à la
// place (règle /<app>/*), sans erreur visible. Simple avertissement dans le
// journal de construction (Netlify), pour repérer un fichier perdu.
function verifierFichiers(app, destination) {
  const dossierJs = join(destination, '_expo', 'static', 'js', 'web');
  const prefixe = `/${app.chemin}/`;
  const manquants = new Set();
  for (const fichier of existsSync(dossierJs) ? readdirSync(dossierJs) : []) {
    if (!fichier.endsWith('.js')) continue;
    const contenu = readFileSync(join(dossierJs, fichier), 'utf8');
    const motif = new RegExp(`"(${prefixe.replace(/[/]/g, '\\/')}assets\\/[^"]+)"`, 'g');
    for (const [, adresse] of contenu.matchAll(motif)) {
      const chemin = join(destination, ...adresse.slice(prefixe.length).split('/'));
      if (!existsSync(chemin)) manquants.add(adresse);
    }
  }
  if (manquants.size) {
    console.warn(`\n⚠ ${app.chemin} : fichiers demandés par l'app mais absents du site :`);
    for (const m of manquants) console.warn(`   ${m}`);
  }
}

const demandees = process.argv.slice(2);
const aConstruire = demandees.length ? APPS.filter((a) => demandees.includes(a.chemin)) : APPS;
if (demandees.length && aConstruire.length !== demandees.length) {
  console.error(`Apps possibles : ${APPS.map((a) => a.chemin).join(', ')}`);
  process.exit(1);
}

if (!demandees.length) rmSync(sortie, { recursive: true, force: true });
mkdirSync(sortie, { recursive: true });

for (const app of aConstruire) {
  const destination = join(sortie, app.chemin);
  rmSync(destination, { recursive: true, force: true });
  console.log(`\n▶ ${app.dossier} → /${app.chemin}/`);
  const resultat = spawnSync('npx', ['expo', 'export', '--platform', 'web', '--output-dir', destination], {
    cwd: join(racine, 'apps', app.dossier),
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: { ...process.env, EXPO_PUBLIC_BASE_WEB: `/${app.chemin}` },
  });
  if (resultat.status !== 0) {
    console.error(`Échec de la construction de ${app.dossier}.`);
    process.exit(resultat.status ?? 1);
  }
  // Police des icônes à une adresse simple (<app>/polices/Ionicons.ttf),
  // chargée par App.tsx sur le site : la copie faite par Expo, rangée très
  // profond sous assets/__node_modules/…/build/vendor/…, n'arrivait pas
  // jusqu'au site Netlify (carrés vides à la place des icônes).
  const exiger = createRequire(join(racine, 'apps', app.dossier, 'package.json'));
  const policeIcones = exiger.resolve('@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/Ionicons.ttf');
  mkdirSync(join(destination, 'polices'), { recursive: true });
  cpSync(policeIcones, join(destination, 'polices', 'Ionicons.ttf'));

  verifierFichiers(app, destination);

  // Le _redirects propre à l'app (copié de son dossier public/) ne sert
  // pas ici : celui du site, plus bas, couvre toutes les apps.
  rmSync(join(destination, '_redirects'), { force: true });
}

// Accueil
cpSync(join(racine, 'site', 'accueil'), sortie, { recursive: true });

// Règles Netlify : chaque app renvoie ses adresses vers son index.html
// (rechargement d'une page sans erreur 404), anciennes adresses de Cuisine
// redirigées, le reste vers l'accueil.
const lignes = [
  ...APPS.map((a) => `/${a.chemin}/*  /${a.chemin}/index.html  200`),
  ...ANCIENNES_ADRESSES_CUISINE.flatMap((c) => [`/${c}  /cuisine/${c}  301`, `/${c}/*  /cuisine/${c}/:splat  301`]),
  '/*  /index.html  200',
];
writeFileSync(join(sortie, '_redirects'), lignes.join('\n') + '\n');

const manquantes = APPS.filter((a) => !existsSync(join(sortie, a.chemin, 'index.html')));
if (manquantes.length) console.warn(`\n⚠ Pas encore construites : ${manquantes.map((a) => a.chemin).join(', ')}`);
console.log(`\n✔ Site prêt dans site/dist`);
