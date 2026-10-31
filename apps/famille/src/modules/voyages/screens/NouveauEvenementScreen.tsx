import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { theme, creerStylesThemes } from '../theme/theme';
import { useAuth } from '../contexts/AuthContext';
import { listerPersonnes, type Personne } from '../services/personnes';
import { anneeParDefaut, messageErreurVoyage, PARTICIPATIONS, PERIODES, TYPES_SEJOUR, type NatureVoyage, type Periode, type Participation, type TypeSejour } from '../services/voyage';
import { ETAPES_REPAS, type EtapeRepas } from '../services/repas';
import { Aide, CarteChoix, CaseACocher, Champ, Erreur, Libelle, Puces } from '../components/formulaire';
import { Bouton, Chargement, Pastille } from '../components/ui';
import { AssistantPasAPas } from '../components/AssistantPasAPas';
import { ChoixDates } from '../components/ChoixDates';
import { AjoutLibre } from '../components/AjoutLibre';
import { BoutonAssistant, ChargementAssistant, Etincelle, MessageAssistant } from '../../../composants/assistant';
import { ErreurAssistant, messageErreurAssistant } from '../../../services/assistant';
import { demanderBrouillon, type BrouillonVoyage } from '../../../services/brouillonVoyage';
import { formaterPlage } from '../services/personnes';
import { appliquerBrouillonAssistant, demanderMenu, villesDesFoyers } from '../services/idees';
import {
  brouillonUtile,
  brouillonVide,
  creerEvenement,
  dateDeLOccasion,
  decisionEffective,
  effacerBrouillonLocal,
  garderBrouillonLocal,
  lireBrouillonLocal,
  nuitsEntre,
  OCCASIONS,
  prochainAnniversaire,
  titreAutomatique,
  type Brouillon,
  type Decision,
  type Idee,
  type Occasion,
  type ResultatCreation,
} from '../services/creation';

const ETAPES_VOYAGE = ['Où, quand', 'Qui', 'Logement', 'Trajet', 'Activités', 'Résumé'];
const ETAPES_REPAS_LIBELLES = ['Quoi, où, quand', 'Qui', 'Menu', 'Résumé'];

const CATEGORIES_PLAT: { id: EtapeRepas | 'autre'; libelle: string }[] = [
  ...ETAPES_REPAS.map((e) => ({ id: e.id as EtapeRepas | 'autre', libelle: e.libelle })),
  { id: 'autre', libelle: 'Proposé par la famille' },
];

