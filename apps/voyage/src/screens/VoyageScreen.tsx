import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { theme, creerStylesThemes } from '../theme/theme';
import { useAuth } from '../contexts/AuthContext';
import { alerte } from '../utils/alerte';
import { listerPersonnes, listerPersonnesParIds, type Personne } from '../services/personnes';
import {
  changerRole,
  etapesPour,
  modifierVoyage,
  estOrganisateur,
  inviter,
  libelle,
  libelleQuand,
  mesPersonnes,
  messageErreurVoyage,
  obtenirVoyage,
  PARTICIPATIONS,
  repondre,
  REPONSES,
  retirerParticipant,
  STATUTS,
  supprimerVoyage,
  type Participant,
  type ReponseInvite,
  type VoyageAvecParticipants,
} from '../services/voyage';
import { CaseACocher, Erreur, Puces } from '../components/formulaire';
import { formaterPlage } from '../services/personnes';
import { listerPropositions } from '../services/dates';
import { formaterEuros, listerHebergements, type Hebergement } from '../services/hebergements';
import { calculerBudget } from '../services/budget';
import { fenetrePeriode } from '../services/dates';
import { versIso } from '../services/calendrier';
import { listerPostes, type Poste } from '../services/voyage';
import { listerRepas, listesLiees, type Repas } from '../services/repas';
import { Champ } from '../components/formulaire';
import { listerTrajets, type Trajet } from '../services/transport';
import { listerActivites, type Activite } from '../services/activites';
import { Bouton, Chargement, MessageVide, Pastille } from '../components/ui';

const LIBELLES_REPONSE: Record<ReponseInvite, string> = {
  invite: 'Pas encore répondu',
  partant: 'Partant',
  peut_etre: 'Peut-être',
  decline: 'Ne vient pas',
};

