import React, { useLayoutEffect, useRef } from 'react';
import { Platform, TextInput, type TextInputProps } from 'react-native';

// Zone de texte multiligne qui s'agrandit avec son contenu (retour
// utilisateur : "la taille des zones de texte n'est plus extensible en
// fonction du contenu").
//
// - Sur téléphone (Android, iOS) : un champ multiligne grandit déjà tout seul
//   avec son texte. On ne fixe surtout PAS sa hauteur nous-mêmes : la mesure
//   renvoyée inclut la hauteur imposée, et le champ gonflait à chaque mesure
//   (retour utilisateur : "immenses, pleins de lignes vierges").
// - Dans un navigateur : une zone de texte ne grandit pas seule. On ajuste
//   sa hauteur directement sur l'élément de la page à chaque changement de
//   texte (hauteur remise à zéro, puis mesure du contenu), sans passer par
//   l'état React. L'ancienne version mémorisait la hauteur dans l'état :
//   après un "couper" ou la suppression d'un long passage, le champ ne
//   rétrécissait que de quelques pixels par mesure, chaque mesure relançant
//   un affichage, jusqu'à la page blanche (retour utilisateur).
export default function ChampExtensible({
  hauteurMin = 70,
  style,
  ...props
}: TextInputProps & { hauteurMin?: number }) {
  const ref = useRef<TextInput>(null);

  useLayoutEffect(() => {
    if (Platform.OS !== 'web') return;
    const element = ref.current as unknown as HTMLTextAreaElement | null;
    if (!element || !element.style) return;
    element.style.height = '0px';
    // scrollHeight ne compte pas les bordures, que la hauteur inclut.
    const bordures = element.offsetHeight - element.clientHeight;
    element.style.height = `${Math.max(hauteurMin, element.scrollHeight + bordures)}px`;
  }, [props.value, hauteurMin]);

  if (Platform.OS !== 'web') {
    return (
      <TextInput
        {...props}
        multiline
        style={[style, { minHeight: hauteurMin, textAlignVertical: 'top' }]}
      />
    );
  }

  return (
    <TextInput
      {...props}
      ref={ref}
      multiline
      scrollEnabled={false}
      style={[style, { minHeight: hauteurMin, textAlignVertical: 'top' }]}
    />
  );
}
