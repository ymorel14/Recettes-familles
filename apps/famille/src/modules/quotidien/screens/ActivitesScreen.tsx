import React, { useCallback, useState } from 'react';
import { Modal, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { theme, creerStylesThemes } from '../theme/theme';
import { useAuth } from '../contexts/AuthContext';
import { Carte, TitreSection } from '../components/elements';
import { Bouton, Chargement, MessageVide, Pastille } from '../components/ui';
import { alerte } from '../utils/alerte';
import { extraireMessageErreur } from '@apps-famille/famille';
import { listerPersonnes, type Personne } from '../services/personnes';
import { lundiDe } from '../services/maison';
import { ajouterJoursIso, aujourdhuiIso, jourLong, JOURS_LONGS } from '../utils/semaine';
import {
  activitesSemaine,
  definirResponsable,
  enfantsDesActivites,
  heureCourte,
  listerActivites,
  listerGroupes,
  listerParticipants,
  type Activite,
  type Groupe,
  type Participant,
  type SeanceSemaine,
  type TrajetSemaine,
} from '../services/quotidien';

// Activités des enfants du foyer (refonte Quotidien § 5) : la semaine, jour
// par jour, avec pour chaque séance QUI emmène (aller) et QUI ramène
// (retour). Toucher la puce d'un trajet ouvre le choix du responsable : un
// adulte du foyer, une famille du groupe (covoiturage), ou personne.
// Le covoiturage avec d'autres familles reste accessible par « Mes groupes ».

function libelleSemaine(lundi: string): string {
  const aujourdhui = lundiDe(aujourdhuiIso());
  if (lundi === aujourdhui) return 'Cette semaine';
  if (lundi === ajouterJoursIso(aujourdhui, 7)) return 'Semaine prochaine';
  return `Semaine du ${courte(lundi)}`;
}

function courte(iso: string): string {
  const [a, m, j] = iso.split('-').map(Number);
  return new Date(a, m - 1, j).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }).replace(/^1 /, '1er ');
}

function titreJour(iso: string): string {
  if (iso === aujourdhuiIso()) return 'Aujourd’hui';
  if (iso === ajouterJoursIso(aujourdhuiIso(), 1)) return 'Demain';
  const t = jourLong(iso);
  return t.charAt(0).toUpperCase() + t.slice(1);
}

