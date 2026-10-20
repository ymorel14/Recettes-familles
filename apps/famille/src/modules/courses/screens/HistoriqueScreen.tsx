import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Avatar } from '@apps-famille/famille';
import { theme, creerStylesThemes } from '../theme/theme';
import { useAuth } from '../contexts/AuthContext';
import { Bouton, Chargement } from '../components/ui';
import { useListe } from '../hooks/useListe';
import { ajouterArticle, listerPassages, type Passage } from '../services/courses';
import { formaterQuantite } from '../services/saisie';
import { formaterDateHeure } from '../utils/dates';

// Historique : les courses terminées avec cette liste (date, qui les a
// faites, ce qui a été acheté), avec « Remettre sur la liste ». Réservé au
// foyer de la liste.
export default function HistoriqueScreen({ route, navigation }: any) {
  const listeId: string = route.params.listeId;
  const { foyer } = useAuth();
  const { liste, articles, setArticles, produits, parUtilisateur } = useListe(listeId);
  const [passages, setPassages] = useState<Passage[] | null>(null);
  const [ouvert, setOuvert] = useState<string | null>(null);
  const [enCours, setEnCours] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const charger = useCallback(async () => {
    try {
      const p = await listerPassages(listeId);
      setPassages(p);
      setOuvert((o) => o ?? p[0]?.id ?? null);
    } catch {
      setPassages((p) => p ?? []);
      setMessage('Chargement impossible. Vérifiez votre connexion.');
    }
  }, [listeId]);

  useFocusEffect(
    useCallback(() => {
      charger();
    }, [charger])
  );

  useEffect(() => {
    navigation.setOptions({ title: liste ? `Historique · ${liste.nom}` : 'Historique' });
  }, [navigation, liste]);

  const remettre = async (p: Passage) => {
    setEnCours(p.id);
    setMessage(null);
    try {
      let actuels = articles;
      let n = 0;
      for (const a of p.articles) {
        const { article, fusionne } = await ajouterArticle(listeId, { libelle: a.libelle, quantite: a.quantite, unite: a.unite }, produits, actuels);
        actuels = fusionne ? actuels.map((x) => (x.id === article.id ? article : x)) : [...actuels, article];
        if (!fusionne) n++;
      }
      setArticles(actuels);
      setMessage(`${n} article${n > 1 ? 's' : ''} remis sur la liste.`);
    } catch {
      setMessage('Impossible de tout remettre (réseau ?).');
    } finally {
      setEnCours(null);
    }
  };

  if (passages === null) return <Chargement />;
  if (liste && foyer && liste.foyer_id !== foyer.id) {
    return (
      <View style={styles.centre}>
        <Text style={styles.aide}>L’historique est réservé au foyer de la liste.</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.contenu}>
      {message && <Text style={styles.message}>{message}</Text>}
      {passages.length === 0 && (
        <View style={styles.centreBloc}>
          <Ionicons name="time-outline" size={40} color={theme.colors.textMuted} />
          <Text style={styles.aide}>Aucune course terminée pour l’instant. Elles apparaîtront ici après « Terminer les courses ».</Text>
        </View>
      )}
      {passages.map((p) => {
        const qui = p.termine_par ? parUtilisateur.get(p.termine_par) : undefined;
        const estOuvert = ouvert === p.id;
        return (
          <View key={p.id} style={styles.carte}>
            <Pressable
              onPress={() => setOuvert(estOuvert ? null : p.id)}
              style={styles.entete}
              accessibilityRole="button"
              accessibilityState={{ expanded: estOuvert }}
            >
              {p.termine_par && <Avatar utilisateurId={p.termine_par} prenom={qui?.prenom} taille={30} />}
              <View style={styles.textes}>
                <Text style={styles.date}>{formaterDateHeure(p.termine_le)}</Text>
                <Text style={styles.aideGauche}>
                  {p.articles.length} article{p.articles.length > 1 ? 's' : ''}
                  {qui ? ` · par ${qui.prenom}` : ''}
                </Text>
              </View>
              <Ionicons name={estOuvert ? 'chevron-up' : 'chevron-down'} size={20} color={theme.colors.textMuted} />
            </Pressable>
            {estOuvert && (
              <View style={styles.detail}>
                {p.articles.map((a, i) => {
                  const q = formaterQuantite(a.quantite, a.unite);
                  return (
                    <Text key={`${a.libelle}-${i}`} style={styles.article}>
                      {a.libelle}
                      {q ? <Text style={styles.quantite}>{`  ${q}`}</Text> : null}
                    </Text>
                  );
                })}
                <Bouton variante="contour" titre="Remettre ces articles sur la liste" onPress={() => remettre(p)} enCours={enCours === p.id} />
              </View>
            )}
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = creerStylesThemes(() => ({
  flex: { flex: 1, backgroundColor: theme.colors.background },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: theme.spacing.lg, backgroundColor: theme.colors.background },
  centreBloc: { alignItems: 'center', gap: theme.spacing.sm, paddingTop: theme.spacing.xl },
  contenu: { padding: theme.spacing.md, gap: theme.spacing.sm, paddingBottom: theme.spacing.xl },
  carte: { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, borderWidth: 1, borderRadius: theme.radii.lg, overflow: 'hidden' },
  entete: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, padding: theme.spacing.md, minHeight: 60 },
  textes: { flex: 1, gap: 2 },
  date: { fontFamily: theme.fontBodyBold, fontSize: 16, color: theme.colors.text },
  detail: { paddingHorizontal: theme.spacing.md, paddingBottom: theme.spacing.md, gap: 4 },
  article: { fontFamily: theme.fontBody, fontSize: 15, color: theme.colors.text },
  quantite: { color: theme.colors.accent },
  aide: { fontFamily: theme.fontBody, fontSize: 14, color: theme.colors.textMuted, textAlign: 'center' },
  aideGauche: { fontFamily: theme.fontBody, fontSize: 13, color: theme.colors.textMuted },
  message: { fontFamily: theme.fontBody, fontSize: 14, color: theme.colors.text },
}));
