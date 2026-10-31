import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { theme, creerStylesThemes } from '../theme/theme';
import { Carte, TitreSection } from './elements';
import { Chargement, Pastille } from './ui';
import { alerte } from '../utils/alerte';
import { extraireMessageErreur } from '@apps-famille/famille';
import { formaterDate, MOIS } from '../services/personnes';
import { aujourdHuiIso } from '../services/quotidien';
import { libellePlanif, tachesCalendrier, type OccurrenceTache } from '../services/maison';

const JOURS_COURTS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function versDate(s: string): Date {
  const [a, m, j] = s.split('-').map(Number);
  return new Date(a, m - 1, j);
}

function ajouterJours(s: string, n: number): string {
  const d = versDate(s);
  d.setDate(d.getDate() + n);
  return iso(d);
}

// Jours où l'occurrence apparaît dans la grille : la date (le), chaque jour
// de la période (entre), la date limite (avant).
function joursMarques(o: OccurrenceTache): string[] {
  if (o.planif === 'le') return [o.debut];
  if (o.planif === 'avant') return [o.fin];
  const jours: string[] = [];
  for (let j = o.debut; j <= o.fin && jours.length < 370; j = ajouterJours(j, 1)) jours.push(j);
  return jours;
}

// Occurrences à montrer pour un jour choisi (une échéance « avant » est
// listée sur toute sa période).
function concerne(o: OccurrenceTache, jour: string): boolean {
  if (o.planif === 'le') return o.debut === jour;
  return o.debut <= jour && jour <= o.fin;
}

