import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { theme, creerStylesThemes } from '../theme/theme';
import { useAuth } from '../contexts/AuthContext';
import { listerPersonnesParIds, type Personne } from '../services/personnes';
import { formaterEuros } from '../services/hebergements';
import {
  choisirModeTransport,
  formaterDuree,
  infoEnergie,
  listerTrajets,
  MODES_TRAJET,
  type Trajet,
} from '../services/transport';
import { estOrganisateur, messageErreurVoyage, obtenirVoyage, type VoyageAvecParticipants } from '../services/voyage';
import { Aide, Erreur, Puces } from '../components/formulaire';
import { Bouton, Chargement, MessageVide } from '../components/ui';

const MODES_PRINCIPAUX = [
  { id: 'voiture', libelle: 'Voiture' },
  { id: 'train', libelle: 'Train' },
  { id: 'avion', libelle: 'Avion' },
  { id: 'bateau', libelle: 'Bateau' },
  { id: 'bus', libelle: 'Bus' },
  { id: 'mixte', libelle: 'Chacun le sien' },
];

// Transport : mode principal (organisateur) et trajet de chaque foyer, avec
// son coût (carburant + péages, ou billets).
export default function TransportScreen({ route, navigation }: any) {
  const voyageId: string = route.params?.voyageId;
  const { session } = useAuth();
  const moiId = session?.user.id ?? '';

  const [donnees, setDonnees] = useState<{
    voyage: VoyageAvecParticipants;
    trajets: Trajet[];
    personnes: Map<string, Personne>;
  } | null>(null);
  const [erreurChargement, setErreurChargement] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  const charger = useCallback(async () => {
    try {
      const [voyage, trajets] = await Promise.all([obtenirVoyage(voyageId), listerTrajets(voyageId)]);
      const liste = await listerPersonnesParIds(voyage.participants.map((p) => p.personne_id));
      setDonnees({ voyage, trajets, personnes: new Map(liste.map((p) => [p.id, p])) });
    } catch (e) {
      setErreurChargement(messageErreurVoyage(e));
    }
  }, [voyageId]);

  useFocusEffect(
    useCallback(() => {
      charger();
    }, [charger])
  );

  if (erreurChargement) return <MessageVide titre="Transport indisponible" texte={erreurChargement} />;
  if (!donnees) return <Chargement />;
  const { voyage, trajets, personnes } = donnees;

  const maPersonneId = [...personnes.values()].find((p) => p.utilisateur_id === moiId)?.id ?? null;
  const organisateur = estOrganisateur(voyage, moiId, maPersonneId);
  const attendus = voyage.participants.filter((p) => p.reponse !== 'decline').map((p) => p.personne_id);
  const transportes = new Set(trajets.flatMap((t) => t.passagers.map((x) => x.personne_id)));
  const sansTrajet = attendus.filter((id) => !transportes.has(id)).map((id) => personnes.get(id)?.prenom ?? '?');
  const total = trajets.reduce((a, t) => a + Number(t.cout_total), 0);
  const nomFoyer = (id: string | null) =>
    [...personnes.values()].find((p) => p.foyer_id === id)?.foyer_nom ?? null;

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.contenu}>
      {organisateur ? (
        <>
          <Text style={styles.libelle}>Mode de transport principal</Text>
          <Puces
            options={MODES_PRINCIPAUX}
            valeur={voyage.mode_transport}
            onChange={async (m) => {
              try {
                await choisirModeTransport(voyage.id, m);
                await charger();
              } catch (e) {
                setErreur(messageErreurVoyage(e));
              }
            }}
          />
        </>
      ) : voyage.mode_transport ? (
        <Text style={styles.intro}>
          Mode principal : {MODES_PRINCIPAUX.find((m) => m.id === voyage.mode_transport)?.libelle.toLowerCase()}
        </Text>
      ) : null}
      <Aide>Chaque foyer déclare son trajet : c'est lui qui connaît son point de départ et sa voiture.</Aide>

      <Bouton titre="+ Ajouter mon trajet" onPress={() => navigation.navigate('Trajet', { voyageId: voyage.id })} />
      <Erreur texte={erreur} />

      {trajets.length === 0 && (
        <MessageVide titre="Aucun trajet" texte="Ajoutez le vôtre : distance, carburant et péages sont calculés pour vous." />
      )}
      {trajets.map((t) => {
        const mode = MODES_TRAJET.find((m) => m.id === t.mode) ?? MODES_TRAJET[0];
        const modifiable = t.responsable === moiId || organisateur;
        const passagers = t.passagers.map((x) => personnes.get(x.personne_id)?.prenom ?? '?');
        const contenu = (
          <>
            <View style={styles.icone}>
              <Ionicons name={mode.icone as any} size={22} color={theme.colors.accent} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={styles.titre}>{t.libelle || (t.ville_depart ? `Depuis ${t.ville_depart}` : mode.libelle)}</Text>
              {nomFoyer(t.foyer_id) && <Text style={styles.detail}>Foyer {nomFoyer(t.foyer_id)}</Text>}
              {t.mode === 'voiture' ? (
                <Text style={styles.detail}>
                  {t.distance_km != null ? `${String(t.distance_km).replace('.', ',')} km` : 'Distance à préciser'}
                  {t.duree_minutes != null ? ` · ${formaterDuree(t.duree_minutes)}` : ''}
                  {t.energie ? ` · ${infoEnergie(t.energie).libelle}` : ''}
                  {t.peages ? ` · ${formaterEuros(Number(t.peages), true)} de péages` : ''}
                  {t.aller_retour ? ' · aller-retour' : ' · aller simple'}
                </Text>
              ) : (
                <Text style={styles.detail}>{mode.libelle}{t.aller_retour ? ' · aller-retour' : ''}</Text>
              )}
              {passagers.length > 0 && <Text style={styles.detail}>Avec {passagers.join(', ')}</Text>}
            </View>
            <Text style={styles.montant}>{formaterEuros(Number(t.cout_total))}</Text>
          </>
        );
        return modifiable ? (
          <Pressable
            key={t.id}
            style={styles.carte}
            onPress={() => navigation.navigate('Trajet', { voyageId: voyage.id, trajet: t })}
            accessibilityRole="button"
            accessibilityLabel={`Modifier le trajet ${t.libelle || t.ville_depart || mode.libelle}`}
          >
            {contenu}
          </Pressable>
        ) : (
          <View key={t.id} style={styles.carte}>
            {contenu}
          </View>
        );
      })}

      {trajets.length > 0 && (
        <View style={styles.totalLigne}>
          <Text style={styles.totalTexte}>Total transport</Text>
          <Text style={styles.montant}>{formaterEuros(total)}</Text>
        </View>
      )}
      {sansTrajet.length > 0 && trajets.length > 0 && (
        <Aide>Pas encore de trajet pour : {sansTrajet.join(', ')}.</Aide>
      )}
    </ScrollView>
  );
}

const styles = creerStylesThemes(() => ({
  flex: { flex: 1, backgroundColor: theme.colors.background },
  contenu: { padding: theme.spacing.md, gap: theme.spacing.sm, paddingBottom: theme.spacing.xl },
  libelle: { fontFamily: theme.fontBodyBold, fontSize: 15, color: theme.colors.text },
  intro: { fontFamily: theme.fontBody, fontSize: 15, color: theme.colors.textMuted },
  carte: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radii.lg,
    padding: theme.spacing.md,
  },
  icone: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.accentTransparent,
  },
  titre: { fontFamily: theme.fontBodyBold, fontSize: 16, color: theme.colors.text },
  detail: { fontFamily: theme.fontBody, fontSize: 14, color: theme.colors.textMuted },
  montant: { fontFamily: theme.fontBodyBold, fontSize: 16, color: theme.colors.text },
  totalLigne: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: theme.spacing.sm, marginTop: theme.spacing.xs },
  totalTexte: { fontFamily: theme.fontTitle, fontSize: 18, color: theme.colors.text },
}));
