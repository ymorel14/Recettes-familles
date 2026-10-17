import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Avatar } from '@apps-famille/famille';
import { theme, creerStylesThemes } from '../theme/theme';
import { useAuth } from '../contexts/AuthContext';
import { Bouton, Chargement } from '../components/ui';
import { alerte } from '../utils/alerte';
import { formaterDateHeure } from '../utils/dates';
import { useListe } from '../hooks/useListe';
import {
  cleArticle,
  listerListes,
  memoriserRayon,
  modifierArticle,
  supprimerArticle,
  type ListeResume,
} from '../services/courses';

// Détail d'un article : libellé, quantité et unité (facultatives), note,
// rayon, liste ; qui l'a ajouté et quand.
export default function ArticleScreen({ route, navigation }: any) {
  const { listeId, articleId } = route.params as { listeId: string; articleId: string };
  const { foyer } = useAuth();
  const { liste, articles, rayonsOrdonnes, parUtilisateur, chargement, contributions } = useListe(listeId);
  const article = useMemo(() => articles.find((a) => a.id === articleId) ?? null, [articles, articleId]);
  const [libelle, setLibelle] = useState('');
  const [quantite, setQuantite] = useState('');
  const [unite, setUnite] = useState('');
  const [note, setNote] = useState('');
  const [rayonId, setRayonId] = useState('autres');
  const [destination, setDestination] = useState(listeId);
  const [autresListes, setAutresListes] = useState<ListeResume[]>([]);
  const [enCours, setEnCours] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [initialise, setInitialise] = useState(false);

  useEffect(() => {
    if (!article || initialise) return;
    setLibelle(article.libelle);
    setQuantite(article.quantite != null ? String(article.quantite).replace('.', ',') : '');
    setUnite(article.unite ?? '');
    setNote(article.note ?? '');
    setRayonId(article.rayon_id);
    setInitialise(true);
  }, [article, initialise]);

  useEffect(() => {
    listerListes()
      .then(setAutresListes)
      .catch(() => setAutresListes([]));
  }, []);

  useEffect(() => {
    navigation.setOptions({ title: article?.libelle ?? 'Article' });
  }, [navigation, article?.libelle]);

  if (chargement) return <Chargement />;
  if (!article) {
    return (
      <View style={styles.centre}>
        <Text style={styles.aide}>Cet article n’est plus sur la liste (acheté ou retiré entre-temps).</Text>
        <Bouton variante="contour" titre="Retour à la liste" onPress={() => navigation.goBack()} />
      </View>
    );
  }

  const auteur = article.ajoute_par ? parUtilisateur.get(article.ajoute_par) : undefined;
  // Recettes qui citent cet article (envoyées depuis l'app Recettes).
  const citePar = contributions.filter((c) => cleArticle(c.libelle, c.unite) === cleArticle(article.libelle, article.unite));

  const enregistrer = async () => {
    const q = quantite.trim() ? Number(quantite.replace(',', '.')) : null;
    if (quantite.trim() && (!Number.isFinite(q) || (q as number) <= 0)) {
      setMessage('Quantité : un nombre (ex. 2 ou 1,5), ou laissez vide.');
      return;
    }
    if (!libelle.trim()) {
      setMessage('Le nom de l’article ne peut pas être vide.');
      return;
    }
    setEnCours('enregistrer');
    setMessage(null);
    try {
      await modifierArticle(article.id, {
        libelle,
        quantite: q,
        unite,
        note,
        rayon_id: rayonId,
        liste_id: destination,
      });
      // Rayon choisi à la main : retenu pour le foyer (sans effet pour un
      // invité d'un autre foyer).
      if (rayonId !== article.rayon_id && liste && foyer && liste.foyer_id === foyer.id) {
        await memoriserRayon(foyer.id, libelle, rayonId).catch(() => {});
      }
      navigation.goBack();
    } catch {
      setMessage('Enregistrement impossible. Vérifiez votre connexion.');
    } finally {
      setEnCours(null);
    }
  };

  const supprimer = () =>
    alerte(`Retirer « ${article.libelle} » de la liste ?`, undefined, [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Retirer',
        style: 'destructive',
        onPress: async () => {
          setEnCours('supprimer');
          try {
            await supprimerArticle(article.id);
            navigation.goBack();
          } catch {
            setMessage('Suppression impossible.');
          } finally {
            setEnCours(null);
          }
        },
      },
    ]);

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.contenu} keyboardShouldPersistTaps="handled">
      <View style={styles.section}>
        <Text style={styles.libelleChamp}>Article</Text>
        <TextInput
          style={styles.champ}
          value={libelle}
          onChangeText={setLibelle}
          placeholder="Nom de l’article"
          placeholderTextColor={theme.colors.textMuted}
          accessibilityLabel="Nom de l’article"
        />
        <View style={styles.ligne}>
          <View style={styles.demi}>
            <Text style={styles.libelleChamp}>Quantité (facultative)</Text>
            <TextInput
              style={styles.champ}
              value={quantite}
              onChangeText={setQuantite}
              placeholder="—"
              placeholderTextColor={theme.colors.textMuted}
              keyboardType="decimal-pad"
              accessibilityLabel="Quantité, facultative"
            />
          </View>
          <View style={styles.demi}>
            <Text style={styles.libelleChamp}>Unité</Text>
            <TextInput
              style={styles.champ}
              value={unite}
              onChangeText={setUnite}
              placeholder="g, kg, L, paquet…"
              placeholderTextColor={theme.colors.textMuted}
              accessibilityLabel="Unité, facultative"
            />
          </View>
        </View>
        <Text style={styles.libelleChamp}>Note</Text>
        <TextInput
          style={[styles.champ, styles.champLong]}
          value={note}
          onChangeText={setNote}
          placeholder="Marque, taille, « bio si possible »…"
          placeholderTextColor={theme.colors.textMuted}
          multiline
          accessibilityLabel="Note"
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.titreSection}>Rayon</Text>
        <View style={styles.puces}>
          {rayonsOrdonnes.map((r) => {
            const actif = r.id === rayonId;
            return (
              <Pressable
                key={r.id}
                onPress={() => setRayonId(r.id)}
                style={[styles.puce, actif && styles.puceActive]}
                accessibilityRole="radio"
                accessibilityState={{ selected: actif }}
              >
                <Ionicons name={r.icone as any} size={15} color={actif ? theme.colors.background : theme.colors.accent} />
                <Text style={[styles.puceTexte, actif && styles.puceTexteActive]}>{r.nom}</Text>
              </Pressable>
            );
          })}
        </View>
        {liste && foyer && liste.foyer_id === foyer.id && (
          <Text style={styles.aide}>Le rayon choisi est retenu pour ce produit, pour tout le foyer.</Text>
        )}
      </View>

      {autresListes.length > 1 && (
        <View style={styles.section}>
          <Text style={styles.titreSection}>Liste</Text>
          <View style={styles.puces}>
            {autresListes.map((l) => {
              const actif = l.id === destination;
              return (
                <Pressable
                  key={l.id}
                  onPress={() => setDestination(l.id)}
                  style={[styles.puce, actif && styles.puceActive]}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: actif }}
                >
                  <Ionicons name={l.icone as any} size={15} color={actif ? theme.colors.background : theme.colors.accent} />
                  <Text style={[styles.puceTexte, actif && styles.puceTexteActive]}>{l.nom}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      )}

      {citePar.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.titreSection}>Cité par</Text>
          {citePar.map((c) => (
            <Text key={c.id} style={styles.aide}>
              {c.recette_titre} · {Number(c.parts_utilisees)} part{Number(c.parts_utilisees) > 1 ? 's' : ''}
              {c.quantite != null ? ` · ${String(Number(c.quantite)).replace('.', ',')}${c.unite ? ` ${c.unite}` : ''}` : ''}
            </Text>
          ))}
        </View>
      )}

      {article.ajoute_par && (
        <View style={styles.auteur}>
          <Avatar utilisateurId={article.ajoute_par} prenom={auteur?.prenom} taille={28} />
          <Text style={styles.aide}>
            Ajouté par {auteur?.prenom ?? 'quelqu’un'} {formaterDateHeure(article.ajoute_le)}
          </Text>
        </View>
      )}

      {message && <Text style={styles.erreur}>{message}</Text>}
      <Bouton titre="Enregistrer" onPress={enregistrer} enCours={enCours === 'enregistrer'} />
      <Bouton variante="contour" titre="Retirer de la liste" onPress={supprimer} enCours={enCours === 'supprimer'} />
    </ScrollView>
  );
}

