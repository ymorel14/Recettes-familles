import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { supabase } from '../../services/supabase';
import { theme } from '../../theme/theme';
import { useAuth } from '../../contexts/AuthContext';

// Les erreurs Supabase (PostgrestError) ne sont pas toujours reconnues comme
// des Error JS "classiques" selon la version — on extrait le message de
// façon plus robuste pour ne jamais afficher un message générique inutile.
function extraireMessageErreur(e: unknown, motParDefaut: string): string {
  if (e && typeof e === 'object' && 'message' in e && typeof (e as any).message === 'string') {
    return (e as any).message;
  }
  if (e instanceof Error) return e.message;
  return motParDefaut;
}

function genererCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sans caractères ambigus (0/O, 1/I)
  let code = '';
  for (let i = 0; i < 6; i += 1) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return code;
}

// Écran affiché à un utilisateur connecté qui n'appartient encore à aucun
// foyer : créer son foyer, ou rejoindre celui d'un proche via un code (§3).
export default function FoyerScreen() {
  const { session, rafraichirFoyer, deconnexion } = useAuth();
  const [nomFoyer, setNomFoyer] = useState('');
  const [codeSaisi, setCodeSaisi] = useState('');
  const [enCours, setEnCours] = useState<'creation' | 'jonction' | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  const creerFoyer = async () => {
    if (!nomFoyer.trim() || !session) return;
    setErreur(null);
    setEnCours('creation');
    try {
      const { data: foyerCree, error: erreurFoyer } = await supabase
        .from('foyers')
        .insert({ nom: nomFoyer.trim(), cree_par: session.user.id })
        .select()
        .single();
      if (erreurFoyer) throw erreurFoyer;

      const { error: erreurMembre } = await supabase
        .from('foyer_membres')
        .insert({ foyer_id: foyerCree.id, utilisateur_id: session.user.id, role: 'administrateur' });
      if (erreurMembre) throw erreurMembre;

      await supabase.from('invitations').insert({
        foyer_id: foyerCree.id,
        code: genererCode(),
        creee_par: session.user.id,
      });

      await rafraichirFoyer();
    } catch (e) {
      console.log('Erreur création foyer :', e);
      setErreur(extraireMessageErreur(e, 'Impossible de créer le foyer.'));
    } finally {
      setEnCours(null);
    }
  };

  const rejoindreFoyer = async () => {
    if (!codeSaisi.trim()) return;
    setErreur(null);
    setEnCours('jonction');
    try {
      const { error } = await supabase.rpc('rejoindre_foyer', { code_saisi: codeSaisi.trim() });
      if (error) throw error;
      await rafraichirFoyer();
    } catch (e) {
      console.log('Erreur jonction foyer :', e);
      setErreur(extraireMessageErreur(e, 'Code invalide.'));
    } finally {
      setEnCours(null);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.titre}>Bienvenue !</Text>
      <Text style={styles.sousTitre}>Créez le foyer de votre famille, ou rejoignez-en un.</Text>

      <View style={styles.section}>
        <Text style={styles.sectionTitre}>Créer un foyer</Text>
        <TextInput
          style={styles.champ}
          placeholder="Nom du foyer (ex. Famille Morel)"
          placeholderTextColor={theme.colors.textMuted}
          value={nomFoyer}
          onChangeText={setNomFoyer}
        />
        <Pressable style={styles.bouton} onPress={creerFoyer} disabled={enCours !== null}>
          {enCours === 'creation' ? (
            <ActivityIndicator color={theme.colors.background} />
          ) : (
            <Text style={styles.boutonTexte}>Créer le foyer</Text>
          )}
        </Pressable>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitre}>Rejoindre un foyer existant</Text>
        <TextInput
          style={styles.champ}
          placeholder="Code d'invitation (ex. A3F9K2)"
          placeholderTextColor={theme.colors.textMuted}
          autoCapitalize="characters"
          value={codeSaisi}
          onChangeText={setCodeSaisi}
        />
        <Pressable style={styles.bouton} onPress={rejoindreFoyer} disabled={enCours !== null}>
          {enCours === 'jonction' ? (
            <ActivityIndicator color={theme.colors.background} />
          ) : (
            <Text style={styles.boutonTexte}>Rejoindre</Text>
          )}
        </Pressable>
      </View>

      {erreur && <Text style={styles.erreur}>{erreur}</Text>}

      {/* Tant qu'on n'a pas de foyer, l'écran Profil (où se trouve la
          déconnexion normale) n'est pas accessible : on l'ajoute donc ici
          aussi, pour ne jamais bloquer un utilisateur sur cet écran. */}
      <Pressable onPress={deconnexion} style={styles.lienDeconnexion}>
        <Text style={styles.lienDeconnexionTexte}>Se déconnecter</Text>
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
    gap: theme.spacing.lg,
  },
  titre: {
    fontFamily: theme.fontTitle,
    fontSize: 28,
    color: theme.colors.accent,
    textAlign: 'center',
  },
  sousTitre: {
    fontFamily: theme.fontBody,
    fontSize: 15,
    color: theme.colors.textMuted,
    textAlign: 'center',
    marginBottom: theme.spacing.md,
  },
  section: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radii.md,
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  sectionTitre: {
    fontFamily: theme.fontBodyBold,
    fontSize: 16,
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
  bouton: {
    backgroundColor: theme.colors.accent,
    borderRadius: theme.radii.md,
    paddingVertical: theme.spacing.md,
    alignItems: 'center',
  },
  boutonTexte: {
    fontFamily: theme.fontBodyBold,
    fontSize: 16,
    color: theme.colors.background,
  },
  erreur: {
    fontFamily: theme.fontBody,
    color: theme.colors.warning,
    textAlign: 'center',
  },
  lienDeconnexion: {
    alignItems: 'center',
    marginTop: theme.spacing.sm,
  },
  lienDeconnexionTexte: {
    fontFamily: theme.fontBody,
    color: theme.colors.textMuted,
    fontSize: 14,
    textDecorationLine: 'underline',
  },
});
