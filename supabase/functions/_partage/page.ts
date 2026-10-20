// Lecture d'une page web pour l'assistant (lien collé dans une envie, plus
// tard : recette, annonce). Seulement des adresses publiques http(s) ; pas
// d'adresses internes (protection contre les requêtes vers le réseau du
// serveur). Taille et durée limitées.

export type LecturePage = {
  url: string;
  html: string;
  titre: string | null;
  image: string | null;
  prix: number | null;
  devise: string | null;
  description: string | null;
  texte: string; // texte visible nettoyé (menus et scripts retirés), borné
};

const INTERDITS = [/^localhost$/i, /^127\./, /^10\./, /^192\.168\./, /^172\.(1[6-9]|2\d|3[01])\./, /^169\.254\./, /^0\./, /^\[?::1\]?$/, /\.local$/i, /\.internal$/i, /^\[?f[cd][0-9a-f]{2}:/i, /^\[?fe80:/i];

export function adresseAutorisee(brut: string): URL | null {
  try {
    const u = new URL(brut.trim());
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    if (INTERDITS.some((r) => r.test(u.hostname))) return null;
    if (/^\d+$/.test(u.hostname)) return null;
    return u;
  } catch {
    return null;
  }
}

export function decoder(t: string): string {
  return t
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_m, n) => String.fromCharCode(Number(n)))
    .replace(/&euro;/g, '€');
}

export function meta(html: string, ...noms: string[]): string | null {
  for (const nom of noms) {
    const motifs = [
      new RegExp(`<meta[^>]+(?:property|name|itemprop)=["']${nom}["'][^>]*content=["']([^"']+)["']`, 'i'),
      new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name|itemprop)=["']${nom}["']`, 'i'),
    ];
    for (const m of motifs) {
      const t = html.match(m)?.[1];
      if (t && t.trim()) return decoder(t.trim());
    }
  }
  return null;
}

function nombre(t: unknown): number | null {
  if (t == null) return null;
  const s = String(t).replace(/\s|€|EUR/gi, '').replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}

// Données structurées « Product » (JSON-LD), quand la page en a.
function produitJsonLd(html: string): { nom?: string; image?: string; prix?: number | null; devise?: string; description?: string } | null {
  const blocs = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  for (const [, contenu] of blocs) {
    try {
      const donnees = JSON.parse(contenu.trim());
      const candidats: any[] = [];
      const parcourir = (x: any) => {
        if (!x) return;
        if (Array.isArray(x)) return x.forEach(parcourir);
        if (typeof x === 'object') {
          const type = x['@type'];
          if (type === 'Product' || (Array.isArray(type) && type.includes('Product'))) candidats.push(x);
          if (x['@graph']) parcourir(x['@graph']);
        }
      };
      parcourir(donnees);
      const p = candidats[0];
      if (p) {
        const offre = Array.isArray(p.offers) ? p.offers[0] : p.offers;
        const prix = nombre(offre?.price ?? offre?.lowPrice ?? offre?.priceSpecification?.price);
        const image = Array.isArray(p.image) ? p.image[0] : typeof p.image === 'object' ? p.image?.url : p.image;
        return {
          nom: p.name ? decoder(String(p.name)) : undefined,
          image: image ? String(image) : undefined,
          prix,
          devise: offre?.priceCurrency,
          description: p.description ? decoder(String(p.description)).slice(0, 300) : undefined,
        };
      }
    } catch {
      // JSON-LD mal formé : on ignore ce bloc.
    }
  }
  return null;
}

function texteVisible(html: string, max: number): string {
  return decoder(
    html
      .replace(/<(script|style|noscript|svg|nav|footer|header|form|iframe)[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
  )
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

export async function lirePage(
  brut: string,
  options: { maxOctets?: number; maxTexte?: number; entetes?: Record<string, string> } = {}
): Promise<LecturePage | null> {
  const u = adresseAutorisee(brut);
  if (!u) return null;
  const controle = new AbortController();
  const minuteur = setTimeout(() => controle.abort(), 10000);
  try {
    const reponse = await fetch(u.toString(), {
      redirect: 'follow',
      signal: controle.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
        'Accept-Language': 'fr-FR,fr;q=0.9',
        Accept: 'text/html,application/xhtml+xml',
        ...(options.entetes ?? {}),
      },
    });
    if (!reponse.ok || !(reponse.headers.get('content-type') ?? '').includes('html')) return null;
    if (!adresseAutorisee(reponse.url)) return null; // redirection vers une adresse interdite
    const max = options.maxOctets ?? 1_500_000;
    const lecteur = reponse.body?.getReader();
    if (!lecteur) return null;
    const morceaux: Uint8Array[] = [];
    let total = 0;
    while (total < max) {
      const { value, done } = await lecteur.read();
      if (done || !value) break;
      morceaux.push(value);
      total += value.length;
    }
    lecteur.cancel().catch(() => {});
    const html = new TextDecoder().decode(
      morceaux.reduce((acc, m) => {
        const r = new Uint8Array(acc.length + m.length);
        r.set(acc);
        r.set(m, acc.length);
        return r;
      }, new Uint8Array())
    );
    const ld = produitJsonLd(html);
    const titreBalise = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
    const image = ld?.image ?? meta(html, 'og:image', 'twitter:image');
    return {
      url: reponse.url,
      html,
      titre: ld?.nom ?? meta(html, 'og:title', 'twitter:title') ?? (titreBalise ? decoder(titreBalise.trim()) : null),
      image: image ? new URL(image, reponse.url).toString() : null,
      prix: ld?.prix ?? nombre(meta(html, 'product:price:amount', 'og:price:amount', 'price')),
      devise: ld?.devise ?? meta(html, 'product:price:currency', 'og:price:currency', 'priceCurrency'),
      description: ld?.description ?? meta(html, 'og:description', 'description'),
      texte: texteVisible(html, options.maxTexte ?? 15000),
    };
  } catch {
    return null;
  } finally {
    clearTimeout(minuteur);
  }
}
