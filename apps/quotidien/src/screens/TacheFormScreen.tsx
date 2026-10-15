import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { theme, creerStylesThemes } from '../theme/theme';
import { useAuth } from '../contexts/AuthContext';
import { Bouton, Chargement } from '../components/ui';
import { alerte } from '../utils/alerte';
import { extraireMessageErreur } from '@apps-famille/famille';
import { listerPersonnes, type Personne } from '../services/personnes';
import { JOURS } from '../services/quotidien';
import {
  creerTache,
  formaterPoints,
  listerTaches,
  modifierTache,
  pointsParEuro,
  supprimerTache,
  type Recurrence,
} from '../services/maison';

const RECURRENCES: { id: Recurrence; libelle: string }[] = [
  { id: 'aucune', libelle: 'Une fois' },
  { id: 'quotidienne', libelle: 'Chaque jour' },
  { id: 'hebdomadaire', libelle: 'Certains jours' },
];

// Créer ou modifier une tâche : libellé, points, fréquence, pour qui
// (plusieurs personnes = à tour de rôle ; personne = « qui veut »).
export default function TacheFormScreen({ route, navigation }: any) {
  const id: string | undefined = route.params?.id;
  const { foyer } = useAuth();
  const [pret, setPret] = useState(!id);
  const [libelle, setLibelle] = useState('');
  const [points, setPoints] = useState('10');
  const [recurrence, setRecurrence] = useState<Recurrence>('quotidienne');
  const [jours, setJours] = useState<number[]>([]);
  const [choisies, setChoisies] = useState<string[]>([]);
  const [active, setActive] = useState(true);
  const [personnes, setPersonnes] = useState<Personne[]>([]);
  const [taux, setTaux] = useState(10);
  const [enCours, setEnCours] = useState<string | null>(null);

  useEffect(() => {
    navigation.setOptions({ title: id ? 'Modifier la tâche' : 'Nouvelle tâche' });
    if (!foyer) return;
    Promise.all([listerPersonnes([foyer.id]), pointsParEuro(), id ? listerTaches() : Promise.resolve([])])
      .then(([ps, tx, taches]) => {
        setPersonnes(ps);
        setTaux(tx);
        const t = taches.find((x) => x.id === id);
        if (t) {
          setLibelle(t.libelle);
          setPoints(String(t.points));
          setRecurrence(t.recurrence);
          setJours(t.jours);
          setChoisies(t.personnes);
          setActive(t.active);
        }
        setPret(true);
      })
      .catch((e) => alerte('Chargement impossible', extraireMessageErreur(e, 'Veuillez réessayer.')));
  }, [id, foyer, navigation]);

  if (!pret) return <Chargement />;

  const nbPoints = Number(points.trim() || '0');
  const basculer = <T,>(liste: T[], v: T) => (liste.includes(v) ? liste.filter((x) => x !== v) : [...liste, v]);

  const enregistrer = async () => {
    if (!foyer) return;
    if (!libelle.trim()) return alerte('Tâche', 'Indiquez ce qu’il faut faire.');
    if (!Number.isInteger(nbPoints) || nbPoints < 0) return alerte('Points', 'Indiquez un nombre de points (0 ou plus).');
    if (recurrence === 'hebdomadaire' && jours.length === 0) return alerte('Jours', 'Choisissez au moins un jour.');
    setEnCours('enregistrer');
    try {
      const saisie = {
        libelle: libelle.trim(),
        points: nbPoints,
        recurrence,
        jours: recurrence === 'hebdomadaire' ? jours : [],
        personnes: choisies,
      };
      if (id) await modifierTache(id, { ...saisie, active });
      else await creerTache(foyer.id, saisie);
      navigation.goBack();
    } catch (e) {
      alerte('Enregistrement impossible', extraireMessageErreur(e, 'Veuillez réessayer.'));
    } finally {
      setEnCours(null);
    }
  };

  const supprimer = () =>
    alerte('Supprimer cette tâche ?', 'Son historique disparaît aussi, ainsi que les points déjà gagnés avec elle.', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: async () => {
          try {
            await supprimerTache(id!);
            navigation.goBack();
          } catch (e) {
            alerte('Suppression impossible', extraireMessageErreur(e, 'Veuillez réessayer.'));
          }
        },
      },
    ]);

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.contenu} keyboardShouldPersistTaps="handled">
      <Text style={styles.libelle}>Tâche</Text>
      <TextInput
        style={styles.champ}
        value={libelle}
        onChangeText={setLibelle}
        placeholder="ex. Mettre la table"
        placeholderTextColor={theme.colors.textMuted}
        accessibilityLabel="Tâche"
      />

      <Text style={styles.libelle}>Points gagnés</Text>
      <TextInput
        style={styles.champ}
        value={points}
        onChangeText={(v) => setPoints(v.replace(/[^0-9]/g, ''))}
        keyboardType="number-pad"
        accessibilityLabel="Points gagnés"
      />
      <Text style={styles.aide}>{nbPoints > 0 ? `Soit ${formaterPoints(nbPoints, taux)} dans la tirelire.` : 'Pas de points.'}</Text>

      <Text style={styles.libelle}>Quand</Text>
      <View style={styles.puces}>
        {RECURRENCES.map((r) => (
          <Pressable
            key={r.id}
            onPress={() => setRecurrence(r.id)}
            style={[styles.puce, recurrence === r.id && styles.puceActive]}
            accessibilityRole="radio"
            accessibilityState={{ selected: recurrence === r.id }}
          >
            <Text style={[styles.puceTexte, recurrence === r.id && { color: theme.colors.background }]}>{r.libelle}</Text>
          </Pressable>
        ))}
      </View>
      {recurrence === 'hebdomadaire' && (
        <View style={styles.puces}>
          {JOURS.map((j, i) => (
            <Pressable
              key={j}
              onPress={() => setJours(basculer(jours, i + 1))}
              style={[styles.puce, jours.includes(i + 1) && styles.puceActive]}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: jours.includes(i + 1) }}
            >
              <Text style={[styles.puceTexte, jours.includes(i + 1) && { color: theme.colors.background }]}>
                {j.charAt(0).toUpperCase() + j.slice(1, 3)}
              </Text>
            </Pressable>
          ))}
        </View>
      )}

      <Text style={styles.libelle}>Pour qui</Text>
      <Text style={styles.aide}>
        Plusieurs personnes : à tour de rôle ({recurrence === 'quotidienne' ? 'un jour chacun' : 'une semaine chacun'}). Personne : « qui veut ».
      </Text>
      <View style={styles.puces}>
        {personnes.map((p) => {
          const rang = choisies.indexOf(p.id);
          return (
            <Pressable
              key={p.id}
              onPress={() => setChoisies(basculer(choisies, p.id))}
              style={[styles.puce, rang >= 0 && styles.puceActive]}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: rang >= 0 }}
            >
              <Text style={[styles.puceTexte, rang >= 0 && { color: theme.colors.background }]}>
                {choisies.length > 1 && rang >= 0 ? `${rang + 1}. ` : ''}
                {p.prenom}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {personnes.length === 0 && (
        <Text style={styles.aide}>Ajoutez vos enfants dans le Profil (« Mon foyer ») pour leur confier des tâches.</Text>
      )}

      {id && (
        <Pressable
          onPress={() => setActive(!active)}
          style={[styles.puce, styles.pause, !active && styles.puceActive]}
          accessibilityRole="switch"
          accessibilityState={{ checked: !active }}
        >
          <Text style={[styles.puceTexte, !active && { color: theme.colors.background }]}>
            {active ? 'Mettre en pause' : 'En pause (toucher pour réactiver)'}
          </Text>
        </Pressable>
      )}

      <Bouton titre="Enregistrer" onPress={enregistrer} enCours={enCours === 'enregistrer'} style={{ marginTop: theme.spacing.md }} />
      {id && <Bouton variante="discret" titre="Supprimer la tâche" onPress={supprimer} />}
    </ScrollView>
  );
}

const styles = creerStylesThemes(() => ({
  flex: { flex: 1, backgroundColor: theme.colors.background },
  contenu: { padding: theme.spacing.md, gap: theme.spacing.xs, paddingBottom: theme.spacing.xl },
  libelle: { fontFamily: theme.fontBodyBold, fontSize: 14, color: theme.colors.text, marginTop: theme.spacing.sm },
  aide: { fontFamily: theme.fontBody, fontSize: 13, color: theme.colors.textMuted },
  champ: {
    minHeight: 44,
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radii.md,
    paddingHorizontal: theme.spacing.sm,
    color: theme.colors.text,
    fontFamily: theme.fontBody,
    fontSize: 16,
  },
  puces: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.xs, marginTop: theme.spacing.xs },
  puce: {
    minHeight: 40,
    minWidth: 48,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: theme.colors.accent,
  },
  puceActive: { backgroundColor: theme.colors.accent },
  puceTexte: { fontFamily: theme.fontBodyBold, fontSize: 14, color: theme.colors.accent },
  pause: { alignSelf: 'flex-start', marginTop: theme.spacing.md },
}));
