import React, { useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, ScrollView, ActivityIndicator } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { theme, creerStylesThemes } from '../../theme/theme';
import { useAuth } from '../../contexts/AuthContext';
import SelecteurCategories from '../../components/SelecteurCategories';
import {
  ouvrirSauvegarde,
  repererDoublons,
  importerRecettes,
  type SauvegardeMyRecipeBox,
  type BilanImport,
} from '../../services/importMyRecipeBox';

// Import d'une sauvegarde de l'application My Recipe Box (fichier .rtk) :
// l'utilisateur choisit le fichier, voit la liste des recettes trouvées
// (toutes cochées, sauf celles déjà présentes dans le foyer), peut leur
// donner une catégorie commune, puis les enregistre d'un coup, photos
// comprises. Les recettes importées se corrigent ensuite une à une comme
// n'importe quelle recette (crayon ✎ de la fiche).

const ID_KEEP_AWAKE = 'import-my-recipe-box';

type Etape = 'choix' | 'lecture' | 'liste' | 'import' | 'fini';

export default function ImportMyRecipeBoxScreen({ navigation }: any) {
  const { foyer, session } = useAuth();
  const [etape, setEtape] = useState<Etape>('choix');
  const [erreur, setErreur] = useState<string | null>(null);
  const [sauvegarde, setSauvegarde] = useState<SauvegardeMyRecipeBox | null>(null);
  const [doublons, setDoublons] = useState<Set<string>>(new Set());
  const [cochees, setCochees] = useState<Set<string>>(new Set());
  const [categories, setCategories] = useState<string[]>([]);
  const [progression, setProgression] = useState({ faites: 0, total: 0, titre: '' });
  const [bilan, setBilan] = useState<BilanImport | null>(null);
  const arreter = useRef(false);

  const choisirFichier = async () => {
    setErreur(null);
    const choix = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true, multiple: false });
    if (choix.canceled || !choix.assets?.[0]) return;
    const fichier = choix.assets[0];
    if (fichier.name && !/\.(rtk|zip)$/i.test(fichier.name)) {
      setErreur('Choisissez le fichier de sauvegarde de My Recipe Box : son nom se termine par .rtk.');
      return;
    }
    setEtape('lecture');
    try {
      const lue = await ouvrirSauvegarde(fichier.uri);
      const deja = foyer ? await repererDoublons(foyer.id, lue.recettes).catch(() => new Set<string>()) : new Set<string>();
      setSauvegarde(lue);
      setDoublons(deja);
      setCochees(new Set(lue.recettes.filter((r) => !deja.has(r.cle)).map((r) => r.cle)));
      setEtape('liste');
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Impossible de lire ce fichier.');
      setEtape('choix');
    }
  };

  const basculer = (cle: string) =>
    setCochees((avant) => {
      const apres = new Set(avant);
      if (apres.has(cle)) apres.delete(cle);
      else apres.add(cle);
      return apres;
    });

  const aImporter = useMemo(
    () => (sauvegarde ? sauvegarde.recettes.filter((r) => cochees.has(r.cle)) : []),
    [sauvegarde, cochees]
  );
  const toutCoche = !!sauvegarde && cochees.size === sauvegarde.recettes.length;

  const lancer = async () => {
    if (!sauvegarde || !foyer || !session || aImporter.length === 0) return;
    arreter.current = false;
    setEtape('import');
    setProgression({ faites: 0, total: aImporter.length, titre: '' });
    await activateKeepAwakeAsync(ID_KEEP_AWAKE).catch(() => {});
    try {
      const resultat = await importerRecettes(
        sauvegarde,
        aImporter,
        foyer.id,
        session.user.id,
        categories,
        (faites, total, titre) => setProgression({ faites, total, titre }),
        () => arreter.current
      );
      setBilan(resultat);
    } finally {
      deactivateKeepAwake(ID_KEEP_AWAKE);
      setEtape('fini');
    }
  };

  if (etape === 'choix' || etape === 'lecture') {
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.contenu}>
        <Text style={styles.titre}>Sauvegarde My Recipe Box</Text>
        <Text style={styles.aide}>
          Dans My Recipe Box, faites une sauvegarde (ou « Partager » vos recettes) : vous obtenez un fichier qui se
          termine par .rtk. Ouvrez-le ici : toutes ses recettes, avec leurs photos, ingrédients et étapes,
          rejoindront les recettes de votre foyer.
        </Text>
        {erreur && <Text style={styles.erreur}>{erreur}</Text>}
        <Pressable style={styles.boutonPrincipal} onPress={choisirFichier} disabled={etape === 'lecture'}>
          {etape === 'lecture' ? (
            <ActivityIndicator color={theme.colors.background} />
          ) : (
            <Text style={styles.boutonPrincipalTexte}>Choisir le fichier .rtk</Text>
          )}
        </Pressable>
      </ScrollView>
    );
  }

  if (etape === 'import') {
    const { faites, total, titre } = progression;
    return (
      <View style={[styles.container, styles.contenu, styles.centre]}>
        <ActivityIndicator color={theme.colors.accent} size="large" />
        <Text style={styles.titre}>
          Recette {Math.min(faites + 1, total)} sur {total}
        </Text>
        <View style={styles.barre}>
          <View style={[styles.barrePleine, { width: `${total ? (faites / total) * 100 : 0}%` }]} />
        </View>
        {titre ? <Text style={styles.aide}>{titre}</Text> : null}
        <Text style={styles.aide}>Gardez l'application ouverte pendant l'import.</Text>
        <Pressable style={styles.boutonSecondaire} onPress={() => (arreter.current = true)}>
          <Text style={styles.boutonSecondaireTexte}>Arrêter après celle-ci</Text>
        </Pressable>
      </View>
    );
  }

  if (etape === 'fini' && bilan) {
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.contenu}>
        <Text style={styles.titre}>
          {bilan.importees === 1 ? '1 recette importée' : `${bilan.importees} recettes importées`}
        </Text>
        {bilan.arrete && <Text style={styles.aide}>Import arrêté avant la fin : relancez-le pour les suivantes (elles seront repérées comme déjà présentes).</Text>}
        {bilan.echecs.length > 0 && (
          <>
            <Text style={styles.erreur}>Pas pu importer ({bilan.echecs.length}) :</Text>
            {bilan.echecs.map((t) => (
              <Text key={t} style={styles.aide}>
                • {t}
              </Text>
            ))}
            <Text style={styles.aide}>Vérifiez votre connexion puis relancez l'import avec le même fichier.</Text>
          </>
        )}
        {categories.length === 0 && bilan.importees > 0 && (
          <Text style={styles.aide}>
            Les recettes sans catégorie sont dans la vignette « Sans catégorie » de l'accueil.
          </Text>
        )}
        <Pressable style={styles.boutonPrincipal} onPress={() => navigation.popToTop()}>
          <Text style={styles.boutonPrincipalTexte}>Voir nos recettes</Text>
        </Pressable>
      </ScrollView>
    );
  }

  // Liste des recettes trouvées.
  const recettes = sauvegarde?.recettes ?? [];
  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.contenu} keyboardShouldPersistTaps="handled">
        <Text style={styles.titre}>
          {recettes.length} recette{recettes.length > 1 ? 's' : ''} trouvée{recettes.length > 1 ? 's' : ''}
        </Text>
        {doublons.size > 0 && (
          <Text style={styles.aide}>
            {doublons.size === 1
              ? '1 recette porte déjà le nom d’une de vos recettes : elle est décochée.'
              : `${doublons.size} recettes portent déjà le nom d’une de vos recettes : elles sont décochées.`}
          </Text>
        )}

        <Text style={styles.label}>Catégorie pour toutes ces recettes (facultatif)</Text>
        <Text style={styles.aide}>Vous pourrez ensuite changer la catégorie de chaque recette.</Text>
        <SelecteurCategories selection={categories} onChange={setCategories} />

        <Pressable
          style={styles.toutCocher}
          onPress={() => setCochees(toutCoche ? new Set() : new Set(recettes.map((r) => r.cle)))}
        >
          <Text style={styles.lien}>{toutCoche ? 'Tout décocher' : 'Tout cocher'}</Text>
        </Pressable>

        {recettes.map((r) => {
          const coche = cochees.has(r.cle);
          return (
            <Pressable key={r.cle} style={styles.ligne} onPress={() => basculer(r.cle)}>
              <View style={[styles.case, coche && styles.caseCochee]}>
                {coche && <Text style={styles.caseTexte}>✓</Text>}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.nomRecette}>{r.formulaire.titre}</Text>
                <Text style={styles.resume}>
                  {r.resume}
                  {doublons.has(r.cle) ? ' · déjà dans vos recettes' : ''}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
      <View style={styles.pied}>
        <Pressable
          style={[styles.boutonPrincipal, aImporter.length === 0 && { opacity: 0.5 }]}
          disabled={aImporter.length === 0}
          onPress={lancer}
        >
          <Text style={styles.boutonPrincipalTexte}>
            Importer {aImporter.length} recette{aImporter.length > 1 ? 's' : ''}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = creerStylesThemes(() => ({
  container: { flex: 1, backgroundColor: theme.colors.background },
  contenu: { padding: theme.spacing.md, gap: theme.spacing.sm },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  titre: { fontFamily: theme.fontTitle, fontSize: 20, color: theme.colors.accent },
  label: { fontFamily: theme.fontBodyBold, color: theme.colors.text, fontSize: 15, marginTop: theme.spacing.sm },
  aide: { fontFamily: theme.fontBody, color: theme.colors.textMuted, fontSize: 13 },
  erreur: { fontFamily: theme.fontBody, color: theme.colors.warning },
  lien: { fontFamily: theme.fontBodyBold, color: theme.colors.accent },
  toutCocher: { alignSelf: 'flex-end', paddingVertical: theme.spacing.xs, marginTop: theme.spacing.sm },
  ligne: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  case: {
    width: 24,
    height: 24,
    borderRadius: theme.radii.sm,
    borderWidth: 2,
    borderColor: theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  caseCochee: { backgroundColor: theme.colors.accent, borderColor: theme.colors.accent },
  caseTexte: { color: theme.colors.background, fontFamily: theme.fontBodyBold, fontSize: 14 },
  nomRecette: { fontFamily: theme.fontBodyBold, color: theme.colors.text, fontSize: 15 },
  resume: { fontFamily: theme.fontBody, color: theme.colors.textMuted, fontSize: 12 },
  pied: {
    padding: theme.spacing.md,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    backgroundColor: theme.colors.background,
  },
  barre: {
    width: '100%',
    height: 8,
    borderRadius: 4,
    backgroundColor: theme.colors.surface,
    overflow: 'hidden',
  },
  barrePleine: { height: '100%', backgroundColor: theme.colors.accent },
  boutonPrincipal: {
    backgroundColor: theme.colors.accent,
    borderRadius: theme.radii.md,
    paddingVertical: theme.spacing.md,
    alignItems: 'center',
    marginTop: theme.spacing.sm,
  },
  boutonPrincipalTexte: { fontFamily: theme.fontBodyBold, fontSize: 16, color: theme.colors.background },
  boutonSecondaire: {
    borderColor: theme.colors.accent,
    borderWidth: 1,
    borderRadius: theme.radii.md,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    marginTop: theme.spacing.md,
  },
  boutonSecondaireTexte: { fontFamily: theme.fontBodyBold, color: theme.colors.accent },
}));
