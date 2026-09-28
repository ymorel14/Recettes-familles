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
import { listerRecettes, type PorteeRecettes } from '../../services/recettes';
import { supabase } from '../../services/supabase';
import type { RecetteComplete } from '../../types/models';
import { useGrilleVignettes } from '../../utils/grilleVignettes';

// Élément de la grille : soit la vignette "Ajouter une recette" (toujours en
// premier), soit une vignette de recette existante.
type ElementGrille = { type: 'ajouter' } | { type: 'recette'; recette: RecetteComplete };

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
  const { foyer } = useAuth();
  const [recettes, setRecettes] = useState<RecetteComplete[]>([]);
  const [chargement, setChargement] = useState(true);
  // Nombre de colonnes et taille des vignettes adaptés à la largeur de
  // l'écran (voir utils/grilleVignettes.ts).
  const { nbColonnes, largeurVignette, taillePolice } = useGrilleVignettes();

  const charger = useCallback(() => {
    if (!foyer) return;
    listerRecettes(foyer.id, portee)
      .then(setRecettes)
      .finally(() => setChargement(false));
  }, [foyer, portee]);

  // Recharge à chaque retour sur l'écran (ex. après création d'une recette).
  useFocusEffect(charger);

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
    () => recettes.filter((r) => r.categories.some((c) => c.id === categorieId)),
    [recettes, categorieId]
  );

  // La vignette "Ajouter une recette" est toujours en première position,
  // avec la catégorie déjà présélectionnée (on est en train de la
  // parcourir) — voir RecetteFormScreen, route.params.categoriePreselectionnee.
  const elementsGrille: ElementGrille[] = useMemo(
    () => [{ type: 'ajouter' }, ...recettesCategorie.map((recette) => ({ type: 'recette' as const, recette }))],
    [recettesCategorie]
  );

  return (
    <View style={styles.container}>
      {chargement ? (
        <ActivityIndicator color={theme.colors.accent} style={{ marginTop: theme.spacing.lg }} />
      ) : (
        <FlatList
          data={elementsGrille}
          keyExtractor={(item) => (item.type === 'ajouter' ? 'ajouter' : item.recette.id)}
          // FlatList n'accepte pas un changement de numColumns à la volée :
          // la clé force un nouveau rendu si l'écran pivote.
          key={`grille-${nbColonnes}`}
          numColumns={nbColonnes}
          columnWrapperStyle={styles.ligne}
          contentContainerStyle={styles.grille}
          renderItem={({ item }) =>
            item.type === 'ajouter' ? (
              <Pressable
                style={[styles.carte, styles.carteAjouter, { width: largeurVignette }]}
                onPress={() =>
                  navigation.navigate('CreationRecette', { categoriePreselectionnee: categorieNom })
                }
              >
                <Text style={styles.carteAjouterSigne}>+</Text>
                <Text style={[styles.carteAjouterTexte, { fontSize: taillePolice }]}>Ajouter</Text>
              </Pressable>
            ) : (
              <Pressable
                style={[styles.carte, { width: largeurVignette }]}
                onPress={() => navigation.navigate('DetailRecette', { recetteId: item.recette.id })}
              >
                {item.recette.photo_url ? (
                  <Image source={{ uri: item.recette.photo_url }} style={styles.image} />
                ) : (
                  <View style={[styles.image, styles.imageVide]} />
                )}
                <View style={styles.etiquette}>
                  <Text style={[styles.nomRecette, { fontSize: taillePolice }]} numberOfLines={1}>
                    {item.recette.titre}
                  </Text>
                  {/* Recette d'un autre foyer de la famille : on indique lequel. */}
                  {item.recette.foyer_id !== foyer?.id && item.recette.foyer?.nom ? (
                    <Text style={[styles.foyerRecette, { fontSize: taillePolice - 2 }]} numberOfLines={1}>
                      {item.recette.foyer.nom}
                    </Text>
                  ) : null}
                </View>
              </Pressable>
            )
          }
        />
      )}
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
  carteAjouter: {
    borderStyle: 'dashed',
    borderColor: theme.colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  carteAjouterSigne: { fontFamily: theme.fontTitle, fontSize: 26, color: theme.colors.accent },
  carteAjouterTexte: { fontFamily: theme.fontBodyBold, fontSize: 11, color: theme.colors.accent },
}));
