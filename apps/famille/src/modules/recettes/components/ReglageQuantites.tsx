import React, { useMemo, useState } from 'react';
import { View, Text, Pressable, Modal, TextInput, ScrollView } from 'react-native';
import { theme, creerStylesThemes } from '../theme/theme';
import { normaliserTexte } from '../utils/texte';
import ZoneClavier from './ZoneClavier';
import type { Ingredient } from '../types/models';

// Réglage des quantités d'une recette au moment de la faire (retour
// utilisateur : "si la recette demande 8 œufs et que je n'en ai que 6, les
// autres quantités doivent s'adapter").
// - "Parts : − 4 +" : comme avant, par part entière.
// - "⚖️ Adapter à ce que j'ai" : on choisit un ingrédient, on indique la
//   quantité disponible, et toute la recette est multipliée par le même
//   coefficient (6 œufs sur 8 → × 0,75 pour tous les ingrédients).
// Le coefficient (`facteur`) est gardé par l'écran qui utilise ce réglage.

export type AjustementQuantites = {
  facteur: number;
  // Ex. "6 œufs" quand l'adaptation vient d'un ingrédient ; null sinon.
  description: string | null;
};

export const AJUSTEMENT_INITIAL: AjustementQuantites = { facteur: 1, description: null };

type IngredientRegroupe = { clef: string; libelle: string; unite: string | null; quantite: number };

// Un même ingrédient présent dans plusieurs éléments (ex. des œufs dans la
// pâte ET dans la garniture) est additionné : "8 œufs" au total.
function regrouperIngredients(ingredients: Ingredient[]): IngredientRegroupe[] {
  const groupes = new Map<string, IngredientRegroupe>();
  for (const ing of ingredients) {
    if (ing.quantite == null || ing.quantite <= 0 || !ing.libelle.trim()) continue;
    const clef = `${normaliserTexte(ing.libelle.trim())}|${normaliserTexte(ing.unite ?? '')}`;
    const existant = groupes.get(clef);
    if (existant) existant.quantite += ing.quantite;
    else groupes.set(clef, { clef, libelle: ing.libelle.trim(), unite: ing.unite, quantite: ing.quantite });
  }
  return [...groupes.values()];
}

export function formaterNombre(valeur: number): string {
  return (Math.round(valeur * 100) / 100).toString().replace('.', ',');
}

function libelleQuantite(ing: IngredientRegroupe, quantite: number): string {
  return [formaterNombre(quantite), ing.unite, ing.libelle].filter(Boolean).join(' ');
}

type Props = {
  partsDefaut: number;
  ingredients: Ingredient[];
  ajustement: AjustementQuantites;
  onChange: (ajustement: AjustementQuantites) => void;
};

