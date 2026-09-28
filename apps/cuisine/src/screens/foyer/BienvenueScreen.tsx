import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { theme, creerStylesThemes } from '../../theme/theme';
import { useAuth } from '../../contexts/AuthContext';
import { creerFamille, extraireMessageErreur, rejoindreAvecCode } from '../../services/famille';
import ZoneClavier from '../../components/ZoneClavier';

// Première connexion, utilisateur sans famille. Deux possibilités :
//  - il a reçu le code famille : il rejoint la famille, puis choisit un
//    foyer existant ou crée le sien (écran suivant, FoyerScreen) ;
//  - il part de zéro : il crée sa famille, puis son premier foyer.
// (Un ancien code foyer encore valide est toujours accepté : il fait
// rejoindre directement le foyer.)
// Une fois l'action réussie, la navigation bascule d'elle-même vers l'écran
// suivant (création du foyer ou accueil) grâce au rafraîchissement du contexte.
export default function BienvenueScreen() {
  const { rafraichirFoyer, deconnexion } = useAuth();
  const [code, setCode] = useState('');
  const [nomFamille, setNomFamille] = useState('');
  const [enCours, setEnCours] = useState<'code' | 'famille' | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  const validerCode = async () => {
    if (!code.trim()) return;
    setErreur(null);
    setEnCours('code');
    try {
      await rejoindreAvecCode(code);
      await rafraichirFoyer();
    } catch (e) {
      setErreur(extraireMessageErreur(e, 'Code invalide.'));
    } finally {
      setEnCours(null);
    }
  };

  const validerFamille = async () => {
    if (!nomFamille.trim()) return;
    setErreur(null);
    setEnCours('famille');
    try {
      await creerFamille(nomFamille);
      await rafraichirFoyer();
    } catch (e) {
      setErreur(extraireMessageErreur(e, 'Impossible de créer la famille.'));
    } finally {
      setEnCours(null);
    }
  };

  return (
    <ZoneClavier style={styles.flex} sansEnTete>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={styles.titre}>Bienvenue !</Text>
        <Text style={styles.sousTitre}>
          Rejoignez votre famille avec le code qu'un proche vous a envoyé, ou créez la vôtre.
        </Text>

        <View style={styles.section}>
          <Text style={styles.sectionTitre}>J'ai reçu un code famille</Text>
          <Text style={styles.aide}>
            Vous rejoindrez la famille, puis vous choisirez votre foyer parmi ceux qui existent déjà
            ou vous créerez le vôtre.
          </Text>
          <TextInput
            style={[styles.champ, styles.champCode]}
            placeholder="Code famille (ex. A3F9K2)"
            placeholderTextColor={theme.colors.textMuted}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={6}
            value={code}
            onChangeText={setCode}
            onSubmitEditing={validerCode}
          />
          <Pressable
            style={[styles.bouton, (!code.trim() || enCours !== null) && styles.boutonInactif]}
            onPress={validerCode}
            disabled={!code.trim() || enCours !== null}
          >
            {enCours === 'code' ? (
              <ActivityIndicator color={theme.colors.background} />
            ) : (
              <Text style={styles.boutonTexte}>Valider le code</Text>
            )}
          </Pressable>
        </View>

        <View style={styles.separateur}>
          <View style={styles.trait} />
          <Text style={styles.separateurTexte}>ou</Text>
          <View style={styles.trait} />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitre}>Je crée ma famille</Text>
          <Text style={styles.aide}>
            Vous pourrez ensuite créer votre foyer et inviter vos proches.
          </Text>
          <TextInput
            style={styles.champ}
            placeholder="Nom de la famille (ex. Famille Morel)"
            placeholderTextColor={theme.colors.textMuted}
            value={nomFamille}
            onChangeText={setNomFamille}
            onSubmitEditing={validerFamille}
          />
          <Pressable
            style={[styles.bouton, (!nomFamille.trim() || enCours !== null) && styles.boutonInactif]}
            onPress={validerFamille}
            disabled={!nomFamille.trim() || enCours !== null}
          >
            {enCours === 'famille' ? (
              <ActivityIndicator color={theme.colors.background} />
            ) : (
              <Text style={styles.boutonTexte}>Créer ma famille</Text>
            )}
          </Pressable>
        </View>

        {erreur && <Text style={styles.erreur}>{erreur}</Text>}

        {/* Sans foyer, l'écran Profil (et sa déconnexion) n'est pas accessible. */}
        <Pressable onPress={deconnexion} style={styles.lien}>
          <Text style={styles.lienTexte}>Se déconnecter</Text>
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
  container: {
    flexGrow: 1,
    padding: theme.spacing.lg,
    justifyContent: 'center',
    gap: theme.spacing.md,
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
    marginBottom: theme.spacing.sm,
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
    fontSize: 17,
    color: theme.colors.text,
  },
  aide: {
    fontFamily: theme.fontBody,
    fontSize: 13,
    color: theme.colors.textMuted,
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
  champCode: {
    fontFamily: theme.fontTitle,
    fontSize: 20,
    letterSpacing: 4,
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
  separateur: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  trait: {
    flex: 1,
    height: 1,
    backgroundColor: theme.colors.border,
    opacity: 0.5,
  },
  separateurTexte: {
    fontFamily: theme.fontBody,
    color: theme.colors.textMuted,
  },
  erreur: {
    fontFamily: theme.fontBody,
    color: theme.colors.warning,
    textAlign: 'center',
  },
  lien: {
    alignItems: 'center',
    marginTop: theme.spacing.sm,
  },
  lienTexte: {
    fontFamily: theme.fontBody,
    color: theme.colors.textMuted,
    fontSize: 14,
    textDecorationLine: 'underline',
  },
}));
