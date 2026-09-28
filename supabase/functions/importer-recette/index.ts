// Fonction Edge Supabase : import d'une recette depuis une page web (cahier
// des charges §6, feuille de route §8 — Phase 3).
//
// La page est récupérée et analysée ICI, côté serveur, plutôt que depuis
// l'app : sur le web (cible multiplateforme, §10), la plupart des sites de
// recettes n'autorisent pas les requêtes cross-origin depuis un navigateur
// (CORS) — un `fetch` direct depuis l'app échouerait silencieusement sur
// cette cible. Passer par une fonction Edge évite le problème sur les trois
// plateformes (Android, iOS, Web) et centralise la logique d'extraction.
//
// Principe d'extraction : priorité aux données structurées "Recipe" que la
// plupart des sites de recettes intègrent déjà (balisage schema.org en
// JSON-LD, utilisé par Google pour les résultats enrichis) ; à défaut,
// repli heuristique minimal (titre + photo depuis les balises meta
// Open Graph), le reste étant à compléter à la main — comme pour le scan
// (§5), l'écran de vérification qui suit permet de tout corriger.
//
// Déploiement (une fois, depuis un poste avec la CLI Supabase installée) :
//   supabase functions deploy importer-recette
// (aucun secret nécessaire : contrairement à l'OCR, aucune clé d'API tierce
// n'est utilisée ici.)
//
// Appelée par l'app via supabase.functions.invoke('importer-recette', { body: { url } }).

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Un user-agent de navigateur courant, plutôt que celui par défaut de Deno
// (souvent bloqué par les protections anti-robots de certains sites).
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

type ResultatImport = {
  titre: string;
  image: string | null;
  parts: number | null;
  tempsPreparationMinutes: number | null;
  tempsCuissonMinutes: number | null;
  ingredients: string[];
  etapes: string[];
  notes: string | null;
  // true si aucune donnée structurée "Recipe" n'a été trouvée : seuls le
  // titre et la photo (repli sur les balises meta) sont fiables.
  repli: boolean;
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  try {
    const { url } = await req.json();
    if (!url || typeof url !== 'string') {
      return reponseErreur('Aucune adresse reçue.', 400);
    }

    let urlValidee: string;
    try {
      urlValidee = new URL(url).toString();
    } catch {
      return reponseErreur("Cette adresse n'est pas valide.", 400);
    }

    const reponsePage = await fetch(urlValidee, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'text/html' },
      redirect: 'follow',
    });
    if (!reponsePage.ok) {
      return reponseErreur(
        `Le site a répondu avec une erreur (${reponsePage.status}). Vérifiez l'adresse.`,
        502
      );
    }

    const html = await reponsePage.text();
    const recette = trouverRecipe(extraireBlocsJsonLd(html));

    const resultat: ResultatImport = recette
      ? {
          titre: texteDe(recette.name) || extraireMeta(html, 'og:title') || '',
          image: imageDe(recette.image) ?? extraireMeta(html, 'og:image'),
          parts: partsDe(recette.recipeYield),
          tempsPreparationMinutes: dureeMinutes(recette.prepTime),
          tempsCuissonMinutes: dureeMinutes(recette.cookTime),
          ingredients: ingredientsDe(recette.recipeIngredient ?? recette.ingredients),
          etapes: etapesDe(recette.recipeInstructions),
          notes: texteDe(recette.description) || null,
          repli: false,
        }
      : {
          titre: extraireMeta(html, 'og:title') || extraireBaliseTitre(html) || '',
          image: extraireMeta(html, 'og:image'),
          parts: null,
          tempsPreparationMinutes: null,
          tempsCuissonMinutes: null,
          ingredients: [],
          etapes: [],
          notes: null,
          repli: true,
        };

    if (!resultat.titre && resultat.ingredients.length === 0 && resultat.etapes.length === 0) {
      return reponseErreur(
        "Impossible de reconnaître une recette sur cette page. Vous pouvez la saisir manuellement.",
        422
      );
    }

    return new Response(JSON.stringify(resultat), {
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return reponseErreur(e instanceof Error ? e.message : 'Erreur inattendue.', 500);
  }
});

