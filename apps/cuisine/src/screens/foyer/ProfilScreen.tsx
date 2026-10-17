import React, { useCallback, useState } from 'react';
import { View, Text, TextInput, StyleSheet, Pressable, ActivityIndicator, Share, ScrollView, Switch } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { theme, creerStylesThemes, THEMES } from '../../theme/theme';
import { useAuth } from '../../contexts/AuthContext';
import { usePreferences } from '../../contexts/PreferencesContext';
import {
  creerFamille,
  extraireMessageErreur,
  formaterExpiration,
  listerMembresFoyer,
  obtenirCodeInvitation,
  quitterFamille,
  quitterFoyer,
  rejoindreAvecCode,
  retirerDuFoyer,
} from '../../services/famille';
import { alerte } from '../../utils/alerte';
import type { CodeInvitation, TypeCodeInvitation } from '../../types/models';
import type { MembreFoyer } from '../../services/famille';
import { definirMonPrenom, obtenirMonPrenom } from '../../services/profils';
import ZoneClavier from '../../components/ZoneClavier';
import { Avatar, PhotosProfil, VisibiliteEnfants } from '@apps-famille/famille';

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

// "Mon foyer" : la maison où l'on vit (un seul foyer par personne), avec les
// personnes inscrites qui la partagent, et les familles dont il fait partie.
function CarteFoyer({ utilisateurId }: { utilisateurId: string }) {
  const { foyer, familles, rafraichirFoyer } = useAuth();
  const [membres, setMembres] = useState<MembreFoyer[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState<string | null>(null);
  const idFoyer = foyer?.id ?? null;

  const charger = useCallback(async () => {
    if (!idFoyer) return;
    setErreur(null);
    try {
      setMembres(await listerMembresFoyer(idFoyer));
    } catch (e) {
      setErreur(extraireMessageErreur(e, 'Membres indisponibles.'));
    }
  }, [idFoyer]);

  useFocusEffect(
    useCallback(() => {
      charger();
    }, [charger])
  );

  if (!foyer) return null;

  const moi = membres?.find((m) => m.utilisateur_id === utilisateurId);
  // Mêmes règles que la base (famille.retirer_du_foyer) : un administrateur
  // ou le créateur retire un autre membre, jamais le créateur.
  const peutRetirer = foyer.cree_par === utilisateurId || moi?.role === 'administrateur';
  const dernierMembre = (membres?.length ?? 0) <= 1;

  const nomMembre = (m: MembreFoyer) => {
    const nom = m.prenom?.trim() || 'Prénom non renseigné';
    return m.utilisateur_id === utilisateurId ? `${nom} (vous)` : nom;
  };

  const executer = async (cle: string, action: () => Promise<void>, messageErreur: string) => {
    setErreur(null);
    setEnCours(cle);
    try {
      await action();
    } catch (e) {
      setErreur(extraireMessageErreur(e, messageErreur));
    } finally {
      setEnCours(null);
    }
  };

  const confirmerRetrait = (m: MembreFoyer) => {
    const nom = m.prenom?.trim() || 'cette personne';
    alerte(
      `Retirer ${nom} du foyer « ${foyer.nom} » ?`,
      `${nom} restera dans la famille et choisira un autre foyer (ou créera le sien) à sa prochaine ouverture de l'app. Les recettes et listes de courses restent dans votre foyer.`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Retirer',
          style: 'destructive',
          onPress: () =>
            executer(
              m.utilisateur_id,
              async () => {
                await retirerDuFoyer(m.utilisateur_id);
                await charger();
              },
              'Impossible de retirer cette personne.'
            ),
        },
      ]
    );
  };

  const confirmerDepart = () => {
    alerte(
      `Quitter le foyer « ${foyer.nom} » ?`,
      dernierMembre
        ? "Vous êtes le dernier membre : le foyer restera vide, avec ses recettes, et pourra être rejoint de nouveau. Vous restez dans la famille et choisirez ensuite un autre foyer ou créerez le vôtre."
        : "Vous restez dans la famille et choisirez ensuite un autre foyer ou créerez le vôtre. Les recettes et listes de courses restent dans ce foyer.",
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Quitter',
          style: 'destructive',
          onPress: () =>
            executer(
              'quitter',
              async () => {
                await quitterFoyer();
                // Sans foyer, l'app passe à l'écran « Choisissez votre foyer ».
                await rafraichirFoyer();
              },
              'Impossible de quitter le foyer.'
            ),
        },
      ]
    );
  };

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitre}>Mon foyer : {foyer.nom}</Text>
      <Text style={styles.aide}>
        La maison où vous vivez : ses membres partagent les recettes et les listes de courses.
      </Text>
      {membres === null && !erreur ? (
        <ActivityIndicator color={theme.colors.accent} />
      ) : (
        <View style={styles.listeMembres}>
          {(membres ?? []).map((m) => {
            const retirable = peutRetirer && m.utilisateur_id !== utilisateurId && m.utilisateur_id !== foyer.cree_par;
            return (
              <View key={m.utilisateur_id} style={styles.ligneMembre}>
                <Avatar utilisateurId={m.utilisateur_id} prenom={m.prenom} taille={28} />
                <Text style={[styles.reglageLibelle, styles.flex1]}>
                  {nomMembre(m)}
                  {m.role === 'administrateur' ? <Text style={styles.aide}>  administrateur</Text> : null}
                </Text>
                {retirable &&
                  (enCours === m.utilisateur_id ? (
                    <ActivityIndicator color={theme.colors.accent} />
                  ) : (
                    <Pressable
                      onPress={() => confirmerRetrait(m)}
                      disabled={enCours !== null}
                      hitSlop={8}
                      accessibilityRole="button"
                      accessibilityLabel={`Retirer ${m.prenom ?? 'ce membre'} du foyer`}
                    >
                      <Text style={styles.lienDiscret}>Retirer</Text>
                    </Pressable>
                  ))}
              </View>
            );
          })}
        </View>
      )}
      {familles.length > 0 && (
        <Text style={styles.aide}>
          {familles.length > 1 ? 'Fait partie des familles ' : 'Fait partie de la famille '}
          {familles.map((f) => f.nom).join(' et ')}.
        </Text>
      )}
      {erreur && <Text style={styles.erreur}>{erreur}</Text>}
      <Pressable onPress={confirmerDepart} disabled={enCours !== null} accessibilityRole="button">
        {enCours === 'quitter' ? (
          <ActivityIndicator color={theme.colors.accent} />
        ) : (
          <Text style={styles.lienDiscret}>Quitter ce foyer</Text>
        )}
      </Pressable>
    </View>
  );
}

