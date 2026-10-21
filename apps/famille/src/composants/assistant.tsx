import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Pressable, Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import { arrondis, couleurs, creerStyles, espaces, polices } from '../theme/theme';
import { Bouton, Icone } from './ui';

// L'assistant dans l'interface (charte § 7) : utile et visible, sans être
// bavard. On ne dit jamais « IA » ni « modèle », mais « l'assistant ».
// Composants communs aux fonctions du chantier C.

// Signe distinctif : petite étincelle à 4 branches, à côté du libellé (jamais
// à sa place) : « ✦ Lire la photo ».
export function Etincelle({ couleur, taille = 14, style }: { couleur?: string; taille?: number; style?: StyleProp<TextStyle> }) {
  return (
    <Text accessible={false} style={[{ fontSize: taille, lineHeight: taille * 1.1, color: couleur ?? couleurs.encre }, style]}>
      ✦
    </Text>
  );
}

// Bouton d'action qui utilise l'assistant : « ✦ Lire la photo ».
export function BoutonAssistant({
  titre,
  onPress,
  couleur,
  desactive,
}: {
  titre: string;
  onPress: () => void;
  couleur?: string;
  desactive?: boolean;
}) {
  const c = couleur ?? couleurs.encre;
  return (
    <Pressable
      onPress={onPress}
      disabled={desactive}
      accessibilityRole="button"
      accessibilityLabel={`${titre}, avec l’assistant`}
      style={({ pressed }) => [styles.boutonAssistant, { borderColor: c }, (pressed || desactive) && { opacity: 0.6 }]}
    >
      <Etincelle couleur={c} />
      <Text style={[styles.boutonAssistantTexte, { color: c }]}>{titre}</Text>
    </Pressable>
  );
}

// Pendant que l'assistant travaille (2 à 15 s, § 7.2) : ce qu'il fait, en
// mots qui changent toutes les 2 à 3 s, sur une barre indéterminée, avec
// toujours « Annuler ».
export function ChargementAssistant({
  etapes = ['Je regarde…', 'Je range les informations…', 'Presque fini…'],
  couleur,
  onAnnuler,
  style,
}: {
  etapes?: string[];
  couleur?: string;
  onAnnuler?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const [i, setI] = useState(0);
  const [reduire, setReduire] = useState(false);
  const avance = useRef(new Animated.Value(0)).current;
  const c = couleur ?? couleurs.encre;

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled?.().then(setReduire).catch(() => {});
  }, []);

  useEffect(() => {
    const minuteur = setInterval(() => setI((x) => Math.min(x + 1, etapes.length - 1)), 2500);
    return () => clearInterval(minuteur);
  }, [etapes.length]);

  useEffect(() => {
    AccessibilityInfo.announceForAccessibility?.(etapes[i]);
  }, [i, etapes]);

  useEffect(() => {
    if (reduire) return;
    const boucle = Animated.loop(
      Animated.timing(avance, { toValue: 1, duration: 1400, easing: Easing.inOut(Easing.ease), useNativeDriver: false })
    );
    boucle.start();
    return () => boucle.stop();
  }, [reduire, avance]);

  return (
    <View style={[styles.chargement, style]} accessibilityRole="progressbar" accessibilityLiveRegion="polite">
      <View style={styles.chargementLigne}>
        <Etincelle couleur={c} />
        <Text style={styles.chargementTexte}>{etapes[i]}</Text>
        {onAnnuler ? (
          <Pressable onPress={onAnnuler} accessibilityRole="button" hitSlop={10}>
            <Text style={styles.annuler}>Annuler</Text>
          </Pressable>
        ) : null}
      </View>
      <View style={styles.piste}>
        {reduire ? (
          <View style={[styles.segmentFixe, { backgroundColor: c }]} />
        ) : (
          <Animated.View
            style={[
              styles.segment,
              {
                backgroundColor: c,
                left: avance.interpolate({ inputRange: [0, 1], outputRange: ['-35%', '100%'] }),
              },
            ]}
          />
        )}
      </View>
    </View>
  );
}

// Bandeau en tête d'un formulaire pré-rempli (§ 7.3).
export function BandeauBrouillon({ couleur, style }: { couleur?: string; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.bandeau, style]} accessibilityRole="text">
      <Etincelle couleur={couleur ?? couleurs.encre} />
      <Text style={styles.bandeauTexte}>
        <Text style={{ fontFamily: polices.texteGras }}>Proposé par l’assistant</Text> · vérifiez avant d’enregistrer
      </Text>
    </View>
  );
}

