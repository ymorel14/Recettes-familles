import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Image,
  ActivityIndicator,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { theme, creerStylesThemes } from '../theme/theme';
import { useAuth } from '../contexts/AuthContext';
import { listerRecettes, type PorteeRecettes } from '../services/recettes';
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
  const { foyer } = useAuth();
  const [recettes, setRecettes] = useState<RecetteComplete[]>([]);
  // Recettes de notre foyer seulement, ou de toute la famille (celles des
  // autres foyers sont en lecture seule).
  const [portee, setPortee] = useState<PorteeRecettes>('foyer');
  const [chargement, setChargement] = useState(true);
  // Nombre de colonnes et taille des vignettes adaptés à la largeur de
  // l'écran (voir utils/grilleVignettes.ts).
  const { largeurVignette, taillePolice } = useGrilleVignettes();
  // Groupes lus dans la base : un groupe ajouté dans Supabase apparaît ici.
  const { groupes, recharger: rechargerGroupes } = useGroupesCategories();
  const [categorieARanger, setCategorieARanger] = useState<
    { id: string; nom: string; groupeActuel: string } | null
  >(null);

  const charger = useCallback(() => {
    if (!foyer) return;
    listerRecettes(foyer.id, portee)
      .then(setRecettes)
      .finally(() => setChargement(false));
  }, [foyer, portee]);

  // Recharge à chaque retour sur l'écran (ex. après création d'une recette).
  useFocusEffect(
    useCallback(() => {
      charger();
      rechargerGroupes();
    }, [charger, rechargerGroupes])
  );

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
    return resultat.filter((section) => section.categories.length > 0);
  }, [recettes, groupes]);

  return (
    <View style={styles.container}>
      <View style={styles.enTete}>
        <Text style={styles.titre}>Nos recettes</Text>
        <View style={styles.boutonsEnTete}>
          <Pressable style={styles.boutonScan} onPress={() => navigation.navigate('ScanRecette')}>
            <Text style={styles.boutonScanTexte}>Scanner</Text>
          </Pressable>
          <Pressable style={styles.boutonScan} onPress={() => navigation.navigate('ImportWeb')}>
            <Text style={styles.boutonScanTexte}>Web</Text>
          </Pressable>
          <Pressable style={styles.boutonAjouter} onPress={() => navigation.navigate('CreationRecette')}>
            <Text style={styles.boutonAjouterTexte}>+ Ajouter</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.choixPortee}>
        {(
          [
            ['foyer', 'Notre foyer'],
            ['famille', 'Toute la famille'],
          ] as [PorteeRecettes, string][]
        ).map(([valeur, libelle]) => (
          <Pressable
            key={valeur}
            style={[styles.puccePortee, portee === valeur && styles.puccePorteeActive]}
            onPress={() => setPortee(valeur)}
          >
            <Text style={[styles.puccePorteeTexte, portee === valeur && styles.puccePorteeTexteActive]}>
              {libelle}
            </Text>
          </Pressable>
        ))}
      </View>

      {chargement ? (
        <ActivityIndicator color={theme.colors.accent} style={{ marginTop: theme.spacing.lg }} />
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
  boutonsEnTete: { flexDirection: 'row', gap: theme.spacing.xs },
  boutonScan: {
    borderColor: theme.colors.accent,
    borderWidth: 1,
    borderRadius: theme.radii.md,
    paddingVertical: theme.spacing.xs,
    paddingHorizontal: theme.spacing.sm,
    justifyContent: 'center',
  },
  boutonScanTexte: { fontFamily: theme.fontBodyBold, color: theme.colors.accent },
  boutonAjouter: {
    backgroundColor: theme.colors.accent,
    borderRadius: theme.radii.md,
    paddingVertical: theme.spacing.xs,
    paddingHorizontal: theme.spacing.sm,
  },
  boutonAjouterTexte: { fontFamily: theme.fontBodyBold, color: theme.colors.background },
  grille: { paddingBottom: theme.spacing.xl },
  section: { marginBottom: theme.spacing.lg },
  choixPortee: { flexDirection: 'row', gap: theme.spacing.xs, marginBottom: theme.spacing.md },
  puccePortee: {
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radii.lg,
    paddingVertical: 5,
    paddingHorizontal: theme.spacing.md,
  },
  puccePorteeActive: { backgroundColor: theme.colors.accent, borderColor: theme.colors.accent },
  puccePorteeTexte: { fontFamily: theme.fontBody, fontSize: 14, color: theme.colors.textMuted },
  puccePorteeTexteActive: { fontFamily: theme.fontBodyBold, color: theme.colors.background },
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
