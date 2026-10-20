import { z, ErreurIA, type Route } from '../../_partage/ia.ts';
import { contenuAvecFichiers, fichiersRecus } from '../../_partage/images.ts';
import { aujourdHuiParis, texteRecu } from '../../_partage/contexte.ts';
import { CONSIGNE } from '../../_partage/consignes/planning-photo.ts';

// Planning en photo ou PDF → activités hebdomadaires et/ou séances datées
// (spécification § 4.3.1). Sonnet 5.5, ~0,03 $. L'app montre le brouillon ;
// rien n'est créé avant « Ajouter ».
const Activite = z.object({
  nom: z.string(),
  jour: z.number(),
  heure_debut: z.string(),
  heure_fin: z.string().nullable(),
  lieu: z.string().nullable(),
  date_debut: z.string().nullable(),
  date_fin: z.string().nullable(),
});

const Seance = z.object({
  date: z.string(),
  heure_debut: z.string().nullable(),
  heure_fin: z.string().nullable(),
  lieu: z.string().nullable(),
  adversaire: z.string().nullable(),
  domicile: z.boolean().nullable(),
  a_verifier: z.boolean(),
});

const Schema = z.object({
  est_un_planning: z.boolean(),
  titre: z.string().nullable(),
  activites: z.array(Activite),
  seances: z.array(Seance),
  a_verifier: z.array(z.string()),
  question: z.string().nullable(),
});

const DATE = /^\d{4}-\d{2}-\d{2}$/;

// « 14h », « 14:00 », « 9h30 » → « 14:00 », « 09:30 » ; null sinon.
export function heure(t: string | null | undefined): string | null {
  const m = String(t ?? '').trim().match(/^(\d{1,2})\s*[h:.]\s*(\d{2})?$/i);
  if (!m) return null;
  const h = Number(m[1]);
  const mn = Number(m[2] ?? 0);
  if (h > 23 || mn > 59) return null;
  return `${String(h).padStart(2, '0')}:${String(mn).padStart(2, '0')}`;
}

const date = (d: string | null | undefined) => (d && DATE.test(d) && !Number.isNaN(Date.parse(d)) ? d : null);

export const planningPhoto: Route = async (corps, ctx) => {
  const fichiers = fichiersRecus(corps, { max: 3, pdf: true });
  const precision = texteRecu(corps, 'precision', 200);
  const texte = [aujourdHuiParis(), precision ? `Précision de la personne : « ${precision} »` : ''].filter(Boolean).join('\n');
  const r = await ctx.extraire({
    modele: 'claude-sonnet-5-5',
    consigne: CONSIGNE,
    contenu: contenuAvecFichiers(fichiers, texte),
    schema: Schema,
    maxTokens: 6000,
  });
  const b = r.brouillon;
  const activites = b.activites
    .map((a) => ({
      ...a,
      nom: a.nom.trim(),
      jour: Math.round(a.jour),
      heure_debut: heure(a.heure_debut),
      heure_fin: heure(a.heure_fin),
      date_debut: date(a.date_debut),
      date_fin: date(a.date_fin),
      lieu: a.lieu?.trim() || null,
    }))
    .filter((a) => a.nom && a.jour >= 1 && a.jour <= 7 && a.heure_debut);
  const seances = b.seances
    .map((s) => {
      const debut = heure(s.heure_debut);
      return {
        ...s,
        date: date(s.date),
        heure_debut: debut,
        heure_fin: heure(s.heure_fin),
        lieu: s.lieu?.trim() || null,
        adversaire: s.adversaire?.trim() || null,
        a_verifier: s.a_verifier || !debut,
      };
    })
    .filter((s): s is typeof s & { date: string } => !!s.date)
    .sort((x, y) => (x.date + (x.heure_debut ?? '')).localeCompare(y.date + (y.heure_debut ?? '')));
  if (!b.est_un_planning || (!activites.length && !seances.length)) {
    throw new ErreurIA('illisible', 'Je n’ai pas trouvé de dates ni d’horaires dans ce document. Essayez une photo plus nette, ou ajoutez l’activité à la main.');
  }
  return { titre: b.titre?.trim() || null, activites, seances, a_verifier: b.a_verifier, question: b.question };
};
