import React, { useCallback, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { theme, creerStylesThemes } from '../theme/theme';
import { useAuth } from '../contexts/AuthContext';
import { Carte, TitreSection } from '../components/elements';
import { Bouton, Chargement, MessageVide, Pastille } from '../components/ui';
import { CalendrierTaches } from '../components/CalendrierTaches';
import { alerte } from '../utils/alerte';
import { extraireMessageErreur } from '@apps-famille/famille';
import { listerPersonnes, type Personne } from '../services/personnes';
import { aujourdHuiIso, JOURS, libelleJour } from '../services/quotidien';
import {
  annulerRealisation,
  formaterPoints,
  libellePlanif,
  listerDomaines,
  listerTaches,
  marquerFaite,
  pointsParEuro,
  tachesDuJour,
  validerRealisation,
  type Domaine,
  type Tache,
  type TacheDuJour,
} from '../services/maison';

function decaler(iso: string, jours: number): string {
  const [a, m, j] = iso.split('-').map(Number);
  const d = new Date(a, m - 1, j + jours);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function libelleRecurrence(t: Pick<Tache, 'recurrence' | 'jours' | 'planif' | 'periode_debut' | 'periode_fin'>): string {
  if (t.planif !== 'libre') {
    return libellePlanif({ planif: t.planif, recurrence: t.recurrence, debut: t.periode_debut, fin: t.periode_fin });
  }
  if (t.recurrence === 'quotidienne') return 'Chaque jour';
  if (t.recurrence === 'hebdomadaire') {
    return [...t.jours].sort().map((j) => JOURS[j - 1].slice(0, 3)).join(', ');
  }
  return 'Une fois';
}

// Tâches de la maison, en deux vues :
//   - Jour : tâches du jour choisi (récurrentes, datées, en retard) ; un
//     parent coche « fait » (les points vont dans la tirelire), ou annule ;
//   - Calendrier : le mois des tâches datées, les retards, les prochaines.
// Filtre par domaine (Potager, Voiture…). En bas, toutes les tâches du foyer.
export default function TachesScreen({ navigation }: any) {
  const { foyer } = useAuth();
  const [jour, setJour] = useState(aujourdHuiIso());
  const [vue, setVue] = useState<'jour' | 'calendrier'>('jour');
  const [domaines, setDomaines] = useState<Domaine[]>([]);
  const [filtre, setFiltre] = useState<string | null>(null);
  const [taches, setTaches] = useState<TacheDuJour[] | null>(null);
  const [toutes, setToutes] = useState<Tache[]>([]);
  const [personnes, setPersonnes] = useState<Personne[]>([]);
  const [taux, setTaux] = useState(10);
  const [enCours, setEnCours] = useState<string | null>(null);

  const charger = useCallback(async () => {
    if (!foyer) return;
    try {
      const [td, tt, ps, tx, ds] = await Promise.all([
        tachesDuJour(jour),
        listerTaches(),
        listerPersonnes([foyer.id]),
        pointsParEuro(),
        listerDomaines(),
      ]);
      setTaches(td);
      setDomaines(ds);
      setFiltre((f) => (f && !ds.some((d) => d.id === f) ? null : f));
      setToutes(tt);
      setPersonnes(ps);
      setTaux(tx);
    } catch (e) {
      alerte('Chargement impossible', extraireMessageErreur(e, 'Veuillez réessayer.'));
      setTaches([]);
    }
  }, [foyer, jour]);

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

  if (!taches) return <Chargement />;

  const futur = jour > aujourdHuiIso();
  const enfants = personnes.filter((p) => !p.utilisateur_id);
  const prenom = (id: string) => personnes.find((p) => p.id === id)?.prenom ?? '…';
  const duFiltre = taches.filter((t) => !filtre || t.domaine_id === filtre);
  const aFaire = duFiltre.filter((t) => !t.realisation);
  const aValider = duFiltre.filter((t) => t.realisation?.etat === 'faite');
  const faites = duFiltre.filter((t) => t.realisation?.etat === 'validee');
  const toutesFiltrees = toutes.filter((t) => !filtre || t.domaine_id === filtre);
  const domaine = (id: string | null) => domaines.find((d) => d.id === id);

  const carte = (t: TacheDuJour) => {
    // « Qui veut » : les personnes prévues, sinon les enfants du foyer pour
    // une tâche à points, ou tout le foyer pour une tâche sans points.
    const candidats = t.candidats.length ? t.candidats : (t.points > 0 ? enfants : personnes).map((e) => e.id);
    const planif = libellePlanif({ planif: t.planif, recurrence: t.recurrence, debut: t.debut, fin: t.fin });
    return (
      <Carte key={t.id} accent={t.en_retard}>
        <View style={styles.ligne}>
          {t.domaine_icone ? <Ionicons name={t.domaine_icone as any} size={18} color={theme.colors.accent} /> : null}
          <Text style={[styles.libelle, t.realisation?.etat === 'validee' && styles.barre]}>{t.libelle}</Text>
          {t.en_retard && <Pastille texte="En retard" />}
          {t.points > 0 && <Text style={styles.points}>+{t.points}</Text>}
        </View>
        <Text style={styles.detail}>
          {t.pour ? `Pour ${t.pour_prenom ?? prenom(t.pour)}` : 'Qui veut'}
          {planif
            ? ` · ${planif}`
            : t.recurrence === 'quotidienne'
              ? ' · chaque jour'
              : t.recurrence === 'aucune'
                ? ' · une fois'
                : ''}
          {t.domaine ? ` · ${t.domaine}` : ''}
          {t.points > 0 ? ` · ${formaterPoints(t.points, taux)}` : ''}
        </Text>
        {t.realisation?.etat === 'faite' ? (
          <>
            <View style={styles.ligne}>
              <Ionicons name="hourglass-outline" size={18} color={theme.colors.accent} />
              <Text style={[styles.detail, { flex: 1 }]}>{t.realisation.prenom ?? '…'} dit l’avoir fait</Text>
            </View>
            <View style={styles.ligne}>
              <View style={{ flex: 1 }}>
                <Bouton
                  variante="contour"
                  titre="Pas fait"
                  onPress={() => agir(t.id, () => annulerRealisation(t.realisation!.id))}
                  desactive={enCours !== null}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Bouton
                  titre={t.points > 0 ? `Valider (+${t.points})` : 'Valider'}
                  onPress={() => agir(t.id, () => validerRealisation(t.realisation!.id))}
                  enCours={enCours === t.id}
                />
              </View>
            </View>
          </>
        ) : t.realisation ? (
          <View style={styles.ligne}>
            <Ionicons name="checkmark-circle" size={20} color={theme.colors.success} />
            <Text style={[styles.detail, { flex: 1 }]}>Fait par {t.realisation.prenom ?? '…'}</Text>
            <Pressable
              onPress={() => agir(t.id, () => annulerRealisation(t.realisation!.id))}
              hitSlop={8}
              accessibilityRole="button"
            >
              <Text style={styles.lienDiscret}>Annuler</Text>
            </Pressable>
          </View>
        ) : futur ? (
          <Text style={styles.detail}>À venir</Text>
        ) : t.pour ? (
          <Bouton titre="C’est fait" onPress={() => agir(t.id, () => marquerFaite(t.id, jour, t.pour!))} enCours={enCours === t.id} />
        ) : (
          <View style={styles.puces}>
            {candidats.map((id) => (
              <Pressable
                key={id}
                style={styles.puce}
                onPress={() => agir(t.id, () => marquerFaite(t.id, jour, id))}
                disabled={enCours !== null}
                accessibilityRole="button"
                accessibilityLabel={`${prenom(id)} l'a fait`}
              >
                <Text style={styles.puceTexte}>{prenom(id)} l’a fait</Text>
              </Pressable>
            ))}
          </View>
        )}
      </Carte>
    );
  };

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.contenu}>
      <View style={styles.onglets} accessibilityRole="tablist">
        {(['jour', 'calendrier'] as const).map((v) => (
          <Pressable
            key={v}
            onPress={() => setVue(v)}
            style={[styles.onglet, vue === v && styles.ongletActif]}
            accessibilityRole="tab"
            accessibilityState={{ selected: vue === v }}
          >
            <Ionicons
              name={v === 'jour' ? 'today-outline' : 'calendar-outline'}
              size={18}
              color={vue === v ? theme.colors.background : theme.colors.accent}
            />
            <Text style={[styles.ongletTexte, vue === v && { color: theme.colors.background }]}>
              {v === 'jour' ? 'Jour' : 'Calendrier'}
            </Text>
          </Pressable>
        ))}
      </View>

      {domaines.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filtres}>
          <Pressable
            onPress={() => setFiltre(null)}
            style={[styles.filtre, !filtre && styles.filtreActif]}
            accessibilityRole="radio"
            accessibilityState={{ selected: !filtre }}
          >
            <Text style={[styles.filtreTexte, !filtre && { color: theme.colors.background }]}>Tous les domaines</Text>
          </Pressable>
          {domaines.map((d) => (
            <Pressable
              key={d.id}
              onPress={() => setFiltre(filtre === d.id ? null : d.id)}
              style={[styles.filtre, filtre === d.id && styles.filtreActif]}
              accessibilityRole="radio"
              accessibilityState={{ selected: filtre === d.id }}
            >
              {d.icone ? (
                <Ionicons name={d.icone as any} size={15} color={filtre === d.id ? theme.colors.background : theme.colors.accent} />
              ) : null}
              <Text style={[styles.filtreTexte, filtre === d.id && { color: theme.colors.background }]}>{d.nom}</Text>
            </Pressable>
          ))}
        </ScrollView>
      )}

      {vue === 'calendrier' ? (
        <CalendrierTaches
          domaineId={filtre}
          prenom={prenom}
          onVoirJour={(j) => {
            setJour(j);
            setVue('jour');
          }}
          onModifier={(id) => navigation.navigate('TacheForm', { id })}
        />
      ) : (
      <>
      <View style={styles.navigation}>
        <Pressable onPress={() => setJour(decaler(jour, -1))} hitSlop={8} accessibilityRole="button" accessibilityLabel="Jour précédent">
          <Ionicons name="chevron-back" size={26} color={theme.colors.accent} />
        </Pressable>
        <Pressable onPress={() => setJour(aujourdHuiIso())} accessibilityRole="button">
          <Text style={styles.jour}>{libelleJour(jour)}</Text>
        </Pressable>
        <Pressable onPress={() => setJour(decaler(jour, 1))} hitSlop={8} accessibilityRole="button" accessibilityLabel="Jour suivant">
          <Ionicons name="chevron-forward" size={26} color={theme.colors.accent} />
        </Pressable>
      </View>

      {toutes.length === 0 ? (
        <MessageVide
          titre="Pas encore de tâche"
          texte="Ajoutez les tâches de la maison : mettre la table, ranger sa chambre… avec des points pour l’argent de poche."
        />
      ) : duFiltre.length === 0 ? (
        <MessageVide titre="Rien de prévu ce jour-là" />
      ) : (
        <>
          {aValider.length > 0 && <TitreSection titre="À valider" detail={`${aValider.length}`} />}
          {aValider.map(carte)}
          {aFaire.length > 0 && <TitreSection titre="À faire" detail={`${aFaire.length}`} />}
          {aFaire.map(carte)}
          {faites.length > 0 && <TitreSection titre="Faites" detail={`${faites.length}`} />}
          {faites.map(carte)}
        </>
      )}

      </>
      )}

      <TitreSection titre={filtre ? `Tâches · ${domaine(filtre)?.nom ?? ''}` : 'Toutes les tâches'} detail={`${toutesFiltrees.length}`} />
      {toutesFiltrees.map((t) => (
        <Pressable
          key={t.id}
          style={styles.tache}
          onPress={() => navigation.navigate('TacheForm', { id: t.id })}
          accessibilityRole="button"
          accessibilityLabel={`Modifier ${t.libelle}`}
        >
          <View style={{ flex: 1 }}>
            <Text style={[styles.libelle, !t.active && { color: theme.colors.textMuted }]}>
              {t.libelle}
              {!t.active ? ' (en pause)' : ''}
            </Text>
            <Text style={styles.detail}>
              {!filtre && domaine(t.domaine_id) ? `${domaine(t.domaine_id)!.nom} · ` : ''}
              {libelleRecurrence(t)} · {t.personnes.length ? t.personnes.map(prenom).join(t.personnes.length > 1 ? ' puis ' : '') : 'Qui veut'}
            </Text>
          </View>
          <Text style={styles.points}>{t.points > 0 ? `+${t.points}` : ''}</Text>
          <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />
        </Pressable>
      ))}
      <Bouton
        variante="pointille"
        titre="Nouvelle tâche"
        onPress={() => navigation.navigate('TacheForm', vue === 'calendrier' ? { domaineId: filtre, quand: 'le' } : { domaineId: filtre })}
      />
    </ScrollView>
  );
}

