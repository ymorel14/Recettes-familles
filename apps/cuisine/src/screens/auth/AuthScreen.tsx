import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, ActivityIndicator } from 'react-native';
import { supabase, URL_RETOUR_EMAIL } from '../../services/supabase';
import { theme, creerStylesThemes } from '../../theme/theme';
import { extraireMessageErreur } from '../../services/famille';
import { alerte } from '../../utils/alerte';
import ZoneClavier from '../../components/ZoneClavier';

type Mode = 'connexion' | 'inscription' | 'motDePasse';

const LONGUEUR_MIN = 8;

// Traduit les erreurs Supabase liées aux emails, souvent peu parlantes.
function messageErreurAuth(e: unknown): string {
  const brut = e instanceof Error ? e.message : typeof e === 'object' && e && 'message' in e ? String((e as any).message) : '';
  const m = brut.toLowerCase();
  if (m.includes('email address not authorized')) {
    return "L'email de confirmation n'a pas pu être envoyé à cette adresse : le service d'envoi d'emails du projet Supabase n'est pas encore configuré (il n'écrit qu'aux membres de l'équipe du projet).";
  }
  if (m.includes('rate limit')) {
    return "Trop d'emails envoyés récemment. Réessayez dans une heure.";
  }
  if (m.includes('email not confirmed')) {
    return "Adresse email pas encore confirmée : cliquez sur le lien reçu par email (pensez aux spams), ou renvoyez-le ci-dessous.";
  }
  if (m.includes('invalid login credentials')) {
    return 'Email ou mot de passe incorrect.';
  }
  if (m.includes('password should be at least')) {
    return `Le mot de passe est trop court.`;
  }
  return brut || 'Une erreur est survenue.';
}

