import React, { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { PanneauPhotos } from './PanneauPhotos';
import { Bouton } from './ui';
import { ChargementAssistant, Etincelle, MessageAssistant } from './assistant';
import { useAppelAssistant } from './useAppelAssistant';
import { photosPourAssistant, type PhotoChoisie } from '../services/photosAssistant';
import { recetteLueVersFormulaire, type RecetteLue, type VerificationRecette } from '../services/recetteAssistant';
import type { RecetteFormulaire } from '../modules/recettes/services/recettes';
import { couleurs, couleursModule, creerStyles, espaces, margePage, polices } from '../theme/theme';

// Début de « Scanner une photo » (Recettes) : l'assistant lit la recette sur
// 1 à 3 photos et ouvre la fiche pré-remplie (spécification § 4.1.1). Le
// tracé des zones à la main reste possible (« Entourer les zones moi-même »).
export function LecturePhotoRecette({
  photosInitiales,
  onBrouillon,
  onALaMain,
}: {
  photosInitiales?: PhotoChoisie[];
  onBrouillon: (formulaire: RecetteFormulaire, verification: VerificationRecette) => void;
  onALaMain: (photo: PhotoChoisie | null) => void;
}) {
  const [photos, setPhotos] = useState<PhotoChoisie[]>(photosInitiales ?? []);
  const { lecture, message, lancer, annuler } = useAppelAssistant();
  const c = couleursModule('recettes');
  const dejaLancee = useRef(false);

  const lire = async (liste = photos) => {
    if (!liste.length) return;
    const r = await lancer<RecetteLue>('recette-photo', async () => ({ fichiers: await photosPourAssistant(liste) }));
    if (!r) return;
    const { formulaire, verification } = recetteLueVersFormulaire(r, null);
    onBrouillon(formulaire, verification);
  };

  // Arrivée depuis le ⊕ avec une photo déjà prise : lecture immédiate.
  useEffect(() => {
    if (photosInitiales?.length && !dejaLancee.current) {
      dejaLancee.current = true;
      lire(photosInitiales);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.contenu} keyboardShouldPersistTaps="handled">
      <View style={styles.titreLigne}>
        <Etincelle couleur={c.encre} taille={18} />
        <Text style={styles.titre}>L’assistant lit la recette</Text>
      </View>
      <Text style={styles.aide}>
        Photographiez la page du livre ou la fiche (imprimée ou manuscrite). Recette sur deux pages : ajoutez-les dans
        l’ordre, 3 au plus. Vous vérifiez tout avant d’enregistrer.
      </Text>

      {lecture ? (
        <ChargementAssistant
          couleur={c.encre}
          etapes={['Je lis la page…', 'Je range les ingrédients…', 'J’écris les étapes…', 'Presque fini…']}
          onAnnuler={annuler}
        />
      ) : (
        <>
          <PanneauPhotos photos={photos} onChange={setPhotos} max={3} module="recettes" />
          {message ? (
            <MessageAssistant
              message={message.texte}
              pause={message.pause}
              onReessayer={!message.pause && photos.length ? () => lire() : undefined}
              onRemplirALaMain={() => onALaMain(photos[0] ?? null)}
            />
          ) : null}
          {photos.length ? (
            <Bouton
              titre={photos.length > 1 ? `✦ Lire les ${photos.length} pages` : '✦ Lire la recette'}
              module="recettes"
              onPress={() => lire()}
            />
          ) : null}
        </>
      )}

      <Pressable onPress={() => onALaMain(photos[0] ?? null)} accessibilityRole="button" style={styles.lienZone}>
        <Text style={styles.lien}>Entourer les zones moi-même</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = creerStyles(() => ({
  page: { flex: 1, backgroundColor: couleurs.fond },
  contenu: { padding: margePage, gap: espaces.l, paddingBottom: 40 },
  titreLigne: { flexDirection: 'row', alignItems: 'center', gap: espaces.s },
  titre: { fontFamily: polices.titre, fontSize: 24, color: couleurs.encre },
  aide: { fontFamily: polices.texte, fontSize: 15, lineHeight: 22, color: couleurs.encreDouce },
  lienZone: { alignSelf: 'center', paddingVertical: espaces.s },
  lien: { fontFamily: polices.texteDemiGras, fontSize: 14, color: couleurs.encreDouce, textDecorationLine: 'underline' },
}));
