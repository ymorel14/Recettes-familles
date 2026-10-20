import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, ScrollView, Pressable } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { theme, creerStylesThemes } from '../theme/theme';
import { useAuth } from '../contexts/AuthContext';
import { Avatar, extraireMessageErreur, personnesMasqueesFamilleActive } from '@apps-famille/famille';
import { alerte } from '../utils/alerte';
import {
  creerListeCommune,
  joindrePrenoms,
  listerPersonnes,
  modifierListeCommune,
  obtenirListe,
  obtenirMaPersonne,
  supprimerListe,
  type Personne,
} from '../services/wishlist';
import { Bouton, Chargement } from '../components/ui';

// Création ou modification d'une liste commune : un titre et plusieurs
// personnes au choix. La liste est invisible de ces personnes (garanti par
// la base), le reste de la famille y ajoute des idées et les réserve.
// On ne peut pas se choisir soi-même.
export default function ListeCommuneFormScreen({ route, navigation }: any) {
  const listeId: string | undefined = route.params?.listeId;
  const { session, famille, foyersFamille } = useAuth();
  const [personnes, setPersonnes] = useState<Personne[] | null>(null);
  const [titre, setTitre] = useState('');
  const [choisies, setChoisies] = useState<Set<string>>(new Set());
  const [enCours, setEnCours] = useState<'enregistrer' | 'supprimer' | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    navigation.setOptions({ title: listeId ? 'Modifier la liste commune' : 'Nouvelle liste commune' });
    if (!session) return;
    (async () => {
      try {
        const [p, moi, l, masquees] = await Promise.all([
          listerPersonnes(foyersFamille),
          obtenirMaPersonne(session.user.id),
          listeId ? obtenirListe(listeId) : Promise.resolve(null),
          personnesMasqueesFamilleActive(),
        ]);
        // Pas les enfants masqués dans cette famille (la base les refuserait).
        setPersonnes(p.filter((x) => x.id !== moi?.id && !masquees.has(x.id)));
        if (l) {
          setTitre(l.titre ?? '');
          setChoisies(new Set((l.destinataires ?? []).map((d) => d.personne_id)));
        }
      } catch (e) {
        setErreur(extraireMessageErreur(e, 'Chargement impossible.'));
        setPersonnes([]);
      }
    })();
  }, [listeId, session, foyersFamille, navigation]);

  if (personnes === null) return <Chargement />;

  const basculer = (id: string) => {
    const suivant = new Set(choisies);
    if (suivant.has(id)) suivant.delete(id);
    else suivant.add(id);
    setChoisies(suivant);
  };

  // Regroupement par foyer, dans l'ordre alphabétique.
  const foyers = new Map<string, { titre: string; membres: Personne[] }>();
  personnes.forEach((p) => {
    const cle = p.foyer_id ?? 'sans-foyer';
    if (!foyers.has(cle)) foyers.set(cle, { titre: p.foyer_nom ? `Foyer ${p.foyer_nom}` : 'Sans foyer', membres: [] });
    foyers.get(cle)!.membres.push(p);
  });
  const groupes = [...foyers.values()].sort((a, b) => a.titre.localeCompare(b.titre));
  groupes.forEach((g) => g.membres.sort((a, b) => a.prenom.localeCompare(b.prenom)));

  const prenomsChoisis = personnes.filter((p) => choisies.has(p.id)).map((p) => p.prenom);

  const enregistrer = async () => {
    setErreur(null);
    if (!titre.trim()) return setErreur('Donnez un titre à la liste (ex. « Noces d’or », « Noël des petits »).');
    if (choisies.size === 0) return setErreur('Choisissez au moins une personne.');
    if (!famille) return;
    setEnCours('enregistrer');
    try {
      if (listeId) {
        await modifierListeCommune(listeId, titre, [...choisies]);
        navigation.goBack();
      } else {
        const id = await creerListeCommune(titre, [...choisies], famille.id);
        navigation.replace('Liste', { listeId: id });
      }
    } catch (e) {
      setErreur(extraireMessageErreur(e, 'Enregistrement impossible.'));
    } finally {
      setEnCours(null);
    }
  };

  const supprimer = () =>
    alerte(`Supprimer la liste « ${titre} » ?`, 'Ses idées, réservations et participations seront supprimées.', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: async () => {
          setErreur(null);
          setEnCours('supprimer');
          try {
            await supprimerListe(listeId!);
            navigation.navigate('Onglets', { screen: 'Famille' });
          } catch (e) {
            setErreur(extraireMessageErreur(e, 'Suppression impossible.'));
            setEnCours(null);
          }
        },
      },
    ]);

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.contenu} keyboardShouldPersistTaps="handled">
      <View style={styles.bandeau}>
        <Ionicons name="eye-off-outline" size={20} color={theme.colors.accent} />
        <Text style={styles.bandeauTexte}>
          Une liste pour plusieurs personnes à la fois. Elles ne la verront pas : ni son titre, ni les idées, ni ce
          qui est réservé. Le reste de la famille pourra y ajouter des idées et les réserver.
        </Text>
      </View>

      <Text style={styles.libelle} nativeID="libelle-titre">
        Titre
      </Text>
      <TextInput
        style={styles.champ}
        value={titre}
        onChangeText={setTitre}
        placeholder="Ex. Noces d’or, Noël des petits"
        placeholderTextColor={theme.colors.textMuted}
        accessibilityLabelledBy="libelle-titre"
        maxLength={80}
      />

      <Text style={styles.libelle}>Pour qui ?</Text>
      <Text style={styles.aide}>
        {prenomsChoisis.length === 0
          ? 'Touchez les personnes à qui sont destinés les cadeaux.'
          : `Cachée à ${joindrePrenoms(prenomsChoisis)}.`}
      </Text>
      {groupes.map((g) => (
        <View key={g.titre} style={styles.groupe}>
          {groupes.length > 1 && <Text style={styles.groupeTitre}>{g.titre}</Text>}
          {g.membres.map((p) => {
            const coche = choisies.has(p.id);
            return (
              <Pressable
                key={p.id}
                onPress={() => basculer(p.id)}
                style={({ pressed }) => [styles.personne, coche && styles.personneCochee, pressed && styles.appuye]}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: coche }}
                accessibilityLabel={p.prenom}
              >
                <Avatar personneId={p.id} prenom={p.prenom} taille={36} />
                <Text style={styles.prenom}>{p.prenom}</Text>
                <Ionicons
                  name={coche ? 'checkbox' : 'square-outline'}
                  size={26}
                  color={coche ? theme.colors.accent : theme.colors.textMuted}
                />
              </Pressable>
            );
          })}
        </View>
      ))}

      {erreur && <Text style={styles.erreur}>{erreur}</Text>}
      <Bouton
        titre={listeId ? 'Enregistrer' : 'Créer la liste'}
        onPress={enregistrer}
        enCours={enCours === 'enregistrer'}
        desactive={!!enCours}
        style={styles.enregistrer}
      />
      {listeId && (
        <Bouton variante="discret" titre="Supprimer la liste" onPress={supprimer} enCours={enCours === 'supprimer'} />
      )}
    </ScrollView>
  );
}

