import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { theme, creerStylesThemes } from '../theme/theme';
import { Bouton } from './ui';
import { alerte } from '../utils/alerte';
import { extraireMessageErreur } from '@apps-famille/famille';
import {
  activerRappels,
  jetonRappels,
  masquerProposition,
  messageResultat,
  propositionMasquee,
  rafraichirRappels,
  rappelsPossibles,
} from '../services/notifications';

// Accueil, sur téléphone : propose une fois d'activer les rappels de la
// veille ; s'ils sont déjà activés, ré-inscrit discrètement le téléphone.
export default function PropositionRappels() {
  const [visible, setVisible] = useState(false);
  const [enCours, setEnCours] = useState(false);

  useEffect(() => {
    if (!rappelsPossibles()) return;
    let actif = true;
    (async () => {
      if (await jetonRappels()) {
        rafraichirRappels();
      } else if (!(await propositionMasquee()) && actif) {
        setVisible(true);
      }
    })();
    return () => {
      actif = false;
    };
  }, []);

  if (!visible) return null;

  const activer = async () => {
    setEnCours(true);
    try {
      const r = await activerRappels();
      alerte(r === 'ok' ? 'Rappels activés' : 'Rappels non activés', messageResultat(r));
      if (r === 'ok') setVisible(false);
    } catch (e) {
      alerte('Rappels non activés', extraireMessageErreur(e, 'Veuillez réessayer.'));
    } finally {
      setEnCours(false);
    }
  };

  return (
    <View style={styles.carte}>
      <Text style={styles.titre}>Un rappel la veille ?</Text>
      <Text style={styles.texte}>
        Une notification la veille quand vous conduisez, et une alerte quand un trajet n’a pas encore de conducteur.
      </Text>
      <View style={styles.boutons}>
        <View style={styles.bouton}>
          <Bouton
            variante="contour"
            titre="Plus tard"
            onPress={() => {
              masquerProposition();
              setVisible(false);
            }}
          />
        </View>
        <View style={styles.bouton}>
          <Bouton titre="Activer" onPress={activer} enCours={enCours} />
        </View>
      </View>
    </View>
  );
}

const styles = creerStylesThemes(() => ({
  carte: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.accent,
    borderWidth: 1.5,
    borderRadius: theme.radii.lg,
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  titre: { fontFamily: theme.fontBodyBold, fontSize: 16, color: theme.colors.text },
  texte: { fontFamily: theme.fontBody, fontSize: 14, color: theme.colors.textMuted },
  boutons: { flexDirection: 'row', gap: theme.spacing.sm },
  bouton: { flex: 1 },
}));