export default function ActivitesScreen({ navigation }: any) {
  const { session, foyer } = useAuth();
  const [lundi, setLundi] = useState(lundiDe(aujourdhuiIso()));
  const [seances, setSeances] = useState<SeanceSemaine[] | null>(null);
  const [adultes, setAdultes] = useState<Personne[]>([]);
  const [groupes, setGroupes] = useState<Groupe[]>([]);
  const [familles, setFamilles] = useState<Participant[]>([]);
  const [activites, setActivites] = useState<Activite[]>([]);
  const [enfantsActivites, setEnfantsActivites] = useState<Record<string, string[]>>({});
  const [personnes, setPersonnes] = useState<Personne[]>([]);
  const [choix, setChoix] = useState<{ seance: SeanceSemaine; trajet: TrajetSemaine } | null>(null);
  const [enCours, setEnCours] = useState<string | null>(null);

  const charger = useCallback(async () => {
    if (!foyer) return;
    try {
      const [s, ps, gs] = await Promise.all([activitesSemaine(lundi), listerPersonnes([foyer.id]), listerGroupes()]);
      setSeances(s);
      setPersonnes(ps);
      setAdultes(ps.filter((p) => p.utilisateur_id));
      setGroupes(gs);
      const [as, fs] = await Promise.all([listerActivites(gs.map((g) => g.id)), listerParticipants(gs.map((g) => g.id))]);
      setActivites(as);
      setFamilles(fs.filter((f) => !f.parti_le));
      setEnfantsActivites(await enfantsDesActivites(as.map((a) => a.id)).catch(() => ({})));
    } catch (e) {
      alerte('Chargement impossible', extraireMessageErreur(e, 'Veuillez réessayer.'));
      setSeances([]);
    }
  }, [foyer, lundi]);

  useFocusEffect(
    useCallback(() => {
      charger();
    }, [charger])
  );

  const agir = async (cle: string, action: () => Promise<void>) => {
    setEnCours(cle);
    try {
      await action();
      setChoix(null);
      await charger();
    } catch (e) {
      alerte('Action impossible', extraireMessageErreur(e, 'Veuillez réessayer.'));
    } finally {
      setEnCours(null);
    }
  };

  if (!seances) return <Chargement />;

  const moiPersonne = adultes.find((p) => p.utilisateur_id === session?.user?.id) ?? adultes[0] ?? null;
  const aujourdhui = aujourdhuiIso();
  const partages = groupes.filter((g) => !g.foyer_prive);
  const prenomPersonne = (id: string | null | undefined) => personnes.find((p) => p.id === id)?.prenom ?? null;

  const sansPersonne = seances.filter(
    (s) => s.statut === 'prevue' && s.date >= aujourdhui && s.trajets.some((t) => t.vide)
  );
  const nbSansPersonne = sansPersonne.reduce((n, s) => n + s.trajets.filter((t) => t.vide).length, 0);
  const jours = Array.from(new Set(seances.map((s) => s.date))).sort();

  // Texte de la puce d'un trajet.
  const texteResponsable = (t: TrajetSemaine): { texte: string; ton: 'accent' | 'alerte' | 'neutre' } => {
    if (t.responsable) return { texte: t.moi ? 'Moi' : t.responsable, ton: 'accent' };
    if (t.conducteur) return { texte: t.propose ? `${t.conducteur} (à confirmer)` : t.conducteur, ton: 'neutre' };
    if (t.foyer) return { texte: 'Notre foyer', ton: 'accent' };
    return { texte: 'Personne', ton: 'alerte' };
  };

  const ligneTrajet = (s: SeanceSemaine, t: TrajetSemaine) => {
    const r = texteResponsable(t);
    return (
      <View key={t.id} style={styles.ligneTrajet}>
        <Text style={styles.sens}>{t.sens === 'aller' ? 'Aller' : 'Retour'}</Text>
        <Text style={styles.heure}>{heureCourte(t.heure).replace(':', ' h ')}</Text>
        <Pressable
          onPress={() => setChoix({ seance: s, trajet: t })}
          style={({ pressed }) => [styles.puceResp, r.ton === 'alerte' && styles.puceAlerte, pressed && { opacity: 0.7 }]}
          accessibilityRole="button"
          accessibilityLabel={`${t.sens === 'aller' ? 'Aller' : 'Retour'} de ${s.activite} : ${r.texte}. Toucher pour changer.`}
        >
          <Text style={[styles.puceRespTexte, r.ton === 'alerte' && { color: theme.colors.warning }]} numberOfLines={1}>
            {r.texte}
          </Text>
          <Ionicons name="chevron-down" size={14} color={r.ton === 'alerte' ? theme.colors.warning : theme.colors.accent} />
        </Pressable>
      </View>
    );
  };

  const carteSeance = (s: SeanceSemaine) => {
    const libres = s.trajets.filter((t) => t.vide);
    const annulee = s.statut === 'annulee';
    return (
      <Carte key={s.seance_id} accent={libres.length > 0 && !annulee && s.date >= aujourdhui}>
        <View style={styles.ligne}>
          <Text style={[styles.nom, annulee && styles.barre]} numberOfLines={2}>
            {s.activite}
          </Text>
          {annulee ? <Pastille texte="Annulée" ton="neutre" /> : null}
          {s.enfants.map((e) => (
            <Pastille key={e} texte={e} ton="neutre" />
          ))}
        </View>
        <Text style={styles.detail}>
          {heureCourte(s.heure_debut).replace(':', ' h ')} – {heureCourte(s.heure_fin).replace(':', ' h ')}
          {s.lieu ? ` · ${s.lieu}` : ''}
        </Text>
        {!annulee && s.trajets.map((t) => ligneTrajet(s, t))}
        {!annulee && libres.length > 0 && s.date >= aujourdhui && moiPersonne ? (
          <Bouton
            titre={libres.length > 1 ? 'Je m’en occupe (aller et retour)' : 'Je m’en occupe'}
            onPress={() =>
              agir(s.seance_id, async () => {
                for (const t of libres) await definirResponsable(t.id, { personneId: moiPersonne.id });
              })
            }
            enCours={enCours === s.seance_id}
          />
        ) : null}
      </Carte>
    );
  };

  const nomGroupe = (id: string) => groupes.find((g) => g.id === id);

  return (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={styles.contenu}
      refreshControl={<RefreshControl refreshing={false} onRefresh={charger} />}
    >
      <View style={styles.navigation}>
        <Pressable
          onPress={() => setLundi(ajouterJoursIso(lundi, -7))}
          hitSlop={8}
          style={styles.fleche}
          accessibilityRole="button"
          accessibilityLabel="Semaine précédente"
        >
          <Ionicons name="chevron-back" size={26} color={theme.colors.accent} />
        </Pressable>
        <Pressable onPress={() => setLundi(lundiDe(aujourdhui))} accessibilityRole="button" style={{ alignItems: 'center' }}>
          <Text style={styles.semaine}>{libelleSemaine(lundi)}</Text>
          <Text style={styles.detail}>
            {courte(lundi)} – {courte(ajouterJoursIso(lundi, 6))}
          </Text>
        </Pressable>
        <Pressable
          onPress={() => setLundi(ajouterJoursIso(lundi, 7))}
          hitSlop={8}
          style={styles.fleche}
          accessibilityRole="button"
          accessibilityLabel="Semaine suivante"
        >
          <Ionicons name="chevron-forward" size={26} color={theme.colors.accent} />
        </Pressable>
      </View>

      {nbSansPersonne > 0 && (
        <View style={styles.bandeau} accessibilityRole="alert">
          <Ionicons name="alert-circle-outline" size={20} color={theme.colors.warning} />
          <Text style={styles.bandeauTexte}>
            {nbSansPersonne} trajet{nbSansPersonne > 1 ? 's' : ''} sans personne cette semaine
          </Text>
        </View>
      )}

      {jours.length === 0 ? (
        <MessageVide
          titre="Aucune activité cette semaine"
          texte="Ajoutez une activité avec le bouton + : ses séances se créent toutes seules, avec qui emmène et qui ramène."
        />
      ) : (
        jours.map((j) => (
          <View key={j} style={styles.jour}>
            <TitreSection titre={titreJour(j)} detail={courte(j)} />
            {seances.filter((s) => s.date === j).map(carteSeance)}
          </View>
        ))
      )}

      <TitreSection titre="Activités de l’année" detail={`${activites.length}`} />
      {activites.length === 0 ? (
        <Text style={styles.detail}>Aucune activité pour le moment.</Text>
      ) : (
        activites.map((a) => {
          const enfants = enfantsActivites[a.id]?.join(', ');
          const aller = prenomPersonne(a.aller_par);
          const retour = prenomPersonne(a.retour_par);
          const g = nomGroupe(a.groupe_id);
          return (
            <Pressable
              key={a.id}
              style={styles.activite}
              onPress={() => navigation.navigate('ActiviteForm', { id: a.id })}
              accessibilityRole="button"
              accessibilityLabel={`Modifier ${a.nom}`}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.nom}>
                  {a.nom}
                  {enfants ? ` · ${enfants}` : ''}
                </Text>
                <Text style={styles.detail}>
                  {JOURS_LONGS[a.jour_semaine - 1].replace(/^./, (c) => c.toUpperCase())} {heureCourte(a.heure_debut).replace(':', ' h ')}
                  {aller || retour ? ` · aller ${aller ?? 'personne'}, retour ${retour ?? 'personne'}` : ''}
                  {g && !g.foyer_prive ? ` · ${g.nom}` : ''}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />
            </Pressable>
          );
        })
      )}
      <Text style={styles.aide}>
        Partager un trajet avec une autre famille : choisissez-la comme responsable. Pour cela, l’activité doit être
        partagée avec un groupe.
      </Text>

      <TitreSection titre="Mes groupes de covoiturage" />
      <View style={styles.groupes}>
        {partages.map((g) => (
          <Pressable
            key={g.id}
            style={styles.groupe}
            onPress={() => navigation.navigate('Groupe', { id: g.id })}
            accessibilityRole="button"
          >
            <Ionicons name="people-outline" size={18} color={theme.colors.accent} />
            <Text style={styles.groupeNom} numberOfLines={1}>
              {g.nom}
            </Text>
          </Pressable>
        ))}
        <Pressable
          style={[styles.groupe, styles.groupeAjout]}
          onPress={() => navigation.navigate('GroupeForm')}
          accessibilityRole="button"
        >
          <Ionicons name="add" size={18} color={theme.colors.accent} />
          <Text style={styles.groupeNom}>Créer ou rejoindre</Text>
        </Pressable>
      </View>

      <Modal visible={!!choix} transparent animationType="fade" onRequestClose={() => setChoix(null)}>
        <Pressable style={styles.voile} onPress={() => setChoix(null)} accessibilityLabel="Fermer" />
        {choix ? (
          <View style={styles.feuille} accessibilityViewIsModal>
            <Text style={styles.feuilleTitre}>
              {choix.trajet.sens === 'aller' ? 'Qui emmène ?' : 'Qui ramène ?'}
            </Text>
            <Text style={styles.detail}>
              {choix.seance.activite} · {titreJour(choix.seance.date).toLowerCase()}
            </Text>
            {adultes.map((p) => (
              <Pressable
                key={p.id}
                style={styles.option}
                onPress={() => agir(choix.trajet.id, () => definirResponsable(choix.trajet.id, { personneId: p.id }))}
                accessibilityRole="button"
              >
                <Ionicons name="person-outline" size={20} color={theme.colors.accent} />
                <Text style={styles.optionTexte}>{p.utilisateur_id === session?.user?.id ? 'Moi' : p.prenom}</Text>
                {choix.trajet.responsable_id === p.id ? (
                  <Ionicons name="checkmark" size={20} color={theme.colors.success} />
                ) : null}
              </Pressable>
            ))}
            {choix.seance.partage
              ? familles
                  .filter((f) => f.groupe_id === choix.seance.groupe_id && f.foyer_id !== foyer?.id)
                  .map((f) => (
                    <Pressable
                      key={f.id}
                      style={styles.option}
                      onPress={() =>
                        agir(choix.trajet.id, () => definirResponsable(choix.trajet.id, { participantId: f.id }))
                      }
                      accessibilityRole="button"
                    >
                      <Ionicons name="people-outline" size={20} color={theme.colors.accent} />
                      <Text style={styles.optionTexte}>{f.nom_affiche}</Text>
                      {choix.trajet.conducteur_id === f.id ? (
                        <Ionicons name="checkmark" size={20} color={theme.colors.success} />
                      ) : null}
                    </Pressable>
                  ))
              : null}
            <Pressable
              style={styles.option}
              onPress={() => agir(choix.trajet.id, () => definirResponsable(choix.trajet.id, {}))}
              accessibilityRole="button"
            >
              <Ionicons name="remove-circle-outline" size={20} color={theme.colors.warning} />
              <Text style={[styles.optionTexte, { color: theme.colors.warning }]}>Personne</Text>
              {choix.trajet.vide ? <Ionicons name="checkmark" size={20} color={theme.colors.success} /> : null}
            </Pressable>
            <Bouton variante="discret" titre="Fermer" onPress={() => setChoix(null)} />
          </View>
        ) : null}
      </Modal>
    </ScrollView>
  );
}

