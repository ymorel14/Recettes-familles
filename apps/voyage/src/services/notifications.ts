import { supabase } from './supabase';

// Notifications dans l'app (voyage.notifications), créées par la base quand
// quelque chose bouge dans un voyage (migration 20260929140000). Chacun ne
// lit que les siennes.

export type Notification = {
  id: string;
  voyage_id: string;
  type: string;
  message: string;
  ecran: string;
  lue_le: string | null;
  cree_le: string;
};

export async function listerNotifications(limite = 50): Promise<Notification[]> {
  const { data, error } = await supabase
    .from('notifications')
    .select('id, voyage_id, type, message, ecran, lue_le, cree_le')
    .order('cree_le', { ascending: false })
    .limit(limite);
  if (error) throw error;
  return (data ?? []) as Notification[];
}

export async function compterNonLues(): Promise<number> {
  const { count, error } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .is('lue_le', null);
  if (error) throw error;
  return count ?? 0;
}

export async function marquerLue(id: string): Promise<void> {
  const { error } = await supabase.from('notifications').update({ lue_le: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
}

export async function toutMarquerLu(): Promise<void> {
  const { error } = await supabase
    .from('notifications')
    .update({ lue_le: new Date().toISOString() })
    .is('lue_le', null);
  if (error) throw error;
}

export async function effacerLues(): Promise<void> {
  const { error } = await supabase.from('notifications').delete().not('lue_le', 'is', null);
  if (error) throw error;
}

// "il y a 5 min", "hier", "le 12/10"
export function ilYA(iso: string, maintenant = new Date()): string {
  const d = new Date(iso);
  const minutes = Math.round((maintenant.getTime() - d.getTime()) / 60000);
  if (minutes < 1) return 'à l’instant';
  if (minutes < 60) return `il y a ${minutes} min`;
  const heures = Math.round(minutes / 60);
  if (heures < 24) return `il y a ${heures} h`;
  const jours = Math.round(heures / 24);
  if (jours === 1) return 'hier';
  if (jours < 7) return `il y a ${jours} jours`;
  return `le ${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
}
