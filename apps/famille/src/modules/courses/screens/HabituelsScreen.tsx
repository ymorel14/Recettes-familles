import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { theme, creerStylesThemes } from '../theme/theme';
import { useAuth } from '../contexts/AuthContext';
import { Bouton, Chargement } from '../components/ui';
import { Vignette } from '../components/Photo';
import { alerte } from '../utils/alerte';
import { formaterDateCourte } from '../utils/dates';
import { nomRayon, RAYONS_DEPART } from '../services/rayons';
import { supprimerPhoto } from '../services/photos';
import {
  ajouterArticle,
  creerHabituel,
  dansChecklist,
  listerChecklist,
  listerArticles,
  listerListes,
  listerProduitsAGerer,
  modifierProduit,
  supprimerProduit,
  type AVerifier,
  type ListeResume,
  type ProduitGere,
} from '../services/courses';

// Onglet « Habituels » : les articles récurrents du foyer (achetés
// régulièrement, ou épinglés), pour les gérer en un seul endroit :
// épingler en tête, ne plus proposer (ou de nouveau), oublier, ajouter à
// une liste, en créer un nouveau. Les photos se prennent depuis la fiche
// d'un article ou de la fiche produit (toucher un produit).
export default function HabituelsScreen({ navigation }: any) {
  const { foyer } = useAuth();
  const [produits, setProduits] = useState<ProduitGere[] | null>(null);
  const [listes, setListes] = useState<ListeResume[]>([]);
  const [checklist, setChecklist] = useState<AVerifier[]>([]);
  const [voirMasques, setVoirMasques] = useState(false);
  const [nouveau, setNouveau] = useState('');
  const [choixListePour, setChoixListePour] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [rafraichit, setRafraichit] = useState(false);

  const charger = useCallback(async () => {
    if (!foyer) return;
    try {
      const [p, l, c] = await Promise.all([
        listerProduitsAGerer(foyer.id),
        listerListes(),
        listerChecklist(foyer.id).catch(() => [] as AVerifier[]),
      ]);
      setProduits(p);
      setChecklist(c);
      setListes(l.filter((x) => x.foyer_id === foyer.id));
    } catch {
      setMessage('Chargement impossible. Vérifiez votre connexion.');
      setProduits((p) => p ?? []);
    }
  }, [foyer]);

  useFocusEffect(
    useCallback(() => {
      charger();
    }, [charger])
  );

  const proposes = useMemo(() => (produits ?? []).filter((p) => !p.masque), [produits]);
  const masques = useMemo(() => (produits ?? []).filter((p) => p.masque), [produits]);
  const affiches = voirMasques ? masques : proposes;

  const changer = async (p: ProduitGere, champs: Partial<Pick<ProduitGere, 'epingle' | 'masque'>>) => {
    if (!foyer) return;
    setProduits((liste) => (liste ?? []).map((x) => (x.cle === p.cle ? { ...x, ...champs } : x)));
    try {
      await modifierProduit(foyer.id, p.cle, champs);
    } catch {
      setMessage('Modification non enregistrée.');
      charger();
    }
  };

  const ajouterHabituel = async () => {
    if (!foyer || !nouveau.trim()) return;
    setMessage(null);
    try {
      await creerHabituel(foyer.id, nouveau, produits ?? []);
      setNouveau('');
      await charger();
    } catch {
      setMessage('Ajout impossible.');
    }
  };

  const ajouterALaListe = async (p: ProduitGere, liste: ListeResume) => {
    setChoixListePour(null);
    setMessage(null);
    try {
      const actuels = await listerArticles(liste.id);
      const { fusionne } = await ajouterArticle(liste.id, { libelle: p.libelle, quantite: null, unite: null }, produits ?? [], actuels);
      setMessage(fusionne ? `« ${p.libelle} » était déjà sur « ${liste.nom} ».` : `« ${p.libelle} » ajouté à « ${liste.nom} ».`);
    } catch {
      setMessage('Ajout à la liste impossible.');
    }
  };

  const versUneListe = (p: ProduitGere) => {
    if (listes.length === 1) ajouterALaListe(p, listes[0]);
    else setChoixListePour(choixListePour === p.cle ? null : p.cle);
  };

  const plusDActions = (p: ProduitGere) =>
    alerte(p.libelle, p.nb_achats > 0 ? `Acheté ${p.nb_achats} fois.` : 'Jamais encore acheté.', [
      { text: 'Annuler', style: 'cancel' },
      p.masque
        ? { text: 'Proposer de nouveau', onPress: () => changer(p, { masque: false }) }
        : { text: 'Ne plus proposer', onPress: () => changer(p, { masque: true, epingle: false }) },
      {
        text: 'Oublier ce produit',
        style: 'destructive',
        onPress: async () => {
          if (!foyer) return;
          setProduits((liste) => (liste ?? []).filter((x) => x.cle !== p.cle));
          try {
            const photo = await supprimerProduit(foyer.id, p.cle);
            await supprimerPhoto(photo);
          } catch {
            setMessage('Impossible d’oublier ce produit.');
            charger();
          }
        },
      },
    ]);

  if (produits === null) return <Chargement />;

  return (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={styles.contenu}
      keyboardShouldPersistTaps="handled"
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
      <Text style={styles.intro}>
        Les articles que le foyer achète souvent, et ceux que vous épinglez. Ils sont proposés en un appui dans
        chaque liste (panneau « Habituels »).
      </Text>

      <View style={styles.ajout}>
        <TextInput
          style={styles.champ}
          value={nouveau}
          onChangeText={setNouveau}
          onSubmitEditing={ajouterHabituel}
          placeholder="Nouvel habituel : café, piles…"
          placeholderTextColor={theme.colors.textMuted}
          accessibilityLabel="Nouvel article habituel"
        />
        <Pressable
          onPress={ajouterHabituel}
          disabled={!nouveau.trim()}
          style={({ pressed }) => [styles.boutonAjout, (!nouveau.trim() || pressed) && styles.appuye]}
          accessibilityRole="button"
          accessibilityLabel="Ajouter aux habituels"
        >
          <Ionicons name="add" size={26} color={theme.colors.background} />
        </Pressable>
      </View>

      <View style={styles.onglets}>
        {[
          { cle: false, titre: `Proposés (${proposes.length})` },
          { cle: true, titre: `Plus proposés (${masques.length})` },
        ].map((o) => (
          <Pressable
            key={String(o.cle)}
            onPress={() => setVoirMasques(o.cle)}
            style={[styles.onglet, voirMasques === o.cle && styles.ongletActif]}
            accessibilityRole="tab"
            accessibilityState={{ selected: voirMasques === o.cle }}
          >
            <Text style={[styles.ongletTexte, voirMasques === o.cle && styles.ongletTexteActif]}>{o.titre}</Text>
          </Pressable>
        ))}
      </View>

      {message && <Text style={styles.message}>{message}</Text>}

      {affiches.length === 0 && (
        <View style={styles.vide}>
          <Ionicons name="repeat-outline" size={40} color={theme.colors.textMuted} />
          <Text style={styles.aide}>
            {voirMasques
              ? 'Aucun produit écarté.'
              : 'Pas encore d’habituels : ils apparaissent après les premières courses terminées. Vous pouvez aussi en ajouter ci-dessus.'}
          </Text>
        </View>
      )}

      {affiches.map((p) => (
        <View key={p.cle} style={styles.carte}>
          <View style={styles.ligne}>
            {p.photo ? (
              <Vignette chemin={p.photo} taille={44} legende={p.libelle} />
            ) : (
              <View style={styles.icone}>
                <Ionicons
                  name={(RAYONS_DEPART.find((r) => r.id === p.rayon_id)?.icone ?? 'pricetag-outline') as any}
                  size={20}
                  color={theme.colors.accent}
                />
              </View>
            )}
            <Pressable
              onPress={() => navigation.navigate('Produit', { cle: p.cle })}
              style={({ pressed }) => [styles.textes, pressed && styles.appuye]}
              accessibilityRole="button"
              accessibilityLabel={`Fiche de ${p.libelle}`}
            >
              <View style={styles.ligneNom}>
                <Text style={styles.libelle}>{p.libelle}</Text>
                {dansChecklist(checklist, p.cle) && (
                  <Ionicons
                    name="home-outline"
                    size={14}
                    color={theme.colors.accent}
                    accessibilityLabel={`À vérifier à la maison (${dansChecklist(checklist, p.cle)?.endroit})`}
                  />
                )}
              </View>
              <Text style={styles.detail} numberOfLines={2}>
                {p.nb_achats > 0
                  ? `Acheté ${p.nb_achats} fois${p.dernier_achat ? `, la dernière ${formaterDateCourte(p.dernier_achat)}` : ''}`
                  : 'Jamais encore acheté'}
                {p.rayon_id ? ` · ${nomRayon(RAYONS_DEPART, p.rayon_id)}` : ''}
              </Text>
            </Pressable>
            {!p.masque && (
              <Pressable
                onPress={() => changer(p, { epingle: !p.epingle })}
                style={styles.action}
                hitSlop={6}
                accessibilityRole="button"
                accessibilityLabel={p.epingle ? `Ne plus épingler ${p.libelle}` : `Épingler ${p.libelle} en tête`}
              >
                <Ionicons name={p.epingle ? 'pin' : 'pin-outline'} size={22} color={theme.colors.accent} />
              </Pressable>
            )}
            <Pressable
              onPress={() => versUneListe(p)}
              style={styles.action}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel={`Ajouter ${p.libelle} à une liste`}
            >
              <Ionicons name="cart-outline" size={22} color={theme.colors.accent} />
            </Pressable>
            <Pressable
              onPress={() => plusDActions(p)}
              style={styles.action}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel={`Plus d’actions pour ${p.libelle}`}
            >
              <Ionicons name="ellipsis-vertical" size={20} color={theme.colors.textMuted} />
            </Pressable>
          </View>
          {choixListePour === p.cle && (
            <View style={styles.choixListes}>
              <Text style={styles.detail}>Ajouter à :</Text>
              {listes.map((l) => (
                <Pressable key={l.id} onPress={() => ajouterALaListe(p, l)} style={styles.puce} accessibilityRole="button">
                  <Ionicons name={l.icone as any} size={14} color={theme.colors.accent} />
                  <Text style={styles.puceTexte}>{l.nom}</Text>
                </Pressable>
              ))}
            </View>
          )}
        </View>
      ))}
      {voirMasques && masques.length > 0 && (
        <Text style={styles.aide}>Ces produits ne sont plus proposés dans les listes. Touchez ⋮ pour les proposer de nouveau.</Text>
      )}
      {!voirMasques && proposes.length > 0 && (
        <Bouton variante="discret" titre="Actualiser" onPress={charger} />
      )}
    </ScrollView>
  );
}

