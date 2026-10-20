import { z, ErreurIA, type Route } from '../../_partage/ia.ts';
import { Article } from '../../_partage/schemas.ts';
import { texteRecu } from '../../_partage/contexte.ts';
import { CONSIGNE } from '../../_partage/consignes/courses-phrase.ts';

// Ajout de courses en phrase (spécification § 4.2.1) : seulement quand
// l'ajout rapide sans IA (« 2 lait ») ne suffit pas — plusieurs articles ou
// mots de liaison. Le rayon est choisi ensuite par le dictionnaire de l'app.
// Haiku 5.5, ~0,0004 $.
const Schema = z.object({
  articles: z.array(Article),
  question: z.string().nullable(),
});

export const coursesPhrase: Route = async (corps, ctx) => {
  const texte = texteRecu(corps, 'texte', 600);
  if (!texte) throw new ErreurIA('entree', 'Écrivez les articles à ajouter.');
  const r = await ctx.extraire({
    modele: 'claude-haiku-5-5',
    consigne: CONSIGNE,
    contenu: `Phrase : « ${texte} »`,
    schema: Schema,
    maxTokens: 1500,
  });
  return r.brouillon;
};
