import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { theme, creerStylesThemes } from '../theme/theme';
import { useAuth } from '../contexts/AuthContext';
import { listerPersonnesParIds, type Personne } from '../services/personnes';
import { formaterEuros } from '../services/hebergements';
import {
  choisirModeTransport,
  commenterOption,
  deplacerEtape,
  formaterDuree,
  infoEnergie,
  listerOptions,
  listerTrajets,
  MODES_TRAJET,
  quitterEtape,
  rejoindreEtape,
  retenirOption,
  retourIdentique,
  separerRetour,
  type OptionTrajet,
  type Trajet,
} from '../services/transport';
import { etapesDe, lieuRendezVous, resumerOption, vueOption, type Branche, type ResumeOption } from '../services/optionsTrajet';
import { paiementEtape } from '../services/budget';
import { estOrganisateur, mesPersonnes, messageErreurVoyage, obtenirVoyage, type VoyageAvecParticipants } from '../services/voyage';
import { Aide, Champ, Erreur, Puces } from '../components/formulaire';
import { Bouton, Chargement, MessageVide, Pastille } from '../components/ui';
import { alerte } from '../utils/alerte';
import { GroupeNoms } from '@apps-famille/famille';

const MODES_PRINCIPAUX = [
  { id: 'voiture', libelle: 'Voiture' },
  { id: 'train', libelle: 'Train' },
  { id: 'avion', libelle: 'Avion' },
  { id: 'bateau', libelle: 'Bateau' },
  { id: 'bus', libelle: 'Bus' },
  { id: 'mixte', libelle: 'Chacun le sien' },
];

const STATUTS = { proposee: 'Proposée', retenue: 'Retenue', ecartee: 'Écartée' } as const;
const iconeMode = (m: string) => MODES_TRAJET.find((x) => x.id === m)?.icone ?? 'navigate-outline';

