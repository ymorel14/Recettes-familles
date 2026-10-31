import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { theme, creerStylesThemes } from '../theme/theme';
import { useAuth } from '../contexts/AuthContext';
import { formaterDate, listerPersonnes, listerPersonnesParIds, type Personne } from '../services/personnes';
import { estOrganisateur, mesPersonnes, messageErreurVoyage, obtenirVoyage, type VoyageAvecParticipants } from '../services/voyage';
import { enviesDeListe, lierEnvies, listesEnviesLiees, listesVisibles, type Envie, type ListeVisible } from '../services/evenement';
import { Aide, CaseACocher, Erreur } from '../components/formulaire';
import { Chargement, MessageVide } from '../components/ui';
import { ouvrirModule } from '../../../navigation/navigationRef';

// Listes d'envies reliées à un événement (anniversaire, Noël…) : les listes
// restent dans la liste de cadeaux ; ici, on indique lesquelles concernent
// l'événement. La personne fêtée ne voit jamais ces listes.
export default function ListesCadeauxScreen({ route }: any) {
  const voyageId: string = route.params?.voyageId;
  const { session, foyer, foyersFamille } = useAuth();
  const moiId = session?.user.id ?? '';
  const [donnees, setDonnees] = useState<{
    voyage: VoyageAvecParticipants;
    listes: ListeVisible[];
    liees: Set<string>;
    organisateur: boolean;
    noms: Map<string, string>;
    miennes: Set<string>;
    envies: Map<string, Envie[]>;
  } | null>(null);
  const [erreurChargement, setErreurChargement] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  const charger = useCallback(async () => {
    try {
      const [voyage, liees, listes, famille] = await Promise.all([
        obtenirVoyage(voyageId),
        listesEnviesLiees(voyageId),
        listesVisibles().catch(() => [] as ListeVisible[]),
        listerPersonnes(foyersFamille),
      ]);
      const invites: Personne[] = await listerPersonnesParIds(voyage.participants.map((p) => p.personne_id));
      const toutes = [...famille, ...invites];
      const moi = toutes.find((p) => p.utilisateur_id === moiId) ?? null;
      const miennes = new Set(mesPersonnes(toutes, moiId, foyer?.id ?? null).map((p) => p.id));
      const noms = new Map(toutes.map((p) => [p.id, p.prenom] as [string, string]));
      const envies = new Map<string, Envie[]>();
      for (const id of liees) envies.set(id, await enviesDeListe(id));
      setDonnees({
        voyage,
        listes,
        liees: new Set(liees),
        organisateur: estOrganisateur(voyage, moiId, moi?.id ?? null),
        noms,
        miennes,
        envies,
      });
    } catch (e) {
      setErreurChargement(messageErreurVoyage(e));
    }
  }, [voyageId, foyersFamille, foyer, moiId]);

  useFocusEffect(
    useCallback(() => {
      charger();
    }, [charger])
  );

  if (erreurChargement) return <MessageVide titre="Listes indisponibles" texte={erreurChargement} />;
  if (!donnees) return <Chargement />;
  const { listes, liees, organisateur, noms, miennes, envies } = donnees;
  // Jamais proposées : mes propres listes (je n'y ai pas accès pour la surprise).
  const reliables = listes.filter((l) => !miennes.has(l.destinataire_id));
  const lieesVisibles = reliables.filter((l) => liees.has(l.id));
  const libelleListe = (l: ListeVisible) => `${l.titre} · ${noms.get(l.destinataire_id) ?? 'liste'}`;

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.contenu}>
      <Text style={styles.intro}>
        Reliez la liste d’envies de la personne concernée : chacun voit alors, sur la page de l’événement, ce qu’il peut offrir.
      </Text>

      {organisateur ? (
        <>
          {reliables.length === 0 && (
            <MessageVide titre="Aucune liste" texte="Créez d’abord la liste d’envies dans la liste de cadeaux." />
          )}
          {reliables.map((l) => (
            <CaseACocher
              key={l.id}
              coche={liees.has(l.id)}
              onChange={async (c) => {
                setErreur(null);
                try {
                  await lierEnvies(donnees.voyage.id, l.id, c);
                  await charger();
                } catch (err) {
                  setErreur(messageErreurVoyage(err));
                }
              }}
              libelle={libelleListe(l)}
              aide={l.date ? formaterDate(l.date) : undefined}
            />
          ))}
        </>
      ) : lieesVisibles.length === 0 ? (
        <MessageVide titre="Aucune liste liée" texte="Les organisateurs n’ont relié aucune liste d’envies." />
      ) : (
        lieesVisibles.map((l) => (
          <Pressable
            key={l.id}
            style={styles.ligne}
            onPress={() => ouvrirModule('cadeaux', 'Liste', { listeId: l.id })}
            accessibilityRole="button"
            accessibilityLabel={`Ouvrir ${libelleListe(l)}`}
          >
            <Ionicons name="gift-outline" size={20} color={theme.colors.accent} />
            <View style={{ flex: 1 }}>
              <Text style={styles.titre}>{libelleListe(l)}</Text>
              <Text style={styles.detail}>
                {(envies.get(l.id) ?? []).filter((e) => e.reservations.length === 0).length} envie(s) encore libre(s)
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={theme.colors.textMuted} />
          </Pressable>
        ))
      )}
      <Erreur texte={erreur} />
      <Aide>Pour réserver un cadeau, ouvrez la liste ou utilisez « Je l’offre » sur la page de l’événement.</Aide>
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
