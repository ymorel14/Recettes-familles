import { z, ErreurIA, type Route } from '../../_partage/ia.ts';
import { texteRecu } from '../../_partage/contexte.ts';
import { CONSIGNE } from '../../_partage/consignes/cuisine-question.ts';

// Assistant en cuisine (spécification § 4.1.4) : une question posée à la
// voix (phrase qui n'est pas une commande) ou au clavier pendant le mode
// assistant. Contexte stable, mis en cache : la recette telle que la
// personne la voit à l'écran (version, quantités adaptées, astuces de la
// famille), envoyée par l'app. Variable : l'étape en cours, les derniers
// échanges, la question.
// Sonnet 5.5, effort medium, ~0,009 $ une fois le cache actif.
const Schema = z.object({
  reponse: z.string(),
});

type Echange = { question: string; reponse: string };

function echangesRecus(corps: any): Echange[] {
  const liste = Array.isArray(corps?.echanges) ? corps.echanges : [];
  return liste
    .slice(-3)
    .map((e: any) => ({ question: String(e?.question ?? '').slice(0, 300), reponse: String(e?.reponse ?? '').slice(0, 800) }))
    .filter((e: Echange) => e.question && e.reponse);
}

export const cuisineQuestion: Route = async (corps, ctx) => {
  const question = texteRecu(corps, 'question', 400);
  if (!question) throw new ErreurIA('entree', 'Posez votre question.');
  const recette = texteRecu(corps, 'recette', 15000);
  if (!recette) throw new ErreurIA('entree', 'Recette introuvable.');
  const etape = texteRecu(corps, 'etape', 1500);

  const contenu = [
    ...echangesRecus(corps).flatMap((e) => [`Question précédente : ${e.question}`, `Ta réponse : ${e.reponse}`]),
    etape ? `Étape en cours : ${etape}` : 'Étape en cours : aucune (recette terminée ou pas commencée).',
    `Question : ${question}`,
  ].join('\n');

  const r = await ctx.extraire({
    modele: 'claude-sonnet-5-5',
    consigne: CONSIGNE,
    contexteStable: `Recette en cours :\n${recette}`,
    contenu,
    schema: Schema,
    effort: 'medium',
    maxTokens: 1500,
  });
  const reponse = r.brouillon.reponse.replace(/\s+/g, ' ').trim();
  if (!reponse) throw new ErreurIA('illisible', 'Je n’ai pas de réponse. Reformulez votre question.');
  return { reponse };
};
