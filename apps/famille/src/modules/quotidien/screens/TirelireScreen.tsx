import React, { useCallback, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { theme, creerStylesThemes } from '../theme/theme';
import { Carte, TitreSection } from '../components/elements';
import { Bouton, Chargement } from '../components/ui';
import { alerte } from '../utils/alerte';
import { extraireMessageErreur } from '@apps-famille/famille';
import {
  ajouterMouvement,
  definirTirelire,
  eurosEnCentimes,
  formaterCentimes,
  listerMouvements,
  listerTirelires,
  retirerMouvement,
  soldes,
  type Mouvement,
  type Tirelire,
} from '../services/maison';

// « Historique » de la tirelire d'un enfant (refonte Quotidien § 4.4) : solde,
// dépense ou bonus saisis par un parent, mouvements, objectif d'épargne.
// Tout est en euros (stockés en centimes). Le montant par semaine et le lien de
// l'enfant se règlent dans « Tâches de [prénom] ». Argent fictif.
export default function TirelireScreen({ route, navigation }: any) {
  const { personneId, prenom } = route.params as { personneId: string; prenom: string };
  const [solde, setSolde] = useState<number | null>(null);
  const [mouvements, setMouvements] = useState<Mouvement[]>([]);
  const [tirelire, setTirelire] = useState<Tirelire | null>(null);
  const [sens, setSens] = useState<'depense' | 'bonus'>('depense');
  const [montant, setMontant] = useState('');
  const [libelle, setLibelle] = useState('');
  const [objectif, setObjectif] = useState('');
  const [objectifEuros, setObjectifEuros] = useState('');
  const [enCours, setEnCours] = useState<string | null>(null);

  const charger = useCallback(async () => {
    navigation.setOptions({ title: `Historique de ${prenom}` });
    try {
      const [ss, ms, ts] = await Promise.all([soldes(), listerMouvements(personneId), listerTirelires()]);
      setSolde(ss.get(personneId) ?? 0);
      setMouvements(ms);
      const t = ts.find((x) => x.personne_id === personneId) ?? null;
      setTirelire(t);
      setObjectif(t?.objectif_libelle ?? '');
      setObjectifEuros(t?.objectif_points ? String(t.objectif_points / 100).replace('.', ',') : '');
    } catch (e) {
      alerte('Chargement impossible', extraireMessageErreur(e, 'Veuillez réessayer.'));
      setSolde(0);
    }
  }, [personneId, prenom, navigation]);

  useFocusEffect(
    useCallback(() => {
      charger();
    }, [charger])
  );

  const agir = async (cle: string, action: () => Promise<void>) => {
    setEnCours(cle);
    try {
      await action();
      await charger();
    } catch (e) {
      alerte('Action impossible', extraireMessageErreur(e, 'Veuillez réessayer.'));
    } finally {
      setEnCours(null);
    }
  };

  if (solde === null) return <Chargement />;

  const centimes = eurosEnCentimes(montant);

  const enregistrerMouvement = () => {
    if (!centimes) return alerte('Montant', 'Indiquez un montant en euros, par exemple 4,50.');
    agir('mouvement', async () => {
      await ajouterMouvement(personneId, sens === 'depense' ? -centimes : centimes, libelle);
      setMontant('');
      setLibelle('');
    });
  };

  const enregistrerObjectif = () => {
    const prix = objectifEuros.trim() ? eurosEnCentimes(objectifEuros) : null;
    if (objectifEuros.trim() && !prix) return alerte('Objectif', 'Indiquez le prix de l’objectif en euros.');
    agir('objectif', () =>
      definirTirelire(personneId, {
        hebdomadaire: tirelire?.hebdomadaire ?? 0,
        jour: tirelire?.jour_versement ?? 7,
        objectif: objectif.trim() || null,
        objectifPoints: prix,
      })
    );
  };

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.contenu} keyboardShouldPersistTaps="handled">
      <Text style={styles.solde}>{formaterCentimes(solde)}</Text>
      <Bouton
        titre={`Régler l’argent de poche de ${prenom}`}
        variante="discret"
        onPress={() => navigation.navigate('TachesEnfant', { personneId, prenom })}
      />

      <TitreSection titre={sens === 'depense' ? 'Une dépense' : 'Un bonus'} />
      <Carte>
        <View style={styles.puces}>
          {(['depense', 'bonus'] as const).map((s) => (
            <Pressable
              key={s}
              onPress={() => setSens(s)}
              style={[styles.puce, sens === s && styles.puceActive]}
              accessibilityRole="radio"
              accessibilityState={{ selected: sens === s }}
            >
              <Text style={[styles.puceTexte, sens === s && { color: theme.colors.background }]}>
                {s === 'depense' ? 'Dépense' : 'Bonus'}
              </Text>
            </Pressable>
          ))}
        </View>
        <TextInput
          style={styles.champ}
          value={libelle}
          onChangeText={setLibelle}
          placeholder={sens === 'depense' ? 'ex. Cartes Panini' : 'ex. Bon bulletin'}
          placeholderTextColor={theme.colors.textMuted}
          accessibilityLabel="Libellé"
        />
        <View style={styles.ligne}>
          <TextInput
            style={[styles.champ, { flex: 1 }]}
            value={montant}
            onChangeText={setMontant}
            placeholder="Montant en euros"
            placeholderTextColor={theme.colors.textMuted}
            keyboardType="decimal-pad"
            accessibilityLabel="Montant en euros"
          />
          <Bouton titre="Ajouter" onPress={enregistrerMouvement} enCours={enCours === 'mouvement'} desactive={!centimes} />
        </View>
      </Carte>

      <TitreSection titre="Mouvements" />
      <Carte>
        {mouvements.length === 0 && <Text style={styles.detail}>Rien pour l’instant.</Text>}
        {mouvements.map((m) => (
          <View key={m.id} style={styles.mouvement}>
            <Text style={styles.date}>
              {new Date(m.cree_le).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })}
            </Text>
            <Text style={styles.texte} numberOfLines={2}>
              {m.libelle}
            </Text>
            <Text style={[styles.montant, { color: m.points < 0 ? theme.colors.warning : theme.colors.success }]}>
              {formaterCentimes(m.points, true)}
            </Text>
            {(m.origine === 'depense' || m.origine === 'bonus') && (
              <Pressable
                onPress={() => agir(m.id, () => retirerMouvement(m.id))}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={`Retirer ${m.libelle}`}
              >
                <Text style={styles.lienDiscret}>×</Text>
              </Pressable>
            )}
          </View>
        ))}
      </Carte>

      <TitreSection titre="Objectif d’épargne" detail="facultatif" />
      <Carte>
        <View style={styles.ligne}>
          <TextInput
            style={[styles.champ, { flex: 2 }]}
            value={objectif}
            onChangeText={setObjectif}
            placeholder="ex. Vélo"
            placeholderTextColor={theme.colors.textMuted}
            accessibilityLabel="Objectif"
          />
          <TextInput
            style={[styles.champ, { flex: 1 }]}
            value={objectifEuros}
            onChangeText={setObjectifEuros}
            placeholder="Prix €"
            placeholderTextColor={theme.colors.textMuted}
            keyboardType="decimal-pad"
            accessibilityLabel="Prix de l'objectif en euros"
          />
        </View>
        {tirelire ? (
          <Bouton titre="Enregistrer l’objectif" onPress={enregistrerObjectif} enCours={enCours === 'objectif'} />
        ) : (
          <Text style={styles.detail}>Réglez d’abord l’argent de poche de {prenom} pour ajouter un objectif.</Text>
        )}
      </Carte>

      <Text style={styles.detail}>Argent fictif : rien n’est versé ni prélevé, les euros ne sont qu’un repère.</Text>
    </ScrollView>
  );
}

