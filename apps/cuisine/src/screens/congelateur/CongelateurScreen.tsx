import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, FlatList, Pressable, TextInput, ActivityIndicator, Platform } from 'react-native';
import { useFocusEffect, useIsFocused } from '@react-navigation/native';
import * as Speech from 'expo-speech';
import { alerte } from '../../utils/alerte';
import { theme, creerStylesThemes } from '../../theme/theme';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../services/supabase';
import {
  listerCongelateurs,
  listerAliments,
  creerCongelateur,
  retirerAliment,
  trierParUrgence,
  etatConservation,
  dateLimite,
  typeAliment,
  formaterDate,
  versIso,
  ancienneteTexte,
  rechercherAliments,
  extraireRecherche,
  phraseReponse,
  type EtatConservation,
} from '../../services/congelateur';
import { useEcouteVocale, ecouteDisponible } from '../../hooks/useEcouteVocale';
import type { AlimentCongele, Congelateur } from '../../types/models';

// Écran "Congélateur" : ce qu'il y a dans le(s) congélateur(s) du foyer,
// les aliments les plus urgents en premier. Chaque aliment a une date de
// mise au congélateur et un type qui fixe sa durée de conservation
// conseillée (voir services/congelateur.ts) : au-delà, il est signalé
// "plus consommable". Pas de quantités (choix utilisateur).
//
// Recherche : par le nom ou par la famille ("poisson", "viande"...), dans
// tous les congélateurs. Bouton micro : on pose la question à voix haute
// ("Est-ce qu'il reste du poulet ?"), l'application répond à l'écran et à
// voix haute.
export default function CongelateurScreen({ navigation }: any) {
  const { foyer, session } = useAuth();
  const [congelateurs, setCongelateurs] = useState<Congelateur[]>([]);
  const [aliments, setAliments] = useState<AlimentCongele[]>([]);
  const [chargement, setChargement] = useState(true);
  const [filtre, setFiltre] = useState<string | null>(null); // id du congélateur, ou null = tous
  const [aSurveillerSeulement, setASurveillerSeulement] = useState(false);
  const [recherche, setRecherche] = useState('');
  const [nomPremierCongelateur, setNomPremierCongelateur] = useState('Congélateur');
  const [creation, setCreation] = useState(false);
  const [ecouteVoulue, setEcouteVoulue] = useState(false);
  const [questionEntendue, setQuestionEntendue] = useState<string | null>(null);
  const estFocalise = useIsFocused();

  const charger = useCallback(async () => {
    if (!foyer) return;
    try {
      const [c, a] = await Promise.all([listerCongelateurs(foyer.id), listerAliments(foyer.id)]);
      setCongelateurs(c);
      setAliments(a);
    } finally {
      setChargement(false);
    }
  }, [foyer]);

  useFocusEffect(
    useCallback(() => {
      charger();
    }, [charger])
  );

  // Synchronisation temps réel entre appareils du foyer.
  useEffect(() => {
    if (!foyer) return;
    const canal = supabase
      .channel(`congelateur-foyer-${foyer.id}-${Math.random().toString(36).slice(2, 10)}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'recettes', table: 'congelateur_aliments', filter: `foyer_id=eq.${foyer.id}` },
        () => charger()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'recettes', table: 'congelateurs', filter: `foyer_id=eq.${foyer.id}` },
        () => charger()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(canal);
    };
  }, [foyer, charger]);

  // Filtre sur un congélateur qui n'existe plus (supprimé ailleurs) : retour à "Tous".
  useEffect(() => {
    if (filtre && !congelateurs.some((c) => c.id === filtre)) setFiltre(null);
  }, [congelateurs, filtre]);

  const nomsCongelateurs = useMemo(() => new Map(congelateurs.map((c) => [c.id, c.nom])), [congelateurs]);

  const alimentsDuFiltre = useMemo(
    () => (filtre ? aliments.filter((a) => a.congelateur_id === filtre) : aliments),
    [aliments, filtre]
  );

  const compteurs = useMemo(() => {
    let depasse = 0;
    let bientot = 0;
    alimentsDuFiltre.forEach((a) => {
      const etat = etatConservation(a);
      if (etat === 'depasse') depasse += 1;
      else if (etat === 'bientot') bientot += 1;
    });
    return { depasse, bientot };
  }, [alimentsDuFiltre]);

  // Une recherche porte sur TOUS les congélateurs (on veut savoir s'il en
  // reste, peu importe où) ; sinon : congélateur choisi et filtre "à surveiller".
  const rechercheEnCours = recherche.trim() !== '';
  const alimentsAffiches = useMemo(() => {
    if (rechercheEnCours) return trierParUrgence(rechercherAliments(aliments, recherche));
    return trierParUrgence(
      alimentsDuFiltre.filter((a) => !aSurveillerSeulement || etatConservation(a) !== 'ok')
    );
  }, [aliments, alimentsDuFiltre, recherche, rechercheEnCours, aSurveillerSeulement]);

  // --- Question à voix haute ---------------------------------------------

  // Réponse parlée : lue une fois la question comprise.
  const repondreAVoixHaute = (cherche: string) => {
    const trouves = rechercherAliments(aliments, cherche);
    Speech.stop();
    Speech.speak(phraseReponse(cherche, trouves, nomsCongelateurs), { language: 'fr-FR' });
  };

  const traiterPhrase = (texte: string, definitive: boolean) => {
    if (!definitive) {
      setQuestionEntendue(texte);
      return false;
    }
    const cherche = extraireRecherche(texte);
    setQuestionEntendue(texte);
    setRecherche(cherche);
    setEcouteVoulue(false);
    repondreAVoixHaute(cherche);
    return true;
  };

  const { etat: etatEcoute, erreur: erreurEcoute } = useEcouteVocale({
    active: ecouteVoulue && estFocalise,
    motsCles: ['congélateur', 'reste', 'poulet', 'viande', 'poisson', 'steak haché', 'soupe', 'pain'],
    onPhrase: traiterPhrase,
  });

  // Sans question au bout de 10 secondes : on coupe le micro.
  useEffect(() => {
    if (!ecouteVoulue) return;
    const minuterie = setTimeout(() => setEcouteVoulue(false), 10000);
    return () => clearTimeout(minuterie);
  }, [ecouteVoulue]);

  // Plus de voix quand on quitte l'écran.
  useEffect(() => {
    if (!estFocalise) Speech.stop();
  }, [estFocalise]);

  const basculerMicro = () => {
    // Micro indisponible ici : on explique pourquoi plutôt que de masquer le
    // bouton (retour utilisateur : "je ne vois pas de micro").
    if (!ecouteDisponible) {
      alerte(
        'Micro indisponible ici',
        Platform.OS === 'web'
          ? "Ce navigateur ne sait pas reconnaître la voix. Ouvrez l'application dans Google Chrome ou Microsoft Edge (sur ordinateur ou téléphone Android), ou tapez simplement l'aliment dans la recherche."
          : "La reconnaissance vocale ne fonctionne pas dans Expo Go : elle demande l'application installée (compilée avec EAS, profil preview ou development). En attendant, tapez l'aliment dans la recherche."
      );
      return;
    }
    Speech.stop();
    if (!ecouteVoulue) setQuestionEntendue(null);
    setEcouteVoulue((v) => !v);
  };

  const changerRecherche = (texte: string) => {
    setRecherche(texte);
    setQuestionEntendue(null);
  };

  const creerPremierCongelateur = async () => {
    if (!foyer || !session || !nomPremierCongelateur.trim()) return;
    setCreation(true);
    try {
      await creerCongelateur(foyer.id, session.user.id, nomPremierCongelateur);
      await charger();
    } catch (e) {
      alerte('Échec de la création', e instanceof Error ? e.message : 'Veuillez réessayer.');
    } finally {
      setCreation(false);
    }
  };

  const demanderRetrait = (aliment: AlimentCongele) => {
    alerte('Retirer du congélateur ?', `"${aliment.nom}" sera retiré de la liste (consommé ou jeté).`, [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Retirer',
        style: 'destructive',
        onPress: async () => {
          try {
            await retirerAliment(aliment.id);
            await charger();
          } catch (e) {
            alerte('Échec du retrait', e instanceof Error ? e.message : 'Veuillez réessayer.');
          }
        },
      },
    ]);
  };

  if (chargement) {
    return (
      <View style={styles.centre}>
        <ActivityIndicator color={theme.colors.accent} />
      </View>
    );
  }

  // Premier usage : aucun congélateur encore déclaré dans le foyer.
  if (congelateurs.length === 0) {
    return (
      <View style={styles.container}>
        <Text style={styles.titre}>Congélateur</Text>
        <View style={styles.carteAccueil}>
          <Text style={styles.texteAccueil}>
            Listez ce que contient votre congélateur, avec la date de congélation : l'application vous signale les
            aliments à consommer bientôt et ceux qui ne sont plus consommables.
          </Text>
          <Text style={styles.label}>Nom du congélateur</Text>
          <TextInput
            style={styles.champ}
            value={nomPremierCongelateur}
            onChangeText={setNomPremierCongelateur}
            placeholder="Ex. Congélateur du garage"
            placeholderTextColor={theme.colors.textMuted}
            onSubmitEditing={creerPremierCongelateur}
          />
          <Pressable style={styles.boutonPrincipal} onPress={creerPremierCongelateur} disabled={creation}>
            {creation ? (
              <ActivityIndicator color={theme.colors.background} />
            ) : (
              <Text style={styles.boutonPrincipalTexte}>Créer mon congélateur</Text>
            )}
          </Pressable>
          <Text style={styles.aide}>Vous pourrez en ajouter d'autres ensuite.</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.enTete}>
        <Text style={styles.titre}>Congélateur</Text>
        <Pressable
          style={styles.boutonAjouter}
          onPress={() => navigation.navigate('FormulaireAlimentCongele', { congelateurId: filtre ?? undefined })}
        >
          <Text style={styles.boutonAjouterTexte}>+ Ajouter</Text>
        </Pressable>
      </View>

      {/* Choix du congélateur (s'il y en a plusieurs) et accès à leur gestion. */}
      <View style={styles.puces}>
        {congelateurs.length > 1 && (
          <>
            <Puce libelle="Tous" actif={filtre === null} onPress={() => setFiltre(null)} />
            {congelateurs.map((c) => (
              <Puce key={c.id} libelle={c.nom} actif={filtre === c.id} onPress={() => setFiltre(c.id)} />
            ))}
          </>
        )}
        <Puce
          libelle={congelateurs.length > 1 ? '⚙ Gérer' : `⚙ ${congelateurs[0].nom}`}
          actif={false}
          onPress={() => navigation.navigate('GestionCongelateurs')}
        />
      </View>

      {!rechercheEnCours && (compteurs.depasse > 0 || compteurs.bientot > 0) && (
        <Pressable
          style={[styles.bandeau, compteurs.depasse > 0 ? styles.bandeauDepasse : styles.bandeauBientot]}
          onPress={() => setASurveillerSeulement((v) => !v)}
        >
          {compteurs.depasse > 0 && (
            <Text style={[styles.bandeauTexte, { color: theme.colors.warning }]}>
              ⚠ {compteurs.depasse} aliment{compteurs.depasse > 1 ? 's' : ''} à ne plus consommer
            </Text>
          )}
          {compteurs.bientot > 0 && (
            <Text style={styles.bandeauTexte}>
              {compteurs.bientot} à consommer bientôt
            </Text>
          )}
          <Text style={styles.bandeauAction}>
            {aSurveillerSeulement ? 'Voir tout' : 'Voir seulement ceux-là'}
          </Text>
        </Pressable>
      )}

      <View style={styles.ligneRecherche}>
        <TextInput
          style={styles.champRecherche}
          placeholder="Un aliment, ou touchez le micro…"
          placeholderTextColor={theme.colors.textMuted}
          value={recherche}
          onChangeText={changerRecherche}
          returnKeyType="search"
          clearButtonMode="while-editing"
        />
        {rechercheEnCours && (
          <Pressable hitSlop={8} onPress={() => changerRecherche('')} accessibilityLabel="Effacer la recherche">
            <Text style={styles.effacer}>✕</Text>
          </Pressable>
        )}
        <Pressable
          style={[styles.boutonMicro, ecouteVoulue && styles.boutonMicroActif, !ecouteDisponible && styles.boutonMicroIndispo]}
          onPress={basculerMicro}
          accessibilityLabel={ecouteVoulue ? 'Arrêter l\'écoute' : 'Poser la question à voix haute'}
        >
          <Text style={[styles.boutonMicroTexte, ecouteVoulue && styles.boutonMicroTexteActif]}>🎙</Text>
        </Pressable>
      </View>

      {ecouteVoulue && (
        <Text style={styles.ecoute}>
          {etatEcoute === 'ecoute'
            ? questionEntendue
              ? `« ${questionEntendue} »`
              : 'Je vous écoute… Par exemple : « Est-ce qu\'il reste du poulet ? »'
            : 'Activation du micro…'}
        </Text>
      )}
      {erreurEcoute && !ecouteVoulue && <Text style={[styles.ecoute, { color: theme.colors.warning }]}>{erreurEcoute}</Text>}

      {rechercheEnCours && (
        <View style={styles.reponse}>
          {questionEntendue && !ecouteVoulue && <Text style={styles.reponseQuestion}>« {questionEntendue} »</Text>}
          <Text style={[styles.reponseTexte, alimentsAffiches.length === 0 && { color: theme.colors.textMuted }]}>
            {alimentsAffiches.length === 0
              ? `Pas de « ${recherche.trim()} » dans ${congelateurs.length > 1 ? 'vos congélateurs' : 'le congélateur'}.`
              : `Oui : ${alimentsAffiches.length} trouvé${alimentsAffiches.length > 1 ? 's' : ''}${
                  congelateurs.length > 1 ? ' (tous congélateurs)' : ''
                }.`}
          </Text>
        </View>
      )}

      <FlatList
        data={alimentsAffiches}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.liste}
        ListEmptyComponent={
          rechercheEnCours ? null : (
          <Text style={styles.vide}>
            {alimentsDuFiltre.length === 0
              ? 'Rien pour l\'instant. Touchez « + Ajouter » pour lister un aliment.'
              : 'Aucun aliment ne correspond.'}
          </Text>
          )
        }
        renderItem={({ item }) => (
          <CarteAliment
            aliment={item}
            nomCongelateur={congelateurs.length > 1 && (!filtre || rechercheEnCours) ? nomsCongelateurs.get(item.congelateur_id) : undefined}
            onModifier={() => navigation.navigate('FormulaireAlimentCongele', { alimentId: item.id })}
            onRetirer={() => demanderRetrait(item)}
          />
        )}
      />
    </View>
  );
}

function Puce({ libelle, actif, onPress }: { libelle: string; actif: boolean; onPress: () => void }) {
  return (
    <Pressable style={[styles.puce, actif && styles.puceActive]} onPress={onPress}>
      <Text style={[styles.puceTexte, actif && styles.puceTexteActif]}>{libelle}</Text>
    </Pressable>
  );
}

function CarteAliment({
  aliment,
  nomCongelateur,
  onModifier,
  onRetirer,
}: {
  aliment: AlimentCongele;
  nomCongelateur?: string;
  onModifier: () => void;
  onRetirer: () => void;
}) {
  const etat: EtatConservation = etatConservation(aliment);
  const limite = formaterDate(versIso(dateLimite(aliment)));
  const couleurEtat =
    etat === 'depasse' ? theme.colors.warning : etat === 'bientot' ? theme.colors.accent : theme.colors.success;
  const texteEtat =
    etat === 'depasse'
      ? `Plus consommable (conseillé jusqu'au ${limite})`
      : etat === 'bientot'
        ? `À consommer avant le ${limite}`
        : `Bon jusqu'au ${limite}`;

  return (
    <Pressable style={[styles.carte, { borderLeftColor: couleurEtat }]} onPress={onModifier}>
      <View style={styles.carteLigne}>
        <View style={styles.carteTextes}>
          <Text style={styles.carteNom}>{aliment.nom}</Text>
          <Text style={styles.carteDetail}>
            Congelé le {formaterDate(aliment.date_stockage)} · {ancienneteTexte(aliment.date_stockage)}
          </Text>
          <Text style={styles.carteDetail}>
            {typeAliment(aliment.type).libelle}
            {nomCongelateur ? ` · ${nomCongelateur}` : ''}
          </Text>
          <Text style={[styles.carteEtat, { color: couleurEtat }, etat === 'ok' && styles.carteEtatDiscret]}>
            {etat === 'depasse' ? '⚠ ' : ''}
            {texteEtat}
          </Text>
        </View>
        <View style={styles.carteActions}>
          <Pressable hitSlop={8} onPress={onModifier}>
            <Text style={styles.carteActionTexte}>✎</Text>
          </Pressable>
          <Pressable hitSlop={8} style={styles.boutonRetirer} onPress={onRetirer}>
            <Text style={styles.boutonRetirerTexte}>Sorti</Text>
          </Pressable>
        </View>
      </View>
    </Pressable>
  );
}

const styles = creerStylesThemes(() => ({
  container: { flex: 1, backgroundColor: theme.colors.background, padding: theme.spacing.md },
  centre: { flex: 1, backgroundColor: theme.colors.background, alignItems: 'center', justifyContent: 'center' },
  enTete: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.sm,
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
  },
  titre: { fontFamily: theme.fontTitle, fontSize: 26, color: theme.colors.accent },
  boutonAjouter: {
    backgroundColor: theme.colors.accent,
    borderRadius: theme.radii.md,
    paddingVertical: theme.spacing.xs,
    paddingHorizontal: theme.spacing.sm,
  },
  boutonAjouterTexte: { fontFamily: theme.fontBodyBold, color: theme.colors.background, fontSize: 13 },
  carteAccueil: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radii.md,
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
    marginTop: theme.spacing.md,
  },
  texteAccueil: { fontFamily: theme.fontBody, color: theme.colors.text, fontSize: 16, lineHeight: 22 },
  label: { fontFamily: theme.fontBodyBold, color: theme.colors.textMuted, fontSize: 13, marginTop: theme.spacing.sm },
  champ: {
    backgroundColor: theme.colors.background,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radii.md,
    padding: theme.spacing.sm,
    color: theme.colors.text,
    fontFamily: theme.fontBody,
    fontSize: 16,
  },
  boutonPrincipal: {
    backgroundColor: theme.colors.accent,
    borderRadius: theme.radii.md,
    paddingVertical: theme.spacing.sm,
    alignItems: 'center',
    marginTop: theme.spacing.sm,
  },
  boutonPrincipalTexte: { fontFamily: theme.fontBodyBold, color: theme.colors.background, fontSize: 16 },
  aide: { fontFamily: theme.fontBody, color: theme.colors.textMuted, fontSize: 13, textAlign: 'center' },
  puces: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.xs, marginBottom: theme.spacing.sm },
  puce: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radii.lg,
    paddingVertical: 6,
    paddingHorizontal: theme.spacing.sm,
  },
  puceActive: { backgroundColor: theme.colors.selection, borderColor: theme.colors.accent },
  puceTexte: { fontFamily: theme.fontBody, color: theme.colors.textMuted, fontSize: 13 },
  puceTexteActif: { color: theme.colors.accent, fontFamily: theme.fontBodyBold },
  bandeau: {
    borderWidth: 1,
    borderRadius: theme.radii.md,
    padding: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
    gap: 2,
  },
  bandeauDepasse: { borderColor: theme.colors.warning, backgroundColor: theme.colors.surface },
  bandeauBientot: { borderColor: theme.colors.accent, backgroundColor: theme.colors.surface },
  bandeauTexte: { fontFamily: theme.fontBodyBold, color: theme.colors.accent, fontSize: 15 },
  bandeauAction: {
    fontFamily: theme.fontBody,
    color: theme.colors.textMuted,
    fontSize: 13,
    textDecorationLine: 'underline',
  },
  ligneRecherche: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, marginBottom: theme.spacing.sm },
  champRecherche: {
    flex: 1,
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radii.md,
    padding: theme.spacing.sm,
    color: theme.colors.text,
    fontFamily: theme.fontBody,
    fontSize: 16,
  },
  effacer: { color: theme.colors.textMuted, fontSize: 16, paddingHorizontal: 2 },
  boutonMicro: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boutonMicroActif: { backgroundColor: theme.colors.accent, borderColor: theme.colors.accent },
  boutonMicroIndispo: { opacity: 0.45 },
  boutonMicroTexte: { fontSize: 20 },
  boutonMicroTexteActif: { color: theme.colors.background },
  ecoute: {
    fontFamily: theme.fontBody,
    color: theme.colors.accent,
    fontSize: 14,
    fontStyle: 'italic',
    marginBottom: theme.spacing.sm,
  },
  reponse: { marginBottom: theme.spacing.sm, gap: 2 },
  reponseQuestion: { fontFamily: theme.fontBody, color: theme.colors.textMuted, fontSize: 13, fontStyle: 'italic' },
  reponseTexte: { fontFamily: theme.fontBodyBold, color: theme.colors.accent, fontSize: 16 },
  liste: { gap: theme.spacing.sm, paddingBottom: theme.spacing.xl },
  vide: { fontFamily: theme.fontBody, color: theme.colors.textMuted, textAlign: 'center', marginTop: theme.spacing.lg },
  carte: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderLeftWidth: 5,
    borderRadius: theme.radii.md,
    padding: theme.spacing.md,
  },
  carteLigne: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: theme.spacing.sm },
  carteTextes: { flex: 1, gap: 2 },
  carteNom: { fontFamily: theme.fontBodyBold, color: theme.colors.text, fontSize: 17 },
  carteDetail: { fontFamily: theme.fontBody, color: theme.colors.textMuted, fontSize: 13 },
  carteEtat: { fontFamily: theme.fontBodyBold, fontSize: 14, marginTop: 2 },
  carteEtatDiscret: { fontFamily: theme.fontBody, fontSize: 13 },
  carteActions: { alignItems: 'flex-end', gap: theme.spacing.sm },
  carteActionTexte: { color: theme.colors.textMuted, fontSize: 16, paddingHorizontal: 2 },
  boutonRetirer: {
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radii.md,
    paddingVertical: 4,
    paddingHorizontal: theme.spacing.sm,
  },
  boutonRetirerTexte: { fontFamily: theme.fontBodyBold, color: theme.colors.textMuted, fontSize: 13 },
}));
