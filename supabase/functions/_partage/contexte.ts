// Petites lectures de contexte pour les consignes de l'assistant. Toujours
// avec le client AU JETON DE L'UTILISATEUR (ctx.client) : la RLS décide de ce
// qui est visible. On n'envoie que des prénoms, jamais de noms de famille
// (spécification § 3.6).
import type { Contexte } from './ia.ts';

const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];

// « Aujourd'hui : mardi 20 octobre 2026 (2026-10-20), 9h30, heure de Paris. »
// À mettre dans le CONTENU du message, jamais dans la consigne (cache).
export function aujourdHuiParis(maintenant = new Date()): string {
  const p = new Date(maintenant.toLocaleString('en-US', { timeZone: 'Europe/Paris' }));
  const iso = `${p.getFullYear()}-${String(p.getMonth() + 1).padStart(2, '0')}-${String(p.getDate()).padStart(2, '0')}`;
  const texte = p.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  return `Aujourd'hui : ${JOURS[p.getDay()]} ${texte} (${iso}), ${p.getHours()}h${String(p.getMinutes()).padStart(2, '0')}, heure de Paris.`;
}

// Listes de courses visibles par l'utilisateur.
export async function nomsDesListes(ctx: Contexte): Promise<{ nom: string; principale: boolean }[]> {
  const { data } = await ctx.client.schema('courses').from('listes').select('nom, principale').order('principale', { ascending: false });
  return ((data as any[]) ?? []).map((l) => ({ nom: String(l.nom), principale: !!l.principale }));
}

// Prénoms des personnes du foyer (adultes et enfants sans compte).
export async function prenomsDuFoyer(ctx: Contexte): Promise<string[]> {
  const { data } = await ctx.client.schema('famille').from('personnes').select('prenom').eq('foyer_id', ctx.foyerId);
  return ((data as any[]) ?? []).map((p) => String(p.prenom ?? '').trim()).filter(Boolean);
}

// Texte libre reçu de l'app, borné.
export function texteRecu(corps: any, cle = 'texte', max = 1000): string {
  const t = typeof corps?.[cle] === 'string' ? corps[cle].trim() : '';
  return t.slice(0, max);
}
