import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { theme, creerStylesThemes } from '../theme/theme';
import { useAuth } from '../contexts/AuthContext';
import { Bouton, Chargement } from '../components/ui';
import { alerte } from '../utils/alerte';
import { extraireMessageErreur } from '@apps-famille/famille';
import { BandeauBrouillon, PastilleAVerifier } from '../../../composants/assistant';
import type { TacheProposee } from '../../../services/actionsAssistant';
import { lireDateSaisie, listerPersonnesFamille, type Personne } from '../services/personnes';
import { aujourdHuiIso, JOURS } from '../services/quotidien';
import {
  creerDomaine,
  creerTache,
  formaterPoints,
  libellePlanif,
  listerDomaines,
  listerTaches,
  modifierTache,
  pointsParEuro,
  SUGGESTIONS_DOMAINES,
  supprimerTache,
  type Domaine,
  type Planif,
  type Recurrence,
} from '../services/maison';

// Quand faire la tâche : sans date, chaque jour, certains jours, ou placée
// sur le calendrier (à une date, sur une période, avant une date).
type Quand = 'libre' | 'quotidienne' | 'hebdomadaire' | 'le' | 'entre' | 'avant';

const QUAND: { id: Quand; libelle: string; icone: keyof typeof Ionicons.glyphMap }[] = [
  { id: 'libre', libelle: 'Une fois, sans date', icone: 'checkmark-outline' },
  { id: 'quotidienne', libelle: 'Chaque jour', icone: 'repeat-outline' },
  { id: 'hebdomadaire', libelle: 'Certains jours', icone: 'calendar-number-outline' },
  { id: 'le', libelle: 'À une date', icone: 'calendar-outline' },
  { id: 'entre', libelle: 'Sur une période', icone: 'swap-horizontal-outline' },
  { id: 'avant', libelle: 'Avant une date', icone: 'hourglass-outline' },
];

const DATEE = (q: Quand) => q === 'le' || q === 'entre' || q === 'avant';

function versSaisie(iso: string | null): string {
  if (!iso) return '';
  const [a, m, j] = iso.split('-');
  return `${j}/${m}/${a}`;
}

