import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable, ActivityIndicator, ScrollView } from 'react-native';
import { theme, creerStylesThemes } from '../../theme/theme';
import { useAuth } from '../../contexts/AuthContext';
import {
  choisirFoyer,
  creerFoyer,
  extraireMessageErreur,
  listerFoyersARejoindre,
  type FoyerARejoindre,
} from '../../services/famille';
import ZoneClavier from '../../components/ZoneClavier';

// Utilisateur membre d'une famille mais sans foyer (il vient de créer sa
// famille, ou de la rejoindre avec le code famille) : il choisit un foyer
// existant de la famille (s'il vit avec des personnes déjà inscrites) ou
// crée le sien.
export default function FoyerScreen() {
  const { famille, rafraichirFoyer, deconnexion } = useAuth();
  const [foyers, setFoyers] = useState<FoyerARejoindre[] | null>(null);
  const [erreurListe, setErreurListe] = useState<string | null>(null);
  const [nomFoyer, setNomFoyer] = useState('');
  // 'creation' ou identifiant du foyer en cours de rejoindre.
  const [enCours, setEnCours] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  // Foyer dont la confirmation est affichée sous sa carte.
  const [aConfirmer, setAConfirmer] = useState<string | null>(null);

  const chargerFoyers = useCallback(async () => {
    setErreurListe(null);
    try {
      setFoyers(await listerFoyersARejoindre());
    } catch (e) {
      setFoyers([]);
      setErreurListe(extraireMessageErreur(e, 'Impossible de charger les foyers de la famille.'));
    }
  }, []);

  useEffect(() => {
    chargerFoyers();
  }, [chargerFoyers]);

  const validerFoyer = async () => {
    if (!nomFoyer.trim()) return;
    setErreur(null);
    setEnCours('creation');
    try {
      await creerFoyer(nomFoyer);
      await rafraichirFoyer();
    } catch (e) {
      setErreur(extraireMessageErreur(e, 'Impossible de créer le foyer.'));
    } finally {
      setEnCours(null);
    }
  };

  const rejoindre = async (f: FoyerARejoindre) => {
    setErreur(null);
    setAConfirmer(null);
    setEnCours(f.id);
    try {
      await choisirFoyer(f.id);
      await rafraichirFoyer();
    } catch (e) {
      setErreur(extraireMessageErreur(e, 'Impossible de rejoindre ce foyer.'));
    } finally {
      setEnCours(null);
    }
  };

  // Un seul foyer par personne : on confirme avant de rejoindre. La
  // confirmation s'affiche DANS l'écran, sous la carte du foyer, et non dans
  // une fenêtre du navigateur (window.confirm) : sur iPhone, ouverte depuis
  // un lien reçu par message (navigateur intégré de WhatsApp, Messenger,
  // Gmail…), cette fenêtre ne s'affiche pas et répond « Annuler » d'office —
  // le bouton semblait ne pas réagir (retour d'un nouveau membre).
  const basculerConfirmation = (f: FoyerARejoindre) => {
    setErreur(null);
    setAConfirmer((actuel) => (actuel === f.id ? null : f.id));
  };

  const detailFoyer = (f: FoyerARejoindre) => {
    const membres = `${f.nb_membres} membre${f.nb_membres > 1 ? 's' : ''}`;
    return f.createur ? `Créé par ${f.createur} · ${membres}` : membres;
  };

  return (
    <ZoneClavier style={styles.flex} sansEnTete>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={styles.surTitre}>Famille</Text>
        <Text style={styles.titre}>{famille?.nom ?? 'Ma famille'}</Text>
        <Text style={styles.sousTitre}>
          Dernière étape : choisissez votre foyer, c'est-à-dire la maison où vous partagez vos
          recettes et vos listes de courses.
        </Text>

        <View style={styles.section}>
          <Text style={styles.sectionTitre}>Rejoindre un foyer existant</Text>
          <Text style={styles.aide}>
            Si vous vivez avec une personne déjà inscrite, choisissez son foyer.
          </Text>
          {foyers === null ? (
            <ActivityIndicator color={theme.colors.accent} />
          ) : foyers.length === 0 ? (
            <Text style={styles.aide}>
              {erreurListe ?? "La famille n'a pas encore de foyer : créez le vôtre ci-dessous."}
            </Text>
          ) : (
            foyers.map((f) => (
              <View key={f.id} style={styles.blocFoyer}>
                <Pressable
                  style={[
                    styles.carteFoyer,
                    aConfirmer === f.id && styles.carteFoyerChoisie,
                    enCours !== null && styles.boutonInactif,
                  ]}
                  onPress={() => basculerConfirmation(f)}
                  disabled={enCours !== null}
                  accessibilityRole="button"
                >
                  <View style={styles.carteFoyerTexte}>
                    <Text style={styles.nomFoyer}>{f.nom}</Text>
                    <Text style={styles.aide}>{detailFoyer(f)}</Text>
                  </View>
                  {enCours === f.id ? (
                    <ActivityIndicator color={theme.colors.accent} />
                  ) : (
                    <Text style={styles.boutonSecondaireTexte}>Rejoindre</Text>
                  )}
                </Pressable>
                {aConfirmer === f.id && enCours === null && (
                  <View style={styles.confirmation}>
                    <Text style={styles.confirmationTexte}>
                      Rejoindre « {f.nom} » ? Vous partagerez les recettes et les listes de courses de ce
                      foyer. Choisissez-le seulement si vous vivez sous le même toit.
                    </Text>
                    <View style={styles.confirmationBoutons}>
                      <Pressable
                        style={[styles.boutonConfirmation, styles.boutonAnnuler]}
                        onPress={() => setAConfirmer(null)}
                        accessibilityRole="button"
                      >
                        <Text style={styles.boutonSecondaireTexte}>Annuler</Text>
                      </Pressable>
                      <Pressable
                        style={[styles.boutonConfirmation, styles.bouton]}
                        onPress={() => rejoindre(f)}
                        accessibilityRole="button"
                      >
                        <Text style={styles.boutonTexte}>Rejoindre</Text>
                      </Pressable>
                    </View>
                  </View>
                )}
              </View>
            ))
          )}
          {erreurListe && (
            <Pressable onPress={chargerFoyers}>
              <Text style={styles.lienTexte}>Réessayer</Text>
            </Pressable>
          )}
        </View>

        <View style={styles.separateur}>
          <View style={styles.trait} />
          <Text style={styles.separateurTexte}>ou</Text>
          <View style={styles.trait} />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitre}>Créer mon foyer</Text>
          <TextInput
            style={styles.champ}
            placeholder="Nom du foyer (ex. Maison de Lyon)"
            placeholderTextColor={theme.colors.textMuted}
            value={nomFoyer}
            onChangeText={setNomFoyer}
            onSubmitEditing={validerFoyer}
          />
          <Pressable
            style={[styles.bouton, (!nomFoyer.trim() || enCours !== null) && styles.boutonInactif]}
            onPress={validerFoyer}
            disabled={!nomFoyer.trim() || enCours !== null}
          >
            {enCours === 'creation' ? (
              <ActivityIndicator color={theme.colors.background} />
            ) : (
              <Text style={styles.boutonTexte}>Créer le foyer</Text>
            )}
          </Pressable>
        </View>

        {erreur && <Text style={styles.erreur}>{erreur}</Text>}

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
  surTitre: {
    fontFamily: theme.fontBody,
    fontSize: 14,
    color: theme.colors.textMuted,
    textAlign: 'center',
    textTransform: 'uppercase',
    letterSpacing: 2,
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
  boutonSecondaireTexte: {
    fontFamily: theme.fontBodyBold,
    fontSize: 16,
    color: theme.colors.accent,
  },
  carteFoyer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    backgroundColor: theme.colors.background,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radii.md,
    padding: theme.spacing.md,
  },
  blocFoyer: {
    gap: theme.spacing.xs,
  },
  carteFoyerChoisie: {
    borderColor: theme.colors.accent,
  },
  confirmation: {
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.xs,
  },
  confirmationTexte: {
    fontFamily: theme.fontBody,
    fontSize: 14,
    color: theme.colors.text,
  },
  confirmationBoutons: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  boutonConfirmation: {
    flex: 1,
    minHeight: 44,
    justifyContent: 'center',
  },
  boutonAnnuler: {
    alignItems: 'center',
    borderRadius: theme.radii.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  carteFoyerTexte: {
    flex: 1,
    gap: 2,
  },
  nomFoyer: {
    fontFamily: theme.fontBodyBold,
    fontSize: 16,
    color: theme.colors.text,
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
