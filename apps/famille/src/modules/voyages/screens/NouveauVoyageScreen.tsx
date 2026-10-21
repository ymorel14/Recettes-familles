import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, ScrollView, Linking } from 'react-native';
import { theme, creerStylesThemes } from '../theme/theme';
import { useAuth } from '../contexts/AuthContext';
import { listerPersonnes, type Personne } from '../services/personnes';
import {
  anneeParDefaut,
  creerVoyage,
  messageErreurVoyage,
  PARTICIPATIONS,
  PERIODES,
  TYPES_SEJOUR,
  type NatureVoyage,
  type Participation,
  type Periode,
  type TypeSejour,
} from '../services/voyage';
import { Aide, CarteChoix, CaseACocher, Champ, Erreur, Libelle, Puces } from '../components/formulaire';
import { Bouton, Chargement } from '../components/ui';
import { BandeauBrouillon, BoutonAssistant, ChargementAssistant, Etincelle, MessageAssistant } from '../../../composants/assistant';
import { ErreurAssistant, messageErreurAssistant } from '../../../services/assistant';
import {
  creerPropositions,
  demanderBrouillon,
  texteProgrammeEtBudget,
  type BrouillonVoyage,
} from '../../../services/brouillonVoyage';

// Proposer un voyage : destination connue ou non, période, type de séjour,
// nombre de nuits estimé, et qui participe (toute la famille, en amoureux,
// ou quelques personnes choisies).
export default function NouveauVoyageScreen({ navigation, route }: any) {
  const { session, famille, foyersFamille, foyer } = useAuth();
  const moiId = session?.user.id ?? '';

  const [personnes, setPersonnes] = useState<Personne[] | null>(null);
  const [nature, setNature] = useState<NatureVoyage>(route?.params?.nature ?? 'voyage');
  const repas = nature === 'repas';
  // Repas : chez un foyer de la famille, ailleurs (adresse, restaurant) ou à décider.
  const [hote, setHote] = useState<string>(foyer?.id ?? 'decider');
  const [titre, setTitre] = useState('');
  const [destinationConnue, setDestinationConnue] = useState(false);
  const [destination, setDestination] = useState('');
  const [periode, setPeriode] = useState<Periode>('ete');
  const [annee, setAnnee] = useState(String(anneeParDefaut('ete')));
  const [typeSejour, setTypeSejour] = useState<TypeSejour>('vacances');
  const [nuits, setNuits] = useState('7');
  const [participation, setParticipation] = useState<Participation>('famille');
  const [invites, setInvites] = useState<Set<string>>(new Set());
  const [description, setDescription] = useState('');
  // Surprise : on choisit à qui la garder juste après la création.
  const [surprise, setSurprise] = useState(false);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  // Avec l'assistant (spécification § 4.5.1) : une phrase → brouillon qui
  // pré-remplit le formulaire, plus des propositions (dates, hébergements,
  // activités) à cocher, créées avec le voyage.
  const [demande, setDemande] = useState('');
  const [lecture, setLecture] = useState(false);
  const [erreurAssistant, setErreurAssistant] = useState<ErreurAssistant | null>(null);
  const [brouillon, setBrouillon] = useState<BrouillonVoyage | null>(null);
  const [garder, setGarder] = useState<{ dates: boolean[]; hebergements: boolean[]; activites: boolean[] }>({
    dates: [],
    hebergements: [],
    activites: [],
  });
  const annulation = useRef<AbortController | null>(null);

  const preparerBrouillon = async () => {
    const texte = demande.trim();
    if (texte.length < 8) return setErreurAssistant(new ErreurAssistant('entree', 'Décrivez le voyage : où, quand, avec qui.'));
    const controle = new AbortController();
    annulation.current = controle;
    setLecture(true);
    setErreurAssistant(null);
    try {
      const b = await demanderBrouillon(texte, participation === 'famille' ? [] : [...invites], controle.signal);
      if (controle.signal.aborted) return;
      setBrouillon(b);
      setGarder({ dates: b.dates.map(() => true), hebergements: b.hebergements.map(() => true), activites: b.activites.map(() => true) });
      // Pré-remplit le formulaire : tout reste modifiable.
      setTitre(b.titre);
      if (b.destination) {
        setDestinationConnue(true);
        setDestination(b.destination);
      }
      if (PERIODES.some((x) => x.id === b.periode)) setPeriode(b.periode as Periode);
      if (b.annee) setAnnee(String(b.annee));
      if (TYPES_SEJOUR.some((x) => x.id === b.type_sejour)) setTypeSejour(b.type_sejour as TypeSejour);
      if (b.nb_nuits != null) setNuits(String(b.nb_nuits));
      const extra = texteProgrammeEtBudget(b);
      if (extra) setDescription((d) => (d.trim() ? `${d.trim()}\n\n${extra}` : extra));
    } catch (e) {
      if (controle.signal.aborted) return;
      setErreurAssistant(e instanceof ErreurAssistant ? e : new ErreurAssistant('indisponible', messageErreurAssistant(e)));
    } finally {
      if (!controle.signal.aborted) setLecture(false);
    }
  };

  const basculerGarde = (cle: 'dates' | 'hebergements' | 'activites', i: number) =>
    setGarder((g) => ({ ...g, [cle]: g[cle].map((v, j) => (j === i ? !v : v)) }));

  useEffect(() => {
    listerPersonnes(foyersFamille)
      .then(setPersonnes)
      .catch(() => setPersonnes([]));
  }, [foyersFamille]);

  // Les autres personnes de la famille, regroupées par foyer.
  const autres = useMemo(() => (personnes ?? []).filter((p) => p.utilisateur_id !== moiId), [personnes, moiId]);
  const parFoyer = useMemo(() => {
    const groupes = new Map<string, Personne[]>();
    for (const p of autres) {
      const cle = p.foyer_nom ?? 'Sans foyer';
      groupes.set(cle, [...(groupes.get(cle) ?? []), p]);
    }
    return [...groupes.entries()];
  }, [autres]);

  const choisirPeriode = (p: Periode) => {
    setPeriode(p);
    setAnnee(String(anneeParDefaut(p)));
  };

  const choisirType = (t: TypeSejour) => {
    setTypeSejour(t);
    const n = TYPES_SEJOUR.find((x) => x.id === t)?.nuitsParDefaut;
    if (n != null) setNuits(String(n));
  };

  const choisirParticipation = (p: Participation) => {
    setParticipation(p);
    setInvites(new Set());
  };

  const basculerInvite = (id: string) => {
    setInvites((actuels) => {
      if (participation === 'amoureux') return new Set(actuels.has(id) ? [] : [id]);
      const suivants = new Set(actuels);
      if (suivants.has(id)) suivants.delete(id);
      else suivants.add(id);
      return suivants;
    });
  };

  const foyersFamilleNoms = useMemo(() => {
    const vus = new Map<string, string>();
    for (const p of personnes ?? []) if (p.foyer_id && p.foyer_nom) vus.set(p.foyer_id, p.foyer_nom);
    return [...vus.entries()].map(([id, nom]) => ({ id, libelle: `Chez ${nom}` }));
  }, [personnes]);

  const valider = async () => {
    setErreur(null);
    if (repas) return validerRepas();
    const titreNet = titre.trim() || (destinationConnue && destination.trim()) || '';
    if (!titreNet) return setErreur('Donnez un nom au voyage (ou une destination).');
    if (destinationConnue && !destination.trim()) return setErreur('Indiquez la destination, ou choisissez « Pas encore ».');
    const anneeNombre = annee.trim() ? Number(annee) : null;
    if (anneeNombre !== null && (!Number.isInteger(anneeNombre) || anneeNombre < 2000 || anneeNombre > 2100)) {
      return setErreur('Année invalide.');
    }
    const nuitsNombre = nuits.trim() ? Number(nuits) : null;
    if (nuitsNombre !== null && (!Number.isInteger(nuitsNombre) || nuitsNombre < 0 || nuitsNombre > 365)) {
      return setErreur('Nombre de nuits invalide.');
    }
    if (participation === 'amoureux' && invites.size !== 1) return setErreur('Choisissez la personne qui part avec vous.');
    if (participation === 'selection' && invites.size === 0) return setErreur('Choisissez au moins une personne.');
    if (!famille) return;

    setEnCours(true);
    try {
      const id = await creerVoyage(
        {
          famille_id: famille.id,
          titre: titreNet,
          destination: destinationConnue ? destination.trim() : null,
          pays: null,
          periode,
          annee: anneeNombre,
          type_sejour: typeSejour,
          nb_nuits: nuitsNombre,
          participation,
          description: description.trim() || null,
          nature: 'voyage',
          foyer_hote: null,
        },
        [...invites]
      );
      // Propositions de l'assistant retenues : créées comme les autres.
      if (brouillon) {
        await creerPropositions(id, {
          dates: brouillon.dates.filter((_d, i) => garder.dates[i]),
          hebergements: brouillon.hebergements.filter((_h, i) => garder.hebergements[i]),
          activites: brouillon.activites.filter((_a, i) => garder.activites[i]),
        }).catch(() => 0);
      }
      navigation.replace('Voyage', { voyageId: id });
      if (surprise) navigation.navigate('Surprise', { voyageId: id });
    } catch (e) {
      setErreur(messageErreurVoyage(e));
      setEnCours(false);
    }
  };

  const validerRepas = async () => {
    if (!titre.trim()) return setErreur('Donnez un nom au repas (ex. « Noël chez Mamie »).');
    if (hote === 'ailleurs' && !destination.trim()) return setErreur('Indiquez le lieu, ou choisissez « À décider ».');
    const anneeNombre = annee.trim() ? Number(annee) : null;
    if (anneeNombre !== null && (!Number.isInteger(anneeNombre) || anneeNombre < 2000 || anneeNombre > 2100)) {
      return setErreur('Année invalide.');
    }
    if (participation === 'amoureux' && invites.size !== 1) return setErreur('Choisissez la personne invitée.');
    if (participation === 'selection' && invites.size === 0) return setErreur('Choisissez au moins une personne.');
    if (!famille) return;
    setEnCours(true);
    try {
      const id = await creerVoyage(
        {
          famille_id: famille.id,
          titre: titre.trim(),
          destination: hote === 'ailleurs' ? destination.trim() : null,
          pays: null,
          periode,
          annee: anneeNombre,
          type_sejour: 'autre',
          nb_nuits: 0,
          participation,
          description: description.trim() || null,
          nature: 'repas',
          foyer_hote: hote !== 'ailleurs' && hote !== 'decider' ? hote : null,
        },
        [...invites]
      );
      navigation.replace('Voyage', { voyageId: id });
      if (surprise) navigation.navigate('Surprise', { voyageId: id });
    } catch (e) {
      setErreur(messageErreurVoyage(e));
      setEnCours(false);
    }
  };

  if (personnes === null) return <Chargement />;

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.contenu} keyboardShouldPersistTaps="handled">
      <Libelle>Quoi ?</Libelle>
      <Puces
        options={[
          { id: 'voyage', libelle: 'Un voyage' },
          { id: 'repas', libelle: 'Un repas de famille' },
        ]}
        valeur={nature}
        onChange={(n: NatureVoyage) => setNature(n)}
      />

      {!repas && (
        <View style={styles.assistant}>
          <View style={styles.assistantEntete}>
            <Etincelle couleur={theme.colors.accent} />
            <Text style={styles.sousTitre}>Avec l’assistant</Text>
          </View>
          {lecture ? (
            <ChargementAssistant
              etapes={['Je regarde le calendrier…', 'Je cherche des hébergements…', 'Je choisis des activités…', 'Je prépare le programme…', 'Presque fini…']}
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
                placeholder="Ex. Organise-nous un week-end en Bretagne en novembre, pas trop cher"
                accessibilityLabel="Demande à l’assistant"
              />
              <BoutonAssistant titre={brouillon ? 'Refaire un brouillon' : 'Préparer un brouillon'} onPress={preparerBrouillon} couleur={theme.colors.accent} />
              <Aide>
                Il regarde le calendrier commun et cherche des hébergements réels. Rien n’est créé avant « Proposer ce voyage ».
              </Aide>
            </>
          )}
          {erreurAssistant && <MessageAssistant message={erreurAssistant.message} pause={erreurAssistant.code === 'plafond'} />}
          {brouillon && !lecture && (
            <View style={styles.brouillon}>
              <BandeauBrouillon couleur={theme.colors.accent} />
              {brouillon.question ? <Text style={styles.texte}>{brouillon.question}</Text> : null}
              {brouillon.dates.length > 0 && (
                <>
                  <Text style={styles.foyer}>Dates à proposer au sondage</Text>
                  {brouillon.dates.map((d, i) => (
                    <CaseACocher
                      key={`d${i}`}
                      coche={!!garder.dates[i]}
                      onChange={() => basculerGarde('dates', i)}
                      libelle={plage(d.debut, d.fin)}
                      aide={d.raison ?? undefined}
                    />
                  ))}
                </>
              )}
              {brouillon.hebergements.length > 0 && (
                <>
                  <Text style={styles.foyer}>Hébergements</Text>
                  {brouillon.hebergements.map((h, i) => (
                    <View key={`h${i}`}>
                      <CaseACocher
                        coche={!!garder.hebergements[i]}
                        onChange={() => basculerGarde('hebergements', i)}
                        libelle={[h.nom, h.ville].filter(Boolean).join(' · ')}
                        aide={[
                          h.capacite ? `${h.capacite} couchages` : null,
                          h.prix_total != null ? `${h.prix_total} € le séjour` : h.prix_nuit != null ? `${h.prix_nuit} € la nuit` : null,
                        ]
                          .filter(Boolean)
                          .join(' · ') || undefined}
                      />
                      <Text style={styles.lien} onPress={() => Linking.openURL(h.lien)} accessibilityRole="link">
                        Voir l’annonce
                      </Text>
                    </View>
                  ))}
                </>
              )}
              {brouillon.activites.length > 0 && (
                <>
                  <Text style={styles.foyer}>Activités</Text>
                  {brouillon.activites.map((a, i) => (
                    <CaseACocher
                      key={`a${i}`}
                      coche={!!garder.activites[i]}
                      onChange={() => basculerGarde('activites', i)}
                      libelle={a.titre}
                      aide={a.description ?? undefined}
                    />
                  ))}
                </>
              )}
              {brouillon.ecartes.hebergements > 0 && (
                <Aide>
                  {brouillon.ecartes.hebergements === 1 ? 'Un hébergement écarté' : `${brouillon.ecartes.hebergements} hébergements écartés`} :
                  lien introuvable dans les recherches.
                </Aide>
              )}
              <Aide>Le formulaire ci-dessous est pré-rempli (programme et budget dans le mot aux invités) : vérifiez-le avant de proposer le voyage.</Aide>
            </View>
          )}
        </View>
      )}

      {repas ? (
        <>
          <Libelle nativeID="libelle-titre-repas">Nom du repas</Libelle>
          <Champ
            value={titre}
            onChangeText={setTitre}
            placeholder="Ex. Noël chez Mamie, les 80 ans de Papi…"
            accessibilityLabelledBy="libelle-titre-repas"
          />
          <Libelle>Où ?</Libelle>
          <Puces
            options={[...foyersFamilleNoms, { id: 'ailleurs', libelle: 'Ailleurs' }, { id: 'decider', libelle: 'À décider' }]}
            valeur={hote}
            onChange={setHote}
          />
          {hote === 'ailleurs' && (
            <Champ
              value={destination}
              onChangeText={setDestination}
              placeholder="Ex. Restaurant Le Relais, salle des fêtes…"
              accessibilityLabel="Lieu du repas"
            />
          )}
          <Libelle>Quand ?</Libelle>
          <Puces options={PERIODES} valeur={periode} onChange={choisirPeriode} />
          <Libelle nativeID="libelle-annee-repas">Année</Libelle>
          <Champ value={annee} onChangeText={setAnnee} keyboardType="number-pad" accessibilityLabelledBy="libelle-annee-repas" />
          <Aide>Le jour exact se choisira ensuite avec un sondage, d'après le calendrier de chacun.</Aide>
        </>
      ) : (
      <>
      <Libelle>Destination</Libelle>
      <Puces
        options={[
          { id: 'non', libelle: 'Pas encore' },
          { id: 'oui', libelle: 'Je la connais' },
        ]}
        valeur={destinationConnue ? 'oui' : 'non'}
        onChange={(v) => setDestinationConnue(v === 'oui')}
      />
      {destinationConnue ? (
        <Champ
          value={destination}
          onChangeText={setDestination}
          placeholder="Ex. Puy du Fou, Venise, Bretagne…"
          accessibilityLabel="Destination"
        />
      ) : (
        <Aide>On se retrouve d'abord ; la destination se choisira ensemble.</Aide>
      )}

      <Libelle nativeID="libelle-titre">Nom du voyage</Libelle>
      <Champ
        value={titre}
        onChangeText={setTitre}
        placeholder={destinationConnue && destination.trim() ? destination.trim() : 'Ex. Retrouvailles de l’été'}
        accessibilityLabelledBy="libelle-titre"
      />

      <Libelle>Quand ?</Libelle>
      <Puces options={PERIODES} valeur={periode} onChange={choisirPeriode} />
      <View style={styles.ligne}>
        <View style={styles.colonne}>
          <Libelle nativeID="libelle-annee">Année</Libelle>
          <Champ value={annee} onChangeText={setAnnee} keyboardType="number-pad" accessibilityLabelledBy="libelle-annee" />
        </View>
        <View style={styles.colonne}>
          <Libelle nativeID="libelle-nuits">Nuits (estimation)</Libelle>
          <Champ value={nuits} onChangeText={setNuits} keyboardType="number-pad" accessibilityLabelledBy="libelle-nuits" />
        </View>
      </View>
      <Aide>Les dates exactes se choisiront ensuite avec un sondage, d'après le calendrier de chacun.</Aide>

      <Libelle>Type de séjour</Libelle>
      <Puces options={TYPES_SEJOUR} valeur={typeSejour} onChange={choisirType} />
      </>
      )}

      <Libelle>Avec qui ?</Libelle>
      {PARTICIPATIONS.map((p) => (
        <CarteChoix
          key={p.id}
          actif={participation === p.id}
          onPress={() => choisirParticipation(p.id)}
          titre={p.libelle}
          aide={p.aide}
        />
      ))}

      {participation !== 'famille' && (
        <View style={styles.invites}>
          <Text style={styles.sousTitre}>
            {participation === 'amoureux' ? 'Qui part avec vous ?' : 'Qui invitez-vous ?'}
          </Text>
          {parFoyer.length === 0 && <Aide>Personne d'autre dans la famille pour l'instant.</Aide>}
          {parFoyer.map(([foyerNom, membres]) => (
            <View key={foyerNom} style={styles.groupe}>
              <Text style={styles.foyer}>{foyerNom}</Text>
              {membres.map((p) => (
                <CaseACocher
                  key={p.id}
                  coche={invites.has(p.id)}
                  onChange={() => basculerInvite(p.id)}
                  libelle={p.prenom}
                  personneId={p.id}
                  aide={p.utilisateur_id ? undefined : 'Sans compte : son foyer répondra pour lui'}
                />
              ))}
            </View>
          ))}
        </View>
      )}

      <Libelle nativeID="libelle-description">Un mot pour les invités (facultatif)</Libelle>
      <Champ
        value={description}
        onChangeText={setDescription}
        multiline
        placeholder="Ex. Et si on se retrouvait tous une semaine cet été ?"
        accessibilityLabelledBy="libelle-description"
      />

      <CaseACocher
        coche={surprise}
        onChange={setSurprise}
        libelle="C’est une surprise"
        aide={
          repas
            ? 'Ensuite, vous choisirez qui est fêté (il saura seulement la date et le lieu) et à qui tout cacher.'
            : 'Ensuite, vous choisirez à qui cacher ce voyage : il ne le verra pas, même s’il fait partie du voyage.'
        }
      />

      <Erreur texte={erreur} />
      <Bouton titre={repas ? 'Proposer ce repas' : 'Proposer ce voyage'} onPress={valider} enCours={enCours} style={styles.bouton} />
    </ScrollView>
  );
}

