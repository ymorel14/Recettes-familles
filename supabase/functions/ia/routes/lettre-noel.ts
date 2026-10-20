import { z, ErreurIA, type Route } from '../../_partage/ia.ts';
import { contenuAvecFichiers, fichiersRecus } from '../../_partage/images.ts';
import { texteRecu } from '../../_partage/contexte.ts';
import { CONSIGNE } from '../../_partage/consignes/lettre-noel.ts';

// Lettre au Père Noël (photo, ou texte dicté par l'enfant) → envies à
// valider une par une par le parent (spécification § 4.4.3). Sonnet 5.5,
// ~0,02 $. Seul le prénom de l'enfant est envoyé, jamais son nom.
const Souhait = z.object({
  nom: z.string(),
  details: z.string().nullable(),
  a_verifier: z.boolean(),
});

const Schema = z.object({
  souhaits: z.array(Souhait),
  question: z.string().nullable(),
});

export const lettreNoel: Route = async (corps, ctx) => {
  const texte = texteRecu(corps, 'texte', 2000);
  const prenom = texteRecu(corps, 'prenom', 40).split(/\s+/)[0] ?? '';
  const entete = prenom ? `Lettre de ${prenom}.` : 'Lettre d’un enfant.';
  let contenu: any;
  if (texte) {
    contenu = `${entete} Texte dicté :\n« ${texte} »`;
  } else {
    contenu = contenuAvecFichiers(fichiersRecus(corps, { max: 3 }), entete);
  }
  const r = await ctx.extraire({ modele: 'claude-sonnet-5-5', consigne: CONSIGNE, contenu, schema: Schema, maxTokens: 1500 });
  const souhaits = r.brouillon.souhaits
    .map((s) => ({ ...s, nom: s.nom.trim(), details: s.details?.trim() || null }))
    .filter((s) => s.nom)
    .slice(0, 30);
  if (!souhaits.length) {
    throw new ErreurIA('illisible', r.brouillon.question ?? 'Je n’ai pas trouvé de cadeau dans cette lettre. Ajoutez les envies à la main.');
  }
  return { souhaits, question: r.brouillon.question };
};
