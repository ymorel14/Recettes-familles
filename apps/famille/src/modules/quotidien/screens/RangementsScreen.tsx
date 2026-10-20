import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { theme, creerStylesThemes } from '../theme/theme';
import { Carte, TitreSection } from '../components/elements';
import { Bouton, Chargement, MessageVide } from '../components/ui';
import { stylesFormulaire as sf } from '../components/formulaire';
import { Vignette } from '../components/PhotoInventaire';
import { useInventaires } from '../hooks/useInventaires';
import { lieuDeObjet, nomContenant, type Contenant } from '../services/inventaires';

// Lieux de rangement (garage, cave…) et, dans chacun, ses contenants
// (boîtes numérotées, placards…), avec le nombre d'objets de chacun.
export default function RangementsScreen({ navigation }: any) {
  const { donnees } = useInventaires();
  if (!donnees) return <Chargement />;

  const nbDansContenant = (c: Contenant) => donnees.objets.filter((o) => o.contenant_id === c.id).length;
  const sansLieu = donnees.contenants.filter((c) => !c.lieu_id);

  const ligneContenant = (c: Contenant) => {
    const n = nbDansContenant(c);
    return (
      <Pressable
        key={c.id}
        onPress={() => navigation.navigate('Rangement', { type: 'contenant', id: c.id })}
        accessibilityRole="button"
        accessibilityLabel={`${nomContenant(c)}, ${n} objets`}
        style={({ pressed }) => [sf.ligne, styles.contenant, pressed && { opacity: 0.7 }]}
      >
        <Vignette chemin={c.photo} taille={40} icone="cube-outline" />
        <Text style={[sf.texte, { flex: 1 }]}>{nomContenant(c)}</Text>
        <Text style={sf.detail}>
          {n} objet{n > 1 ? 's' : ''}
        </Text>
        <Ionicons name="chevron-forward" size={16} color={theme.colors.textMuted} />
      </Pressable>
    );
  };

  return (
    <ScrollView style={sf.flex} contentContainerStyle={sf.contenu}>
      {donnees.lieux.length === 0 && donnees.contenants.length === 0 && (
        <MessageVide
          titre="Aucun rangement"
          texte="Ajoutez vos lieux (garage, cave, atelier…) puis les contenants qui s’y trouvent (boîtes numérotées, placards…)."
        />
      )}

      {donnees.lieux.map((l) => {
        const contenants = donnees.contenants.filter((c) => c.lieu_id === l.id);
        const n = donnees.objets.filter((o) => lieuDeObjet(o, donnees.contenants) === l.id).length;
        return (
          <Carte key={l.id}>
            <Pressable
              onPress={() => navigation.navigate('Rangement', { type: 'lieu', id: l.id })}
              accessibilityRole="button"
              accessibilityLabel={`${l.nom}, ${n} objets`}
              style={sf.ligne}
            >
              <Vignette chemin={l.photo} taille={56} icone="home-outline" />
              <View style={{ flex: 1 }}>
                <Text style={styles.lieu}>{l.nom}</Text>
                <Text style={sf.detail}>
                  {n} objet{n > 1 ? 's' : ''}
                  {contenants.length ? ` · ${contenants.length} contenant${contenants.length > 1 ? 's' : ''}` : ''}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />
            </Pressable>
            {contenants.map(ligneContenant)}
          </Carte>
        );
      })}

      {sansLieu.length > 0 && (
        <>
          <TitreSection titre="Contenants sans lieu" />
          <Carte>{sansLieu.map(ligneContenant)}</Carte>
        </>
      )}

      <View style={[sf.ligne, { marginTop: theme.spacing.sm }]}>
        <View style={{ flex: 1 }}>
          <Bouton variante="pointille" titre="+ Lieu" onPress={() => navigation.navigate('RangementForm', { type: 'lieu' })} />
        </View>
        <View style={{ flex: 1 }}>
          <Bouton
            variante="pointille"
            titre="+ Contenant"
            onPress={() => navigation.navigate('RangementForm', { type: 'contenant' })}
          />
        </View>
      </View>
    </ScrollView>
  );
}

const styles = creerStylesThemes(() => ({
  lieu: { fontFamily: theme.fontTitle, fontSize: 18, color: theme.colors.text },
  contenant: {
    paddingVertical: theme.spacing.xs,
    paddingLeft: theme.spacing.md,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    minHeight: 52,
  },
}));
