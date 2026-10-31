import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';
import { Avatar } from '@apps-famille/famille';
import { theme, creerStylesThemes } from '../theme/theme';
import { alerte } from '../utils/alerte';
import {
  ajouterCommentaire,
  CommentairesIndisponibles,
  listerCommentaires,
  modifierCommentaire,
  supprimerCommentaire,
  type Commentaire,
} from '../services/commentaires';

function quand(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}

// Section « Commentaires » en bas de la fiche recette (retour de test R-7) :
// liste chronologique (photo, prénom, date), champ et « Envoyer ». Chacun
// modifie ou supprime les siens. Rien n'est affiché tant que la migration
// 20261027120000_recettes_commentaires.sql n'est pas passée.
export default function Commentaires({
  recetteId,
  utilisateurId,
  autoFocus,
}: {
  recetteId: string;
  utilisateurId: string | undefined;
  autoFocus?: boolean;
}) {
  const [commentaires, setCommentaires] = useState<Commentaire[] | null>(null);
  const [disponible, setDisponible] = useState(true);
  const [texte, setTexte] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const [edition, setEdition] = useState<{ id: string; texte: string } | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  const charger = useCallback(() => {
    listerCommentaires(recetteId)
      .then(setCommentaires)
      .catch((e) => {
        if (e instanceof CommentairesIndisponibles) setDisponible(false);
        else setCommentaires([]);
      });
  }, [recetteId]);

  useEffect(charger, [charger]);

  if (!disponible) return null;

  const envoyer = async () => {
    if (!texte.trim()) return;
    setEnvoi(true);
    setErreur(null);
    try {
      await ajouterCommentaire(recetteId, texte);
      setTexte('');
      charger();
    } catch {
      setErreur('Commentaire non envoyé. Vérifiez votre connexion et réessayez.');
    } finally {
      setEnvoi(false);
    }
  };

  const enregistrerEdition = async () => {
    if (!edition || !edition.texte.trim()) return;
    try {
      await modifierCommentaire(edition.id, edition.texte);
      setEdition(null);
      charger();
    } catch {
      setErreur('Modification impossible. Réessayez.');
    }
  };

  const demanderSuppression = (c: Commentaire) =>
    alerte('Supprimer ce commentaire ?', '', [
      { text: 'Garder', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: () =>
          supprimerCommentaire(c.id)
            .then(charger)
            .catch(() => setErreur('Suppression impossible. Réessayez.')),
      },
    ]);

  return (
    <View style={styles.bloc}>
      <Text style={styles.section}>Commentaires</Text>
      {commentaires === null ? (
        <ActivityIndicator color={theme.colors.accent} />
      ) : commentaires.length === 0 ? (
        <Text style={styles.vide}>Pas encore de commentaire.</Text>
      ) : (
        commentaires.map((c) => {
          const mien = c.auteur_id === utilisateurId;
          const enEdition = edition?.id === c.id;
          return (
            <View key={c.id} style={styles.commentaire}>
              <View style={styles.entete}>
                <Avatar utilisateurId={c.auteur_id} prenom={c.auteurPrenom} taille={28} />
                <Text style={styles.auteur}>{c.auteurPrenom ?? 'Quelqu’un'}</Text>
                <Text style={styles.date}>{quand(c.cree_le)}</Text>
              </View>
              {enEdition ? (
                <>
                  <TextInput
                    style={styles.champ}
                    value={edition.texte}
                    onChangeText={(t) => setEdition({ id: c.id, texte: t })}
                    multiline
                    autoFocus
                  />
                  <View style={styles.actions}>
                    <Pressable onPress={() => setEdition(null)} hitSlop={6}>
                      <Text style={styles.lienDiscret}>Annuler</Text>
                    </Pressable>
                    <Pressable onPress={enregistrerEdition} hitSlop={6}>
                      <Text style={styles.lien}>Enregistrer</Text>
                    </Pressable>
                  </View>
                </>
              ) : (
                <>
                  <Text style={styles.texte}>{c.texte}</Text>
                  {mien ? (
                    <View style={styles.actions}>
                      <Pressable onPress={() => setEdition({ id: c.id, texte: c.texte })} hitSlop={6}>
                        <Text style={styles.lien}>Modifier</Text>
                      </Pressable>
                      <Pressable onPress={() => demanderSuppression(c)} hitSlop={6}>
                        <Text style={[styles.lien, styles.lienSupprimer]}>Supprimer</Text>
                      </Pressable>
                    </View>
                  ) : null}
                </>
              )}
            </View>
          );
        })
      )}
      <View style={styles.saisie}>
        <TextInput
          style={[styles.champ, { flex: 1 }]}
          value={texte}
          onChangeText={setTexte}
          placeholder="Votre commentaire…"
          placeholderTextColor={theme.colors.textMuted}
          multiline
          autoFocus={autoFocus}
          accessibilityLabel="Votre commentaire"
        />
        <Pressable
          style={[styles.envoyer, (!texte.trim() || envoi) && { opacity: 0.5 }]}
          onPress={envoyer}
          disabled={!texte.trim() || envoi}
          accessibilityRole="button"
        >
          {envoi ? <ActivityIndicator color={theme.colors.background} /> : <Text style={styles.envoyerTexte}>Envoyer</Text>}
        </Pressable>
      </View>
      {erreur ? <Text style={styles.erreur}>{erreur}</Text> : null}
    </View>
  );
}

const styles = creerStylesThemes(() => ({
  bloc: { gap: theme.spacing.sm },
  section: { fontFamily: theme.fontTitle, fontSize: 18, color: theme.colors.accent, marginTop: theme.spacing.md },
  vide: { fontFamily: theme.fontBody, fontStyle: 'italic', color: theme.colors.textMuted },
  commentaire: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radii.md,
    padding: theme.spacing.sm,
    gap: theme.spacing.xs,
  },
  entete: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs },
  auteur: { flex: 1, fontFamily: theme.fontBodyBold, fontSize: 15, color: theme.colors.text },
  date: { fontFamily: theme.fontBody, fontSize: 12, color: theme.colors.textMuted },
  texte: { fontFamily: theme.fontBody, fontSize: 15, lineHeight: 21, color: theme.colors.text },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: theme.spacing.md },
  lien: { fontFamily: theme.fontBodyBold, fontSize: 13, color: theme.colors.accent },
  lienDiscret: { fontFamily: theme.fontBodyBold, fontSize: 13, color: theme.colors.textMuted },
  lienSupprimer: { color: theme.colors.warning },
  saisie: { flexDirection: 'row', alignItems: 'flex-end', gap: theme.spacing.xs },
  champ: {
    minHeight: 44,
    maxHeight: 140,
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radii.md,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 10,
    fontFamily: theme.fontBody,
    fontSize: 15,
    color: theme.colors.text,
  },
  envoyer: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.radii.md,
    backgroundColor: theme.colors.accent,
  },
  envoyerTexte: { fontFamily: theme.fontBodyBold, fontSize: 15, color: theme.colors.background },
  erreur: { fontFamily: theme.fontBody, fontSize: 13, color: theme.colors.warning },
}));
