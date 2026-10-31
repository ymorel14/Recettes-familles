import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, Pressable, RefreshControl } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { theme, creerStylesThemes } from '../theme/theme';
import { useAuth } from '../contexts/AuthContext';
import { Avatar, extraireMessageErreur, personnesMasqueesFamilleActive } from '@apps-famille/famille';
import {
  joindrePrenoms,
  listeDe,
  listerPersonnes,
  listesCommunes,
  obtenirMaPersonne,
  type Liste,
  type Personne,
} from '../services/wishlist';
import { Bouton, Chargement, MessageVide } from '../components/ui';
import { useFamillesVues } from '../../../services/familles';

// Un foyer de la famille et ses membres.
type Groupe = { cle: string; titre: string; membres: Personne[] };

// Onglet "Famille" : les listes de souhaits de toute la famille, une par
// personne, regroupées par foyer. Toucher un nom ouvre sa liste (créée au
// besoin). Ma propre liste est dans "Mes envies".
// En tête, les listes communes : pour plusieurs personnes au choix, cachées
// à ces personnes (la base ne les envoie jamais à leurs destinataires).
export default function FamilleScreen({ navigation }: any) {
  const { session, famille, foyersFamille } = useAuth();
  // Toutes les familles du foyer (vue unique, retour de test G-2).
  const famillesVues = useFamillesVues();
  const [personnes, setPersonnes] = useState<Personne[] | null>(null);
  const [communes, setCommunes] = useState<Liste[]>([]);
  const [moi, setMoi] = useState<Personne | null>(null);
  const [enCours, setEnCours] = useState<string | null>(null);
  const [rechargement, setRechargement] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const charger = useCallback(async () => {
    if (!session) return;
    try {
      const [p, m, c, masquees] = await Promise.all([
        listerPersonnes(foyersFamille),
        obtenirMaPersonne(session.user.id),
        listesCommunes(famillesVues),
        personnesMasqueesFamilleActive(),
      ]);
      // Enfants masqués dans la famille affichée (famille recomposée) : la
      // base les cache aux autres ; on ne les montre pas non plus ici.
      setPersonnes(p.filter((x) => !masquees.has(x.id)));
      setMoi(m);
      setCommunes(c);
    } catch (e) {
      setErreur(extraireMessageErreur(e, 'Chargement impossible.'));
      setPersonnes([]);
    }
  }, [session, famille?.id, foyersFamille, famillesVues]);

  useFocusEffect(
    useCallback(() => {
      charger();
    }, [charger])
  );

  if (personnes === null) return <Chargement />;

  // Les autres membres, regroupés par foyer : mon foyer d'abord.
  const autres = personnes.filter((p) => p.id !== moi?.id);
  const groupes: Groupe[] = [];
  const parFoyer = new Map<string, Groupe>();
  autres.forEach((p) => {
    const cle = p.foyer_id ?? 'sans-foyer';
    if (!parFoyer.has(cle)) {
      const g: Groupe = { cle, titre: p.foyer_nom ? `Foyer ${p.foyer_nom}` : 'Sans foyer', membres: [] };
      parFoyer.set(cle, g);
      groupes.push(g);
    }
    parFoyer.get(cle)!.membres.push(p);
  });
  groupes.forEach((g) => g.membres.sort((a, b) => a.prenom.localeCompare(b.prenom)));
  groupes.sort((a, b) => {
    const r = (g: Groupe) => (g.cle === moi?.foyer_id ? 0 : 1);
    return r(a) - r(b) || a.titre.localeCompare(b.titre);
  });

  const ouvrir = async (p: Personne) => {
    setErreur(null);
    setEnCours(p.id);
    try {
      const id = await listeDe(p.id);
      navigation.navigate('Liste', { listeId: id });
    } catch (e) {
      setErreur(extraireMessageErreur(e, 'Impossible d’ouvrir cette liste.'));
    } finally {
      setEnCours(null);
    }
  };

  const carte = (p: Personne) => (
    <Pressable
      key={p.id}
      style={({ pressed }) => [styles.carte, pressed && styles.appuye]}
      onPress={() => ouvrir(p)}
      disabled={!!enCours}
      accessibilityRole="button"
      accessibilityLabel={`La liste de ${p.prenom}`}
    >
      <Avatar personneId={p.id} prenom={p.prenom} taille={40} />
      <View style={styles.carteTextes}>
        <Text style={styles.carteTitre}>{p.prenom}</Text>
        <Text style={styles.carteDetail}>
          {p.utilisateur_id ? 'Voir sa liste, réserver un cadeau' : 'Sans compte · liste remplie par ses parents'}
        </Text>
      </View>
      <Ionicons
        name={enCours === p.id ? 'hourglass-outline' : 'chevron-forward'}
        size={20}
        color={theme.colors.textMuted}
      />
    </Pressable>
  );

  const nomsDe = (l: Liste) =>
    joindrePrenoms(
      (l.destinataires ?? [])
        .map((d) => personnes.find((p) => p.id === d.personne_id)?.prenom)
        .filter((x): x is string => !!x)
        .sort((a, b) => a.localeCompare(b))
    ) || 'personne';

  const carteCommune = (l: Liste) => (
    <Pressable
      key={l.id}
      style={({ pressed }) => [styles.carte, styles.carteCommune, pressed && styles.appuye]}
      onPress={() => navigation.navigate('Liste', { listeId: l.id })}
      accessibilityRole="button"
      accessibilityLabel={`Liste commune ${l.titre ?? ''}`}
    >
      <View style={styles.iconeCommune}>
        <Ionicons name="gift-outline" size={22} color={theme.colors.accent} />
      </View>
      <View style={styles.carteTextes}>
        <Text style={styles.carteTitre}>{l.titre}</Text>
        <Text style={styles.carteDetail}>Pour {nomsDe(l)} · invisible pour eux</Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color={theme.colors.textMuted} />
    </Pressable>
  );

  return (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={styles.contenu}
      refreshControl={
        <RefreshControl
          refreshing={rechargement}
          onRefresh={async () => {
            setRechargement(true);
            await charger();
            setRechargement(false);
          }}
          tintColor={theme.colors.accent}
        />
      }
    >
      <Text style={styles.intro}>
        Une liste par personne. Ce que vous réservez ou suggérez reste caché à la personne concernée.
      </Text>
      {erreur && <Text style={styles.erreur}>{erreur}</Text>}
      {groupes.length > 0 && (
        <View style={styles.groupe}>
          <Text style={styles.groupeTitre}>Listes communes</Text>
          {communes.map(carteCommune)}
          <Bouton
            variante="pointille"
            titre="+ Liste pour plusieurs personnes"
            onPress={() => navigation.navigate('ListeCommune')}
            accessibilityLabel="Créer une liste commune pour plusieurs personnes, cachée à ces personnes"
          />
        </View>
      )}
      {groupes.length === 0 ? (
        <MessageVide
          titre="Personne d’autre dans la famille"
          texte="Invitez vos proches depuis Moi (« Inviter un proche ») : leurs listes apparaîtront ici."
        />
      ) : (
        groupes.map((g) => (
          <View key={g.cle} style={styles.groupe}>
            <Text style={styles.groupeTitre}>{groupes.length > 1 ? g.titre : 'Une liste par personne'}</Text>
            {g.membres.map(carte)}
          </View>
        ))
      )}
    </ScrollView>
  );
}