// "Mes familles" : famille active (commune à toutes les apps), rejoindre ou
// créer une autre famille, quitter une famille. Un foyer peut appartenir à
// plusieurs familles : rejoindre ou quitter une famille concerne TOUT le foyer.
function CarteFamilles() {
  const { familles, foyer, changerFamille, rafraichirFoyer } = useAuth();
  const [mode, setMode] = useState<'rejoindre' | 'creer' | null>(null);
  const [saisie, setSaisie] = useState('');
  const [enCours, setEnCours] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const executer = async (action: () => Promise<unknown>, messageErreur: string) => {
    setEnCours(true);
    setMessage(null);
    try {
      await action();
      await rafraichirFoyer();
      setMode(null);
      setSaisie('');
    } catch (e) {
      setMessage(extraireMessageErreur(e, messageErreur));
    } finally {
      setEnCours(false);
    }
  };

  const nomFoyer = foyer ? `« ${foyer.nom} »` : null;

  const valider = () => {
    const texte = saisie.trim();
    if (!texte) return;
    if (mode === 'rejoindre') {
      const lancer = () => executer(() => rejoindreAvecCode(texte), 'Code invalide.');
      if (nomFoyer) {
        alerte(
          'Rejoindre une autre famille',
          `Tout votre foyer ${nomFoyer} rejoindra cette famille : ses membres y verront vos recettes, et vous les leurs.`,
          [
            { text: 'Annuler', style: 'cancel' },
            { text: 'Rejoindre', onPress: lancer },
          ]
        );
      } else {
        lancer();
      }
    } else if (mode === 'creer') {
      executer(() => creerFamille(texte), 'Impossible de créer la famille.');
    }
  };

  const confirmerDepart = (id: string, nom: string) => {
    alerte(
      `Quitter la famille ${nom} ?`,
      nomFoyer
        ? `Tout votre foyer ${nomFoyer} quittera cette famille. Pour y revenir, il faudra un nouveau code.`
        : 'Pour y revenir, il faudra un nouveau code.',
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Quitter', style: 'destructive', onPress: () => executer(() => quitterFamille(id), 'Impossible de quitter la famille.') },
      ]
    );
  };

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitre}>{familles.length > 1 ? 'Mes familles' : 'Ma famille'}</Text>
      {familles.length > 1 && (
        <Text style={styles.aide}>
          La famille affichée est la même dans toutes les applications de la famille.
        </Text>
      )}
      {familles.map((f) => (
        <View key={f.id} style={[styles.ligneTheme, f.active && familles.length > 1 && styles.ligneThemeActive]}>
          <Pressable
            style={styles.reglageTextes}
            onPress={() => !f.active && executer(() => changerFamille(f.id), 'Changement impossible.')}
            disabled={enCours || f.active}
            accessibilityRole="radio"
            accessibilityState={{ selected: f.active }}
          >
            <Text style={styles.reglageLibelle}>Famille {f.nom}</Text>
            {familles.length > 1 && (
              <Text style={styles.aide}>{f.active ? 'Affichée' : 'Toucher pour l’afficher'}</Text>
            )}
          </Pressable>
          {familles.length > 1 && (
            <Pressable onPress={() => confirmerDepart(f.id, f.nom)} disabled={enCours} hitSlop={8}>
              <Text style={styles.lienDiscret}>Quitter</Text>
            </Pressable>
          )}
        </View>
      ))}

      {mode ? (
        <>
          <TextInput
            style={styles.champ}
            placeholder={mode === 'rejoindre' ? 'Code famille (6 caractères)' : 'Nom de la nouvelle famille'}
            placeholderTextColor={theme.colors.textMuted}
            value={saisie}
            onChangeText={(t) => {
              setSaisie(t);
              setMessage(null);
            }}
            autoCapitalize={mode === 'rejoindre' ? 'characters' : 'words'}
            autoFocus
            onSubmitEditing={valider}
          />
          <Pressable style={styles.bouton} onPress={valider} disabled={enCours || !saisie.trim()}>
            {enCours ? (
              <ActivityIndicator color={theme.colors.background} />
            ) : (
              <Text style={styles.boutonTexte}>{mode === 'rejoindre' ? 'Rejoindre' : 'Créer'}</Text>
            )}
          </Pressable>
          <Pressable
            onPress={() => {
              setMode(null);
              setSaisie('');
              setMessage(null);
            }}
          >
            <Text style={[styles.lienDiscret, styles.centre]}>Annuler</Text>
          </Pressable>
        </>
      ) : (
        <View style={styles.ligneLiens}>
          <Pressable onPress={() => setMode('rejoindre')}>
            <Text style={styles.lien}>Rejoindre une autre famille</Text>
          </Pressable>
          <Pressable onPress={() => setMode('creer')}>
            <Text style={styles.lien}>Créer une autre famille</Text>
          </Pressable>
        </View>
      )}
      {enCours && !mode && <ActivityIndicator color={theme.colors.accent} />}
      {message && <Text style={styles.erreur}>{message}</Text>}
    </View>
  );
}

