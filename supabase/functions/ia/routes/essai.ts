import { z, type Route } from '../../_partage/ia.ts';
import { CONSIGNE } from '../../_partage/consignes/essai.ts';

// Route « essai » : vérifie la chaîne complète (connexion, foyer, plafond,
// appel au modèle, sortie structurée, comptage). Coût : moins de 0,0002 $.
const Schema = z.object({
  message: z.string(),
  reformulation: z.string(),
});

export const essai: Route = async (corps, ctx) => {
  const texte = typeof corps?.texte === 'string' ? corps.texte.slice(0, 500) : '';
  const r = await ctx.extraire({
    modele: 'claude-haiku-5-5',
    consigne: CONSIGNE,
    contenu: texte ? `Texte : ${texte}` : 'Vérification.',
    schema: Schema,
    maxTokens: 300,
  });
  return { ...r.brouillon, modele: r.modele, coutUsd: Number(r.coutUsd.toFixed(6)) };
};
