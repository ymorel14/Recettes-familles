import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, ScrollView, Pressable, Image, Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import Ionicons from '@expo/vector-icons/Ionicons';
import { theme, creerStylesThemes } from '../theme/theme';
import { useAuth } from '../contexts/AuthContext';
import { extraireMessageErreur } from '@apps-famille/famille';
import {
  creerSouhait,
  modifierSouhait,
  obtenirSouhait,
  type FormulaireSouhait,
} from '../services/wishlist';
import { Bouton, Chargement } from '../components/ui';

const VIDE: FormulaireSouhait = {
  titre: '',
  description: '',
  lien: '',
  image: null,
  photoLocale: null,
  prix: '',
  typePrix: 'estime',
  taille: '',
  priorite: 2,
  quantite: 1,
};

const PRIORITES: { valeur: 1 | 2 | 3; libelle: string }[] = [
  { valeur: 1, libelle: 'Si possible' },
  { valeur: 2, libelle: 'Ça me ferait plaisir' },
  { valeur: 3, libelle: 'Très envie' },
];

// Ajout ou modification d'un souhait (par le destinataire ou son
// gestionnaire) ou d'une idée cachée (par un proche : `idee` vrai).
export default function SouhaitFormScreen({ route, navigation }: any) {
  const { listeId, souhaitId, idee, prenom } = route.params as {
    listeId: string;
    souhaitId?: string;
    idee?: boolean;
    prenom?: string;
  };
  const { session } = useAuth();
  const [form, setForm] = useState<FormulaireSouhait | null>(souhaitId ? null : VIDE);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    navigation.setOptions({
      title: souhaitId ? (idee ? "Modifier l'idée" : 'Modifier le souhait') : idee ? 'Nouvelle idée cachée' : 'Nouveau souhait',
    });
    if (!souhaitId) return;
    obtenirSouhait(souhaitId)
      .then((s) =>
        setForm({
          titre: s.titre,
          description: s.description ?? '',
          lien: s.lien ?? '',
          image: s.image,
          photoLocale: null,
          prix: s.prix != null ? String(s.prix).replace('.', ',') : '',
          typePrix: s.type_prix ?? 'estime',
          taille: s.taille ?? '',
          priorite: s.priorite,
          quantite: s.quantite,
        })
      )
      .catch((e) => setErreur(extraireMessageErreur(e, 'Chargement impossible.')));
  }, [souhaitId, idee, navigation]);

  if (!form) return erreur ? <Text style={styles.erreur}>{erreur}</Text> : <Chargement />;

  const changer = (champ: Partial<FormulaireSouhait>) => setForm({ ...form, ...champ });

  const enregistrer = async () => {
    setErreur(null);
    if (!form.titre.trim()) return setErreur('Indiquez au moins un nom.');
    if (!session) return;
    setEnCours(true);
    try {
      if (souhaitId) await modifierSouhait(souhaitId, form);
      else await creerSouhait(listeId, session.user.id, form, !!idee);
      navigation.goBack();
    } catch (e) {
      setErreur(extraireMessageErreur(e, 'Enregistrement impossible.'));
    } finally {
      setEnCours(false);
    }
  };

  // Photo : galerie ou appareil photo, recadrée en carré par le téléphone.
  const choisirPhoto = async (source: 'galerie' | 'appareil') => {
    setErreur(null);
    const options: ImagePicker.ImagePickerOptions = {
      mediaTypes: ['images'],
      quality: 0.7,
      allowsEditing: Platform.OS !== 'web',
      aspect: [1, 1],
    };
    if (source === 'appareil') {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) return setErreur("Autorisez l'appareil photo dans les réglages du téléphone.");
      const resultat = await ImagePicker.launchCameraAsync(options);
      if (!resultat.canceled && resultat.assets[0]) changer({ photoLocale: resultat.assets[0].uri });
    } else {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) return setErreur('Autorisez l’accès aux photos dans les réglages du téléphone.');
      const resultat = await ImagePicker.launchImageLibraryAsync(options);
      if (!resultat.canceled && resultat.assets[0]) changer({ photoLocale: resultat.assets[0].uri });
    }
  };

  const apercu = form.photoLocale ?? form.image;

  const champ = (
    cle: keyof FormulaireSouhait,
    libelle: string,
    options: { placeholder?: string; clavier?: 'default' | 'decimal-pad' | 'url'; multiligne?: boolean } = {}
  ) => (
    <View style={styles.bloc}>
      <Text style={styles.libelle} nativeID={`libelle-${cle}`}>{libelle}</Text>
      <TextInput
        style={[styles.champ, options.multiligne && styles.champMultiligne]}
        value={String(form[cle])}
        onChangeText={(t) => changer({ [cle]: t } as Partial<FormulaireSouhait>)}
        placeholder={options.placeholder}
        placeholderTextColor={theme.colors.textMuted}
        keyboardType={options.clavier ?? 'default'}
        autoCapitalize={options.clavier === 'url' ? 'none' : 'sentences'}
        multiline={options.multiligne}
        accessibilityLabelledBy={`libelle-${cle}`}
      />
    </View>
  );

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.contenu} keyboardShouldPersistTaps="handled">
      {idee && (
        <Text style={styles.bandeau}>
          Idée cachée : la famille la verra, mais jamais {prenom ?? 'la personne à qui elle est destinée'}. La base
          de données l'empêche, même en cas d'erreur de l'app.
        </Text>
      )}
      {champ('titre', 'Nom', { placeholder: idee ? 'Ex. Cours de poterie' : 'Ex. Roman illustré' })}

      <Text style={styles.libelle}>Photo</Text>
      <View style={styles.photoBloc}>
        {apercu ? (
          <Image source={{ uri: apercu }} style={styles.photo} accessibilityLabel="Photo du cadeau" />
        ) : (
          <View style={[styles.photo, styles.photoVide]}>
            <Ionicons name="image-outline" size={32} color={theme.colors.textMuted} />
          </View>
        )}
        <View style={styles.photoActions}>
          <Bouton variante="contour" titre={apercu ? 'Changer' : 'Choisir une photo'} onPress={() => choisirPhoto('galerie')} />
          {Platform.OS !== 'web' && (
            <Bouton variante="contour" titre="Prendre une photo" onPress={() => choisirPhoto('appareil')} />
          )}
          {apercu && <Bouton variante="discret" titre="Retirer la photo" onPress={() => changer({ photoLocale: null, image: null })} />}
        </View>
      </View>

      {champ('lien', 'Lien vers un site marchand', { placeholder: 'https://…', clavier: 'url' })}

      <Text style={styles.libelle}>Prix</Text>
      <View style={styles.puces}>
        {([
          ['estime', 'Prix estimé'],
          ['budget', 'Budget maximum'],
        ] as const).map(([valeur, libelle]) => (
          <Pressable
            key={valeur}
            onPress={() => changer({ typePrix: valeur })}
            style={[styles.puce, form.typePrix === valeur && styles.puceActive]}
            accessibilityRole="radio"
            accessibilityState={{ selected: form.typePrix === valeur }}
          >
            <Text style={[styles.puceTexte, form.typePrix === valeur && styles.puceTexteActive]}>{libelle}</Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.ligne}>
        <View style={styles.moitie}>
          {champ('prix', form.typePrix === 'budget' ? 'Jusqu’à (€)' : 'Environ (€)', {
            placeholder: form.typePrix === 'budget' ? '50' : '25',
            clavier: 'decimal-pad',
          })}
        </View>
        <View style={styles.moitie}>{champ('taille', 'Taille / pointure', { placeholder: 'Ex. 38' })}</View>
      </View>
      {champ('description', 'Précisions', { placeholder: 'Couleur, modèle, où le trouver…', multiligne: true })}

      <Text style={styles.libelle}>Envie</Text>
      <View style={styles.puces}>
        {PRIORITES.map((p) => (
          <Pressable
            key={p.valeur}
            onPress={() => changer({ priorite: p.valeur })}
            style={[styles.puce, form.priorite === p.valeur && styles.puceActive]}
            accessibilityRole="radio"
            accessibilityState={{ selected: form.priorite === p.valeur }}
          >
            <Text style={[styles.puceTexte, form.priorite === p.valeur && styles.puceTexteActive]}>{p.libelle}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.libelle}>Quantité souhaitée</Text>
      <View style={styles.quantite}>
        <Pressable
          style={styles.boutonRond}
          onPress={() => changer({ quantite: Math.max(1, form.quantite - 1) })}
          accessibilityRole="button"
          accessibilityLabel="Un de moins"
        >
          <Text style={styles.boutonRondTexte}>−</Text>
        </Pressable>
        <Text style={styles.quantiteValeur}>{form.quantite}</Text>
        <Pressable
          style={styles.boutonRond}
          onPress={() => changer({ quantite: form.quantite + 1 })}
          accessibilityRole="button"
          accessibilityLabel="Un de plus"
        >
          <Text style={styles.boutonRondTexte}>+</Text>
        </Pressable>
      </View>

      {erreur && <Text style={styles.erreur}>{erreur}</Text>}
      <Bouton titre="Enregistrer" onPress={enregistrer} enCours={enCours} style={styles.enregistrer} />
    </ScrollView>
  );
}

const styles = creerStylesThemes(() => ({
  flex: { flex: 1, backgroundColor: theme.colors.background },
  contenu: { padding: theme.spacing.md, gap: theme.spacing.sm, paddingBottom: theme.spacing.xl },
  bandeau: {
    fontFamily: theme.fontBody,
    fontSize: 14,
    color: theme.colors.text,
    backgroundColor: theme.colors.accentTransparent,
    borderRadius: theme.radii.lg,
    padding: theme.spacing.md,
  },
  bloc: { gap: 4 },
  ligne: { flexDirection: 'row', gap: theme.spacing.sm },
  moitie: { flex: 1 },
  libelle: { fontFamily: theme.fontBodyBold, fontSize: 15, color: theme.colors.text, marginTop: theme.spacing.xs },
  champ: {
    minHeight: 44,
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radii.md,
    paddingHorizontal: theme.spacing.sm,
    color: theme.colors.text,
    fontFamily: theme.fontBody,
    fontSize: 16,
  },
  champMultiligne: { minHeight: 88, paddingTop: theme.spacing.sm, textAlignVertical: 'top' },
  puces: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.xs },
  puce: {
    minHeight: 40,
    justifyContent: 'center',
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  puceActive: { backgroundColor: theme.colors.accent, borderColor: theme.colors.accent },
  puceTexte: { fontFamily: theme.fontBody, fontSize: 14, color: theme.colors.text },
  puceTexteActive: { fontFamily: theme.fontBodyBold, color: theme.colors.background },
  quantite: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md },
  boutonRond: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1.5,
    borderColor: theme.colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boutonRondTexte: { fontFamily: theme.fontBodyBold, fontSize: 22, color: theme.colors.accent },
  quantiteValeur: { fontFamily: theme.fontTitle, fontSize: 22, color: theme.colors.text, minWidth: 24, textAlign: 'center' },
  enregistrer: { marginTop: theme.spacing.md },
  photoBloc: { flexDirection: 'row', gap: theme.spacing.md, alignItems: 'center' },
  photo: { width: 104, height: 104, borderRadius: theme.radii.lg },
  photoVide: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoActions: { flex: 1, gap: theme.spacing.xs },
  erreur: { fontFamily: theme.fontBody, fontSize: 14, color: theme.colors.warning, padding: theme.spacing.sm },
}));
