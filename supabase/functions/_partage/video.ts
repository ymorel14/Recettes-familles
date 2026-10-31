// Texte PUBLIC d'une vidéo de cuisine (spécification § 4.1.2) : titre et
// description (YouTube), légende (TikTok, Instagram). La vidéo elle-même
// n'est jamais téléchargée, et on ne lit pas les sous-titres : si la
// description ne donne pas la recette, l'app propose de coller la
// description ou les sous-titres.
import { adresseAutorisee, decoder, lirePage, meta } from './page.ts';

export type Plateforme = 'youtube' | 'tiktok' | 'instagram';
export type TexteVideo = { plateforme: Plateforme; url: string; titre: string | null; texte: string; image: string | null };

export function plateformeVideo(lien: string): Plateforme | null {
  const u = adresseAutorisee(lien);
  if (!u) return null;
  const h = u.hostname.replace(/^www\.|^m\./, '');
  if (h === 'youtu.be' || h.endsWith('youtube.com')) return 'youtube';
  if (h.endsWith('tiktok.com')) return 'tiktok';
  if (h === 'instagram.com' || h.endsWith('.instagram.com')) return 'instagram';
  return null;
}

// Identifiant d'une vidéo YouTube (watch?v=, youtu.be/, shorts/, live/).
export function idYoutube(lien: string): string | null {
  const u = adresseAutorisee(lien);
  if (!u) return null;
  if (u.hostname === 'youtu.be') return u.pathname.slice(1).split('/')[0] || null;
  const v = u.searchParams.get('v');
  if (v) return v;
  const m = u.pathname.match(/^\/(?:shorts|live|embed)\/([\w-]{6,})/);
  return m?.[1] ?? null;
}

async function json(url: string): Promise<any | null> {
  const controle = new AbortController();
  const minuteur = setTimeout(() => controle.abort(), 8000);
  try {
    const r = await fetch(url, { signal: controle.signal, headers: { Accept: 'application/json' } });
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  } finally {
    clearTimeout(minuteur);
  }
}

async function youtube(lien: string): Promise<TexteVideo | null> {
  const id = idYoutube(lien);
  if (!id) return null;
  const url = `https://www.youtube.com/watch?v=${encodeURIComponent(id)}&hl=fr`;
  // SOCS : évite la page de consentement aux cookies (serveurs en Europe).
  const page = await lirePage(url, { maxOctets: 4_000_000, maxTexte: 0, entetes: { Cookie: 'SOCS=CAI; CONSENT=YES+1' } });
  let titre: string | null = null;
  let texte = '';
  let image: string | null = null;
  if (page) {
    const desc = page.html.match(/"shortDescription":"((?:[^"\\]|\\.)*)"/)?.[1];
    if (desc) {
      try {
        texte = JSON.parse(`"${desc}"`);
      } catch {
        texte = '';
      }
    }
    titre = page.titre?.replace(/\s*-\s*YouTube$/, '') ?? null;
    texte ||= page.description ?? '';
    image = page.image;
  }
  if (!titre) {
    const o = await json(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url)}`);
    titre = o?.title ?? null;
    image ??= o?.thumbnail_url ?? null;
  }
  return titre || texte ? { plateforme: 'youtube', url, titre, texte, image } : null;
}

async function tiktok(lien: string): Promise<TexteVideo | null> {
  // oEmbed public de TikTok : « title » contient la légende de la vidéo.
  const o = await json(`https://www.tiktok.com/oembed?url=${encodeURIComponent(lien)}`);
  if (!o?.title) return null;
  return { plateforme: 'tiktok', url: lien, titre: o.author_name ? `Vidéo de ${o.author_name}` : null, texte: String(o.title), image: o.thumbnail_url ?? null };
}

async function instagram(lien: string): Promise<TexteVideo | null> {
  // Souvent derrière une page de connexion : on prend ce que la page publique donne.
  const page = await lirePage(lien, { maxTexte: 0 });
  if (!page) return null;
  const texte = meta(page.html, 'og:description', 'description') ?? '';
  const legende = texte.replace(/^[\d\s,.kKmM]+ (likes?|J’aime|J'aime)[^:]*:\s*/i, '');
  return legende ? { plateforme: 'instagram', url: page.url, titre: page.titre ? decoder(page.titre) : null, texte: legende, image: page.image } : null;
}

export async function texteVideo(lien: string): Promise<TexteVideo | null> {
  switch (plateformeVideo(lien)) {
    case 'youtube':
      return youtube(lien);
    case 'tiktok':
      return tiktok(lien);
    case 'instagram':
      return instagram(lien);
    default:
      return null;
  }
}
