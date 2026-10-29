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
  grandMicro,
}: {
  valeur: string;
  onChange: (t: string) => void;
  onValider?: () => void;
  placeholder: string;
  exemples?: string[];
  autoFocus?: boolean;
  desactive?: boolean;
  // Grand bouton « Assistant » sous le champ au lieu du petit micro (⊕,
  // retours de test P-1 et P-3) : on parle, la phrase s'écrit dans le champ.
  grandMicro?: boolean;
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
        {possible && !grandMicro ? (
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
      {possible && grandMicro ? (
        <Pressable
          onPress={() => {
            if (ecoute) return arreter();
            debutDictee.current = valeur.trim();
            demarrer();
          }}
          accessibilityRole="button"
          accessibilityLabel={ecoute ? 'Arrêter l’écoute' : 'Parler à l’assistant'}
          accessibilityState={{ selected: ecoute }}
          style={({ pressed }) => [styles.grandMicro, ecoute && { backgroundColor: couleurs.accent }, pressed && { opacity: 0.85 }]}
        >
          <Icone nom={ecoute ? 'mic' : 'mic-outline'} taille={24} couleur={ecoute ? couleurs.surAccent : couleurs.fond} />
          <Text style={[styles.grandMicroTexte, ecoute && { color: couleurs.surAccent }]}>
            {ecoute ? 'J’écoute… touchez pour arrêter' : 'Assistant : parlez'}
          </Text>
        </Pressable>
      ) : null}
      {erreur ? <Text style={styles.erreur}>{erreur}</Text> : null}
      {exemples.length > 0 && !valeur ? (
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
  grandMicro: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: espaces.s,
    minHeight: 54,
    borderRadius: arrondis.champ,
    backgroundColor: couleurs.encre,
  },
  grandMicroTexte: { fontFamily: polices.texteGras, fontSize: 16, color: couleurs.fond },
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
