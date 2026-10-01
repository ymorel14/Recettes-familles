import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { theme, creerStylesThemes } from '../theme/theme';
import { useAuth } from '../contexts/AuthContext';
import { formaterDate, listerPersonnesParIds } from '../services/personnes';
import { evenementsCadeaux, lierListe, listesLiees, type EvenementCadeaux } from '../services/repas';
import { estOrganisateur, messageErreurVoyage, obtenirVoyage, type VoyageAvecParticipants } from '../services/voyage';
import { Aide, CaseACocher, Erreur } from '../components/formulaire';
import { Chargement, MessageVide } from '../components/ui';

// Listes de cadeaux liées à un repas : les événements de CadeauCommun
// (Noël, anniversaire…) dont les cadeaux seront offerts ce jour-là.
export default function ListesCadeauxScreen({ route }: any) {
  const voyageId: string = route.params?.voyageId;
  const { session, famille } = useAuth();
  const moiId = session?.user.id ?? '';
  const [donnees, setDonnees] = useState<{
    voyage: VoyageAvecParticipants;
    evenements: EvenementCadeaux[];
    liees: Set<string>;
    organisateur: boolean;
  } | null>(null);
  const [erreurChargement, setErreurChargement] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  const charger = useCallback(async () => {
    if (!famille) return;
    try {
      const [voyage, liees] = await Promise.all([obtenirVoyage(voyageId), listesLiees(voyageId)]);
      const [evenements, invites] = await Promise.all([
        evenementsCadeaux(voyage.famille_id).catch(() => [] as EvenementCadeaux[]),
        listerPersonnesParIds(voyage.participants.map((p) => p.personne_id)),
      ]);
      const maPersonneId = invites.find((p) => p.utilisateur_id === moiId)?.id ?? null;
      setDonnees({ voyage, evenements, liees: new Set(liees), organisateur: estOrganisateur(voyage, moiId, maPersonneId) });
    } catch (e) {
      setErreurChargement(messageErreurVoyage(e));
    }
  }, [voyageId, famille, moiId]);

  useFocusEffect(
    useCallback(() => {
      charger();
    }, [charger])
  );

  if (erreurChargement) return <MessageVide titre="Listes indisponibles" texte={erreurChargement} />;
  if (!donnees) return <Chargement />;
  const { evenements, liees, organisateur } = donnees;
  const lieesVisibles = evenements.filter((e) => liees.has(e.id));

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.contenu}>
      <Text style={styles.intro}>
        Les listes de souhaits restent dans CadeauCommun : ici, on indique simplement lesquelles concernent ce repas, pour
        que chacun sache quels cadeaux apporter.
      </Text>

      {organisateur ? (
        <>
          {evenements.length === 0 && (
            <MessageVide titre="Aucun événement" texte="Créez d’abord l’événement (Noël, anniversaire…) dans CadeauCommun." />
          )}
          {evenements.map((e) => (
            <CaseACocher
              key={e.id}
              coche={liees.has(e.id)}
              onChange={async (c) => {
                setErreur(null);
                try {
                  await lierListe(donnees.voyage.id, e.id, c);
                  await charger();
                } catch (err) {
                  setErreur(messageErreurVoyage(err));
                }
              }}
              libelle={e.titre}
              aide={formaterDate(e.date_evenement)}
            />
          ))}
        </>
      ) : lieesVisibles.length === 0 ? (
        <MessageVide titre="Aucune liste liée" texte="Les organisateurs n’ont relié aucune liste de cadeaux." />
      ) : (
        lieesVisibles.map((e) => (
          <View key={e.id} style={styles.ligne}>
            <Ionicons name="gift-outline" size={20} color={theme.colors.accent} />
            <View style={{ flex: 1 }}>
              <Text style={styles.titre}>{e.titre}</Text>
              <Text style={styles.detail}>{formaterDate(e.date_evenement)}</Text>
            </View>
          </View>
        ))
      )}
      <Erreur texte={erreur} />
      <Aide>Pour voir ou réserver les cadeaux, ouvrez CadeauCommun.</Aide>
    </ScrollView>
  );
}

const styles = creerStylesThemes(() => ({
  flex: { flex: 1, backgroundColor: theme.colors.background },
  contenu: { padding: theme.spacing.md, gap: theme.spacing.sm, paddingBottom: theme.spacing.xl },
  intro: { fontFamily: theme.fontBody, fontSize: 15, color: theme.colors.textMuted },
  ligne: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    padding: theme.spacing.md,
    borderRadius: theme.radii.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  titre: { fontFamily: theme.fontBodyBold, fontSize: 16, color: theme.colors.text },
  detail: { fontFamily: theme.fontBody, fontSize: 14, color: theme.colors.textMuted },
}));