export default function ReglageQuantites({ partsDefaut, ingredients, ajustement, onChange }: Props) {
  const [ouvert, setOuvert] = useState(false);
  const [choisi, setChoisi] = useState<IngredientRegroupe | null>(null);
  const [saisie, setSaisie] = useState('');

  const regroupes = useMemo(() => regrouperIngredients(ingredients), [ingredients]);
  const base = partsDefaut > 0 ? partsDefaut : 1;
  const parts = base * ajustement.facteur;

  const changerParts = (sens: 1 | -1) => {
    const nouvelles = sens === 1 ? Math.floor(parts + 1e-9) + 1 : Math.max(1, Math.ceil(parts - 1e-9) - 1);
    onChange({ facteur: nouvelles / base, description: null });
  };

  const disponible = Number(saisie.replace(',', '.'));
  const saisieValide = !!choisi && saisie.trim() !== '' && Number.isFinite(disponible) && disponible > 0;
  const nouveauFacteur = saisieValide ? disponible / choisi!.quantite : null;

  const fermer = () => {
    setOuvert(false);
    setChoisi(null);
    setSaisie('');
  };

  const appliquer = () => {
    if (!choisi || nouveauFacteur == null) return;
    onChange({ facteur: nouveauFacteur, description: libelleQuantite(choisi, disponible) });
    fermer();
  };

  return (
    <View style={styles.conteneur}>
      <View style={styles.ligneParts}>
        <Text style={styles.label}>Parts :</Text>
        <Pressable style={styles.bouton} onPress={() => changerParts(-1)} accessibilityLabel="Une part de moins">
          <Text style={styles.boutonTexte}>−</Text>
        </Pressable>
        <Text style={styles.valeur}>{formaterNombre(parts)}</Text>
        <Pressable style={styles.bouton} onPress={() => changerParts(1)} accessibilityLabel="Une part de plus">
          <Text style={styles.boutonTexte}>+</Text>
        </Pressable>
        {regroupes.length > 0 && (
          <Pressable onPress={() => setOuvert(true)} hitSlop={6}>
            <Text style={styles.lien}>⚖️ Adapter à ce que j'ai</Text>
          </Pressable>
        )}
      </View>

      {ajustement.facteur !== 1 && (
        <View style={styles.bandeau}>
          <Text style={styles.bandeauTexte}>
            {ajustement.description
              ? `Quantités adaptées à ${ajustement.description} (× ${formaterNombre(ajustement.facteur)})`
              : `Quantités × ${formaterNombre(ajustement.facteur)}`}
          </Text>
          <Pressable onPress={() => onChange(AJUSTEMENT_INITIAL)} hitSlop={6}>
            <Text style={styles.lien}>Revenir à la recette</Text>
          </Pressable>
        </View>
      )}

      <Modal visible={ouvert} transparent animationType="fade" onRequestClose={fermer}>
        <ZoneClavier sansEnTete>
          <Pressable style={styles.fond} onPress={fermer}>
            <Pressable style={styles.modale} onPress={() => {}}>
              {!choisi ? (
                <>
                  <Text style={styles.titre}>Adapter à ce que j'ai</Text>
                  <Text style={styles.aide}>
                    Choisissez l'ingrédient qui vous manque (ou que vous avez en plus) : toutes les quantités
                    suivront.
                  </Text>
                  <ScrollView style={styles.liste}>
                    {regroupes.map((ing) => (
                      <Pressable key={ing.clef} style={styles.choix} onPress={() => setChoisi(ing)}>
                        <Text style={styles.choixTexte}>{libelleQuantite(ing, ing.quantite)}</Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                </>
              ) : (
                <>
                  <Text style={styles.titre}>{choisi.libelle}</Text>
                  <Text style={styles.aide}>
                    La recette demande {libelleQuantite(choisi, choisi.quantite)}. Combien en avez-vous ?
                  </Text>
                  <View style={styles.ligneSaisie}>
                    <TextInput
                      style={styles.champ}
                      keyboardType="decimal-pad"
                      autoFocus
                      value={saisie}
                      onChangeText={setSaisie}
                      onSubmitEditing={appliquer}
                      placeholder={formaterNombre(choisi.quantite)}
                      placeholderTextColor={theme.colors.textMuted}
                    />
                    {!!choisi.unite && <Text style={styles.unite}>{choisi.unite}</Text>}
                  </View>
                  {nouveauFacteur != null && (
                    <Text style={styles.apercu}>
                      Soit × {formaterNombre(nouveauFacteur)} : environ {formaterNombre(base * nouveauFacteur)} parts
                      au lieu de {formaterNombre(base)}.
                    </Text>
                  )}
                  <Pressable
                    style={[styles.boutonPrincipal, !saisieValide && styles.inactif]}
                    onPress={appliquer}
                    disabled={!saisieValide}
                  >
                    <Text style={styles.boutonPrincipalTexte}>Adapter la recette</Text>
                  </Pressable>
                  <Pressable style={styles.annuler} onPress={() => setChoisi(null)}>
                    <Text style={styles.annulerTexte}>← Choisir un autre ingrédient</Text>
                  </Pressable>
                </>
              )}
              <Pressable style={styles.annuler} onPress={fermer}>
                <Text style={styles.annulerTexte}>Annuler</Text>
              </Pressable>
            </Pressable>
          </Pressable>
        </ZoneClavier>
      </Modal>
    </View>
  );
}

const styles = creerStylesThemes(() => ({
  conteneur: { gap: theme.spacing.xs },
  ligneParts: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  label: { fontFamily: theme.fontBody, color: theme.colors.textMuted },
  bouton: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radii.sm,
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boutonTexte: { fontFamily: theme.fontBodyBold, color: theme.colors.accent, fontSize: 18 },
  valeur: { fontFamily: theme.fontBodyBold, color: theme.colors.text, fontSize: 16, minWidth: 24, textAlign: 'center' },
  lien: { fontFamily: theme.fontBody, color: theme.colors.accent, textDecorationLine: 'underline' },
  bandeau: {
    alignSelf: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.selectionTransparent,
    borderColor: theme.colors.accent,
    borderWidth: 1,
    borderRadius: theme.radii.md,
    paddingVertical: theme.spacing.xs,
    paddingHorizontal: theme.spacing.md,
    gap: 2,
  },
  bandeauTexte: { fontFamily: theme.fontBody, fontSize: 14, color: theme.colors.text, textAlign: 'center' },
  fond: { flex: 1, backgroundColor: theme.colors.voileFort, justifyContent: 'center', padding: theme.spacing.lg },
  modale: {
    width: '100%',
    maxWidth: 440,
    alignSelf: 'center',
    maxHeight: '85%',
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radii.lg,
    padding: theme.spacing.md,
    gap: theme.spacing.xs,
  },
  titre: { fontFamily: theme.fontBodyBold, fontSize: 17, color: theme.colors.text },
  aide: { fontFamily: theme.fontBody, fontSize: 14, color: theme.colors.textMuted },
  liste: { flexGrow: 0 },
  choix: {
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.sm,
    borderBottomColor: theme.colors.border,
    borderBottomWidth: 1,
  },
  choixTexte: { fontFamily: theme.fontBody, fontSize: 16, color: theme.colors.text },
  ligneSaisie: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
  champ: {
    flex: 1,
    backgroundColor: theme.colors.background,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radii.md,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.sm,
    fontFamily: theme.fontBody,
    fontSize: 18,
    color: theme.colors.text,
  },
  unite: { fontFamily: theme.fontBody, fontSize: 16, color: theme.colors.text },
  apercu: { fontFamily: theme.fontBody, fontSize: 14, color: theme.colors.accent },
  boutonPrincipal: {
    backgroundColor: theme.colors.accent,
    borderRadius: theme.radii.md,
    paddingVertical: theme.spacing.sm,
    alignItems: 'center',
    marginTop: theme.spacing.xs,
  },
  boutonPrincipalTexte: { fontFamily: theme.fontBodyBold, fontSize: 15, color: theme.colors.background },
  inactif: { opacity: 0.5 },
  annuler: { alignItems: 'center', paddingVertical: theme.spacing.xs },
  annulerTexte: { fontFamily: theme.fontBody, color: theme.colors.textMuted, textDecorationLine: 'underline' },
}));
