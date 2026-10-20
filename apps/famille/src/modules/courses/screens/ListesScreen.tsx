import React, { useCallback, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Avatar } from '@apps-famille/famille';
import { theme, creerStylesThemes } from '../theme/theme';
import { useAuth } from '../contexts/AuthContext';
import { Bouton, Chargement } from '../components/ui';
import {
  assurerListePrincipale,
  listerListes,
  listerPersonnesAvecCompte,
  type ListeResume,
  type PersonneCompte,
} from '../services/courses';

// Accueil : les listes de courses que je vois (celles de mon foyer, les
// miennes, celles qu'on m'a partagées). La liste principale « Courses »
// est créée au premier passage.
export default function ListesScreen() {
  const navigation = useNavigation<any>();
  const { foyer, session } = useAuth();
  const [listes, setListes] = useState<ListeResume[] | null>(null);
  const [personnes, setPersonnes] = useState<Map<string, PersonneCompte>>(new Map());
  const [erreur, setErreur] = useState<string | null>(null);
  const [rafraichit, setRafraichit] = useState(false);

  const charger = useCallback(async () => {
    if (!foyer) return;
    try {
      await assurerListePrincipale(foyer.id);
      const [l, p] = await Promise.all([listerListes(), listerPersonnesAvecCompte().catch(() => [])]);
      // Listes de mon foyer d'abord (la principale en tête), puis celles
      // qu'on m'a partagées.
      setListes([...l.filter((x) => x.foyer_id === foyer.id), ...l.filter((x) => x.foyer_id !== foyer.id)]);
      setPersonnes(new Map(p.map((x) => [x.utilisateurId, x])));
      setErreur(null);
    } catch {
      setErreur('Impossible de charger vos listes. Vérifiez votre connexion internet.');
      setListes((actuelles) => actuelles ?? []);
    }
  }, [foyer]);

  useFocusEffect(
    useCallback(() => {
      charger();
    }, [charger])
  );

  if (listes === null) return <Chargement />;

  const descriptionPortee = (l: ListeResume) => {
    if (l.foyer_id !== foyer?.id) {
      const createur = personnes.get(l.cree_par);
      if (!createur) return 'Partagée avec vous';
      return `Partagée par ${createur.prenom}${createur.foyerNom ? ` (foyer ${createur.foyerNom})` : ''}`;
    }
    const base = l.portee === 'moi' ? (l.cree_par === session?.user.id ? 'Rien que moi' : 'Privée') : 'Tout le foyer';
    return l.invites.length > 0 ? `${base} + ${l.invites.length} invité${l.invites.length > 1 ? 's' : ''}` : base;
  };

  return (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={styles.contenu}
      refreshControl={
        <RefreshControl
          refreshing={rafraichit}
          onRefresh={async () => {
            setRafraichit(true);
            await charger();
            setRafraichit(false);
          }}
          tintColor={theme.colors.accent}
        />
      }
    >
      {erreur && <Text style={styles.erreur}>{erreur}</Text>}
      {listes.map((l) => {
        const couleur = l.couleur ?? theme.colors.accent;
        return (
          <Pressable
            key={l.id}
            style={({ pressed }) => [styles.carte, pressed && styles.appuye]}
            onPress={() => navigation.navigate('Liste', { listeId: l.id })}
            accessibilityRole="button"
            accessibilityLabel={`${l.nom}, ${l.nbAAcheter} article${l.nbAAcheter > 1 ? 's' : ''}`}
          >
            <View style={[styles.pastille, { backgroundColor: couleur }]}>
              <Ionicons name={l.icone as any} size={26} color={theme.colors.background} />
            </View>
            <View style={styles.textes}>
              <Text style={styles.nom} numberOfLines={1}>
                {l.nom}
              </Text>
              <Text style={styles.detail} numberOfLines={2}>
                {descriptionPortee(l)}
              </Text>
              {l.invites.length > 0 && (
                <View style={styles.avatars}>
                  {l.invites.slice(0, 5).map((u) => (
                    <Avatar key={u} utilisateurId={u} prenom={personnes.get(u)?.prenom} taille={22} />
                  ))}
                </View>
              )}
            </View>
            <View style={styles.compteur}>
              <Text style={styles.nombre}>{l.nbAAcheter}</Text>
              <Text style={styles.detail}>{l.nbAAcheter > 1 ? 'articles' : 'article'}</Text>
            </View>
          </Pressable>
        );
      })}
      <Bouton variante="pointille" titre="Nouvelle liste" onPress={() => navigation.navigate('ListeForm', {})} />
      <Pressable
        onPress={() => navigation.navigate('Checklist')}
        style={({ pressed }) => [styles.lienChecklist, pressed && styles.appuye]}
        accessibilityRole="button"
      >
        <Ionicons name="list-outline" size={22} color={theme.colors.accent} />
        <View style={styles.textes}>
          <Text style={styles.nomChecklist}>Checklist du foyer</Text>
          <Text style={styles.detail}>Ce qu’il faut vérifier à la maison avant chaque course</Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={theme.colors.textMuted} />
      </Pressable>
    </ScrollView>
  );
}

const styles = creerStylesThemes(() => ({
  flex: { flex: 1, backgroundColor: theme.colors.background },
  contenu: { padding: theme.spacing.md, gap: theme.spacing.sm, paddingBottom: theme.spacing.xl },
  carte: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radii.lg,
    padding: theme.spacing.md,
    minHeight: 76,
  },
  appuye: { opacity: 0.75 },
  pastille: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  textes: { flex: 1, gap: 2 },
  nom: { fontFamily: theme.fontTitle, fontSize: 19, color: theme.colors.text },
  detail: { fontFamily: theme.fontBody, fontSize: 13, color: theme.colors.textMuted },
  avatars: { flexDirection: 'row', gap: 4, marginTop: 4 },
  compteur: { alignItems: 'center', minWidth: 52 },
  nombre: { fontFamily: theme.fontTitle, fontSize: 24, color: theme.colors.accent },
  erreur: { fontFamily: theme.fontBody, fontSize: 14, color: theme.colors.warning },
  lienChecklist: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    marginTop: theme.spacing.md,
    padding: theme.spacing.md,
    minHeight: 60,
    borderRadius: theme.radii.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  nomChecklist: { fontFamily: theme.fontBodyBold, fontSize: 16, color: theme.colors.text },
}));
