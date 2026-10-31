import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { ChampDate } from '../../../composants/ChampDate';
import { theme, creerStylesThemes } from '../theme/theme';
import { useAuth } from '../contexts/AuthContext';
import { Bouton, Chargement } from '../components/ui';
import { alerte } from '../utils/alerte';
import { extraireMessageErreur } from '@apps-famille/famille';
import { lireDateSaisie, listerPersonnes, type Personne } from '../services/personnes';
import {
  creerActivite,
  groupeDuFoyer,
  idsEnfantsDeActivite,
  JOURS,
  lireHeureSaisie,
  listerActivites,
  listerEnfants,
  listerGroupes,
  listerParticipants,
  mesParticipants,
  modifierActivite,
  modifierGroupe,
  modifierResponsablesActivite,
  supprimerActivite,
  ZONES_VACANCES,
  type Enfant,
  type Groupe,
  type Participant,
  type ZoneVacances,
} from '../services/quotidien';
import { BandeauBrouillon } from '../../../composants/assistant';
import { ajouterHeures, type ActiviteLue } from '../../../services/planningAssistant';

function isoVersFr(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const [a, m, j] = iso.split('-');
  return `${j}/${m}/${a}`;
}

function dateFr(d: Date): string {
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

// Fin de l'année scolaire en cours : 30 juin.
function finAnneeScolaire(): Date {
  const auj = new Date();
  return new Date(auj.getMonth() >= 6 ? auj.getFullYear() + 1 : auj.getFullYear(), 5, 30);
}

function minutes(h: string): number {
  const [hh, mm] = h.split(':').map(Number);
  return hh * 60 + mm;
}

function heureDepuisMinutes(m: number): string {
  const v = Math.max(0, m);
  return `${String(Math.floor(v / 60)).padStart(2, '0')}:${String(v % 60).padStart(2, '0')}`;
}

type Choix = string | null; // id de personne, ou null = personne

// Activité récurrente des enfants du foyer (jour, horaires, lieu, période),
// avec QUI emmène et QUI ramène par défaut, éventuellement une semaine sur
// deux (refonte Quotidien § 5.3). Les séances et leurs trajets aller et
// retour sont créés aussitôt, vacances scolaires de la zone sautées.
// Sans groupe en paramètre, l'activité va dans le groupe privé du foyer ;
// elle peut être partagée avec un groupe de covoiturage.
// Avec `id` : modification du nom, du lieu et des responsables.
export default function ActiviteFormScreen({ route, navigation }: any) {
  const { foyer } = useAuth();
  const params = (route.params ?? {}) as {
    id?: string;
    groupeId?: string;
    zone?: string | null;
    brouillon?: ActiviteLue;
  };
  const brouillon = params.brouillon;
  const modif = !!params.id;

  const [pret, setPret] = useState(false);
  const [nom, setNom] = useState(brouillon?.nom ?? '');
  const [lieu, setLieu] = useState(brouillon?.lieu ?? '');
  const [jour, setJour] = useState<number>(brouillon?.jour ?? 3);
  const [debut, setDebut] = useState(brouillon?.heure_debut ?? '14:00');
  const [fin, setFin] = useState(brouillon?.heure_fin ?? (brouillon ? ajouterHeures(brouillon.heure_debut, 1) : '16:00'));
  // Départ de l'aller : vide = 20 minutes avant le début.
  const [depart, setDepart] = useState('');
  const [du, setDu] = useState(isoVersFr(brouillon?.date_debut) ?? dateFr(new Date()));
  const [au, setAu] = useState(isoVersFr(brouillon?.date_fin) ?? dateFr(finAnneeScolaire()));
  const [adultes, setAdultes] = useState<Personne[]>([]);
  const [groupes, setGroupes] = useState<Groupe[]>([]);
  const [groupePrive, setGroupePrive] = useState<Groupe | null>(null);
  const [groupeChoisi, setGroupeChoisi] = useState<string | null>(params.groupeId ?? null);
  const [zone, setZone] = useState<ZoneVacances | null>((params.zone as ZoneVacances) ?? null);
  const [enfantsDispo, setEnfantsDispo] = useState<Enfant[]>([]);
  const [mesParts, setMesParts] = useState<Participant[]>([]);
  const [enfantsChoisis, setEnfantsChoisis] = useState<string[]>([]);
  const [aller, setAller] = useState<Choix>(null);
  const [retour, setRetour] = useState<Choix>(null);
  const [alternance, setAlternance] = useState(false);
  const [allerAlt, setAllerAlt] = useState<Choix>(null);
  const [retourAlt, setRetourAlt] = useState<Choix>(null);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  // Chargement : adultes du foyer, groupes, enfants ; en modification,
  // l'activité elle-même.
  useEffect(() => {
    if (!foyer) return;
    (async () => {
      try {
        navigation.setOptions?.({ title: modif ? 'Modifier l’activité' : 'Nouvelle activité' });
        const [ps, gs0] = await Promise.all([listerPersonnes([foyer.id]), listerGroupes()]);
        let gs = gs0;
        setAdultes(ps.filter((p) => p.utilisateur_id));
        setGroupes(gs);
        if (modif) {
          const as = await listerActivites(gs.map((g) => g.id));
          const a = as.find((x) => x.id === params.id);
          if (a) {
            setNom(a.nom);
            setLieu(a.lieu ?? '');
            setJour(a.jour_semaine);
            setDebut(a.heure_debut.slice(0, 5));
            setFin(a.heure_fin.slice(0, 5));
            setDu(isoVersFr(a.date_debut) ?? '');
            setAu(isoVersFr(a.date_fin) ?? '');
            setAller(a.aller_par ?? null);
            setRetour(a.retour_par ?? null);
            setAllerAlt(a.aller_par_alt ?? null);
            setRetourAlt(a.retour_par_alt ?? null);
            setAlternance(!!(a.aller_par_alt || a.retour_par_alt));
            setGroupeChoisi(a.groupe_id);
            setEnfantsChoisis(await idsEnfantsDeActivite(a.id).catch(() => []));
          }
        } else if (!params.groupeId) {
          // Création dans le groupe privé du foyer.
          const idPrive = await groupeDuFoyer();
          const gs2 = await listerGroupes();
          gs = gs2;
          setGroupes(gs2);
          const prive = gs2.find((g) => g.id === idPrive) ?? null;
          setGroupePrive(prive);
          setZone((z) => z ?? prive?.zone_vacances ?? null);
        }
        // Enfants de mon foyer dans le groupe concerné.
        const parts = await listerParticipants(gs.map((g) => g.id));
        const miens = mesParticipants(parts, foyer.id);
        setMesParts(miens);
        setEnfantsDispo(await listerEnfants(miens.map((p) => p.id)));
      } catch (e) {
        setErreur(extraireMessageErreur(e, 'Chargement impossible.'));
      } finally {
        setPret(true);
      }
    })();
  }, [foyer, modif]);

  if (!pret) return <Chargement />;

  const partages = groupes.filter((g) => !g.foyer_prive);
  const groupeCible = groupeChoisi ?? groupePrive?.id ?? null;
  const groupeCibleInfo = groupes.find((g) => g.id === groupeCible) ?? null;
  const enPartage = !!groupeCibleInfo && !groupeCibleInfo.foyer_prive;
  // Enfants proposés : ceux du groupe cible (le groupe privé ou le groupe partagé choisi).
  const enfantsDuGroupe = enfantsDispo.filter(
    (e) => mesParts.find((p) => p.id === e.participant_id)?.groupe_id === groupeCible
  );

  const valider = async () => {
    setErreur(null);
    if (!nom.trim()) return setErreur('Indiquez le nom de l’activité.');
    if (modif) {
      setEnCours(true);
      try {
        await modifierActivite(params.id!, { nom: nom.trim(), lieu: lieu.trim() || null });
        await modifierResponsablesActivite(params.id!, {
          aller,
          retour,
          allerAlt: alternance ? allerAlt : null,
          retourAlt: alternance ? retourAlt : null,
        });
        navigation.goBack();
      } catch (e) {
        setErreur(extraireMessageErreur(e, 'Enregistrement impossible.'));
      } finally {
        setEnCours(false);
      }
      return;
    }
    const hDebut = lireHeureSaisie(debut);
    const hFin = lireHeureSaisie(fin);
    const dDu = lireDateSaisie(du);
    const dAu = lireDateSaisie(au);
    if (!hDebut || !hFin) return setErreur('Heures attendues au format 14:00 ou 14h.');
    if (hFin <= hDebut) return setErreur('L’heure de fin doit suivre l’heure de début.');
    if (!dDu || !dAu) return setErreur('Choisissez les deux dates.');
    if (dAu < dDu) return setErreur('La date de fin doit suivre la date de début.');
    let avance = 20;
    if (depart.trim()) {
      const hDepart = lireHeureSaisie(depart);
      if (!hDepart) return setErreur('Départ de l’aller : heure attendue au format 13:40.');
      avance = minutes(hDebut) - minutes(hDepart);
      if (avance < 0) return setErreur('Le départ de l’aller doit précéder le début de l’activité.');
      if (avance > 180) return setErreur('Le départ de l’aller ne peut pas être plus de 3 heures avant.');
    }
    if (!groupeCible) return setErreur('Le groupe du foyer n’est pas prêt, réessayez.');
    setEnCours(true);
    try {
      // La zone de vacances est un réglage du groupe privé du foyer.
      if (!enPartage && groupePrive && zone !== (groupePrive.zone_vacances ?? null)) {
        await modifierGroupe(groupePrive.id, { zone_vacances: zone });
      }
      const n = await creerActivite(
        {
          groupe_id: groupeCible,
          nom: nom.trim(),
          lieu: lieu.trim() || null,
          jour_semaine: jour,
          heure_debut: hDebut,
          heure_fin: hFin,
          date_debut: dDu,
          date_fin: dAu,
          aller_par: aller,
          retour_par: retour,
          aller_par_alt: alternance ? allerAlt : null,
          retour_par_alt: alternance ? retourAlt : null,
          avance_aller: `${avance} minutes`,
        },
        enfantsChoisis
      );
      alerte('Activité ajoutée', `${n} séance${n > 1 ? 's' : ''} créée${n > 1 ? 's' : ''}, avec leurs trajets aller et retour.`);
      navigation.goBack();
    } catch (e) {
      setErreur(extraireMessageErreur(e, 'Enregistrement impossible.'));
    } finally {
      setEnCours(false);
    }
  };

  const supprimer = () =>
    alerte('Supprimer cette activité ?', 'Ses séances et leurs trajets disparaissent aussi.', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: async () => {
          try {
            await supprimerActivite(params.id!);
            navigation.goBack();
          } catch (e) {
            alerte('Suppression impossible', extraireMessageErreur(e, 'Veuillez réessayer.'));
          }
        },
      },
    ]);

  // Choix d'un responsable : « Personne » ou un adulte du foyer.
  const choixResponsable = (valeur: Choix, changer: (v: Choix) => void, libelle: string) => (
    <View style={styles.puces} accessibilityLabel={libelle}>
      <Pressable
        onPress={() => changer(null)}
        style={[styles.puce, valeur === null && styles.puceActive]}
        accessibilityRole="radio"
        accessibilityState={{ selected: valeur === null }}
      >
        <Text style={[styles.puceTexte, valeur === null && { color: theme.colors.background }]}>Personne</Text>
      </Pressable>
      {adultes.map((p) => (
        <Pressable
          key={p.id}
          onPress={() => changer(p.id)}
          style={[styles.puce, valeur === p.id && styles.puceActive]}
          accessibilityRole="radio"
          accessibilityState={{ selected: valeur === p.id }}
        >
          <Text style={[styles.puceTexte, valeur === p.id && { color: theme.colors.background }]}>{p.prenom}</Text>
        </Pressable>
      ))}
    </View>
  );

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.contenu} keyboardShouldPersistTaps="handled">
      {brouillon ? <BandeauBrouillon /> : null}
      <Text style={styles.libelle}>Activité</Text>
      <TextInput
        style={styles.champ}
        value={nom}
        onChangeText={setNom}
        placeholder="ex. Foot, Piano, Judo"
        placeholderTextColor={theme.colors.textMuted}
        accessibilityLabel="Nom de l'activité"
      />

      {!modif && (
        <>
          <Text style={styles.libelle}>Pour qui</Text>
          {enfantsDuGroupe.length === 0 ? (
            <Text style={styles.aide}>Ajoutez vos enfants dans Moi (« Mon foyer ») pour les relier à l’activité.</Text>
          ) : (
            <View style={styles.puces}>
              {enfantsDuGroupe.map((e) => {
                const actif = enfantsChoisis.includes(e.id);
                return (
                  <Pressable
                    key={e.id}
                    onPress={() => setEnfantsChoisis(actif ? enfantsChoisis.filter((x) => x !== e.id) : [...enfantsChoisis, e.id])}
                    style={[styles.puce, actif && styles.puceActive]}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: actif }}
                  >
                    <Text style={[styles.puceTexte, actif && { color: theme.colors.background }]}>{e.prenom}</Text>
                  </Pressable>
                );
              })}
            </View>
          )}
        </>
      )}

      <Text style={styles.libelle}>Lieu</Text>
      <TextInput
        style={styles.champ}
        value={lieu}
        onChangeText={setLieu}
        placeholder="ex. Stade municipal (pas une adresse personnelle)"
        placeholderTextColor={theme.colors.textMuted}
        accessibilityLabel="Lieu de l'activité"
      />

      {modif ? (
        <Text style={styles.aide}>
          {JOURS[jour - 1]} de {debut} à {fin}, du {du} au {au}. Pour changer le jour, les horaires ou la période,
          supprimez l’activité et recréez-la.
        </Text>
      ) : (
        <>
          <Text style={styles.libelle}>Jour</Text>
          <View style={styles.puces}>
            {JOURS.map((j, i) => (
              <Pressable
                key={j}
                onPress={() => setJour(i + 1)}
                style={[styles.puce, jour === i + 1 && styles.puceActive]}
                accessibilityRole="radio"
                accessibilityState={{ selected: jour === i + 1 }}
              >
                <Text style={[styles.puceTexte, jour === i + 1 && { color: theme.colors.background }]}>
                  {j.charAt(0).toUpperCase() + j.slice(1, 3)}
                </Text>
              </Pressable>
            ))}
          </View>
          <View style={styles.deux}>
            <View style={styles.moitie}>
              <Text style={styles.libelle}>Début</Text>
              <TextInput style={styles.champ} value={debut} onChangeText={setDebut} accessibilityLabel="Heure de début" />
            </View>
            <View style={styles.moitie}>
              <Text style={styles.libelle}>Fin</Text>
              <TextInput style={styles.champ} value={fin} onChangeText={setFin} accessibilityLabel="Heure de fin" />
            </View>
          </View>
          <View style={styles.deux}>
            <View style={styles.moitie}>
              <Text style={styles.libelle}>Du</Text>
              <ChampDate style={styles.champ} value={du} onChangeText={setDu} accessibilityLabel="Première date" facultatif={false} />
            </View>
            <View style={styles.moitie}>
              <Text style={styles.libelle}>Au</Text>
              <ChampDate style={styles.champ} value={au} onChangeText={setAu} accessibilityLabel="Dernière date" facultatif={false} />
            </View>
          </View>
          {enPartage ? (
            <Text style={styles.aide}>
              {zone
                ? `Les vacances scolaires (${zone === 'Corse' ? 'Corse' : `zone ${zone}`}) du groupe sont sautées.`
                : 'Aucune zone de vacances choisie pour ce groupe : une séance chaque semaine, vacances comprises.'}
            </Text>
          ) : (
            <>
              <Text style={styles.libelle}>Vacances scolaires</Text>
              <View style={styles.puces}>
                <Pressable
                  onPress={() => setZone(null)}
                  style={[styles.puce, zone === null && styles.puceActive]}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: zone === null }}
                >
                  <Text style={[styles.puceTexte, zone === null && { color: theme.colors.background }]}>Pas de pause</Text>
                </Pressable>
                {ZONES_VACANCES.map((z) => (
                  <Pressable
                    key={z}
                    onPress={() => setZone(z)}
                    style={[styles.puce, zone === z && styles.puceActive]}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: zone === z }}
                  >
                    <Text style={[styles.puceTexte, zone === z && { color: theme.colors.background }]}>
                      {z === 'Corse' ? 'Corse' : `Zone ${z}`}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <Text style={styles.aide}>Les séances sont sautées pendant les vacances de cette zone.</Text>
            </>
          )}
        </>
      )}

      <Text style={styles.libelle}>Aller : qui emmène ?</Text>
      {choixResponsable(aller, setAller, 'Qui emmène')}
      {!modif && (
        <View style={styles.deux}>
          <View style={styles.moitie}>
            <Text style={styles.petitLibelle}>Heure de départ</Text>
            <TextInput
              style={styles.champ}
              value={depart}
              onChangeText={setDepart}
              placeholder="20 min avant"
              placeholderTextColor={theme.colors.textMuted}
              accessibilityLabel="Heure de départ de l'aller"
            />
          </View>
        </View>
      )}
      <Text style={styles.libelle}>Retour : qui ramène ?</Text>
      {choixResponsable(retour, setRetour, 'Qui ramène')}

      <Pressable
        onPress={() => setAlternance(!alternance)}
        style={styles.case}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: alternance }}
      >
        <Ionicons name={alternance ? 'checkbox' : 'square-outline'} size={24} color={theme.colors.accent} />
        <Text style={styles.caseTexte}>Une semaine sur deux avec quelqu’un d’autre</Text>
      </Pressable>
      {alternance && (
        <View style={styles.cadre}>
          <Text style={styles.aide}>Les semaines paires du calendrier (semaines ISO), c’est lui ou elle.</Text>
          <Text style={styles.petitLibelle}>Aller</Text>
          {choixResponsable(allerAlt, setAllerAlt, 'Aller, une semaine sur deux')}
          <Text style={styles.petitLibelle}>Retour</Text>
          {choixResponsable(retourAlt, setRetourAlt, 'Retour, une semaine sur deux')}
        </View>
      )}

      {!modif && !params.groupeId && (
        <>
          <Text style={styles.libelle}>Partager avec un groupe (facultatif)</Text>
          <Text style={styles.aide}>
            Pour covoiturer avec d’autres familles : l’activité est alors visible des familles du groupe, qui peuvent
            prendre un trajet.
          </Text>
          <View style={styles.puces}>
            <Pressable
              onPress={() => setGroupeChoisi(null)}
              style={[styles.puce, !enPartage && styles.puceActive]}
              accessibilityRole="radio"
              accessibilityState={{ selected: !enPartage }}
            >
              <Text style={[styles.puceTexte, !enPartage && { color: theme.colors.background }]}>Pas de partage</Text>
            </Pressable>
            {partages.map((g) => (
              <Pressable
                key={g.id}
                onPress={() => {
                  setGroupeChoisi(g.id);
                  setZone(g.zone_vacances ?? null);
                  setEnfantsChoisis([]);
                }}
                style={[styles.puce, groupeChoisi === g.id && styles.puceActive]}
                accessibilityRole="radio"
                accessibilityState={{ selected: groupeChoisi === g.id }}
              >
                <Text style={[styles.puceTexte, groupeChoisi === g.id && { color: theme.colors.background }]}>{g.nom}</Text>
              </Pressable>
            ))}
            <Pressable
              onPress={() => navigation.navigate('GroupeForm')}
              style={[styles.puce, styles.pucePointillee]}
              accessibilityRole="button"
            >
              <Ionicons name="add" size={16} color={theme.colors.accent} />
              <Text style={styles.puceTexte}>Nouveau groupe</Text>
            </Pressable>
          </View>
        </>
      )}

      {erreur && <Text style={styles.erreur}>{erreur}</Text>}
      <Bouton titre={modif ? 'Enregistrer' : 'Ajouter l’activité'} onPress={valider} enCours={enCours} />
      {modif && <Bouton variante="discret" titre="Supprimer l’activité" onPress={supprimer} />}
    </ScrollView>
  );
}

const styles = creerStylesThemes(() => ({
  flex: { flex: 1, backgroundColor: theme.colors.background },
  contenu: { padding: theme.spacing.md, gap: theme.spacing.xs, paddingBottom: theme.spacing.xl },
  libelle: { fontFamily: theme.fontBodyBold, fontSize: 14, color: theme.colors.text, marginTop: theme.spacing.sm },
  petitLibelle: { fontFamily: theme.fontBodyBold, fontSize: 13, color: theme.colors.textMuted },
  aide: { fontFamily: theme.fontBody, fontSize: 13, color: theme.colors.textMuted, marginVertical: theme.spacing.xs },
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
  deux: { flexDirection: 'row', gap: theme.spacing.sm },
  moitie: { flex: 1 },
  puces: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.xs },
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
  case: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs, minHeight: 44, marginTop: theme.spacing.sm },
  caseTexte: { flex: 1, fontFamily: theme.fontBody, fontSize: 15, color: theme.colors.text },
  cadre: {
    gap: theme.spacing.xs,
    padding: theme.spacing.sm,
    borderRadius: theme.radii.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  erreur: { fontFamily: theme.fontBody, fontSize: 14, color: theme.colors.warning },
}));
