import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { theme, creerStylesThemes } from '../theme/theme';
import { Chargement, MessageVide } from '../components/ui';
import { alerte } from '../utils/alerte';
import { extraireMessageErreur } from '@apps-famille/famille';
import { annulerFaiteEnfant, formaterPoints, marquerFaiteEnfant, vueEnfant, type VueEnfant } from '../services/maison';

// Espace d'un ENFANT, ouvert par le lien que ses parents lui ont donné
// (<site>/quotidien/enfant/<jeton>), sans compte : ses tâches du jour avec
// « J'ai fini » (un parent valide ensuite, les points arrivent alors), sa
// tirelire et son objectif. Tout passe par les fonctions *_enfant de la
// base, qui vérifient le jeton.
export default function EnfantScreen({ jeton }: { jeton: string }) {
  const [vue, setVue] = useState<VueEnfant | null>(null);
  const [erreur, setErreur] = useState(false);
  const [enCours, setEnCours] = useState<string | null>(null);

  const charger = useCallback(async () => {
    try {
      setVue(await vueEnfant(jeton));
      setErreur(false);
    } catch {
      setErreur(true);
    }
  }, [jeton]);

  useEffect(() => {
    charger();
  }, [charger]);

  const agir = async (id: string, action: () => Promise<void>) => {
    setEnCours(id);
    try {
      await action();
      await charger();
    } catch (e) {
      alerte('Oups', extraireMessageErreur(e, 'Réessaie dans un moment.'));
    } finally {
      setEnCours(null);
    }
  };

  if (erreur) {
    return (
      <View style={styles.flex}>
        <MessageVide titre="Ce lien ne marche plus" texte="Demande un nouveau lien à tes parents." />
      </View>
    );
  }
  if (!vue) return <Chargement />;

  const taux = vue.points_par_euro || 10;
  const restantes = vue.taches.filter((t) => !t.realisation);
  const progression = vue.objectif_points ? Math.max(0, Math.min(1, vue.solde / vue.objectif_points)) : 0;
  const manque = vue.objectif_points ? Math.max(0, vue.objectif_points - vue.solde) : 0;

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.contenu}>
      <Text style={styles.bonjour}>Bonjour {vue.prenom ?? ''} !</Text>
      <Text style={styles.sousTitre}>
        {vue.taches.length === 0
          ? 'Pas de tâche aujourd’hui.'
          : restantes.length === 0
            ? 'Tout est fait aujourd’hui, bravo !'
            : `Encore ${restantes.length} tâche${restantes.length > 1 ? 's' : ''} aujourd’hui.`}
      </Text>

      {vue.taches.map((t) => {
        const r = t.realisation;
        const parAutre = r && r.personne_id && r.etat && r.prenom && r.prenom !== vue.prenom;
        return (
          <View key={t.id} style={[styles.tache, r?.etat === 'validee' && styles.tacheValidee]}>
            <View style={styles.ligne}>
              <Text style={styles.tacheNom}>{t.libelle}</Text>
              {t.points > 0 && <Text style={styles.points}>+{t.points}</Text>}
            </View>
            {!r ? (
              <Pressable
                style={({ pressed }) => [styles.boutonFini, pressed && { opacity: 0.7 }]}
                onPress={() => agir(t.id, () => marquerFaiteEnfant(jeton, t.id))}
                disabled={enCours !== null}
                accessibilityRole="button"
                accessibilityLabel={`J'ai fini : ${t.libelle}`}
              >
                <Ionicons name="checkmark-circle-outline" size={26} color={theme.colors.background} />
                <Text style={styles.boutonFiniTexte}>J’ai fini</Text>
              </Pressable>
            ) : parAutre ? (
              <Text style={styles.etat}>Faite par {r.prenom}</Text>
            ) : r.etat === 'faite' ? (
              <View style={styles.ligne}>
                <Ionicons name="hourglass-outline" size={20} color={theme.colors.accent} />
                <Text style={[styles.etat, { flex: 1 }]}>Bien joué ! Un parent va vérifier.</Text>
                <Pressable onPress={() => agir(t.id, () => annulerFaiteEnfant(jeton, t.id))} hitSlop={8} accessibilityRole="button">
                  <Text style={styles.lienDiscret}>Annuler</Text>
                </Pressable>
              </View>
            ) : (
              <View style={styles.ligne}>
                <Ionicons name="checkmark-circle" size={22} color={theme.colors.success} />
                <Text style={styles.etat}>Validée{t.points > 0 ? ` : +${t.points} points !` : ''}</Text>
              </View>
            )}
          </View>
        );
      })}

      <Text style={styles.titre}>Ma tirelire</Text>
      <View style={styles.tirelire}>
        <Text style={styles.solde}>{formaterPoints(vue.solde, taux)}</Text>
        {vue.objectif_points ? (
          <>
            <Text style={styles.etat}>
              {vue.objectif_libelle ?? 'Mon objectif'} : {manque > 0 ? `encore ${manque} points` : 'objectif atteint !'}
            </Text>
            <View style={styles.barreFond} accessibilityLabel={`${Math.round(progression * 100)} % de l'objectif`}>
              <View style={[styles.barre, { width: `${progression * 100}%` }]} />
            </View>
          </>
        ) : null}
        {vue.hebdomadaire ? <Text style={styles.detail}>+{vue.hebdomadaire} points chaque semaine</Text> : null}
      </View>

      {vue.mouvements.length > 0 && <Text style={styles.titre}>Derniers mouvements</Text>}
      {vue.mouvements.map((m) => (
        <View key={m.id} style={styles.ligne}>
          <Text style={[styles.detail, { flex: 1 }]} numberOfLines={1}>
            {m.libelle}
          </Text>
          <Text style={[styles.montant, { color: m.points < 0 ? theme.colors.warning : theme.colors.success }]}>
            {m.points > 0 ? '+' : '−'}
            {Math.abs(m.points)}
          </Text>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = creerStylesThemes(() => ({
  flex: { flex: 1, backgroundColor: theme.colors.background },
  contenu: { padding: theme.spacing.md, gap: theme.spacing.sm, paddingTop: theme.spacing.lg, paddingBottom: theme.spacing.xl },
  bonjour: { fontFamily: theme.fontTitle, fontSize: 32, color: theme.colors.accent },
  sousTitre: { fontFamily: theme.fontBody, fontSize: 17, color: theme.colors.text, marginBottom: theme.spacing.sm },
  titre: { fontFamily: theme.fontTitle, fontSize: 22, color: theme.colors.text, marginTop: theme.spacing.md },
  tache: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radii.lg,
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  tacheValidee: { opacity: 0.75 },
  ligne: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
  tacheNom: { flex: 1, fontFamily: theme.fontBodyBold, fontSize: 19, color: theme.colors.text },
  points: { fontFamily: theme.fontTitle, fontSize: 20, color: theme.colors.accent },
  boutonFini: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.sm,
    borderRadius: theme.radii.lg,
    backgroundColor: theme.colors.accent,
  },
  boutonFiniTexte: { fontFamily: theme.fontBodyBold, fontSize: 19, color: theme.colors.background },
  etat: { fontFamily: theme.fontBodyBold, fontSize: 15, color: theme.colors.text },
  lienDiscret: { fontFamily: theme.fontBody, fontSize: 14, color: theme.colors.textMuted, textDecorationLine: 'underline' },
  tirelire: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.accent,
    borderWidth: 1.5,
    borderRadius: theme.radii.lg,
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  solde: { fontFamily: theme.fontTitle, fontSize: 26, color: theme.colors.accent },
  barreFond: { height: 14, borderRadius: 7, backgroundColor: theme.colors.selectionTransparent },
  barre: { height: 14, borderRadius: 7, backgroundColor: theme.colors.accent },
  detail: { fontFamily: theme.fontBody, fontSize: 14, color: theme.colors.textMuted },
  montant: { fontFamily: theme.fontBodyBold, fontSize: 15 },
}));