const styles = creerStylesThemes(() => ({
  flex: { flex: 1, backgroundColor: theme.colors.background },
  contenu: { padding: theme.spacing.md, gap: theme.spacing.sm, paddingBottom: theme.spacing.xl },
  bandeau: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    alignItems: 'flex-start',
    backgroundColor: theme.colors.accentTransparent,
    borderRadius: theme.radii.lg,
    padding: theme.spacing.md,
  },
  bandeauTexte: { flex: 1, fontFamily: theme.fontBody, fontSize: 14, color: theme.colors.text, lineHeight: 19 },
  libelle: { fontFamily: theme.fontBodyBold, fontSize: 15, color: theme.colors.text, marginTop: theme.spacing.xs },
  aide: { fontFamily: theme.fontBody, fontSize: 13, color: theme.colors.textMuted },
  champ: {
    minHeight: 44,
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radii.md,
    paddingHorizontal: theme.spacing.sm,
    color: theme.colors.text,
    fontFamily: theme.fontBody,
    fontSize: 16,
  },
  groupe: { gap: theme.spacing.xs, marginTop: theme.spacing.xs },
  groupeTitre: {
    paddingHorizontal: 2,
    fontFamily: theme.fontBodyBold,
    fontSize: 12,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: theme.colors.textMuted,
  },
  personne: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    minHeight: 56,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.radii.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  personneCochee: { borderColor: theme.colors.accent, backgroundColor: theme.colors.accentTransparent },
  appuye: { opacity: 0.7 },
  prenom: { flex: 1, fontFamily: theme.fontBodyBold, fontSize: 16, color: theme.colors.text },
  enregistrer: { marginTop: theme.spacing.md },
  erreur: { fontFamily: theme.fontBody, fontSize: 14, color: theme.colors.warning },
}));
