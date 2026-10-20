import React, { useRef } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { useDictee } from './useDictee';
import { Icone } from './ui';
import { arrondis, couleurs, creerStyles, espaces, polices } from '../theme/theme';

// Champ « Dites ou écrivez… » avec micro (charte § 7.1 et § 7.6) : micro
// activé = bouton plein corail « J'écoute… » ; exemples de phrases en puces
// sous le champ.
export function ChampAssistant({
  valeur,
  onChange,
  onValider,
  placeholder,
  exemples = [],
  autoFocus,
  desactive,
}: {
  valeur: string;
  onChange: (t: string) => void;
  onValider?: () => void;
  placeholder: string;
  exemples?: string[];
  autoFocus?: boolean;
  desactive?: boolean;
}) {
  const debutDictee = useRef('');
  const { ecoute, erreur, demarrer, arreter, possible } = useDictee((texte) => {
    onChange(debutDictee.current ? `${debutDictee.current} ${texte}` : texte);
  });

  return (
    <View style={{ gap: espaces.s }}>
      <View style={[styles.cadre, ecoute && { borderColor: couleurs.accent }]}>
        <TextInput
          value={valeur}
          onChangeText={onChange}
          placeholder={ecoute ? 'J’écoute…' : placeholder}
          placeholderTextColor={couleurs.encreDouce}
          style={styles.champ}
          multiline
          autoFocus={autoFocus}
          editable={!desactive}
          returnKeyType="send"
          blurOnSubmit
          onSubmitEditing={onValider}
          accessibilityLabel={placeholder}
        />
        {possible ? (
          <Pressable
            onPress={() => {
              if (ecoute) return arreter();
              debutDictee.current = valeur.trim();
              demarrer();
            }}
            accessibilityRole="button"
            accessibilityLabel={ecoute ? 'Arrêter la dictée' : 'Dicter'}
            accessibilityState={{ selected: ecoute }}
            style={[styles.micro, ecoute ? { backgroundColor: couleurs.accent } : null]}
          >
            <Icone nom={ecoute ? 'mic' : 'mic-outline'} taille={22} couleur={ecoute ? couleurs.surAccent : couleurs.encre} />
            {ecoute ? <Text style={styles.ecoute}>J’écoute…</Text> : null}
          </Pressable>
        ) : null}
      </View>
      {erreur ? <Text style={styles.erreur}>{erreur}</Text> : null}
      {exemples.length && !valeur ? (
        <View style={styles.exemples}>
          {exemples.map((e) => (
            <Pressable key={e} onPress={() => onChange(e)} accessibilityRole="button" accessibilityLabel={`Exemple : ${e}`} style={styles.exemple}>
              <Text style={styles.exempleTexte}>{e}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = creerStyles(() => ({
  cadre: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: espaces.s,
    minHeight: 56,
    borderRadius: arrondis.champ,
    borderWidth: 1.5,
    borderColor: couleurs.ligne,
    backgroundColor: couleurs.surface,
    paddingLeft: espaces.l,
    paddingRight: 6,
    paddingVertical: 6,
  },
  champ: {
    flex: 1,
    minHeight: 44,
    maxHeight: 140,
    paddingVertical: 10,
    fontFamily: polices.texte,
    fontSize: 16,
    lineHeight: 22,
    color: couleurs.encre,
  },
  micro: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minWidth: 44,
    height: 44,
    paddingHorizontal: 10,
    borderRadius: 22,
    justifyContent: 'center',
    backgroundColor: couleurs.segment,
  },
  ecoute: { fontFamily: polices.texteGras, fontSize: 13, color: couleurs.surAccent },
  erreur: { fontFamily: polices.texteDemiGras, fontSize: 13, color: couleurs.attention },
  exemples: { flexDirection: 'row', flexWrap: 'wrap', gap: espaces.s },
  exemple: {
    minHeight: 34,
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderRadius: arrondis.pilule,
    backgroundColor: couleurs.segment,
  },
  exempleTexte: { fontFamily: polices.texteMoyen, fontSize: 13, color: couleurs.encre },
}));
