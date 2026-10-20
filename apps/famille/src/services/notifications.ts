import { schemaFamille, supabase } from './supabase';
import type { IdModule } from '../theme/jetons';

// Notifications communes à tous les modules (table famille.notifications,
// migration 20261020100000_famille_notifications.sql). Chacun ne lit que les
// siennes (règles RLS).
//
// Tant que la migration n'est pas passée, on lit les notifications de
// VoyageCommun (voyage.notifications), qui existent déjà : l'app marche
// avec la base actuelle, sans rien changer.

export type NotificationFamille = {
  id: string;
  module: IdModule;
  type: string;
  message: string;
  cible: string; // chemin interne : 'voyages/voyage/<id>/dates', 'courses/liste/<id>'…
  action: string | null; // 'valider', 'voter', 'conduire'… (null = information)
  action_faite_le: string | null;
  lue_le: string | null;
  cree_le: string;
};

let source: 'famille' | 'voyage' | null = null;

function tableAbsente(e: any): boolean {
  const texte = `${e?.code ?? ''} ${e?.message ?? ''}`;
  return /42P01|PGRST205|PGRST106|does not exist|Could not find the table|schema cache/i.test(texte);
}

// Écran de l'ancienne app VoyageCommun → chemin interne.
const ECRANS_VOYAGE: Record<string, string> = {
  Voyage: '',
  Dates: '/dates',
  Hebergements: '/hebergement',
  Transport: '/transport',
  Activites: '/activites',
  Programme: '/programme',
  Budget: '/budget',
  Menu: '/menu',
  ListesCadeaux: '/cadeaux',
  Surprise: '/surprise',
};

async function listerVoyage(limite: number): Promise<NotificationFamille[]> {
  const { data, error } = await supabase
    .schema('voyage')
    .from('notifications')
    .select('id, voyage_id, type, message, ecran, lue_le, cree_le')
    .order('cree_le', { ascending: false })
    .limit(limite);
  if (error) throw error;
  return ((data as any[]) ?? []).map((n) => ({
    id: n.id,
    module: 'voyages' as const,
    type: n.type,
    message: n.message,
    cible: `voyages/voyage/${n.voyage_id}${ECRANS_VOYAGE[n.ecran] ?? ''}`,
    action: null,
    action_faite_le: null,
    lue_le: n.lue_le,
    cree_le: n.cree_le,
  }));
}

export async function listerNotifications(limite = 100): Promise<NotificationFamille[]> {
  if (source !== 'voyage') {
    const { data, error } = await schemaFamille()
      .from('notifications')
      .select('id, module, type, message, cible, action, action_faite_le, lue_le, cree_le')
      .order('cree_le', { ascending: false })
      .limit(limite);
    if (!error) {
      source = 'famille';
      return (data ?? []) as NotificationFamille[];
    }
    if (!tableAbsente(error)) throw error;
    source = 'voyage';
  }
  return listerVoyage(limite);
}

function table() {
  return source === 'voyage' ? supabase.schema('voyage').from('notifications') : schemaFamille().from('notifications');
}

export async function marquerLue(id: string): Promise<void> {
  const { error } = await table().update({ lue_le: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
}

export async function toutMarquerLu(module?: IdModule): Promise<void> {
  let requete = table().update({ lue_le: new Date().toISOString() }).is('lue_le', null);
  if (module && source === 'famille') requete = requete.eq('module', module);
  if (module && source === 'voyage' && module !== 'voyages') return;
  const { error } = await requete;
  if (error) throw error;
}

export async function marquerActionFaite(id: string): Promise<void> {
  if (source !== 'famille') return;
  const maintenant = new Date().toISOString();
  const { error } = await schemaFamille()
    .from('notifications')
    .update({ action_faite_le: maintenant, lue_le: maintenant })
    .eq('id', id);
  if (error) throw error;
}

// « à l'instant », « il y a 5 min », « il y a 3 h », « hier », « lundi 12 octobre »
export function ilYA(iso: string, maintenant = new Date()): string {
  const d = new Date(iso);
  const minutes = Math.round((maintenant.getTime() - d.getTime()) / 60000);
  if (minutes < 1) return 'à l’instant';
  if (minutes < 60) return `il y a ${minutes} min`;
  const heures = Math.round(minutes / 60);
  if (heures < 24 && d.getDate() === maintenant.getDate()) return `il y a ${heures} h`;
  const hier = new Date(maintenant);
  hier.setDate(hier.getDate() - 1);
  if (d.toDateString() === hier.toDateString()) return 'hier';
  return d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
}
