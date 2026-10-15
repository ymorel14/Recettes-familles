import React, { useLayoutEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { theme } from '../theme/theme';
import { Bouton, Chargement, MessageVide } from '../components/ui';
import { Puce, Puces, Recherche, stylesFormulaire as sf } from '../components/formulaire';
import { LigneObjet } from '../components/LigneObjet';
import { useInventaires } from '../hooks/useInventaires';
import { correspond, emplacement, lieuDeObjet } from '../services/inventaires';

type Filtre = { type: 'tous' } | { type: 'lieu'; id: string } | { type: 'sans' } | { type: 'pretes' };

// Un inventaire : ses objets, filtrés par lieu ou prêtés, et une recherche.
export default function InventaireScreen({ route, navigation }: any) {
  const id: string = route.params.id;
  const { donnees } = useInventaires();
  const [recherche, setRecherche] = useState('');
  const [filtre, setFiltre] = useState<Filtre>({ type: 'tous' });
  const inventaire = donnees?.inventaires.find((i) => i.id === id);

  useLayoutEffect(() => {
    navigation.setOptions({
      title: inventaire?.nom ?? 'Inventaire',
      headerRight: () => (
        <Pressable
          onPress={() => navigation.navigate('InventaireForm', { id })}
          accessibilityRole="button"
          accessibilityLabel="Modifier l’inventaire"
          hitSlop={8}
          style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: theme.spacing.xs }}
        >
          <Ionicons name="create-outline" size={24} color={theme.colors.accent} />
        </Pressable>
      ),
    });
  }, [navigation, inventaire?.nom, id]);

  const objets = useMemo(() => (donnees ? donnees.objets.filter((o) => o.inventaire_id === id) : []), [donnees, id]);

  if (!donnees) return <Chargement />;
  if (!inventaire) return <MessageVide titre="Inventaire introuvable" texte="Il a peut-être été supprimé." />;

  const pretes = new Set(donnees.pretsEnCours.map((p) => p.objet_id));
  // Lieux où se trouve au moins un objet de cet inventaire.
  const lieuxUtilises = donnees.lieux.filter((l) => objets.some((o) => lieuDeObjet(o, donnees.contenants) === l.id));
  const sansEmplacement = objets.some((o) => !lieuDeObjet(o, donnees.contenants));

  const affiches = objets.filter((o) => {
    if (filtre.type === 'lieu' && lieuDeObjet(o, donnees.contenants) !== filtre.id) return false;
    if (filtre.type === 'sans' && lieuDeObjet(o, donnees.contenants)) return false;
    if (filtre.type === 'pretes' && !pretes.has(o.id)) return false;
    return correspond(o, recherche, emplacement(o, donnees.lieux, donnees.contenants));
  });

  return (
    <ScrollView style={sf.flex} contentContainerStyle={sf.contenu} keyboardShouldPersistTaps="handled">
      {objets.length > 0 && (
        <>
          <Recherche valeur={recherche} onChange={setRecherche} placeholder={`Chercher dans ${inventaire.nom}`} />
          <Puces>
            <Puce texte="Tout" actif={filtre.type === 'tous'} onPress={() => setFiltre({ type: 'tous' })} />
            {lieuxUtilises.map((l) => (
              <Puce
                key={l.id}
                texte={l.nom}
                actif={filtre.type === 'lieu' && filtre.id === l.id}
                onPress={() => setFiltre({ type: 'lieu', id: l.id })}
              />
            ))}
            {sansEmplacement && (
              <Puce texte="Sans emplacement" actif={filtre.type === 'sans'} onPress={() => setFiltre({ type: 'sans' })} />
            )}
            {objets.some((o) => pretes.has(o.id)) && (
              <Puce texte="Prêtés" icone="swap-horizontal-outline" actif={filtre.type === 'pretes'} onPress={() => setFiltre({ type: 'pretes' })} />
            )}
          </Puces>
          <Text style={sf.detail}>
            {affiches.length} objet{affiches.length > 1 ? 's' : ''}
            {affiches.length !== objets.length ? ` sur ${objets.length}` : ''}
          </Text>
        </>
      )}

      {objets.length === 0 ? (
        <MessageVide titre="Inventaire vide" texte="Ajoutez vos objets un par un, avec une photo et leur emplacement." />
      ) : affiches.length === 0 ? (
        <MessageVide titre="Rien trouvé" />
      ) : (
        affiches.map((o) => (
          <LigneObjet key={o.id} objet={o} donnees={donnees} onPress={() => navigation.navigate('Objet', { id: o.id })} />
        ))
      )}

      <Bouton
        titre="+ Ajouter un objet"
        onPress={() =>
          navigation.navigate('ObjetForm', {
            inventaireId: id,
            // Filtré sur un lieu : le nouvel objet y est rangé par défaut.
            lieuId: filtre.type === 'lieu' ? filtre.id : undefined,
          })
        }
        style={{ marginTop: theme.spacing.sm }}
      />
    </ScrollView>
  );
}
