import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, Linking, Pressable } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { theme, creerStylesThemes } from '../theme/theme';
import { useAuth } from '../contexts/AuthContext';
import { alerte } from '../utils/alerte';
import { listerPersonnesParIds, type Personne } from '../services/personnes';
import { formaterEuros, lireDecimal, lireMontant, listerHebergements } from '../services/hebergements';
import { coutTrajet, paiementEtape, type PaiementEtape } from '../services/budget';
import {
  calculerTrajet,
  enregistrerTrajet,
  ENERGIES,
  formaterDuree,
  infoEnergie,
  lienPeages,
  lireAdresseFoyer,
  villeDe,
  listerOptions,
  listerTrajets,
  listerVehicules,
  rangerEtapes,
  MODES_TRAJET,
  sitesBillets,
  supprimerTrajet,
  type CalculTrajet,
  type ModeTrajet,
  type OptionTrajet,
  type Trajet,
} from '../services/transport';
import { etapesDe, lieuRendezVous, lireDuree, vueOption } from '../services/optionsTrajet';
import {
  estOrganisateur,
  mesPersonnes,
  messageErreurVoyage,
  obtenirVoyage,
  type Energie,
  type Vehicule,
  type VoyageAvecParticipants,
} from '../services/voyage';
import { Aide, CaseACocher, Champ, Erreur, Libelle, Puces } from '../components/formulaire';
import { Bouton, Chargement } from '../components/ui';

const texte = (n: number | null | undefined) => (n == null ? '' : String(n).replace('.', ','));

