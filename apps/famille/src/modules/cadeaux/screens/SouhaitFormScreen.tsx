import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, ScrollView, Pressable, Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as Clipboard from 'expo-clipboard';
import Ionicons from '@expo/vector-icons/Ionicons';
import { theme, creerStylesThemes } from '../theme/theme';
import { useAuth } from '../contexts/AuthContext';
import { extraireMessageErreur } from '@apps-famille/famille';
import { BandeauBrouillon, BoutonAssistant, ChargementAssistant, MessageAssistant, PastilleAVerifier } from '../../../composants/assistant';
import { appelerAssistant, messageErreurAssistant } from '../../../services/assistant';
import {
  creerSouhait,
  extraireLien,
  listerOptions,
  modifierSouhait,
  obtenirSouhait,
  PRIORITES_IDEE,
  PRIORITES_SOUHAIT,
  type FormulaireOption,
  type FormulaireSouhait,
  type ModeOptions,
} from '../services/wishlist';
import { Bouton, Chargement } from '../components/ui';
import PhotoAgrandie from '../components/PhotoAgrandie';

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
  potCommun: false,
  modeOptions: null,
  options: [],
};

const OPTION_VIDE: FormulaireOption = { titre: '', lien: '', prix: '' };

// Fiche lue par l'assistant depuis la page du lien (route « lien-envie »).
type FicheEnvie = {
  lien: string;
  titre: string | null;
  prix: number | null;
  image: string | null;
  taille: string | null;
  options: string[];
  description: string | null;
  a_verifier: string[];
  source: 'page' | 'assistant';
};

