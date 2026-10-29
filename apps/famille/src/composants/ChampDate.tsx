import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type TextStyle } from 'react-native';
import { FeuilleBas } from './FeuilleBas';
import { Icone } from './ui';
import { arrondis, couleurs, creerStyles, espaces, polices } from '../theme/theme';

// Choix d'une date au calendrier (retour de test du 27 octobre : plus de
// date à taper « JJ/MM/AAAA »). Remplace un TextInput SANS changer l'écran
// qui l'utilise : `value` et `onChangeText` restent des textes au format
// d'avant — « 14/03/2021 » (jour), « 03/2021 » (mois), « 2021 » (année) —,
// lus par les mêmes fonctions qu'avant.
//
// Toucher le champ ouvre une feuille : un mois à la fois (‹ ›), le titre du
// mois ouvre le choix du mois puis de l'année, raccourci « Aujourd'hui »,
// « Effacer » si la date est facultative.

export type PrecisionChampDate = 'jour' | 'mois' | 'annee';

const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const MOIS_COURTS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const JOURS = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];
const INITIALES = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

type DateLue = { annee: number; mois: number | null; jour: number | null }; // mois 1-12

function deux(n: number): string {
  return String(n).padStart(2, '0');
}

// Texte du champ → date (jour, mois ou année seulement), ou null.
function lire(texte: string): DateLue | null {
  const t = (texte ?? '').trim();
  let m = t.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})$/);
  if (m) {
    const j = Number(m[1]);
    const mo = Number(m[2]);
    const a = Number(m[3]);
    const d = new Date(a, mo - 1, j);
    if (d.getFullYear() === a && d.getMonth() === mo - 1 && d.getDate() === j) return { annee: a, mois: mo, jour: j };
    return null;
  }
  m = t.match(/^(\d{1,2})[/.\-](\d{4})$/);
  if (m && Number(m[1]) >= 1 && Number(m[1]) <= 12) return { annee: Number(m[2]), mois: Number(m[1]), jour: null };
  m = t.match(/^(\d{4})$/);
  if (m) return { annee: Number(m[1]), mois: null, jour: null };
  return null;
}

function enClair(d: DateLue): string {
  if (d.jour && d.mois) {
    const date = new Date(d.annee, d.mois - 1, d.jour);
    const nomJour = JOURS[(date.getDay() + 6) % 7];
    return `${nomJour} ${d.jour === 1 ? '1er' : d.jour} ${MOIS[d.mois - 1]} ${d.annee}`;
  }
  if (d.mois) return `${MOIS[d.mois - 1]} ${d.annee}`;
  return String(d.annee);
}

