import React, { useEffect, useLayoutEffect, useState } from 'react';
import { View, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { theme, creerStylesThemes } from '../theme/theme';
import { useAuth } from '../contexts/AuthContext';
import { extraireMessageErreur } from '@apps-famille/famille';
import {
  creerAlbum,
  modifierAlbum,
  obtenirAlbum,
  supprimerAlbum,
  VISIBILITES_ALBUM,
  type FormulaireAlbum,
} from '../services/souvenirs';
import { Aide, CarteChoix, Champ, Erreur, Libelle, Puces } from '../components/formulaire';
import { Bouton, Chargement } from '../components/ui';
import { alerte } from '../utils/alerte';

const IDEES = ['Mes motos', "Les enfants que j'ai gardés", 'Nos Noëls', 'Nos maisons', 'Nos animaux'];

// Créer ou modifier un album. Paramètre facultatif : id (modification).
export default function AlbumFormScreen({ route, navigation }: any) {
  const id: string | undefined = route.params?.id;
  const { session, famille } = useAuth();
  const [form, setForm] = useState<FormulaireAlbum>({ titre: '', description: '', visibilite: 'famille' });
  const [auteur, setAuteur] = useState<string | null>(null);
  const [chargement, setChargement] = useState(!!id);
  const [enCours, setEnCours] = useState<'enregistrer' | 'supprimer' | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  useLayoutEffect(() => {
    navigation.setOptions({ title: id ? "Modifier l'album" : 'Nouvel album' });
  }, [navigation, id]);

  useEffect(() => {
    if (!id) return;
    obtenirAlbum(id)
      .then((r) => {
        if (!r) return setErreur('Album introuvable.');
        setForm({ titre: r.album.titre, description: r.album.description ?? '', visibilite: r.album.visibilite });
        setAuteur(r.album.cree_par);
      })
      .catch((e) => setErreur(extraireMessageErreur(e, "Impossible de charger l'album.")))
      .finally(() => setChargement(false));
  }, [id]);

  const enregistrer = async () => {
    if (!session || !famille) return;
    if (!form.titre.trim()) return setErreur("Donnez un titre à l'album.");
    setErreur(null);
    setEnCours('enregistrer');
    try {
      if (id) {
        await modifierAlbum(id, form);
        navigation.goBack();
      } else {
        const nouveau = await creerAlbum(famille.id, session.user.id, form);
        navigation.replace('Album', { id: nouveau });
      }
    } catch (e) {
      setErreur(extraireMessageErreur(e, 'Enregistrement impossible.'));
    } finally {
      setEnCours(null);
    }
  };

  const supprimer = () =>
    alerte('Supprimer cet album ?', 'Les souvenirs qu’il contient sont conservés.', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: async () => {
          setEnCours('supprimer');
          try {
            await supprimerAlbum(id!);
            navigation.popToTop();
          } catch (e) {
            setErreur(extraireMessageErreur(e, 'Suppression impossible.'));
            setEnCours(null);
          }
        },
      },
    ]);

  if (chargement) return <Chargement />;

  // Rendre privé : réservé à l'auteur (règle de la base).
  const visibilites = VISIBILITES_ALBUM.filter(
    (v) => v.id !== 'prive' || !id || auteur === session?.user.id || form.visibilite === 'prive'
  );

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
      <ScrollView contentContainerStyle={styles.contenu} keyboardShouldPersistTaps="handled">
        <Libelle>Titre</Libelle>
        <Champ
          value={form.titre}
          onChangeText={(t) => setForm((f) => ({ ...f, titre: t }))}
          placeholder="Ex. Mes motos"
          accessibilityLabel="Titre de l'album"
        />
        {!id && !form.titre && (
          <Puces
            options={IDEES.map((i) => ({ id: i, libelle: i }))}
            valeur={null}
            onChange={(t) => setForm((f) => ({ ...f, titre: t }))}
          />
        )}

        <Libelle>Description</Libelle>
        <Champ
          value={form.description}
          onChangeText={(t) => setForm((f) => ({ ...f, description: t }))}
          placeholder="Quelques mots pour présenter l'album (facultatif)"
          multiline
          accessibilityLabel="Description"
        />

        <Libelle>Qui peut le voir ?</Libelle>
        <Aide>
          Chacun ne voit dans l'album que les souvenirs qu'il a le droit de voir : un souvenir privé reste privé.
        </Aide>
        <View style={styles.choix}>
          {visibilites.map((v) => (
            <CarteChoix
              key={v.id}
              actif={form.visibilite === v.id}
              onPress={() => setForm((f) => ({ ...f, visibilite: v.id }))}
              titre={v.titre}
              aide={v.aide}
            />
          ))}
        </View>

        <Erreur texte={erreur} />
        <Bouton titre={id ? 'Enregistrer' : "Créer l'album"} onPress={enregistrer} enCours={enCours === 'enregistrer'} />
        {id && <Bouton variante="discret" titre="Supprimer cet album" onPress={supprimer} enCours={enCours === 'supprimer'} />}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = creerStylesThemes(() => ({
  flex: { flex: 1, backgroundColor: theme.colors.background },
  contenu: { padding: theme.spacing.md, gap: theme.spacing.sm, paddingBottom: theme.spacing.xl * 2 },
  choix: { gap: theme.spacing.xs },
}));