// Ajouter ou modifier un trajet : en voiture (calcul de la distance, du
// carburant et des péages) ou en train, avion, bateau, bus (prix des billets).
export default function TrajetFormScreen({ route, navigation }: any) {
  const voyageId: string = route.params?.voyageId;
  const existant: Trajet | undefined = route.params?.trajet;
  // Étape d'une option de trajet (« En bateau », « En avion »…) ; départ
  // proposé : l'arrivée de l'étape précédente.
  const optionId: string | null = existant?.option_id ?? route.params?.optionId ?? null;
  const departPrecedent: string | null = route.params?.depart ?? null;
  const { session, foyer } = useAuth();
  const moiId = session?.user.id ?? '';
  // Étape propre à un foyer (pour rejoindre le groupe à un rendez-vous, ou
  // directement), hors de l'enchaînement commun de l'option.
  const [propre, setPropre] = useState<boolean>(existant?.propre_foyer ?? route.params?.propreFoyer ?? false);
  const [foyerBranche, setFoyerBranche] = useState<string | null>(existant?.foyer_id ?? route.params?.foyerId ?? foyer?.id ?? null);
  const [rejoint, setRejoint] = useState<string | null>(
    existant ? existant.rejoint_id ?? null : route.params?.rejointId ?? null
  );
  const [option, setOption] = useState<OptionTrajet | null>(null);
  const [etapesOption, setEtapesOption] = useState<Trajet[]>([]);
  // Option à retour différent : étape de l'aller ou du retour.
  const sensFixe: 'aller' | 'retour' = existant?.sens === 'retour' || (!existant && route.params?.sens === 'retour') ? 'retour' : 'aller';
  const retourDifferent = option?.retour_different ?? (!!route.params?.sens || existant?.sens === 'retour');

  const [voyage, setVoyage] = useState<VoyageAvecParticipants | null>(null);
  const [invites, setInvites] = useState<Personne[]>([]);
  const [vehicules, setVehicules] = useState<Vehicule[]>([]);

  const [mode, setMode] = useState<ModeTrajet>(existant?.mode ?? 'voiture');
  const [libelle, setLibelle] = useState(existant?.libelle ?? '');
  const [vehiculeId, setVehiculeId] = useState<string>(existant?.vehicule_id ?? 'autre');
  const [depart, setDepart] = useState(existant?.ville_depart ?? '');
  const [arrivee, setArrivee] = useState(existant?.ville_arrivee ?? '');
  const [calcul, setCalcul] = useState<CalculTrajet | null>(null);
  // Départ / arrivée du dernier calcul : s'ils ont changé depuis, le calcul
  // (ville, durée) ne vaut plus.
  const [calculPour, setCalculPour] = useState<string | null>(null);
  const [itineraire, setItineraire] = useState<'rapide' | 'sans'>('rapide');
  const [distance, setDistance] = useState(texte(existant?.distance_km));
  const [duree, setDuree] = useState<number | null>(existant?.duree_minutes ?? null);
  // Durée saisie à la main (train, avion, bateau…).
  const [dureeTexte, setDureeTexte] = useState(existant?.duree_minutes != null ? formaterDuree(existant.duree_minutes) : '');
  const [energie, setEnergie] = useState<Energie>(existant?.energie ?? 'gazole');
  const [consommation, setConsommation] = useState(texte(existant?.consommation ?? infoEnergie('gazole').consommation));
  const [prixUnitaire, setPrixUnitaire] = useState(texte(existant?.prix_unitaire ?? infoEnergie('gazole').prix));
  const [peages, setPeages] = useState(texte(existant?.peages));
  const [allerRetour, setAllerRetour] = useState(existant?.aller_retour ?? true);
  const [prixBillets, setPrixBillets] = useState(texte(existant?.prix_billets));
  const [lien, setLien] = useState(existant?.lien ?? '');
  // Qui paie l'étape ; vide = selon le mode (voiture : son foyer ; sinon en commun).
  const [paiement, setPaiement] = useState<PaiementEtape | null>(existant?.paiement ?? null);
  const [passagers, setPassagers] = useState<Set<string>>(new Set(existant?.passagers.map((p) => p.personne_id) ?? []));
  const [calculEnCours, setCalculEnCours] = useState(false);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [sansAdresse, setSansAdresse] = useState(false);

  useEffect(() => {
    const retourTitre = sensFixe === 'retour' && (existant?.sens === 'retour' || route.params?.sens === 'retour');
    navigation.setOptions({
      title: existant
        ? 'Modifier l’étape'
        : propre
          ? retourTitre
            ? 'Rentrer chez soi'
            : 'Rejoindre le groupe'
          : optionId
            ? retourTitre
              ? 'Étape du retour'
              : 'Ajouter une étape'
            : 'Mon trajet',
    });
    (async () => {
      try {
        const [v, hebergements, vs, adresseFoyer, options, trajets] = await Promise.all([
          obtenirVoyage(voyageId),
          listerHebergements(voyageId),
          listerVehicules(foyer ? [foyer.id] : []),
          foyer ? lireAdresseFoyer(foyer.id).catch(() => null) : Promise.resolve(null),
          optionId ? listerOptions(voyageId) : Promise.resolve([]),
          optionId ? listerTrajets(voyageId) : Promise.resolve([]),
        ]);
        const attendus = v.participants.filter((p) => p.reponse !== 'decline').map((p) => p.personne_id);
        const liste = await listerPersonnesParIds(attendus);
        const etapes = etapesDe(optionId, trajets);
        setVoyage(v);
        setInvites(liste);
        setVehicules(vs);
        setOption(options.find((o) => o.id === optionId) ?? null);
        setEtapesOption(etapes);
        if (!existant) {
          if (v.mode_transport && v.mode_transport !== 'mixte') setMode(v.mode_transport as ModeTrajet);
          const retenu = hebergements.find((h) => h.statut === 'retenu');
          const lieuSejour = retenu ? [retenu.adresse, retenu.ville].filter(Boolean).join(', ') || retenu.nom : v.destination ?? '';
          const auRetour = route.params?.sens === 'retour';
          const rdv = etapes.find((e) => e.id === route.params?.rejointId) ?? null;
          const foyerVise = route.params?.foyerId ?? foyer?.id ?? null;
          const chezMoi = foyerVise === (foyer?.id ?? null) ? adresseFoyer : null;
          let departParDefaut: string | null;
          let arriveeParDefaut: string | null;
          if (auRetour) {
            departParDefaut = departPrecedent ?? (propre && rdv ? rdv.ville_arrivee : lieuSejour);
            arriveeParDefaut = propre ? chezMoi : null;
          } else {
            departParDefaut = departPrecedent ?? chezMoi;
            arriveeParDefaut = propre && rdv ? rdv.ville_depart : lieuSejour;
            if (!adresseFoyer && !departPrecedent && foyerVise === (foyer?.id ?? null)) setSansAdresse(true);
          }
          if (arriveeParDefaut) setArrivee(arriveeParDefaut);
          if (departParDefaut) setDepart(departParDefaut);
          const modeParDefaut = v.mode_transport && v.mode_transport !== 'mixte' ? v.mode_transport : 'voiture';
          // Départ et arrivée connus : le trajet se calcule tout seul.
          if (departParDefaut && arriveeParDefaut && (propre || modeParDefaut === 'voiture')) {
            if (propre) setMode('voiture');
            lancerCalcul(departParDefaut, arriveeParDefaut);
          }
          setPassagers(
            new Set(
              propre && foyerVise
                ? liste.filter((p) => p.foyer_id === foyerVise).map((p) => p.id)
                : mesPersonnes(liste, moiId, foyer?.id ?? null).map((p) => p.id)
            )
          );
          if (vs[0] && (!propre || foyerVise === foyer?.id)) choisirVehicule(vs[0].id, vs);
        }
      } catch (e) {
        setErreur(messageErreurVoyage(e));
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voyageId]);

  // Prix du jour de l'énergie choisie, dès qu'un calcul l'a fourni.
  useEffect(() => {
    if (!calcul?.prixCarburants || energie === 'electrique') return;
    const prix = calcul.prixCarburants[energie];
    if (prix) setPrixUnitaire(texte(prix));
  }, [calcul, energie]);

  const choisirVehicule = (id: string, liste = vehicules) => {
    setVehiculeId(id);
    const v = liste.find((x) => x.id === id);
    if (v) {
      setEnergie(v.energie);
      setConsommation(texte(v.consommation));
      setPrixUnitaire(texte(prixDuJour(v.energie) ?? infoEnergie(v.energie).prix));
    }
  };

  const prixDuJour = (e: Energie): number | null => {
    if (e === 'electrique' || !calcul?.prixCarburants) return null;
    return calcul.prixCarburants[e] ?? null;
  };

  const choisirEnergie = (e: Energie) => {
    setEnergie(e);
    setVehiculeId('autre');
    setConsommation(texte(infoEnergie(e).consommation));
    setPrixUnitaire(texte(prixDuJour(e) ?? infoEnergie(e).prix));
  };

  const appliquerItineraire = (choix: 'rapide' | 'sans', c = calcul) => {
    setItineraire(choix);
    const it = choix === 'rapide' ? c?.rapide : c?.sansAutoroute;
    if (it) {
      setDistance(texte(it.distanceKm));
      setDuree(it.dureeMinutes);
    }
    if (choix === 'sans') setPeages('');
  };

  // Départ ou arrivée modifiés à la main : l'ancien calcul (ville, durée)
  // est oublié ; la distance saisie, elle, reste.
  const oublierCalcul = () => {
    if (!calcul) return;
    setCalcul(null);
    setCalculPour(null);
    setDuree(null);
  };

  const calculer = () => {
    if (!depart.trim() || !arrivee.trim()) return setErreur('Indiquez le départ et l’arrivée.');
    lancerCalcul(depart.trim(), arrivee.trim());
  };

  const lancerCalcul = async (de: string, vers: string) => {
    setErreur(null);
    setCalculEnCours(true);
    try {
      const c = await calculerTrajet(de, vers);
      setCalcul(c);
      setCalculPour(`${de}|${vers}`);
      appliquerItineraire(c.rapide ? 'rapide' : 'sans', c);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Calcul impossible.');
    } finally {
      setCalculEnCours(false);
    }
  };

  const valeurs = useMemo(
    () => ({
      distance_km: distance.trim() ? lireMontant(distance) : null,
      consommation: consommation.trim() ? lireMontant(consommation) : null,
      prix_unitaire: prixUnitaire.trim() ? lireDecimal(prixUnitaire, 3) : null,
      peages: peages.trim() ? lireMontant(peages) : null,
      prix_billets: prixBillets.trim() ? lireMontant(prixBillets) : null,
    }),
    [distance, consommation, prixUnitaire, peages, prixBillets]
  );
  const cout = coutTrajet({ mode, aller_retour: allerRetour, ...valeurs });

  const valider = async () => {
    setErreur(null);
    for (const [champ, brut, lu] of [
      ['Distance', distance, valeurs.distance_km],
      ['Consommation', consommation, valeurs.consommation],
      ['Prix du carburant', prixUnitaire, valeurs.prix_unitaire],
      ['Péages', peages, valeurs.peages],
      ['Prix des billets', prixBillets, valeurs.prix_billets],
    ] as const) {
      if (brut.trim() && lu === null) return setErreur(`${champ} : nombre invalide.`);
    }
    if (lien.trim() && !/^https?:\/\//i.test(lien.trim())) return setErreur('Le lien doit commencer par http:// ou https://');
    if (passagers.size === 0) return setErreur('Cochez au moins un passager.');
    if (propre && !foyerBranche) return setErreur('Choisissez le foyer.');
    const dureeSaisie = lireDuree(dureeTexte);
    if (mode !== 'voiture' && dureeTexte.trim() && dureeSaisie === null) return setErreur('Durée : par exemple « 6 h 30 » ou « 90 min ».');
    const voiture = mode === 'voiture';
    setEnCours(true);
    try {
      const id = await enregistrerTrajet(
        {
          voyage_id: voyageId,
          option_id: optionId,
          mode,
          libelle: libelle.trim() || null,
          foyer_id: propre ? foyerBranche : existant?.foyer_id ?? foyer?.id ?? null,
          vehicule_id: voiture && vehiculeId !== 'autre' ? vehiculeId : null,
          // Seule la ville est enregistrée (visible de la famille), jamais l'adresse.
          ville_depart: depart.trim()
            ? (calculPour === `${depart.trim()}|${arrivee.trim()}` && calcul?.depart.ville) || villeDe(depart)
            : null,
          ville_arrivee: arrivee.trim() || null,
          aller_retour: retourDifferent ? false : allerRetour,
          distance_km: voiture ? valeurs.distance_km : null,
          duree_minutes: voiture ? duree : dureeSaisie,
          energie: voiture ? energie : null,
          consommation: voiture ? valeurs.consommation : null,
          prix_unitaire: voiture ? valeurs.prix_unitaire : null,
          peages: voiture ? valeurs.peages : null,
          prix_billets: voiture ? null : valeurs.prix_billets,
          lien: lien.trim() || null,
          note: existant?.note ?? null,
          // Envoyé seulement s'il a été choisi (base plus ancienne).
          ...(paiement || existant?.paiement ? { paiement } : {}),
          // Rendez-vous et retour (base du 15 octobre 2026) : envoyés
          // seulement s'ils servent.
          ...(propre || existant?.propre_foyer ? { propre_foyer: propre, rejoint_id: propre ? rejoint : null } : {}),
          ...(retourDifferent ? { sens: sensFixe } : {}),
        },
        [...passagers].filter((id) => !propre || invites.find((p) => p.id === id)?.foyer_id === foyerBranche),
        existant?.id
      );
      if (optionId) await rangerEtapes(optionId, id, existant?.rejoint_id ?? null);
      navigation.goBack();
    } catch (e) {
      setErreur(messageErreurVoyage(e));
      setEnCours(false);
    }
  };

  const supprimer = () =>
    alerte(optionId ? 'Supprimer cette étape ?' : 'Supprimer ce trajet ?', undefined, [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: async () => {
          try {
            await supprimerTrajet(existant!.id);
            if (optionId) await rangerEtapes(optionId);
            navigation.goBack();
          } catch (e) {
            setErreur(messageErreurVoyage(e));
          }
        },
      },
    ]);

  if (!voyage) return erreur ? <Erreur texte={erreur} /> : <Chargement />;
  const unite = infoEnergie(energie).unite;
  const maPersonneId = invites.find((p) => p.utilisateur_id === moiId)?.id ?? null;
  const organisateur = estOrganisateur(voyage, moiId, maPersonneId);
  const foyersInvites = [...new Map(invites.filter((p) => p.foyer_id).map((p) => [p.foyer_id!, p.foyer_nom ?? 'Foyer'])).entries()];
  const auRetour = retourDifferent && sensFixe === 'retour';
  // Rendez-vous possibles : les étapes communes du même sens.
  const tronc = vueOption(etapesOption, auRetour ? 'retour' : 'aller').tronc.filter((e) => e.id !== existant?.id);
  const lieuDe = (id: string | null) => {
    const e = tronc.find((x) => x.id === id);
    return e ? lieuRendezVous(e) : null;
  };
  const choisirRendezVous = (id: string) => {
    const nouveau = id === 'direct' ? null : id;
    // Nouvelle étape : l'arrivée (ou le départ, au retour) suit le rendez-vous.
    if (!existant) {
      const ancien = lieuDe(rejoint);
      const lieu = lieuDe(nouveau);
      if (auRetour) {
        if (lieu && (!depart.trim() || depart === ancien)) setDepart(lieu);
      } else if (lieu && (!arrivee.trim() || arrivee === ancien)) setArrivee(lieu);
      oublierCalcul();
    }
    setRejoint(nouveau);
  };
  const choisirFoyer = (id: string) => {
    setFoyerBranche(id);
    setPassagers(new Set(invites.filter((p) => p.foyer_id === id).map((p) => p.id)));
  };
  const passagersPossibles = propre ? invites.filter((p) => p.foyer_id === foyerBranche) : invites;

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.contenu} keyboardShouldPersistTaps="handled">
      {optionId && (
        <>
          <Libelle>Cette étape</Libelle>
          <Puces
            options={[
              { id: 'commun', libelle: 'En commun' },
              { id: 'foyer', libelle: auRetour ? 'Un foyer rentre chez lui' : 'Un foyer rejoint le groupe' },
            ]}
            valeur={propre ? 'foyer' : 'commun'}
            onChange={(c) => {
              const p = c === 'foyer';
              setPropre(p);
              if (p && !rejoint && tronc.length && !existant) choisirRendezVous((auRetour ? tronc[tronc.length - 1] : tronc[0]).id);
              if (p && foyerBranche) setPassagers((s) => new Set([...s].filter((id) => invites.find((x) => x.id === id)?.foyer_id === foyerBranche)));
            }}
          />
          {propre && (
            <>
              {organisateur && foyersInvites.length > 1 ? (
                <>
                  <Libelle>Foyer</Libelle>
                  <Puces options={foyersInvites.map(([id, nom]) => ({ id, libelle: nom }))} valeur={foyerBranche ?? ''} onChange={choisirFoyer} />
                </>
              ) : null}
              <Libelle>{auRetour ? 'Quitte le groupe à' : 'Rejoint le groupe à'}</Libelle>
              <Puces
                options={[
                  ...tronc.map((e) => ({
                    id: e.id,
                    libelle: `${lieuRendezVous(e)} (${(MODES_TRAJET.find((m) => m.id === e.mode)?.libelle ?? '').toLowerCase()})`,
                  })),
                  { id: 'direct', libelle: auRetour ? 'Rentre directement' : 'Va directement à destination' },
                ]}
                valeur={rejoint ?? 'direct'}
                onChange={choisirRendezVous}
              />
              <Aide>
                {rejoint
                  ? auRetour
                    ? `Ses passagers restent avec le groupe jusqu’à ${lieuDe(rejoint)}, puis rentrent par ces étapes.`
                    : `Ses passagers rejoignent le groupe à ${lieuDe(rejoint)} : ils seront à bord des étapes en commun à partir de là. Ajoutez une étape de plus si le trajet jusqu’au rendez-vous en compte plusieurs.`
                  : 'Ce foyer n’utilise pas les étapes en commun : il en est retiré.'}
              </Aide>
            </>
          )}
        </>
      )}

      <Libelle>Mode</Libelle>
      <Puces options={MODES_TRAJET} valeur={mode} onChange={setMode} />

      <View style={styles.ligne}>
        <View style={styles.colonne}>
          <Libelle nativeID="libelle-depart">Départ</Libelle>
          <Champ value={depart} onChangeText={(x) => { setDepart(x); oublierCalcul(); }} placeholder="Ville ou adresse" accessibilityLabelledBy="libelle-depart" />
        </View>
        <View style={styles.colonne}>
          <Libelle nativeID="libelle-arrivee">Arrivée</Libelle>
          <Champ value={arrivee} onChangeText={(x) => { setArrivee(x); oublierCalcul(); }} placeholder="Ville ou adresse" accessibilityLabelledBy="libelle-arrivee" />
        </View>
      </View>

      {sansAdresse && (
        <Aide>Astuce : enregistrez l’adresse de votre foyer dans Moi, elle servira de départ à chaque trajet.</Aide>
      )}
      {mode === 'voiture' ? (
        <>
          <Bouton titre="Calculer le trajet" variante="contour" onPress={calculer} enCours={calculEnCours} />
          {calcul && (
            <View style={styles.bloc}>
              <Text style={styles.detail}>
                {calcul.depart.libelle} → {calcul.arrivee.libelle}
              </Text>
              <Puces
                options={[
                  ...(calcul.rapide
                    ? [{ id: 'rapide' as const, libelle: `Le plus rapide : ${texte(calcul.rapide.distanceKm)} km, ${formaterDuree(calcul.rapide.dureeMinutes)}` }]
                    : []),
                  ...(calcul.sansAutoroute
                    ? [{ id: 'sans' as const, libelle: `Sans autoroute : ${texte(calcul.sansAutoroute.distanceKm)} km, ${formaterDuree(calcul.sansAutoroute.dureeMinutes)}` }]
                    : []),
                ]}
                valeur={itineraire}
                onChange={(c) => appliquerItineraire(c)}
              />
              <Aide>Distances aller simple, calculées par la Géoplateforme de l’IGN.</Aide>
            </View>
          )}

          {vehicules.length > 0 && (
            <>
              <Libelle>Véhicule</Libelle>
              <Puces
                options={[...vehicules.map((v) => ({ id: v.id, libelle: v.nom })), { id: 'autre', libelle: 'Autre' }]}
                valeur={vehiculeId}
                onChange={(id) => (id === 'autre' ? setVehiculeId('autre') : choisirVehicule(id))}
              />
            </>
          )}
          <Libelle>Énergie</Libelle>
          <Puces options={ENERGIES} valeur={energie} onChange={choisirEnergie} />

          <View style={styles.ligne}>
            <View style={styles.colonne}>
              <Libelle nativeID="libelle-distance">Distance (km, aller)</Libelle>
              <Champ value={distance} onChangeText={setDistance} keyboardType="decimal-pad" accessibilityLabelledBy="libelle-distance" />
            </View>
            <View style={styles.colonne}>
              <Libelle nativeID="libelle-conso">Conso ({unite}/100)</Libelle>
              <Champ value={consommation} onChangeText={setConsommation} keyboardType="decimal-pad" accessibilityLabelledBy="libelle-conso" />
            </View>
          </View>
          <View style={styles.ligne}>
            <View style={styles.colonne}>
              <Libelle nativeID="libelle-prix">Prix (€/{unite})</Libelle>
              <Champ value={prixUnitaire} onChangeText={setPrixUnitaire} keyboardType="decimal-pad" accessibilityLabelledBy="libelle-prix" />
            </View>
            <View style={styles.colonne}>
              <Libelle nativeID="libelle-peages">Péages (€, aller)</Libelle>
              <Champ value={peages} onChangeText={setPeages} keyboardType="decimal-pad" accessibilityLabelledBy="libelle-peages" />
            </View>
          </View>
          {calcul?.prixCarburants && energie !== 'electrique' && (
            <Aide>Prix du carburant : moyenne nationale du jour (prix-carburants.gouv.fr), modifiable.</Aide>
          )}
          {depart.trim() && arrivee.trim() ? (
            <Pressable onPress={() => Linking.openURL(lienPeages(depart.trim(), arrivee.trim()))} accessibilityRole="link" style={styles.lien}>
              <Ionicons name="open-outline" size={16} color={theme.colors.accent} />
              <Text style={styles.lienTexte}>Estimer les péages sur ViaMichelin</Text>
            </Pressable>
          ) : null}
        </>
      ) : (
        <>
          <View style={styles.sites}>
            {sitesBillets(mode, depart.trim(), arrivee.trim()).map((s) => (
              <Pressable key={s.nom} onPress={() => Linking.openURL(s.url)} accessibilityRole="link" style={styles.lien}>
                <Ionicons name="open-outline" size={16} color={theme.colors.accent} />
                <Text style={styles.lienTexte}>Chercher sur {s.nom}</Text>
              </Pressable>
            ))}
          </View>
          <Libelle nativeID="libelle-duree">Durée (aller)</Libelle>
          <Champ value={dureeTexte} onChangeText={setDureeTexte} placeholder="Ex. 6 h 30" accessibilityLabelledBy="libelle-duree" />
          <Libelle nativeID="libelle-billets">Prix des billets (€, pour tous les passagers)</Libelle>
          <Champ value={prixBillets} onChangeText={setPrixBillets} keyboardType="decimal-pad" accessibilityLabelledBy="libelle-billets" />
          <Libelle nativeID="libelle-lien">Lien de l’offre (facultatif)</Libelle>
          <Champ value={lien} onChangeText={setLien} autoCapitalize="none" keyboardType="url" placeholder="https://…" accessibilityLabelledBy="libelle-lien" />
        </>
      )}

      {retourDifferent ? (
        <Aide>{auRetour ? 'Étape du retour.' : 'Étape de l’aller (le retour a ses propres étapes).'}</Aide>
      ) : (
        <CaseACocher
          coche={allerRetour}
          onChange={setAllerRetour}
          libelle="Aller-retour"
          aide={
            mode === 'voiture'
              ? 'Le même trajet au retour : carburant et péages comptés deux fois.'
              : 'Le même trajet au retour : le prix des billets le comprend.'
          }
        />
      )}

      <Libelle>Passagers</Libelle>
      {passagersPossibles.map((p) => (
        <CaseACocher
          key={p.id}
          coche={passagers.has(p.id)}
          onChange={(c) =>
            setPassagers((s) => {
              const n = new Set(s);
              if (c) n.add(p.id);
              else n.delete(p.id);
              return n;
            })
          }
          libelle={p.prenom}
          personneId={p.id}
          aide={p.foyer_nom ?? undefined}
        />
      ))}
      <Aide>
        {propre
          ? 'Les membres du foyer qui font ce trajet. Qui paie se règle juste en dessous.'
          : 'Cochez les personnes de plusieurs foyers pour une étape faite ensemble (le ferry, la voiture de quelqu’un). Qui paie se règle juste en dessous.'}
      </Aide>

      <Libelle>Qui paie ?</Libelle>
      <Puces
        options={
          mode === 'voiture'
            ? [
                { id: 'foyer', libelle: 'Le foyer de la voiture' },
                { id: 'passagers', libelle: 'Partagé entre les passagers' },
                { id: 'commun', libelle: 'En commun' },
              ]
            : [
                { id: 'commun', libelle: 'En commun' },
                { id: 'passagers', libelle: 'Chaque passager sa part' },
                { id: 'foyer', libelle: 'Un seul foyer' },
              ]
        }
        valeur={paiementEtape({ mode, paiement, propre_foyer: propre })}
        onChange={(p) => setPaiement(p as PaiementEtape)}
      />
      <Aide>
        {paiementEtape({ mode, paiement, propre_foyer: propre }) === 'commun'
          ? 'Réparti comme l’hébergement (règle du voyage, par défaut par adulte, enfants gratuits) entre les passagers de l’étape.'
          : paiementEtape({ mode, paiement, propre_foyer: propre }) === 'foyer'
            ? mode === 'voiture'
              ? 'Chacun paie l’essence et les péages de sa voiture, même s’il emmène d’autres personnes.'
              : propre
                ? 'Tout le coût pour ce foyer.'
                : 'Tout le coût pour le foyer de celui qui déclare l’étape.'
            : 'Le coût divisé à parts égales entre tous les passagers, enfants compris.'}
      </Aide>

      <Libelle nativeID="libelle-nom">Nom du trajet (facultatif)</Libelle>
      <Champ value={libelle} onChangeText={setLibelle} placeholder={depart.trim() ? `Depuis ${depart.trim()}` : 'Ex. La voiture des Morel'} accessibilityLabelledBy="libelle-nom" />

      <View style={styles.cout}>
        <Text style={styles.coutLibelle}>Coût du trajet</Text>
        <Text style={styles.coutMontant}>{formaterEuros(cout, true)}</Text>
      </View>

      <Erreur texte={erreur} />
      <Bouton titre="Enregistrer" onPress={valider} enCours={enCours} />
      {existant && <Bouton titre={optionId ? 'Supprimer cette étape' : 'Supprimer ce trajet'} variante="discret" onPress={supprimer} />}
    </ScrollView>
  );
}

const styles = creerStylesThemes(() => ({
  flex: { flex: 1, backgroundColor: theme.colors.background },
  contenu: { padding: theme.spacing.md, gap: theme.spacing.sm, paddingBottom: theme.spacing.xl },
  ligne: { flexDirection: 'row', gap: theme.spacing.md },
  colonne: { flex: 1, gap: theme.spacing.sm },
  bloc: {
    gap: theme.spacing.xs,
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radii.lg,
    padding: theme.spacing.md,
  },
  detail: { fontFamily: theme.fontBody, fontSize: 14, color: theme.colors.textMuted },
  lien: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', minHeight: 36 },
  lienTexte: { fontFamily: theme.fontBodyBold, fontSize: 15, color: theme.colors.accent },
  sites: { gap: 2 },
  cout: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: theme.spacing.md,
    borderRadius: theme.radii.lg,
    backgroundColor: theme.colors.accentTransparent,
    marginTop: theme.spacing.sm,
  },
  coutLibelle: { fontFamily: theme.fontBodyBold, fontSize: 16, color: theme.colors.text },
  coutMontant: { fontFamily: theme.fontTitle, fontSize: 22, color: theme.colors.text },
}));
