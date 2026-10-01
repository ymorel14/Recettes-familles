import React, { useMemo, useRef, useState } from 'react';
import { View, Text, TextInput, FlatList, Pressable, ActivityIndicator, Keyboard } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { theme, creerStylesThemes } from '../theme/theme';
import { useAuth } from '../contexts/AuthContext';
import { useFamilleDonnees } from '../contexts/FamilleDonneesContext';
import { extraireMessageErreur } from '@apps-famille/famille';
import { rechercher, type ResultatRecherche } from '../services/souvenirs';
import CarteSouvenir from '../components/CarteSouvenir';
import { useAdresses } from '../components/medias';
import { MessageVide } from '../components/ui';
import { formaterAge, formaterDateSouvenir } from '../utils/dates';

// Rechercher dans les souvenirs avec une question en français : « Quand
// sommes-nous allés en Irlande ? », « Quand Sybille a-t-elle commencé à
// marcher ? ». La base (souvenirs.rechercher) ignore les petits mots et les
// accents, reconnaît les prénoms de la famille et tolère les fautes de
// frappe ; le premier résultat est la réponse la plus probable.
export default function RechercheScreen({ navigation }: any) {
  const { famille } = useAuth();
  const { categorie, personnes } = useFamilleDonnees();
  const [question, setQuestion] = useState('');
  const [resultats, setResultats] = useState<ResultatRecherche[] | null>(null);
  const [posee, setPosee] = useState('');
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const numero = useRef(0);

  const exemples = useMemo(() => {
    const enfant = personnes.find((p) => !p.utilisateur_id && p.date_naissance)?.prenom;
    return [
      'Quand sommes-nous allés en Irlande ?',
      enfant ? `Quand ${enfant} a commencé à marcher ?` : 'Premiers pas',
      enfant ? `Premiers mots de ${enfant}` : 'Premiers mots',
      'Noël 2019',
      'Mariages',
    ];
  }, [personnes]);

  const lancer = async (texte: string) => {
    const q = texte.trim();
    if (!q || !famille) return;
    Keyboard.dismiss();
    const n = ++numero.current;
    setEnCours(true);
    setErreur(null);
    try {
      const r = await rechercher(q, { familleId: famille.id, limite: 40 });
      if (n !== numero.current) return;
      setResultats(r);
      setPosee(q);
    } catch (e) {
      if (n === numero.current) setErreur(extraireMessageErreur(e, 'Recherche impossible.'));
    } finally {
      if (n === numero.current) setEnCours(false);
    }
  };

  const adresses = useAdresses((resultats ?? []).map((r) => r.couverture));

  const meilleur = resultats?.[0];
  const reponse = meilleur
    ? (() => {
        const date = formaterDateSouvenir(meilleur.date_debut, meilleur.date_fin, meilleur.precision_date);
        const principal = meilleur.personnes.find((p) => p.role === 'principal' && p.age_mois !== null);
        const age =
          principal && (meilleur.precision_date === 'jour' || meilleur.precision_date === 'mois')
            ? formaterAge(principal.age_mois)
            : null;
        return `${meilleur.titre} : ${date}${age ? ` (${principal!.prenom} avait ${age})` : ''}.`;
      })()
    : null;

  return (
    <View style={styles.flex}>
      <View style={styles.barre}>
        <Ionicons name="search" size={20} color={theme.colors.textMuted} />
        <TextInput
          style={styles.champ}
          value={question}
          onChangeText={setQuestion}
          onSubmitEditing={() => lancer(question)}
          placeholder="Posez une question ou tapez un mot"
          placeholderTextColor={theme.colors.textMuted}
          returnKeyType="search"
          accessibilityLabel="Question"
        />
        {question ? (
          <Pressable
            onPress={() => {
              setQuestion('');
              setResultats(null);
            }}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Effacer"
          >
            <Ionicons name="close-circle" size={20} color={theme.colors.textMuted} />
          </Pressable>
        ) : null}
      </View>

      {enCours && <ActivityIndicator color={theme.colors.accent} style={{ marginTop: theme.spacing.md }} />}
      {erreur && <Text style={styles.erreur}>{erreur}</Text>}

      {!resultats && !enCours ? (
        <View style={styles.exemples}>
          <Text style={styles.aide}>Par exemple :</Text>
          {exemples.map((e) => (
            <Pressable
              key={e}
              onPress={() => {
                setQuestion(e);
                lancer(e);
              }}
              style={styles.exemple}
              accessibilityRole="button"
            >
              <Ionicons name="chatbubble-ellipses-outline" size={16} color={theme.colors.accent} />
              <Text style={styles.exempleTexte}>{e}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      {resultats && !enCours ? (
        <FlatList
          data={resultats}
          keyExtractor={(r) => r.id}
          contentContainerStyle={styles.liste}
          keyboardShouldPersistTaps="handled"
          ItemSeparatorComponent={() => <View style={{ height: theme.spacing.sm }} />}
          ListHeaderComponent={
            reponse ? (
              <View style={styles.reponse}>
                <Text style={styles.reponseQuestion}>« {posee} »</Text>
                <Text style={styles.reponseTexte}>{reponse}</Text>
                {resultats.length > 1 && (
                  <Text style={styles.aide}>
                    Autres souvenirs qui pourraient correspondre ci-dessous.
                  </Text>
                )}
              </View>
            ) : null
          }
          ListEmptyComponent={
            <MessageVide
              titre="Aucun souvenir trouvé"
              texte="Essayez un autre mot (un lieu, un prénom, une année) ou vérifiez l'orthographe."
            />
          }
          renderItem={({ item }) => {
            const ages = item.personnes
              .filter((p) => p.role === 'principal')
              .map((p) => {
                const age =
                  item.precision_date === 'jour' || item.precision_date === 'mois' ? formaterAge(p.age_mois) : null;
                return age ? `${p.prenom}, ${age}` : p.prenom;
              });
            const presents = [...item.personnes.filter((p) => p.role === 'present').map((p) => p.prenom), ...item.autres_personnes];
            const prenoms = [ages.join(' · '), presents.length ? `avec ${presents.join(', ')}` : '']
              .filter(Boolean)
              .join(' · ');
            return (
              <CarteSouvenir
                titre={item.titre}
                categorie={categorie(item.categorie)}
                dateDebut={item.date_debut}
                dateFin={item.date_fin}
                precision={item.precision_date}
                lieu={item.lieu ?? item.pays}
                prenoms={prenoms || null}
                detail={item.extrait}
                adresseCouverture={item.couverture ? adresses[item.couverture] : null}
                onPress={() => navigation.navigate('Souvenir', { id: item.id })}
              />
            );
          }}
        />
      ) : null}
    </View>
  );
}

const styles = creerStylesThemes(() => ({
  flex: { flex: 1, backgroundColor: theme.colors.background },
  barre: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    margin: theme.spacing.md,
    marginBottom: 0,
    paddingHorizontal: theme.spacing.sm,
    minHeight: 48,
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: 999,
  },
  champ: { flex: 1, minHeight: 44, fontFamily: theme.fontBody, fontSize: 16, color: theme.colors.text },
  exemples: { padding: theme.spacing.md, gap: theme.spacing.xs },
  exemple: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    minHeight: 44,
    paddingHorizontal: theme.spacing.sm,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  exempleTexte: { flex: 1, fontFamily: theme.fontBody, fontSize: 15, color: theme.colors.text },
  aide: { fontFamily: theme.fontBody, fontSize: 13, color: theme.colors.textMuted },
  liste: { padding: theme.spacing.md, paddingBottom: theme.spacing.xl },
  reponse: {
    gap: 4,
    marginBottom: theme.spacing.md,
    padding: theme.spacing.md,
    borderRadius: theme.radii.lg,
    backgroundColor: theme.colors.selectionTransparent,
    borderColor: theme.colors.accent,
    borderWidth: 1,
  },
  reponseQuestion: { fontFamily: theme.fontManuscrit, fontSize: 15, color: theme.colors.textMuted },
  reponseTexte: { fontFamily: theme.fontTitle, fontSize: 19, color: theme.colors.text, lineHeight: 26 },
  erreur: { fontFamily: theme.fontBody, fontSize: 14, color: theme.colors.warning, padding: theme.spacing.md },
}));