const styles = creerStylesThemes(() => ({
  flex: { flex: 1, backgroundColor: theme.colors.background },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: theme.spacing.md, padding: theme.spacing.lg, backgroundColor: theme.colors.background },
  contenu: { padding: theme.spacing.md, gap: theme.spacing.md, paddingBottom: theme.spacing.xl },
  section: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radii.lg,
    padding: theme.spacing.md,
    gap: theme.spacing.xs,
  },
  titreSection: { fontFamily: theme.fontBodyBold, fontSize: 16, color: theme.colors.text, marginBottom: 4 },
  libelleChamp: { fontFamily: theme.fontBodyBold, fontSize: 13, color: theme.colors.textMuted, marginTop: 4 },
  champ: {
    minHeight: 44,
    backgroundColor: theme.colors.background,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radii.md,
    paddingHorizontal: theme.spacing.sm,
    color: theme.colors.text,
    fontFamily: theme.fontBody,
    fontSize: 16,
  },
  champLong: { minHeight: 64, paddingTop: 10, textAlignVertical: 'top' },
  ligne: { flexDirection: 'row', gap: theme.spacing.sm },
  demi: { flex: 1 },
  puces: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  puce: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minHeight: 36,
    paddingHorizontal: theme.spacing.sm,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.background,
  },
  puceActive: { backgroundColor: theme.colors.accent, borderColor: theme.colors.accent },
  puceTexte: { fontFamily: theme.fontBody, fontSize: 14, color: theme.colors.text },
  puceTexteActive: { color: theme.colors.background, fontFamily: theme.fontBodyBold },
  auteur: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
  aide: { fontFamily: theme.fontBody, fontSize: 13, color: theme.colors.textMuted, flexShrink: 1 },
  erreur: { fontFamily: theme.fontBody, fontSize: 14, color: theme.colors.warning },
}));
