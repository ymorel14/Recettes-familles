import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable, Image } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { theme, creerStylesThemes } from '../theme/theme';
import { useAuth } from '../contexts/AuthContext';
import { alerte } from '../utils/alerte';
import { listerPersonnesParIds, type Personne } from '../services/personnes';
import {
  chercherRecettes,
  enregistrerPlat,
  ETAPES_REPAS,
  supprimerPlat,
  type EtapeRepas,
  type Plat,
  type RecetteResume,
} from '../services/repas';
import { mesPersonnes, messageErreurVoyage, obtenirVoyage } from '../services/voyage';
import { Aide, CaseACocher, Champ, Erreur, Libelle, Puces } from '../components/formulaire';
import { Bouton } from '../components/ui';

// Ajouter ou modifier un plat (ou une boisson) : étape, nom, quantité,
// recette de l'app Cuisine, et qui le prépare ou l'apporte.
export default function PlatFormScreen({ route, navigation }: any) {
  const voyageId: string = route.params?.voyageId;
  const repasId: string = route.params?.repasId;
  const existant: Plat | undefined = route.params?.plat;
  const { session, foyer } = useAuth();
  const moiId = session?.user.id ?? '';

  const [etape, setEtape] = useState<EtapeRepas>(existant?.etape ?? route.params?.etape ?? 'plat');
  const [titre, setTitre] = useState(existant?.titre ?? '');
  const [quantite, setQuantite] = useState(existant?.quantite ?? '');
  const [notes, setNotes] = useState(existant?.notes ?? '');
  const [recette, setRecette] = useState<RecetteResume | null>(existant?.recette ?? null);
  const [recherche, setRecherche] = useState('');
  const [resultats, setResultats] = useState<RecetteResume[] | null>(null);
  const [personnes, setPersonnes] = useState<Personne[]>([]);
  const avant = useMemo(() => existant?.responsables.map((x) => x.personne_id) ?? [], [existant]);
  const [responsables, setResponsables] = useState<Set<string>>(new Set(avant));
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    navigation.setOptions({ title: existant ? 'Modifier' : etape === 'boissons' ? 'Ajouter une boisson' : 'Ajouter un plat' });
    obtenirVoyage(voyageId)
      .then(async (v) => {
        const liste = await listerPersonnesParIds(v.participants.filter((p) => p.reponse !== 'decline').map((p) => p.personne_id));
        setPersonnes(liste);
        // Nouveau plat : proposé par moi, préparé par moi (modifiable).
        if (!existant) {
          const moi = mesPersonnes(liste, moiId, foyer?.id ?? null).find((p) => p.utilisateur_id === moiId);
          if (moi) setResponsables(new Set([moi.id]));
        }
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voyageId]);

  // Recherche dans les recettes de la famille (app Cuisine).
  useEffect(() => {
    let actif = true;
    const minuterie = setTimeout(() => {
      chercherRecettes(recherche)
        .then((r) => actif && setResultats(r))
        .catch(() => actif && setResultats([]));
    }, 250);
    return () => {
      actif = false;
      clearTimeout(minuterie);
    };
  }, [recherche]);

  const choisirRecette = (r: RecetteResume) => {
    setRecette(r);
    if (!titre.trim()) setTitre(r.titre);
    setRecherche('');
  };

  const valider = async () => {
    setErreur(null);
    if (!titre.trim()) return setErreur('Donnez un nom (ex. « Bûche au chocolat »).');
    setEnCours(true);
    try {
      await enregistrerPlat(
        {
          repas_id: repasId,
          etape,
          titre: titre.trim(),
          recette_id: recette?.id ?? null,
          quantite: quantite.trim() || null,
          notes: notes.trim() || null,
        },
        [...responsables],
        existant?.id,
        avant
      );
      navigation.goBack();
    } catch (e) {
      setErreur(messageErreurVoyage(e));
      setEnCours(false);
    }
  };

  const supprimer = () =>
    alerte(`Retirer « ${existant!.titre} » du menu ?`, undefined, [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Retirer',
        style: 'destructive',
        onPress: async () => {
          try {
            await supprimerPlat(existant!.id);
            navigation.goBack();
          } catch (e) {
            setErreur(messageErreurVoyage(e));
          }
        },
      },
    ]);

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.contenu} keyboardShouldPersistTaps="handled">
      <Libelle>Étape</Libelle>
      <Puces options={ETAPES_REPAS} valeur={etape} onChange={setEtape} />

      <Libelle>Recette de la famille (facultatif)</Libelle>
      {recette ? (
        <View style={styles.recetteChoisie}>
          {recette.photo_url ? <Image source={{ uri: recette.photo_url }} style={styles.vignette} /> : (
            <Ionicons name="book-outline" size={22} color={theme.colors.accent} />
          )}
          <Text style={styles.recetteTitre}>{recette.titre}</Text>
          <Pressable onPress={() => setRecette(null)} accessibilityRole="button" accessibilityLabel="Retirer la recette" hitSlop={8}>
            <Ionicons name="close-circle-outline" size={22} color={theme.colors.textMuted} />
          </Pressable>
        </View>
      ) : (
        <>
          <Champ
            value={recherche}
            onChangeText={setRecherche}
            placeholder="Chercher dans Recettes familiales…"
            accessibilityLabel="Chercher une recette"
          />
          {resultats && resultats.length > 0 && (
            <View style={styles.resultats}>
              {resultats.slice(0, 6).map((r) => (
                <Pressable key={r.id} style={styles.resultat} onPress={() => choisirRecette(r)} accessibilityRole="button">
                  <Ionicons name="book-outline" size={16} color={theme.colors.accent} />
                  <Text style={styles.resultatTexte}>{r.titre}</Text>
                </Pressable>
              ))}
            </View>
          )}
          {resultats && resultats.length === 0 && recherche.trim() !== '' && <Aide>Aucune recette trouvée.</Aide>}
        </>
      )}

      <Libelle nativeID="libelle-titre-plat">Nom</Libelle>
      <Champ
        value={titre}
        onChangeText={setTitre}
        placeholder={etape === 'boissons' ? 'Ex. Champagne, jus de pomme…' : 'Ex. Bûche au chocolat'}
        accessibilityLabelledBy="libelle-titre-plat"
      />

      <Libelle nativeID="libelle-quantite">Quantité (facultatif)</Libelle>
      <Champ value={quantite} onChangeText={setQuantite} placeholder="Ex. 2 bûches, 6 bouteilles, pour 12" accessibilityLabelledBy="libelle-quantite" />

      <Libelle>Qui le prépare ou l’apporte ?</Libelle>
      {personnes.map((p) => (
        <CaseACocher
          key={p.id}
          coche={responsables.has(p.id)}
          onChange={(c) =>
            setResponsables((s) => {
              const n = new Set(s);
              if (c) n.add(p.id);
              else n.delete(p.id);
              return n;
            })
          }
          libelle={p.prenom}
          aide={p.foyer_nom ?? undefined}
        />
      ))}

      <Libelle nativeID="libelle-notes-plat">Notes (facultatif)</Libelle>
      <Champ value={notes} onChangeText={setNotes} multiline placeholder="Ex. sans noix pour Léo" accessibilityLabelledBy="libelle-notes-plat" />

      <Erreur texte={erreur} />
      <Bouton titre="Enregistrer" onPress={valider} enCours={enCours} style={styles.bouton} />
      {existant && <Bouton titre="Retirer du menu" variante="discret" onPress={supprimer} />}
    </ScrollView>
  );
}

const styles = creerStylesThemes(() => ({
  flex: { flex: 1, backgroundColor: theme.colors.background },
  contenu: { padding: theme.spacing.md, gap: theme.spacing.sm, paddingBottom: theme.spacing.xl },
  bouton: { marginTop: theme.spacing.md },
  recetteChoisie: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    padding: theme.spacing.sm,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    borderColor: theme.colors.accent,
    backgroundColor: theme.colors.surface,
  },
  vignette: { width: 40, height: 40, borderRadius: 6 },
  recetteTitre: { flex: 1, fontFamily: theme.fontBodyBold, fontSize: 15, color: theme.colors.text },
  resultats: {
    borderRadius: theme.radii.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  resultat: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 40, paddingHorizontal: theme.spacing.sm },
  resultatTexte: { fontFamily: theme.fontBody, fontSize: 15, color: theme.colors.text },
}));
