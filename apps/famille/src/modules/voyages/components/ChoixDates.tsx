import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { theme, creerStylesThemes } from '../theme/theme';
import { ChampDate } from '../../../composants/ChampDate';
import { Aide, CaseACocher, Erreur, Libelle } from './formulaire';
import { Bouton, Pastille } from './ui';
import { formaterPlage, lireDateSaisie } from '../services/personnes';
import { nuitsEntre, type Plage } from '../services/creation';

// Dates d'un événement (refonte § 5.3) : une date, elle est fixée ; plusieurs,
// on vote. On ajoute des plages « Du / Au » ; pour un repas d'un seul jour,
// une seule date suffit (« Sur plusieurs jours » fait apparaître « Jusqu'au »).
export function ChoixDates({
  plages,
  onChange,
  repas,
  plusieursJours,
  onPlusieursJours,
  dateInitiale,
}: {
  plages: Plage[];
  onChange: (p: Plage[]) => void;
  repas: boolean;
  plusieursJours: boolean;
  onPlusieursJours: (v: boolean) => void;
  // Date proposée par l'occasion du repas (à modifier ou compléter).
  dateInitiale?: string | null;
}) {
  const [debut, setDebut] = useState('');
  const [fin, setFin] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const unJour = repas && !plusieursJours;

  const ajouter = () => {
    setErreur(null);
    const d = lireDateSaisie(debut);
    const f = unJour ? d : lireDateSaisie(fin);
    if (!d || !f) return setErreur('Choisissez les dates au calendrier.');
    if (f < d || (!repas && f === d)) return setErreur('La date de fin doit être après la date de début.');
    if (plages.some((p) => p.debut === d && p.fin === f)) return setErreur('Ces dates sont déjà proposées.');
    onChange([...plages, { debut: d, fin: f }].sort((a, b) => a.debut.localeCompare(b.debut)));
    setDebut('');
    setFin('');
  };

  const proposerLaDate = () => {
    if (dateInitiale) onChange([{ debut: dateInitiale, fin: dateInitiale }]);
  };

  return (
    <View style={{ gap: theme.spacing.sm }}>
      <Libelle>{repas ? 'Quand ?' : 'Quand partir ?'}</Libelle>

      {repas ? (
        <CaseACocher coche={plusieursJours} onChange={onPlusieursJours} libelle="Sur plusieurs jours" />
      ) : null}

      {dateInitiale && plages.length === 0 ? (
        <Bouton titre="Garder la date de l’occasion" variante="contour" onPress={proposerLaDate} />
      ) : null}

      <View style={styles.ligne}>
        <View style={{ flex: 1 }}>
          <Text style={styles.petit}>{unJour ? 'Le' : 'Du'}</Text>
          <ChampDate
            value={debut}
            onChangeText={setDebut}
            placeholder="Choisir"
            accessibilityLabel={unJour ? 'Jour' : 'Du'}
            couleur={theme.colors.accent}
          />
        </View>
        {!unJour ? (
          <View style={{ flex: 1 }}>
            <Text style={styles.petit}>Au</Text>
            <ChampDate value={fin} onChangeText={setFin} placeholder="Choisir" accessibilityLabel="Au" couleur={theme.colors.accent} />
          </View>
        ) : null}
      </View>
      <Erreur texte={erreur} />
      <Bouton
        titre={plages.length ? 'Proposer aussi ces dates' : 'Ajouter ces dates'}
        variante={plages.length ? 'pointille' : 'contour'}
        onPress={ajouter}
        desactive={!debut || (!unJour && !fin)}
      />

      {plages.map((p) => {
        const nuits = nuitsEntre(p.debut, p.fin);
        return (
          <View key={`${p.debut}-${p.fin}`} style={styles.carte}>
            <View style={{ flex: 1 }}>
              <Text style={styles.carteTitre}>{formaterPlage(p.debut, p.fin)}</Text>
              {nuits > 0 ? <Text style={styles.petit}>{nuits} nuit{nuits > 1 ? 's' : ''}</Text> : null}
            </View>
            <Pressable
              onPress={() => onChange(plages.filter((x) => x !== p))}
              accessibilityRole="button"
              accessibilityLabel={`Retirer ${formaterPlage(p.debut, p.fin)}`}
              style={styles.retirer}
            >
              <Text style={styles.retirerTexte}>×</Text>
            </Pressable>
          </View>
        );
      })}

      {plages.length === 0 ? (
        <Aide>Pas encore d’idée ? Passez : vous pourrez indiquer une période, ou proposer des dates plus tard.</Aide>
      ) : plages.length === 1 ? (
        <>
          <Pastille texte="Date fixée" ton="succes" />
          <Aide>Ajoutez une autre date pour la soumettre au vote.</Aide>
        </>
      ) : (
        <>
          <Pastille texte={`Au vote · ${plages.length} dates`} ton="accent" />
          <Aide>Chacun indiquera les dates où il est libre.</Aide>
        </>
      )}
    </View>
  );
}

const styles = creerStylesThemes(() => ({
  ligne: { flexDirection: 'row', gap: theme.spacing.sm },
  petit: { fontFamily: theme.fontBody, fontSize: 13, color: theme.colors.textMuted },
  carte: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    padding: theme.spacing.md,
    borderRadius: theme.radii.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  carteTitre: { fontFamily: theme.fontBodyBold, fontSize: 15, color: theme.colors.text },
  retirer: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  retirerTexte: { fontSize: 24, color: theme.colors.textMuted },
}));
