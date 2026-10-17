import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { theme, creerStylesThemes } from '../theme/theme';
import { useAuth } from '../contexts/AuthContext';
import { Bouton, Chargement } from '../components/ui';
import { GrandePhoto } from '../components/Photo';
import { alerte } from '../utils/alerte';
import { formaterDateCourte } from '../utils/dates';
import { RAYONS_DEPART, type Rayon } from '../services/rayons';
import { cleProduit } from '../utils/texte';
import { choisirPhoto, definirPhotoProduit, supprimerPhoto } from '../services/photos';
import {
  ajouterArticle,
  listerArticles,
  listerListes,
  listerProduits,
  listerRayons,
  modifierProduit,
  obtenirProduit,
  renommerProduit,
  supprimerProduit,
  type ListeResume,
  type ProduitGere,
} from '../services/courses';

// Fiche produit, ouverte depuis l'onglet « Habituels » : ce que le foyer
// retient d'un produit, indépendamment des listes — photo, rayon, épingle,
// proposé ou non, nombre d'achats. Renommer reporte le nouveau nom sur
// l'historique et les articles des listes du foyer ; si un produit porte
// déjà ce nom, les deux sont fusionnés.
export default function ProduitScreen({ route, navigation }: any) {
  const { cle } = route.params as { cle: string };
  const { foyer } = useAuth();
  const [produit, setProduit] = useState<ProduitGere | null | undefined>(undefined);
  const [rayons, setRayons] = useState<Rayon[]>(RAYONS_DEPART);
  const [listes, setListes] = useState<ListeResume[]>([]);
  const [enCours, setEnCours] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [nom, setNom] = useState<string | null>(null); // null : pas en train de renommer

  const charger = useCallback(async () => {
    if (!foyer) return;
    try {
      const [p, l, r] = await Promise.all([
        obtenirProduit(foyer.id, cle),
        listerListes(),
        listerRayons().catch(() => RAYONS_DEPART),
      ]);
      setProduit(p);
      setListes(l.filter((x) => x.foyer_id === foyer.id));
      if (r.length > 0) setRayons(r);
    } catch {
      setMessage('Chargement impossible. Vérifiez votre connexion.');
      setProduit((p) => (p === undefined ? null : p));
    }
  }, [foyer, cle]);

  useFocusEffect(
    useCallback(() => {
      charger();
    }, [charger])
  );

  useEffect(() => {
    if (produit) navigation.setOptions({ title: produit.libelle });
  }, [produit, navigation]);

  if (produit === undefined) return <Chargement />;
  if (!produit || !foyer) {
    return (
      <View style={styles.centre}>
        <Text style={styles.aide}>{message ?? 'Ce produit n’existe plus.'}</Text>
        <Bouton titre="Retour aux habituels" onPress={() => navigation.goBack()} />
      </View>
    );
  }

  const changer = async (champs: Partial<Pick<ProduitGere, 'epingle' | 'masque' | 'rayon_id'>>) => {
    const avant = produit;
    setProduit({ ...produit, ...champs });
    setMessage(null);
    try {
      await modifierProduit(foyer.id, produit.cle, champs);
    } catch {
      setProduit(avant);
      setMessage('Modification non enregistrée.');
    }
  };

  const changerPhoto = async (source: 'camera' | 'galerie' | null) => {
    setMessage(null);
    try {
      const uri = source ? await choisirPhoto(source) : null;
      if (source && !uri) return;
      setEnCours('photo');
      const chemin = await definirPhotoProduit(foyer.id, produit.libelle, uri);
      setProduit({ ...produit, photo: chemin });
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Photo non enregistrée.');
    } finally {
      setEnCours(null);
    }
  };

  const ajouterALaListe = async (liste: ListeResume) => {
    setMessage(null);
    setEnCours(liste.id);
    try {
      const [actuels, connus] = await Promise.all([listerArticles(liste.id), listerProduits(foyer.id)]);
      const { fusionne } = await ajouterArticle(liste.id, { libelle: produit.libelle, quantite: null, unite: null }, connus, actuels);
      setMessage(fusionne ? `Déjà sur « ${liste.nom} ».` : `Ajouté à « ${liste.nom} ».`);
    } catch {
      setMessage('Ajout à la liste impossible.');
    } finally {
      setEnCours(null);
    }
  };

  const renommer = async () => {
    const nouveau = (nom ?? '').trim();
    if (!nouveau || nouveau === produit.libelle) {
      setNom(null);
      return;
    }
    const nouvelleCle = cleProduit(nouveau);
    if (!nouvelleCle) return;
    const executer = async (libelleFinal: string) => {
      setEnCours('nom');
      setMessage(null);
      try {
        const { cle: c, photoInutile } = await renommerProduit(foyer.id, produit.cle, libelleFinal);
        await supprimerPhoto(photoInutile).catch(() => {});
        setNom(null);
        if (c !== produit.cle) navigation.setParams({ cle: c });
        else await charger();
        setMessage('Renommé.');
      } catch {
        setMessage('Renommage impossible. Vérifiez votre connexion.');
      } finally {
        setEnCours(null);
      }
    };
    if (nouvelleCle === produit.cle) return executer(nouveau);
    const existant = await obtenirProduit(foyer.id, nouvelleCle).catch(() => null);
    if (existant) {
      alerte(
        `« ${existant.libelle} » existe déjà`,
        `Fusionner « ${produit.libelle} » avec « ${existant.libelle} » ? Les achats sont additionnés ; l’épingle, le rayon et la photo sont gardés. Les articles des listes prennent le nom « ${existant.libelle} ».`,
        [
          { text: 'Annuler', style: 'cancel' },
          { text: 'Fusionner', onPress: () => executer(existant.libelle) },
        ]
      );
    } else {
      executer(nouveau);
    }
  };

  const oublier = () =>
    alerte(
      `Oublier « ${produit.libelle} » ?`,
      'Le foyer oublie son rayon, son nombre d’achats et sa photo. Les articles déjà sur une liste restent.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Oublier',
          style: 'destructive',
          onPress: async () => {
            try {
              const photo = await supprimerProduit(foyer.id, produit.cle);
              await supprimerPhoto(photo);
              navigation.goBack();
            } catch {
              setMessage('Impossible d’oublier ce produit.');
            }
          },
        },
      ]
    );

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.contenu}>
      <View style={styles.section}>
        {nom === null ? (
          <Pressable
            onPress={() => setNom(produit.libelle)}
            style={styles.ligneNom}
            accessibilityRole="button"
            accessibilityLabel={`Renommer ${produit.libelle}`}
          >
            <Text style={styles.nom}>{produit.libelle}</Text>
            <Ionicons name="create-outline" size={20} color={theme.colors.accent} />
          </Pressable>
        ) : (
          <View style={styles.renommage}>
            <TextInput
              style={styles.champ}
              value={nom}
              onChangeText={setNom}
              onSubmitEditing={renommer}
              autoFocus
              accessibilityLabel="Nouveau nom du produit"
            />
            <View style={styles.puces}>
              <Bouton titre="Renommer" onPress={renommer} enCours={enCours === 'nom'} />
              <Bouton variante="discret" titre="Annuler" onPress={() => setNom(null)} />
            </View>
            <Text style={styles.aide}>Le nouveau nom remplace l’ancien partout : historique, habituels et articles des listes du foyer.</Text>
          </View>
        )}
        <Text style={styles.aide}>
          {produit.nb_achats > 0
            ? `Acheté ${produit.nb_achats} fois${produit.dernier_achat ? `, la dernière ${formaterDateCourte(produit.dernier_achat)}` : ''}.`
            : 'Jamais encore acheté.'}
        </Text>
        {message && <Text style={styles.message}>{message}</Text>}
      </View>

      <View style={styles.section}>
        <Text style={styles.titreSection}>Ajouter à une liste</Text>
        {listes.length === 0 ? (
          <Text style={styles.aide}>Aucune liste du foyer pour l’instant.</Text>
        ) : (
          <View style={styles.puces}>
            {listes.map((l) => (
              <Pressable
                key={l.id}
                onPress={() => ajouterALaListe(l)}
                disabled={enCours === l.id}
                style={({ pressed }) => [styles.puce, pressed && styles.appuye]}
                accessibilityRole="button"
                accessibilityLabel={`Ajouter ${produit.libelle} à ${l.nom}`}
              >
                <Ionicons name={l.icone as any} size={15} color={theme.colors.accent} />
                <Text style={styles.puceTexte}>{l.nom}</Text>
              </Pressable>
            ))}
          </View>
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.titreSection}>Photo</Text>
        <GrandePhoto chemin={produit.photo} legende={produit.libelle} />
        <View style={styles.puces}>
          <Pressable onPress={() => changerPhoto('camera')} style={styles.puce} accessibilityRole="button" disabled={enCours === 'photo'}>
            <Ionicons name="camera-outline" size={16} color={theme.colors.accent} />
            <Text style={styles.puceTexte}>{produit.photo ? 'Reprendre une photo' : 'Prendre une photo'}</Text>
          </Pressable>
          <Pressable onPress={() => changerPhoto('galerie')} style={styles.puce} accessibilityRole="button" disabled={enCours === 'photo'}>
            <Ionicons name="images-outline" size={16} color={theme.colors.accent} />
            <Text style={styles.puceTexte}>Choisir une image</Text>
          </Pressable>
          {produit.photo && (
            <Pressable onPress={() => changerPhoto(null)} style={styles.puce} accessibilityRole="button" disabled={enCours === 'photo'}>
              <Ionicons name="trash-outline" size={16} color={theme.colors.textMuted} />
              <Text style={styles.puceTexte}>Retirer</Text>
            </Pressable>
          )}
        </View>
        <Text style={styles.aide}>
          {enCours === 'photo' ? 'Envoi de la photo…' : 'Elle s’affiche chaque fois que ce produit est sur une liste du foyer, jusqu’au magasin.'}
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.titreSection}>Rayon</Text>
        <View style={styles.puces}>
          {rayons.map((r) => {
            const actif = r.id === produit.rayon_id;
            return (
              <Pressable
                key={r.id}
                onPress={() => changer({ rayon_id: r.id })}
                style={[styles.puce, actif && styles.puceActive]}
                accessibilityRole="radio"
                accessibilityState={{ selected: actif }}
              >
                <Ionicons name={r.icone as any} size={15} color={actif ? theme.colors.background : theme.colors.accent} />
                <Text style={[styles.puceTexte, actif && styles.puceTexteActive]}>{r.nom}</Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={styles.aide}>Utilisé chaque fois que ce produit sera ajouté à une liste du foyer.</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.titreSection}>Habituels</Text>
        <Pressable
          onPress={() => changer({ epingle: !produit.epingle, masque: false })}
          style={styles.choix}
          accessibilityRole="switch"
          accessibilityState={{ checked: produit.epingle }}
        >
          <Ionicons name={produit.epingle ? 'pin' : 'pin-outline'} size={22} color={theme.colors.accent} />
          <View style={styles.textes}>
            <Text style={styles.choixTitre}>{produit.epingle ? 'Épinglé' : 'Épingler'}</Text>
            <Text style={styles.aide}>Toujours proposé, en tête du panneau « Habituels » des listes.</Text>
          </View>
        </Pressable>
        <Pressable
          onPress={() => changer(produit.masque ? { masque: false } : { masque: true, epingle: false })}
          style={styles.choix}
          accessibilityRole="switch"
          accessibilityState={{ checked: produit.masque }}
        >
          <Ionicons name={produit.masque ? 'eye-off' : 'eye-off-outline'} size={22} color={theme.colors.accent} />
          <View style={styles.textes}>
            <Text style={styles.choixTitre}>{produit.masque ? 'Plus proposé — toucher pour le proposer de nouveau' : 'Ne plus proposer'}</Text>
            <Text style={styles.aide}>Il n’apparaît plus dans le panneau « Habituels », même s’il est souvent acheté.</Text>
          </View>
        </Pressable>
      </View>

      <Bouton variante="discret" titre="Oublier ce produit" onPress={oublier} />
    </ScrollView>
  );
}

const styles = creerStylesThemes(() => ({
  flex: { flex: 1, backgroundColor: theme.colors.background },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: theme.spacing.md, padding: theme.spacing.lg, backgroundColor: theme.colors.background },
  contenu: { padding: theme.spacing.md, gap: theme.spacing.md, paddingBottom: theme.spacing.xl },
  section: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radii.lg,
    padding: theme.spacing.md,
    gap: theme.spacing.xs,
  },
  nom: { fontFamily: theme.fontTitle, fontSize: 22, color: theme.colors.text, flexShrink: 1 },
  ligneNom: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, minHeight: 44 },
  renommage: { gap: theme.spacing.sm },
  champ: {
    minHeight: 46,
    backgroundColor: theme.colors.background,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radii.md,
    paddingHorizontal: theme.spacing.sm,
    color: theme.colors.text,
    fontFamily: theme.fontBody,
    fontSize: 18,
  },
  titreSection: { fontFamily: theme.fontBodyBold, fontSize: 16, color: theme.colors.text, marginBottom: 4 },
  message: { fontFamily: theme.fontBodyBold, fontSize: 14, color: theme.colors.accent },
  aide: { fontFamily: theme.fontBody, fontSize: 13, color: theme.colors.textMuted, flexShrink: 1 },
  puces: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  puce: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minHeight: 36,
    paddingHorizontal: theme.spacing.sm,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.background,
  },
  puceActive: { backgroundColor: theme.colors.accent, borderColor: theme.colors.accent },
  puceTexte: { fontFamily: theme.fontBody, fontSize: 14, color: theme.colors.text },
  puceTexteActive: { color: theme.colors.background, fontFamily: theme.fontBodyBold },
  appuye: { opacity: 0.6 },
  choix: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, minHeight: 52, paddingVertical: 4 },
  textes: { flex: 1, gap: 2 },
  choixTitre: { fontFamily: theme.fontBodyBold, fontSize: 15, color: theme.colors.text },
}));