// Écran d'un voyage : en-tête, invités (réponses, invitations, co-
// organisateurs), puis les étapes suivantes du parcours.
export default function VoyageScreen({ route, navigation }: any) {
  const voyageId: string = route.params?.voyageId;
  const { session, foyer, foyersFamille } = useAuth();
  const moiId = session?.user.id ?? '';

  const [voyage, setVoyage] = useState<VoyageAvecParticipants | null>(null);
  const [personnes, setPersonnes] = useState<Map<string, Personne>>(new Map());
  const [famillePersonnes, setFamillePersonnes] = useState<Personne[]>([]);
  const [erreurChargement, setErreurChargement] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [inviterOuvert, setInviterOuvert] = useState(false);
  const [aInviter, setAInviter] = useState<Set<string>>(new Set());
  const [enCours, setEnCours] = useState(false);
  const [etat, setEtat] = useState<{
    propositions: number;
    hebergements: Hebergement[];
    postes: Poste[];
    trajets: Trajet[];
    activites: Activite[];
    repas: Repas[];
    listes: number;
  }>({ propositions: 0, hebergements: [], postes: [], trajets: [], activites: [], repas: [], listes: 0 });
  const [lieuOuvert, setLieuOuvert] = useState(false);
  const [lieuChoix, setLieuChoix] = useState('decider');
  const [lieuTexte, setLieuTexte] = useState('');

  const charger = useCallback(async () => {
    try {
      const v = await obtenirVoyage(voyageId);
      const estRepas = v.nature === 'repas';
      const [invites, famille, propositions, hebergements, postes, trajets, activites, repas, listes] = await Promise.all([
        listerPersonnesParIds(v.participants.map((p) => p.personne_id)),
        listerPersonnes(foyersFamille),
        listerPropositions(v.id),
        listerHebergements(v.id),
        listerPostes(v.id),
        listerTrajets(v.id),
        listerActivites(v.id),
        estRepas ? listerRepas(v.id) : Promise.resolve([] as Repas[]),
        estRepas ? listesLiees(v.id) : Promise.resolve([] as string[]),
      ]);
      setEtat({ propositions: propositions.length, hebergements, postes, trajets, activites, repas, listes: listes.length });
      const carte = new Map<string, Personne>();
      for (const p of [...famille, ...invites]) carte.set(p.id, p);
      setPersonnes(carte);
      setFamillePersonnes(famille);
      setVoyage(v);
      navigation.setOptions({ title: v.titre });
    } catch (e) {
      setErreurChargement(messageErreurVoyage(e));
    }
  }, [voyageId, foyersFamille, navigation]);

  useFocusEffect(
    useCallback(() => {
      charger();
    }, [charger])
  );

  const miennes = useMemo(
    () => mesPersonnes([...personnes.values()], moiId, foyer?.id ?? null),
    [personnes, moiId, foyer]
  );
  const maPersonne = miennes.find((p) => p.utilisateur_id === moiId) ?? null;

  if (erreurChargement) return <MessageVide titre="Voyage introuvable" texte={erreurChargement} />;
  if (!voyage) return <Chargement />;

  const organisateur = estOrganisateur(voyage, moiId, maPersonne?.id ?? null);
  const createur = voyage.cree_par === moiId;
  const idsInvites = new Set(voyage.participants.map((p) => p.personne_id));
  const mesInvitations = voyage.participants.filter((p) => miennes.some((m) => m.id === p.personne_id));
  const nonInvites = famillePersonnes.filter((p) => !idsInvites.has(p.id));
  const peutRejoindre =
    voyage.participation === 'famille' && maPersonne !== null && !idsInvites.has(maPersonne.id);

  const nom = (id: string) => personnes.get(id)?.prenom ?? 'Quelqu’un';
  const ordre: ReponseInvite[] = ['partant', 'peut_etre', 'invite', 'decline'];
  const tries = [...voyage.participants].sort(
    (a, b) =>
      (a.role === 'organisateur' ? -1 : 0) - (b.role === 'organisateur' ? -1 : 0) ||
      ordre.indexOf(a.reponse) - ordre.indexOf(b.reponse) ||
      nom(a.personne_id).localeCompare(nom(b.personne_id))
  );
  const partants = voyage.participants.filter((p) => p.reponse === 'partant').length;
  const attendus = voyage.participants.filter((p) => p.reponse !== 'decline').length;

  // Foyers connus (pour « Chez … »).
  const foyersConnus = [...new Map([...personnes.values()].filter((p) => p.foyer_id && p.foyer_nom).map((p) => [p.foyer_id!, p.foyer_nom!])).entries()];
  const nomFoyer = (id: string) => foyersConnus.find(([f]) => f === id)?.[1] ?? null;

  // Résumé de chaque étape du parcours.
  const retenus = etat.hebergements.filter((h) => h.statut === 'retenu');
  const proposes = etat.hebergements.filter((h) => h.statut === 'propose');
  const dateReference = voyage.date_debut ?? versIso(fenetrePeriode(voyage.periode, voyage.annee).debut);
  const budget = calculerBudget({
    nuits: voyage.nb_nuits,
    repartition: voyage.repartition,
    dateReference,
    personnes: voyage.participants
      .filter((p) => p.reponse !== 'decline')
      .map((p) => personnes.get(p.personne_id))
      .filter((p): p is Personne => !!p),
    hebergements: etat.hebergements,
    postes: etat.postes,
    trajets: etat.trajets,
    activites: etat.activites,
  });
  const attendusIds = voyage.participants.filter((p) => p.reponse !== 'decline').map((p) => p.personne_id);
  const transportes = new Set(etat.trajets.flatMap((t) => t.passagers.map((x) => x.personne_id)));
  const sansTrajet = attendusIds.filter((id) => !transportes.has(id)).length;
  const activitesRetenues = etat.activites.filter((a) => a.statut === 'retenu').length;
  const activitesProposees = etat.activites.filter((a) => a.statut === 'propose').length;
  const resumes: Record<string, { texte: string; fait: boolean }> = {
    dates:
      voyage.date_debut && voyage.date_fin
        ? { texte: `Retenues : ${formaterPlage(voyage.date_debut, voyage.date_fin)}`, fait: true }
        : {
            texte: etat.propositions
              ? `${etat.propositions} proposition${etat.propositions > 1 ? 's' : ''} en cours de vote`
              : 'Proposer des dates d’après le calendrier',
            fait: false,
          },
    hebergement: retenus.length
      ? { texte: `Retenu : ${retenus.map((h) => h.nom).join(', ')}`, fait: true }
      : {
          texte: proposes.length
            ? `${proposes.length} proposition${proposes.length > 1 ? 's' : ''}, à départager`
            : 'Proposer un logement',
          fait: false,
        },
    transport: etat.trajets.length
      ? {
          texte:
            `${etat.trajets.length} trajet${etat.trajets.length > 1 ? 's' : ''} · ${formaterEuros(budget.transport)}` +
            (sansTrajet ? ` · ${sansTrajet} sans trajet` : ''),
          fait: sansTrajet === 0,
        }
      : { texte: 'Chaque foyer déclare son trajet', fait: false },
    activites: etat.activites.length
      ? {
          texte: `${activitesRetenues} retenue${activitesRetenues > 1 ? 's' : ''} (${formaterEuros(budget.loisirs)}) · ${activitesProposees} à décider`,
          fait: activitesRetenues > 0 && activitesProposees === 0,
        }
      : { texte: 'Proposer des visites, parcs, restaurants', fait: false },
    programme: voyage.date_debut
      ? {
          texte: activitesRetenues
            ? `${etat.activites.filter((a) => a.statut === 'retenu' && a.jour).length} activité(s) placée(s) sur ${activitesRetenues}`
            : `${(voyage.nb_nuits ?? 0) + 1} jours à organiser`,
          fait: activitesRetenues > 0 && etat.activites.every((a) => a.statut !== 'retenu' || !!a.jour),
        }
      : { texte: 'Une fois les dates retenues', fait: false },
    menu: etat.repas.length
      ? {
          texte: `${etat.repas.length} repas · ${etat.repas.reduce((n, r) => n + r.plats.length, 0)} plat(s) prévu(s)`,
          fait: etat.repas.every((r) => r.plats.length > 0),
        }
      : { texte: 'Définir les repas et leurs menus', fait: false },
    listes: etat.listes
      ? { texte: `${etat.listes} liste${etat.listes > 1 ? 's' : ''} de cadeaux liée${etat.listes > 1 ? 's' : ''}`, fait: true }
      : { texte: 'Relier une liste de CadeauCommun (facultatif)', fait: false },
    budget: {
      texte: budget.total > 0 ? `${formaterEuros(budget.total)} estimés pour l’instant` : 'Rien de chiffré pour l’instant',
      fait: false,
    },
  };

  const agir = async (action: () => Promise<void>) => {
    setErreur(null);
    setEnCours(true);
    try {
      await action();
      await charger();
    } catch (e) {
      setErreur(messageErreurVoyage(e));
    } finally {
      setEnCours(false);
    }
  };

  const confirmerRetrait = (p: Participant) =>
    alerte(`Retirer ${nom(p.personne_id)} du voyage ?`, undefined, [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Retirer', style: 'destructive', onPress: () => agir(() => retirerParticipant(voyage.id, p.personne_id)) },
    ]);

  const confirmerSuppression = () =>
    alerte(voyage.nature === 'repas' ? 'Supprimer ce repas ?' : 'Supprimer ce voyage ?', 'Il disparaîtra pour tous les invités, avec tout ce qui a été préparé.', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: async () => {
          try {
            await supprimerVoyage(voyage.id);
            navigation.goBack();
          } catch (e) {
            setErreur(messageErreurVoyage(e));
          }
        },
      },
    ]);

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.contenu}>
      <View style={styles.entete}>
        <Pastille texte={libelle(STATUTS, voyage.statut)} />
        <Text style={styles.titre}>{voyage.titre}</Text>
        <Text style={styles.detail}>
          {voyage.nature === 'repas'
            ? voyage.foyer_hote
              ? `Chez ${nomFoyer(voyage.foyer_hote) ?? 'un foyer de la famille'}`
              : voyage.destination ?? 'Lieu à décider'
            : voyage.destination ?? 'Destination à choisir'}
        </Text>
        {voyage.nature === 'repas' && organisateur && !lieuOuvert && (
          <Pressable onPress={() => {
            setLieuChoix(voyage.foyer_hote ?? (voyage.destination ? 'ailleurs' : 'decider'));
            setLieuTexte(voyage.destination ?? '');
            setLieuOuvert(true);
          }} accessibilityRole="button" hitSlop={6}>
            <Text style={styles.lienDiscret}>Changer le lieu</Text>
          </Pressable>
        )}
        {lieuOuvert && (
          <View style={styles.bloc}>
            <Puces
              options={[
                ...foyersConnus.map(([id, nom]) => ({ id, libelle: `Chez ${nom}` })),
                { id: 'ailleurs', libelle: 'Ailleurs' },
                { id: 'decider', libelle: 'À décider' },
              ]}
              valeur={lieuChoix}
              onChange={setLieuChoix}
            />
            {lieuChoix === 'ailleurs' && (
              <Champ value={lieuTexte} onChangeText={setLieuTexte} placeholder="Restaurant, salle, adresse…" accessibilityLabel="Lieu du repas" />
            )}
            <View style={styles.boutons}>
              <Bouton titre="Annuler" variante="discret" onPress={() => setLieuOuvert(false)} />
              <Bouton
                titre="Enregistrer"
                onPress={() =>
                  agir(async () => {
                    await modifierVoyage(voyage.id, {
                      foyer_hote: lieuChoix !== 'ailleurs' && lieuChoix !== 'decider' ? lieuChoix : null,
                      destination: lieuChoix === 'ailleurs' ? lieuTexte.trim() || null : null,
                    });
                    setLieuOuvert(false);
                  })
                }
              />
            </View>
          </View>
        )}
        <Text style={styles.detail}>
          {libelleQuand(voyage)}
          {voyage.nature !== 'repas' && voyage.nb_nuits != null ? ` · ${voyage.nb_nuits} nuit${voyage.nb_nuits > 1 ? 's' : ''}` : ''}
        </Text>
        <Text style={styles.detail}>{libelle(PARTICIPATIONS, voyage.participation)}</Text>
        {voyage.description ? <Text style={styles.description}>{voyage.description}</Text> : null}
      </View>

      {/* Ma réponse (et celle de mes enfants sans compte) */}
      {mesInvitations.length > 0 && (
        <View style={styles.bloc}>
          <Text style={styles.blocTitre}>{mesInvitations.length > 1 ? 'Vos réponses' : 'Votre réponse'}</Text>
          {mesInvitations.map((p) => (
            <View key={p.personne_id} style={styles.reponse}>
              {mesInvitations.length > 1 && <Text style={styles.reponseNom}>{nom(p.personne_id)}</Text>}
              <Puces
                options={REPONSES}
                valeur={p.reponse === 'invite' ? null : p.reponse}
                onChange={(r) => agir(() => repondre(voyage.id, p.personne_id, r))}
              />
            </View>
          ))}
        </View>
      )}
      {peutRejoindre && (
        <Bouton
          titre="Je veux venir aussi"
          variante="contour"
          enCours={enCours}
          onPress={() => agir(() => inviter(voyage.id, [maPersonne!.id]))}
        />
      )}

      {/* Invités */}
      <View style={styles.sectionLigne}>
        <Text style={styles.section}>Invités</Text>
        <Text style={styles.compte}>
          {partants} partant{partants > 1 ? 's' : ''} · {attendus} attendu{attendus > 1 ? 's' : ''}
        </Text>
      </View>
      <View style={styles.bloc}>
        {tries.map((p) => {
          const personne = personnes.get(p.personne_id);
          const estCreateurDuVoyage = personne?.utilisateur_id === voyage.cree_par;
          return (
            <View key={p.personne_id} style={styles.invite}>
              <View style={styles.inviteTexte}>
                <Text style={styles.inviteNom}>
                  {nom(p.personne_id)}
                  {p.role === 'organisateur' ? ' · organise' : ''}
                </Text>
                <Text style={[styles.inviteReponse, p.reponse === 'partant' && styles.partant]}>
                  {LIBELLES_REPONSE[p.reponse]}
                </Text>
              </View>
              {organisateur && !estCreateurDuVoyage && personne?.utilisateur_id && (
                <Pressable
                  onPress={() =>
                    agir(() =>
                      changerRole(voyage.id, p.personne_id, p.role === 'organisateur' ? 'participant' : 'organisateur')
                    )
                  }
                  accessibilityRole="button"
                  accessibilityLabel={
                    p.role === 'organisateur'
                      ? `Retirer ${nom(p.personne_id)} des organisateurs`
                      : `Nommer ${nom(p.personne_id)} co-organisateur`
                  }
                  hitSlop={8}
                  style={styles.icone}
                >
                  <Ionicons
                    name={p.role === 'organisateur' ? 'star' : 'star-outline'}
                    size={20}
                    color={theme.colors.accent}
                  />
                </Pressable>
              )}
              {organisateur && !estCreateurDuVoyage && (
                <Pressable
                  onPress={() => confirmerRetrait(p)}
                  accessibilityRole="button"
                  accessibilityLabel={`Retirer ${nom(p.personne_id)}`}
                  hitSlop={8}
                  style={styles.icone}
                >
                  <Ionicons name="close-circle-outline" size={22} color={theme.colors.textMuted} />
                </Pressable>
              )}
            </View>
          );
        })}
        {organisateur && <Text style={styles.aide}>★ = co-organisateur : mêmes droits que vous sur ce voyage.</Text>}
      </View>

      {organisateur && nonInvites.length > 0 && !inviterOuvert && (
        <Bouton titre="+ Inviter d'autres personnes" variante="pointille" onPress={() => setInviterOuvert(true)} />
      )}
      {organisateur && inviterOuvert && (
        <View style={styles.bloc}>
          <Text style={styles.blocTitre}>Inviter</Text>
          {nonInvites.map((p) => (
            <CaseACocher
              key={p.id}
              coche={aInviter.has(p.id)}
              onChange={(c) =>
                setAInviter((s) => {
                  const n = new Set(s);
                  if (c) n.add(p.id);
                  else n.delete(p.id);
                  return n;
                })
              }
              libelle={p.prenom}
              aide={p.foyer_nom ?? undefined}
            />
          ))}
          <View style={styles.boutons}>
            <Bouton
              titre="Annuler"
              variante="discret"
              onPress={() => {
                setInviterOuvert(false);
                setAInviter(new Set());
              }}
            />
            <Bouton
              titre={`Inviter (${aInviter.size})`}
              desactive={aInviter.size === 0}
              enCours={enCours}
              onPress={() =>
                agir(async () => {
                  await inviter(voyage.id, [...aInviter]);
                  setInviterOuvert(false);
                  setAInviter(new Set());
                })
              }
            />
          </View>
        </View>
      )}

      <Erreur texte={erreur} />

      <Text style={styles.section}>Organisation</Text>
      {etapesPour(voyage.nature).filter((e) => e.id !== 'invites').map((etape) => {
        const ecran = ({ dates: 'Dates', hebergement: 'Hebergements', transport: 'Transport', activites: 'Activites', programme: 'Programme', budget: 'Budget', menu: 'Menu', listes: 'ListesCadeaux' } as Record<string, string>)[etape.id];
        const resume = resumes[etape.id];
        const contenu = (
          <>
            <View style={[styles.pastilleNumero, resume?.fait && styles.pastilleFaite]}>
              <Ionicons
                name={(resume?.fait ? 'checkmark' : etape.icone) as any}
                size={20}
                color={resume?.fait ? theme.colors.background : theme.colors.accent}
              />
            </View>
            <View style={styles.etapeTexte}>
              <Text style={styles.etapeTitre}>{etape.libelle}</Text>
              <Text style={styles.etapeAide}>{resume?.texte ?? etape.aide}</Text>
            </View>
            {ecran ? (
              <Ionicons name="chevron-forward" size={20} color={theme.colors.textMuted} />
            ) : (
              <Text style={styles.bientot}>Bientôt</Text>
            )}
          </>
        );
        return ecran ? (
          <Pressable
            key={etape.id}
            style={styles.etape}
            onPress={() => navigation.navigate(ecran, { voyageId: voyage.id })}
            accessibilityRole="button"
            accessibilityLabel={`${etape.libelle} : ${resume?.texte ?? etape.aide}`}
          >
            {contenu}
          </Pressable>
        ) : (
          <View key={etape.id} style={[styles.etape, styles.etapeInactive]}>
            {contenu}
          </View>
        );
      })}

      {createur && (
        <Bouton titre={voyage.nature === 'repas' ? 'Supprimer ce repas' : 'Supprimer ce voyage'} variante="discret" onPress={confirmerSuppression} style={styles.supprimer} />
      )}
    </ScrollView>
  );
}

