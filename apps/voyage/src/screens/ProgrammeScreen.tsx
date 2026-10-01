import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { theme, creerStylesThemes } from '../theme/theme';
import { useAuth } from '../contexts/AuthContext';
import { listerPersonnesParIds, MOIS } from '../services/personnes';
import { listerHebergements, type Hebergement } from '../services/hebergements';
import { listerTrajets, MODES_TRAJET, formaterDuree, type Trajet } from '../services/transport';
import { CATEGORIES_ACTIVITE, listerActivites, planifierActivite, type Activite } from '../services/activites';
import { estOrganisateur, messageErreurVoyage, obtenirVoyage, type VoyageAvecParticipants } from '../services/voyage';
import { Aide, Erreur, Puces } from '../components/formulaire';
import { Bouton, Chargement, MessageVide } from '../components/ui';

const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const JOURS_COURTS = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];

function dateLocale(iso: string): Date {
  const [a, m, j] = iso.split('-').map(Number);
  return new Date(a, m - 1, j);
}
function versIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
// Jours du séjour, du premier au dernier inclus.
function joursDuSejour(debut: string, fin: string): string[] {
  const jours: string[] = [];
  for (let d = dateLocale(debut); versIso(d) <= fin; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
    jours.push(versIso(d));
  }
  return jours;
}
const libelleJour = (iso: string) => {
  const d = dateLocale(iso);
  return `${JOURS[d.getDay()].charAt(0).toUpperCase()}${JOURS[d.getDay()].slice(1)} ${d.getDate()} ${MOIS[d.getMonth()]}`;
};
const libelleCourt = (iso: string) => {
  const d = dateLocale(iso);
  return `${JOURS_COURTS[d.getDay()]} ${d.getDate()}`;
};

