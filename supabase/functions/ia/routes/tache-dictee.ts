import { z, ErreurIA, type Route } from '../../_partage/ia.ts';
import { Tache, normaliserTache } from '../../_partage/schemas.ts';
import { aujourdHuiParis, prenomsDuFoyer, texteRecu } from '../../_partage/contexte.ts';
import { CONSIGNE } from '../../_partage/consignes/tache-dictee.ts';

// Tâche dictée (spécification § 4.3.2) : la phrase → le formulaire de tâche
// pré-rempli, que la personne vérifie. Haiku 5.5, ~0,0005 $.
const Schema = z.object({
  tache: Tache,
  question: z.string().nullable(),
});

export const tacheDictee: Route = async (corps, ctx) => {
  const texte = texteRecu(corps, 'texte', 600);
  if (!texte) throw new ErreurIA('entree', 'Dites ou écrivez la tâche.');
  const prenoms = await prenomsDuFoyer(ctx);
  const contenu = [aujourdHuiParis(), `Personnes du foyer : ${prenoms.join(', ') || 'non renseignées'}.`, '', `Phrase : « ${texte} »`].join('\n');
  const r = await ctx.extraire({ modele: 'claude-haiku-5-5', consigne: CONSIGNE, contenu, schema: Schema, maxTokens: 1000 });
  return { tache: normaliserTache(r.brouillon.tache), question: r.brouillon.question };
};
