import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  Switch,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import {
  arrondis,
  couleurs,
  couleursModule,
  creerStyles,
  espaces,
  margePage,
  polices,
  texte,
  type IdModule,
} from '../theme/theme';

// Composants de la charte (§ 6), pour les écrans propres à l'app Famille
// (Accueil, Agenda, Activité, Moi, ⊕). Les écrans des modules gardent leurs
// composants, recolorés par leur thème.

export type NomIcone = keyof typeof Ionicons.glyphMap;

export function Icone({ nom, taille = 24, couleur, style }: { nom: string; taille?: number; couleur?: string; style?: any }) {
  return <Ionicons name={nom as NomIcone} size={taille} color={couleur ?? couleurs.encre} style={style} />;
}

// --- Boutons ---------------------------------------------------------------

type VarianteBouton = 'principal' | 'accent' | 'secondaire' | 'ajout' | 'danger' | 'lien';

export function Bouton({
  titre,
  onPress,
  variante = 'principal',
  module,
  icone,
  enCours,
  desactive,
  petit,
  style,
  accessibilityLabel,
}: {
  titre: string;
  onPress: () => void;
  variante?: VarianteBouton;
  module?: IdModule; // bouton principal à l'encre du module
  icone?: string;
  enCours?: boolean;
  desactive?: boolean;
  petit?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}) {
  const inactif = !!(desactive || enCours);
  let fond = 'transparent';
  let encre = couleurs.encre;
  let bordure: ViewStyle = {};
  if (variante === 'principal') {
    fond = module ? couleursModule(module).encre : couleurs.encre;
    encre = couleurs.fond;
  } else if (variante === 'accent') {
    fond = couleurs.accent;
    encre = couleurs.surAccent;
  } else if (variante === 'secondaire') {
    fond = couleurs.surface;
    bordure = { borderWidth: 1, borderColor: couleurs.ligne };
  } else if (variante === 'ajout') {
    bordure = { borderWidth: 1.5, borderStyle: 'dashed', borderColor: couleurs.ligne };
    encre = couleurs.encreDouce;
  } else if (variante === 'danger') {
    fond = couleurs.surface;
    bordure = { borderWidth: 1, borderColor: couleurs.ligne };
    encre = couleurs.danger;
  } else if (variante === 'lien') {
    encre = module ? couleursModule(module).encre : couleurs.encre;
  }
  return (
    <Pressable
      onPress={onPress}
      disabled={inactif}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? titre}
      accessibilityState={{ disabled: inactif, busy: !!enCours }}
      style={({ pressed }) => [
        styles.bouton,
        petit && styles.boutonPetit,
        variante === 'lien' && styles.boutonLien,
        { backgroundColor: fond },
        bordure,
        (pressed || inactif) && { opacity: 0.6 },
        style,
      ]}
    >
      {enCours ? (
        <ActivityIndicator color={encre} />
      ) : (
        <View style={styles.boutonContenu}>
          {icone ? <Icone nom={icone} taille={petit ? 16 : 18} couleur={encre} /> : null}
          <Text style={[styles.boutonTexte, petit && styles.boutonTextePetit, { color: encre }]} numberOfLines={1}>
            {titre}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

// Bouton pilule compact, à droite d'une carte (« Valider », « Je conduis »).
export function BoutonPilule({
  titre,
  onPress,
  ton = 'accent',
  module,
}: {
  titre: string;
  onPress: () => void;
  ton?: 'accent' | 'encre' | 'module' | 'contour';
  module?: IdModule;
}) {
  const fond =
    ton === 'accent'
      ? couleurs.accent
      : ton === 'encre'
        ? couleurs.encre
        : ton === 'module' && module
          ? couleursModule(module).encre
          : couleurs.surface;
  const encre = ton === 'accent' ? couleurs.surAccent : ton === 'contour' ? couleurs.encre : couleurs.fond;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      hitSlop={6}
      style={({ pressed }) => [
        styles.pilule,
        { backgroundColor: fond },
        ton === 'contour' && { borderWidth: 1, borderColor: couleurs.ligne },
        pressed && { opacity: 0.7 },
      ]}
    >
      <Text style={[styles.piluleTexte, { color: encre }]}>{titre}</Text>
    </Pressable>
  );
}

// --- Cartes et sections ------------------------------------------------------

export function Carte({ children, style, onPress, accessibilityLabel }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void; accessibilityLabel?: string }) {
  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        style={({ pressed }) => [styles.carte, style, pressed && { opacity: 0.85 }]}
      >
        {children}
      </Pressable>
    );
  }
  return <View style={[styles.carte, style]}>{children}</View>;
}

export function Section({
  titre,
  action,
  onAction,
  children,
  style,
}: {
  titre: string;
  action?: string;
  onAction?: () => void;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.section, style]}>
      <View style={styles.sectionEntete}>
        <Text style={styles.sectionTitre} accessibilityRole="header">
          {titre}
        </Text>
        {action && onAction ? (
          <Pressable onPress={onAction} accessibilityRole="button" hitSlop={10}>
            <Text style={styles.sectionAction}>{action}</Text>
          </Pressable>
        ) : null}
      </View>
      {children}
    </View>
  );
}

