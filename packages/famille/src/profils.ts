import { schemaFamille } from './client';

// Prénom (ou surnom) de l'utilisateur, affiché sur ses essais de recettes
// et visible par les membres de sa famille (table famille.profils, commune à toutes les apps).

export async function obtenirMonPrenom(utilisateurId: string): Promise<string | null> {
  const { data, error } = await schemaFamille()
    .from('profils')
    .select('prenom')
    .eq('utilisateur_id', utilisateurId)
    .maybeSingle();
  if (error) throw error;
  return data?.prenom ?? null;
}

export async function definirMonPrenom(utilisateurId: string, prenom: string): Promise<void> {
  const propre = prenom.trim();
  if (!propre) throw new Error('Le prénom ne peut pas être vide.');
  const { error } = await schemaFamille()
    .from('profils')
    .upsert({ utilisateur_id: utilisateurId, prenom: propre, maj_le: new Date().toISOString() });
  if (error) throw error;
}

// Prénoms de plusieurs utilisateurs (ceux de la famille), par identifiant.
export async function prenomsDe(utilisateurIds: string[]): Promise<Map<string, string>> {
  const resultat = new Map<string, string>();
  const ids = Array.from(new Set(utilisateurIds));
  if (ids.length === 0) return resultat;
  const { data, error } = await schemaFamille().from('profils').select('utilisateur_id, prenom').in('utilisateur_id', ids);
  if (error) throw error;
  (data ?? []).forEach((p: any) => resultat.set(p.utilisateur_id, p.prenom));
  return resultat;
}