// Programme jour par jour : arrivée et départ (trajets, hébergement), et les
// activités retenues, placées sur les jours du séjour.
export default function ProgrammeScreen({ route, navigation }: any) {
  const voyageId: string = route.params?.voyageId;
  const { session } = useAuth();
  const moiId = session?.user.id ?? '';

  const [donnees, setDonnees] = useState<{
    voyage: VoyageAvecParticipants;
    activites: Activite[];
    trajets: Trajet[];
    hebergements: Hebergement[];
    maPersonneId: string | null;
  } | null>(null);
  const [erreurChargement, setErreurChargement] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [aDeplacer, setADeplacer] = useState<string | null>(null);

  const charger = useCallback(async () => {
    try {
      const [voyage, activites, trajets, hebergements] = await Promise.all([
        obtenirVoyage(voyageId),
        listerActivites(voyageId),
        listerTrajets(voyageId),
        listerHebergements(voyageId),
      ]);
      const personnes = await listerPersonnesParIds(voyage.participants.map((p) => p.personne_id));
      const maPersonneId = personnes.find((p) => p.utilisateur_id === moiId)?.id ?? null;
      setDonnees({ voyage, activites, trajets, hebergements, maPersonneId });
    } catch (e) {
      setErreurChargement(messageErreurVoyage(e));
    }
  }, [voyageId, moiId]);

  useFocusEffect(
    useCallback(() => {
      charger();
    }, [charger])
  );

  if (erreurChargement) return <MessageVide titre="Programme indisponible" texte={erreurChargement} />;
  if (!donnees) return <Chargement />;
  const { voyage, activites, trajets, hebergements, maPersonneId } = donnees;

  if (!voyage.date_debut || !voyage.date_fin) {
    return (
      <View style={styles.flex}>
        <MessageVide titre="Dates à fixer" texte="Le programme se construit jour par jour une fois les dates du voyage retenues." />
        <Bouton
          titre="Choisir les dates"
          variante="contour"
          onPress={() => navigation.navigate('Dates', { voyageId })}
          style={{ marginHorizontal: theme.spacing.md }}
        />
      </View>
    );
  }

  const organisateur = estOrganisateur(voyage, moiId, maPersonneId);
  const jours = joursDuSejour(voyage.date_debut, voyage.date_fin);
  const retenues = activites.filter((a) => a.statut === 'retenu');
  const aPlacer = retenues.filter((a) => !a.jour || !jours.includes(a.jour));
  const logement = hebergements.find((h) => h.statut === 'retenu');

  const deplacer = async (a: Activite, jour: string | null) => {
    setErreur(null);
    try {
      await planifierActivite(a.id, jour);
      setADeplacer(null);
      await charger();
    } catch (e) {
      setErreur(messageErreurVoyage(e));
    }
  };

  const ligneTrajet = (t: Trajet, sens: 'aller' | 'retour') => {
    const mode = MODES_TRAJET.find((m) => m.id === t.mode) ?? MODES_TRAJET[0];
    const nom = t.libelle || (t.ville_depart ? `Depuis ${t.ville_depart}` : mode.libelle);
    return (
      <View key={`${t.id}-${sens}`} style={styles.ligne}>
        <Ionicons name={mode.icone as any} size={18} color={theme.colors.textMuted} />
        <Text style={styles.ligneTexte}>
          {sens === 'aller' ? nom : `Retour ${t.ville_depart ? `vers ${t.ville_depart}` : ''}`.trim()}
          {t.duree_minutes ? ` · ${formaterDuree(t.duree_minutes)}` : ''}
        </Text>
      </View>
    );
  };

  const carteActivite = (a: Activite) => {
    const cat = CATEGORIES_ACTIVITE.find((c) => c.id === a.categorie) ?? CATEGORIES_ACTIVITE[0];
    const peutDeplacer = organisateur || a.propose_par === moiId;
    const ouvert = aDeplacer === a.id;
    return (
      <View key={a.id} style={styles.activite}>
        <View style={styles.ligne}>
          <Ionicons name={cat.icone as any} size={18} color={theme.colors.accent} />
          <Text style={[styles.ligneTexte, styles.activiteTitre]}>{a.titre}</Text>
          {peutDeplacer && (
            <Bouton
              titre={ouvert ? 'Fermer' : a.jour && jours.includes(a.jour) ? 'Déplacer' : 'Placer'}
              variante="discret"
              onPress={() => setADeplacer(ouvert ? null : a.id)}
            />
          )}
        </View>
        {ouvert && (
          <Puces
            options={[...jours.map((j) => ({ id: j, libelle: libelleCourt(j) })), { id: 'aucun', libelle: 'À placer' }]}
            valeur={a.jour && jours.includes(a.jour) ? a.jour : 'aucun'}
            onChange={(j) => deplacer(a, j === 'aucun' ? null : j)}
          />
        )}
      </View>
    );
  };

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.contenu}>
      <Erreur texte={erreur} />
      {aPlacer.length > 0 && (
        <View style={[styles.jour, styles.aPlacer]}>
          <Text style={styles.jourTitre}>À placer</Text>
          <Aide>Activités retenues sans jour : choisissez quand y aller.</Aide>
          {aPlacer.map(carteActivite)}
        </View>
      )}

      {jours.map((j, i) => {
        const premier = i === 0;
        const dernier = i === jours.length - 1;
        const duJour = retenues.filter((a) => a.jour === j);
        return (
          <View key={j} style={styles.jour}>
            <Text style={styles.jourTitre}>{libelleJour(j)}</Text>
            <Text style={styles.jourSous}>
              {premier ? 'Arrivée' : dernier ? 'Départ' : `Jour ${i + 1}`}
            </Text>
            {premier && trajets.map((t) => ligneTrajet(t, 'aller'))}
            {premier && logement && (
              <View style={styles.ligne}>
                <Ionicons name="home-outline" size={18} color={theme.colors.textMuted} />
                <Text style={styles.ligneTexte}>Arrivée au {logement.nom}</Text>
              </View>
            )}
            {duJour.map(carteActivite)}
            {!premier && !dernier && duJour.length === 0 && <Text style={styles.libre}>Journée libre</Text>}
            {dernier && logement && (
              <View style={styles.ligne}>
                <Ionicons name="home-outline" size={18} color={theme.colors.textMuted} />
                <Text style={styles.ligneTexte}>Départ du {logement.nom}</Text>
              </View>
            )}
            {dernier && trajets.filter((t) => t.aller_retour).map((t) => ligneTrajet(t, 'retour'))}
          </View>
        );
      })}

      <Bouton
        titre="+ Proposer une activité"
        variante="pointille"
        onPress={() => navigation.navigate('Activites', { voyageId })}
      />
      <Aide>Seules les activités retenues apparaissent au programme.</Aide>
    </ScrollView>
  );
}

const styles = creerStylesThemes(() => ({
  flex: { flex: 1, backgroundColor: theme.colors.background },
  contenu: { padding: theme.spacing.md, gap: theme.spacing.sm, paddingBottom: theme.spacing.xl },
  jour: {
    gap: theme.spacing.xs,
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radii.lg,
    padding: theme.spacing.md,
  },
  aPlacer: { borderStyle: 'dashed' },
  jourTitre: { fontFamily: theme.fontTitle, fontSize: 18, color: theme.colors.text },
  jourSous: {
    fontFamily: theme.fontBodyBold,
    fontSize: 12,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: theme.colors.textMuted,
  },
  ligne: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, minHeight: 32 },
  ligneTexte: { flex: 1, fontFamily: theme.fontBody, fontSize: 15, color: theme.colors.text },
  activite: { gap: 4 },
  activiteTitre: { fontFamily: theme.fontBodyBold },
  libre: { fontFamily: theme.fontManuscrit, fontSize: 14, color: theme.colors.textMuted },
}));