export function LibelleSection({ children, style }: { children: string; style?: StyleProp<TextStyle> }) {
  return (
    <Text style={[styles.libelleSection, style]} accessibilityRole="header">
      {children}
    </Text>
  );
}

// Carré d'icône sur le pastel du module (cartes d'action, Activité, ⊕).
export function PastilleModule({ module, taille = 44, icone }: { module: IdModule; taille?: number; icone?: string }) {
  const c = couleursModule(module);
  const nom = icone ?? ICONES_MODULES[module];
  return (
    <View
      style={{
        width: taille,
        height: taille,
        borderRadius: taille * 0.32,
        backgroundColor: c.fond,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Icone nom={nom} taille={taille * 0.5} couleur={c.encre} />
    </View>
  );
}

export const ICONES_MODULES: Record<IdModule, string> = {
  recettes: 'restaurant-outline',
  courses: 'cart-outline',
  quotidien: 'today-outline',
  cadeaux: 'gift-outline',
  voyages: 'briefcase-outline',
  souvenirs: 'images-outline',
};

export function LigneListe({
  titre,
  sousTitre,
  gauche,
  droite,
  onPress,
  gras,
  dernier,
  accessibilityLabel,
}: {
  titre: string;
  sousTitre?: string | null;
  gauche?: React.ReactNode;
  droite?: React.ReactNode;
  onPress?: () => void;
  gras?: boolean;
  dernier?: boolean;
  accessibilityLabel?: string;
}) {
  const contenu = (
    <>
      {gauche}
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[styles.ligneTitre, gras && { fontFamily: polices.texteGras }]} numberOfLines={2}>
          {titre}
        </Text>
        {sousTitre ? (
          <Text style={styles.ligneSousTitre} numberOfLines={2}>
            {sousTitre}
          </Text>
        ) : null}
      </View>
      {droite ?? (onPress ? <Icone nom="chevron-forward" taille={18} couleur={couleurs.encreDouce} /> : null)}
    </>
  );
  const style = [styles.ligne, !dernier && styles.ligneSeparee];
  if (!onPress) return <View style={style}>{contenu}</View>;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? titre}
      style={({ pressed }) => [...style, pressed && { opacity: 0.7 }]}
    >
      {contenu}
    </Pressable>
  );
}

// --- Puces, pastilles, états -----------------------------------------------

export function PuceFiltre({ libelle, actif, onPress }: { libelle: string; actif: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: actif }}
      style={[styles.puce, actif ? { backgroundColor: couleurs.encre, borderColor: couleurs.encre } : null]}
    >
      <Text style={[styles.puceTexte, { color: actif ? couleurs.fond : couleurs.encre }]}>{libelle}</Text>
    </Pressable>
  );
}

export type TonPastille = 'succes' | 'attention' | 'alerte' | 'nouveau' | 'neutre';

export function Pastille({ texte: t, ton = 'neutre', module }: { texte: string; ton?: TonPastille; module?: IdModule }) {
  let fond = couleurs.segment;
  let encre = couleurs.encreDouce;
  if (module) {
    fond = couleursModule(module).fond;
    encre = couleursModule(module).encre;
  } else if (ton === 'succes') {
    fond = couleurs.succesFond;
    encre = couleurs.succes;
  } else if (ton === 'attention') {
    fond = couleurs.attentionFond;
    encre = couleurs.attention;
  } else if (ton === 'alerte') {
    fond = couleurs.alerteFond;
    encre = couleurs.alerte;
  } else if (ton === 'nouveau') {
    fond = couleurs.accent;
    encre = couleurs.surAccent;
  }
  return (
    <View style={[styles.pastille, { backgroundColor: fond }]}>
      <Text style={[styles.pastilleTexte, { color: encre }]}>{t}</Text>
    </View>
  );
}

// Pastille ronde corail du nombre de nouveautés.
export function Compteur({ nombre, style }: { nombre: number; style?: StyleProp<ViewStyle> }) {
  if (nombre <= 0) return null;
  return (
    <View style={[styles.compteur, style]} accessibilityLabel={`${nombre} nouveautés`}>
      <Text style={styles.compteurTexte}>{nombre > 99 ? '99+' : nombre}</Text>
    </View>
  );
}

export function EtatVide({ texte: t, style }: { texte: string; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.vide, style]}>
      <Text style={styles.videTexte}>{t}</Text>
    </View>
  );
}

