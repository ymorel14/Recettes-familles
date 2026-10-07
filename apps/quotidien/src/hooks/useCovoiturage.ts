import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../contexts/AuthContext';
import { extraireMessageErreur } from '@apps-famille/famille';
import {
  aujourdHuiIso,
  listerEnfants,
  listerGroupes,
  listerParticipants,
  listerTrajets,
  mesParticipants,
  type Enfant,
  type Groupe,
  type Participant,
  type Trajet,
} from '../services/quotidien';

// Groupes, participants, enfants et trajets à venir de tous mes groupes,
// rechargés à chaque retour sur l'écran.
export function useCovoiturage(jours = 21) {
  const { foyer } = useAuth();
  const [groupes, setGroupes] = useState<Groupe[]>([]);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [enfants, setEnfants] = useState<Enfant[]>([]);
  const [trajets, setTrajets] = useState<Trajet[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);

  const recharger = useCallback(async () => {
    setErreur(null);
    try {
      const g = await listerGroupes();
      const [p, t] = await Promise.all([
        listerParticipants(g.map((x) => x.id)),
        listerTrajets(aujourdHuiIso(), aujourdHuiIso(jours)),
      ]);
      const e = await listerEnfants(p.map((x) => x.id));
      setGroupes(g);
      setParticipants(p);
      setTrajets(t);
      setEnfants(e);
    } catch (e) {
      setErreur(extraireMessageErreur(e, 'Impossible de charger les trajets.'));
    } finally {
      setChargement(false);
    }
  }, [jours]);

  useFocusEffect(
    useCallback(() => {
      recharger();
    }, [recharger])
  );

  const miens = mesParticipants(participants, foyer?.id);
  const idsMiens = new Set(miens.map((p) => p.id));
  const nomParticipant = (id: string | null) => participants.find((p) => p.id === id)?.nom_affiche ?? null;
  const monParticipant = (groupeId: string) => miens.find((p) => p.groupe_id === groupeId) ?? null;
  const mesEnfants = (groupeId: string) => {
    const moi = monParticipant(groupeId);
    return moi ? enfants.filter((e) => e.participant_id === moi.id) : [];
  };

  return {
    groupes,
    participants,
    enfants,
    trajets,
    chargement,
    erreur,
    recharger,
    idsMiens,
    nomParticipant,
    monParticipant,
    mesEnfants,
  };
}