function cle(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

// Proposer un voyage (6 étapes) ou un repas (4 étapes), une question par
// écran (refonte Événements § 5 à 7). Rien n'est créé avant « Proposer » ;
// le brouillon est gardé sur l'appareil.
export default function NouveauEvenementScreen({ navigation, route }: any) {
  const nature: NatureVoyage = route?.params?.nature === 'repas' ? 'repas' : 'voyage';
  const repas = nature === 'repas';
  const { session, famille, foyersFamille, foyer } = useAuth();
  const moiId = session?.user.id ?? '';

  const [personnes, setPersonnes] = useState<Personne[] | null>(null);
  const [b, setB] = useState<Brouillon>(() => brouillonVide(nature, foyer?.id ?? null));
  const [phase, setPhase] = useState<'chargement' | 'reprise' | 'saisie' | 'fin'>('chargement');
  const [local, setLocal] = useState<Brouillon | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  const [resultat, setResultat] = useState<ResultatCreation | null>(null);

  // Assistant, étape « Où, quand » du voyage : une phrase pré-remplit l'étape.
  const [demande, setDemande] = useState('');
  const [ouvertAssistant, setOuvertAssistant] = useState(false);
  const [lecture, setLecture] = useState(false);
  const [erreurAssistant, setErreurAssistant] = useState<ErreurAssistant | null>(null);
  const annulation = useRef<AbortController | null>(null);

  // Plat en cours de saisie (étape Menu).
  const [platTexte, setPlatTexte] = useState('');
  const [platCategorie, setPlatCategorie] = useState<EtapeRepas | 'autre'>('plat');
  const [platMoi, setPlatMoi] = useState(false);

  const maj = (champs: Partial<Brouillon>) => setB((x) => ({ ...x, ...champs }));

  useEffect(() => {
    navigation.setOptions?.({ title: repas ? 'Proposer un repas' : 'Proposer un voyage' });
  }, [navigation, repas]);

  useEffect(() => {
    listerPersonnes(foyersFamille)
      .then(setPersonnes)
      .catch(() => setPersonnes([]));
  }, [foyersFamille]);

  // Brouillon retrouvé sur l'appareil : Reprendre / Recommencer.
  useEffect(() => {
    // Venu de « Ou laissez l'assistant organiser » (feuille ⊕) : l'assistant
    // pas à pas s'ouvre pré-rempli, à vérifier étape par étape.
    const deLAssistant = route?.params?.brouillonAssistant as BrouillonVoyage | undefined;
    if (deLAssistant) {
      setB((x) => appliquerBrouillonAssistant(x, deLAssistant));
      setPhase('saisie');
      return;
    }
    lireBrouillonLocal(nature).then((l) => {
      if (l && brouillonUtile(l)) {
        setLocal(l);
        setPhase('reprise');
      } else setPhase('saisie');
    });
  }, [nature]);

  useEffect(() => {
    if (phase === 'saisie') garderBrouillonLocal(b);
  }, [b, phase]);

  const autres = useMemo(() => (personnes ?? []).filter((p) => p.utilisateur_id !== moiId), [personnes, moiId]);
  const maPersonne = useMemo(() => (personnes ?? []).find((p) => p.utilisateur_id === moiId) ?? null, [personnes, moiId]);
  const parFoyer = useMemo(() => {
    const groupes = new Map<string, Personne[]>();
    for (const p of autres) {
      const k = p.foyer_nom ?? 'Sans foyer';
      groupes.set(k, [...(groupes.get(k) ?? []), p]);
    }
    return [...groupes.entries()];
  }, [autres]);
  const foyers = useMemo(() => {
    const vus = new Map<string, string>();
    for (const p of personnes ?? []) if (p.foyer_id && p.foyer_nom) vus.set(p.foyer_id, p.foyer_nom);
    return vus;
  }, [personnes]);
  const nomFoyer = (id: string) => foyers.get(id) ?? null;

  const fete = useMemo(() => (personnes ?? []).find((p) => p.id === b.fetePersonneId) ?? null, [personnes, b.fetePersonneId]);
  const anniversairesProches = useMemo(() => {
    return (personnes ?? [])
      .map((p) => ({ p, a: p.date_naissance ? prochainAnniversaire(p.date_naissance) : null }))
      .filter((x): x is { p: Personne; a: { date: string; age: number } } => x.a !== null)
      .sort((x, y) => x.a.date.localeCompare(y.a.date))
      .slice(0, 8)
      .map((x) => x.p);
  }, [personnes]);

  // Titre automatique, tant qu'il n'a pas été modifié à la main.
  const titreAuto = useMemo(() => titreAutomatique(b, personnes ?? [], nomFoyer), [b, personnes, foyers]); // eslint-disable-line react-hooks/exhaustive-deps
  const titre = b.titreModifie ? b.titre : titreAuto;
  useEffect(() => {
    if (!b.titreModifie && b.titre !== titreAuto) maj({ titre: titreAuto });
  }, [titreAuto]); // eslint-disable-line react-hooks/exhaustive-deps

  const etapes = repas ? ETAPES_REPAS_LIBELLES : ETAPES_VOYAGE;
  const derniere = etapes.length - 1;

  const allerA = (i: number) => {
    setErreur(null);
    setB((x) => ({ ...x, etape: i, vus: Math.max(x.vus, i) }));
  };

  // Invités effectifs (pour le secret) : toute la famille, ou la sélection.
  const personnesInvitables = b.participation === 'famille' ? autres : autres.filter((p) => b.invites.includes(p.id));

  // Contexte des idées de l'assistant (§ 5.6) : nombre de personnes et villes
  // de départ des foyers concernés (villes seulement, jamais d'adresse).
  const nbParticipants = Math.max(1, personnesInvitables.length + (maPersonne ? 1 : 0));
  const idsFoyersConcernes = [...new Set([...(maPersonne ? [maPersonne] : []), ...personnesInvitables].map((p) => p.foyer_id).filter(Boolean) as string[])].sort();
  const [villesFoyers, setVillesFoyers] = useState<string[]>([]);
  const cleFoyers = idsFoyersConcernes.join(',');
  useEffect(() => {
    if (!cleFoyers) return setVillesFoyers([]);
    let actif = true;
    villesDesFoyers(cleFoyers.split(',')).then((v) => actif && setVillesFoyers(v));
    return () => {
      actif = false;
    };
  }, [cleFoyers]);

  // Menu complet proposé par l'assistant (repas, étape Menu).
  const [menuEnCours, setMenuEnCours] = useState(false);
  const [erreurMenu, setErreurMenu] = useState<ErreurAssistant | null>(null);
  const [infoMenu, setInfoMenu] = useState<string | null>(null);
  const annulationMenu = useRef<AbortController | null>(null);
  useEffect(() => () => annulationMenu.current?.abort(), []);

  const proposerMenu = async () => {
    const controle = new AbortController();
    annulationMenu.current = controle;
    setMenuEnCours(true);
    setErreurMenu(null);
    setInfoMenu(null);
    try {
      const r = await demanderMenu({
        occasion: b.occasion,
        nbInvites: nbParticipants,
        date: b.plages[0]?.debut ?? null,
        moment: b.moment,
        plats: b.plats.map((p) => ({ titre: p.titre, categorie: p.etape })),
        signal: controle.signal,
      });
      if (controle.signal.aborted) return;
      if (!r.plats.length) {
        setInfoMenu(r.question ?? 'Rien à ajouter : le menu semble déjà complet.');
        return;
      }
      // Les plats proposés n'ont personne : ils seront proposés aux invités.
      setB((x) => ({
        ...x,
        plats: [...x.plats, ...r.plats.map((p) => ({ cle: cle(), titre: p.titre, etape: p.categorie, moi: false }))],
      }));
      setInfoMenu(`${r.plats.length} plat${r.plats.length > 1 ? 's' : ''} ajouté${r.plats.length > 1 ? 's' : ''}, sans personne. Retirez ce qui ne vous convient pas.`);
    } catch (e) {
      if (controle.signal.aborted) return;
      setErreurMenu(e instanceof ErreurAssistant ? e : new ErreurAssistant('indisponible', messageErreurAssistant(e)));
    } finally {
      if (!controle.signal.aborted) setMenuEnCours(false);
    }
  };

  const idees = (): React.ComponentProps<typeof AjoutLibre>['contexteIdees'] => ({
    destination: b.aChoisir ? '' : b.destination,
    dateDebut: b.plages[0]?.debut ?? null,
    dateFin: b.plages[0]?.fin ?? null,
    nbPersonnes: nbParticipants,
    villesFoyers,
    onIndiquerDestination: () => allerA(0),
  });

  const basculerInvite = (id: string) => {
    setB((x) => {
      if (x.participation === 'amoureux') return { ...x, invites: x.invites.includes(id) ? [] : [id], cachees: [] };
      const invites = x.invites.includes(id) ? x.invites.filter((i) => i !== id) : [...x.invites, id];
      return { ...x, invites, cachees: x.cachees.filter((c) => invites.includes(c)) };
    });
  };

  const choisirParticipation = (p: Participation) => maj({ participation: p, invites: [], cachees: [] });

  const basculerCachee = (id: string) =>
    setB((x) => ({ ...x, cachees: x.cachees.includes(id) ? x.cachees.filter((c) => c !== id) : [...x.cachees, id] }));

  const choisirOccasion = (o: Occasion) => {
    const f = o === 'anniversaire' ? fete ?? anniversairesProches[0] ?? null : null;
    const date = dateDeLOccasion(o, f);
    setB((x) => ({
      ...x,
      occasion: o,
      fetePersonneId: f?.id ?? null,
      plages: date && x.plages.length === 0 ? [{ debut: date, fin: date }] : x.plages,
    }));
  };

  const choisirFetee = (id: string) => {
    const f = (personnes ?? []).find((p) => p.id === id) ?? null;
    const date = dateDeLOccasion('anniversaire', f);
    setB((x) => ({
      ...x,
      fetePersonneId: id,
      // Retire la fête de la liste des invités à cacher/inviter n'a pas de sens ici : on garde simple.
      plages: date ? [{ debut: date, fin: date }] : x.plages,
    }));
  };

  const ajouterPlat = () => {
    const t = platTexte.trim();
    if (!t) return;
    setB((x) => ({
      ...x,
      plats: [...x.plats, { cle: cle(), titre: t.charAt(0).toUpperCase() + t.slice(1), etape: platCategorie, moi: platMoi }],
    }));
    setPlatTexte('');
    setPlatMoi(false);
  };

  const preparerBrouillonAssistant = async () => {
    const texte = demande.trim();
    if (texte.length < 8) return setErreurAssistant(new ErreurAssistant('entree', 'Décrivez le voyage : où, quand, avec qui.'));
    const controle = new AbortController();
    annulation.current = controle;
    setLecture(true);
    setErreurAssistant(null);
    try {
      const r = await demanderBrouillon(texte, b.participation === 'famille' ? [] : b.invites, controle.signal);
      if (controle.signal.aborted) return;
      setB((x) => appliquerBrouillonAssistant(x, r));
      setOuvertAssistant(false);
    } catch (e) {
      if (controle.signal.aborted) return;
      setErreurAssistant(e instanceof ErreurAssistant ? e : new ErreurAssistant('indisponible', messageErreurAssistant(e)));
    } finally {
      if (!controle.signal.aborted) setLecture(false);
    }
  };

  const etapeVide = (): boolean => {
    if (repas) {
      if (b.etape === 0) return b.plages.length === 0;
      if (b.etape === 1) return false;
      if (b.etape === 2) return b.plats.length === 0;
      return false;
    }
    if (b.etape === 0) return !b.destination.trim() && !b.aChoisir && b.plages.length === 0;
    if (b.etape === 1) return false;
    if (b.etape === 2) return b.logements.length === 0;
    if (b.etape === 3) return b.trajets.length === 0;
    if (b.etape === 4) return b.activites.length === 0;
    return false;
  };

  const verifier = (): { etape: number; message: string } | null => {
    if (b.participation === 'amoureux' && b.invites.length !== 1) return { etape: 1, message: 'Choisissez la personne qui vous accompagne.' };
    if (b.participation === 'selection' && b.invites.length === 0) return { etape: 1, message: 'Choisissez au moins une personne.' };
    if (b.surprise && b.cachees.length === 0) return { etape: 1, message: 'Choisissez qui ne doit rien savoir, ou répondez « Non » à la surprise.' };
    if (repas && b.occasion === 'anniversaire' && !b.fetePersonneId) return { etape: 0, message: 'Choisissez la personne dont c’est l’anniversaire.' };
    if (repas && b.hote === 'ailleurs' && !b.lieu.trim()) return { etape: 0, message: 'Indiquez le lieu, ou choisissez « À décider ».' };
    if (!titre.trim()) return { etape: derniere, message: 'Donnez un titre.' };
    return null;
  };

  const proposer = async () => {
    const probleme = verifier();
    if (probleme) {
      allerA(probleme.etape);
      return setErreur(probleme.message);
    }
    if (!famille) return;
    setErreur(null);
    setEnCours(true);
    try {
      const r = await creerEvenement(
        { ...b, titre },
        { familleId: famille.id, maPersonneId: maPersonne?.id ?? null, personnes: personnes ?? [] }
      );
      await effacerBrouillonLocal(nature);
      setResultat(r);
      setPhase('fin');
    } catch (e) {
      setErreur(messageErreurVoyage(e));
    } finally {
      setEnCours(false);
    }
  };

  const continuer = () => {
    if (b.etape >= derniere) return proposer();
    allerA(b.etape + 1);
  };

  if (phase === 'chargement' || personnes === null) return <Chargement />;

  if (phase === 'reprise' && local) {
    return (
      <View style={styles.centre}>
        <Text style={styles.titreGros}>Reprendre votre brouillon ?</Text>
        <Aide>
          {repas ? 'Vous aviez commencé à proposer un repas.' : 'Vous aviez commencé à proposer un voyage.'} Rien n’a été envoyé.
        </Aide>
        <Bouton
          titre="Reprendre"
          onPress={() => {
            setB(local);
            setPhase('saisie');
          }}
        />
        <Bouton
          titre="Recommencer"
          variante="contour"
          onPress={async () => {
            await effacerBrouillonLocal(nature);
            setB(brouillonVide(nature, foyer?.id ?? null));
            setPhase('saisie');
          }}
        />
      </View>
    );
  }

  if (phase === 'fin' && resultat) {
    return (
      <View style={styles.centre}>
        <Pastille texte="C’est proposé" ton="succes" />
        <Text style={styles.titreGros}>{titre}</Text>
        <Text style={styles.texte}>
          {resultat.prevenus > 0
            ? `${resultat.prevenus} personne${resultat.prevenus > 1 ? 's' : ''} prévenue${resultat.prevenus > 1 ? 's' : ''}${b.surprise ? ' (sauf la surprise)' : ''}.`
            : 'Personne n’est encore prévenu.'}
        </Text>
        <Text style={styles.texte}>
          {resultat.vote
            ? 'Chacun vote pour les dates qui lui vont.'
            : b.plages.length === 1
              ? 'La date est ajoutée à l’agenda de chacun.'
              : 'Vous pourrez proposer des dates depuis la page.'}
        </Text>
        <Bouton titre={repas ? 'Voir le repas' : 'Voir le voyage'} onPress={() => navigation.replace('Voyage', { voyageId: resultat.id })} />
      </View>
    );
  }

  // -------------------------------------------------------------------------
  // Contenu des étapes
  // -------------------------------------------------------------------------

  const blocQui = (
    <>
      <Libelle>{repas ? 'Qui est invité ?' : 'Qui part ?'}</Libelle>
      {PARTICIPATIONS.filter((p) => !(repas && p.id === 'amoureux')).map((p) => (
        <CarteChoix key={p.id} actif={b.participation === p.id} onPress={() => choisirParticipation(p.id)} titre={p.libelle} aide={p.aide} />
      ))}
      {b.participation !== 'famille'
        ? parFoyer.map(([nomFoyerListe, membres]) => (
            <View key={nomFoyerListe} style={{ gap: 2 }}>
              <Text style={styles.foyer}>{nomFoyerListe}</Text>
              {membres.map((p) => (
                <CaseACocher key={p.id} coche={b.invites.includes(p.id)} onChange={() => basculerInvite(p.id)} libelle={p.prenom} personneId={p.id} />
              ))}
            </View>
          ))
        : null}

      <Libelle>Est-ce une surprise ?</Libelle>
      <Puces
        options={[
          { id: 'non', libelle: 'Non' },
          { id: 'oui', libelle: 'Oui' },
        ]}
        valeur={b.surprise ? 'oui' : 'non'}
        onChange={(v: 'oui' | 'non') => maj({ surprise: v === 'oui', cachees: v === 'oui' ? b.cachees : [] })}
      />
      {b.surprise ? (
        <>
          <Libelle>Qui ne doit rien savoir ?</Libelle>
          <Aide>{repas ? 'Ils ne verront ni le repas ni ses notifications.' : 'Ils ne verront ni le voyage ni ses notifications.'}</Aide>
          {personnesInvitables.length === 0 ? <Aide>Choisissez d’abord les invités ci-dessus.</Aide> : null}
          {personnesInvitables.map((p) => (
            <CaseACocher key={p.id} coche={b.cachees.includes(p.id)} onChange={() => basculerCachee(p.id)} libelle={p.prenom} personneId={p.id} />
          ))}
        </>
      ) : null}
    </>
  );

  const ligneResume = (libelle: string, valeur: string, etape: number) => (
    <View style={styles.ligneResume} key={libelle}>
      <View style={{ flex: 1 }}>
        <Text style={styles.petit}>{libelle}</Text>
        <Text style={styles.valeur}>{valeur}</Text>
      </View>
      <Pressable onPress={() => allerA(etape)} accessibilityRole="button" accessibilityLabel={`Modifier : ${libelle}`} style={styles.modifier}>
        <Text style={styles.modifierTexte}>Modifier</Text>
      </Pressable>
    </View>
  );

  const resumeIdees = (liste: Idee[], decision: Decision | null, unite: string) =>
    liste.length === 0
      ? 'Rien pour l’instant'
      : `${liste.length} ${unite}${liste.length > 1 ? 's' : ''} · ${decisionEffective(liste.length, decision) === 'vote' ? 'au vote' : 'retenu'}`;

  const phraseFinale = () => {
    if (b.plages.length >= 2) return 'Les invités sont prévenus et votent pour les dates.';
    if (b.plages.length === 1) return 'Les invités sont prévenus ; la date est ajoutée à leur agenda.';
    return repas ? 'Les invités sont prévenus et répondent oui ou non.' : 'Les invités sont prévenus.';
  };

  const blocResume = (
    <>
      <Libelle>Titre</Libelle>
      <Champ value={titre} onChangeText={(t) => maj({ titre: t, titreModifie: true })} accessibilityLabel="Titre" />
      {b.titreModifie ? (
        <Bouton titre="Revenir au titre proposé" variante="discret" onPress={() => maj({ titreModifie: false })} />
      ) : null}
      {repas ? (
        <>
          {ligneResume('Occasion', `${OCCASIONS.find((o) => o.id === b.occasion)?.libelle ?? ''}${fete ? ` · ${fete.prenom}` : ''}`, 0)}
          {ligneResume(
            'Où',
            b.hote === 'ailleurs' ? b.lieu || 'Ailleurs' : b.hote === 'decider' ? 'À décider' : `Chez ${nomFoyer(b.hote) ?? 'un foyer'}`,
            0
          )}
          {ligneResume(
            'Quand',
            b.plages.length === 0
              ? 'Pas encore de date'
              : b.plages.length === 1
                ? `${formaterPlage(b.plages[0].debut, b.plages[0].fin)}${b.plages[0].debut === b.plages[0].fin ? ` · ${b.moment === 'dejeuner' ? 'midi' : 'soir'}` : ''}`
                : `${b.plages.length} dates au vote`,
            0
          )}
          {ligneResume('Qui est invité', b.participation === 'famille' ? 'Toute la famille' : `${b.invites.length} personne${b.invites.length > 1 ? 's' : ''}`, 1)}
          {b.surprise ? ligneResume('Surprise', `${b.cachees.length} personne${b.cachees.length > 1 ? 's' : ''} ne savent rien`, 1) : null}
          {ligneResume('Menu', b.plats.length ? `${b.plats.length} plat${b.plats.length > 1 ? 's' : ''} prévu${b.plats.length > 1 ? 's' : ''}` : 'À composer sur la page du repas', 2)}
          {b.occasion === 'anniversaire' && fete ? (
            <View style={{ gap: 2 }}>
              <CaseACocher
                coche={b.listeEnvies}
                onChange={(v) => maj({ listeEnvies: v })}
                libelle={`Liste d’envies de ${fete.prenom}`}
                aide="Liée au repas pour que les invités s’en servent. Elle ne voit pas qui offre quoi."
              />
            </View>
          ) : null}
        </>
      ) : (
        <>
          {ligneResume('Où', b.aChoisir || !b.destination.trim() ? 'On choisira ensemble' : b.destination.trim(), 0)}
          {ligneResume(
            'Quand',
            b.plages.length === 0
              ? `${PERIODES.find((p) => p.id === b.periode)?.libelle ?? ''} ${b.anneePeriode ?? ''}`.trim()
              : b.plages.length === 1
                ? `${formaterPlage(b.plages[0].debut, b.plages[0].fin)} · ${nuitsEntre(b.plages[0].debut, b.plages[0].fin)} nuits`
                : `${b.plages.length} dates au vote`,
            0
          )}
          {ligneResume('Qui participe', b.participation === 'famille' ? 'Toute la famille' : `${b.invites.length} personne${b.invites.length > 1 ? 's' : ''}`, 1)}
          {b.surprise ? ligneResume('Surprise', `${b.cachees.length} personne${b.cachees.length > 1 ? 's' : ''} ne savent rien`, 1) : null}
          {ligneResume('Logement', resumeIdees(b.logements, b.decisions.logement, 'proposition'), 2)}
          {ligneResume('Trajet', resumeIdees(b.trajets, b.decisions.trajet, 'proposition'), 3)}
          {ligneResume('Activités', resumeIdees(b.activites, b.decisions.activites, 'activité'), 4)}
        </>
      )}
      <Aide>{phraseFinale()}</Aide>
    </>
  );

  let contenu: React.ReactNode = null;
  if (!repas) {
    if (b.etape === 0) {
      contenu = (
        <>
          <View style={styles.assistant}>
            <Pressable onPress={() => setOuvertAssistant((o) => !o)} accessibilityRole="button" style={styles.assistantEntete}>
              <Etincelle couleur={theme.colors.accent} />
              <Text style={styles.assistantTitre}>Le dire en une phrase à l’assistant</Text>
            </Pressable>
            {ouvertAssistant ? (
              lecture ? (
                <ChargementAssistant
                  etapes={['Je regarde le calendrier…', 'Je cherche des hébergements…', 'Je choisis des activités…', 'Presque fini…']}
                  couleur={theme.colors.accent}
                  onAnnuler={() => {
                    annulation.current?.abort();
                    setLecture(false);
                  }}
                />
              ) : (
                <>
                  <Champ
                    value={demande}
                    onChangeText={setDemande}
                    multiline
                    placeholder="Ex. Un week-end en Bretagne en novembre, pas trop cher"
                    accessibilityLabel="Demande à l’assistant"
                  />
                  <BoutonAssistant titre="Pré-remplir l’étape" onPress={preparerBrouillonAssistant} couleur={theme.colors.accent} />
                  <Aide>Rien n’est créé avant « Proposer le voyage ». Vous pouvez tout modifier.</Aide>
                </>
              )
            ) : null}
            {erreurAssistant ? <MessageAssistant message={erreurAssistant.message} pause={erreurAssistant.code === 'plafond'} /> : null}
          </View>

          <Libelle>Où ?</Libelle>
          {!b.aChoisir ? (
            <Champ value={b.destination} onChangeText={(t) => maj({ destination: t })} placeholder="Ex. Saint-Malo, Angleterre…" accessibilityLabel="Destination" />
          ) : null}
          <CaseACocher coche={b.aChoisir} onChange={(v) => maj({ aChoisir: v })} libelle="On choisira ensemble" />

          <ChoixDates
            plages={b.plages}
            onChange={(plages) => maj({ plages })}
            repas={false}
            plusieursJours
            onPlusieursJours={() => {}}
          />

          {b.plages.length === 0 ? (
            <>
              <Libelle>Ou juste une période</Libelle>
              <Puces
                options={PERIODES.map((p) => ({ id: p.id, libelle: p.libelle }))}
                valeur={b.periode}
                onChange={(p: Periode) => maj({ periode: p, anneePeriode: anneeParDefaut(p) })}
              />
              <Libelle>Durée</Libelle>
              <Puces
                options={TYPES_SEJOUR.filter((t) => t.id !== 'etranger').map((t) => ({ id: t.id, libelle: t.libelle }))}
                valeur={b.typeSejour}
                onChange={(t: TypeSejour) => maj({ typeSejour: t })}
              />
            </>
          ) : null}
        </>
      );
    } else if (b.etape === 1) contenu = blocQui;
    else if (b.etape === 2) {
      contenu = (
        <>
          <Libelle>Où dormir ?</Libelle>
          <AjoutLibre
            genre="hebergement"
            items={b.logements}
            onChange={(logements) => maj({ logements })}
            decision={b.decisions.logement}
            onDecision={(d) => maj({ decisions: { ...b.decisions, logement: d } })}
            retenu={b.retenus.logement}
            onRetenir={(c) => maj({ retenus: { ...b.retenus, logement: c } })}
            placeholder="Chez Mamie, ou collez un lien d’annonce"
            contexteIdees={idees()}
          />
        </>
      );
    } else if (b.etape === 3) {
      contenu = (
        <>
          <Libelle>Comment y aller ?</Libelle>
          <Aide>La partie du trajet faite ensemble. Chaque foyer dira ensuite comment il rejoint le départ.</Aide>
          <AjoutLibre
            genre="trajet"
            items={b.trajets}
            onChange={(trajets) => maj({ trajets })}
            decision={b.decisions.trajet}
            onDecision={(d) => maj({ decisions: { ...b.decisions, trajet: d } })}
            retenu={b.retenus.trajet}
            onRetenir={(c) => maj({ retenus: { ...b.retenus, trajet: c } })}
            mode={b.modeTrajet}
            onMode={(m) => maj({ modeTrajet: m })}
            placeholder="Départ de Rennes à 7 h, ou collez un lien"
            contexteIdees={idees()}
          />
        </>
      );
    } else if (b.etape === 4) {
      contenu = (
        <>
          <Libelle>Que faire sur place ?</Libelle>
          <AjoutLibre
            genre="activite"
            items={b.activites}
            onChange={(activites) => maj({ activites })}
            decision={b.decisions.activites}
            onDecision={(d) => maj({ decisions: { ...b.decisions, activites: d } })}
            placeholder="Randonnée, ou collez un lien"
            contexteIdees={idees()}
          />
        </>
      );
    } else contenu = blocResume;
  } else {
    if (b.etape === 0) {
      const unSeulJour = b.plages.length === 0 || b.plages.every((p) => p.debut === p.fin);
      contenu = (
        <>
          <Libelle>Quelle occasion ?</Libelle>
          <Puces options={OCCASIONS} valeur={b.occasion} onChange={(o: Occasion) => choisirOccasion(o)} />
          {b.occasion === 'anniversaire' ? (
            <>
              <Libelle>Pour qui ?</Libelle>
              <Puces
                options={anniversairesProches.map((p) => ({ id: p.id, libelle: p.prenom, personneId: p.id }))}
                valeur={b.fetePersonneId}
                onChange={(id: string) => choisirFetee(id)}
              />
              {anniversairesProches.length === 0 ? <Aide>Aucune date de naissance renseignée dans la famille.</Aide> : null}
            </>
          ) : null}

          <Libelle>Chez qui ?</Libelle>
          <Puces
            options={[
              ...(foyer?.id ? [{ id: foyer.id, libelle: 'Chez nous' }] : []),
              ...[...foyers.entries()].filter(([id]) => id !== foyer?.id).map(([id, nom]) => ({ id, libelle: `Chez ${nom}` })),
              { id: 'ailleurs', libelle: 'Ailleurs' },
              { id: 'decider', libelle: 'À décider' },
            ]}
            valeur={b.hote}
            onChange={(h: string) => maj({ hote: h })}
          />
          {b.hote === 'ailleurs' ? (
            <Champ value={b.lieu} onChangeText={(t) => maj({ lieu: t })} placeholder="Ex. restaurant Le Relais" accessibilityLabel="Lieu" />
          ) : null}

          <ChoixDates
            plages={b.plages}
            onChange={(plages) => maj({ plages })}
            repas
            plusieursJours={b.plusieursJours}
            onPlusieursJours={(v) => maj({ plusieursJours: v })}
            dateInitiale={dateDeLOccasion(b.occasion, fete)}
          />

          {unSeulJour ? (
            <>
              <Libelle>Midi ou soir ?</Libelle>
              <Puces
                options={[
                  { id: 'dejeuner', libelle: 'Midi' },
                  { id: 'diner', libelle: 'Soir' },
                ]}
                valeur={b.moment}
                onChange={(m: 'dejeuner' | 'diner') => maj({ moment: m })}
              />
              <Champ
                value={b.heure}
                onChangeText={(t) => maj({ heure: t })}
                placeholder="Heure (facultatif), ex. 19:30"
                accessibilityLabel="Heure"
                keyboardType="numbers-and-punctuation"
              />
            </>
          ) : null}
        </>
      );
    } else if (b.etape === 1) contenu = blocQui;
    else if (b.etape === 2) {
      contenu = (
        <>
          <Libelle>Au menu</Libelle>
          <Aide>Notez ce que vous avez en tête. Les plats sans personne seront proposés aux invités.</Aide>
          <View style={styles.assistant}>
            {menuEnCours ? (
              <ChargementAssistant
                etapes={['Je regarde l’occasion et les invités…', 'Je compose le menu…']}
                couleur={theme.colors.accent}
                onAnnuler={() => {
                  annulationMenu.current?.abort();
                  setMenuEnCours(false);
                }}
              />
            ) : (
              <BoutonAssistant titre="L’assistant propose un menu complet" onPress={proposerMenu} couleur={theme.colors.accent} />
            )}
            {infoMenu ? <Aide>{infoMenu}</Aide> : null}
            {erreurMenu ? <MessageAssistant message={erreurMenu.message} pause={erreurMenu.code === 'plafond'} /> : null}
          </View>
          <Puces options={CATEGORIES_PLAT} valeur={platCategorie} onChange={(c: EtapeRepas | 'autre') => setPlatCategorie(c)} />
          <Champ
            value={platTexte}
            onChangeText={setPlatTexte}
            placeholder="Ex. Bœuf bourguignon"
            onSubmitEditing={ajouterPlat}
            returnKeyType="done"
            accessibilityLabel="Nom du plat"
          />
          <CaseACocher coche={platMoi} onChange={setPlatMoi} libelle="Je m’en charge" />
          <Bouton titre="Ajouter le plat" variante="contour" onPress={ajouterPlat} desactive={!platTexte.trim()} />
          {CATEGORIES_PLAT.map((c) => {
            const plats = b.plats.filter((p) => p.etape === c.id);
            if (!plats.length) return null;
            return (
              <View key={c.id} style={{ gap: 4 }}>
                <Text style={styles.foyer}>{c.libelle}</Text>
                {plats.map((p) => (
                  <View key={p.cle} style={styles.platLigne}>
                    <Text style={[styles.valeur, { flex: 1 }]}>{p.titre}</Text>
                    <Text style={styles.petit}>{p.moi ? 'Vous' : 'Personne'}</Text>
                    <Pressable
                      onPress={() => setB((x) => ({ ...x, plats: x.plats.filter((y) => y.cle !== p.cle) }))}
                      accessibilityRole="button"
                      accessibilityLabel={`Retirer ${p.titre}`}
                      style={styles.retirer}
                    >
                      <Text style={styles.retirerTexte}>×</Text>
                    </Pressable>
                  </View>
                ))}
              </View>
            );
          })}
        </>
      );
    } else contenu = blocResume;
  }

  return (
    <AssistantPasAPas
      etapes={etapes}
      etape={b.etape}
      vus={b.vus}
      onEtape={allerA}
      onRetour={() => allerA(Math.max(0, b.etape - 1))}
      onContinuer={continuer}
      libelleContinuer={b.etape >= derniere ? (repas ? 'Proposer le repas' : 'Proposer le voyage') : etapeVide() ? 'Plus tard, continuer' : 'Continuer'}
      enCours={enCours}
    >
      <Erreur texte={erreur} />
      {contenu}
    </AssistantPasAPas>
  );
}

const styles = creerStylesThemes(() => ({
  centre: { flex: 1, padding: theme.spacing.lg, gap: theme.spacing.md, justifyContent: 'center', backgroundColor: theme.colors.background },
  titreGros: { fontFamily: theme.fontTitle, fontSize: 26, color: theme.colors.text },
  texte: { fontFamily: theme.fontBody, fontSize: 16, color: theme.colors.text },
  foyer: { fontFamily: theme.fontBodyBold, fontSize: 13, color: theme.colors.textMuted, marginTop: theme.spacing.xs },
  petit: { fontFamily: theme.fontBody, fontSize: 13, color: theme.colors.textMuted },
  valeur: { fontFamily: theme.fontBody, fontSize: 15, color: theme.colors.text },
  ligneResume: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  modifier: { minHeight: 44, minWidth: 44, justifyContent: 'center', alignItems: 'center' },
  modifierTexte: { fontFamily: theme.fontBodyBold, fontSize: 14, color: theme.colors.accent },
  assistant: {
    gap: theme.spacing.sm,
    padding: theme.spacing.md,
    borderRadius: theme.radii.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  assistantEntete: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44 },
  assistantTitre: { fontFamily: theme.fontBodyBold, fontSize: 15, color: theme.colors.accent },
  platLigne: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
  retirer: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  retirerTexte: { fontSize: 24, color: theme.colors.textMuted },
}));
