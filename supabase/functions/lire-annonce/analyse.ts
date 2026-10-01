// Analyse d'une page d'annonce (hébergement, activité) : fonctions pures,
// sans réseau, testées seules (apps/voyage/scripts/tester-annonce.mjs).
//
// Sources, par ordre de confiance :
//  1. données structurées schema.org en JSON-LD (Hotel, LodgingBusiness,
//     VacationRental, TouristAttraction, Restaurant, Event, Product…),
//     que beaucoup de sites publient pour Google ;
//  2. balises Open Graph / Twitter (titre, photo, description, prix) ;
//  3. la balise <title>.
// Tout ce qui est trouvé reste modifiable dans l'app.

export type Annonce = {
  titre: string | null;
  image: string | null;
  description: string | null;
  site: string | null;
  adresse: string | null;
  ville: string | null;
  prix: number | null;
  devise: string | null;
  capacite: number | null;
  chambres: number | null;
  // Genre de page reconnu, pour préremplir le type ou la catégorie.
  genre: 'hebergement' | 'restaurant' | 'parc' | 'musee' | 'chateau' | 'spectacle' | 'activite' | null;
};

const ENTITES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', eacute: 'é', egrave: 'è', ecirc: 'ê',
  agrave: 'à', acirc: 'â', ccedil: 'ç', ocirc: 'ô', ucirc: 'û', ugrave: 'ù', icirc: 'î', iuml: 'ï', euml: 'ë',
  rsquo: '’', lsquo: '‘', laquo: '«', raquo: '»', hellip: '…', euro: '€', ndash: '–', mdash: '—',
};

export function decoder(texte: string): string {
  return texte
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, nom) => ENTITES[nom.toLowerCase()] ?? m)
    .replace(/\s+/g, ' ')
    .trim();
}

