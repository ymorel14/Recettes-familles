import React, { useCallback, useRef, useState } from 'react';
import { Linking, ScrollView, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { theme, creerStylesThemes } from '../theme/theme';
import { useAuth } from '../contexts/AuthContext';
import { Carte, TitreSection } from '../components/elements';
import { Bouton, Chargement, MessageVide, Pastille } from '../components/ui';
import { Puce, Puces } from '../components/formulaire';
import GrilleSemaine from '../components/GrilleSemaine';
import LigneCoupDeMain from '../components/LigneCoupDeMain';
import { alerte } from '../utils/alerte';
import { extraireMessageErreur } from '@apps-famille/famille';
import { listerPersonnes, type Personne } from '../services/personnes';
import { adresseEnfant } from '../services/quotidien';
import {
  annulerRealisation,
  formaterCentimes,
  lienAccesEnfant,
  marquerAide,
  marquerFaite,
  resteDeLaSemaine,
  semaineEnfant,
  soldes,
  tachesDeEnfant,
  validerRealisation,
  type CoupDeMainSemaine,
  type EtatJour,
  type ObligatoireSemaine,
  type SemaineEnfant,
  type StatutSemaine,
} from '../services/maison';
import { heureCourte, jourCourt, nomDuJour } from '../utils/semaine';

// Onglet « Argent de poche » (refonte Quotidien § 4.3) : choix de l'enfant,
// carte de la semaine, réalisations à valider, grille des obligatoires,
// coups de main. Argent fictif : l'argent est versé à la tirelire après le
// bilan du dimanche, jamais automatiquement.

const CLE_ENFANT = 'famille:quotidien:dernier-enfant';
const CLE_BANDEAU = 'famille:quotidien:bandeau-classement-vu';

const STATUTS: Record<StatutSemaine, { texte: string; ton: 'succes' | 'accent' | 'alerte' }> = {
  en_bonne_voie: { texte: 'En bonne voie', ton: 'succes' },
  a_surveiller: { texte: 'À surveiller', ton: 'accent' },
  incomplete: { texte: 'Semaine incomplète', ton: 'alerte' },
  complete: { texte: 'Semaine complète', ton: 'succes' },
};

function messageStatut(s: SemaineEnfant): string {
  if (s.statut === 'complete') return 'Tout est fait : l’argent de poche sera versé après le bilan de dimanche.';
  if (s.statut === 'incomplete') {
    return s.oublies > 0
      ? 'Il manque une obligatoire d’un jour passé : le parent décidera au bilan s’il verse quand même.'
      : 'La semaine est terminée et tout n’est pas fait : le parent décidera au bilan.';
  }
  return `Versé dimanche si tout est fait. ${resteDeLaSemaine(s)}`;
}

export default function ArgentPocheScreen({ navigation, route }: any) {
  const { foyer } = useAuth();
  const [enfants, setEnfants] = useState<Personne[] | null>(null);
  const [choisi, setChoisi] = useState<string | null>(null);
  const [semaine, setSemaine] = useState<SemaineEnfant | null>(null);
  const [solde, setSolde] = useState(0);
  const [nbTaches, setNbTaches] = useState(0);
  const [bandeau, setBandeau] = useState(false);
  const [enCours, setEnCours] = useState<string | null>(null);
  const choixRef = useRef<string | null>(null);

  const chargerSemaine = useCallback(async (id: string) => {
    try {
      const [s, ss, ts] = await Promise.all([semaineEnfant(id), soldes(), tachesDeEnfant(id)]);
      setSemaine(s);
      setSolde(ss.get(id) ?? 0);
      setNbTaches(ts.length);
    } catch (e) {
      alerte('Chargement impossible', extraireMessageErreur(e, 'Veuillez réessayer.'));
    }
  }, []);

  const charger = useCallback(async () => {
    if (!foyer) return;
    try {
      const ps = (await listerPersonnes([foyer.id])).filter((p) => !p.utilisateur_id);
      setEnfants(ps);
      let id: string | null = route?.params?.personneId ?? choixRef.current;
      if (!id) id = await AsyncStorage.getItem(CLE_ENFANT).catch(() => null);
      if (!id || !ps.some((p) => p.id === id)) id = ps[0]?.id ?? null;
      choixRef.current = id;
      setChoisi(id);
      setBandeau((await AsyncStorage.getItem(CLE_BANDEAU).catch(() => 'vu')) !== 'vu');
      if (id) await chargerSemaine(id);
    } catch (e) {
      alerte('Chargement impossible', extraireMessageErreur(e, 'Veuillez réessayer.'));
      setEnfants([]);
    }
  }, [foyer, route?.params?.personneId, chargerSemaine]);

  useFocusEffect(
    useCallback(() => {
      charger();
    }, [charger])
  );

  const choisir = (id: string) => {
    choixRef.current = id;
    setChoisi(id);
    setSemaine(null);
    AsyncStorage.setItem(CLE_ENFANT, id).catch(() => {});
    chargerSemaine(id);
  };

  const agir = async (cle: string, action: () => Promise<void>) => {
    setEnCours(cle);
    try {
      await action();
      if (choisi) await chargerSemaine(choisi);
    } catch (e) {
      alerte('Action impossible', extraireMessageErreur(e, 'Veuillez réessayer.'));
    } finally {
      setEnCours(null);
    }
  };

  const fermerBandeau = () => {
    setBandeau(false);
    AsyncStorage.setItem(CLE_BANDEAU, 'vu').catch(() => {});
  };

  if (!enfants) return <Chargement />;

  if (enfants.length === 0) {
    return (
      <ScrollView style={styles.flex} contentContainerStyle={styles.contenu}>
        <MessageVide
          titre="Pas encore d’enfant dans le foyer"
          texte="Ajoutez vos enfants dans Moi (« Mon foyer ») : chacun aura ses tâches et son argent de poche."
        />
      </ScrollView>
    );
  }

  const enfant = enfants.find((p) => p.id === choisi) ?? enfants[0];

  const toucherCase = (t: ObligatoireSemaine, date: string, etat: EtatJour) => {
    const faire = () => agir(`case:${t.id}:${date}`, () => marquerFaite(t.id, date, enfant.id));
    if (etat === 'oublie') {
      alerte(`Marquer fait le ${nomDuJour(date)} ?`, `${t.libelle} · ${enfant.prenom}`, [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Marquer fait', onPress: faire },
      ]);
    } else {
      faire();
    }
  };

  const ajouterAide = (a: CoupDeMainSemaine) =>
    agir(`aide:${a.id}`, () => marquerAide(a.id, enfant.id, semaine?.aujourdhui ?? ''));

  const ouvrirEspace = async () => {
    try {
      const jeton = await lienAccesEnfant(enfant.id);
      if (jeton) await Linking.openURL(adresseEnfant(jeton));
      else navigation.navigate('TachesEnfant', { personneId: enfant.id, prenom: enfant.prenom });
    } catch (e) {
      alerte('Ouverture impossible', extraireMessageErreur(e, 'Veuillez réessayer.'));
    }
  };

  const statut = semaine ? STATUTS[semaine.statut] : null;
  const aidesFaites = semaine?.aides_faites ?? 0;
  const aidesPrevues = semaine?.aides_prevues ?? 0;

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.contenu} keyboardShouldPersistTaps="handled">
      <Puces>
        {enfants.map((p) => (
          <Puce key={p.id} texte={p.prenom} actif={p.id === enfant.id} onPress={() => choisir(p.id)} />
        ))}
      </Puces>

      {bandeau && nbTaches > 0 ? (
        <Carte>
          <Text style={styles.titreBandeau}>Vos tâches ont été classées en obligatoires et coups de main</Text>
          <Text style={styles.detail}>Vérifiez-les : une obligatoire se fait des jours précis, un coup de main un nombre de fois par semaine.</Text>
          <View style={styles.ligne}>
            <View style={{ flex: 1 }}>
              <Bouton
                titre={`Voir les tâches de ${enfant.prenom}`}
                onPress={() => {
                  fermerBandeau();
                  navigation.navigate('TachesEnfant', { personneId: enfant.id, prenom: enfant.prenom });
                }}
              />
            </View>
            <Bouton titre="OK" variante="discret" onPress={fermerBandeau} />
          </View>
        </Carte>
      ) : null}

      {!semaine ? (
        <Chargement />
      ) : (
        <>
          <Carte accent>
            <Text style={styles.sousTitre}>Argent de poche · semaine du {jourCourt(semaine.lundi)}</Text>
            <Text style={styles.montant}>{formaterCentimes(semaine.montant)}</Text>
            {statut ? <Pastille texte={statut.texte} ton={statut.ton} /> : null}
            {semaine.obligatoires_prevues + semaine.aides_prevues === 0 ? (
              <Text style={styles.detail}>
                {enfant.prenom} n’a pas encore de tâche cette semaine : sans tâche, il n’y a pas de bilan ni de versement.
              </Text>
            ) : (
              <Text style={styles.detail}>{messageStatut(semaine)}</Text>
            )}
            <Bouton
              titre="Voir le bilan de dimanche"
              variante="discret"
              onPress={() => navigation.navigate('Bilan', { lundi: semaine.lundi })}
            />
            <Text style={styles.detail}>Tirelire : {formaterCentimes(solde)}</Text>
          </Carte>

          {semaine.en_attente.length > 0 ? (
            <>
              <TitreSection titre="À valider" />
              {semaine.en_attente.map((r) => (
                <Carte key={r.realisation_id}>
                  <Text style={styles.nomTache}>
                    {r.type === 'coup_de_main' ? 'Coup de main' : 'Obligatoire'} · {r.libelle}
                  </Text>
                  <Text style={styles.detail}>
                    {enfant.prenom} dit l’avoir fait {r.date === semaine.aujourdhui ? 'à' : `le ${nomDuJour(r.date)} à`} {heureCourte(r.cree_le)}
                  </Text>
                  <View style={styles.ligne}>
                    <View style={{ flex: 1 }}>
                      <Bouton
                        titre="Pas fait"
                        variante="contour"
                        enCours={enCours === `refus:${r.realisation_id}`}
                        onPress={() => agir(`refus:${r.realisation_id}`, () => annulerRealisation(r.realisation_id))}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Bouton
                        titre="Valider"
                        enCours={enCours === `ok:${r.realisation_id}`}
                        onPress={() => agir(`ok:${r.realisation_id}`, () => validerRealisation(r.realisation_id))}
                      />
                    </View>
                  </View>
                </Carte>
              ))}
            </>
          ) : null}

          {semaine.obligatoires.length > 0 ? (
            <>
              <TitreSection titre="Obligatoires" detail="chaque jour prévu" />
              <Carte>
                <GrilleSemaine obligatoires={semaine.obligatoires} aujourdhui={semaine.aujourdhui} onCase={toucherCase} />
              </Carte>
            </>
          ) : null}

          {semaine.coups_de_main.length > 0 ? (
            <>
              <TitreSection titre="Coups de main" detail={`${aidesFaites} sur ${aidesPrevues} · quand on veut`} />
              <Carte>
                {semaine.coups_de_main.map((a) => (
                  <LigneCoupDeMain key={a.id} aide={a} onAjouter={ajouterAide} enCours={enCours === `aide:${a.id}`} />
                ))}
              </Carte>
            </>
          ) : null}

          <Bouton titre={`Ouvrir l’espace de ${enfant.prenom}`} variante="contour" onPress={ouvrirEspace} />
          <Bouton
            titre={`Gérer les tâches de ${enfant.prenom}`}
            variante="pointille"
            onPress={() => navigation.navigate('TachesEnfant', { personneId: enfant.id, prenom: enfant.prenom })}
          />
          <Bouton
            titre="Historique de la tirelire"
            variante="discret"
            onPress={() => navigation.navigate('Tirelire', { personneId: enfant.id, prenom: enfant.prenom })}
          />
        </>
      )}
    </ScrollView>
  );
}

const styles = creerStylesThemes(() => ({
  flex: { flex: 1, backgroundColor: theme.colors.background },
  contenu: { padding: theme.spacing.md, gap: theme.spacing.sm, paddingBottom: theme.spacing.xl },
  ligne: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
  sousTitre: { fontFamily: theme.fontBodyBold, fontSize: 14, color: theme.colors.textMuted },
  montant: { fontFamily: theme.fontTitle, fontSize: 40, color: theme.colors.accent },
  titreBandeau: { fontFamily: theme.fontBodyBold, fontSize: 15, color: theme.colors.text },
  nomTache: { fontFamily: theme.fontBodyBold, fontSize: 16, color: theme.colors.text },
  detail: { fontFamily: theme.fontBody, fontSize: 14, color: theme.colors.textMuted },
}));
