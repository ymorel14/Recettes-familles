import React, { useState } from 'react';
import { Image, Pressable, ScrollView, Text, View } from 'react-native';
import { Bouton, Icone } from './ui';
import { choisirPhotos, ErreurPhoto, type PhotoChoisie } from '../services/photosAssistant';
import { arrondis, couleurs, couleursModule, creerStyles, espaces, polices, type IdModule } from '../theme/theme';

// Choix des photos à confier à l'assistant : appareil photo ou galerie,
// vignettes avec ✕, « + Page suivante » jusqu'à `max`. Facultatif : un PDF.
export function PanneauPhotos({
  photos,
  onChange,
  max = 1,
  module,
  onPdf,
  nomPdf,
  libelleAjout = '+ Page suivante',
}: {
  photos: PhotoChoisie[];
  onChange: (p: PhotoChoisie[]) => void;
  max?: number;
  module: IdModule;
  onPdf?: () => void;
  nomPdf?: string | null;
  libelleAjout?: string;
}) {
  const [erreur, setErreur] = useState<string | null>(null);
  const c = couleursModule(module);

  const ajouter = async (source: 'camera' | 'galerie') => {
    setErreur(null);
    try {
      const nouvelles = await choisirPhotos(source, max - photos.length);
      if (nouvelles.length) onChange([...photos, ...nouvelles].slice(0, max));
    } catch (e) {
      setErreur(e instanceof ErreurPhoto ? e.message : 'Impossible d’ouvrir les photos.');
    }
  };

  return (
    <View style={{ gap: espaces.m }}>
      {photos.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rangee}>
          {photos.map((p, i) => (
            <View key={`${p.uri}-${i}`} style={styles.vignette}>
              <Image source={{ uri: p.uri }} style={styles.image} accessibilityLabel={`Photo ${i + 1}`} />
              <Pressable
                onPress={() => onChange(photos.filter((_, j) => j !== i))}
                hitSlop={8}
                style={styles.retirer}
                accessibilityRole="button"
                accessibilityLabel={`Retirer la photo ${i + 1}`}
              >
                <Icone nom="close" taille={16} couleur="#FFFFFF" />
              </Pressable>
              {photos.length > 1 ? <Text style={styles.numero}>{i + 1}</Text> : null}
            </View>
          ))}
          {photos.length < max ? (
            <Pressable
              onPress={() => ajouter('camera')}
              onLongPress={() => ajouter('galerie')}
              style={[styles.ajout, { backgroundColor: c.fond }]}
              accessibilityRole="button"
              accessibilityLabel={libelleAjout}
            >
              <Icone nom="camera-outline" taille={24} couleur={c.encre} />
              <Text style={[styles.ajoutTexte, { color: c.encre }]}>{libelleAjout.replace(/^\+\s*/, '')}</Text>
            </Pressable>
          ) : null}
        </ScrollView>
      ) : nomPdf ? (
        <View style={[styles.pdf, { backgroundColor: c.fond }]}>
          <Icone nom="document-text-outline" taille={22} couleur={c.encre} />
          <Text style={[styles.pdfTexte, { color: c.encre }]} numberOfLines={1}>
            {nomPdf}
          </Text>
        </View>
      ) : (
        <View style={{ gap: espaces.s }}>
          <Bouton titre="Prendre une photo" icone="camera-outline" module={module} onPress={() => ajouter('camera')} />
          <Bouton titre="Choisir dans la galerie" icone="images-outline" variante="secondaire" onPress={() => ajouter('galerie')} />
          {onPdf ? <Bouton titre="Choisir un PDF" icone="document-text-outline" variante="secondaire" onPress={onPdf} /> : null}
        </View>
      )}
      {photos.length > 0 && photos.length < max ? (
        <Pressable onPress={() => ajouter('galerie')} accessibilityRole="button">
          <Text style={styles.lien}>Ajouter depuis la galerie</Text>
        </Pressable>
      ) : null}
      {erreur ? <Text style={styles.erreur}>{erreur}</Text> : null}
    </View>
  );
}

const styles = creerStyles(() => ({
  rangee: { gap: espaces.s, paddingVertical: 2 },
  vignette: { width: 104, height: 136, borderRadius: arrondis.petit, overflow: 'hidden', backgroundColor: couleurs.segment },
  image: { width: '100%', height: '100%' },
  retirer: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  numero: {
    position: 'absolute',
    left: 6,
    bottom: 6,
    minWidth: 22,
    textAlign: 'center',
    paddingHorizontal: 6,
    borderRadius: 11,
    overflow: 'hidden',
    backgroundColor: 'rgba(0,0,0,0.55)',
    color: '#FFFFFF',
    fontFamily: polices.texteGras,
    fontSize: 12,
  },
  ajout: { width: 104, height: 136, borderRadius: arrondis.petit, alignItems: 'center', justifyContent: 'center', gap: 6, padding: 8 },
  ajoutTexte: { fontFamily: polices.texteGras, fontSize: 13, textAlign: 'center' },
  pdf: { flexDirection: 'row', alignItems: 'center', gap: espaces.s, padding: espaces.l, borderRadius: arrondis.champ },
  pdfTexte: { flex: 1, fontFamily: polices.texteDemiGras, fontSize: 15 },
  lien: { fontFamily: polices.texteDemiGras, fontSize: 14, color: couleurs.encreDouce, textDecorationLine: 'underline' },
  erreur: { fontFamily: polices.texteDemiGras, fontSize: 13, color: couleurs.attention },
}));
