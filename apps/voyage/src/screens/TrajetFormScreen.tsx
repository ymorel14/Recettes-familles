import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, Linking, Pressable } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { theme, creerStylesThemes } from '../theme/theme';
import { useAuth } from '../contexts/AuthContext';
import { alerte } from '../utils/alerte';
import { listerPersonnesParIds, type Personne } from '../services/personnes';
import { formaterEuros, lireDecimal, lireMontant, listerHebergements } from '../services/hebergements';
import { coutTrajet } from '../services/budget';
import {
  calculerTrajet,
  enregistrerTrajet,
  ENERGIES,
  formaterDuree,
  infoEnergie,
  lienPeages,
  lireAdresseFoyer,
  villeDe,
  listerVehicules,
  MODES_TRAJET,
  sitesBillets,
  supprimerTrajet,
  type CalculTrajet,
  type ModeTrajet,
  type Trajet,
} from '../services/transport';
import { mesPersonnes, messageErreurVoyage, obtenirVoyage, type Energie, type Vehicule, type VoyageAvecParticipants } from '../services/voyage';
import { Aide, CaseACocher, Champ, Erreur, Libelle, Puces } from '../components/formulaire';
import { Bouton, Chargement } from '../components/ui';

const texte = (n: number | null | undefined) => (n == null ? '' : String(n).replace('.', ','));

