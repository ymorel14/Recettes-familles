import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { supabase } from '../../services/supabase';
import { theme } from '../../theme/theme';

// Écran de connexion / inscription (§3 : "compte individuel, email/mot de passe").
export default function AuthScreen() {
  const [modeInscription, setModeInscription] = useState(false);
  const [email, setEmail] = useState('');
  const [motDePasse, setMotDePasse] = useState('');
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [messageInfo, setMessageInfo] = useState<string | null>(null);

  const valider = async () => {
    setErreur(null);
    setMessageInfo(null);
    if (!email.trim() || !motDePasse) {
      setErreur('Renseignez votre email et votre mot de passe.');
      return;
    }
    setEnCours(true);
    try {
      if (modeInscription) {
        const { error } = await supabase.auth.signUp({ email: email.trim(), password: motDePasse });
        if (error) throw error;
        setMessageInfo('Compte créé. Vérifiez vos emails si une confirmation est demandée, puis connectez-vous.');
        setModeInscription(false);
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password: motDePasse,
        });
        if (error) throw error;
      }
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Une erreur est survenue.');
    } finally {
      setEnCours(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.titre}>Recettes familiales</Text>
      <Text style={styles.sousTitre}>
        {modeInscription ? 'Créer un compte' : 'Se connecter'}
      </Text>

      <TextInput
        style={styles.champ}
        placeholder="Email"
        placeholderTextColor={theme.colors.textMuted}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        style={styles.champ}
        placeholder="Mot de passe"
        placeholderTextColor={theme.colors.textMuted}
        secureTextEntry
        autoComplete="password"
        value={motDePasse}
        onChangeText={setMotDePasse}
      />

      {erreur && <Text style={styles.erreur}>{erreur}</Text>}
      {messageInfo && <Text style={styles.info}>{messageInfo}</Text>}

      <Pressable style={styles.bouton} onPress={valider} disabled={enCours}>
        {enCours ? (
          <ActivityIndicator color={theme.colors.background} />
        ) : (
          <Text style={styles.boutonTexte}>{modeInscription ? "S'inscrire" : 'Se connecter'}</Text>
        )}
      </Pressable>

      <Pressable onPress={() => setModeInscription((v) => !v)}>
        <Text style={styles.lien}>
          {modeInscription ? 'Déjà un compte ? Se connecter' : "Pas encore de compte ? S'inscrire"}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
    padding: theme.spacing.lg,
    justifyContent: 'center',
  },
  titre: {
    fontFamily: theme.fontTitle,
    fontSize: 30,
    color: theme.colors.accent,
    textAlign: 'center',
    marginBottom: theme.spacing.xs,
  },
  sousTitre: {
    fontFamily: theme.fontBody,
    fontSize: 16,
    color: theme.colors.textMuted,
    textAlign: 'center',
    marginBottom: theme.spacing.xl,
  },
  champ: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radii.md,
    padding: theme.spacing.md,
    color: theme.colors.text,
    fontFamily: theme.fontBody,
    marginBottom: theme.spacing.sm,
  },
  erreur: {
    fontFamily: theme.fontBody,
    color: theme.colors.warning,
    marginBottom: theme.spacing.sm,
  },
  info: {
    fontFamily: theme.fontBody,
    color: theme.colors.success,
    marginBottom: theme.spacing.sm,
  },
  bouton: {
    backgroundColor: theme.colors.accent,
    borderRadius: theme.radii.md,
    paddingVertical: theme.spacing.md,
    alignItems: 'center',
    marginTop: theme.spacing.sm,
  },
  boutonTexte: {
    fontFamily: theme.fontBodyBold,
    fontSize: 16,
    color: theme.colors.background,
  },
  lien: {
    fontFamily: theme.fontBody,
    color: theme.colors.accent,
    textAlign: 'center',
    marginTop: theme.spacing.lg,
  },
});
