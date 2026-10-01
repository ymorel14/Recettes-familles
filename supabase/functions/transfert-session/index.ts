// Fonction Edge Supabase : passer sa connexion d'une app de la famille à une
// autre, sur un même téléphone (« Continuer avec mon compte »).
//
// Sur téléphone, chaque app garde sa session dans son propre stockage : une
// app ne peut pas lire celle d'une autre. Le passage se fait donc ainsi :
//   1. l'app B (pas connectée) ouvre l'app A (connectée) par son lien
//      (ex. recettesfamiliales://partager-connexion?pour=voyagecommun&etat=…) ;
//   2. l'app A demande l'accord de la personne, puis appelle cette fonction
//      avec SA session ;
//   3. la fonction vérifie la session et fabrique un code de connexion à
//      usage unique pour ce même compte (le code d'un « lien magique »,
//      sans envoyer d'email) ;
//   4. l'app A rouvre l'app B avec ce code, que B échange contre sa propre
//      session (supabase.auth.verifyOtp).
// Chaque app a ainsi sa session à elle : se déconnecter de l'une ne touche
// pas aux autres sur ce téléphone, et rien n'est copié d'une app à l'autre.
//
// Entrée : aucune (la session vient de l'en-tête Authorization, vérifiée
// par Supabase avant d'arriver ici). Sortie : { jeton }.
// Le code expire avec les liens magiques du projet (Authentication >
// Providers > Email > « Email OTP Expiration », 1 heure par défaut ;
// quelques minutes suffisent).
//
// Déploiement (une fois) : supabase functions deploy transfert-session
// Les variables SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont fournies
// automatiquement par Supabase.

import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  if (req.method !== 'POST') return reponseErreur('Méthode non prise en charge.', 405);

  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  if (!jwt) return reponseErreur('Connectez-vous d’abord.', 401);

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // La clé anonyme seule (sans utilisateur) ne suffit pas : il faut une
  // vraie session.
  const { data: lu, error: erreurLecture } = await admin.auth.getUser(jwt);
  const utilisateur = lu?.user;
  if (erreurLecture || !utilisateur) return reponseErreur('Session expirée : reconnectez-vous.', 401);
  if (!utilisateur.email) return reponseErreur('Ce compte n’a pas d’adresse email.', 422);

  const { data, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email: utilisateur.email });
  const jeton = data?.properties?.hashed_token;
  if (error || !jeton) {
    console.error('[transfert-session] generateLink', error);
    return reponseErreur('Impossible de préparer la connexion. Réessayez.', 500);
  }

  return new Response(JSON.stringify({ jeton }), {
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
});

function reponseErreur(message: string, statut: number): Response {
  return new Response(JSON.stringify({ erreur: message }), {
    status: statut,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}