const styles = creerStylesThemes(() => ({
  flex: { flex: 1, backgroundColor: theme.colors.background },
  contenu: { padding: theme.spacing.md, gap: theme.spacing.sm, paddingBottom: theme.spacing.xl },
  navigation: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 52 },
  fleche: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  semaine: { fontFamily: theme.fontTitle, fontSize: 20, color: theme.colors.text },
  bandeau: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    padding: theme.spacing.sm,
    borderRadius: theme.radii.md,
    borderWidth: 1.5,
    borderColor: theme.colors.warning,
    backgroundColor: theme.colors.surface,
  },
  bandeauTexte: { flex: 1, fontFamily: theme.fontBodyBold, fontSize: 15, color: theme.colors.text },
  jour: { gap: theme.spacing.sm },
  ligne: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: theme.spacing.xs },
  nom: { flexShrink: 1, fontFamily: theme.fontBodyBold, fontSize: 16, color: theme.colors.text },
  barre: { textDecorationLine: 'line-through', color: theme.colors.textMuted },
  detail: { fontFamily: theme.fontBody, fontSize: 13, color: theme.colors.textMuted },
  aide: { fontFamily: theme.fontBody, fontSize: 13, color: theme.colors.textMuted },
  ligneTrajet: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, minHeight: 44 },
  sens: { width: 56, fontFamily: theme.fontBodyBold, fontSize: 14, color: theme.colors.text },
  heure: { width: 62, fontFamily: theme.fontBody, fontSize: 14, color: theme.colors.textMuted },
  puceResp: {
    flex: 1,
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: theme.colors.accent,
  },
  puceAlerte: { borderColor: theme.colors.warning },
  puceRespTexte: { flexShrink: 1, fontFamily: theme.fontBodyBold, fontSize: 14, color: theme.colors.accent },
  activite: {
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
  groupes: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.xs },
  groupe: {
    minHeight: 44,
    maxWidth: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: theme.spacing.sm,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  groupeAjout: { borderStyle: 'dashed', backgroundColor: 'transparent' },
  groupeNom: { fontFamily: theme.fontBodyBold, fontSize: 14, color: theme.colors.text, flexShrink: 1 },
  voile: { flex: 1, backgroundColor: theme.colors.voile },
  feuille: {
    gap: theme.spacing.xs,
    padding: theme.spacing.md,
    paddingBottom: theme.spacing.lg,
    backgroundColor: theme.colors.background,
    borderTopLeftRadius: theme.radii.lg,
    borderTopRightRadius: theme.radii.lg,
    borderColor: theme.colors.border,
    borderWidth: 1,
  },
  feuilleTitre: { fontFamily: theme.fontTitle, fontSize: 22, color: theme.colors.text },
  option: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.sm,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  optionTexte: { flex: 1, fontFamily: theme.fontBodyBold, fontSize: 16, color: theme.colors.text },
}));
