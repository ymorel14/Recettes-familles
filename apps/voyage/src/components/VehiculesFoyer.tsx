import React, { useCallback, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { theme, creerStylesThemes } from '../theme/theme';
import { useAuth } from '../contexts/AuthContext';
import { enregistrerAdresseFoyer, infoEnergie, lireAdresseFoyer, listerVehicules } from '../services/transport';
import { Champ, Erreur } from './formulaire';
import type { Vehicule } from '../services/voyage';
import { Bouton } from './ui';

// Section du Profil « Pour les voyages » : adresse du foyer (départ par
// défaut des trajets, visible de son seul foyer) et véhicules du foyer.
export default function VehiculesFoyer() {
  const { foyer } = useAuth();
  const navigation = useNavigation<any>();
  const [vehicules, setVehicules] = useState<Vehicule[]>([]);
  const [adresse, setAdresse] = useState('');
  const [adresseEnregistree, setAdresseEnregistree] = useState('');
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!foyer) return;
      listerVehicules([foyer.id])
        .then(setVehicules)
        .catch(() => setVehicules([]));
      lireAdresseFoyer(foyer.id)
        .then((a) => {
          setAdresse(a ?? '');
          setAdresseEnregistree(a ?? '');
        })
        .catch(() => {});
    }, [foyer])
  );

  const enregistrerAdresse = async () => {
    if (!foyer) return;
    setErreur(null);
    setEnCours(true);
    try {
      await enregistrerAdresseFoyer(foyer.id, adresse);
      setAdresseEnregistree(adresse.trim());
    } catch (e: any) {
      setErreur(e?.message ?? 'Enregistrement impossible.');
    } finally {
      setEnCours(false);
    }
  };

  return (
    <View style={styles.section}>
      <Text style={styles.titre}>Pour les voyages</Text>

      <Text style={styles.sousTitre} nativeID="libelle-adresse-foyer">Adresse du foyer</Text>
      <Text style={styles.aide}>
        Point de départ de vos trajets, calculés automatiquement. Visible seulement des membres de votre foyer : les
        autres ne voient que la ville.
      </Text>
      <Champ
        value={adresse}
        onChangeText={setAdresse}
        placeholder="Ex. 12 rue Jeanne d’Arc, 76000 Rouen"
        accessibilityLabelledBy="libelle-adresse-foyer"
      />
      {adresse.trim() !== adresseEnregistree && (
        <Bouton titre={adresse.trim() ? 'Enregistrer l’adresse' : 'Effacer l’adresse'} onPress={enregistrerAdresse} enCours={enCours} />
      )}
      <Erreur texte={erreur} />

      <Text style={styles.sousTitre}>Véhicules du foyer</Text>
      <Text style={styles.aide}>Proposés à chaque trajet en voiture : plus besoin de ressaisir la consommation.</Text>
      {vehicules.map((v) => {
        const e = infoEnergie(v.energie);
        return (
          <Pressable
            key={v.id}
            style={styles.ligne}
            onPress={() => navigation.navigate('Vehicule', { vehicule: v })}
            accessibilityRole="button"
            accessibilityLabel={`Modifier ${v.nom}`}
          >
            <Ionicons name={v.energie === 'electrique' ? 'flash-outline' : 'car-outline'} size={20} color={theme.colors.accent} />
            <View style={{ flex: 1 }}>
              <Text style={styles.nom}>{v.nom}</Text>
              <Text style={styles.aide}>
                {e.libelle} · {String(v.consommation).replace('.', ',')} {e.unite}/100 km
                {v.places ? ` · ${v.places} places` : ''}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />
          </Pressable>
        );
      })}
      <Bouton titre="+ Ajouter un véhicule" variante="pointille" onPress={() => navigation.navigate('Vehicule')} />
    </View>
  );
}

const styles = creerStylesThemes(() => ({
  section: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radii.lg,
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  titre: { fontFamily: theme.fontBodyBold, fontSize: 17, color: theme.colors.text },
  sousTitre: { fontFamily: theme.fontBodyBold, fontSize: 15, color: theme.colors.text, marginTop: theme.spacing.xs },
  aide: { fontFamily: theme.fontBody, fontSize: 13, color: theme.colors.textMuted },
  ligne: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, minHeight: 44 },
  nom: { fontFamily: theme.fontBodyBold, fontSize: 15, color: theme.colors.text },
}));
