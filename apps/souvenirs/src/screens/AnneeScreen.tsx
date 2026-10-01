import React, { useCallback, useLayoutEffect, useMemo, useState } from 'react';
import { View, Text, SectionList, Pressable } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { theme, creerStylesThemes } from '../theme/theme';
import { useAuth } from '../contexts/AuthContext';
import { useFamilleDonnees } from '../contexts/FamilleDonneesContext';
import { extraireMessageErreur } from '@apps-famille/famille';
import { listerSouvenirs, type CarteSouvenir as Carte } from '../services/souvenirs';
import CarteSouvenir from '../components/CarteSouvenir';
import { useAdresses } from '../components/medias';
import Filtres, { AUCUN_FILTRE, appliquerFiltres, type FiltresActifs } from '../components/Filtres';
import { Chargement, MessageVide } from '../components/ui';
import { anneeDe, MOIS } from '../utils/dates';
import { SANS_DATE } from './SouvenirsScreen';

const DANS_L_ANNEE = 'Au fil de l’année';

function majuscule(t: string): string {
  return t.charAt(0).toUpperCase() + t.slice(1);
}

// Une année : ses souvenirs de janvier à décembre, regroupés par mois (ceux
// datés seulement de l'année viennent en tête). Flèches pour passer à
// l'année précédente ou suivante.
export default function AnneeScreen({ route, navigation }: any) {
  const { famille } = useAuth();
  const { categorie, lignePrenoms, completer } = useFamilleDonnees();
  const [annee, setAnnee] = useState<string>(route.params.annee);
  const [filtres, setFiltres] = useState<FiltresActifs>(route.params.filtres ?? AUCUN_FILTRE);
  const [tous, setTous] = useState<Carte[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  const charger = useCallback(async () => {
    if (!famille) return;
    try {
      const liste = await listerSouvenirs(famille.id);
      setTous(liste);
      completer(liste.flatMap((s) => s.personnes.map((p) => p.personne_id))).catch(() => {});
    } catch (e) {
      setErreur(extraireMessageErreur(e, 'Impossible de charger les souvenirs.'));
      setTous((t) => t ?? []);
    }
  }, [famille?.id, completer]);

  useFocusEffect(
    useCallback(() => {
      charger();
    }, [charger])
  );

  useLayoutEffect(() => {
    navigation.setOptions({ title: annee });
  }, [navigation, annee]);

  const filtres_ = useMemo(() => appliquerFiltres(tous ?? [], filtres), [tous, filtres]);

  // Années disponibles (avec les filtres), de la plus ancienne à la plus récente.
  const annees = useMemo(
    () => Array.from(new Set(filtres_.map((s) => anneeDe(s.date_debut)))).filter((a) => a !== SANS_DATE).sort(),
    [filtres_]
  );
  const index = annees.indexOf(annee);
  const precedente = index > 0 ? annees[index - 1] : null;
  const suivante = index >= 0 && index < annees.length - 1 ? annees[index + 1] : null;

  const deLAnnee = useMemo(() => filtres_.filter((s) => anneeDe(s.date_debut) === annee), [filtres_, annee]);

  const sections = useMemo(() => {
    if (annee === SANS_DATE) return deLAnnee.length ? [{ title: SANS_DATE, data: deLAnnee }] : [];
    const groupes = new Map<string, Carte[]>();
    const ordre: string[] = [DANS_L_ANNEE, ...MOIS.map(majuscule)];
    [...deLAnnee]
      .sort((a, b) => (a.date_debut ?? '').localeCompare(b.date_debut ?? '') || a.cree_le.localeCompare(b.cree_le))
      .forEach((s) => {
        const cle =
          s.precision_date === 'annee' || s.precision_date === 'environ' || !s.date_debut
            ? DANS_L_ANNEE
            : majuscule(MOIS[Number(s.date_debut.slice(5, 7)) - 1]);
        groupes.set(cle, [...(groupes.get(cle) ?? []), s]);
      });
    return ordre.filter((c) => groupes.has(c)).map((c) => ({ title: c, data: groupes.get(c)! }));
  }, [deLAnnee, annee]);

  const adresses = useAdresses(deLAnnee.map((s) => s.couverture));

  if (!tous) return <Chargement />;

  return (
    <SectionList
      style={styles.flex}
      contentContainerStyle={styles.contenu}
      sections={sections}
      keyExtractor={(s) => s.id}
      stickySectionHeadersEnabled={false}
      ListHeaderComponent={
        <View style={styles.entete}>
          <View style={styles.navigation}>
            <Pressable
              onPress={() => precedente && setAnnee(precedente)}
              disabled={!precedente}
              style={[styles.fleche, !precedente && styles.inactif]}
              accessibilityRole="button"
              accessibilityLabel={precedente ? `Année précédente : ${precedente}` : 'Pas d’année précédente'}
            >
              <Ionicons name="chevron-back" size={18} color={theme.colors.accent} />
              <Text style={styles.flecheTexte}>{precedente ?? ''}</Text>
            </Pressable>
            <View style={styles.centre}>
              <Text style={styles.titre}>{annee}</Text>
              <Text style={styles.compte}>
                {deLAnnee.length} souvenir{deLAnnee.length > 1 ? 's' : ''}
              </Text>
            </View>
            <Pressable
              onPress={() => suivante && setAnnee(suivante)}
              disabled={!suivante}
              style={[styles.fleche, styles.flecheDroite, !suivante && styles.inactif]}
              accessibilityRole="button"
              accessibilityLabel={suivante ? `Année suivante : ${suivante}` : 'Pas d’année suivante'}
            >
              <Text style={styles.flecheTexte}>{suivante ?? ''}</Text>
              <Ionicons name="chevron-forward" size={18} color={theme.colors.accent} />
            </Pressable>
          </View>
          <Filtres souvenirs={(tous ?? []).filter((s) => anneeDe(s.date_debut) === annee)} valeur={filtres} onChange={setFiltres} />
          {erreur && <Text style={styles.erreur}>{erreur}</Text>}
        </View>
      }
      renderSectionHeader={({ section }) => (
        <Text style={styles.mois}>
          {section.title}
          <Text style={styles.moisCompte}>  {section.data.length}</Text>
        </Text>
      )}
      ItemSeparatorComponent={() => <View style={{ height: theme.spacing.sm }} />}
      renderItem={({ item }) => (
        <CarteSouvenir
          titre={item.titre}
          categorie={categorie(item.categorie)}
          dateDebut={item.date_debut}
          dateFin={item.date_fin}
          precision={item.precision_date}
          lieu={item.lieu}
          prenoms={lignePrenoms(item.personnes, item.autres_personnes)}
          adresseCouverture={item.couverture ? adresses[item.couverture] : null}
          nbMedias={item.nb_medias}
          onPress={() => navigation.navigate('Souvenir', { id: item.id })}
        />
      )}
      ListEmptyComponent={<MessageVide titre="Aucun souvenir cette année" texte={filtres.categorie || filtres.personne ? 'Essayez sans filtre.' : undefined} />}
    />
  );
}

const styles = creerStylesThemes(() => ({
  flex: { flex: 1, backgroundColor: theme.colors.background },
  contenu: { padding: theme.spacing.md, paddingBottom: theme.spacing.xl },
  entete: { gap: theme.spacing.sm, marginBottom: theme.spacing.xs },
  navigation: { flexDirection: 'row', alignItems: 'center' },
  fleche: { flexDirection: 'row', alignItems: 'center', gap: 2, minWidth: 80, minHeight: 44 },
  flecheDroite: { justifyContent: 'flex-end' },
  flecheTexte: { fontFamily: theme.fontBodyBold, fontSize: 15, color: theme.colors.accent },
  inactif: { opacity: 0.3 },
  centre: { flex: 1, alignItems: 'center' },
  titre: { fontFamily: theme.fontTitle, fontSize: 34, color: theme.colors.accent },
  compte: { fontFamily: theme.fontBody, fontSize: 14, color: theme.colors.textMuted },
  mois: {
    fontFamily: theme.fontManuscrit,
    fontSize: 19,
    color: theme.colors.text,
    marginTop: theme.spacing.md,
    marginBottom: theme.spacing.sm,
  },
  moisCompte: { fontFamily: theme.fontBody, fontSize: 13, color: theme.colors.textMuted },
  erreur: { fontFamily: theme.fontBody, fontSize: 14, color: theme.colors.warning },
}));