const styles = creerStylesThemes(() => ({
  flex: { flex: 1, backgroundColor: theme.colors.background },
  contenu: { padding: theme.spacing.md, gap: theme.spacing.sm, paddingBottom: theme.spacing.xl },
  intro: { fontFamily: theme.fontBody, fontSize: 14, color: theme.colors.textMuted },
  ajout: { flexDirection: 'row', gap: theme.spacing.sm, alignItems: 'center' },
  champ: {
    flex: 1,
    minHeight: 46,
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radii.md,
    paddingHorizontal: theme.spacing.sm,
    color: theme.colors.text,
    fontFamily: theme.fontBody,
    fontSize: 16,
  },
  boutonAjout: { width: 46, height: 46, borderRadius: theme.radii.md, backgroundColor: theme.colors.accent, alignItems: 'center', justifyContent: 'center' },
  appuye: { opacity: 0.5 },
  onglets: { flexDirection: 'row', gap: 6 },
  onglet: {
    flex: 1,
    minHeight: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 19,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  ongletActif: { backgroundColor: theme.colors.accent, borderColor: theme.colors.accent },
  ongletTexte: { fontFamily: theme.fontBody, fontSize: 14, color: theme.colors.text },
  ongletTexteActif: { fontFamily: theme.fontBodyBold, color: theme.colors.background },
  message: { fontFamily: theme.fontBody, fontSize: 14, color: theme.colors.text },
  vide: { alignItems: 'center', gap: theme.spacing.sm, paddingTop: theme.spacing.lg },
  aide: { fontFamily: theme.fontBody, fontSize: 14, color: theme.colors.textMuted, textAlign: 'center' },
  carte: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radii.md,
    padding: theme.spacing.sm,
    gap: theme.spacing.xs,
  },
  ligne: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, minHeight: 48 },
  icone: { width: 44, height: 44, borderRadius: theme.radii.md, backgroundColor: theme.colors.background, alignItems: 'center', justifyContent: 'center' },
  textes: { flex: 1, gap: 2 },
  libelle: { fontFamily: theme.fontBodyBold, fontSize: 16, color: theme.colors.text, flexShrink: 1 },
  ligneNom: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  detail: { fontFamily: theme.fontBody, fontSize: 12, color: theme.colors.textMuted },
  action: { width: 38, height: 44, alignItems: 'center', justifyContent: 'center' },
  choixListes: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, paddingLeft: 52 },
  puce: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minHeight: 34,
    paddingHorizontal: theme.spacing.sm,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.background,
  },
  puceTexte: { fontFamily: theme.fontBody, fontSize: 14, color: theme.colors.text },
}));