// Écran de connexion / inscription (§3 : "compte individuel, email/mot de passe"),
// avec la possibilité de modifier son mot de passe sans être connecté : on
// redemande l'email et le mot de passe actuel (vérifiés en se connectant
// avec), puis le nouveau. Rappel : les comptes sont communs avec l'autre
// application du même projet Supabase, le nouveau mot de passe s'y applique
// donc aussi.
export default function AuthScreen() {
  const [mode, setMode] = useState<Mode>('connexion');
  const [email, setEmail] = useState('');
  const [motDePasse, setMotDePasse] = useState('');
  const [nouveau, setNouveau] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [messageInfo, setMessageInfo] = useState<string | null>(null);
  // Adresse en attente de confirmation : affiche le bouton « Renvoyer l'email ».
  const [emailARenvoyer, setEmailARenvoyer] = useState<string | null>(null);

  const renvoyerEmail = async () => {
    if (!emailARenvoyer) return;
    setErreur(null);
    setMessageInfo(null);
    setEnCours(true);
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email: emailARenvoyer,
      options: { emailRedirectTo: URL_RETOUR_EMAIL },
    });
    setEnCours(false);
    if (error) {
      setErreur(messageErreurAuth(error));
    } else {
      setMessageInfo(`Email de confirmation renvoyé à ${emailARenvoyer}. Pensez à regarder dans les spams.`);
    }
  };

  const changerMode = (m: Mode) => {
    setMode(m);
    setErreur(null);
    setMessageInfo(null);
    setEmailARenvoyer(null);
    setNouveau('');
    setConfirmation('');
  };

  const changerMotDePasse = async () => {
    if (!nouveau || !confirmation) {
      setErreur('Saisissez et confirmez le nouveau mot de passe.');
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
    if (nouveau === motDePasse) {
      setErreur("Le nouveau mot de passe doit être différent de l'actuel.");
      return;
    }

    // Vérifie le mot de passe actuel en se connectant avec.
    const { error: erreurConnexion } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password: motDePasse,
    });
    if (erreurConnexion) {
      setErreur('Email ou mot de passe actuel incorrect.');
      return;
    }

    // La connexion fait basculer l'application vers l'accueil (cet écran
    // disparaît) : le résultat est donc annoncé par une fenêtre d'alerte.
    const { error } = await supabase.auth.updateUser({ password: nouveau });
    if (error) {
      alerte(
        'Mot de passe inchangé',
        `${extraireMessageErreur(error, 'Impossible de changer le mot de passe.')}\n\nVous êtes connecté avec votre mot de passe actuel ; vous pourrez réessayer depuis l'écran Profil.`
      );
      return;
    }
    alerte(
      'Mot de passe modifié',
      "Vous êtes connecté. Utilisez désormais votre nouveau mot de passe, y compris sur l'autre application qui partage ce compte."
    );
  };

  const valider = async () => {
    setErreur(null);
    setMessageInfo(null);
    setEmailARenvoyer(null);
    if (!email.trim() || !motDePasse) {
      setErreur(
        mode === 'motDePasse'
          ? 'Renseignez votre email et votre mot de passe actuel.'
          : 'Renseignez votre email et votre mot de passe.'
      );
      return;
    }
    setEnCours(true);
    try {
      if (mode === 'motDePasse') {
        await changerMotDePasse();
      } else if (mode === 'inscription') {
        const adresse = email.trim();
        const { data, error } = await supabase.auth.signUp({
          email: adresse,
          password: motDePasse,
          options: { emailRedirectTo: URL_RETOUR_EMAIL },
        });
        if (error) throw error;
        if (data.session) {
          // Confirmation par email désactivée dans Supabase : la personne est
          // connectée tout de suite (l'application bascule d'elle-même).
          return;
        }
        if (data.user && (data.user.identities?.length ?? 0) === 0) {
          // Supabase ne signale pas d'erreur quand l'adresse a déjà un compte
          // (par sécurité) et n'envoie alors aucun email. Les comptes étant
          // partagés avec l'autre application, c'est un cas fréquent.
          setErreur(
            "Un compte existe déjà avec cet email (il a peut-être été créé depuis l'autre application). Connectez-vous avec son mot de passe."
          );
          setMode('connexion');
          return;
        }
        setMessageInfo(
          `Compte créé. Un email de confirmation a été envoyé à ${adresse} : cliquez sur le lien qu'il contient (pensez aux spams), puis connectez-vous.`
        );
        setEmailARenvoyer(adresse);
        setMode('connexion');
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password: motDePasse,
        });
        if (error) {
          if (error.message.toLowerCase().includes('email not confirmed')) setEmailARenvoyer(email.trim());
          throw error;
        }
      }
    } catch (e) {
      setErreur(messageErreurAuth(e));
    } finally {
      setEnCours(false);
    }
  };

  const sousTitre =
    mode === 'inscription' ? 'Créer un compte' : mode === 'motDePasse' ? 'Modifier mon mot de passe' : 'Se connecter';
  const libelleBouton =
    mode === 'inscription' ? "S'inscrire" : mode === 'motDePasse' ? 'Changer le mot de passe' : 'Se connecter';

  return (
    <ZoneClavier sansEnTete>
    <View style={styles.container}>
      <Text style={styles.titre}>Recettes familiales</Text>
      <Text style={styles.sousTitre}>{sousTitre}</Text>

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
        placeholder={mode === 'motDePasse' ? 'Mot de passe actuel' : 'Mot de passe'}
        placeholderTextColor={theme.colors.textMuted}
        secureTextEntry
        autoComplete={mode === 'inscription' ? 'new-password' : 'current-password'}
        value={motDePasse}
        onChangeText={setMotDePasse}
        onSubmitEditing={mode === 'motDePasse' ? undefined : valider}
      />

      {mode === 'motDePasse' && (
        <>
          <TextInput
            style={styles.champ}
            placeholder={`Nouveau mot de passe (${LONGUEUR_MIN} caractères min.)`}
            placeholderTextColor={theme.colors.textMuted}
            secureTextEntry
            autoComplete="new-password"
            textContentType="newPassword"
            value={nouveau}
            onChangeText={setNouveau}
          />
          <TextInput
            style={styles.champ}
            placeholder="Confirmer le nouveau mot de passe"
            placeholderTextColor={theme.colors.textMuted}
            secureTextEntry
            autoComplete="new-password"
            textContentType="newPassword"
            value={confirmation}
            onChangeText={setConfirmation}
            onSubmitEditing={valider}
          />
        </>
      )}

      {erreur && <Text style={styles.erreur}>{erreur}</Text>}
      {messageInfo && <Text style={styles.info}>{messageInfo}</Text>}

      <Pressable style={styles.bouton} onPress={valider} disabled={enCours}>
        {enCours ? (
          <ActivityIndicator color={theme.colors.background} />
        ) : (
          <Text style={styles.boutonTexte}>{libelleBouton}</Text>
        )}
      </Pressable>

      {emailARenvoyer && mode === 'connexion' && (
        <Pressable onPress={renvoyerEmail} disabled={enCours}>
          <Text style={styles.lienSecondaire}>Renvoyer l'email de confirmation</Text>
        </Pressable>
      )}

      {mode === 'connexion' ? (
        <>
          <Pressable onPress={() => changerMode('inscription')}>
            <Text style={styles.lien}>Pas encore de compte ? S'inscrire</Text>
          </Pressable>
          <Pressable onPress={() => changerMode('motDePasse')}>
            <Text style={styles.lienSecondaire}>Modifier mon mot de passe</Text>
          </Pressable>
        </>
      ) : (
        <Pressable onPress={() => changerMode('connexion')}>
          <Text style={styles.lien}>
            {mode === 'inscription' ? 'Déjà un compte ? Se connecter' : 'Retour à la connexion'}
          </Text>
        </Pressable>
      )}
    </View>
    </ZoneClavier>
  );
}

const styles = creerStylesThemes(() => ({
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
  lienSecondaire: {
    fontFamily: theme.fontBody,
    color: theme.colors.textMuted,
    textAlign: 'center',
    marginTop: theme.spacing.md,
    textDecorationLine: 'underline',
  },
}));