export function ChampDate({
  value,
  onChangeText,
  placeholder,
  style,
  precision = 'jour',
  facultatif = true,
  libelle,
  titre,
  accessibilityLabel,
  couleur,
}: {
  value: string;
  onChangeText: (texte: string) => void;
  placeholder?: string;
  style?: StyleProp<TextStyle>;
  precision?: PrecisionChampDate;
  facultatif?: boolean;
  libelle?: string; // libellé affiché au-dessus du champ
  titre?: string; // titre de la feuille
  accessibilityLabel?: string;
  couleur?: string; // couleur du jour choisi (celle du module)
  // Accepté pour remplacer un TextInput tel quel, sans effet.
  [autre: string]: unknown;
}) {
  const [ouvert, setOuvert] = useState(false);
  const lue = lire(value);
  const aujourdhui = new Date();
  const [vue, setVue] = useState<'jours' | 'mois' | 'annees'>('jours');
  const [annee, setAnnee] = useState(aujourdhui.getFullYear());
  const [mois, setMois] = useState(aujourdhui.getMonth() + 1);
  const accent = couleur ?? couleurs.accent;

  const ouvrir = () => {
    setAnnee(lue?.annee ?? aujourdhui.getFullYear());
    setMois(lue?.mois ?? aujourdhui.getMonth() + 1);
    setVue(precision === 'annee' ? 'annees' : precision === 'mois' ? 'mois' : 'jours');
    setOuvert(true);
  };

  const choisir = (texte: string) => {
    onChangeText(texte);
    setOuvert(false);
  };

  // Champ : même allure que les champs de texte de l'écran (style donné).
  const plat = (StyleSheet.flatten(style) ?? {}) as TextStyle;
  const { fontFamily, fontSize, color, ...cadre } = plat;
  const texteChamp = lue ? enClair(lue) : value?.trim() ? value : placeholder ?? 'Choisir une date';

  // Grille du mois : semaines du lundi au dimanche.
  const cases = useMemo(() => {
    const premier = new Date(annee, mois - 1, 1);
    const decalage = (premier.getDay() + 6) % 7;
    const nbJours = new Date(annee, mois, 0).getDate();
    const liste: (number | null)[] = Array(decalage).fill(null);
    for (let j = 1; j <= nbJours; j += 1) liste.push(j);
    while (liste.length % 7) liste.push(null);
    return liste;
  }, [annee, mois]);

  const debutDecennie = annee - (annee % 12);
  const changerMois = (pas: number) => {
    const d = new Date(annee, mois - 1 + pas, 1);
    setAnnee(d.getFullYear());
    setMois(d.getMonth() + 1);
  };

  const estAujourdhui = (j: number) =>
    j === aujourdhui.getDate() && mois === aujourdhui.getMonth() + 1 && annee === aujourdhui.getFullYear();
  const estChoisi = (j: number) => lue?.jour === j && lue?.mois === mois && lue?.annee === annee;

  return (
    <View style={libelle ? { gap: 4 } : undefined}>
      {libelle ? <Text style={styles.libelle}>{libelle}</Text> : null}
      <Pressable
        onPress={ouvrir}
        accessibilityRole="button"
        accessibilityLabel={`${accessibilityLabel ?? libelle ?? 'Date'} : ${lue ? enClair(lue) : 'aucune date'}`}
        accessibilityHint="Ouvre le calendrier"
        style={({ pressed }) => [styles.champ, cadre as any, pressed && { opacity: 0.8 }]}
      >
        <Text
          style={[
            styles.texte,
            fontFamily ? { fontFamily } : null,
            fontSize ? { fontSize } : null,
            lue || value?.trim() ? (color ? { color } : null) : styles.texteVide,
          ]}
          numberOfLines={1}
        >
          {texteChamp}
        </Text>
        <Icone nom="calendar-outline" taille={20} couleur={couleurs.encreDouce} />
      </Pressable>

      <FeuilleBas visible={ouvert} titre={titre ?? libelle ?? accessibilityLabel ?? 'Choisir une date'} onFermer={() => setOuvert(false)}>
        {vue === 'jours' ? (
          <View style={{ gap: espaces.s }}>
            <View style={styles.entete}>
              <Pressable onPress={() => changerMois(-1)} style={styles.fleche} accessibilityRole="button" accessibilityLabel="Mois précédent" hitSlop={6}>
                <Icone nom="chevron-back" taille={22} couleur={couleurs.encre} />
              </Pressable>
              <Pressable onPress={() => setVue('mois')} style={styles.titreMois} accessibilityRole="button" accessibilityLabel="Choisir le mois et l'année">
                <Text style={styles.titreMoisTexte}>
                  {MOIS[mois - 1]} {annee}
                </Text>
                <Icone nom="chevron-down" taille={16} couleur={couleurs.encreDouce} />
              </Pressable>
              <Pressable onPress={() => changerMois(1)} style={styles.fleche} accessibilityRole="button" accessibilityLabel="Mois suivant" hitSlop={6}>
                <Icone nom="chevron-forward" taille={22} couleur={couleurs.encre} />
              </Pressable>
            </View>
            <View style={styles.semaine}>
              {INITIALES.map((l, i) => (
                <Text key={i} style={styles.initiale}>
                  {l}
                </Text>
              ))}
            </View>
            <View style={styles.grille}>
              {cases.map((j, i) =>
                j === null ? (
                  <View key={i} style={styles.case} />
                ) : (
                  <Pressable
                    key={i}
                    onPress={() => choisir(`${deux(j)}/${deux(mois)}/${annee}`)}
                    accessibilityRole="button"
                    accessibilityLabel={enClair({ annee, mois, jour: j })}
                    accessibilityState={{ selected: estChoisi(j) }}
                    style={styles.case}
                  >
                    <View
                      style={[
                        styles.rond,
                        estAujourdhui(j) && { borderWidth: 1.5, borderColor: accent },
                        estChoisi(j) && { backgroundColor: accent },
                      ]}
                    >
                      <Text style={[styles.jour, estChoisi(j) && { color: couleurs.surAccent, fontFamily: polices.texteGras }]}>{j}</Text>
                    </View>
                  </Pressable>
                )
              )}
            </View>
          </View>
        ) : vue === 'mois' ? (
          <View style={{ gap: espaces.s }}>
            <View style={styles.entete}>
              <Pressable onPress={() => setAnnee(annee - 1)} style={styles.fleche} accessibilityRole="button" accessibilityLabel="Année précédente" hitSlop={6}>
                <Icone nom="chevron-back" taille={22} couleur={couleurs.encre} />
              </Pressable>
              <Pressable onPress={() => setVue('annees')} style={styles.titreMois} accessibilityRole="button" accessibilityLabel="Choisir l'année">
                <Text style={styles.titreMoisTexte}>{annee}</Text>
                <Icone nom="chevron-down" taille={16} couleur={couleurs.encreDouce} />
              </Pressable>
              <Pressable onPress={() => setAnnee(annee + 1)} style={styles.fleche} accessibilityRole="button" accessibilityLabel="Année suivante" hitSlop={6}>
                <Icone nom="chevron-forward" taille={22} couleur={couleurs.encre} />
              </Pressable>
            </View>
            <View style={styles.grilleLarge}>
              {MOIS_COURTS.map((m, i) => {
                const choisi = lue?.annee === annee && lue?.mois === i + 1;
                return (
                  <Pressable
                    key={m}
                    onPress={() => {
                      if (precision === 'mois') choisir(`${deux(i + 1)}/${annee}`);
                      else {
                        setMois(i + 1);
                        setVue('jours');
                      }
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={`${MOIS[i]} ${annee}`}
                    style={[styles.pave, choisi && { backgroundColor: accent, borderColor: accent }]}
                  >
                    <Text style={[styles.paveTexte, choisi && { color: couleurs.surAccent }]}>{m}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ) : (
          <View style={{ gap: espaces.s }}>
            <View style={styles.entete}>
              <Pressable onPress={() => setAnnee(annee - 12)} style={styles.fleche} accessibilityRole="button" accessibilityLabel="Années précédentes" hitSlop={6}>
                <Icone nom="chevron-back" taille={22} couleur={couleurs.encre} />
              </Pressable>
              <View style={styles.titreMois}>
                <Text style={styles.titreMoisTexte}>
                  {debutDecennie} – {debutDecennie + 11}
                </Text>
              </View>
              <Pressable onPress={() => setAnnee(annee + 12)} style={styles.fleche} accessibilityRole="button" accessibilityLabel="Années suivantes" hitSlop={6}>
                <Icone nom="chevron-forward" taille={22} couleur={couleurs.encre} />
              </Pressable>
            </View>
            <View style={styles.grilleLarge}>
              {Array.from({ length: 12 }, (_, i) => debutDecennie + i).map((a) => {
                const choisi = lue?.annee === a;
                return (
                  <Pressable
                    key={a}
                    onPress={() => {
                      if (precision === 'annee') choisir(String(a));
                      else {
                        setAnnee(a);
                        setVue('mois');
                      }
                    }}
                    accessibilityRole="button"
                    style={[styles.pave, choisi && { backgroundColor: accent, borderColor: accent }]}
                  >
                    <Text style={[styles.paveTexte, choisi && { color: couleurs.surAccent }]}>{a}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        )}

        <View style={styles.actions}>
          <Pressable
            onPress={() => {
              const a = aujourdhui.getFullYear();
              const m = aujourdhui.getMonth() + 1;
              choisir(precision === 'annee' ? String(a) : precision === 'mois' ? `${deux(m)}/${a}` : `${deux(aujourdhui.getDate())}/${deux(m)}/${a}`);
            }}
            accessibilityRole="button"
            style={styles.action}
          >
            <Text style={[styles.actionTexte, { color: accent }]}>{precision === 'jour' ? 'Aujourd’hui' : precision === 'mois' ? 'Ce mois-ci' : 'Cette année'}</Text>
          </Pressable>
          {facultatif && value?.trim() ? (
            <Pressable onPress={() => choisir('')} accessibilityRole="button" style={styles.action}>
              <Text style={[styles.actionTexte, { color: couleurs.encreDouce }]}>Effacer la date</Text>
            </Pressable>
          ) : null}
        </View>
      </FeuilleBas>
    </View>
  );
}

const styles = creerStyles(() => ({
  libelle: { fontFamily: polices.texteGras, fontSize: 13, color: couleurs.encreDouce },
  champ: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaces.s,
    paddingHorizontal: espaces.m,
    paddingVertical: espaces.s,
    borderRadius: arrondis.petit,
    borderWidth: 1.5,
    borderColor: couleurs.ligne,
    backgroundColor: couleurs.surface,
  },
  texte: { flex: 1, fontFamily: polices.texte, fontSize: 15, color: couleurs.encre },
  texteVide: { color: couleurs.encreDouce },
  entete: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  fleche: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: couleurs.segment },
  titreMois: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 44, paddingHorizontal: espaces.m, justifyContent: 'center' },
  titreMoisTexte: { fontFamily: polices.titre, fontSize: 20, color: couleurs.encre },
  semaine: { flexDirection: 'row' },
  initiale: { width: `${100 / 7}%`, textAlign: 'center', fontFamily: polices.texteGras, fontSize: 12, color: couleurs.encreDouce },
  grille: { flexDirection: 'row', flexWrap: 'wrap' },
  case: { width: `${100 / 7}%`, height: 46, alignItems: 'center', justifyContent: 'center' },
  rond: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  jour: { fontFamily: polices.texteMoyen, fontSize: 16, color: couleurs.encre },
  grilleLarge: { flexDirection: 'row', flexWrap: 'wrap', gap: espaces.s },
  pave: {
    width: '31%',
    flexGrow: 1,
    height: 48,
    borderRadius: arrondis.petit,
    borderWidth: 1,
    borderColor: couleurs.ligne,
    alignItems: 'center',
    justifyContent: 'center',
  },
  paveTexte: { fontFamily: polices.texteDemiGras, fontSize: 15, color: couleurs.encre },
  actions: { flexDirection: 'row', justifyContent: 'space-between', marginTop: espaces.s },
  action: { minHeight: 44, justifyContent: 'center', paddingHorizontal: espaces.xs },
  actionTexte: { fontFamily: polices.texteGras, fontSize: 15 },
}));
