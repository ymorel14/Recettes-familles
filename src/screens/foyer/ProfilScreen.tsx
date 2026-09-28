import React, { useCallback, useState } from 'react';
import { View, Text, TextInput, StyleSheet, Pressable, ActivityIndicator, Share, ScrollView, Switch } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { theme, creerStylesThemes, THEMES } from '../../theme/theme';
import { useAuth } from '../../contexts/AuthContext';
import { usePreferences } from '../../contexts/PreferencesContext';
import {
  extraireMessageErreur,
  formaterExpiration,
  obtenirCodeInvitation,
} from '../../services/famille';
import type { CodeInvitation, TypeCodeInvitation } from '../../types/models';
import { definirMonPrenom, obtenirMonPrenom } from '../../services/profils';
import ZoneClavier from '../../components/ZoneClavier';

// Carte affichant un code d'invitation (famille ou foyer) et permettant de le
// partager. Le code est valable 24 h : il est rechargé à chaque affichage de
// l'écran, et un nouveau est généré automatiquement quand l'ancien expire.
function CarteCode({
  type,
  titre,
  aide,
  messagePartage,
}: {
  type: TypeCodeInvitation;
  titre: string;
  aide: string;
  messagePartage: (code: string) => string;
}) {
  const [invitation, setInvitation] = useState<CodeInvitation | null>(null);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let actif = true;
      setChargement(true);
      setErreur(null);
      obtenirCodeInvitation(type)
        .then((resultat) => actif && setInvitation(resultat))
        .catch((e) => actif && setErreur(extraireMessageErreur(e, 'Code indisponible.')))
        .finally(() => actif && setChargement(false));
      return () => {
        actif = false;
      };
    }, [type])
  );

  const partager = async () => {
    if (!invitation) return;
    await Share.share({ message: messagePartage(invitation.code) });
  };

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitre}>{titre}</Text>
      {chargement ? (
        <ActivityIndicator color={theme.colors.accent} />
      ) : erreur ? (
        <Text style={styles.erreur}>{erreur}</Text>
      ) : (
        <>
          <Text style={styles.code} selectable>
            {invitation?.code ?? '—'}
          </Text>
          {invitation && (
            <Text style={styles.expiration}>{formaterExpiration(invitation.expire_le)}</Text>
          )}
          <Text style={styles.aide}>{aide}</Text>
          <Pressable style={styles.bouton} onPress={partager} disabled={!invitation}>
            <Text style={styles.boutonTexte}>Partager le code</Text>
          </Pressable>
        </>
      )}
    </View>
  );
}

// Prénom (ou surnom) affiché sur les essais de recettes, visible par la famille.
function CartePrenom({ utilisateurId }: { utilisateurId: string }) {
  const [prenom, setPrenom] = useState('');
  const [enregistre, setEnregistre] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      obtenirMonPrenom(utilisateurId)
        .then((p) => {
          setEnregistre(p);
          setPrenom(p ?? '');
        })
        .catch(() => {});
    }, [utilisateurId])
  );

  const enregistrer = async () => {
    setMessage(null);
    setEnCours(true);
    try {
      await definirMonPrenom(utilisateurId, prenom);
      setEnregistre(prenom.trim());
      setMessage('Prénom enregistré.');
    } catch (e) {
      setMessage(extraireMessageErreur(e, 'Impossible d’enregistrer le prénom.'));
    } finally {
      setEnCours(false);
    }
  };

  const modifie = prenom.trim() !== (enregistre ?? '') && prenom.trim().length > 0;

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitre}>Mon prénom</Text>
      <Text style={styles.aide}>Affiché sur vos essais de recettes, visible par toute la famille.</Text>
      <TextInput
        style={styles.champ}
        placeholder="Prénom ou surnom"
        placeholderTextColor={theme.colors.textMuted}
        value={prenom}
        onChangeText={(t) => {
          setPrenom(t);
          setMessage(null);
        }}
        onSubmitEditing={() => modifie && enregistrer()}
      />
      {modifie && (
        <Pressable style={styles.bouton} onPress={enregistrer} disabled={enCours}>
          {enCours ? (
            <ActivityIndicator color={theme.colors.background} />
          ) : (
            <Text style={styles.boutonTexte}>Enregistrer</Text>
          )}
        </Pressable>
      )}
      {message && <Text style={styles.aide}>{message}</Text>}
    </View>
  );
}

