import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  Image,
  ActivityIndicator,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { theme, creerStylesThemes } from '../../theme/theme';
import { useAuth } from '../../contexts/AuthContext';
import {
  ID_SANS_CATEGORIE,
  listerRecettes,
  etatSurprise,
  surChangementSuppressions,
  programmerSuppressionRecette,
  annulerSuppressionRecette,
  type PorteeRecettes,
} from '../../services/recettes';
import { ajouterCategories, remplacerCategories, retirerCategories } from '../../services/classement';
import { useEnvoiCourses } from '../../hooks/useEnvoiCourses';
import FeuilleCategoriesMasse, { type ActionCategories } from '../../components/FeuilleCategoriesMasse';
import { Avatar } from '@apps-famille/famille';
import { Icone } from '../../../../composants/ui';
import { useToast } from '../../../../composants/Toast';
import { apresFermetureFeuille } from '../../../../navigation/navigationRef';
import { alerte } from '../../utils/alerte';
import { supabase } from '../../services/supabase';
import type { RecetteComplete } from '../../types/models';
import { useGrilleVignettes } from '../../utils/grilleVignettes';

// Plus de vignette « Ajouter » (retour de test R-15) : le ⊕ de la barre du
// bas pré-range la nouvelle recette dans la catégorie affichée.
type ElementGrille = { type: 'recette'; recette: RecetteComplete };

