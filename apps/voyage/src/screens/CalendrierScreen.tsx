import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { theme, creerStylesThemes } from '../theme/theme';
import { useAuth } from '../contexts/AuthContext';
import { formaterDate, formaterPlage, MOIS } from '../services/personnes';
import { etatDuJour, lireCalendrier, versIso, type EtatDispo, type PeriodeDispo } from '../services/calendrier';
import { messageErreurVoyage } from '../services/voyage';
import { Bouton } from '../components/ui';

const JOURS_COURTS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
const MAX_POINTS = 4;

// Cases d'un mois, semaines commençant le lundi (null = case vide).
function casesDuMois(annee: number, mois: number): (number | null)[] {
  const premier = new Date(annee, mois, 1).getDay(); // 0 = dimanche
  const decalage = (premier + 6) % 7;
  const nbJours = new Date(annee, mois + 1, 0).getDate();
  const cases: (number | null)[] = Array(decalage).fill(null);
  for (let j = 1; j <= nbJours; j++) cases.push(j);
  while (cases.length % 7 !== 0) cases.push(null);
  return cases;
}

const LIBELLE_ETAT: Record<EtatDispo, string> = {
  disponible: 'Disponible',
  peut_etre: 'Peut-être',
  indisponible: 'Indisponible',
};

// Point de couleur d'un état (le peut-être est un rond vide, pour ne pas
// reposer sur la couleur seule).
function Point({ etat, taille = 8 }: { etat: EtatDispo; taille?: number }) {
  const couleur =
    etat === 'disponible' ? theme.colors.success : etat === 'indisponible' ? theme.colors.warning : theme.colors.textMuted;
  return (
    <View
      style={{
        width: taille,
        height: taille,
        borderRadius: taille / 2,
        backgroundColor: etat === 'peut_etre' ? 'transparent' : couleur,
        borderWidth: etat === 'peut_etre' ? 1.5 : 0,
        borderColor: couleur,
      }}
    />
  );
}