// Mention d'une proposition faite par l'assistant, mêlée aux propositions
// humaines (brouillon de voyage, § 4.5.1).
export function MentionAssistant({ couleur }: { couleur?: string }) {
  return (
    <View style={styles.mention} accessible accessibilityLabel="Proposé par l’assistant">
      <Etincelle taille={12} couleur={couleur ?? couleurs.encreDouce} />
      <Text style={[styles.mentionTexte, couleur ? { color: couleur } : null]}>Proposé par l’assistant</Text>
    </View>
  );
}

// Pastille orange « À vérifier », avec la raison si on la connaît (§ 7.3).
export function PastilleAVerifier({ raison }: { raison?: string | null }) {
  return (
    <View style={styles.aVerifier} accessibilityLabel={raison ? `À vérifier : ${raison}` : 'À vérifier'}>
      <Text style={styles.aVerifierTexte}>À vérifier{raison ? ` · ${raison}` : ''}</Text>
    </View>
  );
}

// Fond d'un champ à vérifier.
export const styleChampAVerifier = (): ViewStyle => ({
  backgroundColor: couleurs.attentionFond,
  borderColor: couleurs.attention,
});

// Message quand l'assistant ne peut pas aider (§ 7.7). Le plafond est dit
// calmement, sans rouge.
export function MessageAssistant({
  message,
  pause,
  onRemplirALaMain,
  onReessayer,
}: {
  message: string;
  pause?: boolean;
  onRemplirALaMain?: () => void;
  onReessayer?: () => void;
}) {
  return (
    <View style={[styles.message, pause ? styles.messagePause : styles.messageErreur]} accessibilityLiveRegion="polite">
      <View style={styles.chargementLigne}>
        <Icone nom={pause ? 'moon-outline' : 'alert-circle-outline'} taille={20} couleur={pause ? couleurs.encreDouce : couleurs.attention} />
        <Text style={styles.messageTexte}>{message}</Text>
      </View>
      {onRemplirALaMain || onReessayer ? (
        <View style={styles.messageBoutons}>
          {onReessayer ? <Bouton variante="secondaire" petit titre="Réessayer" onPress={onReessayer} /> : null}
          {onRemplirALaMain ? <Bouton variante="secondaire" petit titre="Remplir à la main" onPress={onRemplirALaMain} /> : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = creerStyles(() => ({
  mention: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  mentionTexte: { fontFamily: polices.texteDemiGras, fontSize: 12, color: couleurs.encreDouce },
  boutonAssistant: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: 44,
    paddingHorizontal: espaces.l,
    borderRadius: arrondis.pilule,
    borderWidth: 1.5,
    backgroundColor: couleurs.surface,
  },
  boutonAssistantTexte: { fontFamily: polices.texteGras, fontSize: 14 },
  chargement: {
    gap: espaces.m,
    padding: espaces.l,
    borderRadius: arrondis.carte,
    backgroundColor: couleurs.surface,
    borderWidth: 1,
    borderColor: couleurs.ligneCarte,
  },
  chargementLigne: { flexDirection: 'row', alignItems: 'center', gap: espaces.s },
  chargementTexte: { flex: 1, fontFamily: polices.texteDemiGras, fontSize: 15, color: couleurs.encre },
  annuler: { fontFamily: polices.texteGras, fontSize: 14, color: couleurs.encreDouce, textDecorationLine: 'underline' },
  piste: { height: 6, borderRadius: 3, backgroundColor: couleurs.segment, overflow: 'hidden' },
  segment: { position: 'absolute', top: 0, bottom: 0, width: '35%', borderRadius: 3 },
  segmentFixe: { width: '50%', height: '100%', borderRadius: 3, opacity: 0.6 },
  bandeau: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaces.s,
    paddingHorizontal: espaces.l,
    paddingVertical: espaces.m,
    borderRadius: arrondis.champ,
    backgroundColor: couleurs.segment,
  },
  bandeauTexte: { flex: 1, fontFamily: polices.texte, fontSize: 14, color: couleurs.encre },
  aVerifier: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: arrondis.pilule,
    backgroundColor: couleurs.attentionFond,
  },
  aVerifierTexte: { fontFamily: polices.texteGras, fontSize: 12, color: couleurs.attention },
  message: { gap: espaces.m, padding: espaces.l, borderRadius: arrondis.carte, borderWidth: 1 },
  messageErreur: { backgroundColor: couleurs.attentionFond, borderColor: couleurs.attentionFond },
  messagePause: { backgroundColor: couleurs.surface, borderColor: couleurs.ligneCarte },
  messageTexte: { flex: 1, fontFamily: polices.texteDemiGras, fontSize: 14, lineHeight: 20, color: couleurs.encre },
  messageBoutons: { flexDirection: 'row', gap: espaces.s, flexWrap: 'wrap' },
}));
