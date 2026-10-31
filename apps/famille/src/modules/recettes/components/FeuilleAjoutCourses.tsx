import React, { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { FeuilleBas } from '../../../composants/FeuilleBas';
import { Bouton, Icone } from '../../../composants/ui';
import { couleurs, couleursModule, creerStyles, espaces, polices } from '../../../theme/theme';
import { resoudreLibelleIngredient } from '../services/recettes';
import type { Ingredient } from '../types/models';

// Feuille « Ajouter aux courses » de la fiche recette (retour de test R-6) :
// les ingrédients aux quantités choisies, AUCUN coché au départ (on coche ce
// qui manque), « Tout cocher », puis « Ajouter (n) ». Le choix de la liste
// vient ensuite (useEnvoiCourses).
export default function FeuilleAjoutCourses({
  visible,
  ingredients,
  facteur,
  onFermer,
  onAjouter,
}: {
  visible: boolean;
  ingredients: Ingredient[];
  facteur: number;
  onFermer: () => void;
  onAjouter: (choisis: Ingredient[]) => void;
}) {
  const [coches, setCoches] = useState<Set<string>>(new Set());
  const encre = couleursModule('recettes').encre;

  // Rien de coché à chaque ouverture.
  useEffect(() => {
    if (visible) setCoches(new Set());
  }, [visible]);

  const toutCoche = ingredients.length > 0 && coches.size === ingredients.length;
  const basculer = (id: string) =>
    setCoches((c) => {
      const n = new Set(c);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <FeuilleBas visible={visible} titre="Ajouter aux courses" onFermer={onFermer}>
      <View style={styles.ligneHaut}>
        <Text style={styles.aide}>Cochez ce qu’il vous manque.</Text>
        <Pressable
          onPress={() => setCoches(toutCoche ? new Set() : new Set(ingredients.map((i) => i.id)))}
          accessibilityRole="button"
          hitSlop={8}
        >
          <Text style={[styles.toutCocher, { color: encre }]}>{toutCoche ? 'Tout décocher' : 'Tout cocher'}</Text>
        </Pressable>
      </View>
      <View>
        {ingredients.map((ing) => {
          const coche = coches.has(ing.id);
          return (
            <Pressable
              key={ing.id}
              style={styles.ligne}
              onPress={() => basculer(ing.id)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: coche }}
            >
              <Icone nom={coche ? 'checkbox' : 'square-outline'} taille={24} couleur={coche ? encre : couleurs.encreDouce} />
              <Text style={styles.libelle}>{resoudreLibelleIngredient(ing, facteur)}</Text>
            </Pressable>
          );
        })}
      </View>
      <Bouton
        titre={coches.size > 0 ? `Ajouter (${coches.size})` : 'Ajouter'}
        icone="cart-outline"
        module="recettes"
        desactive={coches.size === 0}
        onPress={() => onAjouter(ingredients.filter((i) => coches.has(i.id)))}
      />
    </FeuilleBas>
  );
}

const styles = creerStyles(() => ({
  ligneHaut: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: espaces.m },
  aide: { flex: 1, fontFamily: polices.texte, fontSize: 14, color: couleurs.encreDouce },
  toutCocher: { fontFamily: polices.texteGras, fontSize: 14 },
  ligne: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaces.m,
    minHeight: 48,
    borderBottomWidth: 1,
    borderBottomColor: couleurs.ligne,
  },
  libelle: { flex: 1, fontFamily: polices.texte, fontSize: 16, color: couleurs.encre },
}));
