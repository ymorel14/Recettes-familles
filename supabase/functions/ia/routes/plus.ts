import { z, ErreurIA, type Route } from '../../_partage/ia.ts';
import { Article, Envie, Souvenir, Tache, normaliserTache } from '../../_partage/schemas.ts';
import { aujourdHuiParis, nomsDesListes, prenomsDuFoyer, texteRecu } from '../../_partage/contexte.ts';
import { CONSIGNE } from '../../_partage/consignes/plus.ts';

// ⊕ universel (spécification § 4.6.1) : une phrase → des actions PROPOSÉES.
// Rien n'est créé ici : l'app montre une carte par action et la personne
// valide (« Tout ajouter »). Retour de test P-3 : aussi des consignes qui
// OUVRENT un écran (cuisiner une recette, ouvrir une liste, rechercher),
// exécutées tout de suite par l'app. Haiku 5.5, ~0,0005 $.
const Action = z.object({
  type: z.string().describe('Une valeur parmi : courses, tache, envie, souvenir, recette, cuisiner, ouvrir, rechercher'),
  resume: z.string(),
  incertain: z.boolean(),
  articles: z.array(Article),
  liste: z.string().nullable(),
  tache: Tache.nullable(),
  envie: Envie.nullable(),
  souvenir: Souvenir.nullable(),
  lien: z.string().nullable(),
  // cuisiner : nom de la recette ; ouvrir : ce qu'il faut ouvrir (« liste
  // Carrefour », « voyage en Bretagne ») ; rechercher : le texte cherché.
  cible: z.string().nullable(),
  // ouvrir : recettes, courses, quotidien, cadeaux, voyages ou souvenirs.
  module: z.string().nullable(),
});

const Schema = z.object({
  actions: z.array(Action),
  question: z.string().nullable(),
});

export const plus: Route = async (corps, ctx) => {
  const texte = texteRecu(corps);
  if (!texte) throw new ErreurIA('entree', 'Dites ou écrivez ce que vous voulez ajouter.');
  const [listes, prenoms] = await Promise.all([nomsDesListes(ctx), prenomsDuFoyer(ctx)]);
  const contenu = [
    aujourdHuiParis(),
    `Listes de courses : ${listes.map((l) => (l.principale ? `${l.nom} (principale)` : l.nom)).join(', ') || 'aucune'}.`,
    `Personnes du foyer : ${prenoms.join(', ') || 'non renseignées'}.`,
    '',
    `Phrase : « ${texte} »`,
  ].join('\n');
  const r = await ctx.extraire({ modele: 'claude-haiku-5-5', consigne: CONSIGNE, contenu, schema: Schema, maxTokens: 2500 });
  // Une action n'est gardée que si son type est connu et son contenu rempli.
  const TYPES = ['courses', 'tache', 'envie', 'souvenir', 'recette', 'cuisiner', 'ouvrir', 'rechercher'];
  const MODULES = ['recettes', 'courses', 'quotidien', 'cadeaux', 'voyages', 'souvenirs'];
  const actions = r.brouillon.actions
    .map((a) => ({ ...a, type: String(a.type).toLowerCase().replace('tâche', 'tache') }))
    .filter((a) => TYPES.includes(a.type))
    .filter(
      (a) =>
        (a.type === 'courses' && a.articles.length > 0) ||
        (a.type === 'tache' && !!a.tache?.libelle?.trim()) ||
        (a.type === 'envie' && !!a.envie?.titre?.trim()) ||
        (a.type === 'souvenir' && !!a.souvenir?.titre?.trim()) ||
        (a.type === 'recette' && !!a.lien) ||
        (a.type === 'cuisiner' && !!a.cible?.trim()) ||
        (a.type === 'ouvrir' && (MODULES.includes(String(a.module)) || !!a.cible?.trim())) ||
        (a.type === 'rechercher' && !!a.cible?.trim())
    )
    .map((a) => ({ ...a, module: MODULES.includes(String(a.module)) ? a.module : null }))
    .map((a) => (a.type === 'tache' && a.tache ? { ...a, tache: normaliserTache(a.tache) } : a));
  return { actions, question: r.brouillon.question };
};