const styles = creerStylesThemes(() => ({
  flex: { flex: 1, backgroundColor: theme.colors.background },
  contenu: { padding: theme.spacing.md, gap: theme.spacing.sm, paddingBottom: theme.spacing.xl },
  navigation: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44 },
  onglets: {
    flexDirection: 'row',
    borderWidth: 1.5,
    borderColor: theme.colors.accent,
    borderRadius: 999,
    overflow: 'hidden',
  },
  onglet: { flex: 1, flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center', minHeight: 42 },
  ongletActif: { backgroundColor: theme.colors.accent },
  ongletTexte: { fontFamily: theme.fontBodyBold, fontSize: 15, color: theme.colors.accent },
  filtres: { gap: theme.spacing.xs, paddingVertical: 2 },
  filtre: {
    flexDirection: 'row',
    gap: 5,
    alignItems: 'center',
    minHeight: 36,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.colors.accent,
  },
  filtreActif: { backgroundColor: theme.colors.accent },
  filtreTexte: { fontFamily: theme.fontBodyBold, fontSize: 13, color: theme.colors.accent },
  jour: { fontFamily: theme.fontTitle, fontSize: 20, color: theme.colors.text },
  ligne: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
  libelle: { flex: 1, fontFamily: theme.fontBodyBold, fontSize: 16, color: theme.colors.text },
  barre: { textDecorationLine: 'line-through', color: theme.colors.textMuted },
  detail: { fontFamily: theme.fontBody, fontSize: 13, color: theme.colors.textMuted },
  points: { fontFamily: theme.fontBodyBold, fontSize: 15, color: theme.colors.accent },
  lienDiscret: { fontFamily: theme.fontBody, fontSize: 14, color: theme.colors.textMuted, textDecorationLine: 'underline' },
  puces: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.xs },
  puce: {
    minHeight: 40,
    justifyContent: 'center',
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: theme.colors.accent,
  },
  puceTexte: { fontFamily: theme.fontBodyBold, fontSize: 14, color: theme.colors.background },
  tache: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radii.lg,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
}));
