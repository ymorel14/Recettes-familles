import React, { useState } from 'react';
import { Linking, Pressable, Text, View } from 'react-native';
import { theme, creerStylesThemes } from '../theme/theme';
import { Aide, Champ, Puces } from './formulaire';
import { Bouton, Pastille } from './ui';
import {
  decisionEffective,
  lireLien,
  MODES_TRANSPORT,
  nouvelleIdee,
  type Decision,
  type Idee,
  type ModeTransport,
} from '../services/creation';

// « Ajouter ce qu'on veut, comme on veut » (refonte § 5.4) : un seul champ,
// un texte libre (« Randonnée », « Chez Mamie ») ou un lien dont le nom, le
// lieu et le prix sont lus sur la page. Pour un trajet, on choisit d'abord le
// moyen. Sous la liste : « Soumettre au vote » ou « C'est décidé » (§ 5.5).
export function AjoutLibre({
  genre,
  items,
  onChange,
  decision,
  onDecision,
  retenu,
  onRetenir,
  mode,
  onMode,
  placeholder,
  aideVote = true,
}: {
  genre: 'hebergement' | 'trajet' | 'activite';
  items: Idee[];
  onChange: (items: Idee[]) => void;
  decision: Decision | null;
  onDecision: (d: Decision) => void;
  retenu?: string | null;
  onRetenir?: (cle: string) => void;
  mode?: ModeTransport;
  onMode?: (m: ModeTransport) => void;
  placeholder: string;
  aideVote?: boolean;
}) {
  const [texte, setTexte] = useState('');
  const effective = decisionEffective(items.length, decision);
  // Activités : « C'est décidé » les retient toutes ; sinon un seul choix.
  const choixUnique = genre !== 'activite';

  const ajouter = async () => {
    const t = texte.trim();
    if (!t) return;
    const idee = nouvelleIdee(t, genre, mode ?? 'voiture');
    setTexte('');
    // Ajoute tout de suite (la carte affiche « Lecture du lien… »), puis complète.
    let courant = [...items, idee];
    onChange(courant);
    if (idee.lecture) {
      const lue = await lireLien(idee);
      courant = courant.map((x) => (x.cle === idee.cle ? lue : x));
      onChange(courant);
    }
  };

  return (
    <View style={{ gap: theme.spacing.sm }}>
      {genre === 'trajet' && onMode ? (
        <Puces options={MODES_TRANSPORT} valeur={mode ?? 'voiture'} onChange={(m: ModeTransport) => onMode(m)} />
      ) : null}

      <View style={styles.ligne}>
        <Champ
          style={{ flex: 1 }}
          value={texte}
          onChangeText={setTexte}
          placeholder={placeholder}
          onSubmitEditing={ajouter}
          returnKeyType="done"
          autoCapitalize="sentences"
          accessibilityLabel={placeholder}
        />
        <Bouton titre="Ajouter" variante="contour" onPress={ajouter} desactive={!texte.trim()} />
      </View>
      <Aide>Écrivez simplement, ou collez un lien : le nom, le lieu et le prix sont récupérés sur la page.</Aide>

      {items.map((it) => {
        const estRetenu = choixUnique && effective === 'decide' && items.length > 1 && (retenu ?? items[0].cle) === it.cle;
        return (
          <View key={it.cle} style={[styles.carte, estRetenu && styles.carteRetenue]}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={styles.titre}>{it.nom}</Text>
              <Text style={styles.detail}>{it.lecture ? 'Lecture du lien…' : it.detail}</Text>
              <View style={styles.etiquettes}>
                {it.site ? <Pastille texte={`Lien · ${it.site}`} ton="neutre" /> : null}
                {it.mode ? <Pastille texte={MODES_TRANSPORT.find((m) => m.id === it.mode)?.libelle ?? ''} ton="neutre" /> : null}
                {estRetenu ? <Pastille texte="Retenu" ton="succes" /> : null}
              </View>
              {it.lien ? (
                <Text style={styles.lien} onPress={() => Linking.openURL(it.lien!)} accessibilityRole="link">
                  Voir la page
                </Text>
              ) : null}
              {choixUnique && effective === 'decide' && items.length > 1 && onRetenir && !estRetenu ? (
                <Bouton titre="Retenir" variante="contour" onPress={() => onRetenir(it.cle)} />
              ) : null}
            </View>
            <Pressable
              onPress={() => onChange(items.filter((x) => x.cle !== it.cle))}
              accessibilityRole="button"
              accessibilityLabel={`Retirer ${it.nom}`}
              style={styles.retirer}
            >
              <Text style={styles.retirerTexte}>×</Text>
            </Pressable>
          </View>
        );
      })}

      {items.length >= 1 ? (
        <View style={{ gap: theme.spacing.xs }}>
          <View style={styles.ligne}>
            <Bouton
              titre="Soumettre au vote"
              variante={effective === 'vote' && items.length > 1 ? 'plein' : 'contour'}
              onPress={() => onDecision('vote')}
              style={{ flex: 1 }}
              desactive={items.length === 1}
            />
            <Bouton
              titre="C’est décidé"
              variante={effective === 'decide' ? 'plein' : 'contour'}
              onPress={() => onDecision('decide')}
              style={{ flex: 1 }}
            />
          </View>
          {aideVote ? (
            <Aide>
              {items.length === 1
                ? 'Une seule proposition : elle est retenue. Ajoutez-en une autre pour voter.'
                : effective === 'vote'
                  ? 'Plusieurs propositions : les invités votent.'
                  : genre === 'activite'
                    ? 'Toutes les activités sont retenues.'
                    : 'Choisissez celle que vous retenez : les autres sont écartées.'}
            </Aide>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = creerStylesThemes(() => ({
  ligne: { flexDirection: 'row', gap: theme.spacing.sm, alignItems: 'center' },
  carte: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    padding: theme.spacing.md,
    borderRadius: theme.radii.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  carteRetenue: { borderColor: theme.colors.success },
  titre: { fontFamily: theme.fontBodyBold, fontSize: 15, color: theme.colors.text },
  detail: { fontFamily: theme.fontBody, fontSize: 13, color: theme.colors.textMuted },
  etiquettes: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 2 },
  lien: { fontFamily: theme.fontBodyBold, fontSize: 13, color: theme.colors.accent, minHeight: 32 },
  retirer: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  retirerTexte: { fontSize: 24, color: theme.colors.textMuted },
}));
