// Fonction Edge Supabase : rappels de la veille de l'app Quotidien, sur
// téléphone (service de notifications d'Expo, sans clé).
//
// Chaque soir (planification : supabase/planification_rappels.sql) :
//   - au conducteur d'un trajet du lendemain : « Demain, c'est vous qui
//     conduisez » (tous les téléphones de son foyer) ;
//   - pour un trajet du lendemain sans conducteur : « qui peut le
//     prendre ? » (tous les téléphones des foyers du groupe).
// La liste vient de quotidien.rappels_a_envoyer ; chaque rappel parti est
// noté dans quotidien.rappels_envoyes, donc relancer la fonction ne renvoie
// rien en double. Les téléphones désinscrits (application supprimée…) sont
// retirés de quotidien.appareils.
//
// Déploiement (une fois) : supabase functions deploy rappels-veille
// SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont fournies par Supabase.

import { createClient } from 'npm:@supabase/supabase-js@2';

const EXPO_PUSH = 'https://exp.host/--/api/v2/push/send';

type Rappel = { trajet_id: string; genre: string; jetons: string[]; titre: string; corps: string };
type Message = { to: string; title: string; body: string; sound: 'default'; data: Record<string, string> };

// Demain, à Paris : "AAAA-MM-JJ".
function demainParis(): string {
  const d = new Date(Date.now() + 24 * 3600 * 1000);
  return d.toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' });
}

Deno.serve(async (_req: Request) => {
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
    db: { schema: 'quotidien' },
  });

  try {
    const jour = demainParis();
    const { data, error } = await admin.rpc('rappels_a_envoyer', { jour });
    if (error) throw error;
    const rappels = (data as Rappel[]) ?? [];

    // Un message par téléphone et par rappel, envoyés par paquets de 100.
    const messages: { rappel: Rappel; message: Message }[] = rappels.flatMap((r) =>
      r.jetons.map((jeton) => ({
        rappel: r,
        message: { to: jeton, title: r.titre, body: r.corps, sound: 'default', data: { trajet_id: r.trajet_id } },
      }))
    );

    const partis = new Set<string>(); // "trajet|genre" avec au moins un envoi réussi
    const aRetirer = new Set<string>(); // jetons désinscrits
    for (let i = 0; i < messages.length; i += 100) {
      const paquet = messages.slice(i, i + 100);
      const reponse = await fetch(EXPO_PUSH, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(paquet.map((p) => p.message)),
      });
      if (!reponse.ok) {
        console.error('[rappels-veille] Expo', reponse.status, await reponse.text());
        continue;
      }
      const tickets: any[] = (await reponse.json()).data ?? [];
      tickets.forEach((ticket, k) => {
        const { rappel, message } = paquet[k];
        if (ticket?.status === 'ok') partis.add(`${rappel.trajet_id}|${rappel.genre}`);
        else if (ticket?.details?.error === 'DeviceNotRegistered') aRetirer.add(message.to);
        else console.error('[rappels-veille] ticket', ticket);
      });
    }

    if (partis.size) {
      const lignes = [...partis].map((cle) => {
        const [trajet_id, genre] = cle.split('|');
        return { trajet_id, genre };
      });
      const { error: e2 } = await admin.from('rappels_envoyes').upsert(lignes, { onConflict: 'trajet_id,genre' });
      if (e2) throw e2;
    }
    if (aRetirer.size) {
      await admin.from('appareils').delete().in('jeton', [...aRetirer]);
    }

    return new Response(
      JSON.stringify({ jour, rappels: rappels.length, notifications: messages.length, partis: partis.size, retires: aRetirer.size }),
      { headers: { 'Content-Type': 'application/json' } }
    );
  } catch (e) {
    console.error('[rappels-veille]', e);
    return new Response(JSON.stringify({ erreur: e instanceof Error ? e.message : String(e) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
