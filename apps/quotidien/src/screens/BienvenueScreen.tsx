import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, TextInput, ScrollView, Pressable } from 'react-native';
import { theme, creerStylesThemes } from '../theme/theme';
import { useAuth } from '../contexts/AuthContext';
import {
  choisirFoyer,
  creerFamille,
  creerFoyer,
  extraireMessageErreur,
  listerFoyersARejoindre,
  rejoindreAvecCode,
  type FoyerARejoindre,
} from '@apps-famille/famille';
import { Bouton } from '../components/ui';

// Première connexion à Quotidien sans famille ni foyer (compte créé ici,
// jamais utilisé dans Cuisine ni CadeauCommun) :
//  1. rejoindre une famille avec un code, ou créer sa famille ;
//  2. choisir un foyer existant de la famille, ou créer le sien.
// Quelqu'un qui utilise déjà une autre app de la famille ne voit jamais cet écran : il
// retrouve directement sa famille.
export default function BienvenueScreen() {
  const { famille, rafraichirFoyer, deconnexion } = useAuth();
  const [code, setCode] = useState('');
  const [nom, setNom] = useState('');
  const [enCours, setEnCours] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [foyers, setFoyers] = useState<FoyerARejoindre[]>([]);
  // Foyer dont la confirmation est affichée sous sa ligne.
  const [aConfirmer, setAConfirmer] = useState<string | null>(null);

  useEffect(() => {
    if (!famille) return;
    listerFoyersARejoindre()
      .then(setFoyers)
      .catch(() => setFoyers([]));
  }, [famille]);

  const executer = useCallback(
    async (cle: string, action: () => Promise<unknown>, messageParDefaut: string) => {
      setErreur(null);
      setEnCours(cle);
      try {
        await action();
        setNom('');
        await rafraichirFoyer();
      } catch (e) {
        setErreur(extraireMessageErreur(e, messageParDefaut));
      } finally {
        setEnCours(null);
      }
    },
    [rafraichirFoyer]
  );

  // Un seul foyer par personne, et rejoindre un foyer revient à partager
  // sa maison : on confirme avant (même règle que l'app Cuisine). La
  // confirmation s'affiche DANS l'écran, sous la ligne du foyer, et non dans
  // une fenêtre du navigateur (window.confirm) : sur iPhone, ouverte depuis
  // un lien reçu par message (navigateur intégré de WhatsApp, Messenger,
  // Gmail…), cette fenêtre ne s'affiche pas et répond « Annuler » d'office —
  // le bouton semblait ne pas réagir (retour d'un nouveau membre).
  const rejoindreFoyer = (f: FoyerARejoindre) => {
    setAConfirmer(null);
    executer(f.id, () => choisirFoyer(f.id), 'Impossible de rejoindre ce foyer.');
  };

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.contenu} keyboardShouldPersistTaps="handled">
      <Text style={styles.titre}>Bienvenue !</Text>

      {!famille ? (
        <>
          <Text style={styles.texte}>
            Pour organiser le quotidien de votre famille, rejoignez votre famille avec le code qu'un proche vous a
            envoyé, ou créez votre famille.
          </Text>
          <View style={styles.carte}>
            <Text style={styles.carteTitre}>J'ai un code famille</Text>
            <TextInput
              style={styles.champ}
              value={code}
              onChangeText={setCode}
              autoCapitalize="characters"
              placeholder="Code à 6 caractères"
              placeholderTextColor={theme.colors.textMuted}
              accessibilityLabel="Code famille"
            />
            <Bouton
              titre="Rejoindre la famille"
              onPress={() => executer('code', () => rejoindreAvecCode(code), 'Code invalide.')}
              enCours={enCours === 'code'}
              desactive={!code.trim()}
            />
          </View>
          <View style={styles.carte}>
            <Text style={styles.carteTitre}>Créer ma famille</Text>
            <TextInput
              style={styles.champ}
              value={nom}
              onChangeText={setNom}
              placeholder="Nom de la famille (ex. Morel)"
              placeholderTextColor={theme.colors.textMuted}
              accessibilityLabel="Nom de la famille"
            />
            <Bouton
              variante="contour"
              titre="Créer la famille"
              onPress={() => executer('famille', () => creerFamille(nom), 'Impossible de créer la famille.')}
              enCours={enCours === 'famille'}
              desactive={!nom.trim()}
            />
          </View>
        </>
      ) : (
        <>
          <Text style={styles.texte}>
            Vous faites partie de la famille {famille.nom}. Dernière étape : votre foyer, c'est-à-dire la
            maison où vous vivez. Si vous vivez avec une personne déjà inscrite, rejoignez son foyer ; sinon,
            créez le vôtre.
          </Text>
          {foyers.length > 0 && (
            <View style={styles.carte}>
              <Text style={styles.carteTitre}>Rejoindre le foyer d'une personne avec qui je vis</Text>
              {foyers.map((f) => (
                <View key={f.id} style={styles.blocFoyer}>
                  <Pressable
                    style={[styles.ligne, aConfirmer === f.id && styles.ligneChoisie]}
                    onPress={() => {
                      setErreur(null);
                      setAConfirmer((actuel) => (actuel === f.id ? null : f.id));
                    }}
                    disabled={enCours !== null}
                    accessibilityRole="button"
                  >
                    <Text style={styles.ligneTitre}>{f.nom}</Text>
                    <Text style={styles.ligneDetail}>
                      {f.nb_membres} membre{f.nb_membres > 1 ? 's' : ''}
                      {f.createur ? ` · créé par ${f.createur}` : ''}
                    </Text>
                  </Pressable>
                  {(aConfirmer === f.id || enCours === f.id) && (
                    <View style={styles.confirmation}>
                      <Text style={styles.ligneDetail}>
                        Choisissez ce foyer seulement si vous vivez sous le même toit que ses membres. Sinon,
                        créez votre propre foyer : vous ferez quand même partie de la famille.
                      </Text>
                      <View style={styles.confirmationBoutons}>
                        <View style={styles.confirmationBouton}>
                          <Bouton
                            variante="contour"
                            titre="Annuler"
                            onPress={() => setAConfirmer(null)}
                            desactive={enCours !== null}
                          />
                        </View>
                        <View style={styles.confirmationBouton}>
                          <Bouton
                            titre="Rejoindre"
                            onPress={() => rejoindreFoyer(f)}
                            enCours={enCours === f.id}
                          />
                        </View>
                      </View>
                    </View>
                  )}
                </View>
              ))}
            </View>
          )}
          <View style={styles.carte}>
            <Text style={styles.carteTitre}>Créer mon foyer</Text>
            <TextInput
              style={styles.champ}
              value={nom}
              onChangeText={setNom}
              placeholder="Nom du foyer (ex. Chez Léa et Paul)"
              placeholderTextColor={theme.colors.textMuted}
              accessibilityLabel="Nom du foyer"
            />
            <Bouton
              titre="Créer le foyer"
              onPress={() => executer('foyer', () => creerFoyer(nom), 'Impossible de créer le foyer.')}
              enCours={enCours === 'foyer'}
              desactive={!nom.trim()}
            />
          </View>
        </>
      )}

      {erreur && <Text style={styles.erreur}>{erreur}</Text>}
      <Bouton variante="discret" titre="Se déconnecter" onPress={deconnexion} />
    </ScrollView>
  );
}