const styles = creerStylesThemes(() => ({
  flex: { flex: 1, backgroundColor: theme.colors.background },
  contenu: { padding: theme.spacing.md, gap: theme.spacing.sm, paddingBottom: theme.spacing.xl },
  solde: { fontFamily: theme.fontTitle, fontSize: 32, color: theme.colors.accent, textAlign: 'center', marginVertical: theme.spacing.sm },
  ligne: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
  detail: { fontFamily: theme.fontBody, fontSize: 13, color: theme.colors.textMuted },
  champ: {
    minHeight: 44,
    backgroundColor: theme.colors.background,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radii.md,
    paddingHorizontal: theme.spacing.sm,
    color: theme.colors.text,
    fontFamily: theme.fontBody,
    fontSize: 16,
  },
  puces: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.xs },
  puce: {
    minHeight: 40,
    minWidth: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: theme.colors.accent,
  },
  puceActive: { backgroundColor: theme.colors.accent },
  puceTexte: { fontFamily: theme.fontBodyBold, fontSize: 14, color: theme.colors.accent },
  mouvement: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, minHeight: 32 },
  date: { width: 44, fontFamily: theme.fontBody, fontSize: 13, color: theme.colors.textMuted },
  texte: { flex: 1, fontFamily: theme.fontBody, fontSize: 14, color: theme.colors.text },
  montant: { fontFamily: theme.fontBodyBold, fontSize: 13, textAlign: 'right', maxWidth: 140 },
  lienDiscret: { fontFamily: theme.fontBodyBold, fontSize: 18, color: theme.colors.textMuted, paddingHorizontal: 4 },
}));
