import React, { useMemo } from 'react';
import { View, Text } from 'react-native';
import { theme, creerStylesThemes } from '../theme/theme';
import { MOIS } from '../services/personnes';
import { synthetiser, type PropositionSynthese } from '../services/syntheseDates';

// Vue d'ensemble de propositions de dates proches ou qui se chevauchent :
// une barre par proposition sur un même axe des jours (plus elle est
// foncée, plus elle a de « oui »), puis, jour par jour, combien de
// personnes ont dit oui à une proposition qui couvre ce jour. Les jours qui
// conviennent au plus de monde sont annoncés en clair dessous.

const JOURS_COURTS = ['di', 'lu', 'ma', 'me', 'je', 've', 'sa'];

function teinte(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  if (h.length !== 6) return hex;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, alpha))})`;
}

const jourDe = (iso: string) => Number(iso.slice(8, 10));
const moisDe = (iso: string) => MOIS[Number(iso.slice(5, 7)) - 1];
const jourSemaine = (iso: string) => new Date(`${iso}T12:00:00Z`).getUTCDay();

// "7 → 14 août", "28 juil. → 3 août", "le 24 déc."
function plageCourte(debut: string, fin: string): string {
  if (debut === fin) return `le ${jourDe(debut)} ${moisDe(debut)}`;
  if (debut.slice(0, 7) === fin.slice(0, 7)) return `${jourDe(debut)} → ${jourDe(fin)} ${moisDe(fin)}`;
  return `${jourDe(debut)} ${moisDe(debut)} → ${jourDe(fin)} ${moisDe(fin)}`;
}

export default function SyntheseDates({
  propositions,
  attendus,
  retenue,
}: {
  propositions: PropositionSynthese[];
  attendus: number;
  retenue?: { date_debut: string | null; date_fin: string | null };
}) {
  const s = useMemo(() => synthetiser(propositions), [propositions]);
  const n = s.jours.length;
  if (n === 0) return null;
  const pct = (x: number) => `${(x / n) * 100}%` as const;
  const scoreMax = Math.max(1, ...s.barres.map((b) => b.score));
  const meilleureBarre = s.barres.reduce((m, b) => (b.score > m.score ? b : m), s.barres[0]);
  const chiffres = n <= 31;
  const total = Math.max(1, attendus);

  const resume = s.meilleurs
    ? `Ce qui convient au plus de monde : ${
        s.meilleurs.debut === s.meilleurs.fin ? 'le ' : 'du '
      }${plageCourte(s.meilleurs.debut, s.meilleurs.fin).replace(' → ', ' au ').replace(/^le /, '')} (${
        s.meilleurs.oui
      } oui${s.meilleurs.possible ? `, ${s.meilleurs.possible} possible${s.meilleurs.possible > 1 ? 's' : ''}` : ''} sur ${attendus}).`
    : 'Personne n’a encore voté : la vue se remplira avec les votes.';

  // Colonnes de fond : week-ends grisés.
  const fond = (
    <View style={styles.fond} pointerEvents="none">
      {s.jours.map((j) => (
        <View key={j.date} style={[styles.colonne, j.weekend && styles.colonneWeekend]} />
      ))}
    </View>
  );

  return (
    <View style={styles.carte} accessible accessibilityLabel={`Vue d’ensemble des dates proposées. ${resume}`}>
      <Text style={styles.titre}>
        Vue d’ensemble ·{' '}
        {moisDe(s.jours[0].date) === moisDe(s.jours[n - 1].date)
          ? `${moisDe(s.jours[0].date)} ${s.jours[0].date.slice(0, 4)}`
          : `${moisDe(s.jours[0].date)} – ${moisDe(s.jours[n - 1].date)} ${s.jours[n - 1].date.slice(0, 4)}`}
      </Text>

      {/* Axe des jours */}
      <View style={styles.axe}>
        {fond}
        {s.jours.map((j, i) => {
          const premierDuMois = i === 0 || jourDe(j.date) === 1;
          return (
            <View key={j.date} style={styles.case}>
              <Text style={styles.semaine}>{n <= 16 ? JOURS_COURTS[jourSemaine(j.date)] : ''}</Text>
              <Text style={[styles.numero, j.weekend && styles.numeroWeekend]}>
                {chiffres || jourSemaine(j.date) === 1 || premierDuMois ? jourDe(j.date) : ''}
              </Text>
            </View>
          );
        })}
      </View>

      {/* Une barre par proposition */}
      {s.barres.map((b) => {
        const estRetenue = retenue?.date_debut === b.date_debut && retenue?.date_fin === b.date_fin;
        const enTete = b === meilleureBarre && b.score > 0;
        return (
          <View key={b.id} style={styles.ligneBarre}>
            <Text style={styles.libelleBarre} numberOfLines={1}>
              {plageCourte(b.date_debut, b.date_fin)} · {b.oui} oui
              {b.possible ? ` · ${b.possible} possible${b.possible > 1 ? 's' : ''}` : ''}
              {b.non ? ` · ${b.non} non` : ''}
              {estRetenue ? ' · retenue' : enTete ? ' · en tête' : ''}
            </Text>
            <View style={styles.piste}>
              {fond}
              <View
                style={[
                  styles.barre,
                  {
                    left: pct(b.debut),
                    width: pct(b.duree),
                    backgroundColor: teinte(theme.colors.success, 0.25 + 0.75 * (b.score / scoreMax)),
                  },
                  (enTete || estRetenue) && styles.barreEnTete,
                ]}
              />
            </View>
          </View>
        );
      })}

      {/* Jour par jour */}
      <Text style={styles.libelleBarre}>Jour par jour : qui a dit oui</Text>
      <View style={styles.jours}>
        {s.jours.map((j) => {
          const part = (j.oui + j.possible * 0.5) / total;
          return (
            <View
              key={j.date}
              style={[styles.jour, { backgroundColor: teinte(theme.colors.success, 0.08 + 0.92 * part) }]}
            >
              {chiffres && (
                <Text style={[styles.jourTexte, part > 0.6 && styles.jourTexteFort]}>{j.oui || ''}</Text>
              )}
            </View>
          );
        })}
      </View>

      <Text style={styles.resume}>{resume}</Text>
      <Text style={styles.legende}>
        Plus le vert est foncé, plus il y a de « oui ». Un « oui » à une proposition compte pour tous ses jours.
      </Text>
    </View>
  );
}

const styles = creerStylesThemes(() => ({
  carte: {
    gap: 6,
    padding: theme.spacing.md,
    borderRadius: theme.radii.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  titre: { fontFamily: theme.fontBodyBold, fontSize: 16, color: theme.colors.text },
  fond: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, flexDirection: 'row' },
  colonne: { flex: 1 },
  colonneWeekend: { backgroundColor: theme.colors.selectionTransparent },
  axe: { flexDirection: 'row', borderRadius: 4, overflow: 'hidden' },
  case: { flex: 1, alignItems: 'center', paddingVertical: 2 },
  semaine: { fontFamily: theme.fontBody, fontSize: 9, color: theme.colors.textMuted },
  numero: { fontFamily: theme.fontBodyBold, fontSize: 11, color: theme.colors.text },
  numeroWeekend: { color: theme.colors.textMuted },
  ligneBarre: { gap: 2 },
  libelleBarre: { fontFamily: theme.fontBody, fontSize: 13, color: theme.colors.textMuted },
  piste: { height: 18, borderRadius: 4, overflow: 'hidden', backgroundColor: theme.colors.background },
  barre: { position: 'absolute', top: 2, bottom: 2, borderRadius: 4 },
  barreEnTete: { borderWidth: 2, borderColor: theme.colors.accent },
  jours: { flexDirection: 'row', gap: 1, marginTop: 2 },
  jour: { flex: 1, height: 24, borderRadius: 3, alignItems: 'center', justifyContent: 'center' },
  jourTexte: { fontFamily: theme.fontBodyBold, fontSize: 11, color: theme.colors.text },
  jourTexteFort: { color: theme.colors.background },
  resume: { fontFamily: theme.fontBodyBold, fontSize: 14, color: theme.colors.text, marginTop: 4 },
  legende: { fontFamily: theme.fontBody, fontSize: 12, color: theme.colors.textMuted },
}));
