// Fonction Edge « envoyer-notifications » : les nouveautés de l'app Famille
// (famille.notifications, écran Activité) arrivent aussi sur le téléphone,
// par le service de notifications d'Expo (sans clé). Spécification V1, § 2.5.
//
// Chaque minute (planification : supabase/planification_notifications.sql) :
// famille.notifications_a_envoyer donne les nouveautés de moins de 2 heures,
// pas encore lues ni envoyées, des personnes qui ont inscrit un téléphone
// (Moi › Notifications sur ce téléphone) et n'ont pas coupé ce module. Chaque
// nouveauté traitée est notée dans famille.notifications_envoyees : jamais
// deux fois, même si la fonction est relancée. Les téléphones désinscrits
// sont retirés de famille.appareils.
//
// Les nouveautés elles-mêmes sont créées par la base, qui applique la règle
// « surprise » : cette fonction n'envoie que ce que chacun voit déjà dans
// l'app.
//
// Déploiement (une fois) : supabase functions deploy envoyer-notifications
// SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont fournies par Supabase.

import { createClient } from 'npm:@supabase/supabase-js@2';

const EXPO_PUSH = 'https://exp.host/--/api/v2/push/send';

const NOMS_MODULES: Record<string, string> = {
  recettes: 'Recettes',
  courses: 'Courses',
  quotidien: 'Quotidien',
  cadeaux: 'Cadeaux',
  voyages: 'Voyages',
  souvenirs: 'Souvenirs',
};

type Nouveaute = { notification_id: string; jetons: string[]; module: string; message: string; cible: string };

Deno.serve(async (_req: Request) => {
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
    db: { schema: 'famille' },
  });

  try {
    const { data, error } = await admin.rpc('notifications_a_envoyer', { limite: 500 });
    if (error) throw error;
    const nouveautes = (data as Nouveaute[]) ?? [];

    const messages = nouveautes.flatMap((n) =>
      n.jetons.map((jeton) => ({
        nouveaute: n,
        message: {
          to: jeton,
          title: NOMS_MODULES[n.module] ?? 'Famille',
          body: n.message,
          sound: 'default' as const,
          channelId: 'nouveautes',
          data: { cible: n.cible, notification_id: n.notification_id },
        },
      }))
    );

    const traitees = new Set<string>();
    const aRetirer = new Set<string>();
    let parties = 0;
    for (let i = 0; i < messages.length; i += 100) {
      const paquet = messages.slice(i, i + 100);
      const reponse = await fetch(EXPO_PUSH, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(paquet.map((p) => p.message)),
      });
      if (!reponse.ok) {
        // Service indisponible : ce paquet repartira à la prochaine minute.
        console.error('[envoyer-notifications] Expo', reponse.status, await reponse.text());
        continue;
      }
      const tickets: any[] = (await reponse.json()).data ?? [];
      tickets.forEach((ticket, k) => {
        const { nouveaute, message } = paquet[k];
        traitees.add(nouveaute.notification_id);
        if (ticket?.status === 'ok') parties++;
        else if (ticket?.details?.error === 'DeviceNotRegistered') aRetirer.add(message.to);
        else console.error('[envoyer-notifications] ticket', ticket);
      });
    }

    if (traitees.size) {
      const { error: e2 } = await admin
        .from('notifications_envoyees')
        .upsert([...traitees].map((notification_id) => ({ notification_id })), { onConflict: 'notification_id', ignoreDuplicates: true });
      if (e2) throw e2;
    }
    if (aRetirer.size) await admin.from('appareils').delete().in('jeton', [...aRetirer]);

    return new Response(
      JSON.stringify({ nouveautes: nouveautes.length, notifications: messages.length, parties, retires: aRetirer.size }),
      { headers: { 'Content-Type': 'application/json' } }
    );
  } catch (e) {
    console.error('[envoyer-notifications]', e);
    return new Response(JSON.stringify({ erreur: e instanceof Error ? e.message : String(e) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
