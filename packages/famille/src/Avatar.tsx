import React, { useState } from 'react';
import { Image, Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import { colors } from '@apps-famille/theme';
import { fichePhoto, usePhotosFamille, type ReperePersonne } from './photos';

// Petite photo ronde d'une personne de la famille, à côté de son prénom,
// dans toutes les apps. Sans photo : l'initiale du prénom dans un rond.
// La personne est désignée par sa fiche (personneId) ou par son compte
// (utilisateurId) ; le prénom sert à l'initiale quand on le connaît déjà.
//
// Taille par défaut 24 points : lisible à côté d'un texte courant sans
// agrandir les lignes (28 à 32 pour une liste de personnes, 72 sur le profil).

export type ProprietesAvatar = ReperePersonne & {
  prenom?: string | null;
  taille?: number;
  style?: StyleProp<ViewStyle>;
};

export function Avatar({ personneId, utilisateurId, prenom, taille = 24, style }: ProprietesAvatar) {
  usePhotosFamille();
  const fiche = fichePhoto({ personneId, utilisateurId });
  const [echec, setEchec] = useState<string | null>(null);
  const url = fiche?.url && fiche.url !== echec ? fiche.url : null;
  const nom = (prenom ?? fiche?.prenom ?? '').trim();
  const initiale = nom ? nom.charAt(0).toLocaleUpperCase('fr-FR') : '?';

  const rond: ViewStyle = {
    width: taille,
    height: taille,
    borderRadius: taille / 2,
    overflow: 'hidden',
    backgroundColor: colors.selection,
    borderWidth: taille >= 40 ? 2 : 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  };

  return (
    <View style={[rond, style]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {url ? (
        <Image
          source={{ uri: url }}
          style={{ width: taille, height: taille }}
          resizeMode="cover"
          onError={() => setEchec(url)}
        />
      ) : (
        <Text
          style={{
            fontSize: Math.round(taille * 0.46),
            lineHeight: Math.round(taille * 0.6),
            fontWeight: '700',
            color: colors.accent,
            textAlign: 'center',
          }}
          allowFontScaling={false}
        >
          {initiale}
        </Text>
      )}
    </View>
  );
}

// Prénom précédé de sa photo, sur une ligne : remplace un <Text> qui
// affichait un prénom seul (liste de personnes, puce, auteur…).
export function NomAvecAvatar({
  personneId,
  utilisateurId,
  prenom,
  taille = 24,
  style,
  styleTexte,
  numberOfLines,
  children,
}: ProprietesAvatar & {
  styleTexte?: StyleProp<TextStyle>;
  numberOfLines?: number;
  // Texte affiché (par défaut, le prénom).
  children?: React.ReactNode;
}) {
  return (
    <View style={[{ flexDirection: 'row', alignItems: 'center', gap: Math.max(4, Math.round(taille / 4)) }, style]}>
      <Avatar personneId={personneId} utilisateurId={utilisateurId} prenom={prenom} taille={taille} />
      <Text style={[{ flexShrink: 1 }, styleTexte]} numberOfLines={numberOfLines}>
        {children ?? prenom}
      </Text>
    </View>
  );
}

// Plusieurs personnes à la suite (« Oui : [photo] Léo, [photo] Sybille »),
// sur une ou plusieurs lignes : remplace un texte qui joignait des prénoms.
export function GroupeNoms({
  personnes,
  prefixe,
  suffixe,
  taille = 20,
  style,
  styleTexte,
}: {
  personnes: (ReperePersonne & { prenom: string; cle?: string })[];
  // Texte avant la liste (« Oui : ») et après (« : chut ! »).
  prefixe?: string;
  suffixe?: string;
  taille?: number;
  style?: StyleProp<ViewStyle>;
  styleTexte?: StyleProp<TextStyle>;
}) {
  if (personnes.length === 0) return null;
  return (
    <View style={[{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 4, rowGap: 4 }, style]}>
      {prefixe ? <Text style={styleTexte}>{prefixe}</Text> : null}
      {personnes.map((p, i) => (
        <View
          key={p.cle ?? p.personneId ?? p.utilisateurId ?? `${p.prenom}-${i}`}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
        >
          <Avatar personneId={p.personneId} utilisateurId={p.utilisateurId} prenom={p.prenom} taille={taille} />
          <Text style={styleTexte}>
            {p.prenom}
            {i < personnes.length - 1 ? ',' : ''}
          </Text>
        </View>
      ))}
      {suffixe ? <Text style={styleTexte}>{suffixe}</Text> : null}
    </View>
  );
}