export function ControleSegmente<T extends string>({
  options,
  valeur,
  onChange,
}: {
  options: { id: T; libelle: string }[];
  valeur: T;
  onChange: (v: T) => void;
}) {
  return (
    <View style={styles.segmente} accessibilityRole="tablist">
      {options.map((o) => {
        const actif = o.id === valeur;
        return (
          <Pressable
            key={o.id}
            onPress={() => onChange(o.id)}
            accessibilityRole="tab"
            accessibilityState={{ selected: actif }}
            style={[styles.segment, actif && styles.segmentActif]}
          >
            <Text style={[styles.segmentTexte, actif && { fontFamily: polices.texteGras, color: couleurs.encre }]}>{o.libelle}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Interrupteur({ valeur, onChange, libelle }: { valeur: boolean; onChange: (v: boolean) => void; libelle: string }) {
  return (
    <Switch
      value={valeur}
      onValueChange={onChange}
      accessibilityLabel={libelle}
      trackColor={{ false: couleurs.interrupteurInactif, true: couleurs.succes }}
      thumbColor="#FFFFFF"
      {...({ activeThumbColor: '#FFFFFF' } as any)}
    />
  );
}

export function BarreProgression({ valeur, couleur }: { valeur: number; couleur?: string }) {
  const v = Math.max(0, Math.min(1, valeur));
  return (
    <View style={styles.progression} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(v * 100) }}>
      <View style={[styles.progressionRemplie, { width: `${v * 100}%`, backgroundColor: couleur ?? couleurs.encre }]} />
    </View>
  );
}

export function Chargement() {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: couleurs.fond }}>
      <ActivityIndicator color={couleurs.encre} />
    </View>
  );
}

const styles = creerStyles(() => ({
  bouton: {
    minHeight: 50,
    borderRadius: arrondis.champ,
    paddingHorizontal: espaces.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boutonPetit: { minHeight: 44, paddingHorizontal: espaces.l },
  boutonLien: { minHeight: 44, paddingHorizontal: espaces.s },
  boutonContenu: { flexDirection: 'row', alignItems: 'center', gap: espaces.s },
  boutonTexte: { fontFamily: polices.texteGras, fontSize: 16 },
  boutonTextePetit: { fontSize: 14 },
  pilule: {
    minHeight: 36,
    paddingHorizontal: 14,
    borderRadius: arrondis.pilule,
    alignItems: 'center',
    justifyContent: 'center',
  },
  piluleTexte: { fontFamily: polices.texteGras, fontSize: 13 },
  carte: {
    backgroundColor: couleurs.surface,
    borderRadius: arrondis.carte,
    borderWidth: 1,
    borderColor: couleurs.ligneCarte,
    padding: espaces.l,
  },
  section: { gap: espaces.m, marginTop: espaces.xxxl },
  sectionEntete: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingHorizontal: margePage },
  sectionTitre: texte.section(),
  sectionAction: { fontFamily: polices.texteDemiGras, fontSize: 14, color: couleurs.encreDouce },
  libelleSection: { ...texte.libelleSection(), paddingHorizontal: margePage, marginTop: espaces.xxl, marginBottom: espaces.s },
  ligne: { flexDirection: 'row', alignItems: 'center', gap: espaces.m, minHeight: 56, paddingVertical: espaces.m },
  ligneSeparee: { borderBottomWidth: 1, borderBottomColor: couleurs.separateur },
  ligneTitre: { fontFamily: polices.texteDemiGras, fontSize: 15, lineHeight: 20, color: couleurs.encre },
  ligneSousTitre: texte.secondaire(),
  puce: {
    minHeight: 38,
    paddingHorizontal: 14,
    borderRadius: arrondis.pilule,
    borderWidth: 1,
    borderColor: couleurs.ligne,
    backgroundColor: couleurs.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  puceTexte: { fontFamily: polices.texteDemiGras, fontSize: 14 },
  pastille: { alignSelf: 'flex-start', paddingHorizontal: 9, paddingVertical: 3, borderRadius: arrondis.pilule },
  pastilleTexte: texte.puce(),
  compteur: {
    minWidth: 20,
    height: 20,
    paddingHorizontal: 5,
    borderRadius: 10,
    backgroundColor: couleurs.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  compteurTexte: { fontFamily: polices.texteGras, fontSize: 11, color: couleurs.surAccent, fontVariant: ['tabular-nums'] },
  vide: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: couleurs.ligne,
    borderRadius: arrondis.carte,
    padding: espaces.xl,
    alignItems: 'center',
  },
  videTexte: { ...texte.secondaire(), fontSize: 14, textAlign: 'center' },
  segmente: { flexDirection: 'row', backgroundColor: couleurs.segment, borderRadius: arrondis.petit, padding: 3 },
  segment: { flex: 1, minHeight: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 9 },
  segmentActif: {
    backgroundColor: couleurs.surface,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  segmentTexte: { fontFamily: polices.texteMoyen, fontSize: 14, color: couleurs.encreDouce },
  progression: { height: 8, borderRadius: 4, backgroundColor: couleurs.segment, overflow: 'hidden' },
  progressionRemplie: { height: '100%', borderRadius: 4 },
}));