const styles = creerStylesThemes(() => ({
  flex: { flex: 1, backgroundColor: theme.colors.background },
  contenu: { padding: theme.spacing.lg, gap: theme.spacing.md, paddingTop: theme.spacing.xl * 2 },
  titre: { fontFamily: theme.fontTitle, fontSize: 32, color: theme.colors.accent },
  texte: { fontFamily: theme.fontBody, fontSize: 16, color: theme.colors.text, lineHeight: 22 },
  carte: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radii.lg,
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  carteTitre: { fontFamily: theme.fontBodyBold, fontSize: 17, color: theme.colors.text },
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
  ligne: {
    minHeight: 44,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.sm,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    gap: 2,
  },
  ligneChoisie: { borderColor: theme.colors.accent },
  blocFoyer: { gap: theme.spacing.xs },
  confirmation: { gap: theme.spacing.sm, paddingHorizontal: theme.spacing.xs },
  confirmationBoutons: { flexDirection: 'row', gap: theme.spacing.sm },
  confirmationBouton: { flex: 1 },
  ligneTitre: { fontFamily: theme.fontBodyBold, fontSize: 16, color: theme.colors.text },
  ligneDetail: { fontFamily: theme.fontBody, fontSize: 13, color: theme.colors.textMuted },
  erreur: { fontFamily: theme.fontBody, fontSize: 14, color: theme.colors.warning },
}));
