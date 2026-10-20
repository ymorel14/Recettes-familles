import React, { useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { theme, creerStylesThemes } from '../theme/theme';
import { TitreSection } from '../components/elements';
import CarteTrajet from '../components/CarteTrajet';
import { Bouton, Chargement, MessageVide } from '../components/ui';
import { alerte } from '../utils/alerte';
import { extraireMessageErreur } from '@apps-famille/famille';
import { useCovoiturage } from '../hooks/useCovoiturage';
import { accepterTrajet, inscrireEnfant, laisserTrajet, libelleJour, prendreTrajet } from '../services/quotidien';

// Trajets des trois prochaines semaines, tous groupes confondus, regroupés
// par jour ; en haut, mes groupes (équipe, club, classe).
export default function TrajetsScreen({ navigation }: any) {
  const c = useCovoiturage(21);
  const [enCours, setEnCours] = useState<string | null>(null);

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

  if (c.chargement) return <Chargement />;

  const jours = Array.from(new Set(c.trajets.map((t) => t.date)));
  const plusieurs = c.groupes.length > 1;

  return (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={styles.contenu}
      refreshControl={<RefreshControl refreshing={false} onRefresh={c.recharger} />}
    >
      {c.erreur && <Text style={styles.erreur}>{c.erreur}</Text>}

      <TitreSection titre="Mes groupes" />
      <View style={styles.groupes}>
        {c.groupes.map((g) => (
          <Pressable
            key={g.id}
            style={styles.groupe}
            onPress={() => navigation.navigate('Groupe', { id: g.id })}
            accessibilityRole="button"
          >
            <Ionicons name="people-outline" size={18} color={theme.colors.accent} />
            <Text style={styles.groupeNom} numberOfLines={1}>
              {g.nom}
            </Text>
          </Pressable>
        ))}
        <Pressable
          style={[styles.groupe, styles.groupeAjout]}
          onPress={() => navigation.navigate('GroupeForm')}
          accessibilityRole="button"
        >
          <Ionicons name="add" size={18} color={theme.colors.accent} />
          <Text style={styles.groupeNom}>Créer ou rejoindre</Text>
        </Pressable>
      </View>

      {c.groupes.length === 0 ? (
        <MessageVide
          titre="Pas encore de groupe"
          texte="Créez le groupe de l'équipe, du club ou de la classe, puis partagez son code avec les autres parents. Ou saisissez le code qu'un parent vous a envoyé."
        />
      ) : jours.length === 0 ? (
        <MessageVide
          titre="Aucun trajet à venir"
          texte="Ouvrez un groupe et ajoutez son activité (jour, horaires, période) : les séances et leurs trajets se créent tout seuls."
        />
      ) : (
        jours.map((jour) => (
          <View key={jour} style={styles.jour}>
            <TitreSection titre={libelleJour(jour)} />
            {c.trajets
              .filter((t) => t.date === jour)
              .map((t) => (
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
              ))}
          </View>
        ))
      )}
      {c.groupes.length > 0 && (
        <Bouton variante="discret" titre="Actualiser" onPress={c.recharger} />
      )}
    </ScrollView>
  );
}

const styles = creerStylesThemes(() => ({
  flex: { flex: 1, backgroundColor: theme.colors.background },
  contenu: { padding: theme.spacing.md, gap: theme.spacing.sm, paddingBottom: theme.spacing.xl },
  jour: { gap: theme.spacing.sm },
  groupes: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.xs },
  groupe: {
    minHeight: 44,
    maxWidth: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: theme.spacing.sm,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  groupeAjout: { borderStyle: 'dashed', backgroundColor: 'transparent' },
  groupeNom: { fontFamily: theme.fontBodyBold, fontSize: 14, color: theme.colors.text, flexShrink: 1 },
  erreur: { fontFamily: theme.fontBody, fontSize: 14, color: theme.colors.warning },
}));
