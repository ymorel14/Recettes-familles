import React, { useLayoutEffect } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { theme } from '../theme/theme';
import { TitreSection } from '../components/elements';
import { Bouton, Chargement, MessageVide } from '../components/ui';
import { stylesFormulaire as sf } from '../components/formulaire';
import { GrandePhoto, Vignette } from '../components/PhotoInventaire';
import { LigneObjet } from '../components/LigneObjet';
import { useInventaires } from '../hooks/useInventaires';
import { nomContenant } from '../services/inventaires';

// Un lieu ou un contenant : sa photo, ce qu'il contient (contenants, objets
// de tous les inventaires). « Qu'y a-t-il dans la boîte n° 12 ? »
// Paramètres : type ('lieu' | 'contenant'), id.
export default function RangementScreen({ route, navigation }: any) {
  const { type, id } = route.params as { type: 'lieu' | 'contenant'; id: string };
  const { donnees } = useInventaires();

  const lieu = type === 'lieu' ? donnees?.lieux.find((l) => l.id === id) : undefined;
  const contenant = type === 'contenant' ? donnees?.contenants.find((c) => c.id === id) : undefined;
  const titre = lieu ? lieu.nom : contenant ? nomContenant(contenant) : type === 'lieu' ? 'Lieu' : 'Contenant';

  useLayoutEffect(() => {
    navigation.setOptions({
      title: titre,
      headerRight: () => (
        <Pressable
          onPress={() => navigation.navigate('RangementForm', { type, id })}
          accessibilityRole="button"
          accessibilityLabel="Modifier"
          hitSlop={8}
          style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: theme.spacing.xs }}
        >
          <Ionicons name="create-outline" size={24} color={theme.colors.accent} />
        </Pressable>
      ),
    });
  }, [navigation, titre, type, id]);

  if (!donnees) return <Chargement />;
  if (!lieu && !contenant) return <MessageVide titre="Introuvable" texte="Il a peut-être été supprimé." />;

  const lieuDuContenant = contenant?.lieu_id ? donnees.lieux.find((l) => l.id === contenant.lieu_id) : undefined;
  const contenants = lieu ? donnees.contenants.filter((c) => c.lieu_id === lieu.id) : [];
  // Dans un lieu : les objets posés directement ; ceux des contenants sont
  // listés sous chaque contenant (on les ouvre d'un toucher).
  const objets = lieu
    ? donnees.objets.filter((o) => !o.contenant_id && o.lieu_id === lieu.id)
    : donnees.objets.filter((o) => o.contenant_id === contenant!.id);
  const premierInventaire = donnees.inventaires[0]?.id;

  return (
    <ScrollView style={sf.flex} contentContainerStyle={sf.contenu}>
      <GrandePhoto chemin={(lieu ?? contenant)!.photo} legende={titre} />
      <Text style={sf.titre}>{titre}</Text>
      {contenant && (
        <Pressable
          disabled={!lieuDuContenant}
          onPress={() => lieuDuContenant && navigation.navigate('Rangement', { type: 'lieu', id: lieuDuContenant.id })}
          accessibilityRole={lieuDuContenant ? 'button' : undefined}
          style={sf.ligne}
        >
          <Ionicons name="home-outline" size={18} color={theme.colors.textMuted} />
          <Text style={sf.detail}>{lieuDuContenant ? `Rangé dans : ${lieuDuContenant.nom}` : 'Pas de lieu pour l’instant'}</Text>
        </Pressable>
      )}

      {contenants.length > 0 && (
        <>
          <TitreSection titre="Contenants" detail={String(contenants.length)} />
          {contenants.map((c) => {
            const n = donnees.objets.filter((o) => o.contenant_id === c.id).length;
            return (
              <Pressable
                key={c.id}
                onPress={() => navigation.push('Rangement', { type: 'contenant', id: c.id })}
                accessibilityRole="button"
                style={({ pressed }) => [sf.ligne, { paddingVertical: theme.spacing.xs }, pressed && { opacity: 0.7 }]}
              >
                <Vignette chemin={c.photo} taille={48} icone="cube-outline" />
                <View style={{ flex: 1 }}>
                  <Text style={sf.nom}>{nomContenant(c)}</Text>
                  <Text style={sf.detail}>
                    {n} objet{n > 1 ? 's' : ''}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />
              </Pressable>
            );
          })}
        </>
      )}

      <TitreSection
        titre={lieu ? 'Objets posés là' : 'Contenu'}
        detail={objets.length ? `${objets.length} objet${objets.length > 1 ? 's' : ''}` : undefined}
      />
      {objets.length === 0 ? (
        <Text style={sf.detail}>{lieu ? 'Aucun objet hors contenant.' : 'Vide pour l’instant.'}</Text>
      ) : (
        objets.map((o) => (
          <LigneObjet key={o.id} objet={o} donnees={donnees} avecInventaire onPress={() => navigation.navigate('Objet', { id: o.id })} />
        ))
      )}

      {premierInventaire ? (
        <Bouton
          variante="contour"
          titre={lieu ? '+ Ranger un objet ici' : '+ Ajouter un objet dedans'}
          onPress={() =>
            navigation.navigate('ObjetForm', lieu ? { lieuId: lieu.id } : { contenantId: contenant!.id })
          }
          style={{ marginTop: theme.spacing.sm }}
        />
      ) : null}
      {lieu && (
        <Bouton
          variante="pointille"
          titre="+ Contenant dans ce lieu"
          onPress={() => navigation.navigate('RangementForm', { type: 'contenant', lieuId: lieu.id })}
        />
      )}
    </ScrollView>
  );
}