function attribut(balise: string, nom: string): string | null {
  const m = balise.match(new RegExp(`${nom}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'i'));
  return m ? (m[2] ?? m[3] ?? null) : null;
}

// Balises <meta> : property/name → content.
export function metas(html: string): Map<string, string> {
  const resultat = new Map<string, string>();
  for (const balise of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const cle = (attribut(balise, 'property') ?? attribut(balise, 'name') ?? attribut(balise, 'itemprop'))?.toLowerCase();
    const valeur = attribut(balise, 'content');
    if (cle && valeur && !resultat.has(cle)) resultat.set(cle, decoder(valeur));
  }
  return resultat;
}

// Objets JSON-LD de la page (graphes aplatis).
export function jsonLd(html: string): any[] {
  const objets: any[] = [];
  const re = /<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    try {
      const donnees = JSON.parse(m[1].trim());
      const pile = Array.isArray(donnees) ? [...donnees] : [donnees];
      while (pile.length) {
        const o = pile.shift();
        if (!o || typeof o !== 'object') continue;
        if (Array.isArray(o['@graph'])) pile.push(...o['@graph']);
        objets.push(o);
      }
    } catch {
      /* bloc invalide : ignoré */
    }
  }
  return objets;
}

const TYPES_HEBERGEMENT = ['hotel', 'lodgingbusiness', 'vacationrental', 'accommodation', 'house', 'apartment', 'campground', 'bedandbreakfast', 'hostel', 'resort', 'motel', 'singlefamilyresidence'];
const TYPES_ACTIVITE: Record<string, Annonce['genre']> = {
  restaurant: 'restaurant', foodestablishment: 'restaurant',
  amusementpark: 'parc', zoo: 'parc', aquarium: 'parc',
  museum: 'musee',
  castle: 'chateau', landmarksorhistoricalbuildings: 'chateau',
  event: 'spectacle', theaterevent: 'spectacle', musicevent: 'spectacle',
  touristattraction: 'activite', place: 'activite',
};

function types(o: any): string[] {
  const t = o?.['@type'];
  return (Array.isArray(t) ? t : [t]).filter(Boolean).map((x: string) => String(x).toLowerCase());
}

function premier<T>(v: T | T[] | undefined | null): T | null {
  if (v == null) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

function nombre(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(String(v).replace(/\s/g, '').replace(',', '.').replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function texteImage(v: any): string | null {
  const i = premier(v);
  if (!i) return null;
  return typeof i === 'string' ? i : i.url ?? i.contentUrl ?? null;
}

export function analyserAnnonce(html: string, url: string): Annonce {
  const m = metas(html);
  const objets = jsonLd(html);

  // Objet principal : un hébergement d'abord, sinon un lieu ou une activité.
  const principal =
    objets.find((o) => types(o).some((t) => TYPES_HEBERGEMENT.includes(t))) ??
    objets.find((o) => types(o).some((t) => t in TYPES_ACTIVITE)) ??
    objets.find((o) => types(o).includes('product')) ??
    null;

  let genre: Annonce['genre'] = null;
  if (principal) {
    const ts = types(principal);
    if (ts.some((t) => TYPES_HEBERGEMENT.includes(t))) genre = 'hebergement';
    else genre = ts.map((t) => TYPES_ACTIVITE[t]).find(Boolean) ?? null;
  }
  const ogType = m.get('og:type') ?? '';
  if (!genre && /hotel|lodging|rental/i.test(ogType)) genre = 'hebergement';

  const adresseLd = premier(principal?.address);
  const adresse =
    adresseLd && typeof adresseLd === 'object'
      ? [adresseLd.streetAddress, [adresseLd.postalCode, adresseLd.addressLocality].filter(Boolean).join(' ')]
          .filter(Boolean)
          .join(', ') || null
      : typeof adresseLd === 'string'
        ? decoder(adresseLd)
        : null;
  const ville =
    (adresseLd && typeof adresseLd === 'object' ? adresseLd.addressLocality : null) ??
    m.get('og:locality') ??
    m.get('place:location:locality') ??
    null;

  const offre = premier(principal?.offers);
  const prix =
    nombre(offre?.price) ??
    nombre(offre?.lowPrice) ??
    nombre(m.get('product:price:amount')) ??
    nombre(m.get('og:price:amount')) ??
    null;
  const devise = offre?.priceCurrency ?? m.get('product:price:currency') ?? m.get('og:price:currency') ?? (prix ? 'EUR' : null);

  const titreBrut =
    principal?.name ??
    m.get('og:title') ??
    m.get('twitter:title') ??
    (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? null);
  const titre = titreBrut ? decoder(String(titreBrut)).replace(/\s*[|–—-]\s*(Airbnb|Booking\.com|Abritel|Gîtes de France|Tripadvisor)\b.*$/i, '') : null;

  const descriptionBrute = principal?.description ?? m.get('og:description') ?? m.get('description') ?? null;
  const description = descriptionBrute ? decoder(String(descriptionBrute)).slice(0, 400) : null;

  let image = texteImage(principal?.image) ?? m.get('og:image') ?? m.get('twitter:image') ?? null;
  if (image && image.startsWith('/')) {
    try {
      image = new URL(image, url).toString();
    } catch {
      /* image ignorée */
    }
  }

  const capacite =
    nombre(principal?.occupancy?.maxValue) ??
    nombre(premier(principal?.containsPlace)?.occupancy?.maxValue) ??
    nombre(html.match(/(\d{1,2})\s*(?:voyageurs|personnes|couchages)\b/i)?.[1]) ??
    null;
  const chambres =
    nombre(principal?.numberOfRooms) ??
    nombre(principal?.numberOfBedrooms) ??
    nombre(html.match(/(\d{1,2})\s*chambres?\b/i)?.[1]) ??
    null;

  let site = m.get('og:site_name') ?? null;
  if (!site) {
    try {
      site = new URL(url).hostname.replace(/^www\./, '');
    } catch {
      site = null;
    }
  }

  return {
    titre: titre || null,
    image,
    description,
    site,
    adresse,
    ville: ville ? decoder(String(ville)) : null,
    prix,
    devise,
    capacite: capacite !== null ? Math.round(capacite) : null,
    chambres: chambres !== null ? Math.round(chambres) : null,
    genre,
  };
}
