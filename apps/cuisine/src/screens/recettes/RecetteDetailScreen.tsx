import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  Pressable,
  ActivityIndicator,
  Linking,
} from 'react-native';
import { alerte } from '../../utils/alerte';
import { useFocusEffect } from '@react-navigation/native';
import { theme, creerStylesThemes, useLargeurContenu } from '../../theme/theme';
import { useAuth } from '../../contexts/AuthContext';
import {
  etoilesDeNote,
  groupesParElement,
  noteMoyenne,
  obtenirRecette,
  resoudreEtapePourAffichage,
  resoudreLibelleIngredient,
  supprimerRecette,
  etatSurprise,
  revelerRecette,
} from '../../services/recettes';
import {
  LIBELLES_DIFFICULTE,
  LIBELLES_TEMPS,
  LIBELLES_VERDICT,
  listerEssais,
  syntheseEssais,
} from '../../services/essais';
import { obtenirOuCreerListeActive, ajouterRecettesALaListe } from '../../services/listesCourses';
import type { EssaiComplet, RecetteComplete } from '../../types/models';
import ReglageQuantites, { AJUSTEMENT_INITIAL, type AjustementQuantites } from '../../components/ReglageQuantites';

function formaterDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}

// Carte d'un essai : qui (prénom · foyer), quand, verdict, ressenti, soucis
// reliés à leur solution ou au changement apporté, commentaire, photo.
function CarteEssai({
  essai,
  recette,
  estMien,
  onModifier,
}: {
  essai: EssaiComplet;
  recette: RecetteComplete;
  estMien: boolean;
  onModifier: () => void;
}) {
  const numeroEtape = (etapeId: string | null) => {
    if (!etapeId) return null;
    const index = recette.etapes.findIndex((e) => e.id === etapeId);
    return index >= 0 ? index + 1 : null;
  };

  return (
    <View style={styles.carteEssai}>
      <View style={styles.carteEssaiEnTete}>
        <Text style={styles.auteurEssai}>
          {essai.auteurPrenom ?? 'Quelqu’un'}
          {essai.foyerNom ? ` · ${essai.foyerNom}` : ''}
        </Text>
        <Text style={styles.dateEssai}>{formaterDate(essai.realise_le)}</Text>
      </View>

      <Text style={styles.verdictEssai}>
        {essai.verdict
          ? `${'★'.repeat(essai.verdict)}${'☆'.repeat(4 - essai.verdict)}  ${LIBELLES_VERDICT[essai.verdict]}`
          : 'Pas encore goûtée'}
      </Text>

      {(essai.difficulte || essai.temps) && (
        <View style={styles.puces}>
          {essai.difficulte && (
            <View style={styles.puce}>
              <Text style={styles.puceTexte}>{LIBELLES_DIFFICULTE[essai.difficulte]}</Text>
            </View>
          )}
          {essai.temps && (
            <View style={styles.puce}>
              <Text style={styles.puceTexte}>{LIBELLES_TEMPS[essai.temps]}</Text>
            </View>
          )}
        </View>
      )}

      {essai.points.map((point) => {
        const numero = numeroEtape(point.etape_id);
        return (
          <View key={point.id} style={styles.pointEssai}>
            {numero && <Text style={styles.etiquetteEtape}>Étape {numero}</Text>}
            {point.souci ? <Text style={styles.texteEssai}>⚠️ {point.souci}</Text> : null}
            {point.reponses.map((r) => (
              <Text key={r.id} style={styles.texteEssai}>
                {r.nature === 'changement' ? '✏️ ' : '💡 '}
                {r.texte}
              </Text>
            ))}
          </View>
        );
      })}

      {essai.commentaire ? <Text style={styles.commentaireEssai}>« {essai.commentaire} »</Text> : null}
      {essai.photo_url ? <Image source={{ uri: essai.photo_url }} style={styles.photoEssai} /> : null}

      {estMien && (
        <Pressable onPress={onModifier} hitSlop={6}>
          <Text style={styles.lienModifier}>
            {essai.verdict ? 'Modifier mon essai' : 'Ajouter mon verdict après dégustation'}
          </Text>
        </Pressable>
      )}
    </View>
  );
}