// Écran "Profil" : famille, foyer, code d'invitation, déconnexion.
// Un seul code (le code famille), que tout membre de la famille peut
// partager ; le nouvel arrivant choisit ensuite son foyer.
export default function ProfilScreen() {
  const { session, famille, foyer, deconnexion } = useAuth();
  const { lectureAutoAssistant, definirLectureAutoAssistant, themeId, definirTheme } = usePreferences();
  const navigation = useNavigation<any>();

  return (
    <ZoneClavier>
    <ScrollView style={styles.flex} contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <View>
        <Text style={styles.titre}>{foyer?.nom ?? 'Mon foyer'}</Text>
        {famille && <Text style={styles.famille}>Famille {famille.nom}</Text>}
        <Text style={styles.email}>{session?.user.email}</Text>
      </View>

      {session && <CartePrenom utilisateurId={session.user.id} />}

      {famille && (
        <CarteCode
          type="famille"
          titre="Code famille"
          aide="À envoyer à un proche, qu'il vive avec vous ou non : après l'avoir saisi, il choisira votre foyer ou un autre foyer de la famille, ou créera le sien."
          messagePartage={(code) =>
            `Rejoins la famille "${famille.nom}" sur Recettes familiales avec le code : ${code} (valable 24 h). Tu pourras ensuite choisir ton foyer ou créer le tien.`
          }
        />
      )}

      <View style={styles.section}>
        <Text style={styles.sectionTitre}>Thème de couleurs</Text>
        <Text style={styles.aide}>Propre à ce téléphone : chacun peut choisir le sien.</Text>
        {THEMES.map((t) => {
          const actif = t.id === themeId;
          return (
            <Pressable
              key={t.id}
              style={[styles.ligneTheme, actif && styles.ligneThemeActive]}
              onPress={() => definirTheme(t.id)}
              accessibilityRole="radio"
              accessibilityState={{ selected: actif }}
            >
              {/* Aperçu : fond, panneaux, accent, sélection du thème */}
              <View style={[styles.apercuTheme, { backgroundColor: t.palette.background, borderColor: t.palette.border }]}>
                <View style={[styles.pastille, { backgroundColor: t.palette.surface }]} />
                <View style={[styles.pastille, { backgroundColor: t.palette.accent }]} />
                <View style={[styles.pastille, { backgroundColor: t.palette.selection }]} />
              </View>
              <View style={styles.reglageTextes}>
                <Text style={styles.reglageLibelle}>{t.nom}</Text>
                <Text style={styles.aide} numberOfLines={1}>
                  {t.ambiance}
                </Text>
              </View>
              {actif && <Text style={styles.coche}>✓</Text>}
            </Pressable>
          );
        })}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitre}>Préférences de cet appareil</Text>
        <View style={styles.ligneReglage}>
          <View style={styles.reglageTextes}>
            <Text style={styles.reglageLibelle}>Lecture vocale automatique</Text>
            <Text style={styles.aide}>
              Dans l'assistant, lit chaque étape à voix haute dès qu'elle devient active.
            </Text>
          </View>
          <Switch
            value={lectureAutoAssistant}
            onValueChange={definirLectureAutoAssistant}
            trackColor={{ false: theme.colors.background, true: theme.colors.selection }}
            thumbColor={lectureAutoAssistant ? theme.colors.accent : theme.colors.textMuted}
          />
        </View>
      </View>

      <Pressable style={styles.boutonContour} onPress={() => navigation.navigate('ChangerMotDePasse')}>
        <Text style={styles.boutonContourTexte}>Changer le mot de passe</Text>
      </Pressable>

      <Pressable style={styles.boutonSecondaire} onPress={deconnexion}>
        <Text style={styles.boutonSecondaireTexte}>Se déconnecter</Text>
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
    padding: theme.spacing.lg,
    gap: theme.spacing.lg,
  },
  titre: {
    fontFamily: theme.fontTitle,
    fontSize: 26,
    color: theme.colors.accent,
  },
  famille: {
    fontFamily: theme.fontBodyBold,
    fontSize: 16,
    color: theme.colors.text,
    marginTop: theme.spacing.xs,
  },
  email: {
    fontFamily: theme.fontBody,
    color: theme.colors.textMuted,
    marginTop: theme.spacing.xs,
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
  code: {
    fontFamily: theme.fontTitle,
    fontSize: 32,
    letterSpacing: 4,
    color: theme.colors.accent,
    textAlign: 'center',
  },
  expiration: {
    fontFamily: theme.fontBody,
    fontSize: 13,
    color: theme.colors.textMuted,
    textAlign: 'center',
  },
  aide: {
    fontFamily: theme.fontBody,
    fontSize: 13,
    color: theme.colors.textMuted,
  },
  erreur: {
    fontFamily: theme.fontBody,
    color: theme.colors.warning,
  },
  champ: {
    backgroundColor: theme.colors.background,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radii.md,
    padding: theme.spacing.sm,
    color: theme.colors.text,
    fontFamily: theme.fontBody,
    fontSize: 16,
  },
  ligneTheme: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    padding: theme.spacing.sm,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  ligneThemeActive: {
    borderColor: theme.colors.accent,
    backgroundColor: theme.colors.selectionTransparent,
  },
  apercuTheme: {
    flexDirection: 'row',
    gap: 3,
    padding: 5,
    borderRadius: theme.radii.sm,
    borderWidth: 1,
  },
  pastille: {
    width: 12,
    height: 24,
    borderRadius: 3,
  },
  coche: {
    fontFamily: theme.fontBodyBold,
    fontSize: 18,
    color: theme.colors.accent,
  },
  ligneReglage: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
  },
  reglageTextes: {
    flex: 1,
    gap: 2,
  },
  reglageLibelle: {
    fontFamily: theme.fontBody,
    fontSize: 15,
    color: theme.colors.text,
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
  boutonContour: {
    borderColor: theme.colors.accent,
    borderWidth: 1,
    borderRadius: theme.radii.md,
    paddingVertical: theme.spacing.md,
    alignItems: 'center',
  },
  boutonContourTexte: {
    fontFamily: theme.fontBodyBold,
    fontSize: 16,
    color: theme.colors.accent,
  },
  boutonSecondaire: {
    borderColor: theme.colors.warning,
    borderWidth: 1,
    borderRadius: theme.radii.md,
    paddingVertical: theme.spacing.md,
    alignItems: 'center',
  },
  boutonSecondaireTexte: {
    fontFamily: theme.fontBodyBold,
    fontSize: 16,
    color: theme.colors.warning,
  },
}));
