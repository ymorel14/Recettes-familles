import React, { useEffect, useRef, useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  Pressable,
  PanResponder,
  ActivityIndicator,
} from 'react-native';
import { Image as ImageExpo } from 'expo-image';
import * as ImageManipulator from 'expo-image-manipulator';
import { theme, creerStylesThemes, useLargeurContenu, LARGEUR_MAX_WEB } from '../theme/theme';

type Rectangle = { x: number; y: number; largeur: number; hauteur: number };
type TailleImage = { width: number; height: number };

type Props = {
  // uri de la photo à recadrer (locale ou distante) ; null = modale fermée.
  uri: string | null;
  onAnnuler: () => void;
  onValider: (uriRecadree: string) => void;
  // Textes de la fenêtre (par défaut : recadrage d'une photo de recette).
  titre?: string;
  aide?: string;
  libelleValider?: string;
};

// Modale de recadrage d'une photo avant son insertion dans une recette
// (retour utilisateur : pouvoir recadrer chaque photo). Même principe que le
// tracé de zones de ScanRecetteScreen : l'utilisateur dessine du doigt un
// rectangle sur l'image affichée, converti en pixels réels via un facteur
// d'échelle puis recadré avec expo-image-manipulator. Sans tracé, "Valider"
// conserve la photo entière (le recadrage est donc facultatif).
export default function RecadragePhotoModal({
  uri,
  onAnnuler,
  onValider,
  titre = 'Recadrer la photo',
  aide = 'Dessinez du doigt un rectangle sur la zone à conserver, ou validez la photo entière.',
  libelleValider,
}: Props) {
  const { width: largeurFenetre, height: hauteurFenetre } = useLargeurContenu();
  const largeurMaxImage = largeurFenetre - 2 * theme.spacing.md - 2 * theme.spacing.md;
  const hauteurMaxImage = hauteurFenetre * 0.5;

  const [tailleImage, setTailleImage] = useState<TailleImage | null>(null);
  const [zone, setZone] = useState<Rectangle | null>(null);
  const [zoneEnCours, setZoneEnCours] = useState<Rectangle | null>(null);
  const [traitement, setTraitement] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  // La modale reste montée entre deux photos (file d'attente de recadrage
  // dans RecetteFormScreen) : sans ce reset, le tracé et la taille de la
  // photo précédente resteraient affichés sur la nouvelle.
  useEffect(() => {
    setTailleImage(null);
    setZone(null);
    setZoneEnCours(null);
    setErreur(null);
  }, [uri]);

  let largeurImage = largeurMaxImage;
  let hauteurImage = Math.min(largeurMaxImage, hauteurMaxImage);
  if (tailleImage && tailleImage.width > 0 && tailleImage.height > 0) {
    hauteurImage = (largeurMaxImage * tailleImage.height) / tailleImage.width;
    if (hauteurImage > hauteurMaxImage) {
      hauteurImage = hauteurMaxImage;
      largeurImage = (hauteurMaxImage * tailleImage.width) / tailleImage.height;
    }
  }
  const largeurImageRef = useRef(largeurImage);
  useEffect(() => {
    largeurImageRef.current = largeurImage;
  }, [largeurImage]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evenement) => {
        const { locationX, locationY } = evenement.nativeEvent;
        setZoneEnCours({ x: locationX, y: locationY, largeur: 0, hauteur: 0 });
      },
      // Taille d'après le déplacement depuis le point de départ (dx, dy) et
      // non d'après locationX/Y : dans un navigateur, ces derniers sont
      // mesurés par rapport à l'élément survolé (le rectangle lui-même),
      // ce qui donnait un tracé minuscule à la souris.
      onPanResponderMove: (_evenement, geste) => {
        setZoneEnCours((z) => (z ? { ...z, largeur: geste.dx, hauteur: geste.dy } : z));
      },
      onPanResponderRelease: () => {
        setZoneEnCours((z) => {
          if (z && Math.abs(z.largeur) > 12 && Math.abs(z.hauteur) > 12) {
            setZone({
              x: Math.max(0, Math.min(z.x, z.x + z.largeur)),
              y: Math.max(0, Math.min(z.y, z.y + z.hauteur)),
              largeur: Math.abs(z.largeur),
              hauteur: Math.abs(z.hauteur),
            });
          }
          return null;
        });
      },
    })
  ).current;

  if (!uri) return null;

  const valider = async () => {
    if (!tailleImage) return;
    setTraitement(true);
    setErreur(null);
    try {
      if (!zone) {
        onValider(uri);
        return;
      }
      const echelle = tailleImage.width / largeurImageRef.current;
      const originX = Math.max(0, Math.round(zone.x * echelle));
      const originY = Math.max(0, Math.round(zone.y * echelle));
      const width = Math.max(1, Math.min(Math.round(zone.largeur * echelle), tailleImage.width - originX));
      const height = Math.max(1, Math.min(Math.round(zone.hauteur * echelle), tailleImage.height - originY));

      const contexte = ImageManipulator.ImageManipulator.manipulate(uri);
      contexte.crop({ originX, originY, width, height });
      const image = await contexte.renderAsync();
      const resultat = await image.saveAsync({ format: ImageManipulator.SaveFormat.JPEG, compress: 0.85 });
      onValider(resultat.uri);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Impossible de recadrer cette photo.');
    } finally {
      setTraitement(false);
    }
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onAnnuler}>
      <View style={styles.fond}>
        <View style={styles.carte}>
          <Text style={styles.titre}>{titre}</Text>
          <Text style={styles.aide}>{aide}</Text>

          <View
            style={[styles.zoneImage, { width: largeurImage, height: hauteurImage }]}
            {...panResponder.panHandlers}
          >
            <ImageExpo
              source={{ uri }}
              style={{ width: largeurImage, height: hauteurImage }}
              contentFit="contain"
              onLoad={(evenement) => {
                const { width, height } = evenement.source;
                if (width && height) setTailleImage({ width, height });
              }}
              onError={() => setErreur('Impossible de charger cette photo.')}
            />
            {/* Calque transparent au-dessus de la photo : dans un navigateur,
                appuyer puis glisser sur l'image elle-même lance le
                glisser-déposer natif de l'image et interrompt le tracé. */}
            <View style={StyleSheet.absoluteFill} />
            {zone && (
              <>
                <View pointerEvents="none" style={[styles.voile, { top: 0, left: 0, right: 0, height: zone.y }]} />
                <View
                  pointerEvents="none"
                  style={[styles.voile, { top: zone.y + zone.hauteur, left: 0, right: 0, bottom: 0 }]}
                />
                <View
                  pointerEvents="none"
                  style={[styles.voile, { top: zone.y, left: 0, width: zone.x, height: zone.hauteur }]}
                />
                <View
                  pointerEvents="none"
                  style={[styles.voile, { top: zone.y, left: zone.x + zone.largeur, right: 0, height: zone.hauteur }]}
                />
                <View
                  pointerEvents="none"
                  style={[
                    styles.rectangleZone,
                    { left: zone.x, top: zone.y, width: zone.largeur, height: zone.hauteur },
                  ]}
                />
              </>
            )}
            {zoneEnCours && (
              <View
                pointerEvents="none"
                style={[
                  styles.rectangleTrace,
                  {
                    left: Math.min(zoneEnCours.x, zoneEnCours.x + zoneEnCours.largeur),
                    top: Math.min(zoneEnCours.y, zoneEnCours.y + zoneEnCours.hauteur),
                    width: Math.abs(zoneEnCours.largeur),
                    height: Math.abs(zoneEnCours.hauteur),
                  },
                ]}
              />
            )}
            {!tailleImage && (
              <View style={styles.voileChargementImage} pointerEvents="none">
                <ActivityIndicator color={theme.colors.accent} />
              </View>
            )}
          </View>

          {zone && (
            <Pressable onPress={() => setZone(null)}>
              <Text style={styles.lien}>Réinitialiser le recadrage</Text>
            </Pressable>
          )}

          {erreur && <Text style={styles.erreur}>{erreur}</Text>}

          <View style={styles.actions}>
            <Pressable style={styles.boutonSecondaire} onPress={onAnnuler} disabled={traitement}>
              <Text style={styles.boutonSecondaireTexte}>Annuler</Text>
            </Pressable>
            <Pressable style={styles.boutonPrincipal} onPress={valider} disabled={traitement || !tailleImage}>
              {traitement ? (
                <ActivityIndicator color={theme.colors.background} />
              ) : (
                <Text style={styles.boutonPrincipalTexte}>{libelleValider ?? 'Valider'}</Text>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = creerStylesThemes(() => ({
  fond: {
    flex: 1,
    backgroundColor: theme.colors.voileFort,
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing.md,
  },
  carte: {
    backgroundColor: theme.colors.background,
    borderRadius: theme.radii.md,
    borderColor: theme.colors.border,
    borderWidth: 1,
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
    width: '100%',
    // Navigateur : pas plus large que la colonne de l'application.
    maxWidth: LARGEUR_MAX_WEB,
    alignSelf: 'center',
  },
  titre: { fontFamily: theme.fontTitle, fontSize: 20, color: theme.colors.accent },
  aide: { fontFamily: theme.fontBody, color: theme.colors.textMuted, fontSize: 13 },
  zoneImage: {
    alignSelf: 'center',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.sm,
    overflow: 'hidden',
  },
  voile: { position: 'absolute', backgroundColor: 'rgba(0,0,0,0.55)' },
  voileChargementImage: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  rectangleZone: { position: 'absolute', borderWidth: 2, borderColor: theme.colors.accent },
  rectangleTrace: { position: 'absolute', borderWidth: 2, borderColor: theme.colors.accent, borderStyle: 'dashed' },
  lien: { fontFamily: theme.fontBody, color: theme.colors.accent, fontSize: 13, textAlign: 'center' },
  erreur: { fontFamily: theme.fontBody, color: theme.colors.warning, fontSize: 13 },
  actions: { flexDirection: 'row', gap: theme.spacing.sm, marginTop: theme.spacing.xs },
  boutonSecondaire: {
    flex: 1,
    borderColor: theme.colors.accent,
    borderWidth: 1,
    borderRadius: theme.radii.md,
    paddingVertical: theme.spacing.sm,
    alignItems: 'center',
  },
  boutonSecondaireTexte: { fontFamily: theme.fontBodyBold, color: theme.colors.accent },
  boutonPrincipal: {
    flex: 1,
    backgroundColor: theme.colors.accent,
    borderRadius: theme.radii.md,
    paddingVertical: theme.spacing.sm,
    alignItems: 'center',
  },
  boutonPrincipalTexte: { fontFamily: theme.fontBodyBold, color: theme.colors.background },
}));