// Onglet "Calendrier" : disponibilités de la famille active. Chacun renseigne
// s'il le souhaite ses périodes (et celles de ses enfants sans compte) ; le
// motif d'une période privée n'est montré qu'à son auteur.
export default function CalendrierScreen({ navigation }: any) {
  const { famille } = useAuth();
  const aujourdHui = new Date();
  const [curseur, setCurseur] = useState({ annee: aujourdHui.getFullYear(), mois: aujourdHui.getMonth() });
  const [periodes, setPeriodes] = useState<PeriodeDispo[]>([]);
  const [jour, setJour] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  const debutMois = versIso(new Date(curseur.annee, curseur.mois, 1));
  const finMois = versIso(new Date(curseur.annee, curseur.mois + 1, 0));

  const charger = useCallback(async () => {
    if (!famille) return;
    try {
      setErreur(null);
      setPeriodes(await lireCalendrier(debutMois, finMois, famille.id));
    } catch (e) {
      setErreur(messageErreurVoyage(e));
    }
  }, [famille, debutMois, finMois]);

  useFocusEffect(
    useCallback(() => {
      charger();
    }, [charger])
  );

  const cases = useMemo(() => casesDuMois(curseur.annee, curseur.mois), [curseur]);
  const estMoisCourant = curseur.annee === aujourdHui.getFullYear() && curseur.mois === aujourdHui.getMonth();

  // Personnes présentes ce mois-ci, dans l'ordre alphabétique.
  const personnesDuMois = useMemo(() => {
    const vues = new Map<string, string>();
    for (const p of periodes) vues.set(p.personne_id, p.prenom);
    return [...vues.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [periodes]);

  const decaler = (n: number) => {
    setJour(null);
    setCurseur(({ annee, mois }) => {
      const d = new Date(annee, mois + n, 1);
      return { annee: d.getFullYear(), mois: d.getMonth() };
    });
  };

  const isoDuJour = (j: number) => versIso(new Date(curseur.annee, curseur.mois, j));

  // Liste sous la grille : les périodes du jour choisi, sinon celles du mois.
  const liste = jour ? periodes.filter((p) => p.date_debut <= jour && p.date_fin >= jour) : periodes;

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.contenu}>
      <View style={styles.barreMois}>
        <Pressable onPress={() => decaler(-1)} accessibilityRole="button" accessibilityLabel="Mois précédent" hitSlop={8}>
          <Ionicons name="chevron-back" size={24} color={theme.colors.accent} />
        </Pressable>
        <Text style={styles.mois}>
          {MOIS[curseur.mois].charAt(0).toUpperCase() + MOIS[curseur.mois].slice(1)} {curseur.annee}
        </Text>
        <Pressable onPress={() => decaler(1)} accessibilityRole="button" accessibilityLabel="Mois suivant" hitSlop={8}>
          <Ionicons name="chevron-forward" size={24} color={theme.colors.accent} />
        </Pressable>
      </View>

      <View style={styles.grille}>
        {JOURS_COURTS.map((j, i) => (
          <Text key={`t${i}`} style={styles.teteJour}>
            {j}
          </Text>
        ))}
        {cases.map((numero, i) => {
          if (numero === null) return <View key={i} style={styles.case} />;
          const iso = isoDuJour(numero);
          const auj = estMoisCourant && numero === aujourdHui.getDate();
          const choisi = jour === iso;
          const etats = personnesDuMois
            .map(([id]) => etatDuJour(periodes, id, iso))
            .filter((e): e is EtatDispo => e !== null);
          return (
            <Pressable
              key={i}
              style={styles.case}
              onPress={() => setJour(choisi ? null : iso)}
              accessibilityRole="button"
              accessibilityLabel={`${formaterDate(iso)} : ${etats.length} personne${etats.length > 1 ? 's' : ''} renseignée${etats.length > 1 ? 's' : ''}`}
            >
              <View style={[styles.rond, auj && styles.rondAujourdhui, choisi && styles.rondChoisi]}>
                <Text style={[styles.numero, auj && styles.numeroAujourdhui]}>{numero}</Text>
              </View>
              <View style={styles.points}>
                {etats.slice(0, MAX_POINTS).map((e, k) => (
                  <Point key={k} etat={e} taille={6} />
                ))}
              </View>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.legende}>
        {(['disponible', 'peut_etre', 'indisponible'] as EtatDispo[]).map((e) => (
          <View key={e} style={styles.legendeItem}>
            <Point etat={e} />
            <Text style={styles.legendeTexte}>{LIBELLE_ETAT[e]}</Text>
          </View>
        ))}
      </View>

      <Bouton
        titre="+ Ajouter une période"
        onPress={() => navigation.navigate('Disponibilite', { date: jour ?? undefined })}
      />
      {erreur && <Text style={styles.erreur}>{erreur}</Text>}

      <Text style={styles.section}>{jour ? formaterDate(jour) : 'Ce mois-ci'}</Text>
      {liste.length === 0 && (
        <Text style={styles.vide}>
          {jour
            ? 'Personne n’a rien indiqué ce jour-là.'
            : 'Rien d’indiqué ce mois-ci. Chacun peut, s’il le souhaite, dire quand il est libre ou pris.'}
        </Text>
      )}
      {liste.map((p) => (
        <Pressable
          key={p.id}
          style={styles.ligne}
          disabled={!p.modifiable}
          onPress={() => navigation.navigate('Disponibilite', { periode: p })}
          accessibilityRole={p.modifiable ? 'button' : undefined}
        >
          <Point etat={p.etat} taille={10} />
          <View style={styles.ligneTexte}>
            <Text style={styles.ligneNom}>
              {p.prenom} · {LIBELLE_ETAT[p.etat].toLowerCase()}
            </Text>
            <Text style={styles.ligneDetail}>
              {p.date_debut === p.date_fin ? `le ${formaterDate(p.date_debut)}` : formaterPlage(p.date_debut, p.date_fin)}
              {p.motif ? ` · ${p.motif}` : p.prive && !p.modifiable ? ' · motif privé' : ''}
            </Text>
          </View>
          {p.prive && <Ionicons name="lock-closed-outline" size={16} color={theme.colors.textMuted} />}
          {p.modifiable && <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />}
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = creerStylesThemes(() => ({
  flex: { flex: 1, backgroundColor: theme.colors.background },
  contenu: { padding: theme.spacing.md, gap: theme.spacing.sm, paddingBottom: theme.spacing.xl },
  barreMois: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  mois: { fontFamily: theme.fontTitle, fontSize: 20, color: theme.colors.text },
  grille: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radii.lg,
    paddingVertical: theme.spacing.sm,
  },
  teteJour: {
    width: `${100 / 7}%`,
    textAlign: 'center',
    fontFamily: theme.fontBodyBold,
    fontSize: 12,
    color: theme.colors.textMuted,
    paddingBottom: theme.spacing.xs,
  },
  case: { width: `${100 / 7}%`, height: 52, alignItems: 'center', justifyContent: 'flex-start', paddingTop: 4 },
  rond: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  rondAujourdhui: { backgroundColor: theme.colors.accent },
  rondChoisi: { borderWidth: 2, borderColor: theme.colors.accent },
  numero: { fontFamily: theme.fontBody, fontSize: 15, color: theme.colors.text },
  numeroAujourdhui: { fontFamily: theme.fontBodyBold, color: theme.colors.background },
  points: { flexDirection: 'row', gap: 2, height: 8, marginTop: 2 },
  legende: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.md, justifyContent: 'center' },
  legendeItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendeTexte: { fontFamily: theme.fontBody, fontSize: 13, color: theme.colors.textMuted },
  section: { fontFamily: theme.fontTitle, fontSize: 18, color: theme.colors.text, marginTop: theme.spacing.sm },
  vide: { fontFamily: theme.fontBody, fontSize: 14, color: theme.colors.textMuted },
  ligne: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    padding: theme.spacing.sm,
    minHeight: 48,
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radii.md,
  },
  ligneTexte: { flex: 1 },
  ligneNom: { fontFamily: theme.fontBodyBold, fontSize: 15, color: theme.colors.text },
  ligneDetail: { fontFamily: theme.fontBody, fontSize: 14, color: theme.colors.textMuted },
  erreur: { fontFamily: theme.fontBody, fontSize: 14, color: theme.colors.warning },
}));
