// Dates courtes en français pour l'affichage (« aujourd'hui », « hier »,
// « mar. 14 oct. »).

function memeJour(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function formaterDateCourte(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const maintenant = new Date();
  const hier = new Date(maintenant);
  hier.setDate(maintenant.getDate() - 1);
  if (memeJour(d, maintenant)) return 'aujourd’hui';
  if (memeJour(d, hier)) return 'hier';
  return d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
}

export function formaterDateHeure(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const heure = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  const jour = formaterDateCourte(iso);
  return `${jour} à ${heure}`;
}
