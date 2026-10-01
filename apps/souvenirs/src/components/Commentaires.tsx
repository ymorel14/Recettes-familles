import React, { useEffect, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { theme, creerStylesThemes } from '../theme/theme';
import { useAuth } from '../contexts/AuthContext';
import { extraireMessageErreur, prenomsDe } from '@apps-famille/famille';
import {
  ajouterCommentaire,
  modifierCommentaire,
  supprimerCommentaire,
  type Commentaire,
} from '../services/souvenirs';
import { Champ } from './formulaire';
import { Bouton } from './ui';
import { alerte } from '../utils/alerte';

function quand(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}

// Commentaires d'un souvenir (mediaId vide) ou d'un de ses médias. Chacun
// modifie ou supprime les siens ; ceux qui gèrent le souvenir peuvent aussi
// supprimer ceux des autres (peutModerer).
export default function Commentaires({
  souvenirId,
  mediaId = null,
  commentaires,
  peutModerer,
  onChange,
}: {
  souvenirId: string;
  mediaId?: string | null;
  commentaires: Commentaire[];
  peutModerer: boolean;
  onChange: () => void;
}) {
  const { session } = useAuth();
  const moi = session?.user.id;
  const [texte, setTexte] = useState('');
  const [enEdition, setEnEdition] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [prenoms, setPrenoms] = useState<Map<string, string>>(new Map());

  const liste = commentaires.filter((c) => (mediaId ? c.media_id === mediaId : !c.media_id));
  const cleAuteurs = Array.from(new Set(liste.map((c) => c.auteur))).sort().join('|');

  useEffect(() => {
    if (!cleAuteurs) return;
    prenomsDe(cleAuteurs.split('|'))
      .then(setPrenoms)
      .catch(() => {});
  }, [cleAuteurs]);

  const envoyer = async () => {
    if (!moi || !texte.trim()) return;
    setEnCours(true);
    setErreur(null);
    try {
      if (enEdition) await modifierCommentaire(enEdition, texte);
      else await ajouterCommentaire(souvenirId, moi, texte, mediaId);
      setTexte('');
      setEnEdition(null);
      onChange();
    } catch (e) {
      setErreur(extraireMessageErreur(e, 'Envoi impossible.'));
    } finally {
      setEnCours(false);
    }
  };

  const supprimer = (c: Commentaire) =>
    alerte('Supprimer ce commentaire ?', undefined, [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: async () => {
          try {
            await supprimerCommentaire(c.id);
            onChange();
          } catch (e) {
            setErreur(extraireMessageErreur(e, 'Suppression impossible.'));
          }
        },
      },
    ]);

  return (
    <View style={styles.bloc}>
      <Text style={styles.titre}>
        Commentaires{liste.length ? ` (${liste.length})` : ''}
      </Text>
      {liste.length === 0 && <Text style={styles.aide}>Personne n'a encore commenté. Racontez votre version !</Text>}
      {liste.map((c) => {
        const mien = c.auteur === moi;
        return (
          <View key={c.id} style={styles.commentaire}>
            <Text style={styles.auteur}>
              {mien ? 'Moi' : prenoms.get(c.auteur) || 'Un proche'}
              <Text style={styles.date}> · {quand(c.cree_le)}</Text>
            </Text>
            <Text style={styles.texte}>{c.texte}</Text>
            {(mien || peutModerer) && (
              <View style={styles.actions}>
                {mien && (
                  <Pressable
                    onPress={() => {
                      setEnEdition(c.id);
                      setTexte(c.texte);
                    }}
                    hitSlop={8}
                    accessibilityRole="button"
                  >
                    <Text style={styles.lien}>Modifier</Text>
                  </Pressable>
                )}
                <Pressable onPress={() => supprimer(c)} hitSlop={8} accessibilityRole="button">
                  <Text style={styles.lien}>Supprimer</Text>
                </Pressable>
              </View>
            )}
          </View>
        );
      })}
      <Champ
        value={texte}
        onChangeText={setTexte}
        placeholder={mediaId ? 'Un mot sur cette photo…' : 'Ajouter un commentaire, un détail, une anecdote…'}
        multiline
        accessibilityLabel="Commentaire"
      />
      {erreur && <Text style={styles.erreur}>{erreur}</Text>}
      <View style={styles.boutons}>
        {enEdition && (
          <Bouton
            variante="discret"
            titre="Annuler"
            onPress={() => {
              setEnEdition(null);
              setTexte('');
            }}
          />
        )}
        <Bouton
          titre={enEdition ? 'Enregistrer' : 'Publier'}
          onPress={envoyer}
          enCours={enCours}
          desactive={!texte.trim()}
          style={styles.publier}
        />
      </View>
    </View>
  );
}

const styles = creerStylesThemes(() => ({
  bloc: { gap: theme.spacing.sm },
  titre: { fontFamily: theme.fontTitle, fontSize: 19, color: theme.colors.text },
  aide: { fontFamily: theme.fontBody, fontSize: 14, color: theme.colors.textMuted },
  commentaire: {
    gap: 2,
    padding: theme.spacing.sm,
    borderRadius: theme.radii.md,
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: 1,
  },
  auteur: { fontFamily: theme.fontBodyBold, fontSize: 14, color: theme.colors.accent },
  date: { fontFamily: theme.fontBody, fontSize: 12, color: theme.colors.textMuted },
  texte: { fontFamily: theme.fontBody, fontSize: 15, color: theme.colors.text, lineHeight: 21 },
  actions: { flexDirection: 'row', gap: theme.spacing.md, marginTop: 2 },
  lien: { fontFamily: theme.fontBody, fontSize: 13, color: theme.colors.textMuted, textDecorationLine: 'underline' },
  boutons: { flexDirection: 'row', justifyContent: 'flex-end', gap: theme.spacing.sm },
  publier: { minWidth: 120 },
  erreur: { fontFamily: theme.fontBody, fontSize: 14, color: theme.colors.warning },
}));
