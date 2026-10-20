import React, { useContext } from 'react';
import { KeyboardAvoidingView, type StyleProp, type ViewStyle } from 'react-native';
import { HeaderHeightContext } from '@react-navigation/elements';

// Zone qui se réduit quand le clavier s'ouvre, pour que le champ en cours de
// saisie reste visible au-dessus du clavier (retour utilisateur : "le
// clavier se retrouve au-dessus de la zone de texte, on ne voit rien").
//
// Pourquoi c'est nécessaire : depuis Expo SDK 54, l'application s'affiche
// "edge-to-edge" sur Android — la fenêtre n'est plus redimensionnée par le
// système quand le clavier apparaît. Il faut donc réserver la place du
// clavier nous-mêmes, sur Android comme sur iOS ("padding").
//
// À placer à la racine de tout écran qui contient des champs de saisie ;
// un ScrollView à l'intérieur se charge ensuite de garder le champ actif
// visible. `sansEnTete` : pour les écrans sans en-tête et les fenêtres
// modales (le décalage de l'en-tête ne s'applique pas).
export default function ZoneClavier({
  children,
  style,
  sansEnTete = false,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  sansEnTete?: boolean;
}) {
  const hauteurEnTete = useContext(HeaderHeightContext) ?? 0;
  return (
    <KeyboardAvoidingView
      style={[{ flex: 1 }, style]}
      behavior="padding"
      keyboardVerticalOffset={sansEnTete ? 0 : hauteurEnTete}
    >
      {children}
    </KeyboardAvoidingView>
  );
}
