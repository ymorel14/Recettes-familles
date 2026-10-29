import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Image,
  ActivityIndicator,
  TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Avatar } from '@apps-famille/famille';
import { useFocusEffect } from '@react-navigation/native';
import { theme, creerStylesThemes } from '../theme/theme';
import { useAuth } from '../contexts/AuthContext';
import { ID_SANS_CATEGORIE, listerRecettes, surChangementSuppressions, type PorteeRecettes } from '../services/recettes';
import { normaliserTexte } from '../utils/texte';
import { libelleRecetteEnCours, useRecettesEnCours } from '../hooks/useRecettesEnCours';
import { InterrupteurFamilles, useInclureFamilles } from '../../../composants/InterrupteurFamilles';
import { supabase } from '../services/supabase';
import type { RecetteComplete } from '../types/models';
import {
  useGroupesCategories,
  ID_A_CLASSER,
  NOM_A_CLASSER,
  groupeDeCategorie,
  type IdGroupeAffiche,
} from '../services/categories';
import { useGrilleVignettes } from '../utils/grilleVignettes';
import ChoixGroupeModal from '../components/ChoixGroupeModal';

type CategorieApercu = {
  id: string;
  nom: string;
  photoUrl: string | null;
};

type SectionGroupe = {
  id: IdGroupeAffiche;
  nom: string;
  description: string;
  categories: CategorieApercu[];
};

