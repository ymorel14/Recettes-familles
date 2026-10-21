import React from 'react';
import { Text, View } from 'react-native';
import { Carte } from './ui';
import { Etincelle } from './assistant';
import { couleurs, couleursModule, creerStyles, espaces, polices } from '../theme/theme';
import { ouvrirCible } from '../navigation/navigationRef';
import type { PhraseResume } from '../services/resumeMatin';
import type { IdModule } from '../theme/jetons';

// Résumé du matin (charte § 7.5) : une carte en surface, 2 ou 3 phrases
// courtes, l'étincelle en petit ; chaque élément qui mène quelque part est
// souligné et ouvre l'écran concerné. Pas de grand bloc coloré.
export function ResumeMatin({ phrases }: { phrases: PhraseResume[] }) {
  if (!phrases.length) return null;
  return (
    <Carte style={styles.carte}>
      <View style={styles.entete} accessible accessibilityRole="header" accessibilityLabel="Résumé du matin, par l’assistant">
        <Etincelle taille={12} couleur={couleurs.encreDouce} />
        <Text style={styles.libelle}>Résumé du matin</Text>
      </View>
      {phrases.map((p, i) => (
        <Text key={i} style={styles.phrase}>
          {p.morceaux.map((m, j) =>
            m.cible ? (
              <Text
                key={j}
                style={[styles.lien, m.module && couleursModule(m.module as IdModule) ? { textDecorationColor: couleursModule(m.module as IdModule).encre } : null]}
                onPress={() => ouvrirCible(m.cible!)}
                accessibilityRole="link"
                suppressHighlighting={false}
              >
                {m.texte}
              </Text>
            ) : (
              <Text key={j}>{m.texte}</Text>
            )
          )}
        </Text>
      ))}
    </Carte>
  );
}

const styles = creerStyles(() => ({
  carte: { gap: espaces.s, paddingVertical: espaces.l },
  entete: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  libelle: {
    fontFamily: polices.texteGras,
    fontSize: 12,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: couleurs.encreDouce,
  },
  phrase: { fontFamily: polices.texte, fontSize: 15, lineHeight: 22, color: couleurs.encre },
  lien: {
    fontFamily: polices.texteDemiGras,
    textDecorationLine: 'underline',
    textDecorationStyle: 'solid',
  },
}));