// Ajouter ou modifier un trajet : en voiture (calcul de la distance, du
// carburant et des péages) ou en train, avion, bateau, bus (prix des billets).
export default function TrajetFormScreen({ route, navigation }: any) {
  const voyageId: string = route.params?.voyageId;
  const existant: Trajet | undefined = route.params?.trajet;
  const { session, foyer } = useAuth();
  const moiId = session?.user.id ?? '';

  const [voyage, setVoyage] = useState<VoyageAvecParticipants | null>(null);
  const [invites, setInvites] = useState<Personne[]>([]);
  const [vehicules, setVehicules] = useState<Vehicule[]>([]);

  const [mode, setMode] = useState<ModeTrajet>(existant?.mode ?? 'voiture');
  const [libelle, setLibelle] = useState(existant?.libelle ?? '');
  const [vehiculeId, setVehiculeId] = useState<string>(existant?.vehicule_id ?? 'autre');
  const [depart, setDepart] = useState(existant?.ville_depart ?? '');
  const [arrivee, setArrivee] = useState(existant?.ville_arrivee ?? '');
  const [calcul, setCalcul] = useState<CalculTrajet | null>(null);
  const [itineraire, setItineraire] = useState<'rapide' | 'sans'>('rapide');
  const [distance, setDistance] = useState(texte(existant?.distance_km));
  const [duree, setDuree] = useState<number | null>(existant?.duree_minutes ?? null);
  const [energie, setEnergie] = useState<Energie>(existant?.energie ?? 'gazole');
  const [consommation, setConsommation] = useState(texte(existant?.consommation ?? infoEnergie('gazole').consommation));
  const [prixUnitaire, setPrixUnitaire] = useState(texte(existant?.prix_unitaire ?? infoEnergie('gazole').prix));
  const [peages, setPeages] = useState(texte(existant?.peages));
  const [allerRetour, setAllerRetour] = useState(existant?.aller_retour ?? true);
  const [prixBillets, setPrixBillets] = useState(texte(existant?.prix_billets));
  const [lien, setLien] = useState(existant?.lien ?? '');
  const [passagers, setPassagers] = useState<Set<string>>(new Set(existant?.passagers.map((p) => p.personne_id) ?? []));
  const [calculEnCours, setCalculEnCours] = useState(false);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [sansAdresse, setSansAdresse] = useState(false);

  useEffect(() => {
    navigation.setOptions({ title: existant ? 'Modifier le trajet' : 'Mon trajet' });
    (async () => {
      try {
        const [v, hebergements, vs, adresseFoyer] = await Promise.all([
          obtenirVoyage(voyageId),
          listerHebergements(voyageId),
          listerVehicules(foyer ? [foyer.id] : []),
          foyer ? lireAdresseFoyer(foyer.id).catch(() => null) : Promise.resolve(null),
        ]);
        const attendus = v.participants.filter((p) => p.reponse !== 'decline').map((p) => p.personne_id);
        const liste = await listerPersonnesParIds(attendus);
        setVoyage(v);
        setInvites(liste);
        setVehicules(vs);
        if (!existant) {
          if (v.mode_transport && v.mode_transport !== 'mixte') setMode(v.mode_transport as ModeTrajet);
          const retenu = hebergements.find((h) => h.statut === 'retenu');
          const arriveeParDefaut = retenu
            ? [retenu.adresse, retenu.ville].filter(Boolean).join(', ') || retenu.nom
            : v.destination ?? '';
          setArrivee(arriveeParDefaut);
          if (adresseFoyer) setDepart(adresseFoyer);
          else setSansAdresse(true);
          const modeParDefaut = v.mode_transport && v.mode_transport !== 'mixte' ? v.mode_transport : 'voiture';
          // Départ et arrivée connus : le trajet se calcule tout seul.
          if (adresseFoyer && arriveeParDefaut && modeParDefaut === 'voiture') {
            lancerCalcul(adresseFoyer, arriveeParDefaut);
          }
          setPassagers(new Set(mesPersonnes(liste, moiId, foyer?.id ?? null).map((p) => p.id)));
          if (vs[0]) choisirVehicule(vs[0].id, vs);
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
    const voiture = mode === 'voiture';
    setEnCours(true);
    try {
      await enregistrerTrajet(
        {
          voyage_id: voyageId,
          mode,
          libelle: libelle.trim() || null,
          foyer_id: existant?.foyer_id ?? foyer?.id ?? null,
          vehicule_id: voiture && vehiculeId !== 'autre' ? vehiculeId : null,
          // Seule la ville est enregistrée (visible de la famille), jamais l'adresse.
          ville_depart: depart.trim() ? calcul?.depart.ville || villeDe(depart) : null,
          ville_arrivee: arrivee.trim() || null,
          aller_retour: allerRetour,
          distance_km: voiture ? valeurs.distance_km : null,
          duree_minutes: voiture ? duree : null,
          energie: voiture ? energie : null,
          consommation: voiture ? valeurs.consommation : null,
          prix_unitaire: voiture ? valeurs.prix_unitaire : null,
          peages: voiture ? valeurs.peages : null,
          prix_billets: voiture ? null : valeurs.prix_billets,
          lien: lien.trim() || null,
          note: existant?.note ?? null,
        },
        [...passagers],
        existant?.id
      );
      navigation.goBack();
    } catch (e) {
      setErreur(messageErreurVoyage(e));
      setEnCours(false);
    }
  };

  const supprimer = () =>
    alerte('Supprimer ce trajet ?', undefined, [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: async () => {
          try {
            await supprimerTrajet(existant!.id);
            navigation.goBack();
          } catch (e) {
            setErreur(messageErreurVoyage(e));
          }
        },
      },
    ]);

  if (!voyage) return erreur ? <Erreur texte={erreur} /> : <Chargement />;
  const unite = infoEnergie(energie).unite;

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.contenu} keyboardShouldPersistTaps="handled">
      <Libelle>Mode</Libelle>
      <Puces options={MODES_TRAJET} valeur={mode} onChange={setMode} />

      <View style={styles.ligne}>
        <View style={styles.colonne}>
          <Libelle nativeID="libelle-depart">Départ</Libelle>
          <Champ value={depart} onChangeText={setDepart} placeholder="Ville ou adresse" accessibilityLabelledBy="libelle-depart" />
        </View>
        <View style={styles.colonne}>
          <Libelle nativeID="libelle-arrivee">Arrivée</Libelle>
          <Champ value={arrivee} onChangeText={setArrivee} placeholder="Ville ou adresse" accessibilityLabelledBy="libelle-arrivee" />
        </View>
      </View>

      {sansAdresse && (
        <Aide>Astuce : enregistrez l’adresse de votre foyer dans le Profil, elle servira de départ à chaque trajet.</Aide>
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
          <Libelle nativeID="libelle-billets">Prix des billets (€, pour tous les passagers)</Libelle>
          <Champ value={prixBillets} onChangeText={setPrixBillets} keyboardType="decimal-pad" accessibilityLabelledBy="libelle-billets" />
          <Libelle nativeID="libelle-lien">Lien de l’offre (facultatif)</Libelle>
          <Champ value={lien} onChangeText={setLien} autoCapitalize="none" keyboardType="url" placeholder="https://…" accessibilityLabelledBy="libelle-lien" />
        </>
      )}

      <CaseACocher
        coche={allerRetour}
        onChange={setAllerRetour}
        libelle="Aller-retour"
        aide={mode === 'voiture' ? 'Carburant et péages comptés deux fois.' : 'Le prix des billets comprend le retour.'}
      />

      <Libelle>Passagers</Libelle>
      {invites.map((p) => (
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
          aide={p.foyer_nom ?? undefined}
        />
      ))}
      <Aide>Le coût du trajet est partagé entre ses passagers (donc entre leurs foyers).</Aide>

      <Libelle nativeID="libelle-nom">Nom du trajet (facultatif)</Libelle>
      <Champ value={libelle} onChangeText={setLibelle} placeholder={depart.trim() ? `Depuis ${depart.trim()}` : 'Ex. La voiture des Morel'} accessibilityLabelledBy="libelle-nom" />

      <View style={styles.cout}>
        <Text style={styles.coutLibelle}>Coût du trajet</Text>
        <Text style={styles.coutMontant}>{formaterEuros(cout, true)}</Text>
      </View>

      <Erreur texte={erreur} />
      <Bouton titre="Enregistrer" onPress={valider} enCours={enCours} />
      {existant && <Bouton titre="Supprimer ce trajet" variante="discret" onPress={supprimer} />}
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
