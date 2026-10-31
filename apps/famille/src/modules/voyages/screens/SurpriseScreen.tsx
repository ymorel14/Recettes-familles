import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { theme, creerStylesThemes } from '../theme/theme';
import { useAuth } from '../contexts/AuthContext';
import { alerte } from '../utils/alerte';
import { listerPersonnes, type Personne } from '../services/personnes';
import {
  definirSecret,
  estOrganisateur,
  messageErreurVoyage,
  modifierVoyage,
  NIVEAUX_SECRET,
  obtenirVoyage,
  revelerSurprise,
  type NiveauSecret,
  type VoyageAvecParticipants,
} from '../services/voyage';
import { Aide, Champ, Erreur, Libelle, Puces } from '../components/formulaire';
import { Bouton, Chargement, MessageVide } from '../components/ui';
import { Avatar } from '@apps-famille/famille';

// Surprise : pour chaque membre de la famille (avec un compte), ce qu'il
// voit de l'événement — tout, seulement son existence (personne fêtée), ou
// rien. Réservé aux organisateurs. La base le garantit : une personne tenue
// au secret ne reçoit ni le voyage, ni ses détails, ni ses notifications.
export default function SurpriseScreen({ route, navigation }: any) {
  const voyageId: string = route.params?.voyageId;
  const { session, foyersFamille } = useAuth();
  const moiId = session?.user.id ?? '';
  const [donnees, setDonnees] = useState<{ voyage: VoyageAvecParticipants; personnes: Personne[] } | null>(null);
  const [message, setMessage] = useState('');
  const [messageModifie, setMessageModifie] = useState(false);
  const [erreurChargement, setErreurChargement] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  const charger = useCallback(async () => {
    try {
      const [voyage, personnes] = await Promise.all([obtenirVoyage(voyageId), listerPersonnes(foyersFamille)]);
      setDonnees({ voyage, personnes });
      setMessage((m) => (messageModifie ? m : voyage.message_surprise ?? ''));
    } catch (e) {
      setErreurChargement(messageErreurVoyage(e));
    }
  }, [voyageId, foyersFamille, messageModifie]);

  useFocusEffect(
    useCallback(() => {
      charger();
    }, [charger])
  );

  if (erreurChargement) return <MessageVide titre="Surprise indisponible" texte={erreurChargement} />;
  if (!donnees) return <Chargement />;
  const { voyage, personnes } = donnees;
  const maPersonne = personnes.find((p) => p.utilisateur_id === moiId) ?? null;
  if (!estOrganisateur(voyage, moiId, maPersonne?.id ?? null)) {
    return <MessageVide titre="Réservé aux organisateurs" texte="Seuls les organisateurs choisissent à qui garder la surprise." />;
  }

  const organisateurs = new Set(voyage.participants.filter((p) => p.role === 'organisateur').map((p) => p.personne_id));
  const estOrga = (p: Personne) => p.utilisateur_id === voyage.cree_par || organisateurs.has(p.id);
  const avecCompte = personnes.filter((p) => p.utilisateur_id && p.utilisateur_id !== moiId);
  const niveauDe = (p: Personne): NiveauSecret | 'aucun' =>
    voyage.secrets.find((s) => s.personne_id === p.id)?.niveau ?? 'aucun';
  const nbSecrets = voyage.secrets.length;
  const repas = voyage.nature === 'repas';

  const changer = async (p: Personne, niveau: NiveauSecret | 'aucun') => {
    setErreur(null);
    try {
      await definirSecret(voyage.id, p.id, niveau === 'aucun' ? null : niveau);
      await charger();
    } catch (e) {
      setErreur(messageErreurVoyage(e));
    }
  };

  const enregistrerMessage = async () => {
    setErreur(null);
    setEnCours(true);
    try {
      await modifierVoyage(voyage.id, { message_surprise: message.trim() || null });
      setMessageModifie(false);
      await charger();
    } catch (e) {
      setErreur(messageErreurVoyage(e));
    } finally {
      setEnCours(false);
    }
  };

  const reveler = () =>
    alerte('Révéler la surprise ?', 'Tout le monde verra de nouveau l’événement en entier.', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Révéler',
        onPress: async () => {
          try {
            await revelerSurprise(voyage.id);
            navigation.goBack();
          } catch (e) {
            setErreur(messageErreurVoyage(e));
          }
        },
      },
    ]);

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.contenu} keyboardShouldPersistTaps="handled">
      <Text style={styles.intro}>
        Choisissez ce que chacun voit de « {voyage.titre} ». Le secret tombe tout seul le lendemain de la fin
        {repas ? ' du repas' : ' du voyage'}.
      </Text>

      {NIVEAUX_SECRET.map((n) => (
        <View key={n.id} style={styles.legende}>
          <Text style={styles.legendeTitre}>{n.libelle}</Text>
          <Text style={styles.legendeTexte}>{n.aide}</Text>
        </View>
      ))}

      <Libelle>Qui est dans la confidence ?</Libelle>
      {avecCompte.length === 0 && <Aide>Personne d’autre n’a encore de compte dans la famille.</Aide>}
      {avecCompte.map((p) => (
        <View key={p.id} style={styles.personne} accessibilityLabel={`Surprise pour ${p.prenom}`}>
          <View style={styles.personneHaut}>
            <Avatar personneId={p.id} prenom={p.prenom} taille={28} />
            <Text style={styles.prenom}>{p.prenom}</Text>
            {p.foyer_nom ? <Text style={styles.foyer}>{p.foyer_nom}</Text> : null}
          </View>
          {estOrga(p) ? (
            <Text style={styles.foyer}>Organise : voit tout.</Text>
          ) : (
            <Puces options={NIVEAUX_SECRET} valeur={niveauDe(p)} onChange={(n) => changer(p, n)} />
          )}
        </View>
      ))}
      <Aide>
        Les enfants sans compte ne se connectent pas : leurs parents voient pour eux. Une personne à qui l’on cache
        {repas ? ' le repas' : ' le voyage'} peut rester parmi les invités (on la compte dans le budget), elle
        n’en saura rien.
      </Aide>

      <Libelle nativeID="libelle-mot">Un mot pour la personne fêtée (facultatif)</Libelle>
      <Champ
        value={message}
        onChangeText={(t) => {
          setMessage(t);
          setMessageModifie(true);
        }}
        multiline
        placeholder={repas ? 'Ex. Rendez-vous à midi, tenue chic !' : 'Ex. Prépare un sac pour 3 jours et ton passeport'}
        accessibilityLabelledBy="libelle-mot"
      />
      <Aide>Elle verra aussi le titre, la date{repas ? ' et le lieu' : ''}. Choisissez un titre qui ne dévoile rien.</Aide>
      {messageModifie && <Bouton titre="Enregistrer le mot" onPress={enregistrerMessage} enCours={enCours} />}

      <Erreur texte={erreur} />
      {nbSecrets > 0 && <Bouton titre="Révéler la surprise" variante="discret" onPress={reveler} style={styles.reveler} />}
    </ScrollView>
  );
}

const styles = creerStylesThemes(() => ({
  flex: { flex: 1, backgroundColor: theme.colors.background },
  contenu: { padding: theme.spacing.md, gap: theme.spacing.sm, paddingBottom: theme.spacing.xl },
  intro: { fontFamily: theme.fontBody, fontSize: 15, color: theme.colors.textMuted },
  legende: { flexDirection: 'row', gap: theme.spacing.sm },
  legendeTitre: { width: 86, fontFamily: theme.fontBodyBold, fontSize: 14, color: theme.colors.text },
  legendeTexte: { flex: 1, fontFamily: theme.fontBody, fontSize: 14, color: theme.colors.textMuted },
  personne: {
    gap: theme.spacing.xs,
    padding: theme.spacing.md,
    borderRadius: theme.radii.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  personneHaut: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
  prenom: { fontFamily: theme.fontBodyBold, fontSize: 16, color: theme.colors.text },
  foyer: { fontFamily: theme.fontBody, fontSize: 13, color: theme.colors.textMuted },
  reveler: { marginTop: theme.spacing.md },
}));
