import React, { useCallback, useRef, useState } from 'react';
import { alerte } from '../utils/alerte';
import { useAuth } from '../contexts/AuthContext';
import ChoixListeCoursesModal from '../components/ChoixListeCoursesModal';
import {
  ajouterRecettesALaListe,
  listerListesCourses,
  ouvrirDansCourses,
  type ListeCourses,
  type SelectionRecette,
} from '../services/listesCourses';

// « Ajouter à la liste de courses » : choisit la liste de l'app Courses
// (sans question s'il n'y en a qu'une), y envoie les ingrédients, puis
// propose d'ouvrir Courses. À monter dans l'écran : {fenetre}.
export function useEnvoiCourses() {
  const { foyer } = useAuth();
  const [listes, setListes] = useState<ListeCourses[] | null>(null);
  const [enCours, setEnCours] = useState(false);
  const enAttente = useRef<{ selections: SelectionRecette[]; apres?: () => void } | null>(null);

  const envoyerVers = useCallback(async (liste: ListeCourses) => {
    const demande = enAttente.current;
    setListes(null);
    if (!demande) return;
    setEnCours(true);
    try {
      const { nouveaux, completes } = await ajouterRecettesALaListe(liste.id, demande.selections);
      const detail = [
        nouveaux > 0 ? `${nouveaux} article${nouveaux > 1 ? 's' : ''} ajouté${nouveaux > 1 ? 's' : ''}` : null,
        completes > 0 ? `${completes} déjà sur la liste` : null,
      ]
        .filter(Boolean)
        .join(', ');
      demande.apres?.();
      alerte(`Ajouté à « ${liste.nom} »`, `${detail || 'Ingrédients envoyés'}. La liste est dans l’app Courses.`, [
        { text: 'OK', style: 'cancel' },
        {
          text: 'Ouvrir Courses',
          onPress: async () => {
            if (!(await ouvrirDansCourses(liste.id))) {
              alerte('App Courses introuvable', 'Installez l’app Courses de la famille sur ce téléphone, ou ouvrez le site des apps de la famille.');
            }
          },
        },
      ]);
    } catch (e) {
      alerte('Échec de l’ajout', e instanceof Error ? e.message : 'Veuillez réessayer.');
    } finally {
      enAttente.current = null;
      setEnCours(false);
    }
  }, []);

  const envoyer = useCallback(
    async (selections: SelectionRecette[], apres?: () => void) => {
      if (!foyer || selections.length === 0) return;
      enAttente.current = { selections, apres };
      setEnCours(true);
      try {
        const disponibles = await listerListesCourses(foyer.id);
        setEnCours(false);
        if (disponibles.length === 1) await envoyerVers(disponibles[0]);
        else setListes(disponibles);
      } catch (e) {
        setEnCours(false);
        enAttente.current = null;
        alerte('Listes de courses indisponibles', e instanceof Error ? e.message : 'Vérifiez votre connexion.');
      }
    },
    [foyer, envoyerVers]
  );

  const fenetre = (
    <ChoixListeCoursesModal
      listes={listes}
      onChoisir={envoyerVers}
      onFermer={() => {
        enAttente.current = null;
        setListes(null);
      }}
    />
  );

  return { envoyer, enCours, fenetre };
}
