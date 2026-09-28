import React, { useState } from 'react';
import { Text, TextInput, ScrollView } from 'react-native';
import { theme, creerStylesThemes } from '../theme/theme';
import { useAuth } from '../contexts/AuthContext';
import { definirMonPrenom, extraireMessageErreur } from '@apps-famille/famille';
import { Bouton } from '../components/ui';

// Demandé une fois, tant que l'utilisateur n'a pas de prénom : sans lui, la
// famille verrait "Quelqu’un de …" au lieu de "La liste de Claire".
export default function PrenomScreen({ onTermine }: { onTermine: () => void }) {
  const { session, deconnexion } = useAuth();
  const [prenom, setPrenom] = useState('');
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const valider = async () => {
    if (!session || !prenom.trim()) return;
    setErreur(null);
    setEnCours(true);
    try {
      await definirMonPrenom(session.user.id, prenom);
      onTermine();
    } catch (e) {
      setErreur(extraireMessageErreur(e, 'Enregistrement impossible.'));
    } finally {
      setEnCours(false);
    }
  };

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.contenu} keyboardShouldPersistTaps="handled">
      <Text style={styles.titre}>Comment vous appelez-vous ?</Text>
      <Text style={styles.texte}>
        Votre prénom s'affiche sur vos listes (« La liste de … ») et vos idées de cadeaux, dans toutes les apps de la
        famille. Vous pourrez le changer dans votre Profil.
      </Text>
      <TextInput
        style={styles.champ}
        value={prenom}
        onChangeText={setPrenom}
        placeholder="Prénom ou surnom (ex. Papy Yves)"
        placeholderTextColor={theme.colors.textMuted}
        autoFocus
        onSubmitEditing={valider}
        accessibilityLabel="Mon prénom"
      />
      {erreur && <Text style={styles.erreur}>{erreur}</Text>}
      <Bouton titre="Continuer" onPress={valider} enCours={enCours} desactive={!prenom.trim()} />
      <Bouton variante="discret" titre="Se déconnecter" onPress={deconnexion} />
    </ScrollView>
  );
}

const styles = creerStylesThemes(() => ({
  flex: { flex: 1, backgroundColor: theme.colors.background },
  contenu: { padding: theme.spacing.lg, gap: theme.spacing.md, paddingTop: theme.spacing.xl * 2 },
  titre: { fontFamily: theme.fontTitle, fontSize: 28, color: theme.colors.accent },
  texte: { fontFamily: theme.fontBody, fontSize: 16, color: theme.colors.text, lineHeight: 22 },
  champ: {
    minHeight: 48,
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radii.md,
    paddingHorizontal: theme.spacing.sm,
    color: theme.colors.text,
    fontFamily: theme.fontBody,
    fontSize: 18,
  },
  erreur: { fontFamily: theme.fontBody, fontSize: 14, color: theme.colors.warning },
}));
