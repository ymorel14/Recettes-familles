import { supabase } from './supabase';

// Lecture automatique d'une annonce (fonction Edge lire-annonce) : titre,
// photo, description, adresse, prix… à relire et compléter dans le
// formulaire. Certains sites bloquent la lecture : on remplit alors à la main.

export type Annonce = {
  titre: string | null;
  image: string | null;
  description: string | null;
  site: string | null;
  adresse: string | null;
  ville: string | null;
  prix: number | null;
  devise: string | null;
  capacite: number | null;
  chambres: number | null;
  genre: 'hebergement' | 'restaurant' | 'parc' | 'musee' | 'chateau' | 'spectacle' | 'activite' | null;
};

export async function lireAnnonce(url: string): Promise<Annonce> {
  const { data, error } = await supabase.functions.invoke('lire-annonce', { body: { url } });
  if (error) {
    let message = 'Lecture impossible pour le moment : remplissez la fiche à la main.';
    try {
      const corps = await (error as any).context?.json?.();
      if (corps?.erreur) message = corps.erreur;
    } catch {
      /* message par défaut */
    }
    throw new Error(message);
  }
  return data as Annonce;
}