// Transport : les façons d'aller au voyage (options : en bateau, en avion…),
// chacune faite d'étapes que plusieurs foyers peuvent partager (chacun va au
// port, puis ferry ensemble). Chacun propose et commente ; un organisateur
// retient une option, la seule qui compte dans le budget.
export default function TransportScreen({ route, navigation }: any) {
  const voyageId: string = route.params?.voyageId;
  const { session, foyer } = useAuth();
  const moiId = session?.user.id ?? '';

  const [donnees, setDonnees] = useState<{
    voyage: VoyageAvecParticipants;
    options: OptionTrajet[];
    trajets: Trajet[];
    personnes: Map<string, Personne>;
  } | null>(null);
  const [erreurChargement, setErreurChargement] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [ecarteesOuvertes, setEcarteesOuvertes] = useState<Set<string>>(new Set());
  const [commentaires, setCommentaires] = useState<Record<string, string>>({});
  // Option à retour différent : aller ou retour affiché.
  const [sensVus, setSensVus] = useState<Record<string, 'aller' | 'retour'>>({});

  const charger = useCallback(async () => {
    try {
      const [voyage, options, trajets] = await Promise.all([obtenirVoyage(voyageId), listerOptions(voyageId), listerTrajets(voyageId)]);
      const ids = new Set(voyage.participants.map((p) => p.personne_id));
      for (const t of trajets) for (const p of t.passagers) ids.add(p.personne_id);
      const liste = await listerPersonnesParIds([...ids]);
      setDonnees({ voyage, options, trajets, personnes: new Map(liste.map((p) => [p.id, p])) });
    } catch (e) {
      setErreurChargement(messageErreurVoyage(e));
    }
  }, [voyageId]);

  useFocusEffect(
    useCallback(() => {
      charger();
    }, [charger])
  );

  const miennes = useMemo(
    () => (donnees ? mesPersonnes([...donnees.personnes.values()], moiId, foyer?.id ?? null) : []),
    [donnees, moiId, foyer]
  );

  if (erreurChargement) return <MessageVide titre="Transport indisponible" texte={erreurChargement} />;
  if (!donnees) return <Chargement />;
  const { voyage, options, trajets, personnes } = donnees;

  const maPersonneId = miennes.find((p) => p.utilisateur_id === moiId)?.id ?? null;
  const organisateur = estOrganisateur(voyage, moiId, maPersonneId);
  const attendus = voyage.participants.filter((p) => p.reponse !== 'decline').map((p) => p.personne_id);
  const mesIds = miennes.filter((p) => attendus.includes(p.id)).map((p) => p.id);
  const nom = (id: string) => personnes.get(id)?.prenom ?? '?';
  const foyerDe = (id: string) => personnes.get(id)?.foyer_id ?? null;
  const qui = (ids: string[]) => ids.map((id) => ({ personneId: id, prenom: nom(id) }));
  const personnesFoyer = (foyerId: string) =>
    `les ${[...personnes.values()].find((p) => p.foyer_id === foyerId)?.foyer_nom ?? 'membres de son foyer'}`;

  // Base pas encore à jour (pas d'options) : les trajets forment un seul
  // groupe, comme avant.
  const sansOptions = options.length === 0 && trajets.length > 0;
  const groupes: { option: OptionTrajet | null; etapes: Trajet[] }[] = sansOptions
    ? [{ option: null, etapes: trajets }]
    : options.map((o) => ({ option: o, etapes: etapesDe(o.id, trajets) }));
  const resumes = new Map<string | null, ResumeOption>(
    groupes.map((g) => [g.option?.id ?? null, resumerOption(g.etapes, attendus, foyerDe)])
  );
  const enLice = options.filter((o) => o.statut !== 'ecartee');
  const retenue = options.find((o) => o.statut === 'retenue') ?? null;

  const agir = async (action: () => Promise<void>) => {
    setErreur(null);
    try {
      await action();
      await charger();
    } catch (e) {
      setErreur(messageErreurVoyage(e));
    }
  };

  // Comparatif : moins chère et plus rapide signalées.
  const comparables = enLice.filter((o) => (resumes.get(o.id)?.cout ?? 0) > 0 || etapesDe(o.id, trajets).length > 0);
  const moinsChere = comparables.length > 1
    ? comparables.reduce((m, o) => ((resumes.get(o.id)!.coutParVoyageur ?? Infinity) < (resumes.get(m.id)!.coutParVoyageur ?? Infinity) ? o : m))
    : null;
  const avecDuree = comparables.filter((o) => resumes.get(o.id)!.dureeMax != null);
  const plusRapide = avecDuree.length > 1
    ? avecDuree.reduce((m, o) => (resumes.get(o.id)!.dureeMax! < resumes.get(m.id)!.dureeMax! ? o : m))
    : null;

  const nomFoyer = (foyerId: string | null) =>
    foyerId ? [...personnes.values()].find((p) => p.foyer_id === foyerId)?.foyer_nom ?? 'Un foyer' : 'Un foyer';
  const memesLieux = (a: string, b: string) => {
    const x = a.trim().toLowerCase();
    const y = b.trim().toLowerCase();
    return x.includes(y) || y.includes(x);
  };

  const changerRetour = (option: OptionTrajet, different: boolean) =>
    alerte(
      different ? 'Prévoir un retour différent ?' : 'Revenir à un retour identique ?',
      different
        ? 'Chaque étape aller-retour devient une étape d’aller et une étape de retour, à modifier séparément (prix des billets coupé en deux).'
        : 'Les étapes du retour sont supprimées : l’aller sert aussi au retour, en sens inverse.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: different ? 'Séparer le retour' : 'Retour identique',
          style: different ? 'default' : 'destructive',
          onPress: () => {
            agir(() => (different ? separerRetour(option.id) : retourIdentique(option.id)));
            setSensVus((v) => ({ ...v, [option.id]: different ? 'retour' : 'aller' }));
          },
        },
      ]
    );

  // Une étape (commune, ou d'une branche de foyer avec compact) ; groupe :
  // les étapes parmi lesquelles on peut la monter ou la descendre.
  const ligneEtape = (
    t: Trajet,
    i: number,
    groupe: Trajet[],
    option: OptionTrajet | null,
    fil: boolean,
    compact = false,
    enBranche: Set<string> = new Set()
  ) => {
    const mode = MODES_TRAJET.find((m) => m.id === t.mode) ?? MODES_TRAJET[0];
    const modifiable = t.responsable === moiId || organisateur;
    const passagers = t.passagers.map((x) => x.personne_id);
    const foyers = new Set(passagers.map(foyerDe).filter(Boolean));
    // Ceux de mon foyer qui ont leur propre trajet dans l'option sont placés
    // selon leur rendez-vous : pas de « Nous aussi » pour eux.
    const absents = mesIds.filter((m) => !passagers.includes(m) && !enBranche.has(m));
    const presents = mesIds.filter((m) => passagers.includes(m));
    const trajetTexte =
      t.ville_depart || t.ville_arrivee ? `${t.ville_depart ?? '?'} → ${t.ville_arrivee ?? '?'}` : t.libelle || mode.libelle;
    const sensTexte = option?.retour_different ? '' : t.aller_retour ? ' · aller-retour' : ' · aller simple';
    return (
      <View key={t.id} style={styles.etape}>
        <View style={styles.etapeGauche}>
          <View style={[styles.numero, compact && styles.numeroCompact]}>
            <Ionicons name={mode.icone as any} size={compact ? 15 : 18} color={theme.colors.accent} />
          </View>
          {fil && <View style={styles.fil} />}
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Pressable
            onPress={modifiable ? () => navigation.navigate('Trajet', { voyageId: voyage.id, trajet: t }) : undefined}
            disabled={!modifiable}
            accessibilityRole={modifiable ? 'button' : undefined}
            accessibilityLabel={modifiable ? `Modifier l’étape ${trajetTexte}` : undefined}
          >
            <Text style={styles.etapeTitre}>
              {trajetTexte}
              {!compact && foyers.size > 1 ? <Text style={styles.commun}>  · en commun</Text> : null}
            </Text>
            {t.libelle && (t.ville_depart || t.ville_arrivee) ? <Text style={styles.detail}>{t.libelle}</Text> : null}
            <Text style={styles.detail}>
              {mode.libelle}
              {t.mode === 'voiture' && t.distance_km != null ? ` · ${String(t.distance_km).replace('.', ',')} km` : ''}
              {t.duree_minutes != null ? ` · ${formaterDuree(t.duree_minutes)}` : ''}
              {t.mode === 'voiture' && t.energie && !compact ? ` · ${infoEnergie(t.energie).libelle}` : ''}
              {sensTexte}
              {Number(t.cout_total) ? ` · ${formaterEuros(Number(t.cout_total))}` : ''}
            </Text>
            {Number(t.cout_total) > 0 && (
              <Text style={styles.paiement}>
                {paiementEtape(t) === 'commun'
                  ? 'Payé en commun'
                  : paiementEtape(t) === 'passagers'
                    ? 'Chaque passager sa part'
                    : `Payé par ${t.foyer_id ? personnesFoyer(t.foyer_id) : 'son foyer'}`}
              </Text>
            )}
            {!compact && <GroupeNoms prefixe="Avec" personnes={qui(passagers)} styleTexte={styles.detail} />}
          </Pressable>
          <View style={[styles.actionsEtape, compact && styles.actionsCompact]}>
            {!compact && absents.length > 0 && (
              <Pressable onPress={() => agir(() => rejoindreEtape(t.id, absents))} accessibilityRole="button" hitSlop={6}>
                <Text style={styles.lien}>
                  + {absents.length === mesIds.length ? 'Nous aussi' : `Ajouter ${absents.map(nom).join(', ')}`}
                </Text>
              </Pressable>
            )}
            {!compact && presents.length > 0 && t.responsable !== moiId && (
              <Pressable onPress={() => agir(() => quitterEtape(t.id, presents))} accessibilityRole="button" hitSlop={6}>
                <Text style={styles.lienDiscret}>Nous n’y serons pas</Text>
              </Pressable>
            )}
            {modifiable && groupe.length > 1 && option && (
              <View style={styles.fleches}>
                <Pressable
                  onPress={() => agir(() => deplacerEtape(t.id, -1))}
                  disabled={i === 0}
                  accessibilityRole="button"
                  accessibilityLabel={`Monter l’étape ${trajetTexte}`}
                  hitSlop={6}
                >
                  <Ionicons name="arrow-up" size={18} color={i === 0 ? theme.colors.border : theme.colors.textMuted} />
                </Pressable>
                <Pressable
                  onPress={() => agir(() => deplacerEtape(t.id, 1))}
                  disabled={i === groupe.length - 1}
                  accessibilityRole="button"
                  accessibilityLabel={`Descendre l’étape ${trajetTexte}`}
                  hitSlop={6}
                >
                  <Ionicons
                    name="arrow-down"
                    size={18}
                    color={i === groupe.length - 1 ? theme.colors.border : theme.colors.textMuted}
                  />
                </Pressable>
              </View>
            )}
          </View>
        </View>
      </View>
    );
  };

  // Les étapes d'un foyer jusqu'au rendez-vous (ou depuis, au retour ; ou
  // directement).
  const blocBranche = (b: Branche<Trajet>, option: OptionTrajet | null, sens: 'aller' | 'retour', lieu: string | null) => {
    const premiere = b.etapes[0];
    const derniere = b.etapes[b.etapes.length - 1];
    const auBonEndroit =
      !lieu ||
      !(sens === 'aller' ? derniere.ville_arrivee : premiere.ville_depart) ||
      memesLieux(lieu, (sens === 'aller' ? derniere.ville_arrivee : premiere.ville_depart)!);
    const cout = b.etapes.reduce((a, e) => a + Number(e.cout_total || 0), 0);
    const duree = b.etapes.every((e) => e.duree_minutes != null) ? b.etapes.reduce((a, e) => a + e.duree_minutes!, 0) : null;
    const monFoyer = b.foyer_id === (foyer?.id ?? null);
    return (
      <View key={b.cle} style={styles.branche} accessibilityLabel={`Trajet de ${nomFoyer(b.foyer_id)}`}>
        <Text style={styles.brancheTitre}>
          {nomFoyer(b.foyer_id)}
          <Text style={styles.detail}>
            {'  '}
            {[duree != null && b.etapes.length > 1 ? formaterDuree(duree) : null, cout && b.etapes.length > 1 ? formaterEuros(cout) : null]
              .filter(Boolean)
              .join(' · ')}
          </Text>
        </Text>
        <GroupeNoms personnes={qui(b.personnes)} styleTexte={styles.detail} />
        {b.etapes.map((e, i) => ligneEtape(e, i, b.etapes, option, i < b.etapes.length - 1, true))}
        {!auBonEndroit && (
          <Text style={styles.alerte}>
            {sens === 'aller'
              ? `Arrive à ${derniere.ville_arrivee}, le rendez-vous est à ${lieu}.`
              : `Repart de ${premiere.ville_depart}, on se sépare à ${lieu}.`}
          </Text>
        )}
        {option && (monFoyer || organisateur) && (
          <Pressable
            onPress={() =>
              navigation.navigate('Trajet', {
                voyageId: voyage.id,
                optionId: option.id,
                sens: option.retour_different ? sens : undefined,
                propreFoyer: true,
                foyerId: b.foyer_id,
                rejointId: b.rejoint_id,
                depart: derniere.ville_arrivee,
              })
            }
            accessibilityRole="button"
            hitSlop={6}
          >
            <Text style={styles.lien}>+ Une étape de plus</Text>
          </Pressable>
        )}
      </View>
    );
  };

  const ligneResume = (r: ResumeOption) =>
    [
      r.cout ? formaterEuros(r.cout) : 'Coût à préciser',
      r.coutParVoyageur != null && r.voyageurs > 1 ? `${formaterEuros(r.coutParVoyageur)} par voyageur` : null,
      r.dureeMax != null ? `${formaterDuree(r.dureeMax)}${r.dureeIncomplete ? ' et +' : ''} au plus long` : null,
      r.etapesPartagees ? `${r.etapesPartagees} étape${r.etapesPartagees > 1 ? 's' : ''} en commun` : null,
    ]
      .filter(Boolean)
      .join(' · ');

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.contenu} keyboardShouldPersistTaps="handled">
      {organisateur ? (
        <>
          <Text style={styles.libelle}>Mode de transport principal</Text>
          <Puces
            options={MODES_PRINCIPAUX}
            valeur={voyage.mode_transport}
            onChange={(m) => agir(() => choisirModeTransport(voyage.id, m))}
          />
        </>
      ) : voyage.mode_transport ? (
        <Text style={styles.intro}>
          Mode principal : {MODES_PRINCIPAUX.find((m) => m.id === voyage.mode_transport)?.libelle.toLowerCase()}
        </Text>
      ) : null}
      <Aide>
        Proposez une ou plusieurs façons d’y aller (en bateau, en avion…). Chacune se compose d’étapes en commun ;
        chaque foyer part de chez lui et rejoint le groupe à un rendez-vous, ou va directement.{' '}
        {organisateur ? 'Vous retenez celle qui compte dans le budget.' : 'Un organisateur retiendra celle qui compte dans le budget.'}
      </Aide>
      <Erreur texte={erreur} />

      {/* Comparatif */}
      {enLice.length > 1 && (
        <View style={styles.comparatif} accessibilityLabel="Comparatif des façons d’y aller">
          <Text style={styles.blocTitre}>Comparatif</Text>
          {enLice.map((o) => {
            const r = resumes.get(o.id)!;
            return (
              <View key={o.id} style={styles.comparatifLigne}>
                <View style={styles.comparatifNom}>
                  <View style={styles.modes}>
                    {r.modes.map((m) => (
                      <Ionicons key={m} name={iconeMode(m) as any} size={16} color={theme.colors.accent} />
                    ))}
                  </View>
                  <Text style={styles.comparatifTitre} numberOfLines={2}>
                    {o.statut === 'retenue' ? '★ ' : ''}
                    {o.nom}
                  </Text>
                </View>
                <View style={styles.comparatifChiffres}>
                  <Text style={[styles.chiffre, o === moinsChere && styles.meilleur]}>
                    {r.coutParVoyageur != null ? `${formaterEuros(r.coutParVoyageur)}/pers.` : '—'}
                  </Text>
                  <Text style={[styles.detail, o === plusRapide && styles.meilleur]}>
                    {r.dureeMax != null ? `${formaterDuree(r.dureeMax)}${r.dureeIncomplete ? ' +' : ''}` : 'durée ?'}
                  </Text>
                </View>
              </View>
            );
          })}
          <Text style={styles.legende}>
            Prix par voyageur (total partagé entre tous les passagers) et temps de trajet de la personne qui voyage le
            plus longtemps. En vert : le moins cher, le plus rapide.
          </Text>
        </View>
      )}

      <Bouton
        titre={options.length ? '+ Proposer une autre façon d’y aller' : '+ Proposer une façon d’y aller'}
        variante={options.length ? 'contour' : undefined}
        onPress={() => navigation.navigate('OptionTrajet', { voyageId: voyage.id })}
      />

      {groupes.length === 0 && (
        <MessageVide
          titre="Rien de prévu"
          texte="Proposez par exemple « En voiture », puis ajoutez les étapes : distance, carburant et péages sont calculés pour vous."
        />
      )}

      {groupes.map(({ option, etapes }) => {
        const r = resumes.get(option?.id ?? null)!;
        const id = option?.id ?? 'toutes';
        const ecartee = option?.statut === 'ecartee';
        const replie = ecartee && !ecarteesOuvertes.has(id);
        const modifiableOption = !!option && (option.propose_par === moiId || organisateur);
        const monAvis = option?.avis.find((a) => a.utilisateur_id === moiId)?.commentaire ?? '';
        const brouillon = commentaires[id] ?? monAvis;
        const sensVu: 'aller' | 'retour' = option?.retour_different ? sensVus[id] ?? 'aller' : 'aller';
        const vue = vueOption(etapes, sensVu);
        const enBranche = new Set([...vue.directes, ...[...vue.branches.values()].flat()].flatMap((b) => b.personnes));
        return (
          <View
            key={id}
            style={[styles.option, option?.statut === 'retenue' && styles.optionRetenue, ecartee && styles.optionEcartee]}
            accessibilityLabel={option ? `Option ${option.nom}` : 'Trajets'}
          >
            <View style={styles.optionHaut}>
              <Text style={styles.optionTitre}>{option?.nom ?? 'Trajets'}</Text>
              {option && (
                <Pastille
                  texte={STATUTS[option.statut]}
                  ton={option.statut === 'retenue' ? 'succes' : option.statut === 'ecartee' ? 'neutre' : 'accent'}
                />
              )}
            </View>
            {option?.description ? <Text style={styles.detail}>{option.description}</Text> : null}
            <Text style={styles.resume}>{ligneResume(r)}</Text>

            {replie ? (
              <Pressable
                onPress={() => setEcarteesOuvertes((s) => new Set(s).add(id))}
                accessibilityRole="button"
                hitSlop={6}
              >
                <Text style={styles.lien}>Voir les étapes</Text>
              </Pressable>
            ) : (
              <>
                {option?.retour_different && (
                  <Puces
                    options={[
                      { id: 'aller', libelle: 'Aller' },
                      { id: 'retour', libelle: 'Retour' },
                    ]}
                    valeur={sensVu}
                    onChange={(s) => setSensVus((v) => ({ ...v, [id]: s as 'aller' | 'retour' }))}
                  />
                )}

                {vue.tronc.map((t, i) => {
                  const arrivent = sensVu === 'aller' ? vue.branches.get(t.id) ?? [] : [];
                  const partent = sensVu === 'retour' ? vue.branches.get(t.id) ?? [] : [];
                  return (
                    <View key={t.id} style={{ gap: theme.spacing.xs }}>
                      {arrivent.length > 0 && (
                        <View style={styles.rdv}>
                          {arrivent.map((b) => blocBranche(b, option, sensVu, lieuRendezVous(t)))}
                          <Text style={styles.rdvTitre}>
                            <Ionicons name="flag-outline" size={15} color={theme.colors.success} /> Rendez-vous à {lieuRendezVous(t)}
                          </Text>
                        </View>
                      )}
                      {ligneEtape(t, i, vue.tronc, option, i < vue.tronc.length - 1 || partent.length > 0, false, enBranche)}
                      {partent.length > 0 && (
                        <View style={styles.rdv}>
                          <Text style={styles.rdvTitre}>
                            <Ionicons name="flag-outline" size={15} color={theme.colors.success} /> On se sépare à {lieuRendezVous(t)}
                          </Text>
                          {partent.map((b) => blocBranche(b, option, sensVu, lieuRendezVous(t)))}
                        </View>
                      )}
                    </View>
                  );
                })}

                {vue.directes.length > 0 && (
                  <View style={styles.rdv}>
                    <Text style={styles.rdvTitre}>
                      {sensVu === 'retour' ? 'Retour direct, sans le groupe' : vue.tronc.length ? 'Directement, sans le groupe' : 'Chacun de son côté'}
                    </Text>
                    {vue.directes.map((b) => blocBranche(b, option, sensVu, null))}
                  </View>
                )}

                {option && !option.retour_different && etapes.length > 0 && (
                  <View style={styles.retour}>
                    <Text style={styles.detail}>Retour : le même trajet, en sens inverse.</Text>
                    {modifiableOption && (
                      <Pressable onPress={() => changerRetour(option, true)} accessibilityRole="button" hitSlop={6}>
                        <Text style={styles.lien}>Prévoir un retour différent</Text>
                      </Pressable>
                    )}
                  </View>
                )}
                {option?.retour_different && modifiableOption && (
                  <Pressable onPress={() => changerRetour(option, false)} accessibilityRole="button" hitSlop={6}>
                    <Text style={styles.lienDiscret}>Revenir à un retour identique à l’aller</Text>
                  </Pressable>
                )}

                {(maPersonneId || organisateur) && (
                  <View style={styles.ajouts}>
                    <Bouton
                      titre={
                        vue.tronc.length
                          ? sensVu === 'retour'
                            ? '+ Étape du retour en commun'
                            : '+ Étape en commun'
                          : '+ Ajouter la première étape'
                      }
                      variante="pointille"
                      onPress={() =>
                        navigation.navigate('Trajet', {
                          voyageId: voyage.id,
                          optionId: option?.id ?? null,
                          sens: option?.retour_different ? sensVu : undefined,
                          depart: vue.tronc.length ? vue.tronc[vue.tronc.length - 1].ville_arrivee : null,
                        })
                      }
                    />
                    {option && (
                      <Bouton
                        titre={sensVu === 'retour' ? '+ Rentrer chez soi depuis le groupe' : '+ Rejoindre le groupe depuis chez soi'}
                        variante="pointille"
                        onPress={() =>
                          navigation.navigate('Trajet', {
                            voyageId: voyage.id,
                            optionId: option.id,
                            sens: option.retour_different ? sensVu : undefined,
                            propreFoyer: true,
                            rejointId: vue.tronc.length
                              ? (sensVu === 'retour' ? vue.tronc[vue.tronc.length - 1] : vue.tronc[0]).id
                              : null,
                          })
                        }
                      />
                    )}
                  </View>
                )}
                {option && etapes.length > 0 && sensVu === 'aller' && (
                  <Aide>
                    Chaque foyer part de chez lui : ajoutez son trajet jusqu’au rendez-vous (le départ d’une étape en
                    commun), ou directement jusqu’à destination. Ses passagers sont mis à bord des étapes en commun à
                    partir du rendez-vous.
                  </Aide>
                )}
                {r.sansPlace.length > 0 && etapes.length > 0 && (
                  <GroupeNoms prefixe="Pas encore de place pour :" personnes={qui(r.sansPlace)} styleTexte={styles.detail} />
                )}

                {/* Commentaires */}
                {option && (
                  <View style={styles.avis}>
                    {option.avis
                      .filter((a) => a.utilisateur_id !== moiId)
                      .map((a) => {
                        const auteur = [...personnes.values()].find((p) => p.utilisateur_id === a.utilisateur_id);
                        return (
                          <Text key={a.utilisateur_id} style={styles.detail}>
                            <Text style={styles.auteur}>{auteur?.prenom ?? 'Quelqu’un'} : </Text>
                            {a.commentaire}
                          </Text>
                        );
                      })}
                    {(maPersonneId || organisateur) && (
                      <View style={styles.avisSaisie}>
                        <View style={{ flex: 1 }}>
                          <Champ
                            value={brouillon}
                            onChangeText={(x) => setCommentaires((c) => ({ ...c, [id]: x }))}
                            placeholder="Votre avis (ex. Léo a le mal de mer)"
                            accessibilityLabel={`Votre avis sur ${option.nom}`}
                          />
                        </View>
                        {brouillon !== monAvis && (
                          <Bouton
                            titre="OK"
                            onPress={() =>
                              agir(async () => {
                                await commenterOption(option.id, brouillon);
                                setCommentaires((c) => {
                                  const n = { ...c };
                                  delete n[id];
                                  return n;
                                });
                              })
                            }
                          />
                        )}
                      </View>
                    )}
                  </View>
                )}

                {option && (organisateur || modifiableOption) && (
                  <View style={styles.actionsOption}>
                    {organisateur && option.statut !== 'retenue' && options.length > 1 && (
                      <Bouton titre="Retenir cette option" onPress={() => agir(() => retenirOption(option.id))} />
                    )}
                    {organisateur && option.statut === 'retenue' && options.length > 1 && (
                      <Bouton titre="Ne plus la retenir" variante="discret" onPress={() => agir(() => retenirOption(option.id, false))} />
                    )}
                    {modifiableOption && (
                      <Bouton
                        titre="Renommer ou supprimer"
                        variante="discret"
                        onPress={() => navigation.navigate('OptionTrajet', { voyageId: voyage.id, option })}
                      />
                    )}
                  </View>
                )}
              </>
            )}
          </View>
        );
      })}

      {retenue && options.length > 1 && (
        <Text style={styles.detail}>Seule l’option retenue (« {retenue.nom} ») compte dans le budget.</Text>
      )}
      {!retenue && enLice.length > 1 && (
        <Text style={styles.detail}>Tant qu’aucune option n’est retenue, le budget prend la moins chère.</Text>
      )}
    </ScrollView>
  );
}

