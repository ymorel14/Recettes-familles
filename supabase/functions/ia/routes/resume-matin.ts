import { ErreurIA, type Route } from '../../_partage/ia.ts';
import {
  CONSIGNE_RESUME_MATIN,
  MODELE_NUIT,
  SchemaResume,
  contenuResume,
  faitsValides,
  jourParis,
  phrasesAvecCibles,
} from '../../_partage/nuit.ts';

// Résumé du matin (spécification § 4.6.2), quand rien n'a été préparé cette
// nuit (première visite de l'accueil, nouvel utilisateur). D'habitude, le
// résumé est rédigé la nuit à moitié prix (fonction ia-nuit).
//
// Les faits sont lus AU JETON DE L'UTILISATEUR (famille.faits_du_jour,
// règles RLS) : le modèle ne reçoit que ce que la personne voit. Une seule
// rédaction par jour : un résumé déjà enregistré est renvoyé tel quel.
// Haiku 5.5, ~0,0005 $.
export const resumeMatin: Route = async (_corps, ctx) => {
  const jour = jourParis();
  const { data: deja } = await ctx.client
    .schema('famille')
    .from('resumes_matin')
    .select('phrases')
    .eq('utilisateur_id', ctx.utilisateurId)
    .eq('jour', jour)
    .maybeSingle();
  if (deja) return { phrases: (deja as any).phrases ?? [] };

  const { data, error } = await ctx.client.schema('famille').rpc('faits_du_jour', {});
  if (error) {
    console.error('faits_du_jour', error.message);
    throw new ErreurIA('configuration', 'Le résumé du matin n’est pas encore installé (migration famille_nuit).');
  }
  const faits = faitsValides(data);
  let phrases: ReturnType<typeof phrasesAvecCibles> = [];
  if (faits.length) {
    const r = await ctx.extraire({
      modele: MODELE_NUIT,
      consigne: CONSIGNE_RESUME_MATIN,
      contenu: contenuResume(faits, jour),
      schema: SchemaResume,
      maxTokens: 1200,
    });
    phrases = phrasesAvecCibles(r.brouillon, faits);
  }
  // Le résumé n'est pas une donnée de la famille : c'est un affichage,
  // gardé pour la journée (aucune écriture dans les tables des modules).
  const { error: erreurEcriture } = await ctx.admin
    .schema('famille')
    .from('resumes_matin')
    .upsert({ utilisateur_id: ctx.utilisateurId, jour, phrases, differe: false }, { onConflict: 'utilisateur_id,jour' });
  if (erreurEcriture) console.error('resumes_matin', erreurEcriture.message);
  return { phrases };
};