const styles = creerStylesThemes(() => ({
  flex: { flex: 1, backgroundColor: theme.colors.background },
  contenu: { padding: theme.spacing.md, gap: theme.spacing.sm, paddingBottom: theme.spacing.xl },
  entete: { gap: 4, marginBottom: theme.spacing.sm },
  titre: { fontFamily: theme.fontTitle, fontSize: 26, color: theme.colors.text },
  detail: { fontFamily: theme.fontBody, fontSize: 15, color: theme.colors.textMuted },
  description: { fontFamily: theme.fontManuscrit, fontSize: 15, color: theme.colors.text, marginTop: theme.spacing.xs },
  sectionLigne: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginTop: theme.spacing.sm },
  section: { fontFamily: theme.fontTitle, fontSize: 18, color: theme.colors.text, marginTop: theme.spacing.sm },
  compte: { fontFamily: theme.fontBody, fontSize: 14, color: theme.colors.textMuted },
  bloc: {
    gap: theme.spacing.sm,
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radii.lg,
    padding: theme.spacing.md,
  },
  blocTitre: { fontFamily: theme.fontBodyBold, fontSize: 16, color: theme.colors.text },
  reponse: { gap: theme.spacing.xs },
  reponseNom: { fontFamily: theme.fontBody, fontSize: 14, color: theme.colors.textMuted },
  invite: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, minHeight: 40 },
  inviteTexte: { flex: 1 },
  inviteNom: { fontFamily: theme.fontBodyBold, fontSize: 16, color: theme.colors.text },
  inviteReponse: { fontFamily: theme.fontBody, fontSize: 14, color: theme.colors.textMuted },
  partant: { color: theme.colors.success, fontFamily: theme.fontBodyBold },
  icone: { minWidth: 32, minHeight: 32, alignItems: 'center', justifyContent: 'center' },
  aide: { fontFamily: theme.fontBody, fontSize: 13, color: theme.colors.textMuted },
  boutons: { flexDirection: 'row', justifyContent: 'flex-end', gap: theme.spacing.sm },
  etape: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radii.lg,
    padding: theme.spacing.md,
  },
  pastilleNumero: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.accentTransparent,
  },
  etapeTexte: { flex: 1, gap: 2 },
  etapeTitre: { fontFamily: theme.fontBodyBold, fontSize: 16, color: theme.colors.text },
  etapeAide: { fontFamily: theme.fontBody, fontSize: 14, color: theme.colors.textMuted },
  pastilleFaite: { backgroundColor: theme.colors.success },
  etapeInactive: { opacity: 0.6 },
  bientot: { fontFamily: theme.fontManuscrit, fontSize: 13, color: theme.colors.textMuted },
  lienDiscret: { fontFamily: theme.fontBody, fontSize: 14, color: theme.colors.accent, textDecorationLine: 'underline' },
  supprimer: { marginTop: theme.spacing.lg },
}));
