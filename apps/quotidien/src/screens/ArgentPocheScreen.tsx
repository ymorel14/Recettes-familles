import React, { useCallback, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { theme, creerStylesThemes } from '../theme/theme';
import { useAuth } from '../contexts/AuthContext';
import { Carte, TitreSection } from '../components/elements';
import { Bouton, Chargement, MessageVide } from '../components/ui';
import { alerte } from '../utils/alerte';
import { extraireMessageErreur } from '@apps-famille/famille';
import { listerPersonnes, type Personne } from '../services/personnes';
import {
  definirPointsParEuro,
  formaterPoints,
  listerTirelires,
  pointsParEuro,
  soldes,
  verserArgentDePoche,
  type Tirelire,
} from '../services/maison';

// Tirelires des enfants du foyer (personnes sans compte) : solde en points
// avec l'équivalent en euros, objectif d'épargne. Les versements de la
// semaine sont faits à l'ouverture. Argent fictif : rien n'est versé ni
// prélevé.
export default function ArgentPocheScreen({ navigation }: any) {
  const { foyer } = useAuth();
  const [enfants, setEnfants] = useState<Personne[] | null>(null);
  const [tirelires, setTirelires] = useState<Tirelire[]>([]);
  const [lesSoldes, setSoldes] = useState<Map<string, number>>(new Map());
  const [taux, setTaux] = useState(10);
  const [tauxSaisi, setTauxSaisi] = useState('');
  const [enCours, setEnCours] = useState(false);

  const charger = useCallback(async () => {
    if (!foyer) return;
    try {
      await verserArgentDePoche();
      const [ps, ts, ss, tx] = await Promise.all([listerPersonnes([foyer.id]), listerTirelires(), soldes(), pointsParEuro()]);
      setEnfants(ps.filter((p) => !p.utilisateur_id));
      setTirelires(ts);
      setSoldes(ss);
      setTaux(tx);
      setTauxSaisi(String(tx));
    } catch (e) {
      alerte('Chargement impossible', extraireMessageErreur(e, 'Veuillez réessayer.'));
      setEnfants([]);
    }
  }, [foyer]);

  useFocusEffect(
    useCallback(() => {
      charger();
    }, [charger])
  );

  if (!enfants) return <Chargement />;

  const changerTaux = async () => {
    const n = Number(tauxSaisi);
    if (!Number.isInteger(n) || n < 1 || n > 1000) return alerte('Taux', 'Indiquez un nombre de points entre 1 et 1 000.');
    setEnCours(true);
    try {
      await definirPointsParEuro(n);
      await charger();
    } catch (e) {
      alerte('Enregistrement impossible', extraireMessageErreur(e, 'Veuillez réessayer.'));
    } finally {
      setEnCours(false);
    }
  };

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.contenu} keyboardShouldPersistTaps="handled">
      {enfants.length === 0 && (
        <MessageVide
          titre="Pas encore d’enfant dans le foyer"
          texte="Ajoutez vos enfants dans le Profil (« Mon foyer ») : chacun aura sa tirelire."
        />
      )}
      {enfants.map((e) => {
        const t = tirelires.find((x) => x.personne_id === e.id);
        const solde = lesSoldes.get(e.id) ?? 0;
        const progression = t?.objectif_points ? Math.max(0, Math.min(1, solde / t.objectif_points)) : 0;
        return (
          <Pressable
            key={e.id}
            onPress={() => navigation.navigate('Tirelire', { personneId: e.id, prenom: e.prenom })}
            accessibilityRole="button"
            accessibilityLabel={`Tirelire de ${e.prenom}`}
          >
            <Carte>
              <View style={styles.ligne}>
                <Text style={styles.prenom}>{e.prenom}</Text>
                <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />
              </View>
              <Text style={styles.solde}>{formaterPoints(solde, taux)}</Text>
              {t?.objectif_points ? (
                <View style={styles.objectif}>
                  <Text style={styles.detail}>
                    Objectif : {t.objectif_libelle ?? 'épargne'}, {formaterPoints(t.objectif_points, taux)}
                  </Text>
                  <View style={styles.barreFond} accessibilityLabel={`${Math.round(progression * 100)} % de l'objectif`}>
                    <View style={[styles.barre, { width: `${progression * 100}%` }]} />
                  </View>
                </View>
              ) : null}
              <Text style={styles.detail}>
                {t && t.hebdomadaire > 0 ? `${t.hebdomadaire} points par semaine` : 'Pas d’argent de poche hebdomadaire réglé'}
              </Text>
            </Carte>
          </Pressable>
        );
      })}

      <TitreSection titre="Réglage du foyer" />
      <Carte>
        <View style={styles.ligne}>
          <TextInput
            style={[styles.champ, { width: 80 }]}
            value={tauxSaisi}
            onChangeText={(v) => setTauxSaisi(v.replace(/[^0-9]/g, ''))}
            keyboardType="number-pad"
            accessibilityLabel="Nombre de points pour un euro"
          />
          <Text style={[styles.detail, { flex: 1 }]}>points = 1 €</Text>
          {tauxSaisi !== String(taux) && <Bouton titre="OK" onPress={changerTaux} enCours={enCours} />}
        </View>
        <Text style={styles.detail}>Argent fictif : rien n’est versé ni prélevé, les euros ne sont qu’un repère.</Text>
      </Carte>
    </ScrollView>
  );
}

const styles = creerStylesThemes(() => ({
  flex: { flex: 1, backgroundColor: theme.colors.background },
  contenu: { padding: theme.spacing.md, gap: theme.spacing.sm, paddingBottom: theme.spacing.xl },
  ligne: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
  prenom: { flex: 1, fontFamily: theme.fontTitle, fontSize: 20, color: theme.colors.text },
  solde: { fontFamily: theme.fontTitle, fontSize: 24, color: theme.colors.accent },
  objectif: { gap: 6 },
  barreFond: { height: 10, borderRadius: 5, backgroundColor: theme.colors.selectionTransparent },
  barre: { height: 10, borderRadius: 5, backgroundColor: theme.colors.accent },
  detail: { fontFamily: theme.fontBody, fontSize: 14, color: theme.colors.textMuted },
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
    textAlign: 'center',
  },
}));