const styles = creerStylesThemes(() => ({
  flex: { flex: 1, backgroundColor: theme.colors.background },
  contenu: { padding: theme.spacing.md, gap: theme.spacing.sm, paddingBottom: theme.spacing.xl },
  libelle: { fontFamily: theme.fontBodyBold, fontSize: 15, color: theme.colors.text },
  intro: { fontFamily: theme.fontBody, fontSize: 15, color: theme.colors.textMuted },
  blocTitre: { fontFamily: theme.fontBodyBold, fontSize: 16, color: theme.colors.text },
  comparatif: {
    gap: theme.spacing.xs,
    padding: theme.spacing.md,
    borderRadius: theme.radii.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  comparatifLigne: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingVertical: 6,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  comparatifNom: { flex: 1, gap: 2 },
  comparatifTitre: { fontFamily: theme.fontBodyBold, fontSize: 15, color: theme.colors.text },
  comparatifChiffres: { alignItems: 'flex-end', gap: 2 },
  modes: { flexDirection: 'row', gap: 4 },
  chiffre: { fontFamily: theme.fontBodyBold, fontSize: 15, color: theme.colors.text },
  meilleur: { color: theme.colors.success, fontFamily: theme.fontBodyBold },
  legende: { fontFamily: theme.fontBody, fontSize: 12, color: theme.colors.textMuted },
  option: {
    gap: theme.spacing.xs,
    padding: theme.spacing.md,
    borderRadius: theme.radii.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  optionRetenue: { borderColor: theme.colors.success, borderWidth: 2 },
  optionEcartee: { opacity: 0.75 },
  optionHaut: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacing.sm },
  optionTitre: { flex: 1, fontFamily: theme.fontTitle, fontSize: 20, color: theme.colors.text },
  resume: { fontFamily: theme.fontBodyBold, fontSize: 14, color: theme.colors.text },
  etape: { flexDirection: 'row', gap: theme.spacing.sm, marginTop: theme.spacing.xs },
  etapeGauche: { alignItems: 'center', width: 34 },
  numeroCompact: { width: 28, height: 28, borderRadius: 14 },
  numero: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.accentTransparent,
  },
  fil: { flex: 1, width: 2, backgroundColor: theme.colors.border, marginTop: 2 },
  etapeTitre: { fontFamily: theme.fontBodyBold, fontSize: 15, color: theme.colors.text },
  commun: { fontFamily: theme.fontBodyBold, fontSize: 13, color: theme.colors.success },
  paiement: { fontFamily: theme.fontBody, fontSize: 13, color: theme.colors.accent },
  detail: { fontFamily: theme.fontBody, fontSize: 14, color: theme.colors.textMuted },
  actionsCompact: { minHeight: 0 },
  rdv: { gap: theme.spacing.xs, marginTop: theme.spacing.xs },
  rdvTitre: { fontFamily: theme.fontBodyBold, fontSize: 14, color: theme.colors.success },
  branche: {
    gap: 2,
    marginLeft: theme.spacing.md,
    paddingLeft: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    borderLeftWidth: 3,
    borderLeftColor: theme.colors.accentTransparent,
  },
  brancheTitre: { fontFamily: theme.fontBodyBold, fontSize: 15, color: theme.colors.text },
  alerte: { fontFamily: theme.fontBody, fontSize: 13, color: theme.colors.warning },
  retour: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: theme.spacing.sm, marginTop: theme.spacing.xs },
  ajouts: { gap: theme.spacing.xs },
  actionsEtape: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: theme.spacing.md, minHeight: 28 },
  fleches: { flexDirection: 'row', gap: theme.spacing.md, marginLeft: 'auto' },
  lien: { fontFamily: theme.fontBodyBold, fontSize: 14, color: theme.colors.accent },
  lienDiscret: { fontFamily: theme.fontBody, fontSize: 14, color: theme.colors.textMuted, textDecorationLine: 'underline' },
  avis: { gap: 4, marginTop: theme.spacing.xs, paddingTop: theme.spacing.xs, borderTopWidth: 1, borderTopColor: theme.colors.border },
  avisSaisie: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
  auteur: { fontFamily: theme.fontBodyBold, color: theme.colors.text },
  actionsOption: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm, marginTop: theme.spacing.xs },
}));
