// Fonction Edge Supabase : calcul d'un trajet en voiture pour VoyageCommun
// (cahier des charges, section Transport).
//
// Entrée : { depart: "Rouen" | "12 rue…, 76000 Rouen", arrivee: "Les Epesses" }
//          (ou des coordonnées { lat, lon } à la place d'un texte).
// Sortie : distance (km) et durée (min) d'un aller simple, par le plus rapide
//          et sans autoroute, prix moyen du jour des carburants en France.
//
// Services utilisés (publics, gratuits, sans clé) :
//  - géocodage de la Géoplateforme IGN : data.geopf.fr/geocodage/search ;
//  - calcul d'itinéraire de la Géoplateforme : data.geopf.fr/navigation/itineraire
//    (France entière et outre-mer, 5 requêtes/s par adresse IP) ;
//  - prix des carburants, flux instantané (data.economie.gouv.fr).
// Les péages ne sont fournis par aucun service gratuit : l'app les fait
// saisir, avec un lien vers un calculateur d'itinéraire.
//
// Le calcul passe par ici plutôt que depuis l'app : pas de souci de CORS sur
// la version web, et un seul endroit à adapter si un service change.
//
// Déploiement (une fois, depuis un poste avec la CLI Supabase) :
//   supabase functions deploy calcul-trajet
// Appelée par l'app via supabase.functions.invoke('calcul-trajet', { body }).

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ville : seule information montrée aux autres (l'adresse du foyer reste privée).
type Point = { lat: number; lon: number; libelle: string; ville: string };

type Itineraire = { distanceKm: number; dureeMinutes: number } | null;

type Resultat = {
  depart: Point;
  arrivee: Point;
  rapide: Itineraire; // itinéraire le plus rapide (autoroutes comprises)
  sansAutoroute: Itineraire;
  prixCarburants: Record<string, number> | null; // €/L, moyenne nationale du jour
};

const GEOCODAGE = 'https://data.geopf.fr/geocodage/search';
const ITINERAIRE = 'https://data.geopf.fr/navigation/itineraire';
const CARBURANTS =
  'https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/prix-des-carburants-en-france-flux-instantane-v2/records';

async function geocoder(entree: unknown): Promise<Point> {
  if (entree && typeof entree === 'object' && 'lat' in entree && 'lon' in entree) {
    const e = entree as { lat: number; lon: number; libelle?: string };
    return { lat: Number(e.lat), lon: Number(e.lon), libelle: e.libelle ?? '', ville: e.libelle ?? '' };
  }
  const texte = String(entree ?? '').trim();
  if (!texte) throw new Error('Adresse manquante.');
  const url = `${GEOCODAGE}?${new URLSearchParams({ q: texte, limit: '1' })}`;
  const reponse = await fetch(url);
  if (!reponse.ok) throw new Error(`Géocodage indisponible (${reponse.status}).`);
  const json = await reponse.json();
  const f = json?.features?.[0];
  if (!f) throw new Error(`Adresse introuvable : « ${texte} ».`);
  const [lon, lat] = f.geometry.coordinates;
  const p = f.properties ?? {};
  return { lat, lon, libelle: p.label ?? texte, ville: p.city ?? p.label ?? texte };
}

async function itineraire(a: Point, b: Point, sansAutoroute: boolean): Promise<Itineraire> {
  const params = new URLSearchParams({
    resource: sansAutoroute ? 'bdtopo-valhalla' : 'bdtopo-osrm',
    start: `${a.lon},${a.lat}`,
    end: `${b.lon},${b.lat}`,
    profile: 'car',
    optimization: 'fastest',
    getSteps: 'false',
    getBbox: 'false',
    distanceUnit: 'kilometer',
    timeUnit: 'minute',
    geometryFormat: 'polyline',
  });
  if (sansAutoroute) {
    params.set(
      'constraints',
      JSON.stringify({ constraintType: 'banned', key: 'wayType', operator: '=', value: 'autoroute' })
    );
  }
  try {
    const reponse = await fetch(`${ITINERAIRE}?${params}`);
    if (!reponse.ok) return null;
    const json = await reponse.json();
    const distance = Number(json?.distance);
    const duree = Number(json?.duration);
    if (!Number.isFinite(distance) || !Number.isFinite(duree)) return null;
    return { distanceKm: Math.round(distance * 10) / 10, dureeMinutes: Math.round(duree) };
  } catch {
    return null;
  }
}

async function prixCarburants(): Promise<Record<string, number> | null> {
  const select = [
    'avg(gazole_prix) as gazole',
    'avg(sp95_prix) as sp95',
    'avg(sp98_prix) as sp98',
    'avg(e10_prix) as e10',
    'avg(e85_prix) as e85',
    'avg(gplc_prix) as gpl',
  ].join(',');
  try {
    const reponse = await fetch(`${CARBURANTS}?${new URLSearchParams({ select, limit: '1' })}`);
    if (!reponse.ok) return null;
    const ligne = (await reponse.json())?.results?.[0];
    if (!ligne) return null;
    const prix: Record<string, number> = {};
    for (const [cle, valeur] of Object.entries(ligne)) {
      const n = Number(valeur);
      // Le flux donne des €/L (parfois des millièmes d'euro dans d'anciennes versions).
      if (Number.isFinite(n) && n > 0) prix[cle] = Math.round((n > 100 ? n / 1000 : n) * 1000) / 1000;
    }
    // Le SP95-E10 est le plus vendu : il sert de prix "SP95" s'il manque.
    if (!prix.sp95 && prix.e10) prix.sp95 = prix.e10;
    return Object.keys(prix).length ? prix : null;
  } catch {
    return null;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });

  try {
    const { depart, arrivee } = await req.json();
    const [a, b] = await Promise.all([geocoder(depart), geocoder(arrivee)]);
    const [rapide, sansAutoroute, prix] = await Promise.all([
      itineraire(a, b, false),
      itineraire(a, b, true),
      prixCarburants(),
    ]);
    if (!rapide && !sansAutoroute) {
      return reponseErreur('Itinéraire introuvable (hors de France ?). Saisissez la distance à la main.', 422);
    }
    const resultat: Resultat = { depart: a, arrivee: b, rapide, sansAutoroute, prixCarburants: prix };
    return new Response(JSON.stringify(resultat), {
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return reponseErreur(e instanceof Error ? e.message : 'Calcul impossible.', 400);
  }
});

function reponseErreur(message: string, statut: number): Response {
  return new Response(JSON.stringify({ erreur: message }), {
    status: statut,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}