const styles = creerStylesThemes(() => ({
  flex: { flex: 1, backgroundColor: theme.colors.background },
  contenu: { padding: theme.spacing.md, gap: theme.spacing.sm, paddingBottom: theme.spacing.xl },
  intro: { fontFamily: theme.fontBody, fontSize: 14, color: theme.colors.textMuted, marginBottom: theme.spacing.xs },
  groupe: { gap: theme.spacing.xs, marginTop: theme.spacing.xs },
  groupeTitre: {
    paddingHorizontal: 2,
    fontFamily: theme.fontBodyBold,
    fontSize: 12,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: theme.colors.textMuted,
  },
  carte: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radii.lg,
    padding: theme.spacing.md,
    minHeight: 64,
  },
  appuye: { opacity: 0.7 },
  carteCommune: { borderStyle: 'dashed', borderColor: theme.colors.accent },
  iconeCommune: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.accentTransparent,
  },
  carteTextes: { flex: 1, gap: 2 },
  carteTitre: { fontFamily: theme.fontBodyBold, fontSize: 17, color: theme.colors.text },
  carteDetail: { fontFamily: theme.fontBody, fontSize: 13, color: theme.colors.textMuted },
  erreur: { fontFamily: theme.fontBody, fontSize: 14, color: theme.colors.warning },
}));
