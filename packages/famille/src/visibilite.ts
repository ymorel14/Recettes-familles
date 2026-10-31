import { schemaFamille, vueToutesFamilles } from './client';

// Visibilité d'un enfant famille par famille (migration
// 20261016100000_famille_visibilite_par_famille.sql). Quand un foyer
// appartient à plusieurs familles (famille recomposée), une personne sans
// compte peut être masquée dans l'une d'elles : ses membres ne la voient
// plus dans aucune app (règles RLS), sauf ceux de son foyer.

export type EnfantVisibilite = {
  personneId: string;
  prenom: string;
  // Familles où la personne est masquée.
  masqueeDans: Set<string>;
};

// Personnes sans compte de mon foyer et les familles où chacune est masquée.
export async function listerVisibiliteEnfants(foyerId: string): Promise<EnfantVisibilite[]> {
  const [personnes, masques] = await Promise.all([
    schemaFamille()
      .from('personnes')
      .select('id, prenom')
      .eq('foyer_id', foyerId)
      .is('utilisateur_id', null)
      .order('prenom'),
    schemaFamille().from('personnes_masquees').select('personne_id, famille_id'),
  ]);
  if (personnes.error) throw personnes.error;
  if (masques.error) throw masques.error;
  return ((personnes.data ?? []) as { id: string; prenom: string | null }[]).map((p) => ({
    personneId: p.id,
    prenom: (p.prenom ?? '').trim() || 'Sans prénom',
    masqueeDans: new Set(
      ((masques.data ?? []) as { personne_id: string; famille_id: string }[])
        .filter((m) => m.personne_id === p.id)
        .map((m) => m.famille_id)
    ),
  }));
}

export async function changerVisibiliteDansFamille(personneId: string, familleId: string, visible: boolean): Promise<void> {
  const requete = visible
    ? schemaFamille().from('personnes_masquees').delete().eq('personne_id', personneId).eq('famille_id', familleId)
    : schemaFamille().from('personnes_masquees').insert({ personne_id: personneId, famille_id: familleId });
  const { error } = await requete;
  if (error) throw error;
}

// Personnes masquées dans ma famille active que je vois quand même (mon
// foyer, ou via une autre famille) : à retirer des listes « toute la
// famille » quand on affiche la famille active.
export async function personnesMasqueesFamilleActive(): Promise<Set<string>> {
  // Vue de toutes les familles (app Famille) : pas de famille active, on
  // montre tous ceux que la base laisse voir.
  if (vueToutesFamilles()) return new Set();
  const { data, error } = await schemaFamille().rpc('personnes_masquees_famille_active');
  if (error) throw error;
  return new Set(((data ?? []) as any[]).map((x) => (typeof x === 'string' ? x : (Object.values(x)[0] as string))));
}