// Écran d'accueil "Recettes" — une section par GROUPE de catégories
// (Apéritifs & Entrées, Plats principaux, Desserts…) : le nom du groupe en
// titre, puis les vignettes de ses catégories en dessous (chacune illustrée
// par une photo d'une de ses recettes). Toucher une vignette ouvre les
// recettes de la catégorie (RecettesCategorieScreen) ; un appui long permet
// de la ranger dans un autre groupe.
// Seuls les groupes qui contiennent des recettes sont affichés ; la section
// "À classer" (catégories sans groupe) vient en dernier.
export default function CategoriesScreen({ navigation }: any) {
  const { foyer, foyersFamille } = useAuth();
  const [recettes, setRecettes] = useState<RecetteComplete[]>([]);
  // Recettes de notre foyer seulement, ou aussi celles de toutes nos
  // familles, en lecture seule (interrupteur, retour de test R-2).
  const [inclureFamilles, setInclureFamilles] = useInclureFamilles('recettes');
  const portee: PorteeRecettes = inclureFamilles ? 'famille' : 'foyer';
  const [chargement, setChargement] = useState(true);
  // Nombre de colonnes et taille des vignettes adaptés à la largeur de
  // l'écran (voir utils/grilleVignettes.ts).
  const { largeurVignette, taillePolice } = useGrilleVignettes();
  // Groupes lus dans la base : un groupe ajouté dans Supabase apparaît ici.
  const { groupes, recharger: rechargerGroupes } = useGroupesCategories();
  // Recherche (retour de test R-3) : titre, ingrédients et catégories,
  // sans tenir compte des accents ni des majuscules.
  const [recherche, setRecherche] = useState('');
  // Recettes commencées dans le mode assistant (bandeau « Reprendre », R-14).
  const recettesEnCours = useRecettesEnCours();
  const [categorieARanger, setCategorieARanger] = useState<
    { id: string; nom: string; groupeActuel: string } | null
  >(null);

  const charger = useCallback(() => {
    if (!foyer) return;
    listerRecettes(foyer.id, portee, foyersFamille)
      .then(setRecettes)
      .finally(() => setChargement(false));
  }, [foyer, portee, foyersFamille]);

  // Recharge à chaque retour sur l'écran (ex. après création d'une recette).
  useFocusEffect(
    useCallback(() => {
      charger();
      rechargerGroupes();
    }, [charger, rechargerGroupes])
  );
  // … et après une suppression programmée ou annulée (« Annuler »).
  useEffect(() => surChangementSuppressions(charger), [charger]);

  // Synchronisation temps réel entre appareils du foyer (§9). Le nom du
  // canal inclut un suffixe aléatoire à chaque montage : avec un nom fixe,
  // un canal encore en cours de fermeture (rechargement à chaud en dev,
  // ou remontage rapide de l'écran) pouvait être réutilisé tel quel par
  // Supabase pour ce nouvel appel à `.channel()`, déjà abonné — et
  // `.on()` lève alors "cannot add postgres_changes callbacks (...) after
  // subscribe()". Un nom unique élimine ce risque de collision.
  useEffect(() => {
    if (!foyer) return;
    const canal = supabase
      .channel(`recettes-foyer-${foyer.id}-${Math.random().toString(36).slice(2, 10)}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'recettes', table: 'recettes', filter: `foyer_id=eq.${foyer.id}` },
        () => charger()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(canal);
    };
  }, [foyer, charger]);

  // Catégories regroupées par groupe, chacune illustrée par la première de
  // ses recettes qui a une photo.
  const sections = useMemo(() => {
    const parGroupe = new Map<IdGroupeAffiche, Map<string, CategorieApercu>>();
    recettes.forEach((recette) => {
      recette.categories.forEach((categorie) => {
        const idGroupe = groupeDeCategorie(categorie);
        if (!parGroupe.has(idGroupe)) parGroupe.set(idGroupe, new Map());
        const categoriesDuGroupe = parGroupe.get(idGroupe)!;
        const existante = categoriesDuGroupe.get(categorie.id);
        if (!existante) {
          categoriesDuGroupe.set(categorie.id, {
            id: categorie.id,
            nom: categorie.nom,
            photoUrl: recette.photo_url,
          });
        } else if (!existante.photoUrl && recette.photo_url) {
          existante.photoUrl = recette.photo_url;
        }
      });
    });
    const trier = (m?: Map<string, CategorieApercu>) =>
      Array.from(m?.values() ?? []).sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));

    const resultat: SectionGroupe[] = groupes.map((g) => ({
      id: g.id,
      nom: g.nom,
      description: g.description,
      categories: trier(parGroupe.get(g.id)),
    }));
    resultat.push({
      id: ID_A_CLASSER,
      nom: NOM_A_CLASSER,
      description: 'Appui long sur une catégorie pour choisir son groupe.',
      categories: trier(parGroupe.get(ID_A_CLASSER)),
    });
    // Recettes sans aucune catégorie (enregistrement interrompu…) : une
    // vignette à part, pour qu'elles restent accessibles.
    const sansCategorie = recettes.filter((r) => r.categories.length === 0);
    if (sansCategorie.length > 0) {
      resultat.push({
        id: ID_SANS_CATEGORIE as IdGroupeAffiche,
        nom: 'Sans catégorie',
        description: 'L’assistant peut les ranger pour vous, ou ouvrez une recette et choisissez sa catégorie avec « Modifier ».',
        categories: [
          {
            id: ID_SANS_CATEGORIE,
            nom: `Sans catégorie (${sansCategorie.length})`,
            photoUrl: sansCategorie.find((r) => r.photo_url)?.photo_url ?? null,
          },
        ],
      });
    }
    return resultat.filter((section) => section.categories.length > 0);
  }, [recettes, groupes]);

  // Résultats de la recherche : chaque mot tapé doit se retrouver dans le
  // titre, un ingrédient ou une catégorie.
  const resultats = useMemo(() => {
    const mots = normaliserTexte(recherche).split(/\s+/).filter(Boolean);
    if (mots.length === 0) return null;
    return recettes
      .map((recette) => {
        const titre = normaliserTexte(recette.titre);
        const categories = recette.categories.map((c) => normaliserTexte(c.nom));
        const ingredients = recette.ingredients.map((i) => normaliserTexte(i.libelle));
        const tout = [titre, ...categories, ...ingredients].join(' ');
        if (!mots.every((m) => tout.includes(m))) return null;
        // Pour expliquer pourquoi la recette sort : un ingrédient trouvé.
        const ingredientTrouve = mots.some((m) => titre.includes(m))
          ? null
          : recette.ingredients.find((i) => mots.some((m) => normaliserTexte(i.libelle).includes(m)))?.libelle ?? null;
        return { recette, ingredientTrouve, dansTitre: mots.every((m) => titre.includes(m)) };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null)
      .sort((a, b) => Number(b.dansTitre) - Number(a.dansTitre) || a.recette.titre.localeCompare(b.recette.titre, 'fr'));
  }, [recherche, recettes]);

  return (
    <View style={styles.container}>
      <View style={styles.enTete}>
        <Text style={styles.titre}>Nos recettes</Text>
        {/* Ajouter une recette (écrire, photo, lien, My Recipe Box) : par le
            ⊕ de la barre du bas (retour de test R-1). */}
      </View>

      <View style={styles.choixPortee}>
        <InterrupteurFamilles
          libelle="Inclure les recettes de nos familles"
          valeur={inclureFamilles}
          onChange={setInclureFamilles}
        />
      </View>

      <View style={styles.champRecherche}>
        <Ionicons name="search-outline" size={18} color={theme.colors.textMuted} />
        <TextInput
          style={styles.champRechercheTexte}
          value={recherche}
          onChangeText={setRecherche}
          placeholder="Rechercher une recette, un ingrédient…"
          placeholderTextColor={theme.colors.textMuted}
          returnKeyType="search"
          autoCorrect={false}
          accessibilityLabel="Rechercher dans les recettes"
        />
        {recherche ? (
          <Pressable onPress={() => setRecherche('')} hitSlop={8} accessibilityRole="button" accessibilityLabel="Effacer la recherche">
            <Ionicons name="close-circle" size={18} color={theme.colors.textMuted} />
          </Pressable>
        ) : null}
      </View>

      {!resultats &&
        recettesEnCours.map((r) => (
          <Pressable
            key={r.recetteId}
            style={styles.bandeauReprendre}
            onPress={() => navigation.navigate('AssistantRecette', { recetteId: r.recetteId })}
            accessibilityRole="button"
            accessibilityLabel={`Reprendre ${r.titre}, ${libelleRecetteEnCours(r)}`}
          >
            {r.photoUrl ? <Image source={{ uri: r.photoUrl }} style={styles.bandeauReprendreImage} /> : null}
            <View style={styles.bandeauReprendreTextes}>
              <Text style={styles.bandeauReprendreTitre} numberOfLines={1}>
                Reprendre · {r.titre}
              </Text>
              <Text style={styles.bandeauReprendreDetail}>{libelleRecetteEnCours(r)}</Text>
            </View>
            <Ionicons name="play-circle" size={28} color={theme.colors.accent} />
          </Pressable>
        ))}

      {chargement ? (
        <ActivityIndicator color={theme.colors.accent} style={{ marginTop: theme.spacing.lg }} />
      ) : resultats ? (
        <ScrollView contentContainerStyle={styles.grille} keyboardShouldPersistTaps="handled">
          <Text style={styles.nbResultats}>
            {resultats.length === 0
              ? 'Aucune recette trouvée.'
              : `${resultats.length} recette${resultats.length > 1 ? 's' : ''}`}
          </Text>
          {resultats.map(({ recette, ingredientTrouve }) => (
            <Pressable
              key={recette.id}
              style={styles.ligneResultat}
              onPress={() => navigation.navigate('DetailRecette', { recetteId: recette.id })}
            >
              {recette.photo_url ? (
                <Image source={{ uri: recette.photo_url }} style={styles.miniature} />
              ) : (
                <View style={[styles.miniature, styles.imageVide]} />
              )}
              <View style={styles.ligneResultatTextes}>
                <Text style={styles.ligneResultatTitre} numberOfLines={1}>
                  {recette.titre}
                </Text>
                <Text style={styles.ligneResultatDetail} numberOfLines={1}>
                  {ingredientTrouve
                    ? `Avec : ${ingredientTrouve}`
                    : recette.categories.map((c) => c.nom).join(' · ')}
                </Text>
              </View>
              {recette.cree_par ? <Avatar utilisateurId={recette.cree_par} taille={28} /> : null}
            </Pressable>
          ))}
        </ScrollView>
      ) : (
        <ScrollView contentContainerStyle={styles.grille}>
          {sections.length === 0 && <Text style={styles.vide}>Aucune recette pour l'instant.</Text>}
          {sections.map((section) => (
            <View key={section.id} style={styles.section}>
              <Text style={styles.titreSection}>{section.nom}</Text>
              {section.description ? (
                <Text style={styles.descriptionSection}>{section.description}</Text>
              ) : null}
              <View style={styles.vignettes}>
                {section.categories.map((item) => (
                  <Pressable
                    key={item.id}
                    style={[styles.carte, { width: largeurVignette }]}
                    onPress={() =>
                      navigation.navigate('RecettesCategorie', {
                        categorieId: item.id,
                        categorieNom: item.nom,
                        portee,
                      })
                    }
                    onLongPress={() =>
                      item.id !== ID_SANS_CATEGORIE &&
                      setCategorieARanger({ id: item.id, nom: item.nom, groupeActuel: section.id })
                    }
                    delayLongPress={400}
                  >
                    {item.photoUrl ? (
                      <Image source={{ uri: item.photoUrl }} style={styles.image} />
                    ) : (
                      <View style={[styles.image, styles.imageVide]} />
                    )}
                    <View style={styles.etiquette}>
                      <Text style={[styles.nomCategorie, { fontSize: taillePolice }]} numberOfLines={1}>
                        {item.nom}
                      </Text>
                    </View>
                  </Pressable>
                ))}
              </View>
              {section.id === (ID_SANS_CATEGORIE as IdGroupeAffiche) ? (
                // Classement automatique (retour de test R-4).
                <Pressable
                  style={styles.boutonClasser}
                  onPress={() => navigation.navigate('ClassementRecettes')}
                  accessibilityRole="button"
                >
                  <Ionicons name="sparkles-outline" size={18} color={theme.colors.accent} />
                  <Text style={styles.boutonClasserTexte}>Classer automatiquement</Text>
                </Pressable>
              ) : null}
            </View>
          ))}
        </ScrollView>
      )}

      <ChoixGroupeModal
        categorie={categorieARanger}
        onFermer={() => setCategorieARanger(null)}
        onClassee={() => {
          setCategorieARanger(null);
          charger();
        }}
      />
    </View>
  );
}

const styles = creerStylesThemes(() => ({
  container: { flex: 1, backgroundColor: theme.colors.background, padding: theme.spacing.md },
  enTete: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.md,
  },
  titre: { fontFamily: theme.fontTitle, fontSize: 26, color: theme.colors.accent },
  grille: { paddingBottom: theme.spacing.xl },
  boutonClasser: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    marginTop: theme.spacing.sm,
    borderColor: theme.colors.accent,
    borderWidth: 1,
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: theme.spacing.md,
  },
  boutonClasserTexte: { fontFamily: theme.fontBodyBold, fontSize: 14, color: theme.colors.accent },
  champRecherche: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radii.lg,
    paddingHorizontal: theme.spacing.sm,
    minHeight: 44,
    marginBottom: theme.spacing.sm,
  },
  champRechercheTexte: { flex: 1, fontFamily: theme.fontBody, fontSize: 16, color: theme.colors.text, paddingVertical: 8 },
  nbResultats: { fontFamily: theme.fontBody, fontSize: 13, color: theme.colors.textMuted, marginBottom: theme.spacing.sm },
  ligneResultat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    borderBottomColor: theme.colors.border,
    borderBottomWidth: 1,
  },
  miniature: { width: 52, height: 52, borderRadius: theme.radii.sm },
  ligneResultatTextes: { flex: 1, gap: 2 },
  ligneResultatTitre: { fontFamily: theme.fontBodyBold, fontSize: 16, color: theme.colors.text },
  ligneResultatDetail: { fontFamily: theme.fontBody, fontSize: 13, color: theme.colors.textMuted },
  bandeauReprendre: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    backgroundColor: theme.colors.selectionTransparent,
    borderColor: theme.colors.accent,
    borderWidth: 1,
    borderRadius: theme.radii.md,
    padding: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
  },
  bandeauReprendreImage: { width: 40, height: 40, borderRadius: theme.radii.sm },
  bandeauReprendreTextes: { flex: 1, gap: 2 },
  bandeauReprendreTitre: { fontFamily: theme.fontBodyBold, fontSize: 15, color: theme.colors.text },
  bandeauReprendreDetail: { fontFamily: theme.fontBody, fontSize: 13, color: theme.colors.accent },
  section: { marginBottom: theme.spacing.lg },
  choixPortee: { marginBottom: theme.spacing.sm },
  titreSection: {
    fontFamily: theme.fontTitle,
    fontSize: 19,
    color: theme.colors.accent,
    marginBottom: theme.spacing.xs,
  },
  descriptionSection: {
    fontFamily: theme.fontBody,
    fontSize: 13,
    fontStyle: 'italic',
    color: theme.colors.textMuted,
    marginBottom: theme.spacing.sm,
  },
  vignettes: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm },
  vide: { fontFamily: theme.fontBody, color: theme.colors.textMuted, textAlign: 'center', marginTop: theme.spacing.lg },
  carte: {
    // Largeur fixe (calculée dans le composant) plutôt que `flex: 1` : sinon
    // la dernière vignette d'une ligne incomplète s'étirerait pour occuper
    // toute la largeur restante (voir RecettesCategorieScreen).
    aspectRatio: 1,
    borderRadius: theme.radii.md,
    overflow: 'hidden',
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: 1,
  },
  image: { width: '100%', height: '100%' },
  imageVide: { backgroundColor: theme.colors.surface },
  etiquette: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: theme.colors.voile,
    paddingVertical: 4,
    paddingHorizontal: theme.spacing.xs,
  },
  nomCategorie: { fontFamily: theme.fontBodyBold, fontSize: 11, color: theme.colors.text },
}));