// Écran "Profil" : familles, foyer, code d'invitation, déconnexion.
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
        {foyer && <Text style={styles.surTitre}>Foyer</Text>}
        <Text style={styles.titre}>{foyer?.nom ?? 'Mon profil'}</Text>
        {famille && (
          <Text style={styles.famille}>
            <Text style={styles.libelle}>Famille active : </Text>
            {famille.nom}
          </Text>
        )}
        <Text style={styles.email}>{session?.user.email}</Text>
      </View>

      {session && <CartePrenom utilisateurId={session.user.id} />}

      {session && foyer && (
        <View style={styles.section}>
          <PhotosProfil polices={{ titre: theme.fontTitle, corps: theme.fontBody, gras: theme.fontBodyBold }} />
        </View>
      )}

      {foyer && (
        <VisibiliteEnfants
          style={styles.section}
          polices={{ titre: theme.fontTitle, corps: theme.fontBody, gras: theme.fontBodyBold }}
        />
      )}

      {session && foyer && <CarteFoyer utilisateurId={session.user.id} />}

      {famille && <CarteFamilles />}

      {famille && (
        <CarteCode
          // Rechargé quand la famille active change (le code est celui de
          // la famille active).
          key={famille.id}
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
  surTitre: {
    fontFamily: theme.fontBody,
    fontSize: 13,
    color: theme.colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 2,
  },
  libelle: {
    fontFamily: theme.fontBody,
    color: theme.colors.textMuted,
  },
  listeMembres: {
    gap: 4,
  },
  ligneMembre: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  flex1: {
    flex: 1,
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
  lien: {
    fontFamily: theme.fontBody,
    fontSize: 15,
    color: theme.colors.accent,
    textDecorationLine: 'underline',
  },
  lienDiscret: {
    fontFamily: theme.fontBody,
    fontSize: 13,
    color: theme.colors.textMuted,
    textDecorationLine: 'underline',
  },
  ligneLiens: {
    gap: theme.spacing.sm,
  },
  centre: {
    textAlign: 'center',
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
