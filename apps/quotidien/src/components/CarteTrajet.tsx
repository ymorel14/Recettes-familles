import React from 'react';
import { Pressable, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { theme, creerStylesThemes } from '../theme/theme';
import { heureCourte, type Trajet } from '../services/quotidien';
import { Bouton } from './ui';

type Props = {
  trajet: Omit<Trajet, 'groupe_id'>;
  // Nom du conducteur (null = personne).
  conducteur: string | null;
  // Je conduis ce trajet.
  moi: boolean;
  // Nom du groupe, affiché quand on a plusieurs groupes.
  groupe?: string | null;
  // Mes enfants du groupe, à inscrire ou retirer d'un geste.
  mesEnfants: { id: string; prenom: string }[];
  enCours?: boolean;
  onPrendre: () => void;
  // Accepter le trajet que le planning m'a proposé.
  onAccepter: () => void;
  onLaisser: () => void;
  onBasculerEnfant: (enfantId: string, inscrire: boolean) => void;
};

// Un trajet : heure, sens, activité, lieu, conducteur, enfants transportés
// et actions (je conduis / je ne peux plus, mes enfants à bord).
export default function CarteTrajet({
  trajet,
  conducteur,
  moi,
  groupe,
  mesEnfants,
  enCours,
  onPrendre,
  onAccepter,
  onLaisser,
  onBasculerEnfant,
}: Props) {
  const annule = trajet.statut === 'annulee';
  const libre = !trajet.conducteur_id;
  const propose = !!trajet.conducteur_id && trajet.propose;
  const aBord = new Set(trajet.enfants.map((e) => e.id));
  const placesRestantes = Math.max(0, trajet.places - trajet.enfants.length);

  return (
    <View style={[styles.carte, (moi || libre) && !annule && styles.carteAccent, annule && styles.carteAnnulee]}>
      <View style={styles.ligne}>
        <Text style={styles.heure}>{heureCourte(trajet.heure)}</Text>
        <Ionicons
          name={trajet.sens === 'aller' ? 'arrow-forward-circle-outline' : 'arrow-back-circle-outline'}
          size={18}
          color={theme.colors.textMuted}
        />
        <Text style={styles.activite} numberOfLines={1}>
          {trajet.activite} · {trajet.sens}
        </Text>
      </View>
      {(trajet.lieu || groupe) && (
        <Text style={styles.detail}>{[trajet.lieu, groupe].filter(Boolean).join(' · ')}</Text>
      )}
      {annule ? (
        <Text style={[styles.conducteur, { color: theme.colors.textMuted }]}>Séance annulée</Text>
      ) : (
        <Text style={[styles.conducteur, libre && { color: theme.colors.warning }]}>
          {libre
            ? 'Personne ne conduit encore'
            : propose
              ? moi
                ? 'Proposé pour vous : pouvez-vous conduire ?'
                : `Proposé à ${conducteur ?? '…'} (en attente)`
              : moi
                ? 'C’est vous qui conduisez'
                : `Conduit par ${conducteur ?? '…'}`}
          {!libre && trajet.places > 0 ? ` · ${placesRestantes} place${placesRestantes > 1 ? 's' : ''} libre${placesRestantes > 1 ? 's' : ''}` : ''}
        </Text>
      )}
      {trajet.enfants.length > 0 && (
        <Text style={styles.detail}>À bord : {trajet.enfants.map((e) => e.prenom).join(', ')}</Text>
      )}

      {!annule && mesEnfants.length > 0 && (
        <View style={styles.enfants}>
          {mesEnfants.map((e) => {
            const inscrit = aBord.has(e.id);
            return (
              <Pressable
                key={e.id}
                onPress={() => onBasculerEnfant(e.id, !inscrit)}
                disabled={enCours}
                style={[styles.puce, inscrit && styles.puceActive]}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: inscrit }}
                accessibilityLabel={`${e.prenom} dans ce trajet`}
              >
                <Ionicons
                  name={inscrit ? 'checkmark-circle' : 'add-circle-outline'}
                  size={16}
                  color={inscrit ? theme.colors.background : theme.colors.accent}
                />
                <Text style={[styles.puceTexte, inscrit && { color: theme.colors.background }]}>{e.prenom}</Text>
              </Pressable>
            );
          })}
        </View>
      )}

      {!annule && libre && <Bouton titre="Je conduis" onPress={onPrendre} enCours={enCours} />}
      {!annule && moi && propose && (
        <View style={styles.boutons}>
          <View style={styles.bouton}>
            <Bouton variante="contour" titre="Je ne peux pas" onPress={onLaisser} desactive={enCours} />
          </View>
          <View style={styles.bouton}>
            <Bouton titre="J’accepte" onPress={onAccepter} enCours={enCours} />
          </View>
        </View>
      )}
      {!annule && moi && !propose && (
        <Bouton variante="discret" titre="Je ne peux plus conduire" onPress={onLaisser} desactive={enCours} />
      )}
    </View>
  );
}

const styles = creerStylesThemes(() => ({
  carte: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radii.lg,
    padding: theme.spacing.md,
    gap: 6,
  },
  carteAccent: { borderColor: theme.colors.accent, borderWidth: 1.5 },
  boutons: { flexDirection: 'row', gap: theme.spacing.sm },
  bouton: { flex: 1 },
  carteAnnulee: { opacity: 0.6 },
  ligne: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs },
  heure: { fontFamily: theme.fontBodyBold, fontSize: 17, color: theme.colors.accent, minWidth: 48 },
  activite: { flex: 1, fontFamily: theme.fontBodyBold, fontSize: 16, color: theme.colors.text },
  conducteur: { fontFamily: theme.fontBodyBold, fontSize: 14, color: theme.colors.text },
  detail: { fontFamily: theme.fontBody, fontSize: 14, color: theme.colors.textMuted },
  enfants: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.xs },
  puce: {
    minHeight: 36,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: theme.colors.accent,
  },
  puceActive: { backgroundColor: theme.colors.accent },
  puceTexte: { fontFamily: theme.fontBodyBold, fontSize: 14, color: theme.colors.accent },
}));
