import React, { useState } from 'react';
import { View, Text, TextInput, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { theme, creerStylesThemes } from '../theme/theme';
import { supabase, URL_RETOUR_EMAIL } from '../services/supabase';
import { ConnexionAutresApps, extraireMessageErreur } from '@apps-famille/famille';
import { Bouton } from '../components/ui';

// Connexion avec le même compte que l'app Cuisine (comptes communs à toutes
// les apps de la famille), ou création d'un compte.
export default function ConnexionScreen() {
  const [mode, setMode] = useState<'connexion' | 'inscription'>('connexion');
  const [email, setEmail] = useState('');
  const [motDePasse, setMotDePasse] = useState('');
  const [enCours, setEnCours] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const valider = async () => {
    setMessage(null);
    if (!email.trim() || !motDePasse) {
      setMessage('Renseignez votre email et votre mot de passe.');
      return;
    }
    setEnCours(true);
    try {
      if (mode === 'connexion') {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: motDePasse });
        if (error) throw error;
      } else {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password: motDePasse,
          options: { emailRedirectTo: URL_RETOUR_EMAIL },
        });
        if (error) throw error;
        if (!data.session) {
          setMessage('Compte créé : ouvrez le lien reçu par email pour le confirmer, puis connectez-vous.');
          setMode('connexion');
        }
      }
    } catch (e) {
      const brut = extraireMessageErreur(e, 'Connexion impossible.');
      setMessage(
        /invalid login credentials/i.test(brut)
          ? 'Email ou mot de passe incorrect.'
          : /email not confirmed/i.test(brut)
            ? 'Confirmez d’abord votre adresse avec le lien reçu par email.'
            : brut
      );
    } finally {
      setEnCours(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.contenu} keyboardShouldPersistTaps="handled">
        <View style={styles.entete}>
          <Text style={styles.titre}>CadeauCommun</Text>
          <Text style={styles.sousTitre}>
            Les listes de cadeaux de la famille, sans gâcher la surprise.
          </Text>
        </View>

        <View style={styles.carte}>
          <Text style={styles.carteTitre}>{mode === 'connexion' ? 'Se connecter' : 'Créer un compte'}</Text>
          {mode === 'connexion' && (
            <Text style={styles.aide}>Utilisez le même compte que pour l'app Recettes familiales.</Text>
          )}
          <Text style={styles.libelle} nativeID="libelle-email">Email</Text>
          <TextInput
            style={styles.champ}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            accessibilityLabelledBy="libelle-email"
            placeholder="prenom@exemple.fr"
            placeholderTextColor={theme.colors.textMuted}
          />
          <Text style={styles.libelle} nativeID="libelle-mdp">Mot de passe</Text>
          <TextInput
            style={styles.champ}
            value={motDePasse}
            onChangeText={setMotDePasse}
            secureTextEntry
            autoComplete={mode === 'connexion' ? 'password' : 'new-password'}
            accessibilityLabelledBy="libelle-mdp"
            onSubmitEditing={valider}
          />
          {message && <Text style={styles.message}>{message}</Text>}
          <Bouton titre={mode === 'connexion' ? 'Se connecter' : 'Créer mon compte'} onPress={valider} enCours={enCours} />
          <Bouton
            variante="discret"
            titre={mode === 'connexion' ? 'Pas encore de compte ? S’inscrire' : 'J’ai déjà un compte'}
            onPress={() => {
              setMode(mode === 'connexion' ? 'inscription' : 'connexion');
              setMessage(null);
            }}
          />
        </View>

        {mode === 'connexion' && (
          <ConnexionAutresApps polices={{ titre: theme.fontTitle, corps: theme.fontBody, gras: theme.fontBodyBold }} />
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = creerStylesThemes(() => ({
  flex: { flex: 1, backgroundColor: theme.colors.background },
  contenu: { flexGrow: 1, justifyContent: 'center', padding: theme.spacing.lg, gap: theme.spacing.lg },
  entete: { gap: theme.spacing.sm, alignItems: 'center' },
  titre: { fontFamily: theme.fontTitle, fontSize: 36, color: theme.colors.accent, textAlign: 'center' },
  sousTitre: { fontFamily: theme.fontBody, fontSize: 16, color: theme.colors.textMuted, textAlign: 'center' },
  carte: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radii.lg,
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  carteTitre: { fontFamily: theme.fontTitle, fontSize: 20, color: theme.colors.text },
  aide: { fontFamily: theme.fontBody, fontSize: 14, color: theme.colors.textMuted },
  libelle: { fontFamily: theme.fontBodyBold, fontSize: 14, color: theme.colors.text, marginTop: theme.spacing.xs },
  champ: {
    minHeight: 44,
    backgroundColor: theme.colors.background,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radii.md,
    paddingHorizontal: theme.spacing.sm,
    color: theme.colors.text,
    fontFamily: theme.fontBody,
    fontSize: 16,
  },
  message: { fontFamily: theme.fontBody, fontSize: 14, color: theme.colors.warning },
}));
