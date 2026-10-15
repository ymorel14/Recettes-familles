import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { theme, creerStylesThemes } from '../theme/theme';
import { useAuth } from '../contexts/AuthContext';
import { Bouton, Chargement } from '../components/ui';
import { Champ, Puce, Puces, stylesFormulaire as sf } from '../components/formulaire';
import { alerte } from '../utils/alerte';
import { extraireMessageErreur } from '@apps-famille/famille';
import { supabase } from '../services/supabase';
import { creerInventaire, modifierInventaire, supprimerInventaire, SUGGESTIONS_INVENTAIRES } from '../services/inventaires';

// Icônes proposées pour un inventaire (Ionicons).
const ICONES = [
  'file-tray-stacked-outline',
  'construct-outline',
  'hammer-outline',
  'book-outline',
  'game-controller-outline',
  'wine-outline',
  'bonfire-outline',
  'gift-outline',
  'shirt-outline',
  'football-outline',
  'musical-notes-outline',
  'laptop-outline',
  'restaurant-outline',
  'flower-outline',
] as const;

// Icône devinée d'après le nom suggéré.
const ICONE_SUGGESTION: Record<string, string> = {
  Outils: 'construct-outline',
  Bricolage: 'hammer-outline',
  Livres: 'book-outline',
  'Jeux de société': 'game-controller-outline',
  'Cave à vin': 'wine-outline',
  Camping: 'bonfire-outline',
  'Décorations de Noël': 'gift-outline',
  'Vêtements rangés': 'shirt-outline',
};

// Créer, renommer ou supprimer un inventaire (un domaine : outils, livres…).
export default function InventaireFormScreen({ route, navigation }: any) {
  const id: string | undefined = route.params?.id;
  const { foyer } = useAuth();
  const [pret, setPret] = useState(!id);
  const [nom, setNom] = useState('');
  const [icone, setIcone] = useState<string>('file-tray-stacked-outline');
  const [nbObjets, setNbObjets] = useState(0);
  const [enCours, setEnCours] = useState(false);

  useEffect(() => {
    navigation.setOptions({ title: id ? 'Modifier l’inventaire' : 'Nouvel inventaire' });
    if (!id) return;
    Promise.all([
      supabase.from('inventaires').select('nom, icone').eq('id', id).single(),
      supabase.from('objets').select('id', { count: 'exact', head: true }).eq('inventaire_id', id),
    ])
      .then(([inv, objets]) => {
        if (inv.error) throw inv.error;
        setNom(inv.data.nom);
        setIcone(inv.data.icone || 'file-tray-stacked-outline');
        setNbObjets(objets.count ?? 0);
        setPret(true);
      })
      .catch((e) => alerte('Chargement impossible', extraireMessageErreur(e, 'Veuillez réessayer.')));
  }, [id, navigation]);

  if (!pret) return <Chargement />;

  const enregistrer = async () => {
    if (!foyer) return;
    if (!nom.trim()) return alerte('Inventaire', 'Donnez-lui un nom (ex. Outils).');
    setEnCours(true);
    try {
      if (id) {
        await modifierInventaire(id, nom, icone);
        navigation.goBack();
      } else {
        const nouveau = await creerInventaire(foyer.id, nom, icone);
        navigation.replace('Inventaire', { id: nouveau });
      }
    } catch (e) {
      alerte('Enregistrement impossible', extraireMessageErreur(e, 'Veuillez réessayer.'));
    } finally {
      setEnCours(false);
    }
  };

  const supprimer = () =>
    alerte(
      'Supprimer cet inventaire ?',
      nbObjets
        ? `Ses ${nbObjets} objet${nbObjets > 1 ? 's' : ''}, leurs photos et l’historique des prêts disparaissent aussi.`
        : 'Il est vide.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: async () => {
            try {
              await supprimerInventaire(id!);
              navigation.popToTop();
            } catch (e) {
              alerte('Suppression impossible', extraireMessageErreur(e, 'Veuillez réessayer.'));
            }
          },
        },
      ]
    );

  return (
    <ScrollView style={sf.flex} contentContainerStyle={sf.contenu} keyboardShouldPersistTaps="handled">
      <Champ libelle="Nom" value={nom} onChangeText={setNom} placeholder="ex. Outils, Livres, Cave à vin" />
      {!id && (
        <Puces>
          {SUGGESTIONS_INVENTAIRES.map((s) => (
            <Puce
              key={s}
              texte={s}
              role="button"
              actif={nom === s}
              onPress={() => {
                setNom(s);
                if (ICONE_SUGGESTION[s]) setIcone(ICONE_SUGGESTION[s]);
              }}
            />
          ))}
        </Puces>
      )}

      <Text style={sf.libelle}>Icône</Text>
      <View style={styles.icones}>
        {ICONES.map((i) => (
          <Pressable
            key={i}
            onPress={() => setIcone(i)}
            style={[styles.icone, icone === i && styles.iconeActive]}
            accessibilityRole="radio"
            accessibilityState={{ selected: icone === i }}
            accessibilityLabel={i.replace('-outline', '')}
          >
            <Ionicons name={i} size={24} color={icone === i ? theme.colors.background : theme.colors.accent} />
          </Pressable>
        ))}
      </View>

      <Bouton titre="Enregistrer" onPress={enregistrer} enCours={enCours} style={{ marginTop: theme.spacing.md }} />
      {id && <Bouton variante="discret" titre="Supprimer l’inventaire" onPress={supprimer} />}
    </ScrollView>
  );
}

const styles = creerStylesThemes(() => ({
  icones: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.xs },
  icone: {
    width: 48,
    height: 48,
    borderRadius: theme.radii.md,
    borderWidth: 1.5,
    borderColor: theme.colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconeActive: { backgroundColor: theme.colors.accent },
}));
