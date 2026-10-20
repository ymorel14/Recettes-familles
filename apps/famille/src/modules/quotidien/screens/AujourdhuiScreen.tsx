import React, { useCallback, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { theme, creerStylesThemes } from '../theme/theme';
import { Carte, TitreSection } from '../components/elements';
import CarteTrajet from '../components/CarteTrajet';
import PropositionRappels from '../components/PropositionRappels';
import { Bouton, Chargement } from '../components/ui';
import { alerte } from '../utils/alerte';
import { extraireMessageErreur } from '@apps-famille/famille';
import { useCovoiturage } from '../hooks/useCovoiturage';
import { accepterTrajet, aujourdHuiIso, inscrireEnfant, laisserTrajet, prendreTrajet } from '../services/quotidien';
import { useAuth } from '../contexts/AuthContext';
import { listerPersonnes, type Personne } from '../services/personnes';
import { formaterPoints, pointsParEuro, soldes, tachesDuJour, verserArgentDePoche, type TacheDuJour } from '../services/maison';

// Accueil « Aujourd'hui » : la journée en un coup d'œil. Trajets réels
// (Supabase) : trajets du jour, tâches restantes, tirelires des enfants.
export default function AujourdhuiScreen({ navigation }: any) {
  const c = useCovoiturage(7);
  const { foyer } = useAuth();
  const [taches, setTaches] = useState<TacheDuJour[]>([]);
  const [enfants, setEnfants] = useState<Personne[]>([]);
  const [lesSoldes, setSoldes] = useState<Map<string, number>>(new Map());
  const [taux, setTaux] = useState(10);

  useFocusEffect(
    useCallback(() => {
      if (!foyer) return;
      let actif = true;
      (async () => {
        try {
          await verserArgentDePoche();
          const [td, ps, ss, tx] = await Promise.all([
            tachesDuJour(aujourdHuiIso()),
            listerPersonnes([foyer.id]),
            soldes(),
            pointsParEuro(),
          ]);
          if (!actif) return;
          setTaches(td);
          setEnfants(ps.filter((p) => !p.utilisateur_id));
          setSoldes(ss);
          setTaux(tx);
        } catch {
          // l'accueil reste utilisable sans ces résumés
        }
      })();
      return () => {
        actif = false;
      };
    }, [foyer])
  );
  const [enCours, setEnCours] = useState<string | null>(null);
  const date = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });

  const agir = async (id: string, action: () => Promise<void>) => {
    setEnCours(id);
    try {
      await action();
      await c.recharger();
    } catch (e) {
      alerte('Action impossible', extraireMessageErreur(e, 'Veuillez réessayer.'));
    } finally {
      setEnCours(null);
    }
  };

  const duJour = c.trajets.filter((t) => t.date === aujourdHuiIso());
  const libresSemaine = c.trajets.filter((t) => !t.conducteur_id && t.statut === 'prevue' && t.date !== aujourdHuiIso()).length;
  const restantes = taches.filter((t) => !t.realisation);
  const aValider = taches.filter((t) => t.realisation?.etat === 'faite').length;
  const faites = taches.length - restantes.length - aValider;
  const plusieurs = c.groupes.length > 1;

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.contenu}>
      <Text style={styles.date}>{date.charAt(0).toUpperCase() + date.slice(1)}</Text>
      {c.groupes.length > 0 && <PropositionRappels />}

      <TitreSection titre="Trajets du jour" detail={duJour.length ? `${duJour.length}` : undefined} />
      {c.chargement ? (
        <Chargement />
      ) : c.groupes.length === 0 ? (
        <Carte>
          <Text style={styles.ligne}>Organisez les trajets des activités avec les autres parents.</Text>
          <Bouton titre="Créer ou rejoindre un groupe" onPress={() => navigation.navigate('GroupeForm')} />
        </Carte>
      ) : duJour.length === 0 ? (
        <Carte>
          <Text style={styles.ligne}>Aucun trajet aujourd’hui.</Text>
        </Carte>
      ) : (
        duJour.map((t) => (
          <CarteTrajet
            key={t.id}
            trajet={t}
            conducteur={c.nomParticipant(t.conducteur_id)}
            moi={!!t.conducteur_id && c.idsMiens.has(t.conducteur_id)}
            groupe={plusieurs ? c.groupes.find((g) => g.id === t.groupe_id)?.nom : null}
            mesEnfants={c.mesEnfants(t.groupe_id)}
            enCours={enCours === t.id}
            onPrendre={() => agir(t.id, () => prendreTrajet(t.id))}
            onAccepter={() => agir(t.id, () => accepterTrajet(t.id))}
            onLaisser={() => agir(t.id, () => laisserTrajet(t.id))}
            onBasculerEnfant={(e, oui) => agir(t.id, () => inscrireEnfant(t.id, e, oui))}
          />
        ))
      )}
      {libresSemaine > 0 && (
        <Bouton
          variante="contour"
          titre={`${libresSemaine} trajet${libresSemaine > 1 ? 's' : ''} sans conducteur cette semaine`}
          onPress={() => navigation.navigate('Trajets')}
        />
      )}

      <TitreSection titre="Tâches" detail={taches.length ? `${restantes.length} à faire${aValider ? ` · ${aValider} à valider` : ''} · ${faites} faite${faites > 1 ? 's' : ''}` : undefined} />
      <Pressable onPress={() => navigation.navigate('Taches')} accessibilityRole="button" accessibilityLabel="Voir les tâches">
        <Carte>
          {taches.length === 0 ? (
            <Text style={styles.ligne}>Aucune tâche prévue aujourd’hui.</Text>
          ) : restantes.length === 0 ? (
            <Text style={styles.ligne}>Tout est fait, bravo !</Text>
          ) : (
            restantes.slice(0, 4).map((t) => (
              <Text key={t.id} style={styles.ligne}>
                {t.pour_prenom ?? 'Qui veut'} · {t.libelle}
              </Text>
            ))
          )}
        </Carte>
      </Pressable>

      {enfants.length > 0 && <TitreSection titre="Tirelires" />}
      <View style={styles.rangee}>
        {enfants.map((e) => (
          <Pressable
            key={e.id}
            style={styles.tuile}
            onPress={() => navigation.navigate('Tirelire', { personneId: e.id, prenom: e.prenom })}
            accessibilityRole="button"
            accessibilityLabel={`Tirelire de ${e.prenom}`}
          >
            <Text style={styles.tuilePrenom}>{e.prenom}</Text>
            <Text style={styles.tuileSolde}>{formaterPoints(lesSoldes.get(e.id) ?? 0, taux)}</Text>
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = creerStylesThemes(() => ({
  flex: { flex: 1, backgroundColor: theme.colors.background },
  contenu: { padding: theme.spacing.md, gap: theme.spacing.sm, paddingBottom: theme.spacing.xl },
  date: { fontFamily: theme.fontManuscrit, fontSize: 16, color: theme.colors.textMuted },
  ligne: { fontFamily: theme.fontBody, fontSize: 15, color: theme.colors.text, paddingVertical: 2 },
  rangee: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm },
  tuile: {
    flexGrow: 1,
    flexBasis: '45%',
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radii.lg,
    padding: theme.spacing.md,
    gap: 2,
  },
  tuilePrenom: { fontFamily: theme.fontBodyBold, fontSize: 15, color: theme.colors.text },
  tuileSolde: { fontFamily: theme.fontTitle, fontSize: 16, color: theme.colors.accent },
}));
