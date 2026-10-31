import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { theme, creerStylesThemes } from '../theme/theme';
import { Bouton, Pastille } from './ui';
import type { PropositionDates } from '../services/dates';

export type ChoixDispo = { propositionId: string; personneId: string; reponse: 'oui' | 'non' };

// Vue « invité » du choix des dates : on répond simplement « Je suis dispo »
// ou « Pas dispo » à chaque date proposée, puis on envoie d'un coup
// (refonte Événements § 9). « Possible » n'est pas proposé ici.
export default function DatesInvite({
  propositions,
  votants,
  plage,
  enCours,
  onEnvoyer,
  onProposerAutre,
}: {
  propositions: PropositionDates[];
  votants: { personneId: string; prenom: string }[];
  plage: (debut: string, fin: string) => string;
  enCours: boolean;
  onEnvoyer: (choix: ChoixDispo[]) => void;
  onProposerAutre: () => void;
}) {
  const [choix, setChoix] = useState<Map<string, 'oui' | 'non'>>(new Map());
  const cle = (propositionId: string, personneId: string) => `${propositionId}|${personneId}`;

  const score = (p: PropositionDates) => p.votes.filter((v) => v.reponse === 'oui' || v.reponse === 'si_besoin').length;
  const classees = [...propositions].sort((a, b) => score(b) - score(a) || a.date_debut.localeCompare(b.date_debut));
  const meilleure =
    classees.length > 1 && score(classees[0]) > 0 && score(classees[0]) > score(classees[1]) ? classees[0].id : null;

  const valeur = (p: PropositionDates, personneId: string): 'oui' | 'non' | null => {
    const local = choix.get(cle(p.id, personneId));
    if (local) return local;
    const v = p.votes.find((x) => x.personne_id === personneId)?.reponse;
    return v === 'oui' || v === 'si_besoin' ? 'oui' : v === 'non' ? 'non' : null;
  };

  const choisir = (propositionId: string, personneId: string, reponse: 'oui' | 'non') =>
    setChoix((m) => new Map(m).set(cle(propositionId, personneId), reponse));

  const aEnvoyer: ChoixDispo[] = [...choix.entries()].map(([k, reponse]) => {
    const [propositionId, personneId] = k.split('|');
    return { propositionId, personneId, reponse };
  });

  return (
    <View style={{ gap: theme.spacing.sm }}>
      <Text style={styles.titre}>Dates proposées</Text>
      <Text style={styles.petit}>Dites simplement quand vous pouvez : vous pourrez changer d’avis ensuite.</Text>

      {classees.map((p) => (
        <View key={p.id} style={[styles.carte, p.id === meilleure && styles.carteMeilleure]}>
          <View style={styles.ligne}>
            <Text style={[styles.plage, { flex: 1 }]}>{plage(p.date_debut, p.date_fin)}</Text>
            {p.id === meilleure ? <Pastille texte="Pour l’instant la meilleure" ton="succes" /> : null}
          </View>
          {votants.map((v) => {
            const val = valeur(p, v.personneId);
            return (
              <View key={v.personneId} style={{ gap: theme.spacing.xs }}>
                {votants.length > 1 ? <Text style={styles.petit}>{v.prenom}</Text> : null}
                <View style={styles.ligne}>
                  <Bouton
                    titre="Je suis dispo"
                    variante={val === 'oui' ? 'plein' : 'contour'}
                    onPress={() => choisir(p.id, v.personneId, 'oui')}
                    style={{ flex: 1 }}
                  />
                  <Bouton
                    titre="Pas dispo"
                    variante={val === 'non' ? 'plein' : 'contour'}
                    onPress={() => choisir(p.id, v.personneId, 'non')}
                    style={{ flex: 1 }}
                  />
                </View>
              </View>
            );
          })}
        </View>
      ))}

      <Bouton
        titre="Envoyer mes disponibilités"
        desactive={aEnvoyer.length === 0}
        enCours={enCours}
        onPress={() => {
          onEnvoyer(aEnvoyer);
          setChoix(new Map());
        }}
      />
      <Bouton titre="Proposer d’autres dates" variante="discret" onPress={onProposerAutre} />
    </View>
  );
}

const styles = creerStylesThemes(() => ({
  titre: { fontFamily: theme.fontTitle, fontSize: 20, color: theme.colors.text },
  petit: { fontFamily: theme.fontBody, fontSize: 14, color: theme.colors.textMuted },
  plage: { fontFamily: theme.fontBodyBold, fontSize: 16, color: theme.colors.text },
  ligne: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
  carte: {
    gap: theme.spacing.sm,
    padding: theme.spacing.md,
    borderRadius: theme.radii.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  carteMeilleure: { borderColor: theme.colors.success, borderWidth: 2 },
}));