function reponseErreur(message: string, statut: number): Response {
  return new Response(JSON.stringify({ erreur: message }), {
    status: statut,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

// Extrait tous les blocs JSON-LD (<script type="application/ld+json">) d'une
// page — un bloc malformé est ignoré plutôt que de faire échouer les autres.
function extraireBlocsJsonLd(html: string): unknown[] {
  const blocs: unknown[] = [];
  const regex = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let correspondance: RegExpExecArray | null;
  while ((correspondance = regex.exec(html))) {
    try {
      blocs.push(JSON.parse(correspondance[1].trim()));
    } catch {
      // Bloc JSON-LD malformé — on continue avec les autres.
    }
  }
  return blocs;
}

// Cherche récursivement un nœud "Recipe" (@type: "Recipe", éventuellement
// dans un tableau ou sous @graph — deux formes courantes du balisage).
function trouverRecipe(noeud: unknown): any | null {
  if (!noeud) return null;
  if (Array.isArray(noeud)) {
    for (const item of noeud) {
      const trouve = trouverRecipe(item);
      if (trouve) return trouve;
    }
    return null;
  }
  if (typeof noeud !== 'object') return null;
  const objet = noeud as Record<string, unknown>;
  const type = objet['@type'];
  const types = Array.isArray(type) ? type : [type];
  if (types.includes('Recipe')) return objet;
  if (objet['@graph']) return trouverRecipe(objet['@graph']);
  return null;
}

// Un champ schema.org peut être une simple chaîne, un tableau, ou un objet
// avec `name`/`@value` (ex. un auteur) — on en tire toujours du texte.
function texteDe(valeur: unknown): string {
  if (typeof valeur === 'string') return valeur.trim();
  if (Array.isArray(valeur)) return valeur.map(texteDe).filter(Boolean).join(' ');
  if (valeur && typeof valeur === 'object') {
    const objet = valeur as Record<string, unknown>;
    return texteDe(objet.name ?? objet['@value'] ?? '');
  }
  return '';
}

function imageDe(valeur: unknown): string | null {
  if (!valeur) return null;
  if (typeof valeur === 'string') return valeur;
  if (Array.isArray(valeur)) return imageDe(valeur[0]);
  if (typeof valeur === 'object') return (valeur as Record<string, unknown>).url as string | undefined ?? null;
  return null;
}

// Durée au format ISO 8601 → minutes. Deux formes rencontrées en pratique :
// la forme courte "PT1H15M", et une forme plus longue avec la partie date à
// zéro, "P0Y0M0DT1H15M0S" (utilisée par exemple par l'export Umami) — dans
// les deux cas, seule la partie après le "T" nous intéresse. Un format non
// reconnu (rare, ex. texte libre) est ignoré plutôt que mal interprété.
function dureeMinutes(valeur: unknown): number | null {
  if (typeof valeur !== 'string' || !valeur.startsWith('P') || !valeur.includes('T')) return null;
  const partieTemps = valeur.split('T')[1];
  const heures = partieTemps.match(/(\d+)H/i);
  const minutes = partieTemps.match(/(\d+)M/i);
  const total = (heures ? parseInt(heures[1], 10) : 0) * 60 + (minutes ? parseInt(minutes[1], 10) : 0);
  return total > 0 ? total : null;
}

function ingredientsDe(valeur: unknown): string[] {
  if (!valeur) return [];
  const liste = Array.isArray(valeur) ? valeur : [valeur];
  return liste.map(texteDe).filter(Boolean);
}

// `recipeInstructions` : tableau de chaînes, de HowToStep ({ text }), ou de
// HowToSection ({ itemListElement: [...] }) regroupant plusieurs étapes.
function etapesDe(valeur: unknown): string[] {
  if (!valeur) return [];
  if (typeof valeur === 'string') {
    // Certains sites mettent tout le texte des étapes dans une seule chaîne,
    // une étape par ligne.
    return valeur
      .split('\n')
      .map((ligne) => ligne.trim())
      .filter(Boolean);
  }
  const liste = Array.isArray(valeur) ? valeur : [valeur];
  const etapes: string[] = [];
  for (const item of liste) {
    if (typeof item === 'string') {
      if (item.trim()) etapes.push(item.trim());
      continue;
    }
    if (item && typeof item === 'object') {
      const objet = item as Record<string, unknown>;
      if (objet['@type'] === 'HowToSection' && objet.itemListElement) {
        etapes.push(...etapesDe(objet.itemListElement));
        continue;
      }
      const texte = texteDe(objet.text ?? objet.name ?? '');
      if (texte) etapes.push(texte);
    }
  }
  return etapes;
}

// `recipeYield` peut être "4 portions", "4", ou ["4 servings", "4"] selon
// les sites — on retient le premier nombre trouvé.
function partsDe(valeur: unknown): number | null {
  const texte = texteDe(valeur);
  const correspondance = texte.match(/\d+/);
  return correspondance ? parseInt(correspondance[0], 10) : null;
}

function extraireMeta(html: string, propriete: string): string | null {
  const motif = `[a-z]+=["']${propriete}["']`;
  const regexDroit = new RegExp(`<meta[^>]+${motif}[^>]+content=["']([^"']*)["']`, 'i');
  const regexInverse = new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+${motif}`, 'i');
  const correspondance = html.match(regexDroit) ?? html.match(regexInverse);
  return correspondance ? decoderEntitesHtml(correspondance[1]) : null;
}

function extraireBaliseTitre(html: string): string | null {
  const correspondance = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return correspondance ? decoderEntitesHtml(correspondance[1].trim()) : null;
}

const ENTITES_HTML: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', eacute: 'é', egrave: 'è',
  agrave: 'à', ccedil: 'ç', ecirc: 'ê', ocirc: 'ô', ucirc: 'û', icirc: 'î', euml: 'ë',
};

function decoderEntitesHtml(texte: string): string {
  return texte
    .replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (jeton, code) => {
      if (code[0] === '#') {
        const point = code[1] === 'x' || code[1] === 'X' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
        return Number.isFinite(point) ? String.fromCodePoint(point) : jeton;
      }
      return ENTITES_HTML[code.toLowerCase()] ?? jeton;
    })
    .trim();
}
