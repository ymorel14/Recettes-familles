import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Image, Pressable, ActivityIndicator } from 'react-native';
import { theme } from '../../theme/theme';
import { obtenirRecette, resoudreEtapePourAffichage } from '../../services/recettes';
import type { RecetteComplete } from '../../types/models';

// Fiche recette : ingrédients, étapes (avec quantités déjà résolues), accès
// au mode assistant et à l'ajout dans la liste de courses (§4, §7, §8).
export default function RecetteDetailScreen({ route, navigation }: any) {
  const { recetteId } = route.params;
  const [recette, setRecette] = useState<RecetteComplete | null>(null);
  const [chargement, setChargement] = useState(true);

  useEffect(() => {
    obtenirRecette(recetteId)
      .then(setRecette)
      .finally(() => setChargement(false));
  }, [recetteId]);

  if (chargement) {
    return (
      <View style={styles.centre}>
        <ActivityIndicator color={theme.colors.accent} />
      </View>
    );
  }

  if (!recette) {
    return (
      <View style={styles.centre}>
        <Text style={styles.erreur}>Recette introuvable.</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contenu}>
      {recette.photo_url && <Image source={{ uri: recette.photo_url }} style={styles.photo} />}

      <Text style={styles.titre}>{recette.titre}</Text>

      {recette.categories.length > 0 && (
        <View style={styles.puces}>
          {recette.categories.map((c) => (
            <View key={c.id} style={styles.puce}>
              <Text style={styles.puceTexte}>{c.nom}</Text>
            </View>
          ))}
        </View>
      )}

      <View style={styles.infos}>
        <Text style={styles.info}>{recette.parts_defaut} parts</Text>
        {recette.temps_preparation_minutes != null && (
          <Text style={styles.info}>Préparation : {recette.temps_preparation_minutes} min</Text>
        )}
        {recette.temps_cuisson_minutes != null && (
          <Text style={styles.info}>Cuisson : {recette.temps_cuisson_minutes} min</Text>
        )}
      </View>

      <Pressable
        style={styles.boutonPrincipal}
        onPress={() => navigation.navigate('AssistantRecette', { recetteId: recette.id })}
      >
        <Text style={styles.boutonPrincipalTexte}>Lancer le mode assistant</Text>
      </Pressable>
      <Pressable
        style={styles.boutonSecondaire}
        onPress={() => navigation.navigate('SelectionRecettes', { preselection: [recette.id] })}
      >
        <Text style={styles.boutonSecondaireTexte}>Ajouter à la liste de courses</Text>
      </Pressable>

      <Text style={styles.section}>Ingrédients</Text>
      {recette.ingredients.map((ing) => (
        <Text key={ing.id} style={styles.ingredient}>
          • {[ing.quantite, ing.unite, ing.libelle].filter(Boolean).join(' ')}
        </Text>
      ))}

      <Text style={styles.section}>Préparation</Text>
      {recette.etapes.map((etape, index) => (
        <View key={etape.id} style={styles.blocEtape}>
          <Text style={styles.numeroEtape}>{index + 1}</Text>
          <Text style={styles.texteEtape}>
            {resoudreEtapePourAffichage(etape.texte, recette.ingredients)}
          </Text>
        </View>
      ))}

      {recette.notes && (
        <>
          <Text style={styles.section}>Notes</Text>
          <Text style={styles.notes}>{recette.notes}</Text>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  contenu: { padding: theme.spacing.md, gap: theme.spacing.sm },
  centre: { flex: 1, backgroundColor: theme.colors.background, alignItems: 'center', justifyContent: 'center' },
  erreur: { fontFamily: theme.fontBody, color: theme.colors.warning },
  photo: { width: '100%', height: 200, borderRadius: theme.radii.md },
  titre: { fontFamily: theme.fontTitle, fontSize: 26, color: theme.colors.accent },
  puces: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.xs },
  puce: { backgroundColor: theme.colors.selection, borderRadius: theme.radii.sm, paddingVertical: 3, paddingHorizontal: theme.spacing.sm },
  puceTexte: { fontFamily: theme.fontBody, fontSize: 12, color: theme.colors.text },
  infos: { flexDirection: 'row', gap: theme.spacing.md },
  info: { fontFamily: theme.fontBody, color: theme.colors.textMuted, fontSize: 13 },
  boutonPrincipal: { backgroundColor: theme.colors.accent, borderRadius: theme.radii.md, paddingVertical: theme.spacing.md, alignItems: 'center' },
  boutonPrincipalTexte: { fontFamily: theme.fontBodyBold, fontSize: 16, color: theme.colors.background },
  boutonSecondaire: { borderColor: theme.colors.accent, borderWidth: 1, borderRadius: theme.radii.md, paddingVertical: theme.spacing.md, alignItems: 'center' },
  boutonSecondaireTexte: { fontFamily: theme.fontBodyBold, fontSize: 15, color: theme.colors.accent },
  section: { fontFamily: theme.fontTitle, fontSize: 18, color: theme.colors.accent, marginTop: theme.spacing.md },
  ingredient: { fontFamily: theme.fontBody, color: theme.colors.text, fontSize: 15 },
  blocEtape: { flexDirection: 'row', gap: theme.spacing.sm },
  numeroEtape: { fontFamily: theme.fontBodyBold, color: theme.colors.accent, width: 20 },
  texteEtape: { fontFamily: theme.fontBody, color: theme.colors.text, fontSize: 15, flex: 1 },
  notes: { fontFamily: theme.fontBody, color: theme.colors.textMuted, fontStyle: 'italic' },
});
