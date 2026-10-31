import React from 'react';
import { ScrollView, Text, View, type StyleProp, type TextStyle } from 'react-native';
import { theme, creerStylesThemes } from '../theme/theme';

// Texte mis en forme des fiches « Aide-mémoire », écrit en Markdown simple
// (enregistré tel quel dans la base, comme un texte ordinaire) :
//
//   # Titre            ## Sous-titre
//   - élément de liste (ou « * »), sous-élément décalé de 2 espaces
//   1. liste numérotée
//   | Viande | Température |      ← tableau : une ligne par rangée,
//   |---|---|                     ← (ligne de séparation facultative)
//   | Bœuf saignant | 50 °C |
//   **gras**  *italique*
//
// Un texte sans ces signes s'affiche comme avant (paragraphes).

export type Bloc =
  | { type: 'titre'; niveau: 1 | 2; texte: string }
  | { type: 'paragraphe'; texte: string }
  | { type: 'liste'; numerotee: boolean; elements: { texte: string; niveau: number; numero: number }[] }
  | { type: 'tableau'; entete: string[] | null; lignes: string[][] };

const RE_PUCE = /^(\s*)[-*•]\s+(.*)$/;
const RE_NUMERO = /^(\s*)(\d+)[.)]\s+(.*)$/;
const RE_TITRE = /^(#{1,3})\s+(.*)$/;
const RE_SEPARATEUR = /^\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;

function cellules(ligne: string): string[] {
  let l = ligne.trim();
  if (l.startsWith('|')) l = l.slice(1);
  if (l.endsWith('|')) l = l.slice(0, -1);
  return l.split('|').map((c) => c.trim());
}

export function analyserTexte(source: string): Bloc[] {
  const lignes = source.replace(/\r\n?/g, '\n').split('\n');
  const blocs: Bloc[] = [];
  let i = 0;
  while (i < lignes.length) {
    const ligne = lignes[i];
    if (!ligne.trim()) {
      i += 1;
      continue;
    }
    const titre = ligne.match(RE_TITRE);
    if (titre) {
      blocs.push({ type: 'titre', niveau: titre[1].length === 1 ? 1 : 2, texte: titre[2].trim() });
      i += 1;
      continue;
    }
    if (ligne.trim().startsWith('|')) {
      const rangees: string[] = [];
      while (i < lignes.length && lignes[i].trim().startsWith('|')) rangees.push(lignes[i++]);
      let entete: string[] | null = null;
      let corps = rangees;
      if (rangees.length > 1 && RE_SEPARATEUR.test(rangees[1].trim())) {
        entete = cellules(rangees[0]);
        corps = rangees.slice(2);
      }
      blocs.push({
        type: 'tableau',
        entete,
        lignes: corps.filter((r) => !RE_SEPARATEUR.test(r.trim())).map(cellules),
      });
      continue;
    }
    const puce = ligne.match(RE_PUCE);
    const numero = ligne.match(RE_NUMERO);
    if (puce || numero) {
      const numerotee = !puce;
      const elements: { texte: string; niveau: number; numero: number }[] = [];
      let compteur = 0;
      while (i < lignes.length) {
        const p = lignes[i].match(RE_PUCE);
        const n = lignes[i].match(RE_NUMERO);
        const m = numerotee ? n : p;
        if (!m) break;
        const niveau = Math.min(2, Math.floor(m[1].replace(/\t/g, '  ').length / 2));
        if (niveau === 0) compteur += 1;
        elements.push({ texte: (numerotee ? n![3] : p![2]).trim(), niveau, numero: compteur });
        i += 1;
      }
      blocs.push({ type: 'liste', numerotee, elements });
      continue;
    }
    // Paragraphe : lignes consécutives jusqu'à une ligne vide ou un autre bloc.
    const morceaux: string[] = [];
    while (
      i < lignes.length &&
      lignes[i].trim() &&
      !RE_TITRE.test(lignes[i]) &&
      !lignes[i].trim().startsWith('|') &&
      !RE_PUCE.test(lignes[i]) &&
      !RE_NUMERO.test(lignes[i])
    ) {
      morceaux.push(lignes[i]);
      i += 1;
    }
    blocs.push({ type: 'paragraphe', texte: morceaux.join('\n') });
  }
  return blocs;
}

// **gras** et *italique* à l'intérieur d'une ligne.
export function morceauxEnLigne(texte: string): { texte: string; gras: boolean; italique: boolean }[] {
  const resultat: { texte: string; gras: boolean; italique: boolean }[] = [];
  const re = /\*\*([^*]+)\*\*|\*([^*\s][^*]*)\*/g;
  let dernier = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(texte))) {
    if (m.index > dernier) resultat.push({ texte: texte.slice(dernier, m.index), gras: false, italique: false });
    if (m[1] !== undefined) resultat.push({ texte: m[1], gras: true, italique: false });
    else resultat.push({ texte: m[2], gras: false, italique: true });
    dernier = m.index + m[0].length;
  }
  if (dernier < texte.length) resultat.push({ texte: texte.slice(dernier), gras: false, italique: false });
  return resultat;
}

