import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { theme, creerStylesThemes } from '../theme/theme';
import { Chargement, MessageVide } from '../components/ui';
import { alerte } from '../utils/alerte';
import { extraireMessageErreur } from '@apps-famille/famille';
import {
  annulerFaiteEnfant,
  formaterCentimes,
  marquerAideEnfant,
  marquerFaiteEnfant,
  resteDeLaSemaine,
  vueEnfant,
  type CoupDeMainSemaine,
  type TacheDuJour,
  type VueEnfant,
} from '../services/maison';

// Espace d'un ENFANT, ouvert par le lien que ses parents lui ont donné
// (<site>/quotidien/enfant/<jeton>), sans compte (refonte Quotidien § 4.7) :
//   - Aujourd'hui : ses obligatoires du jour avec « J'ai fini » (un parent
//     valide ensuite) ;
//   - Mes coups de main : « J'en ai fait un », barre « 2 sur 3 » ;
//   - Ma tirelire : solde en euros, « Dimanche : +5 € si tout est fait ».
// Tout passe par les fonctions *_enfant de la base, qui vérifient le jeton.
// Plus de points affichés nulle part.
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

  const semaine = vue.semaine;

  // Obligatoires du jour (état de CET enfant), puis anciennes tâches du jour.
  const obligatoiresDuJour = (semaine?.obligatoires ?? [])
    .map((o) => ({ tache: o, jour: o.jours.find((j) => j.date === semaine?.aujourdhui) }))
    .filter((x) => x.jour && x.jour.etat !== 'non_prevu');
  const anciennes: TacheDuJour[] = vue.taches.filter((t) => t.type !== 'obligatoire');
  const restantes =
    obligatoiresDuJour.filter((x) => x.jour?.etat === 'a_faire' || x.jour?.etat === 'oublie').length +
    anciennes.filter((t) => !t.realisation).length;
  const total = obligatoiresDuJour.length + anciennes.length;

  const montant = vue.montant_semaine ?? vue.hebdomadaire ?? 0;
  const progression = vue.objectif_points ? Math.max(0, Math.min(1, vue.solde / vue.objectif_points)) : 0;
  const manque = vue.objectif_points ? Math.max(0, vue.objectif_points - vue.solde) : 0;

  const boutonFini = (id: string, libelle: string, action: () => Promise<void>) => (
    <Pressable
      style={({ pressed }) => [styles.boutonFini, pressed && { opacity: 0.7 }]}
      onPress={() => agir(id, action)}
      disabled={enCours !== null}
      accessibilityRole="button"
      accessibilityLabel={`J'ai fini : ${libelle}`}
    >
      <Ionicons name="checkmark-circle-outline" size={26} color={theme.colors.background} />
      <Text style={styles.boutonFiniTexte}>J’ai fini</Text>
    </Pressable>
  );

  const attente = (id: string) => (
    <View style={styles.ligne}>
      <Ionicons name="hourglass-outline" size={20} color={theme.colors.accent} />
      <Text style={[styles.etat, { flex: 1 }]}>Bien joué ! Un parent va vérifier.</Text>
      <Pressable
        onPress={() => agir(id, () => annulerFaiteEnfant(jeton, id))}
        hitSlop={8}
        accessibilityRole="button"
        style={styles.zoneLien}
      >
        <Text style={styles.lienDiscret}>Annuler</Text>
      </Pressable>
    </View>
  );

  const validee = (
    <View style={styles.ligne}>
      <Ionicons name="checkmark-circle" size={22} color={theme.colors.success} />
      <Text style={styles.etat}>Validée</Text>
    </View>
  );

  const carteAide = (a: CoupDeMainSemaine) => {
    const atteint = a.n >= a.total;
    const demain = !atteint && a.max_un_par_jour && a.fait_aujourdhui;
    return (
      <View key={a.id} style={styles.tache}>
        <View style={styles.ligne}>
          <Text style={styles.tacheNom}>{a.libelle}</Text>
          <Text style={styles.compte}>
            {a.n} sur {a.total}
          </Text>
        </View>
        <View
          style={styles.barreFond}
          accessibilityRole="progressbar"
          accessibilityLabel={`${a.libelle} : ${a.n} sur ${a.total}`}
        >
          <View style={[styles.barre, { width: `${Math.min(1, a.n / a.total) * 100}%` }]} />
        </View>
        {a.en_attente > 0 ? (
          <Text style={styles.detail}>{a.en_attente} en attente : un parent va vérifier.</Text>
        ) : null}
        {atteint ? (
          <View style={styles.ligne}>
            <Ionicons name="checkmark-circle" size={22} color={theme.colors.success} />
            <Text style={styles.etat}>C’est bon pour la semaine !</Text>
          </View>
        ) : demain ? (
          <Text style={styles.etat}>Reviens demain !</Text>
        ) : (
          <Pressable
            style={({ pressed }) => [styles.boutonFini, pressed && { opacity: 0.7 }]}
            onPress={() => agir(a.id, () => marquerAideEnfant(jeton, a.id))}
            disabled={enCours !== null}
            accessibilityRole="button"
            accessibilityLabel={`J'en ai fait un : ${a.libelle}`}
          >
            <Ionicons name="add-circle-outline" size={26} color={theme.colors.background} />
            <Text style={styles.boutonFiniTexte}>J’en ai fait un</Text>
          </Pressable>
        )}
      </View>
    );
  };

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.contenu}>
      <Text style={styles.bonjour}>Bonjour {vue.prenom ?? ''} !</Text>
      <Text style={styles.sousTitre}>
        {total === 0
          ? 'Pas de tâche obligatoire aujourd’hui.'
          : restantes === 0
            ? 'Tout est fait aujourd’hui, bravo !'
            : `Encore ${restantes} chose${restantes > 1 ? 's' : ''} à faire aujourd’hui.`}
      </Text>

      {total > 0 ? <Text style={styles.titre}>Aujourd’hui</Text> : null}
      {obligatoiresDuJour.map(({ tache, jour }) => (
        <View key={tache.id} style={[styles.tache, jour?.etat === 'fait' && styles.tacheValidee]}>
          <Text style={styles.tacheNom}>{tache.libelle}</Text>
          {jour?.etat === 'fait'
            ? validee
            : jour?.etat === 'attente'
              ? attente(tache.id)
              : boutonFini(tache.id, tache.libelle, () => marquerFaiteEnfant(jeton, tache.id))}
        </View>
      ))}
      {anciennes.map((t) => {
        const r = t.realisation;
        const parAutre = r && r.personne_id && r.etat && r.prenom && r.prenom !== vue.prenom;
        return (
          <View key={t.id} style={[styles.tache, r?.etat === 'validee' && styles.tacheValidee]}>
            <Text style={styles.tacheNom}>{t.libelle}</Text>
            {!r
              ? boutonFini(t.id, t.libelle, () => marquerFaiteEnfant(jeton, t.id))
              : parAutre
                ? <Text style={styles.etat}>Faite par {r.prenom}</Text>
                : r.etat === 'faite'
                  ? attente(t.id)
                  : validee}
          </View>
        );
      })}

      {semaine && semaine.coups_de_main.length > 0 ? (
        <>
          <Text style={styles.titre}>Mes coups de main</Text>
          <Text style={styles.detail}>Quand tu veux, avant dimanche.</Text>
          {semaine.coups_de_main.map(carteAide)}
        </>
      ) : null}

      <Text style={styles.titre}>Ma tirelire</Text>
      <View style={styles.tirelire}>
        <Text style={styles.solde}>{formaterCentimes(vue.solde)}</Text>
        {montant > 0 ? (
          <Text style={styles.etat}>Dimanche : {formaterCentimes(montant, true)} si tout est fait</Text>
        ) : null}
        {semaine && montant > 0 ? <Text style={styles.detail}>{resteDeLaSemaine(semaine)}</Text> : null}
        {vue.objectif_points ? (
          <>
            <Text style={styles.etat}>
              {vue.objectif_libelle ?? 'Mon objectif'} : {manque > 0 ? `encore ${formaterCentimes(manque)}` : 'objectif atteint !'}
            </Text>
            <View style={styles.barreFond} accessibilityLabel={`${Math.round(progression * 100)} % de l'objectif`}>
              <View style={[styles.barre, { width: `${progression * 100}%` }]} />
            </View>
          </>
        ) : null}
      </View>

      {vue.mouvements.length > 0 && <Text style={styles.titre}>Derniers mouvements</Text>}
      {vue.mouvements.map((m) => (
        <View key={m.id} style={styles.ligne}>
          <Text style={[styles.detail, { flex: 1 }]} numberOfLines={1}>
            {m.libelle}
          </Text>
          <Text style={[styles.montant, { color: m.points < 0 ? theme.colors.warning : theme.colors.success }]}>
            {formaterCentimes(m.points, true)}
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
  compte: { fontFamily: theme.fontTitle, fontSize: 20, color: theme.colors.accent },
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
  zoneLien: { minHeight: 44, justifyContent: 'center' },
  lienDiscret: { fontFamily: theme.fontBody, fontSize: 14, color: theme.colors.textMuted, textDecorationLine: 'underline' },
  tirelire: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.accent,
    borderWidth: 1.5,
    borderRadius: theme.radii.lg,
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  solde: { fontFamily: theme.fontTitle, fontSize: 30, color: theme.colors.accent },
  barreFond: { height: 14, borderRadius: 7, backgroundColor: theme.colors.selectionTransparent },
  barre: { height: 14, borderRadius: 7, backgroundColor: theme.colors.accent },
  detail: { fontFamily: theme.fontBody, fontSize: 14, color: theme.colors.textMuted },
  montant: { fontFamily: theme.fontBodyBold, fontSize: 15 },
}));