function decaler(iso: string, jours: number): string {
  const [a, m, j] = iso.split('-').map(Number);
  const d = new Date(a, m - 1, j + jours);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function plusUnAn(iso: string): string {
  const [a, m, j] = iso.split('-').map(Number);
  const d = new Date(a + 1, m - 1, j);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Créer ou modifier une tâche : libellé, domaine, points, quand (récurrente
// ou datée, éventuellement chaque année), pour qui (plusieurs personnes = à
// tour de rôle ; personne = « qui veut »).
export default function TacheFormScreen({ route, navigation }: any) {
  const id: string | undefined = route.params?.id;
  // Brouillon proposé par l'assistant (tâche dictée, bouton ⊕) : le
  // formulaire arrive pré-rempli, à vérifier avant d'enregistrer.
  const brouillon: TacheProposee | undefined = route.params?.brouillon;
  const { foyer } = useAuth();
  const [pret, setPret] = useState(!id);
  const [libelle, setLibelle] = useState(brouillon?.libelle ?? '');
  const [points, setPoints] = useState(brouillon?.points != null ? String(brouillon.points) : '10');
  const [quand, setQuand] = useState<Quand>(brouillon?.quand ?? route.params?.quand ?? 'quotidienne');
  const [annuelle, setAnnuelle] = useState(brouillon?.annuelle ?? false);
  const [date1, setDate1] = useState(
    versSaisie(brouillon ? (brouillon.quand === 'avant' ? brouillon.date_debut : brouillon.date_debut) : route.params?.date ?? null)
  );
  const [date2, setDate2] = useState(brouillon ? versSaisie(brouillon.quand === 'le' ? null : brouillon.date_fin) : '');
  const [jours, setJours] = useState<number[]>(brouillon?.jours ?? []);
  const aVerifier = new Set(brouillon?.a_verifier ?? []);
  const [choisies, setChoisies] = useState<string[]>([]);
  const [active, setActive] = useState(true);
  const [domaineId, setDomaineId] = useState<string | null>(route.params?.domaineId ?? null);
  const [domaines, setDomaines] = useState<Domaine[]>([]);
  const [nouveauDomaine, setNouveauDomaine] = useState<string | null>(null);
  const [personnes, setPersonnes] = useState<Personne[]>([]);
  const [taux, setTaux] = useState(10);
  const [enCours, setEnCours] = useState<string | null>(null);

  useEffect(() => {
    navigation.setOptions({ title: id ? 'Modifier la tâche' : 'Nouvelle tâche' });
    if (!foyer) return;
    Promise.all([listerPersonnesFamille(foyer.id), pointsParEuro(), id ? listerTaches() : Promise.resolve([])])
      .then(([ps, tx, taches]) => {
        setPersonnes(ps);
        setTaux(tx);
        if (brouillon?.pour.length) {
          const ids = brouillon.pour
            .map((p) => ps.find((x) => x.prenom.toLowerCase() === p.toLowerCase())?.id)
            .filter((x): x is string => !!x);
          if (ids.length) setChoisies(ids);
        }
        const t = taches.find((x) => x.id === id);
        if (t) {
          setLibelle(t.libelle);
          setPoints(String(t.points));
          setQuand(t.planif !== 'libre' ? t.planif : t.recurrence === 'aucune' || t.recurrence === 'annuelle' ? 'libre' : t.recurrence);
          setAnnuelle(t.recurrence === 'annuelle');
          if (t.planif === 'avant') {
            setDate1(versSaisie(t.periode_debut));
            setDate2(versSaisie(t.periode_fin));
          } else {
            setDate1(versSaisie(t.periode_debut));
            setDate2(t.planif === 'entre' ? versSaisie(t.periode_fin) : '');
          }
          setJours(t.jours);
          setChoisies(t.personnes);
          setActive(t.active);
          setDomaineId(t.domaine_id);
        }
        setPret(true);
      })
      .catch((e) => alerte('Chargement impossible', extraireMessageErreur(e, 'Veuillez réessayer.')));
  }, [id, foyer, navigation]);

  // Domaines relus au retour de l'écran « Domaines ».
  useFocusEffect(
    useCallback(() => {
      listerDomaines()
        .then((ds) => {
          setDomaines(ds);
          setDomaineId((d) => (d && !ds.some((x) => x.id === d) ? null : d));
        })
        .catch(() => {});
    }, [])
  );

  if (!pret) return <Chargement />;

  // Personnes regroupées : mon foyer (sans titre), puis chaque autre foyer.
  const groupesPersonnes: [string | null, Personne[]][] = [];
  for (const p of personnes) {
    const nom = p.foyer_id === foyer?.id ? null : p.foyer_nom ?? 'Autre foyer';
    const g = groupesPersonnes.find(([n]) => n === nom);
    if (g) g[1].push(p);
    else groupesPersonnes.push([nom, [p]]);
  }

  const nbPoints = Number(points.trim() || '0');
  const basculer = <T,>(liste: T[], v: T) => (liste.includes(v) ? liste.filter((x) => x !== v) : [...liste, v]);
  const datee = DATEE(quand);

  // Dates saisies → { recurrence, planif, periode_debut, periode_fin }, ou un message d'erreur.
  const calculerDates = ():
    | { recurrence: Recurrence; planif: Planif; periode_debut: string | null; periode_fin: string | null }
    | string => {
    if (!datee) {
      return { recurrence: quand === 'libre' ? 'aucune' : (quand as Recurrence), planif: 'libre', periode_debut: null, periode_fin: null };
    }
    const recurrence: Recurrence = annuelle ? 'annuelle' : 'aucune';
    if (quand === 'le') {
      const d = lireDateSaisie(date1);
      if (!d) return 'Indiquez la date au format JJ/MM/AAAA.';
      return { recurrence, planif: 'le', periode_debut: d, periode_fin: d };
    }
    if (quand === 'entre') {
      const d1 = lireDateSaisie(date1);
      const d2 = lireDateSaisie(date2);
      if (!d1 || !d2) return 'Indiquez les deux dates au format JJ/MM/AAAA.';
      if (d2 < d1) return 'La fin de la période doit suivre son début.';
      if (annuelle && d2 >= plusUnAn(d1)) return 'Pour une tâche de chaque année, la période doit durer moins d’un an.';
      return { recurrence, planif: 'entre', periode_debut: d1, periode_fin: d2 };
    }
    const fin = lireDateSaisie(date2);
    if (!fin) return 'Indiquez la date limite au format JJ/MM/AAAA.';
    let debut: string | null = date1.trim() ? lireDateSaisie(date1) : null;
    if (date1.trim() && !debut) return '« À partir du » : date attendue au format JJ/MM/AAAA.';
    // Sans date de début : tout de suite (une fois), ou un mois avant (chaque année).
    if (!debut) debut = annuelle ? decaler(fin, -30) : aujourdHuiIso() < fin ? aujourdHuiIso() : fin;
    if (debut > fin) return '« À partir du » doit précéder la date limite.';
    if (annuelle && fin >= plusUnAn(debut)) return 'Pour une tâche de chaque année, moins d’un an entre le début et la date limite.';
    return { recurrence, planif: 'avant', periode_debut: debut, periode_fin: fin };
  };

  const ajouterDomaine = async (nom: string) => {
    if (!foyer || !nom.trim()) return;
    setEnCours('domaine');
    try {
      const d = await creerDomaine(foyer.id, nom);
      setDomaines((ds) => [...ds, d].sort((a, b) => a.nom.localeCompare(b.nom, 'fr')));
      setDomaineId(d.id);
      setNouveauDomaine(null);
    } catch (e) {
      alerte('Domaine', extraireMessageErreur(e, 'Veuillez réessayer.'));
    } finally {
      setEnCours(null);
    }
  };

  const enregistrer = async () => {
    if (!foyer) return;
    if (!libelle.trim()) return alerte('Tâche', 'Indiquez ce qu’il faut faire.');
    if (!Number.isInteger(nbPoints) || nbPoints < 0) return alerte('Points', 'Indiquez un nombre de points (0 ou plus).');
    if (quand === 'hebdomadaire' && jours.length === 0) return alerte('Jours', 'Choisissez au moins un jour.');
    const dates = calculerDates();
    if (typeof dates === 'string') return alerte('Dates', dates);
    setEnCours('enregistrer');
    try {
      const saisie = {
        libelle: libelle.trim(),
        points: nbPoints,
        ...dates,
        jours: quand === 'hebdomadaire' ? jours : [],
        personnes: choisies,
        domaine_id: domaineId,
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

  // Aperçu en clair : « Avant le 30 mai · chaque année ».
  const apercu = (() => {
    if (!datee) return '';
    const d = calculerDates();
    return typeof d === 'string' ? '' : libellePlanif({ planif: d.planif, recurrence: d.recurrence, debut: d.periode_debut, fin: d.periode_fin });
  })();

  const champDate = (valeur: string, changer: (v: string) => void, libelleChamp: string, aide?: string) => (
    <View style={{ flex: 1, gap: 4 }}>
      <Text style={styles.petitLibelle}>{libelleChamp}</Text>
      <TextInput
        style={styles.champ}
        value={valeur}
        onChangeText={changer}
        placeholder={aide ?? 'JJ/MM/AAAA'}
        placeholderTextColor={theme.colors.textMuted}
        keyboardType="numbers-and-punctuation"
        accessibilityLabel={libelleChamp}
      />
    </View>
  );

  const suggestionsRestantes = SUGGESTIONS_DOMAINES.filter(
    (s) => !domaines.some((d) => d.nom.trim().toLowerCase() === s.nom.toLowerCase())
  );

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.contenu} keyboardShouldPersistTaps="handled">
      {brouillon ? <BandeauBrouillon couleur={theme.colors.accent} /> : null}
      <Text style={styles.libelle}>Tâche</Text>
      <TextInput
        style={styles.champ}
        value={libelle}
        onChangeText={setLibelle}
        placeholder="ex. Mettre la table, Semer les radis, Vidange"
        placeholderTextColor={theme.colors.textMuted}
        accessibilityLabel="Tâche"
      />

      <View style={styles.ligneTitre}>
        <Text style={styles.libelle}>Domaine</Text>
        {domaines.length > 0 && (
          <Pressable onPress={() => navigation.navigate('Domaines')} hitSlop={8} accessibilityRole="button">
            <Text style={styles.lien}>Gérer</Text>
          </Pressable>
        )}
      </View>
      <View style={styles.puces}>
        <Pressable
          onPress={() => setDomaineId(null)}
          style={[styles.puce, !domaineId && styles.puceActive]}
          accessibilityRole="radio"
          accessibilityState={{ selected: !domaineId }}
        >
          <Text style={[styles.puceTexte, !domaineId && { color: theme.colors.background }]}>Aucun</Text>
        </Pressable>
        {domaines.map((d) => (
          <Pressable
            key={d.id}
            onPress={() => setDomaineId(d.id)}
            style={[styles.puce, domaineId === d.id && styles.puceActive]}
            accessibilityRole="radio"
            accessibilityState={{ selected: domaineId === d.id }}
          >
            {d.icone ? (
              <Ionicons name={d.icone as any} size={16} color={domaineId === d.id ? theme.colors.background : theme.colors.accent} />
            ) : null}
            <Text style={[styles.puceTexte, domaineId === d.id && { color: theme.colors.background }]}>{d.nom}</Text>
          </Pressable>
        ))}
        {nouveauDomaine === null && (
          <Pressable onPress={() => setNouveauDomaine('')} style={[styles.puce, styles.pucePointillee]} accessibilityRole="button">
            <Ionicons name="add" size={16} color={theme.colors.accent} />
            <Text style={styles.puceTexte}>Nouveau domaine</Text>
          </Pressable>
        )}
      </View>
      {nouveauDomaine !== null && (
        <View style={{ gap: theme.spacing.xs }}>
          <View style={styles.ligne}>
            <TextInput
              style={[styles.champ, { flex: 1 }]}
              value={nouveauDomaine}
              onChangeText={setNouveauDomaine}
              placeholder="ex. Potager"
              placeholderTextColor={theme.colors.textMuted}
              accessibilityLabel="Nouveau domaine"
              autoFocus
              onSubmitEditing={() => ajouterDomaine(nouveauDomaine)}
            />
            <Bouton titre="Ajouter" onPress={() => ajouterDomaine(nouveauDomaine)} enCours={enCours === 'domaine'} />
          </View>
          {suggestionsRestantes.length > 0 && (
            <View style={styles.puces}>
              {suggestionsRestantes.map((s) => (
                <Pressable
                  key={s.nom}
                  onPress={() => ajouterDomaine(s.nom)}
                  style={[styles.puce, styles.pucePointillee]}
                  accessibilityRole="button"
                  accessibilityLabel={`Ajouter le domaine ${s.nom}`}
                >
                  <Ionicons name={s.icone as any} size={16} color={theme.colors.accent} />
                  <Text style={styles.puceTexte}>{s.nom}</Text>
                </Pressable>
              ))}
            </View>
          )}
          <Pressable onPress={() => setNouveauDomaine(null)} hitSlop={8} accessibilityRole="button">
            <Text style={styles.lien}>Annuler</Text>
          </Pressable>
        </View>
      )}

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
        {QUAND.map((r) => (
          <Pressable
            key={r.id}
            onPress={() => {
              setQuand(r.id);
              if (DATEE(r.id) && !date1 && r.id !== 'avant') setDate1(versSaisie(aujourdHuiIso()));
            }}
            style={[styles.puce, quand === r.id && styles.puceActive]}
            accessibilityRole="radio"
            accessibilityState={{ selected: quand === r.id }}
          >
            <Ionicons name={r.icone} size={16} color={quand === r.id ? theme.colors.background : theme.colors.accent} />
            <Text style={[styles.puceTexte, quand === r.id && { color: theme.colors.background }]}>{r.libelle}</Text>
          </Pressable>
        ))}
      </View>

      {quand === 'hebdomadaire' && (
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

      {datee && (
        <View style={styles.cadre}>
          {quand === 'le' && <View style={styles.ligne}>{champDate(date1, setDate1, 'Le')}</View>}
          {quand === 'entre' && (
            <View style={styles.ligne}>
              {champDate(date1, setDate1, 'Du')}
              {champDate(date2, setDate2, 'Au')}
            </View>
          )}
          {quand === 'avant' && (
            <View style={styles.ligne}>
              {champDate(date2, setDate2, 'À faire avant le')}
              {champDate(date1, setDate1, 'À partir du', annuelle ? 'un mois avant' : 'tout de suite')}
            </View>
          )}
          <Pressable
            onPress={() => setAnnuelle(!annuelle)}
            style={styles.case}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: annuelle }}
          >
            <Ionicons name={annuelle ? 'checkbox' : 'square-outline'} size={24} color={theme.colors.accent} />
            <Text style={styles.caseTexte}>Chaque année, aux mêmes dates</Text>
          </Pressable>
          {apercu ? <Text style={styles.apercu}>{apercu}</Text> : null}
          {aVerifier.has('date_debut') || aVerifier.has('date_fin') || aVerifier.has('quand') ? (
            <PastilleAVerifier raison="date comprise par l’assistant" />
          ) : null}
          <Text style={styles.aide}>
            Elle apparaît dans les tâches du jour dès le début, puis « en retard » tant qu’elle n’est pas faite.
          </Text>
        </View>
      )}

      <Text style={styles.libelle}>Pour qui</Text>
      <Text style={styles.aide}>
        Plusieurs personnes : à tour de rôle (
        {quand === 'quotidienne' ? 'un jour chacun' : datee && annuelle ? 'une année chacun' : 'une semaine chacun'}). Personne : « qui veut ».
      </Text>
      {/* Mon foyer, puis les autres foyers de la famille : une tâche peut être
          confiée à quelqu'un d'un autre foyer (il la voit et la coche chez lui,
          sans points). */}
      {groupesPersonnes.map(([nomFoyer, ps]) => (
        <View key={nomFoyer ?? 'moi'} style={{ gap: theme.spacing.xs }}>
          {nomFoyer ? <Text style={styles.aide}>{nomFoyer}</Text> : null}
          <View style={styles.puces}>
            {ps.map((p) => {
              const rang = choisies.indexOf(p.id);
              return (
                <Pressable
                  key={p.id}
                  onPress={() => setChoisies(basculer(choisies, p.id))}
                  style={[styles.puce, rang >= 0 && styles.puceActive]}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: rang >= 0 }}
                  accessibilityLabel={nomFoyer ? `${p.prenom} (${nomFoyer})` : p.prenom}
                >
                  <Text style={[styles.puceTexte, rang >= 0 && { color: theme.colors.background }]}>
                    {choisies.length > 1 && rang >= 0 ? `${rang + 1}. ` : ''}
                    {p.prenom}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ))}
      {choisies.some((c) => personnes.find((p) => p.id === c)?.foyer_id !== foyer?.id) ? (
        <Text style={styles.aide}>
          Quelqu’un d’un autre foyer : il verra la tâche chez lui et pourra la cocher. Pas de points pour lui (chaque foyer
          gère ses tirelires).
        </Text>
      ) : null}
      {personnes.length === 0 && (
        <Text style={styles.aide}>Ajoutez vos enfants dans Moi (« Mon foyer ») pour leur confier des tâches.</Text>
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
  petitLibelle: { fontFamily: theme.fontBodyBold, fontSize: 13, color: theme.colors.textMuted },
  ligneTitre: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  ligne: { flexDirection: 'row', alignItems: 'flex-end', gap: theme.spacing.sm },
  lien: { fontFamily: theme.fontBody, fontSize: 14, color: theme.colors.accent, textDecorationLine: 'underline' },
  aide: { fontFamily: theme.fontBody, fontSize: 13, color: theme.colors.textMuted },
  apercu: { fontFamily: theme.fontBodyBold, fontSize: 15, color: theme.colors.accent },
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
  cadre: {
    gap: theme.spacing.sm,
    padding: theme.spacing.sm,
    marginTop: theme.spacing.xs,
    borderRadius: theme.radii.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  case: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs, minHeight: 44 },
  caseTexte: { fontFamily: theme.fontBody, fontSize: 15, color: theme.colors.text },
  puces: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.xs, marginTop: theme.spacing.xs },
  puce: {
    flexDirection: 'row',
    gap: 6,
    minHeight: 40,
    minWidth: 48,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: theme.colors.accent,
  },
  pucePointillee: { borderStyle: 'dashed' },
  puceActive: { backgroundColor: theme.colors.accent },
  puceTexte: { fontFamily: theme.fontBodyBold, fontSize: 14, color: theme.colors.accent },
  pause: { alignSelf: 'flex-start', marginTop: theme.spacing.md },
}));
