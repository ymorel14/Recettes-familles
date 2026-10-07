import React, { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { theme, creerStylesThemes } from '../theme/theme';
import { BandeauDemo, Carte, TitreSection } from '../components/elements';
import CarteTrajet from '../components/CarteTrajet';
import { Bouton, Chargement } from '../components/ui';
import { alerte } from '../utils/alerte';
import { extraireMessageErreur } from '@apps-famille/famille';
import { useCovoiturage } from '../hooks/useCovoiturage';
import { aujourdHuiIso, inscrireEnfant, laisserTrajet, prendreTrajet } from '../services/quotidien';
import { TACHES_DEMO, TIRELIRES_DEMO, formaterPoints } from '../donnees/demo';

// Accueil « Aujourd'hui » : la journée en un coup d'œil. Trajets réels
// (Supabase) ; tâches et tirelires encore en démonstration (Phases 3 et 4).
export default function AujourdhuiScreen({ navigation }: any) {
  const c = useCovoiturage(7);
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
  const restantes = TACHES_DEMO.filter((t) => t.etat === 'a_faire');
  const aValider = TACHES_DEMO.filter((t) => t.etat === 'faite');
  const plusieurs = c.groupes.length > 1;

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.contenu}>
      <Text style={styles.date}>{date.charAt(0).toUpperCase() + date.slice(1)}</Text>

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

      <TitreSection titre="Tâches" detail={`${restantes.length} à faire · ${aValider.length} à valider`} />
      <BandeauDemo />
      <Carte>
        {restantes.slice(0, 3).map((t) => (
          <Text key={t.id} style={styles.ligne}>
            {t.pour} · {t.libelle}
          </Text>
        ))}
      </Carte>

      <TitreSection titre="Tirelires" />
      <View style={styles.rangee}>
        {TIRELIRES_DEMO.map((t) => (
          <View key={t.enfant} style={styles.tuile}>
            <Text style={styles.tuilePrenom}>{t.enfant}</Text>
            <Text style={styles.tuileSolde}>{formaterPoints(t.solde)}</Text>
          </View>
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
  rangee: { flexDirection: 'row', gap: theme.spacing.sm },
  tuile: {
    flex: 1,
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radii.lg,
    padding: theme.spacing.md,
    gap: 2,
  },
  tuilePrenom: { fontFamily: theme.fontBodyBold, fontSize: 15, color: theme.colors.text },
  tuileSolde: { fontFamily: theme.fontTitle, fontSize: 18, color: theme.colors.accent },
}));
