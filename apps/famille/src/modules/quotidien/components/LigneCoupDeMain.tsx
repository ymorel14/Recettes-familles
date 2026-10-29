import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { theme, creerStylesThemes } from '../theme/theme';
import type { CoupDeMainSemaine } from '../services/maison';

// Un coup de main de la semaine : état, pastilles N/total et compteur.
// « Encore 2 fois d'ici dimanche », « 1 en attente de validation »,
// « C'est bon pour la semaine ».
export function etatCoupDeMain(a: CoupDeMainSemaine): string {
  if (a.n >= a.total) return 'C’est bon pour la semaine';
  const reste = a.total - a.n;
  if (a.en_attente > 0) return `${a.en_attente} en attente de validation`;
  return `Encore ${reste} fois d’ici dimanche`;
}

export default function LigneCoupDeMain({
  aide,
  onAjouter,
  enCours = false,
}: {
  aide: CoupDeMainSemaine;
  // Le parent ajoute une réalisation à la place de l'enfant.
  onAjouter?: (aide: CoupDeMainSemaine) => void;
  enCours?: boolean;
}) {
  const atteint = aide.n >= aide.total;
  const bloque = atteint || (aide.max_un_par_jour && aide.fait_aujourdhui);
  const pastilles = Array.from({ length: Math.min(aide.total, 14) }, (_, i) => i);
  return (
    <View
      style={styles.ligne}
      accessible
      accessibilityLabel={`${aide.libelle}, ${aide.n} sur ${aide.total}. ${etatCoupDeMain(aide)}`}
    >
      <View style={styles.haut}>
        <View style={{ flex: 1 }}>
          <Text style={styles.nom}>{aide.libelle}</Text>
          <Text style={styles.etat}>{etatCoupDeMain(aide)}</Text>
        </View>
        <Text style={styles.compteur}>
          {aide.n}/{aide.total}
        </Text>
      </View>
      <View style={styles.pastilles}>
        {pastilles.map((i) => (
          <View
            key={i}
            style={[
              styles.pastille,
              i < aide.n && styles.pastillePleine,
              i >= aide.n && i < aide.n + aide.en_attente && styles.pastilleAttente,
            ]}
          />
        ))}
      </View>
      {onAjouter && !atteint ? (
        <Pressable
          onPress={() => onAjouter(aide)}
          disabled={bloque || enCours}
          accessibilityRole="button"
          accessibilityLabel={`Ajouter un ${aide.libelle}`}
          style={[styles.ajouter, (bloque || enCours) && { opacity: 0.4 }]}
        >
          <Text style={styles.ajouterTexte}>{aide.max_un_par_jour && aide.fait_aujourdhui ? 'Déjà fait aujourd’hui' : '+ Un de plus'}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = creerStylesThemes(() => ({
  ligne: { gap: 6, paddingVertical: theme.spacing.xs },
  haut: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
  nom: { fontFamily: theme.fontBodyBold, fontSize: 15, color: theme.colors.text },
  etat: { fontFamily: theme.fontBody, fontSize: 13, color: theme.colors.textMuted },
  compteur: { fontFamily: theme.fontTitle, fontSize: 20, color: theme.colors.accent },
  pastilles: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  pastille: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 1.5,
    borderColor: theme.colors.accent,
  },
  pastillePleine: { backgroundColor: theme.colors.accent },
  pastilleAttente: { backgroundColor: theme.colors.accentTransparent },
  ajouter: { minHeight: 44, justifyContent: 'center' },
  ajouterTexte: { fontFamily: theme.fontBodyBold, fontSize: 14, color: theme.colors.accent },
}));
