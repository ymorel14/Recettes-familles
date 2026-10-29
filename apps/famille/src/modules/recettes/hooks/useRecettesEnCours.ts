import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { appliquerVariantes, choixValides, obtenirRecette } from '../services/recettes';
import { formaterAnciennete, listerProgressions } from '../services/progressionAssistant';

// Recettes commencées dans le mode assistant et pas terminées, sur cet
// appareil (retour de test R-14) : bandeau « Reprendre » de l'onglet
// Recettes et de l'accueil. La plus récente d'abord.
export type RecetteEnCours = {
  recetteId: string;
  titre: string;
  photoUrl: string | null;
  etapesFaites: number;
  etapesTotal: number;
  anciennete: string;
};

export function libelleRecetteEnCours(r: RecetteEnCours): string {
  const avancement =
    r.etapesTotal > 0
      ? `étape ${Math.min(r.etapesFaites + 1, r.etapesTotal)} sur ${r.etapesTotal}`
      : `${r.etapesFaites} étape${r.etapesFaites > 1 ? 's' : ''} faite${r.etapesFaites > 1 ? 's' : ''}`;
  return `${avancement} · ${r.anciennete}`;
}

export function useRecettesEnCours(): RecetteEnCours[] {
  const [enCours, setEnCours] = useState<RecetteEnCours[]>([]);

  useFocusEffect(
    useCallback(() => {
      let actif = true;
      listerProgressions()
        .then((progressions) =>
          Promise.all(
            progressions.map(async (p) => {
              try {
                const brute = await obtenirRecette(p.recetteId);
                const recette = appliquerVariantes(brute, choixValides(brute, p.variantes));
                const ids = new Set(recette.etapes.map((e) => e.id));
                return {
                  recetteId: p.recetteId,
                  titre: recette.titre,
                  photoUrl: recette.photo_url ?? null,
                  etapesFaites: p.etapesCochees.filter((id) => ids.has(id)).length,
                  etapesTotal: recette.etapes.length,
                  anciennete: formaterAnciennete(p.majLe),
                } as RecetteEnCours;
              } catch {
                // Recette supprimée ou plus visible : on l'ignore.
                return null;
              }
            })
          )
        )
        .then((liste) => {
          if (actif) setEnCours(liste.filter((r): r is RecetteEnCours => r !== null));
        })
        .catch(() => {});
      return () => {
        actif = false;
      };
    }, [])
  );

  return enCours;
}