function EnLigne({ texte, style }: { texte: string; style?: StyleProp<TextStyle> }) {
  return (
    <Text style={style}>
      {morceauxEnLigne(texte).map((m, i) => (
        <Text
          key={i}
          style={[m.gras && { fontFamily: theme.fontBodyBold }, m.italique && { fontStyle: 'italic' }]}
        >
          {m.texte}
        </Text>
      ))}
    </Text>
  );
}

export default function TexteEnrichi({ texte }: { texte: string }) {
  const blocs = analyserTexte(texte);
  return (
    <View style={styles.conteneur}>
      {blocs.map((b, i) => {
        if (b.type === 'titre') {
          return <EnLigne key={i} texte={b.texte} style={b.niveau === 1 ? styles.titre1 : styles.titre2} />;
        }
        if (b.type === 'paragraphe') return <EnLigne key={i} texte={b.texte} style={styles.texte} />;
        if (b.type === 'liste') {
          return (
            <View key={i} style={styles.liste}>
              {b.elements.map((e, j) => (
                <View key={j} style={[styles.elementListe, { paddingLeft: e.niveau * 18 }]}>
                  <Text style={styles.puce}>{b.numerotee && e.niveau === 0 ? `${e.numero}.` : e.niveau ? '◦' : '•'}</Text>
                  <EnLigne texte={e.texte} style={[styles.texte, styles.texteListe]} />
                </View>
              ))}
            </View>
          );
        }
        const nbColonnes = Math.max(b.entete?.length ?? 0, ...b.lignes.map((l) => l.length), 1);
        const completer = (l: string[]) => [...l, ...Array(Math.max(0, nbColonnes - l.length)).fill('')];
        return (
          <ScrollView key={i} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tableauDefilement}>
            <View style={styles.tableau}>
              {b.entete && (
                <View style={[styles.rangee, styles.rangeeEntete]}>
                  {completer(b.entete).map((c, k) => (
                    <View key={k} style={[styles.cellule, k > 0 && styles.celluleSuivante]}>
                      <EnLigne texte={c} style={[styles.texteCellule, styles.texteEntete]} />
                    </View>
                  ))}
                </View>
              )}
              {b.lignes.map((l, j) => (
                <View key={j} style={[styles.rangee, (j > 0 || b.entete) && styles.rangeeSuivante, j % 2 === 1 && styles.rangeePaire]}>
                  {completer(l).map((c, k) => (
                    <View key={k} style={[styles.cellule, k > 0 && styles.celluleSuivante]}>
                      <EnLigne texte={c} style={styles.texteCellule} />
                    </View>
                  ))}
                </View>
              ))}
            </View>
          </ScrollView>
        );
      })}
    </View>
  );
}

const styles = creerStylesThemes(() => ({
  conteneur: { gap: theme.spacing.sm },
  titre1: { fontFamily: theme.fontTitle, fontSize: 19, color: theme.colors.accent, marginTop: theme.spacing.xs },
  titre2: { fontFamily: theme.fontBodyBold, fontSize: 16, color: theme.colors.text, marginTop: theme.spacing.xs },
  texte: { fontFamily: theme.fontBody, fontSize: 15, lineHeight: 21, color: theme.colors.text },
  liste: { gap: 4 },
  elementListe: { flexDirection: 'row', gap: 6 },
  puce: { fontFamily: theme.fontBodyBold, fontSize: 15, lineHeight: 21, color: theme.colors.accent, minWidth: 16 },
  texteListe: { flex: 1 },
  tableauDefilement: { flexGrow: 1 },
  tableau: {
    flexGrow: 1,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radii.sm,
    overflow: 'hidden',
  },
  rangee: { flexDirection: 'row' },
  rangeeEntete: { backgroundColor: theme.colors.selection },
  rangeeSuivante: { borderTopWidth: 1, borderTopColor: theme.colors.border },
  rangeePaire: { backgroundColor: theme.colors.surface },
  cellule: { flex: 1, minWidth: 90, paddingVertical: 6, paddingHorizontal: 8 },
  celluleSuivante: { borderLeftWidth: 1, borderLeftColor: theme.colors.border },
  texteCellule: { fontFamily: theme.fontBody, fontSize: 14, lineHeight: 19, color: theme.colors.text },
  texteEntete: { fontFamily: theme.fontBodyBold },
}));
