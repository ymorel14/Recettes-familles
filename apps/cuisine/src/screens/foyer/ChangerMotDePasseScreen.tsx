import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { supabase } from '../../services/supabase';
import { theme, creerStylesThemes } from '../../theme/theme';
import { useAuth } from '../../contexts/AuthContext';
import { extraireMessageErreur } from '../../services/famille';
import ZoneClavier from '../../components/ZoneClavier';

const LONGUEUR_MIN = 8;

// Changement du mot de passe de l'utilisateur connecté. Le mot de passe
// actuel est redemandé (et vérifié) avant d'accepter le nouveau, pour
// qu'un téléphone laissé déverrouillé ne suffise pas à le changer.
// Rappel : les comptes sont communs avec l'autre application du même projet
// Supabase, le nouveau mot de passe s'y applique donc aussi.
export default function ChangerMotDePasseScreen({ navigation }: any) {
  const { session } = useAuth();
  const [actuel, setActuel] = useState('');
  const [nouveau, setNouveau] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState(false);

  const valider = async () => {
    setErreur(null);
    const email = session?.user.email;
    if (!email) {
      setErreur('Session introuvable, reconnectez-vous.');
      return;
    }
    if (!actuel || !nouveau || !confirmation) {
      setErreur('Remplissez les trois champs.');
      return;
    }
    if (nouveau.length < LONGUEUR_MIN) {
      setErreur(`Le nouveau mot de passe doit contenir au moins ${LONGUEUR_MIN} caractères.`);
      return;
    }
    if (nouveau !== confirmation) {
      setErreur('La confirmation ne correspond pas au nouveau mot de passe.');
      return;
    }
    if (nouveau === actuel) {
      setErreur("Le nouveau mot de passe doit être différent de l'actuel.");
      return;
    }

    setEnCours(true);
    try {
      // Vérifie le mot de passe actuel en se reconnectant avec.
      const { error: erreurVerification } = await supabase.auth.signInWithPassword({
        email,
        password: actuel,
      });
      if (erreurVerification) {
        setErreur('Mot de passe actuel incorrect.');
        return;
      }

      const { error } = await supabase.auth.updateUser({ password: nouveau });
      if (error) throw error;

      setSucces(true);
      setActuel('');
      setNouveau('');
      setConfirmation('');
    } catch (e) {
      setErreur(extraireMessageErreur(e, 'Impossible de changer le mot de passe.'));
    } finally {
      setEnCours(false);
    }
  };

  if (succes) {
    return (
      <View style={[styles.flex, styles.centre]}>
        <Text style={styles.titreSucces}>Mot de passe modifié</Text>
        <Text style={styles.aide}>
          Utilisez désormais votre nouveau mot de passe pour vous connecter, y compris sur l'autre
          application qui partage ce compte.
        </Text>
        <Pressable style={styles.bouton} onPress={() => navigation.goBack()}>
          <Text style={styles.boutonTexte}>Retour au profil</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ZoneClavier style={styles.flex}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={styles.aide}>
          Compte : {session?.user.email}. Ce mot de passe est aussi celui de l'autre application
          qui partage ce compte.
        </Text>

        <View style={styles.section}>
          <Text style={styles.libelle}>Mot de passe actuel</Text>
          <TextInput
            style={styles.champ}
            secureTextEntry
            autoComplete="current-password"
            textContentType="password"
            value={actuel}
            onChangeText={setActuel}
          />

          <Text style={styles.libelle}>Nouveau mot de passe</Text>
          <TextInput
            style={styles.champ}
            secureTextEntry
            autoComplete="new-password"
            textContentType="newPassword"
            placeholder={`${LONGUEUR_MIN} caractères minimum`}
            placeholderTextColor={theme.colors.textMuted}
            value={nouveau}
            onChangeText={setNouveau}
          />

          <Text style={styles.libelle}>Confirmer le nouveau mot de passe</Text>
          <TextInput
            style={styles.champ}
            secureTextEntry
            autoComplete="new-password"
            textContentType="newPassword"
            value={confirmation}
            onChangeText={setConfirmation}
            onSubmitEditing={valider}
          />
        </View>

        {erreur && <Text style={styles.erreur}>{erreur}</Text>}

        <Pressable style={[styles.bouton, enCours && styles.boutonInactif]} onPress={valider} disabled={enCours}>
          {enCours ? (
            <ActivityIndicator color={theme.colors.background} />
          ) : (
            <Text style={styles.boutonTexte}>Changer le mot de passe</Text>
          )}
        </Pressable>
      </ScrollView>
    </ZoneClavier>
  );
}

const styles = creerStylesThemes(() => ({
  flex: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  centre: {
    padding: theme.spacing.lg,
    justifyContent: 'center',
    gap: theme.spacing.md,
  },
  container: {
    padding: theme.spacing.lg,
    gap: theme.spacing.md,
  },
  section: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radii.md,
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  libelle: {
    fontFamily: theme.fontBodyBold,
    fontSize: 15,
    color: theme.colors.text,
  },
  champ: {
    backgroundColor: theme.colors.background,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radii.md,
    padding: theme.spacing.md,
    color: theme.colors.text,
    fontFamily: theme.fontBody,
  },
  aide: {
    fontFamily: theme.fontBody,
    fontSize: 13,
    color: theme.colors.textMuted,
  },
  erreur: {
    fontFamily: theme.fontBody,
    color: theme.colors.warning,
    textAlign: 'center',
  },
  titreSucces: {
    fontFamily: theme.fontTitle,
    fontSize: 24,
    color: theme.colors.accent,
    textAlign: 'center',
  },
  bouton: {
    backgroundColor: theme.colors.accent,
    borderRadius: theme.radii.md,
    paddingVertical: theme.spacing.md,
    alignItems: 'center',
  },
  boutonInactif: {
    opacity: 0.5,
  },
  boutonTexte: {
    fontFamily: theme.fontBodyBold,
    fontSize: 16,
    color: theme.colors.background,
  },
}));
