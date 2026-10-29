import React from 'react';
import { Text, View } from 'react-native';
import { theme, creerStylesThemes } from '../theme/theme';
import { formaterDate } from '../services/personnes';
import { formaterEuros } from '../services/hebergements';
import { ETAPES_REPAS, type Repas } from '../services/repas';
import type { Activite } from '../services/activites';

// Synthèse d'un événement : la vue « tout est là », en lecture seule
// (refonte Événements § 8.3). Ce qui n'est pas encore décidé est dit
// clairement, en orange, au lieu d'être présenté comme acquis.
export function Synthese({
  quand,
  lieu,
  partants,
  attendus,
  logement,
  transport,
  activites,
  repas,
  budgetTotal,
  nomDe,
  cadeau,
}: {
  quand: string;
  lieu: string | null;
  partants: number;
  attendus: number;
  logement: string | null;
  transport: string | null;
  activites: Activite[];
  repas: Repas[];
  budgetTotal: number;
  nomDe: (personneId: string) => string;
  cadeau: { titre: string; offertPar: string | null }[];
}) {
  const retenues = activites.filter((a) => a.statut === 'retenu');
  const aDecider = activites.filter((a) => a.statut === 'propose');
  const jours = [...new Set(retenues.filter((a) => a.jour).map((a) => a.jour!))].sort();
  const sansJour = retenues.filter((a) => !a.jour);

  const platsAvecQui = repas.map((r) => ({ repas: r, plats: r.plats.filter((p) => p.responsables.length > 0) }));
  const platsSansPersonne = repas.reduce((n, r) => n + r.plats.filter((p) => p.responsables.length === 0).length, 0);
  const libelleEtape = (id: string) => ETAPES_REPAS.find((e) => e.id === id)?.libelle ?? 'Proposé par la famille';

  return (
    <View style={{ gap: theme.spacing.sm }}>
      <View style={styles.bloc}>
        <Text style={styles.titre}>En bref</Text>
        <Text style={styles.texte}>{quand}</Text>
        {lieu ? <Text style={styles.texte}>{lieu}</Text> : <Text style={styles.attente}>Lieu pas encore décidé</Text>}
        <Text style={styles.petit}>
          {partants} partant{partants > 1 ? 's' : ''} · {attendus} attendu{attendus > 1 ? 's' : ''}
        </Text>
      </View>

      {activites.length > 0 ? (
        <View style={styles.bloc}>
          <Text style={styles.titre}>Jour par jour</Text>
          {jours.map((j) => (
            <View key={j} style={{ gap: 2 }}>
              <Text style={styles.sousTitre}>{formaterDate(j)}</Text>
              {retenues
                .filter((a) => a.jour === j)
                .map((a) => (
                  <Text key={a.id} style={styles.texte}>
                    • {a.titre}
                  </Text>
                ))}
            </View>
          ))}
          {sansJour.length > 0 ? (
            <View style={{ gap: 2 }}>
              <Text style={styles.sousTitre}>Retenu, jour à choisir</Text>
              {sansJour.map((a) => (
                <Text key={a.id} style={styles.texte}>
                  • {a.titre}
                </Text>
              ))}
            </View>
          ) : null}
          {aDecider.length > 0 ? (
            <View style={{ gap: 2 }}>
              <Text style={styles.attente}>Pas encore décidé</Text>
              {aDecider.map((a) => (
                <Text key={a.id} style={styles.petit}>
                  • {a.titre}
                </Text>
              ))}
            </View>
          ) : null}
        </View>
      ) : null}

      {logement || transport ? (
        <View style={styles.bloc}>
          <Text style={styles.titre}>Sur place</Text>
          {logement ? <Text style={styles.texte}>Logement : {logement}</Text> : null}
          {transport ? <Text style={styles.texte}>Trajet : {transport}</Text> : null}
        </View>
      ) : null}

      {repas.length > 0 ? (
        <View style={styles.bloc}>
          <Text style={styles.titre}>Au menu</Text>
          {platsAvecQui.map(({ repas: r, plats }) =>
            plats.length > 0 ? (
              <View key={r.id} style={{ gap: 2 }}>
                {repas.length > 1 ? <Text style={styles.sousTitre}>{r.titre}</Text> : null}
                {plats.map((p) => (
                  <Text key={p.id} style={styles.texte}>
                    • {p.titre}{' '}
                    <Text style={styles.petit}>
                      ({libelleEtape(p.etape).toLowerCase()} · {p.responsables.map((x) => nomDe(x.personne_id)).join(', ')})
                    </Text>
                  </Text>
                ))}
              </View>
            ) : null
          )}
          {platsSansPersonne > 0 ? (
            <Text style={styles.attente}>
              {platsSansPersonne} plat{platsSansPersonne > 1 ? 's' : ''} sans personne : non affiché{platsSansPersonne > 1 ? 's' : ''} ici
            </Text>
          ) : null}
        </View>
      ) : null}

      {cadeau.length > 0 ? (
        <View style={styles.bloc}>
          <Text style={styles.titre}>Cadeau</Text>
          {cadeau.map((c, i) => (
            <Text key={i} style={styles.texte}>
              • {c.titre}
              {c.offertPar ? <Text style={styles.petit}> (offert par {c.offertPar})</Text> : null}
            </Text>
          ))}
        </View>
      ) : null}

      {budgetTotal > 0 ? (
        <View style={styles.bloc}>
          <Text style={styles.titre}>Budget</Text>
          <Text style={styles.texte}>{formaterEuros(budgetTotal)} estimés pour l’instant</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = creerStylesThemes(() => ({
  bloc: {
    gap: theme.spacing.xs,
    padding: theme.spacing.md,
    borderRadius: theme.radii.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  titre: { fontFamily: theme.fontTitle, fontSize: 18, color: theme.colors.text },
  sousTitre: { fontFamily: theme.fontBodyBold, fontSize: 14, color: theme.colors.text, marginTop: theme.spacing.xs },
  texte: { fontFamily: theme.fontBody, fontSize: 15, color: theme.colors.text },
  petit: { fontFamily: theme.fontBody, fontSize: 13, color: theme.colors.textMuted },
  attente: { fontFamily: theme.fontBodyBold, fontSize: 14, color: theme.colors.warning },
}));
