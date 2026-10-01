// Fonction Edge Supabase : lecture d'une annonce pour VoyageCommun
// (hébergement Airbnb / Gîtes de France / Booking…, site d'une activité).
//
// Entrée : { url }. Sortie : titre, photo, description, adresse, ville, prix,
// couchages, chambres et genre de page (voir analyse.ts), le tout
// modifiable dans l'app. Même principe que la fonction importer-recette de
// l'app Cuisine : la page est lue ici, côté serveur, pour éviter les
// blocages CORS de la version web.
//
// Limite connue : certains grands sites (Airbnb, Booking) bloquent souvent
// les lectures automatiques ou ne publient pas le prix dans la page ; la
// fonction renvoie alors ce qu'elle a pu lire (souvent titre et photo), ou
// une erreur claire, et l'on complète à la main.
//
// Déploiement (une fois) : supabase functions deploy lire-annonce
// Appelée par l'app via supabase.functions.invoke('lire-annonce', { body: { url } }).

import { analyserAnnonce } from './analyse.ts';

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

const TAILLE_MAX = 3_000_000; // octets lus au plus

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });

  try {
    const { url } = await req.json();
    let adresse: URL;
    try {
      adresse = new URL(String(url ?? '').trim());
      if (!/^https?:$/.test(adresse.protocol)) throw new Error();
    } catch {
      return reponseErreur('Lien invalide.', 400);
    }

    const controle = new AbortController();
    const minuterie = setTimeout(() => controle.abort(), 12000);
    let reponse: Response;
    try {
      reponse = await fetch(adresse, {
        headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'fr-FR,fr;q=0.9', Accept: 'text/html' },
        redirect: 'follow',
        signal: controle.signal,
      });
    } catch {
      return reponseErreur('Le site ne répond pas. Remplissez la fiche à la main.', 502);
    } finally {
      clearTimeout(minuterie);
    }
    if (reponse.status === 403 || reponse.status === 429) {
      return reponseErreur('Ce site bloque la lecture automatique. Remplissez la fiche à la main.', 422);
    }
    if (!reponse.ok) return reponseErreur(`Page introuvable (${reponse.status}).`, 422);

    const lecteur = reponse.body?.getReader();
    let html = '';
    if (lecteur) {
      const decodeur = new TextDecoder();
      let lus = 0;
      while (lus < TAILLE_MAX) {
        const { done, value } = await lecteur.read();
        if (done) break;
        lus += value.length;
        html += decodeur.decode(value, { stream: true });
      }
      lecteur.cancel().catch(() => {});
    }

    const annonce = analyserAnnonce(html, reponse.url || adresse.toString());
    if (!annonce.titre && !annonce.image) {
      return reponseErreur('Rien de lisible sur cette page. Remplissez la fiche à la main.', 422);
    }
    return new Response(JSON.stringify(annonce), {
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return reponseErreur(e instanceof Error ? e.message : 'Lecture impossible.', 400);
  }
});

function reponseErreur(message: string, statut: number): Response {
  return new Response(JSON.stringify({ erreur: message }), {
    status: statut,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}