// Fiche recette : ingrédients, étapes (avec quantités déjà résolues), accès
// au mode assistant et à l'ajout dans la liste de courses (§4, §7, §8), et
// "Nos essais" : retours d'expérience de toute la famille.
export default function RecetteDetailScreen({ route, navigation }: any) {
  const { recetteId } = route.params;
  const { session, foyer, foyersFamille } = useAuth();
  const [recette, setRecette] = useState<RecetteComplete | null>(null);
  const [chargement, setChargement] = useState(true);
  const [suppression, setSuppression] = useState(false);
  const [ajoutListe, setAjoutListe] = useState(false);
  const [revelation, setRevelation] = useState(false);
  const [essais, setEssais] = useState<EssaiComplet[]>([]);
  // Quantités adaptées au moment de faire la recette (parts, ou "ce que
  // j'ai" — ex. 6 œufs au lieu de 8) ; transmises au mode assistant.
  const [ajustement, setAjustement] = useState<AjustementQuantites>(AJUSTEMENT_INITIAL);
  const { width: largeurFenetre } = useLargeurContenu();
  const largeurPhoto = largeurFenetre - 2 * theme.spacing.md;

  // Recharge à chaque retour sur l'écran, notamment après modification de la
  // recette (crayon ✎ ci-dessous) : sans ça, la fiche resterait figée sur
  // l'ancienne version tant qu'on ne quitte pas complètement l'écran.
  useFocusEffect(
    useCallback(() => {
      obtenirRecette(recetteId)
        .then((r) => {
          // Diagnostic temporaire (retour : "à l'ouverture de l'appli, la
          // Préparation ne s'affiche pas pour une recette en particulier,
          // mais s'affiche en y revenant") — visible dans le terminal
          // `npx expo start`, pour savoir si le souci vient de la donnée
          // reçue (0 étape, ou étapes sans texte) ou de l'affichage.
          console.log(
            `[DetailRecette] "${r.titre}" — ${r.ingredients.length} ingrédient(s), ${r.etapes.length} étape(s)` +
              (r.etapes.length > 0 ? `, 1ère étape : "${r.etapes[0].texte.slice(0, 40)}"` : '')
          );
          setRecette(r);
        })
        .catch((e) => console.error('[DetailRecette] échec du chargement', e))
        .finally(() => setChargement(false));
      listerEssais(recetteId, foyersFamille)
        .then(setEssais)
        .catch((e) => console.error('[DetailRecette] échec du chargement des essais', e));
    }, [recetteId, foyersFamille])
  );

  if (chargement) {
    return (
      <View style={styles.centre}>
        <ActivityIndicator color={theme.colors.accent} />
      </View>
    );
  }

  if (!recette) {
    return (
      <View style={styles.centre}>
        <Text style={styles.erreur}>Recette introuvable.</Text>
      </View>
    );
  }

  // Seul le créateur de la recette peut la supprimer (retour utilisateur) —
  // le bouton n'apparaît donc que pour lui ; la politique RLS côté base
  // (supabase/setup.sql) refuse de toute façon la suppression à quiconque
  // d'autre, ce contrôle d'affichage n'est qu'un confort.
  const estCreateur = session?.user.id === recette.cree_par;
  // Recette d'un autre foyer de la famille : visible, mais non modifiable.
  const estDeMonFoyer = recette.foyer_id === foyer?.id;
  // Recette surprise encore cachée (null si visible de toute la famille).
  const surprise = etatSurprise(recette);
  const cacheeParMoi = recette.cachee_par === session?.user.id;
  const { note, nbAvis } = noteMoyenne(recette);
  const synthese = syntheseEssais(essais);
  // Mon dernier essai encore sans verdict : on propose de le compléter.
  const essaiAGouter = essais.find((e) => e.auteur_id === session?.user.id && e.verdict == null);

  const demanderSuppression = () => {
    alerte(
      'Supprimer cette recette ?',
      `"${recette.titre}" sera définitivement supprimée. Cette action est irréversible.`,
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Supprimer', style: 'destructive', onPress: confirmerSuppression },
      ]
    );
  };

  // Ajoute directement cette recette (à ses parts par défaut) à la liste de
  // courses du foyer, sans passer par l'écran de sélection parmi toutes les
  // recettes (retour utilisateur : seule la recette courante est concernée
  // ici — cet écran de sélection multiple reste utile depuis l'onglet
  // "Liste de courses", pour composer les courses de plusieurs recettes).
  const ajouterALaListeDeCourses = async () => {
    if (!recette || !foyer) return;
    setAjoutListe(true);
    try {
      const liste = await obtenirOuCreerListeActive(foyer.id);
      await ajouterRecettesALaListe(liste.id, [{ recette, partsSouhaitees: recette.parts_defaut * ajustement.facteur }]);
      navigation.navigate('Onglets', { screen: 'Courses' });
    } catch (e) {
      alerte('Échec de l’ajout', e instanceof Error ? e.message : 'Veuillez réessayer.');
    } finally {
      setAjoutListe(false);
    }
  };

  // Recette surprise : la rendre visible de toute la famille dès maintenant.
  const demanderRevelation = () => {
    alerte('Révéler la recette ?', `"${recette.titre}" sera visible de toute la famille dès maintenant.`, [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Révéler',
        onPress: async () => {
          setRevelation(true);
          try {
            await revelerRecette(recette.id);
            setRecette({ ...recette, cachee: null, revelee_le: null, cachee_par: null });
          } catch (e) {
            alerte('Échec', e instanceof Error ? e.message : 'Veuillez réessayer.');
          } finally {
            setRevelation(false);
          }
        },
      },
    ]);
  };

  const confirmerSuppression = async () => {
    setSuppression(true);
    try {
      await supprimerRecette(recette.id);
      navigation.goBack();
    } catch (e) {
      alerte('Échec de la suppression', e instanceof Error ? e.message : 'Veuillez réessayer.');
      setSuppression(false);
    }
  };

  if (suppression) {
    return (
      <View style={styles.centre}>
        <ActivityIndicator color={theme.colors.accent} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contenu}>
      {recette.photos.length > 0 && (
        <ScrollView
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          style={[styles.galeriePhotos, { width: largeurPhoto }]}
        >
          {recette.photos.map((photo) => (
            <Image key={photo.id} source={{ uri: photo.url }} style={[styles.photo, { width: largeurPhoto }]} />
          ))}
        </ScrollView>
      )}
      {recette.photos.length > 1 && (
        <Text style={styles.compteurPhotos}>{recette.photos.length} photos — faites glisser pour les voir</Text>
      )}

      <View style={styles.enTeteTitre}>
        <Text style={styles.titre}>{recette.titre}</Text>
        <View style={styles.actionsTitre}>
          {estDeMonFoyer && (
            <Pressable
              hitSlop={8}
              onPress={() => navigation.navigate('CreationRecette', { recetteId: recette.id })}
            >
              <Text style={styles.crayonTitre}>✎</Text>
            </Pressable>
          )}
          {estCreateur && estDeMonFoyer && (
            <Pressable hitSlop={8} onPress={demanderSuppression}>
              <Text style={styles.corbeilleTitre}>🗑</Text>
            </Pressable>
          )}
        </View>
      </View>

      {!estDeMonFoyer && recette.foyer?.nom && (
        <Text style={styles.foyerOrigine}>Recette de {recette.foyer.nom}</Text>
      )}

      {surprise && (
        <View style={styles.bandeauSurprise}>
          <Text style={styles.bandeauSurpriseTitre}>🤫 Recette surprise</Text>
          <Text style={styles.bandeauSurpriseTexte}>
            {surprise.portee === 'moi'
              ? cacheeParMoi
                ? 'Visible de vous seul : cachée à tout le reste de la famille, votre foyer compris.'
                : 'Visible de la personne qui l’a cachée seulement.'
              : 'Visible de votre foyer seulement : cachée au reste de la famille.'}
            {surprise.reveleeLe
              ? ` Elle sera révélée automatiquement le ${formaterDate(surprise.reveleeLe)}.`
              : ' Elle reste cachée jusqu’à ce que vous la révéliez.'}
          </Text>
          {surprise.portee === 'moi' && (
            <Text style={styles.bandeauSurpriseAide}>
              Ajoutée à la liste de courses, elle y apparaît sous le nom « Recette surprise ».
            </Text>
          )}
          <Pressable style={styles.boutonReveler} onPress={demanderRevelation} disabled={revelation}>
            {revelation ? (
              <ActivityIndicator color={theme.colors.accent} />
            ) : (
              <Text style={styles.boutonRevelerTexte}>Révéler maintenant</Text>
            )}
          </Pressable>
        </View>
      )}

      {recette.categories.length > 0 && (
        <View style={styles.puces}>
          {recette.categories.map((c) => (
            <View key={c.id} style={styles.puce}>
              <Text style={styles.puceTexte}>{c.nom}</Text>
            </View>
          ))}
        </View>
      )}

      <View style={styles.infos}>
        <Text style={styles.info}>{recette.parts_defaut} parts</Text>
        {recette.temps_preparation_minutes != null && (
          <Text style={styles.info}>Préparation : {recette.temps_preparation_minutes} min</Text>
        )}
        {recette.temps_cuisson_minutes != null && (
          <Text style={styles.info}>Cuisson : {recette.temps_cuisson_minutes} min</Text>
        )}
      </View>

      {note != null && (
        <Text style={styles.etoiles}>
          {etoilesDeNote(note)}
          {nbAvis > 0 && <Text style={styles.nbAvis}>  {nbAvis} avis</Text>}
        </Text>
      )}
      {synthese && <Text style={styles.synthese}>{synthese}</Text>}

      {essaiAGouter && (
        <Pressable
          style={styles.rappelVerdict}
          onPress={() => navigation.navigate('EssaiRecette', { recetteId: recette.id, essaiId: essaiAGouter.id })}
        >
          <Text style={styles.rappelVerdictTexte}>Vous l’avez goûtée ? Donnez votre verdict →</Text>
        </Pressable>
      )}

      <Pressable
        style={styles.boutonPrincipal}
        onPress={() => navigation.navigate('AssistantRecette', { recetteId: recette.id, ajustement })}
      >
        <Text style={styles.boutonPrincipalTexte}>Lancer le mode assistant</Text>
      </Pressable>
      <Pressable style={styles.boutonSecondaire} onPress={ajouterALaListeDeCourses} disabled={ajoutListe}>
        {ajoutListe ? (
          <ActivityIndicator color={theme.colors.accent} />
        ) : (
          <Text style={styles.boutonSecondaireTexte}>Ajouter à la liste de courses</Text>
        )}
      </Pressable>
      <Pressable
        style={styles.boutonSecondaire}
        onPress={() => navigation.navigate('EssaiRecette', { recetteId: recette.id })}
      >
        <Text style={styles.boutonSecondaireTexte}>Je l’ai faite : raconter mon essai</Text>
      </Pressable>

      <Text style={styles.section}>Ingrédients</Text>
      <ReglageQuantites
        partsDefaut={recette.parts_defaut}
        ingredients={recette.ingredients}
        ajustement={ajustement}
        onChange={setAjustement}
      />
      {/* Les éléments sans ingrédient (ex. "Montage") ne sont pas listés ici. */}
      {groupesParElement(recette).filter((groupe) => groupe.ingredients.length > 0).map((groupe) => (
        <View key={groupe.id ?? 'sans-element'} style={styles.groupeElement}>
          {groupe.nom && <Text style={styles.titreElement}>{groupe.nom}</Text>}
          {groupe.ingredients.map((ing) => (
            <Text key={ing.id} style={styles.ingredient}>
              • {resoudreLibelleIngredient(ing, ajustement.facteur)}
            </Text>
          ))}
        </View>
      ))}

      <Text style={styles.section}>Préparation</Text>
      {/* Diagnostic temporaire — à retirer une fois le souci identifié (voir
          le commentaire sur le useFocusEffect ci-dessus). */}
      <Text style={styles.diagnostic}>
        [diagnostic] {recette.etapes.length} étape(s) reçue(s)
      </Text>
      {groupesParElement(recette).filter((groupe) => groupe.etapes.length > 0).map((groupe) => (
        <View key={groupe.id ?? 'sans-element'} style={styles.groupeElement}>
          {groupe.nom && <Text style={styles.titreElement}>{groupe.nom}</Text>}
          {groupe.etapes.map((etape, index) => (
            <View key={etape.id} style={styles.blocEtape}>
              <Text style={styles.numeroEtape}>{index + 1}</Text>
              <View style={styles.contenuEtape}>
                <Text style={styles.texteEtape}>
                  {resoudreEtapePourAffichage(etape.texte, recette.ingredients, ajustement.facteur)}
                </Text>
                {etape.recette_liee_id && (
                  // Sous-recette référencée par cette étape (ex. "faire une pâte
                  // brisée") — ouvre sa fiche ; le retour arrière ramène ici.
                  <Pressable
                    style={styles.boutonRecetteLiee}
                    onPress={() => navigation.push('DetailRecette', { recetteId: etape.recette_liee_id })}
                  >
                    <Text style={styles.boutonRecetteLieeTexte}>
                      → Voir la recette : {etape.recette_liee?.titre ?? '…'}
                    </Text>
                  </Pressable>
                )}
              </View>
            </View>
          ))}
        </View>
      ))}

      {recette.notes && (
        <>
          <Text style={styles.section}>Notes</Text>
          <Text style={styles.notes}>{recette.notes}</Text>
        </>
      )}

      {recette.source_url && (
        <Pressable onPress={() => Linking.openURL(recette.source_url as string)}>
          <Text style={styles.lienOrigine}>Voir la recette d'origine ↗</Text>
        </Pressable>
      )}

      <Text style={styles.section}>Nos essais</Text>
      {essais.length === 0 ? (
        <Text style={styles.aucunEssai}>
          Personne n’a encore raconté son essai. Soyez le premier après l’avoir réalisée !
        </Text>
      ) : (
        essais.map((essai) => (
          <CarteEssai
            key={essai.id}
            essai={essai}
            recette={recette}
            estMien={essai.auteur_id === session?.user.id}
            onModifier={() => navigation.navigate('EssaiRecette', { recetteId: recette.id, essaiId: essai.id })}
          />
        ))
      )}
    </ScrollView>
  );
}