const NOMS_CHAMPS: Record<string, string> = { titre: 'nom', prix: 'prix', taille: 'taille', options: 'modèles' };

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
  // Lien collé → fiche complète (spécification § 4.4.1).
  const [lecturePage, setLecturePage] = useState(false);
  const [proposition, setProposition] = useState<{ aVerifier: string[] } | null>(null);
  const [messagePage, setMessagePage] = useState<string | null>(null);

  useEffect(() => {
    navigation.setOptions({
      title: souhaitId ? (idee ? "Modifier l'idée" : 'Modifier le souhait') : idee ? 'Nouvelle idée cachée' : 'Nouveau souhait',
    });
    if (!souhaitId) return;
    Promise.all([obtenirSouhait(souhaitId), listerOptions([souhaitId])])
      .then(([s, options]) =>
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
          potCommun: !!s.pot_commun,
          modeOptions: s.mode_options ?? null,
          options: options.map((o) => ({
            id: o.id,
            titre: o.titre,
            lien: o.lien ?? '',
            prix: o.prix != null ? String(o.prix).replace('.', ',') : '',
          })),
        })
      )
      .catch((e) => setErreur(extraireMessageErreur(e, 'Chargement impossible.')));
  }, [souhaitId, idee, navigation]);

  if (!form) return erreur ? <Text style={styles.erreur}>{erreur}</Text> : <Chargement />;

  const changer = (champ: Partial<FormulaireSouhait>) => setForm({ ...form, ...champ });

  // Options : choisir le mode ; à l'activation, deux lignes vides pour commencer.
  const choisirMode = (mode: ModeOptions | null) =>
    changer({
      modeOptions: mode,
      potCommun: mode === 'toutes' ? false : form.potCommun,
      options: mode && form.options.length === 0 ? [{ ...OPTION_VIDE }, { ...OPTION_VIDE }] : form.options,
    });
  const changerOption = (i: number, champ: Partial<FormulaireOption>) =>
    changer({ options: form.options.map((o, j) => (j === i ? { ...o, ...champ } : o)) });
  const ajouterOption = () => changer({ options: [...form.options, { ...OPTION_VIDE }] });
  const retirerOption = (i: number) => changer({ options: form.options.filter((_, j) => j !== i) });

  // Idée cachée : on ne connaît pas l'envie du destinataire, on note son
  // propre avis sur l'idée.
  const priorites = idee ? PRIORITES_IDEE : PRIORITES_SOUHAIT;

  // Lien collé ou tapé : si le texte contient une adresse accompagnée d'autre
  // chose (partage Amazon : « Nom du produit https://… »), on garde l'adresse
  // et on reprend le nom du produit quand le champ Nom est vide.
  const recevoirLien = (texte: string) => {
    const { lien, titre } = extraireLien(texte);
    const complet = /https?:\/\//i.test(texte) && lien !== texte.trim();
    if (!complet) return changer({ lien: texte });
    changer({ lien, ...(titre && !form.titre.trim() ? { titre } : {}) });
  };

  // Lit la page du lien et complète les champs encore vides (rien n'est
  // enregistré : la personne vérifie puis touche « Enregistrer »).
  const remplirDepuisLaPage = async (lienBrut: string) => {
    const lien = extraireLien(lienBrut).lien;
    if (!/^https?:\/\//i.test(lien)) return;
    setMessagePage(null);
    setLecturePage(true);
    try {
      const f = await appelerAssistant<FicheEnvie>('lien-envie', { lien });
      setForm((actuel) => {
        if (!actuel) return actuel;
        const options = f.options.filter(Boolean);
        const avecOptions = options.length > 1 && actuel.options.every((o) => !o.titre.trim());
        return {
          ...actuel,
          lien: actuel.lien || f.lien,
          titre: actuel.titre.trim() || f.titre || '',
          prix: actuel.prix.trim() || (f.prix != null ? String(f.prix).replace('.', ',') : ''),
          image: actuel.image || actuel.photoLocale ? actuel.image : f.image,
          taille: actuel.taille.trim() || f.taille || '',
          description: actuel.description.trim() || f.description || '',
          ...(avecOptions
            ? { modeOptions: 'un_au_choix' as ModeOptions, options: options.map((titre) => ({ titre, lien: '', prix: '' })) }
            : {}),
        };
      });
      setProposition({ aVerifier: f.a_verifier });
    } catch (e) {
      setMessagePage(messageErreurAssistant(e));
    } finally {
      setLecturePage(false);
    }
  };

  const collerLien = async () => {
    setErreur(null);
    try {
      const texte = (await Clipboard.getStringAsync()).trim();
      if (!texte) return setErreur('Rien à coller : copiez d’abord le lien depuis le site ou l’appli.');
      if (!/https?:\/\/|www\./i.test(texte)) return setErreur('Le texte copié ne contient pas de lien.');
      recevoirLien(texte);
      // Lien collé : l'app va chercher le nom, le prix et la photo.
      if (!form.titre.trim()) remplirDepuisLaPage(texte);
    } catch {
      setErreur('Impossible de lire le presse-papiers : collez le lien dans le champ (appui long > Coller).');
    }
  };

  const enregistrer = async () => {
    setErreur(null);
    if (!form.titre.trim()) return setErreur('Indiquez au moins un nom.');
    if (form.modeOptions && form.options.filter((o) => o.titre.trim()).length < 2)
      return setErreur('Indiquez au moins deux options, ou choisissez « Un seul article ».');
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
          <PhotoAgrandie uri={apercu} style={styles.photo} libelle={form.titre || 'photo du cadeau'} />
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

      <View style={styles.bloc}>
        <Text style={styles.libelle} nativeID="libelle-lien">
          Lien vers un site marchand
        </Text>
        <View style={styles.ligneLien}>
          <TextInput
            style={[styles.champ, styles.champLien]}
            value={form.lien}
            onChangeText={recevoirLien}
            placeholder="https://…"
            placeholderTextColor={theme.colors.textMuted}
            keyboardType="url"
            autoCapitalize="none"
            autoCorrect={false}
            accessibilityLabelledBy="libelle-lien"
          />
          <Bouton variante="contour" titre="Coller" onPress={collerLien} accessibilityLabel="Coller le lien copié" />
        </View>
        <Text style={styles.aideLien}>
          Sur Amazon ou un autre site : Partager › Copier le lien, puis « Coller ».
        </Text>
        {lecturePage ? (
          <ChargementAssistant
            etapes={['J’ouvre la page…', 'Je cherche le nom et le prix…', 'Presque fini…']}
            couleur={theme.colors.accent}
          />
        ) : /^https?:\/\//i.test(extraireLien(form.lien).lien) && !proposition ? (
          <BoutonAssistant titre="Remplir avec la page" couleur={theme.colors.accent} onPress={() => remplirDepuisLaPage(form.lien)} />
        ) : null}
        {messagePage ? <MessageAssistant message={messagePage} /> : null}
        {proposition ? (
          <View style={{ gap: theme.spacing.xs }}>
            <BandeauBrouillon couleur={theme.colors.accent} />
            {proposition.aVerifier.length ? (
              <PastilleAVerifier raison={proposition.aVerifier.map((c) => NOMS_CHAMPS[c] ?? c).join(', ')} />
            ) : null}
          </View>
        ) : null}
      </View>

      <Text style={styles.libelle}>Plusieurs modèles ou articles ?</Text>
      <View style={styles.puces}>
        {([
          [null, 'Un seul article'],
          ['un_au_choix', 'Un au choix'],
          ['toutes', 'Plusieurs à offrir'],
        ] as const).map(([valeur, libelle]) => (
          <Pressable
            key={libelle}
            onPress={() => choisirMode(valeur)}
            style={[styles.puce, form.modeOptions === valeur && styles.puceActive]}
            accessibilityRole="radio"
            accessibilityState={{ selected: form.modeOptions === valeur }}
          >
            <Text style={[styles.puceTexte, form.modeOptions === valeur && styles.puceTexteActive]}>{libelle}</Text>
          </Pressable>
        ))}
      </View>
      {form.modeOptions && (
        <View style={styles.options}>
          <Text style={styles.potAide}>
            {form.modeOptions === 'un_au_choix'
              ? 'Plusieurs modèles possibles (téléphone…), un seul sera offert : le premier proche qui en réserve un réserve le cadeau.'
              : 'Plusieurs articles (figurines, livres d’une série…) : chacun se réserve séparément, un exemplaire de chaque.'}
          </Text>
          {form.options.map((o, i) => (
            <View key={o.id ?? `nouvelle-${i}`} style={styles.option}>
              <View style={styles.ligne}>
                <TextInput
                  style={[styles.champ, styles.optionTitre]}
                  value={o.titre}
                  onChangeText={(t) => changerOption(i, { titre: t })}
                  placeholder={form.modeOptions === 'un_au_choix' ? `Modèle ${i + 1}` : `Article ${i + 1}`}
                  placeholderTextColor={theme.colors.textMuted}
                  accessibilityLabel={`Nom de l’option ${i + 1}`}
                />
                <TextInput
                  style={[styles.champ, styles.optionPrix]}
                  value={o.prix}
                  onChangeText={(t) => changerOption(i, { prix: t })}
                  placeholder="€"
                  placeholderTextColor={theme.colors.textMuted}
                  keyboardType="decimal-pad"
                  accessibilityLabel={`Prix de l’option ${i + 1}`}
                />
                <Pressable
                  onPress={() => retirerOption(i)}
                  style={styles.optionRetirer}
                  accessibilityRole="button"
                  accessibilityLabel={`Retirer l’option ${i + 1}`}
                  hitSlop={6}
                >
                  <Ionicons name="close-circle-outline" size={24} color={theme.colors.textMuted} />
                </Pressable>
              </View>
              <TextInput
                style={styles.champ}
                value={o.lien}
                onChangeText={(t) => changerOption(i, { lien: t })}
                placeholder="Lien (facultatif)"
                placeholderTextColor={theme.colors.textMuted}
                keyboardType="url"
                autoCapitalize="none"
                autoCorrect={false}
                accessibilityLabel={`Lien de l’option ${i + 1}`}
              />
            </View>
          ))}
          <Bouton variante="pointille" titre="+ Ajouter une option" onPress={ajouterOption} />
        </View>
      )}

      {form.modeOptions !== 'toutes' && (
      <Pressable
        onPress={() => changer({ potCommun: !form.potCommun })}
        style={[styles.pot, form.potCommun && styles.potActif]}
        accessibilityRole="switch"
        accessibilityState={{ checked: form.potCommun }}
        accessibilityLabel="Pot commun"
      >
        <Ionicons
          name={form.potCommun ? 'checkbox' : 'square-outline'}
          size={24}
          color={form.potCommun ? theme.colors.accent : theme.colors.textMuted}
        />
        <View style={styles.potTextes}>
          <Text style={styles.potTitre}>Pot commun</Text>
          <Text style={styles.potAide}>
            {form.modeOptions === 'un_au_choix'
              ? 'La famille finance ensemble un des modèles : on participe au pot, les modèles servent d’indication pour l’achat.'
              : idee
              ? `Cadeau cher ou voyage : chacun participe de la somme qu’il veut. ${prenom ?? 'La personne'} ne verra rien.`
              : 'Cadeau cher ou voyage : la famille participe à plusieurs. Chacun ne voit que son propre montant ; la somme réunie reste une surprise pour vous.'}
          </Text>
        </View>
      </Pressable>
      )}

      {!form.potCommun && <Text style={styles.libelle}>Prix</Text>}
      {!form.potCommun && (
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
      )}
      <View style={styles.ligne}>
        <View style={styles.moitie}>
          {champ('prix', form.potCommun ? 'Montant à réunir (€)' : form.typePrix === 'budget' ? 'Jusqu’à (€)' : 'Environ (€)', {
            placeholder: form.potCommun ? '600' : form.typePrix === 'budget' ? '50' : '25',
            clavier: 'decimal-pad',
          })}
        </View>
        <View style={styles.moitie}>{champ('taille', 'Taille / pointure', { placeholder: 'Ex. 38' })}</View>
      </View>
      {champ('description', 'Précisions', { placeholder: 'Couleur, modèle, où le trouver…', multiligne: true })}

      <Text style={styles.libelle}>{idee ? 'Votre avis sur cette idée' : 'Envie'}</Text>
      <View style={styles.puces}>
        {priorites.map((p) => (
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

      {!form.potCommun && !form.modeOptions && <Text style={styles.libelle}>Quantité souhaitée</Text>}
      {!form.potCommun && !form.modeOptions && (
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
      )}

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
  ligneLien: { flexDirection: 'row', gap: theme.spacing.xs, alignItems: 'center' },
  champLien: { flex: 1 },
  aideLien: { fontFamily: theme.fontBody, fontSize: 12, color: theme.colors.textMuted },
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
  options: { gap: theme.spacing.sm },
  option: {
    gap: theme.spacing.xs,
    padding: theme.spacing.sm,
    borderRadius: theme.radii.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  optionTitre: { flex: 1 },
  optionPrix: { width: 76 },
  optionRetirer: { width: 32, alignItems: 'center', justifyContent: 'center' },
  pot: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    alignItems: 'flex-start',
    marginTop: theme.spacing.xs,
    padding: theme.spacing.sm,
    borderRadius: theme.radii.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  potActif: { borderColor: theme.colors.accent, backgroundColor: theme.colors.accentTransparent },
  potTextes: { flex: 1, gap: 2 },
  potTitre: { fontFamily: theme.fontBodyBold, fontSize: 15, color: theme.colors.text },
  potAide: { fontFamily: theme.fontBody, fontSize: 13, color: theme.colors.textMuted, lineHeight: 18 },
  erreur: { fontFamily: theme.fontBody, fontSize: 14, color: theme.colors.warning, padding: theme.spacing.sm },
}));
