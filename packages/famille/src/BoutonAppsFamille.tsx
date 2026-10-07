import React from 'react';
import { Platform, Pressable, Text } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { baseWeb } from './appsFamille';

// Bouton « Apps » (en-tête des onglets de chaque app) : revient à l'accueil
// du site commun, d'où l'on ouvre une autre app de la famille.
//
// Sur iPad / iPhone, une page ajoutée à l'écran d'accueil garde sa PROPRE
// session : deux icônes (ex. Recettes et Cadeaux) = deux connexions. En
// n'installant que l'accueil et en passant d'une app à l'autre par ce
// bouton, on reste dans la même « appli web » : une seule connexion.
//
// Web seulement, et seulement sur le site commun (baseWeb() non vide) :
// sur téléphone, chaque app est une app à part (voir connexionPartagee.ts).
export function BoutonAppsFamille({ couleur, police }: { couleur: string; police?: string }) {
  if (Platform.OS !== 'web' || !baseWeb() || typeof window === 'undefined') return null;
  return (
    <Pressable
      // Même onglet, même adresse de site : on ne quitte pas l'appli web.
      onPress={() => window.location.assign('/')}
      accessibilityRole="link"
      accessibilityLabel="Toutes les apps de la famille"
      hitSlop={6}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        minHeight: 44,
        paddingHorizontal: 12,
        opacity: pressed ? 0.6 : 1,
      })}
    >
      <Ionicons name="apps-outline" size={22} color={couleur} />
      <Text style={{ fontFamily: police, fontSize: 14, color: couleur }}>Apps</Text>
    </Pressable>
  );
}