const styles = creerStylesThemes(() => ({
  bandeauSurprise: {
    borderColor: theme.colors.accent,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: theme.radii.md,
    backgroundColor: theme.colors.surface,
    padding: theme.spacing.md,
    gap: theme.spacing.xs,
    marginBottom: theme.spacing.md,
  },
  bandeauSurpriseTitre: { fontFamily: theme.fontBodyBold, color: theme.colors.accent, fontSize: 16 },
  bandeauSurpriseTexte: { fontFamily: theme.fontBody, color: theme.colors.text, fontSize: 15, lineHeight: 21 },
  bandeauSurpriseAide: { fontFamily: theme.fontBody, color: theme.colors.textMuted, fontSize: 13 },
  boutonReveler: {
    alignSelf: 'flex-start',
    borderColor: theme.colors.accent,
    borderWidth: 1,
    borderRadius: theme.radii.md,
    paddingVertical: theme.spacing.xs,
    paddingHorizontal: theme.spacing.md,
    marginTop: theme.spacing.xs,
  },
  boutonRevelerTexte: { fontFamily: theme.fontBodyBold, color: theme.colors.accent, fontSize: 14 },
  container: { flex: 1, backgroundColor: theme.colors.background },
  contenu: { padding: theme.spacing.md, gap: theme.spacing.sm },
  centre: { flex: 1, backgroundColor: theme.colors.background, alignItems: 'center', justifyContent: 'center' },
  erreur: { fontFamily: theme.fontBody, color: theme.colors.warning },
  diagnostic: { fontFamily: theme.fontBody, color: theme.colors.warning, fontSize: 11 },
  galeriePhotos: { height: 200, borderRadius: theme.radii.md, overflow: 'hidden' },
  photo: { height: 200, borderRadius: theme.radii.md },
  compteurPhotos: {
    fontFamily: theme.fontBody,
    color: theme.colors.textMuted,
    fontSize: 12,
    textAlign: 'center',
    marginTop: -theme.spacing.xs,
  },
  enTeteTitre: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  titre: { fontFamily: theme.fontTitle, fontSize: 26, color: theme.colors.accent, flexShrink: 1 },
  actionsTitre: { flexDirection: 'row', alignItems: 'center' },
  crayonTitre: { fontSize: 22, color: theme.colors.accent, paddingHorizontal: 4 },
  corbeilleTitre: { fontSize: 20, color: theme.colors.warning, paddingHorizontal: 4 },
  puces: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.xs },
  puce: { backgroundColor: theme.colors.selection, borderRadius: theme.radii.sm, paddingVertical: 3, paddingHorizontal: theme.spacing.sm },
  puceTexte: { fontFamily: theme.fontBody, fontSize: 12, color: theme.colors.text },
  infos: { flexDirection: 'row', gap: theme.spacing.md },
  info: { fontFamily: theme.fontBody, color: theme.colors.textMuted, fontSize: 13 },
  etoiles: { color: theme.colors.accent, fontSize: 18, marginTop: -theme.spacing.xs },
  nbAvis: { fontFamily: theme.fontBody, fontSize: 13, color: theme.colors.textMuted },
  synthese: { fontFamily: theme.fontBody, fontSize: 14, fontStyle: 'italic', color: theme.colors.textMuted },
  foyerOrigine: { fontFamily: theme.fontManuscrit, fontSize: 18, color: theme.colors.textMuted, marginTop: -theme.spacing.xs },
  rappelVerdict: {
    backgroundColor: theme.colors.selectionTransparent,
    borderColor: theme.colors.accent,
    borderWidth: 1,
    borderRadius: theme.radii.md,
    padding: theme.spacing.sm,
  },
  rappelVerdictTexte: { fontFamily: theme.fontBodyBold, color: theme.colors.accent, textAlign: 'center' },
  aucunEssai: { fontFamily: theme.fontBody, fontStyle: 'italic', color: theme.colors.textMuted },
  carteEssai: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radii.md,
    padding: theme.spacing.md,
    gap: theme.spacing.xs,
  },
  carteEssaiEnTete: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: theme.spacing.sm },
  auteurEssai: { fontFamily: theme.fontManuscrit, fontSize: 20, color: theme.colors.text, flexShrink: 1 },
  dateEssai: { fontFamily: theme.fontBody, fontSize: 12, color: theme.colors.textMuted },
  verdictEssai: { fontFamily: theme.fontBodyBold, fontSize: 15, color: theme.colors.accent },
  pointEssai: {
    borderLeftColor: theme.colors.accent,
    borderLeftWidth: 2,
    paddingLeft: theme.spacing.sm,
    gap: 2,
    marginTop: theme.spacing.xs,
  },
  etiquetteEtape: { fontFamily: theme.fontBodyBold, fontSize: 12, color: theme.colors.textMuted },
  texteEssai: { fontFamily: theme.fontBody, fontSize: 15, color: theme.colors.text, lineHeight: 21 },
  commentaireEssai: { fontFamily: theme.fontBody, fontStyle: 'italic', fontSize: 15, color: theme.colors.text, marginTop: theme.spacing.xs },
  photoEssai: { width: '100%', height: 160, borderRadius: theme.radii.md, marginTop: theme.spacing.xs },
  lienModifier: { fontFamily: theme.fontBody, fontSize: 13, color: theme.colors.accent, textDecorationLine: 'underline', marginTop: theme.spacing.xs },
  boutonPrincipal: { backgroundColor: theme.colors.accent, borderRadius: theme.radii.md, paddingVertical: theme.spacing.md, alignItems: 'center' },
  boutonPrincipalTexte: { fontFamily: theme.fontBodyBold, fontSize: 16, color: theme.colors.background },
  boutonSecondaire: { borderColor: theme.colors.accent, borderWidth: 1, borderRadius: theme.radii.md, paddingVertical: theme.spacing.md, alignItems: 'center' },
  boutonSecondaireTexte: { fontFamily: theme.fontBodyBold, fontSize: 15, color: theme.colors.accent },
  section: { fontFamily: theme.fontTitle, fontSize: 18, color: theme.colors.accent, marginTop: theme.spacing.md },
  groupeElement: { gap: theme.spacing.sm },
  titreElement: {
    fontFamily: theme.fontManuscrit,
    fontSize: 21,
    color: theme.colors.accent,
    marginTop: theme.spacing.xs,
  },
  ingredient: { fontFamily: theme.fontBody, color: theme.colors.text, fontSize: 17, lineHeight: 24 },
  blocEtape: { flexDirection: 'row', gap: theme.spacing.sm },
  numeroEtape: { fontFamily: theme.fontBodyBold, color: theme.colors.accent, width: 24, fontSize: 16 },
  contenuEtape: { flex: 1, gap: theme.spacing.xs },
  texteEtape: { fontFamily: theme.fontBody, color: theme.colors.text, fontSize: 17, lineHeight: 24 },
  boutonRecetteLiee: {
    alignSelf: 'flex-start',
    backgroundColor: theme.colors.selection,
    borderColor: theme.colors.accent,
    borderWidth: 1,
    borderRadius: theme.radii.sm,
    paddingVertical: 4,
    paddingHorizontal: theme.spacing.sm,
  },
  boutonRecetteLieeTexte: { fontFamily: theme.fontBodyBold, color: theme.colors.accent, fontSize: 13 },
  notes: { fontFamily: theme.fontBody, color: theme.colors.textMuted, fontStyle: 'italic' },
  lienOrigine: {
    fontFamily: theme.fontBody,
    color: theme.colors.accent,
    fontSize: 13,
    marginTop: theme.spacing.sm,
  },
}));