const styles = creerStylesThemes(() => ({
  flex: { flex: 1, backgroundColor: theme.colors.background },
  contenu: { padding: theme.spacing.md, gap: theme.spacing.sm, paddingBottom: theme.spacing.xl },
  ligne: { flexDirection: 'row', gap: theme.spacing.md },
  colonne: { flex: 1, gap: theme.spacing.sm },
  invites: {
    gap: theme.spacing.xs,
    padding: theme.spacing.md,
    borderRadius: theme.radii.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  sousTitre: { fontFamily: theme.fontBodyBold, fontSize: 15, color: theme.colors.text },
  groupe: { gap: 2, marginTop: theme.spacing.xs },
  foyer: {
    fontFamily: theme.fontBodyBold,
    fontSize: 12,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: theme.colors.textMuted,
  },
  bouton: { marginTop: theme.spacing.md },
  assistant: {
    gap: theme.spacing.sm,
    padding: theme.spacing.md,
    borderRadius: theme.radii.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  assistantEntete: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  brouillon: { gap: theme.spacing.xs },
  texte: { fontFamily: theme.fontBody, fontSize: 15, color: theme.colors.text },
  lien: {
    fontFamily: theme.fontBody,
    fontSize: 14,
    color: theme.colors.accent,
    textDecorationLine: 'underline',
    marginLeft: 36,
    marginBottom: theme.spacing.xs,
  },
}));

// « Du sam. 7 au dim. 8 novembre »
function plage(debut: string, fin: string): string {
  const d = (iso: string, mois: boolean) =>
    new Date(`${iso}T12:00:00`).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', ...(mois ? { month: 'long' } : {}) });
  return debut === fin ? `Le ${d(debut, true)}` : `Du ${d(debut, debut.slice(5, 7) !== fin.slice(5, 7))} au ${d(fin, true)}`;
}
