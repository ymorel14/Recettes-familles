import React, { useCallback, useState } from 'react';
import { Pressable, ScrollView, Share, Text, TextInput, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { theme, creerStylesThemes } from '../theme/theme';
import { Carte, TitreSection } from '../components/elements';
import { Bouton, Chargement } from '../components/ui';
import { alerte } from '../utils/alerte';
import { extraireMessageErreur } from '@apps-famille/famille';
import { adresseEnfant, JOURS } from '../services/quotidien';
import {
  ajouterMouvement,
  creerAccesEnfant,
  lienAccesEnfant,
  retirerAccesEnfant,
  definirTirelire,
  eurosEnPoints,
  formaterPoints,
  listerMouvements,
  listerTirelires,
  pointsParEuro,
  retirerMouvement,
  soldes,
  type Mouvement,
} from '../services/maison';

// Tirelire d'un enfant : solde, objectif, dépense ou bonus (saisis en
// euros, enregistrés en points), historique, réglages de la semaine.
export default function TirelireScreen({ route, navigation }: any) {
  const { personneId, prenom } = route.params as { personneId: string; prenom: string };
  const [solde, setSolde] = useState<number | null>(null);
  const [mouvements, setMouvements] = useState<Mouvement[]>([]);
  const [taux, setTaux] = useState(10);
  const [sens, setSens] = useState<'depense' | 'bonus'>('depense');
  const [montant, setMontant] = useState('');
  const [libelle, setLibelle] = useState('');
  const [hebdo, setHebdo] = useState('0');
  const [jour, setJour] = useState(6);
  const [objectif, setObjectif] = useState('');
  const [objectifEuros, setObjectifEuros] = useState('');
  const [enCours, setEnCours] = useState<string | null>(null);
  const [lien, setLien] = useState<string | null>(null);

  const charger = useCallback(async () => {
    navigation.setOptions({ title: `Tirelire de ${prenom}` });
    try {
      const [ss, ms, ts, tx, jeton] = await Promise.all([
        soldes(),
        listerMouvements(personneId),
        listerTirelires(),
        pointsParEuro(),
        lienAccesEnfant(personneId),
      ]);
      setLien(jeton);
      setSolde(ss.get(personneId) ?? 0);
      setMouvements(ms);
      setTaux(tx);
      const t = ts.find((x) => x.personne_id === personneId);
      if (t) {
        setHebdo(String(t.hebdomadaire));
        setJour(t.jour_versement);
        setObjectif(t.objectif_libelle ?? '');
        setObjectifEuros(t.objectif_points ? String(t.objectif_points / tx).replace('.', ',') : '');
      }
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

  const enregistrerMouvement = () => {
    const pts = eurosEnPoints(montant, taux);
    if (!pts) return alerte('Montant', 'Indiquez un montant en euros, par exemple 4,50.');
    agir('mouvement', async () => {
      await ajouterMouvement(personneId, sens === 'depense' ? -pts : pts, libelle);
      setMontant('');
      setLibelle('');
    });
  };

  const enregistrerReglages = () => {
    const h = Number(hebdo || '0');
    const obj = objectifEuros.trim() ? eurosEnPoints(objectifEuros, taux) : null;
    if (!Number.isInteger(h) || h < 0) return alerte('Argent de poche', 'Indiquez un nombre de points par semaine.');
    if (objectifEuros.trim() && !obj) return alerte('Objectif', 'Indiquez le prix de l’objectif en euros.');
    agir('reglages', () =>
      definirTirelire(personneId, { hebdomadaire: h, jour, objectif: objectif.trim() || null, objectifPoints: obj })
    );
  };

  const points = eurosEnPoints(montant, taux);

  const envoyerLien = async (jeton: string) =>
    Share.share({
      message: `${prenom}, voici ton espace Quotidien : tes tâches du jour et ta tirelire. Garde ce lien pour toi : ${adresseEnfant(jeton)}`,
    });

  const nouveauLien = () =>
    agir('lien', async () => {
      const jeton = await creerAccesEnfant(personneId);
      await envoyerLien(jeton);
    });

  const retirerLien = () =>
    alerte(`Retirer l’accès de ${prenom} ?`, 'Son lien ne fonctionnera plus. Vous pourrez en créer un autre.', [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Retirer', style: 'destructive', onPress: () => agir('lien', () => retirerAccesEnfant(personneId)) },
    ]);

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.contenu} keyboardShouldPersistTaps="handled">
      <Text style={styles.solde}>{formaterPoints(solde, taux)}</Text>

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
          <Bouton titre="Ajouter" onPress={enregistrerMouvement} enCours={enCours === 'mouvement'} desactive={!points} />
        </View>
        {points ? <Text style={styles.detail}>Soit {points} points.</Text> : null}
      </Carte>

      <TitreSection titre="Historique" />
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
              {formaterPoints(m.points, taux, true)}
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

      <TitreSection titre={`Espace de ${prenom}`} />
      <Carte>
        <Text style={styles.detail}>
          Un lien personnel, sans compte ni email : {prenom} y voit ses tâches du jour, appuie sur « J’ai fini » (vous validez
          ensuite dans Tâches) et suit sa tirelire. Rien d’autre de la famille n’y apparaît.
        </Text>
        {lien ? (
          <>
            <Bouton titre="Envoyer son lien" onPress={() => envoyerLien(lien)} />
            <View style={styles.ligne}>
              <View style={{ flex: 1 }}>
                <Bouton variante="contour" titre="Nouveau lien" onPress={nouveauLien} enCours={enCours === 'lien'} />
              </View>
              <View style={{ flex: 1 }}>
                <Bouton variante="contour" titre="Retirer l’accès" onPress={retirerLien} desactive={enCours !== null} />
              </View>
            </View>
          </>
        ) : (
          <Bouton titre={`Créer le lien de ${prenom}`} onPress={nouveauLien} enCours={enCours === 'lien'} />
        )}
      </Carte>

      <TitreSection titre="Réglages" />
      <Carte>
        <Text style={styles.libelle}>Argent de poche (points par semaine)</Text>
        <TextInput
          style={styles.champ}
          value={hebdo}
          onChangeText={(v) => setHebdo(v.replace(/[^0-9]/g, ''))}
          keyboardType="number-pad"
          accessibilityLabel="Points par semaine"
        />
        <Text style={styles.libelle}>Versé le</Text>
        <View style={styles.puces}>
          {JOURS.map((j, i) => (
            <Pressable
              key={j}
              onPress={() => setJour(i + 1)}
              style={[styles.puce, jour === i + 1 && styles.puceActive]}
              accessibilityRole="radio"
              accessibilityState={{ selected: jour === i + 1 }}
            >
              <Text style={[styles.puceTexte, jour === i + 1 && { color: theme.colors.background }]}>
                {j.charAt(0).toUpperCase() + j.slice(1, 3)}
              </Text>
            </Pressable>
          ))}
        </View>
        <Text style={styles.libelle}>Objectif d’épargne (facultatif)</Text>
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
        <Bouton titre="Enregistrer les réglages" onPress={enregistrerReglages} enCours={enCours === 'reglages'} />
      </Carte>
    </ScrollView>
  );
}

const styles = creerStylesThemes(() => ({
  flex: { flex: 1, backgroundColor: theme.colors.background },
  contenu: { padding: theme.spacing.md, gap: theme.spacing.sm, paddingBottom: theme.spacing.xl },
  solde: { fontFamily: theme.fontTitle, fontSize: 28, color: theme.colors.accent, textAlign: 'center', marginVertical: theme.spacing.sm },
  ligne: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
  libelle: { fontFamily: theme.fontBodyBold, fontSize: 14, color: theme.colors.text, marginTop: theme.spacing.xs },
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
    minHeight: 36,
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
