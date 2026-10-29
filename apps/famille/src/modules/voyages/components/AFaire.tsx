import React from 'react';
import { Text, View } from 'react-native';
import { theme, creerStylesThemes } from '../theme/theme';
import { couleurs } from '../../../theme/theme';
import { Bouton, Pastille } from './ui';
import type { ActionAFaire, EnAttente, TypeAction } from '../services/evenement';
import type { ReponseInvite } from '../services/voyage';

const SURTITRE: Record<TypeAction, string> = {
  repondre: 'PRÉSENCE',
  voter_dates: 'VOTE',
  voter_hebergement: 'VOTE',
  voter_trajet: 'VOTE',
  voter_activite: 'VOTE',
  presence_activite: 'PRÉSENCE',
  trajet_foyer: 'TRAJET',
  prendre_plat: 'MENU',
  cagnotte: 'CADEAU',
};

// Écran à ouvrir pour chaque action.
export const ECRAN_ACTION: Partial<Record<TypeAction, string>> = {
  voter_dates: 'Dates',
  voter_hebergement: 'Hebergements',
  voter_trajet: 'Transport',
  voter_activite: 'Activites',
  trajet_foyer: 'Transport',
};

const LIBELLE_BOUTON: Partial<Record<TypeAction, string>> = {
  voter_dates: 'Voir les dates proposées',
  voter_hebergement: 'Donner mon avis',
  voter_trajet: 'Voter',
  voter_activite: 'Voir les activités',
  trajet_foyer: 'Indiquer mon trajet',
};

// « À faire pour vous » : une carte par action, qui disparaît une fois faite
// (refonte § 8.2 a). Dès que c'est possible, on agit directement dessus.
export function AFaire({
  actions,
  repas,
  nomDe,
  nbDansMonFoyer,
  onOuvrir,
  onRepondre,
  onPresence,
  enCours,
}: {
  actions: ActionAFaire[];
  repas: boolean;
  nomDe: (personneId: string) => string;
  nbDansMonFoyer: number;
  onOuvrir: (ecran: string) => void;
  onRepondre: (personneId: string, reponse: ReponseInvite) => void;
  onPresence: (activiteId: string, nous: boolean) => void;
  enCours: boolean;
}) {
  const reponses: { id: ReponseInvite; libelle: string }[] = repas
    ? [
        { id: 'partant', libelle: 'Oui' },
        { id: 'peut_etre', libelle: 'Peut-être' },
        { id: 'decline', libelle: 'Non' },
      ]
    : [
        { id: 'partant', libelle: 'Partant' },
        { id: 'peut_etre', libelle: 'Peut-être' },
        { id: 'decline', libelle: 'Non' },
      ];

  return (
    <View style={{ gap: theme.spacing.sm }}>
      <View style={styles.entete}>
        <Text style={styles.titre}>À faire pour vous</Text>
        {actions.length > 0 ? (
          <Pastille texte={`${actions.length} à faire`} ton="attention" />
        ) : (
          <Pastille texte="À jour" ton="succes" />
        )}
      </View>

      {actions.length === 0 ? (
        <View style={[styles.carte, styles.carteVerte]}>
          <Text style={styles.texte}>Rien à faire pour l’instant. On vous prévient si ça change.</Text>
        </View>
      ) : null}

      {actions.map((a) => (
        <View key={`${a.type}-${a.objet_id ?? 'x'}`} style={styles.carte}>
          <Text style={styles.surtitre}>{SURTITRE[a.type]}</Text>
          <Text style={styles.texte}>
            {a.type === 'repondre' && a.objet_id ? `${a.libelle} · ${nomDe(a.objet_id)}` : a.libelle}
          </Text>
          {a.echeance ? <Text style={styles.petit}>Avant le {a.echeance.split('-').reverse().join('/')}</Text> : null}

          {a.type === 'repondre' && a.objet_id ? (
            <View style={styles.ligne}>
              {reponses.map((r) => (
                <Bouton
                  key={r.id}
                  titre={r.libelle}
                  variante="contour"
                  desactive={enCours}
                  onPress={() => onRepondre(a.objet_id!, r.id)}
                  style={{ flex: 1 }}
                />
              ))}
            </View>
          ) : null}

          {a.type === 'presence_activite' && a.objet_id ? (
            <View style={styles.ligne}>
              <Bouton
                titre={nbDansMonFoyer > 1 ? `Nous ${nbDansMonFoyer}` : 'Je viens'}
                desactive={enCours}
                onPress={() => onPresence(a.objet_id!, true)}
                style={{ flex: 1 }}
              />
              <Bouton
                titre={nbDansMonFoyer > 1 ? 'Sans nous' : 'Sans moi'}
                variante="contour"
                desactive={enCours}
                onPress={() => onPresence(a.objet_id!, false)}
                style={{ flex: 1 }}
              />
            </View>
          ) : null}

          {ECRAN_ACTION[a.type] ? (
            <Bouton titre={LIBELLE_BOUTON[a.type] ?? 'Ouvrir'} variante="contour" onPress={() => onOuvrir(ECRAN_ACTION[a.type]!)} />
          ) : null}
        </View>
      ))}
    </View>
  );
}

// « On attend… » : pour les organisateurs, qui est en retard (avec « Relancer »).
export function OnAttend({
  lignes,
  nomDe,
  relances,
  onRelancer,
}: {
  lignes: EnAttente[];
  nomDe: (personneId: string) => string;
  relances: Set<string>;
  onRelancer: (l: EnAttente) => void;
}) {
  if (lignes.length === 0) return null;
  return (
    <View style={{ gap: theme.spacing.sm }}>
      <Text style={styles.titre}>On attend…</Text>
      {lignes.map((l) => {
        const cle = `${l.personne_id}-${l.type}`;
        const relance = relances.has(cle);
        return (
          <View key={cle} style={[styles.carte, styles.carteNeutre, styles.ligneCentree]}>
            <Text style={[styles.texte, { flex: 1 }]}>
              {nomDe(l.personne_id)} · {l.libelle}
            </Text>
            <Bouton titre={relance ? 'Relancé' : 'Relancer'} variante="contour" desactive={relance} onPress={() => onRelancer(l)} />
          </View>
        );
      })}
    </View>
  );
}

const styles = creerStylesThemes(() => ({
  entete: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacing.sm },
  titre: { fontFamily: theme.fontTitle, fontSize: 18, color: theme.colors.text },
  carte: {
    gap: theme.spacing.sm,
    padding: theme.spacing.md,
    borderRadius: theme.radii.lg,
    borderWidth: 1,
    borderColor: couleurs.attention,
    backgroundColor: couleurs.attentionFond,
  },
  carteVerte: { borderColor: couleurs.succes, backgroundColor: couleurs.succesFond },
  carteNeutre: { borderColor: theme.colors.border, backgroundColor: theme.colors.surface },
  surtitre: { fontFamily: theme.fontBodyBold, fontSize: 11, letterSpacing: 1.2, color: couleurs.attention },
  texte: { fontFamily: theme.fontBody, fontSize: 15, color: theme.colors.text },
  petit: { fontFamily: theme.fontBody, fontSize: 13, color: theme.colors.textMuted },
  ligne: { flexDirection: 'row', gap: theme.spacing.sm },
  ligneCentree: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
}));
