import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { theme, creerStylesThemes } from '../theme/theme';
import { useAuth } from '../contexts/AuthContext';
import { extraireMessageErreur } from '@apps-famille/famille';
import { alerte } from '../utils/alerte';
import {
  creerListe,
  formaterDate,
  libelleCompteARebours,
  listerListesEvenement,
  listerPersonnes,
  obtenirEvenement,
  obtenirMaPersonne,
  supprimerEvenement,
  type Evenement,
  type Liste,
  type Personne,
} from '../services/wishlist';
import { Bouton, Chargement, Pastille } from '../components/ui';

// Un événement et les listes de souhaits qui s'y rattachent.
export default function EvenementScreen({ route, navigation }: any) {
  const { evenementId } = route.params;
  const { session, foyer, foyersFamille } = useAuth();
  const [evenement, setEvenement] = useState<Evenement | null>(null);
  const [listes, setListes] = useState<Liste[]>([]);
  const [personnes, setPersonnes] = useState<Personne[]>([]);
  const [moi, setMoi] = useState<Personne | null>(null);
  const [enCours, setEnCours] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  const charger = useCallback(async () => {
    if (!session) return;
    try {
      const [e, l, p, m] = await Promise.all([
        obtenirEvenement(evenementId),
        listerListesEvenement(evenementId),
        listerPersonnes(foyersFamille),
        obtenirMaPersonne(session.user.id),
      ]);
      setEvenement(e);
      setListes(l);
      setPersonnes(p);
      setMoi(m);
    } catch (err) {
      setErreur(extraireMessageErreur(err, 'Chargement impossible.'));
    }
  }, [evenementId, session, foyersFamille]);

  useFocusEffect(
    useCallback(() => {
      charger();
    }, [charger])
  );

  if (!evenement) return erreur ? <Text style={styles.erreur}>{erreur}</Text> : <Chargement />;

  const prenomDe = (personneId: string) => personnes.find((p) => p.id === personneId)?.prenom || 'Quelqu’un';
  const maListe = moi ? listes.find((l) => l.destinataire_id === moi.id) : undefined;
  // Personnes sans compte de mon foyer (enfants, bébé…) qui n'ont pas encore
  // de liste pour cet événement.
  const aGerer = personnes.filter(
    (p) => !p.utilisateur_id && p.foyer_id === foyer?.id && !listes.some((l) => l.destinataire_id === p.id)
  );

  const nouvelleListe = async (destinataire: Personne) => {
    if (!session) return;
    setErreur(null);
    setEnCours(destinataire.id);
    try {
      const id = await creerListe(evenement.id, destinataire.id, session.user.id, 'brouillon');
      navigation.navigate('Liste', { listeId: id });
    } catch (e) {
      setErreur(extraireMessageErreur(e, 'Impossible de créer la liste.'));
    } finally {
      setEnCours(null);
    }
  };

  const supprimer = () =>
    alerte('Supprimer l’événement ?', 'Toutes ses listes, souhaits et réservations seront supprimés.', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: async () => {
          try {
            await supprimerEvenement(evenement.id);
            navigation.goBack();
          } catch (e) {
            setErreur(extraireMessageErreur(e, 'Suppression impossible.'));
          }
        },
      },
    ]);

  const autresListes = listes.filter((l) => l.id !== maListe?.id);

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.contenu}>
      <View style={styles.entete}>
        <Pastille texte={libelleCompteARebours(evenement.date_evenement)} />
        <Text style={styles.titre}>{evenement.titre}</Text>
        <Text style={styles.date}>{formaterDate(evenement.date_evenement)}</Text>
      </View>

      <Text style={styles.section}>Ma liste</Text>
      {maListe ? (
        <Pressable
          style={styles.carte}
          onPress={() => navigation.navigate('Liste', { listeId: maListe.id })}
          accessibilityRole="button"
        >
          <Text style={styles.carteTitre}>Ma liste de souhaits</Text>
          <Text style={styles.carteDetail}>
            {maListe.statut === 'brouillon' ? 'Brouillon : pas encore visible par la famille' : 'Visible par la famille'}
          </Text>
        </Pressable>
      ) : moi ? (
        <Bouton titre="Créer ma liste" onPress={() => nouvelleListe(moi)} enCours={enCours === moi.id} />
      ) : (
        <Text style={styles.aide}>Rejoignez un foyer pour pouvoir créer votre liste.</Text>
      )}

      {aGerer.length > 0 && (
        <View style={styles.bloc}>
          <Text style={styles.aide}>Créer une liste pour quelqu'un de votre foyer sans compte :</Text>
          {aGerer.map((p) => (
            <Bouton
              key={p.id}
              variante="contour"
              titre={`Liste de ${p.prenom}`}
              onPress={() => nouvelleListe(p)}
              enCours={enCours === p.id}
            />
          ))}
        </View>
      )}

      <Text style={styles.section}>Les listes de la famille</Text>
      {autresListes.length === 0 ? (
        <Text style={styles.aide}>Personne d'autre n'a encore publié sa liste.</Text>
      ) : (
        autresListes.map((l) => (
          <Pressable
            key={l.id}
            style={styles.carte}
            onPress={() => navigation.navigate('Liste', { listeId: l.id })}
            accessibilityRole="button"
          >
            <Text style={styles.carteTitre}>La liste de {prenomDe(l.destinataire_id)}</Text>
            {l.statut === 'brouillon' && <Text style={styles.carteDetail}>Brouillon</Text>}
          </Pressable>
        ))
      )}

      {erreur && <Text style={styles.erreur}>{erreur}</Text>}
      {session && evenement.cree_par === session.user.id && (
        <Bouton variante="discret" titre="Supprimer l’événement" onPress={supprimer} />
      )}
    </ScrollView>
  );
}

const styles = creerStylesThemes(() => ({
  flex: { flex: 1, backgroundColor: theme.colors.background },
  contenu: { padding: theme.spacing.md, gap: theme.spacing.sm, paddingBottom: theme.spacing.xl },
  entete: {
    gap: 4,
    paddingBottom: theme.spacing.md,
    borderBottomWidth: 1,
    borderStyle: 'dashed',
    borderColor: theme.colors.border,
  },
  titre: { fontFamily: theme.fontTitle, fontSize: 30, color: theme.colors.text },
  date: { fontFamily: theme.fontBody, fontSize: 15, color: theme.colors.textMuted },
  section: { fontFamily: theme.fontTitle, fontSize: 19, color: theme.colors.text, marginTop: theme.spacing.md },
  bloc: { gap: theme.spacing.sm },
  carte: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radii.lg,
    padding: theme.spacing.md,
    gap: 2,
    minHeight: 44,
  },
  carteTitre: { fontFamily: theme.fontBodyBold, fontSize: 17, color: theme.colors.text },
  carteDetail: { fontFamily: theme.fontBody, fontSize: 14, color: theme.colors.textMuted },
  aide: { fontFamily: theme.fontBody, fontSize: 14, color: theme.colors.textMuted },
  erreur: { fontFamily: theme.fontBody, fontSize: 14, color: theme.colors.warning, padding: theme.spacing.md },
}));
