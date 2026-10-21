import { z, ErreurIA, type Route } from '../../_partage/ia.ts';
import { CONSIGNE } from '../../_partage/consignes/doublons.ts';

// Fusion des doublons de Courses (spécification § 4.2.3). Le code de l'app
// (cleProduit) traite gratuitement les cas évidents ; seuls les groupes
// ambigus (« Lait » / « Lait demi-écrémé », « 1 L » + « 2 bouteilles »)
// arrivent ici. L'assistant propose ; la personne accepte ou refuse, et
// « ce n'est pas le même produit » est mémorisé par le foyer.
// Haiku 5.5, ~0,0005 $.
const Article = z.object({
  libelle: z.string(),
  quantite: z.number().nullable(),
  unite: z.string().nullable(),
});

const Schema = z.object({
  groupes: z.array(
    z.object({
      id: z.string(),
      meme_produit: z.boolean(),
      libelle: z.string().nullable(),
      quantite: z.number().nullable(),
      unite: z.string().nullable(),
      explication: z.string().nullable(),
    })
  ),
});

type Verdict = z.infer<typeof Schema>['groupes'][number];

function groupesRecus(corps: any) {
  const groupes = Array.isArray(corps?.groupes) ? corps.groupes : [];
  return groupes
    .slice(0, 6)
    .map((g: any) => ({
      id: String(g?.id ?? '').slice(0, 200),
      articles: (Array.isArray(g?.articles) ? g.articles : [])
        .slice(0, 6)
        .map((a: any) => Article.safeParse({
          libelle: String(a?.libelle ?? '').trim().slice(0, 120),
          quantite: typeof a?.quantite === 'number' && Number.isFinite(a.quantite) ? a.quantite : null,
          unite: typeof a?.unite === 'string' && a.unite.trim() ? a.unite.trim().slice(0, 20) : null,
        }))
        .filter((r: any) => r.success && r.data.libelle)
        .map((r: any) => r.data),
    }))
    .filter((g: any) => g.id && g.articles.length >= 2);
}

export const doublons: Route = async (corps, ctx) => {
  const groupes = groupesRecus(corps);
  if (!groupes.length) throw new ErreurIA('entree', 'Rien à comparer.');
  const texte = groupes
    .map(
      (g: any) =>
        `Groupe ${g.id} :\n` +
        g.articles
          .map((a: any) => `- ${a.libelle}${a.quantite != null ? ` · ${a.quantite}${a.unite ? ` ${a.unite}` : ''}` : ''}`)
          .join('\n')
    )
    .join('\n\n');
  const r = await ctx.extraire({
    modele: 'claude-haiku-5-5',
    consigne: CONSIGNE,
    contenu: texte,
    schema: Schema,
    maxTokens: 1500,
  });
  // Dans l'ordre des groupes reçus, un verdict par groupe.
  const parId = new Map(r.brouillon.groupes.map((g) => [g.id, g]));
  return {
    groupes: (groupes.map((recu: any) => parId.get(recu.id)).filter(Boolean) as Verdict[])
      .map((g) => ({
        id: g.id,
        meme_produit: g.meme_produit,
        libelle: g.meme_produit ? g.libelle?.trim() || null : null,
        quantite: g.meme_produit && g.quantite != null && g.quantite > 0 ? g.quantite : null,
        unite: g.meme_produit ? g.unite?.trim() || null : null,
        explication: g.explication?.trim() || null,
      })),
  };
};