// Écran affichant toutes les recettes d'une catégorie choisie sur l'écran
// d'accueil (une vignette par recette, avec sa première photo enregistrée).
// Titre de l'écran défini dynamiquement dans AppNavigator via le nom de
// la catégorie reçu en paramètre.
export default function RecettesCategorieScreen({ navigation, route }: any) {
  const { categorieId, categorieNom, portee = 'foyer' } = route.params as {
    categorieId: string;
    categorieNom: string;
    portee?: PorteeRecettes;
  };
  const { foyer, foyersFamille, session } = useAuth();
  const { afficher } = useToast();
  const envoiCourses = useEnvoiCourses();
  // Sélection de plusieurs recettes (retour de test R-13) : appui long sur
  // une recette, puis on touche les autres.
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const enSelection = selection.size > 0;
  const [feuilleCategories, setFeuilleCategories] = useState(false);
  const [enCours, setEnCours] = useState(false);
  const [recettes, setRecettes] = useState<RecetteComplete[]>([]);
  const [chargement, setChargement] = useState(true);
  // Nombre de colonnes et taille des vignettes adaptés à la largeur de
  // l'écran (voir utils/grilleVignettes.ts).
  const { nbColonnes, largeurVignette, taillePolice } = useGrilleVignettes();

  const charger = useCallback(() => {
    if (!foyer) return;
    listerRecettes(foyer.id, portee, foyersFamille)
      .then(setRecettes)
      .finally(() => setChargement(false));
  }, [foyer, portee, foyersFamille]);

  // Recharge à chaque retour sur l'écran (ex. après création d'une recette).
  useFocusEffect(charger);
  // … et après une suppression programmée ou annulée (« Annuler »).
  useEffect(() => surChangementSuppressions(charger), [charger]);

  // Synchronisation temps réel entre appareils du foyer (§9). Suffixe
  // aléatoire dans le nom du canal à chaque montage, pour éviter toute
  // collision avec un canal du même nom pas encore complètement fermé
  // (voir le commentaire équivalent dans CategoriesScreen.tsx).
  useEffect(() => {
    if (!foyer) return;
    const canal = supabase
      .channel(`recettes-foyer-${foyer.id}-categorie-${categorieId}-${Math.random().toString(36).slice(2, 10)}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'recettes', table: 'recettes', filter: `foyer_id=eq.${foyer.id}` },
        () => charger()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(canal);
    };
  }, [foyer, charger, categorieId]);

  const recettesCategorie = useMemo(
    () =>
      recettes.filter((r) =>
        categorieId === ID_SANS_CATEGORIE ? r.categories.length === 0 : r.categories.some((c) => c.id === categorieId)
      ),
    [recettes, categorieId]
  );

  const elementsGrille: ElementGrille[] = useMemo(
    () => recettesCategorie.map((recette) => ({ type: 'recette' as const, recette })),
    [recettesCategorie]
  );

  const basculer = (id: string) =>
    setSelection((avant) => {
      const apres = new Set(avant);
      if (apres.has(id)) apres.delete(id);
      else apres.add(id);
      return apres;
    });

  const choisies = recettesCategorie.filter((r) => selection.has(r.id));
  // Seules les recettes de notre foyer se modifient (les autres : lecture seule).
  const modifiables = choisies.filter((r) => r.foyer_id === foyer?.id);
  const supprimables = modifiables.filter((r) => r.cree_par === session?.user.id);

  useEffect(() => {
    navigation.setOptions({
      title: enSelection ? `${selection.size} sélectionnée${selection.size > 1 ? 's' : ''}` : categorieNom ?? 'Recettes',
      headerRight: enSelection
        ? () => (
            <View style={styles.actionsEnTete}>
              <Pressable
                onPress={() =>
                  setSelection(
                    selection.size === recettesCategorie.length ? new Set() : new Set(recettesCategorie.map((r) => r.id))
                  )
                }
                hitSlop={8}
                accessibilityRole="button"
              >
                <Text style={styles.lienEnTete}>{selection.size === recettesCategorie.length ? 'Aucune' : 'Tout'}</Text>
              </Pressable>
              <Pressable onPress={() => setSelection(new Set())} hitSlop={8} accessibilityRole="button">
                <Text style={styles.lienEnTete}>Annuler</Text>
              </Pressable>
            </View>
          )
        : undefined,
    });
  }, [navigation, enSelection, selection, recettesCategorie, categorieNom]);

  const prevenirLectureSeule = () => {
    const autres = choisies.length - modifiables.length;
    if (autres > 0) afficher(`${autres} recette${autres > 1 ? 's' : ''} d’un autre foyer non modifiée${autres > 1 ? 's' : ''}.`);
  };

  const appliquerCategories = async (action: ActionCategories) => {
    const ids = modifiables.map((r) => r.id);
    setEnCours(true);
    try {
      if (action.mode === 'retirer') await retirerCategories(ids, action.ids);
      else if (action.mode === 'ajouter') await ajouterCategories(ids, action.noms);
      else await remplacerCategories(ids, action.noms);
      setFeuilleCategories(false);
      setSelection(new Set());
      afficher(`${ids.length} recette${ids.length > 1 ? 's' : ''} mise${ids.length > 1 ? 's' : ''} à jour`);
      prevenirLectureSeule();
      charger();
    } catch (e) {
      afficher(e instanceof Error ? e.message : 'Modification impossible. Réessayez.');
    } finally {
      setEnCours(false);
    }
  };

  const classer = () => {
    if (!modifiables.length) return prevenirLectureSeule();
    const ids = modifiables.map((r) => r.id);
    setSelection(new Set());
    navigation.navigate('ClassementRecettes', { recetteIds: ids });
  };

  const versCourses = () => {
    envoiCourses.envoyer(
      choisies.map((r) => ({ recette: r, partsSouhaitees: r.parts_defaut })),
      () => setSelection(new Set())
    );
  };

  const supprimer = () => {
    if (!supprimables.length) {
      afficher('Vous ne pouvez supprimer que les recettes que vous avez créées.');
      return;
    }
    const n = supprimables.length;
    const ignorees = choisies.length - n;
    alerte(
      n > 1 ? `Supprimer ${n} recettes ?` : 'Supprimer cette recette ?',
      (ignorees > 0 ? `${ignorees} autre${ignorees > 1 ? 's' : ''} (créée${ignorees > 1 ? 's' : ''} par quelqu’un d’autre) ne ${ignorees > 1 ? 'seront' : 'sera'} pas supprimée${ignorees > 1 ? 's' : ''}. ` : '') +
        'Vous pourrez annuler pendant quelques secondes.',
      [
        { text: 'Garder', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: () => {
            const ids = supprimables.map((r) => r.id);
            ids.forEach((id) => programmerSuppressionRecette(id, () => afficher('Une recette n’a pas pu être supprimée.')));
            setSelection(new Set());
            afficher(n > 1 ? `${n} recettes supprimées` : 'Recette supprimée', {
              annuler: () => ids.forEach(annulerSuppressionRecette),
            });
          },
        },
      ]
    );
  };

  return (
    <View style={styles.container}>
      {chargement ? (
        <ActivityIndicator color={theme.colors.accent} style={{ marginTop: theme.spacing.lg }} />
      ) : (
        <FlatList
          data={elementsGrille}
          keyExtractor={(item) => item.recette.id}
          // FlatList n'accepte pas un changement de numColumns à la volée :
          // la clé force un nouveau rendu si l'écran pivote.
          key={`grille-${nbColonnes}`}
          numColumns={nbColonnes}
          columnWrapperStyle={styles.ligne}
          contentContainerStyle={styles.grille}
          ListEmptyComponent={<Text style={styles.vide}>Aucune recette ici. Ajoutez-en une avec le ⊕ en bas.</Text>}
          renderItem={({ item }) => (
              <Pressable
                style={[styles.carte, { width: largeurVignette }, selection.has(item.recette.id) && styles.carteChoisie]}
                onPress={() =>
                  enSelection ? basculer(item.recette.id) : navigation.navigate('DetailRecette', { recetteId: item.recette.id })
                }
                onLongPress={() => basculer(item.recette.id)}
                delayLongPress={400}
                accessibilityState={enSelection ? { selected: selection.has(item.recette.id) } : undefined}
                // R-5 : le foyer d'une recette de la famille passe dans le libellé (l'avatar de l'auteur est sur la photo).
                accessibilityLabel={
                  item.recette.foyer_id !== foyer?.id && item.recette.foyer?.nom
                    ? `${item.recette.titre}, recette du foyer ${item.recette.foyer.nom}`
                    : item.recette.titre
                }
              >
                {item.recette.photo_url ? (
                  <Image source={{ uri: item.recette.photo_url }} style={styles.image} />
                ) : (
                  <View style={[styles.image, styles.imageVide]} />
                )}
                {enSelection ? (
                  <View style={styles.caseSelection}>
                    <Icone
                      nom={selection.has(item.recette.id) ? 'checkmark-circle' : 'ellipse-outline'}
                      taille={26}
                      couleur={selection.has(item.recette.id) ? theme.colors.accent : '#FFFFFF'}
                    />
                  </View>
                ) : null}
                {/* Qui a ajouté la recette (retour de test R-5). */}
                {item.recette.cree_par && !enSelection ? (
                  <Avatar utilisateurId={item.recette.cree_par} taille={26} style={styles.auteur} />
                ) : null}
                <View style={styles.etiquette}>
                  <Text style={[styles.nomRecette, { fontSize: taillePolice }]} numberOfLines={1}>
                    {etatSurprise(item.recette) ? <Icone nom="eye-off-outline" taille={taillePolice} couleur={theme.colors.text} /> : null}
                    {etatSurprise(item.recette) ? ' ' : ''}
                    {item.recette.titre}
                  </Text>
                </View>
              </Pressable>
          )}
        />
      )}
      {enSelection ? (
        <View style={styles.barreActions}>
          {[
            { icone: 'pricetags-outline', titre: 'Catégories', action: () => (modifiables.length ? setFeuilleCategories(true) : prevenirLectureSeule()) },
            { icone: 'sparkles-outline', titre: 'Classer', action: classer },
            { icone: 'cart-outline', titre: 'Courses', action: versCourses },
            { icone: 'trash-outline', titre: 'Supprimer', action: supprimer },
          ].map((a) => (
            <Pressable key={a.titre} style={styles.action} onPress={a.action} accessibilityRole="button" disabled={envoiCourses.enCours}>
              <Icone nom={a.icone} taille={22} couleur={a.titre === 'Supprimer' ? theme.colors.warning : theme.colors.accent} />
              <Text style={[styles.actionTexte, a.titre === 'Supprimer' && { color: theme.colors.warning }]}>{a.titre}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      <FeuilleCategoriesMasse
        visible={feuilleCategories}
        recettes={modifiables}
        enCours={enCours}
        onFermer={() => setFeuilleCategories(false)}
        onValider={appliquerCategories}
      />
      {envoiCourses.fenetre}
    </View>
  );
}

const styles = creerStylesThemes(() => ({
  container: { flex: 1, backgroundColor: theme.colors.background, padding: theme.spacing.md },
  grille: { paddingBottom: theme.spacing.xl },
  ligne: { gap: theme.spacing.sm, marginBottom: theme.spacing.sm },
  carte: {
    // Largeur fixe (calculée dans le composant, appliquée en style inline)
    // plutôt que `flex: 1` : avec `flex: 1`, la dernière vignette d'une
    // ligne incomplète s'étirait pour occuper toute la largeur restante —
    // avec une largeur fixe, chaque vignette garde la même taille, ligne
    // pleine ou non.
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
  foyerRecette: { fontFamily: theme.fontManuscrit, color: theme.colors.textMuted },
  nomRecette: { fontFamily: theme.fontBodyBold, fontSize: 11, color: theme.colors.text },
  vide: { fontFamily: theme.fontBody, color: theme.colors.textMuted, textAlign: 'center', marginTop: theme.spacing.lg },
  carteChoisie: { borderColor: theme.colors.accent, borderWidth: 3 },
  caseSelection: { position: 'absolute', top: 6, right: 6 },
  auteur: { position: 'absolute', top: 6, right: 6, borderColor: '#FFFFFF', borderWidth: 2 },
  actionsEnTete: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md },
  lienEnTete: { fontFamily: theme.fontBodyBold, fontSize: 15, color: theme.colors.accent },
  barreActions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    paddingVertical: theme.spacing.xs,
    marginHorizontal: -theme.spacing.md,
    marginBottom: -theme.spacing.md,
  },
  action: { alignItems: 'center', gap: 2, minWidth: 64, paddingVertical: 4 },
  actionTexte: { fontFamily: theme.fontBodyBold, fontSize: 12, color: theme.colors.accent },
}));
