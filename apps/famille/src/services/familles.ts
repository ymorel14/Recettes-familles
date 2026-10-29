import { useMemo } from 'react';
import { useAuth } from '@apps-famille/famille';

// Vue unique de toutes les familles du foyer (retour de test G-2, chantier 0
// de V1-partage-et-droits) : les écrans lisent les données de TOUTES les
// familles de l'utilisateur, la base ne renvoyant que ce qu'il a le droit de
// voir. La « famille active » ne sert plus qu'à ranger ce qu'on crée
// (famille par défaut, réglable dans Moi) en attendant le partage choisi à
// la création.

// Une famille ou plusieurs : les services acceptent les deux.
export type Familles = string | string[];

export function listeFamilles(f: Familles | null | undefined): string[] {
  if (!f) return [];
  return Array.isArray(f) ? f.filter(Boolean) : [f];
}

// Identifiants de toutes mes familles, même tableau tant qu'ils ne changent
// pas (évite de recharger les écrans à chaque retour au premier plan).
export function useFamillesVues(): string[] {
  const { familles } = useAuth();
  const cle = familles.map((f) => f.id).join(',');
  return useMemo(() => (cle ? cle.split(',') : []), [cle]);
}

// Appelle une fonction de la base qui ne sait lire qu'une famille à la fois,
// pour chacune de mes familles, puis fusionne sans doublon.
export async function pourChaqueFamille<T>(
  familles: Familles,
  appel: (familleId: string) => Promise<T[]>,
  cle: (t: T) => string
): Promise<T[]> {
  const ids = listeFamilles(familles);
  const reponses = await Promise.allSettled(ids.map((id) => appel(id)));
  // Une famille en échec n'empêche pas d'afficher les autres ; si toutes
  // échouent, l'erreur remonte comme avant.
  const echec = reponses.find((r): r is PromiseRejectedResult => r.status === 'rejected');
  if (echec && reponses.every((r) => r.status === 'rejected')) throw echec.reason;
  const resultats = reponses.map((r) => (r.status === 'fulfilled' ? r.value : []));
  const vus = new Set<string>();
  const fusion: T[] = [];
  resultats.flat().forEach((t) => {
    const k = cle(t);
    if (vus.has(k)) return;
    vus.add(k);
    fusion.push(t);
  });
  return fusion;
}