// Calendrier du mois des tâches datées : points sur les jours occupés (rouge
// = en retard, gris = fait), liste du jour choisi, puis les retards et les
// prochaines échéances (60 jours).
export function CalendrierTaches({
  domaineId,
  prenom,
  onVoirJour,
  onModifier,
}: {
  domaineId: string | null;
  prenom: (id: string) => string;
  onVoirJour: (jour: string) => void;
  onModifier: (idTache: string) => void;
}) {
  const aujourdhui = aujourdHuiIso();
  const [mois, setMois] = useState(() => {
    const d = new Date();
    return { a: d.getFullYear(), m: d.getMonth() };
  });
  const [choisi, setChoisi] = useState(aujourdhui);
  const [occurrences, setOccurrences] = useState<OccurrenceTache[] | null>(null);

  // Grille : du lundi avant le 1er au dimanche après le dernier jour.
  const grille = useMemo(() => {
    const premier = new Date(mois.a, mois.m, 1);
    const decalage = (premier.getDay() + 6) % 7;
    const debut = new Date(mois.a, mois.m, 1 - decalage);
    const dernier = new Date(mois.a, mois.m + 1, 0);
    const nbJours = decalage + dernier.getDate();
    const total = Math.ceil(nbJours / 7) * 7;
    return Array.from({ length: total }, (_, i) => iso(new Date(debut.getFullYear(), debut.getMonth(), debut.getDate() + i)));
  }, [mois]);

  const du = grille[0] < aujourdhui ? grille[0] : aujourdhui;
  const finGrille = grille[grille.length - 1];
  const dans60 = ajouterJours(aujourdhui, 60);
  const au = finGrille > dans60 ? finGrille : dans60;

  const charger = useCallback(async () => {
    try {
      setOccurrences(await tachesCalendrier(du, au));
    } catch (e) {
      alerte('Chargement impossible', extraireMessageErreur(e, 'Veuillez réessayer.'));
      setOccurrences([]);
    }
  }, [du, au]);

  useFocusEffect(
    useCallback(() => {
      charger();
    }, [charger])
  );

  const filtrees = useMemo(
    () => (occurrences ?? []).filter((o) => !domaineId || o.domaine_id === domaineId),
    [occurrences, domaineId]
  );

  const parJour = useMemo(() => {
    const m = new Map<string, OccurrenceTache[]>();
    filtrees.forEach((o) => joursMarques(o).forEach((j) => m.set(j, [...(m.get(j) ?? []), o])));
    return m;
  }, [filtrees]);

  if (!occurrences) return <Chargement />;

  const changerMois = (n: number) => {
    const d = new Date(mois.a, mois.m + n, 1);
    setMois({ a: d.getFullYear(), m: d.getMonth() });
  };

  const duJour = filtrees.filter((o) => concerne(o, choisi));
  const retards = filtrees.filter((o) => o.en_retard);
  const prochaines = filtrees
    .filter((o) => !o.fait_le && !o.en_retard && o.fin >= aujourdhui && o.debut <= dans60)
    .sort((a, b) => (a.planif === 'avant' ? a.fin : a.debut).localeCompare(b.planif === 'avant' ? b.fin : b.debut));

  // Où cocher la tâche : aujourd'hui si elle a commencé, sinon son premier jour.
  const jourPourCocher = (o: OccurrenceTache) => (o.fait_le ? o.fait_le : o.debut <= aujourdhui ? aujourdhui : o.debut);

  const ligne = (o: OccurrenceTache, cle: string) => {
    const qui = o.pour ? prenom(o.pour) : o.candidats.length ? o.candidats.map(prenom).join(', ') : null;
    return (
      <Pressable
        key={cle}
        onPress={() => onVoirJour(jourPourCocher(o))}
        accessibilityRole="button"
        accessibilityLabel={`${o.libelle}, ${libellePlanif(o)}`}
      >
        <Carte accent={o.en_retard}>
          <View style={styles.ligne}>
            <Ionicons
              name={(o.domaine_icone || (o.fait_le ? 'checkmark-circle' : 'ellipse-outline')) as any}
              size={20}
              color={o.fait_le ? theme.colors.success : theme.colors.accent}
            />
            <Text style={[styles.libelle, o.fait_le && styles.barre]} numberOfLines={2}>
              {o.libelle}
            </Text>
            {o.en_retard && <Pastille texte="En retard" />}
            {o.confiee ? null : (
              <Pressable
                onPress={() => onModifier(o.tache_id)}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel={`Modifier ${o.libelle}`}
              >
                <Ionicons name="create-outline" size={20} color={theme.colors.textMuted} />
              </Pressable>
            )}
          </View>
          <Text style={styles.detail}>
            {libellePlanif(o)}
            {o.domaine ? ` · ${o.domaine}` : ''}
            {qui ? ` · ${qui}` : ''}
            {o.confiee ? ` · confiée par ${o.foyer_nom ?? 'un autre foyer'}` : ''}
          </Text>
          {o.fait_le && (
            <Text style={styles.detail}>
              Fait le {formaterDate(o.fait_le)}
              {o.fait_par ? ` par ${o.fait_par}` : ''}
            </Text>
          )}
        </Carte>
      </Pressable>
    );
  };

  return (
    <View style={{ gap: theme.spacing.sm }}>
      <View style={styles.entete}>
        <Pressable onPress={() => changerMois(-1)} hitSlop={8} accessibilityRole="button" accessibilityLabel="Mois précédent">
          <Ionicons name="chevron-back" size={26} color={theme.colors.accent} />
        </Pressable>
        <Pressable
          onPress={() => {
            const d = new Date();
            setMois({ a: d.getFullYear(), m: d.getMonth() });
            setChoisi(aujourdhui);
          }}
          accessibilityRole="button"
          accessibilityLabel="Revenir à aujourd’hui"
        >
          <Text style={styles.mois}>
            {MOIS[mois.m].charAt(0).toUpperCase() + MOIS[mois.m].slice(1)} {mois.a}
          </Text>
        </Pressable>
        <Pressable onPress={() => changerMois(1)} hitSlop={8} accessibilityRole="button" accessibilityLabel="Mois suivant">
          <Ionicons name="chevron-forward" size={26} color={theme.colors.accent} />
        </Pressable>
      </View>

      <View style={styles.grille}>
        {JOURS_COURTS.map((j, i) => (
          <View key={`t${i}`} style={styles.cellule}>
            <Text style={styles.jourSemaine}>{j}</Text>
          </View>
        ))}
        {grille.map((j) => {
          const dansLeMois = versDate(j).getMonth() === mois.m;
          const marques = parJour.get(j) ?? [];
          const estChoisi = j === choisi;
          return (
            <Pressable
              key={j}
              onPress={() => setChoisi(j)}
              style={styles.cellule}
              accessibilityRole="button"
              accessibilityState={{ selected: estChoisi }}
              accessibilityLabel={`${formaterDate(j)}${marques.length ? `, ${marques.length} tâche${marques.length > 1 ? 's' : ''}` : ''}`}
            >
              <View style={[styles.numero, j === aujourdhui && styles.aujourdhui, estChoisi && styles.choisi]}>
                <Text
                  style={[
                    styles.numeroTexte,
                    !dansLeMois && { color: theme.colors.textMuted, opacity: 0.6 },
                    estChoisi && { color: theme.colors.background },
                  ]}
                >
                  {versDate(j).getDate()}
                </Text>
              </View>
              <View style={styles.points}>
                {marques.slice(0, 3).map((o, i) => (
                  <View
                    key={i}
                    style={[
                      styles.point,
                      o.fait_le ? { backgroundColor: theme.colors.textMuted } : o.en_retard ? { backgroundColor: theme.colors.warning } : null,
                    ]}
                  />
                ))}
              </View>
            </Pressable>
          );
        })}
      </View>

      <TitreSection titre={choisi === aujourdhui ? 'Aujourd’hui' : formaterDate(choisi)} />
      {duJour.length === 0 ? (
        <Text style={styles.detail}>Aucune tâche datée ce jour-là.</Text>
      ) : (
        duJour.map((o) => ligne(o, `j-${o.tache_id}-${o.debut}`))
      )}

      {retards.length > 0 && (
        <>
          <TitreSection titre="En retard" detail={String(retards.length)} />
          {retards.map((o) => ligne(o, `r-${o.tache_id}-${o.debut}`))}
        </>
      )}

      <TitreSection titre="Prochainement" detail="60 jours" />
      {prochaines.length === 0 ? (
        <Text style={styles.detail}>Rien de prévu.</Text>
      ) : (
        prochaines.map((o) => ligne(o, `p-${o.tache_id}-${o.debut}`))
      )}
    </View>
  );
}

const styles = creerStylesThemes(() => ({
  entete: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44 },
  mois: { fontFamily: theme.fontTitle, fontSize: 20, color: theme.colors.text },
  grille: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radii.lg,
    paddingVertical: theme.spacing.xs,
  },
  cellule: { width: `${100 / 7}%`, alignItems: 'center', paddingVertical: 2, minHeight: 46 },
  jourSemaine: { fontFamily: theme.fontBodyBold, fontSize: 12, color: theme.colors.textMuted },
  numero: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  aujourdhui: { borderWidth: 1.5, borderColor: theme.colors.accent },
  choisi: { backgroundColor: theme.colors.accent },
  numeroTexte: { fontFamily: theme.fontBody, fontSize: 15, color: theme.colors.text },
  points: { flexDirection: 'row', gap: 3, height: 6, marginTop: 2 },
  point: { width: 6, height: 6, borderRadius: 3, backgroundColor: theme.colors.accent },
  ligne: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
  libelle: { flex: 1, fontFamily: theme.fontBodyBold, fontSize: 16, color: theme.colors.text },
  barre: { textDecorationLine: 'line-through', color: theme.colors.textMuted },
  detail: { fontFamily: theme.fontBody, fontSize: 13, color: theme.colors.textMuted },
}));
