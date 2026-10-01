import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Modal, Platform, Pressable, Text, View } from 'react-native';
import { colors, radii, spacing } from '@apps-famille/theme';
import { useAuth } from './AuthContext';
import { obtenirAppCourante } from './appsFamille';
import {
  accorderConnexion,
  lireLienConnexion,
  recevoirConnexion,
  refuserConnexion,
  type LienConnexion,
} from './connexionPartagee';

export type PolicesFamille = { titre?: string; corps?: string; gras?: string };

type Demande = Extract<LienConnexion, { genre: 'demande' }>;

// À placer une fois, à l'intérieur de <AuthProvider>, dans chaque app.
// Écoute les liens de connexion entre apps (voir connexionPartagee.ts) :
//  - une autre app demande la connexion → fenêtre « Autoriser ? » ;
//  - une autre app répond à notre demande → ouverture de la session, ou
//    message expliquant pourquoi ça n'a pas marché.
// Sans effet sur le web (le site commun partage déjà la connexion).
export function PassageConnexion({ polices = {} }: { polices?: PolicesFamille }) {
  const { session, chargement } = useAuth();
  const [lien, setLien] = useState<LienConnexion | null>(null);
  const [demande, setDemande] = useState<Demande | null>(null);
  const [enCours, setEnCours] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // Liens reçus : au démarrage (app lancée par le lien) et ensuite.
  useEffect(() => {
    if (Platform.OS === 'web') return;
    Linking.getInitialURL()
      .then((url) => setLien(lireLienConnexion(url)))
      .catch(() => {});
    const abonnement = Linking.addEventListener('url', ({ url }) => setLien(lireLienConnexion(url)));
    return () => abonnement.remove();
  }, []);

  // Traités une fois la session connue (connectée ou non).
  useEffect(() => {
    if (!lien || chargement) return;
    setLien(null);
    if (lien.genre === 'demande') {
      setMessage(null);
      setDemande(lien);
      return;
    }
    setEnCours(true);
    recevoirConnexion(lien)
      .then((erreur) => setMessage(erreur))
      .catch(() => setMessage('La connexion n’a pas pu être ouverte. Réessayez.'))
      .finally(() => setEnCours(false));
  }, [lien, chargement]);

  const fermer = useCallback(() => {
    setDemande(null);
    setMessage(null);
  }, []);

  const autoriser = async () => {
    if (!demande) return;
    setEnCours(true);
    setMessage(null);
    try {
      await accorderConnexion(demande);
      setDemande(null);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Impossible de transmettre la connexion.');
    } finally {
      setEnCours(false);
    }
  };

  const refuser = async (raison: 'refus' | 'non_connecte') => {
    if (demande) await refuserConnexion(demande, raison);
    fermer();
  };

  const visible = demande !== null || message !== null || (enCours && demande === null);
  if (!visible) return null;

  const moi = obtenirAppCourante();
  const s = styles(polices);
  const email = session?.user.email ?? '';

  return (
    <Modal transparent animationType="fade" visible onRequestClose={() => (demande ? refuser('refus') : fermer())}>
      <View style={s.fond}>
        <View style={s.carte} accessibilityViewIsModal>
          {demande && session ? (
            <>
              <Text style={s.titre}>Connecter {demande.demandeur.nom} ?</Text>
              <Text style={s.texte}>
                {demande.demandeur.nom} demande à utiliser votre compte{email ? ` ${email}` : ''}. Vous n’aurez pas
                besoin de vous y reconnecter.
              </Text>
              {message && <Text style={s.erreur}>{message}</Text>}
              <Bouton titre="Autoriser" principal enCours={enCours} onPress={autoriser} s={s} />
              <Bouton titre="Refuser" onPress={() => refuser('refus')} s={s} />
            </>
          ) : demande ? (
            <>
              <Text style={s.titre}>Pas encore connecté</Text>
              <Text style={s.texte}>
                {demande.demandeur.nom} demande votre compte, mais vous n’êtes pas connecté à{' '}
                {moi?.nom ?? 'cette app'} non plus. Connectez-vous dans l’une des deux avec votre email.
              </Text>
              <Bouton titre="Retour" principal onPress={() => refuser('non_connecte')} s={s} />
            </>
          ) : enCours ? (
            <View style={s.attente}>
              <ActivityIndicator color={colors.accent} />
              <Text style={s.texte}>Connexion…</Text>
            </View>
          ) : (
            <>
              <Text style={s.titre}>Connexion</Text>
              <Text style={s.texte}>{message}</Text>
              <Bouton titre="OK" principal onPress={fermer} s={s} />
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

function Bouton({
  titre,
  onPress,
  principal,
  enCours,
  s,
}: {
  titre: string;
  onPress: () => void;
  principal?: boolean;
  enCours?: boolean;
  s: ReturnType<typeof styles>;
}) {
  return (
    <Pressable
      onPress={enCours ? undefined : onPress}
      accessibilityRole="button"
      accessibilityState={{ busy: !!enCours }}
      style={({ pressed }) => [s.bouton, principal && s.boutonPrincipal, pressed && { opacity: 0.8 }]}
    >
      {enCours ? (
        <ActivityIndicator color={colors.background} />
      ) : (
        <Text style={[s.boutonTexte, principal && s.boutonTextePrincipal]}>{titre}</Text>
      )}
    </Pressable>
  );
}

// Styles recalculés à chaque affichage : suivent le thème choisi dans l'app.
const styles = (p: PolicesFamille) => ({
  fond: {
    flex: 1,
    backgroundColor: colors.voileFort,
    justifyContent: 'center' as const,
    padding: spacing.lg,
  },
  carte: {
    backgroundColor: colors.background,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radii.lg,
    padding: spacing.lg,
    gap: spacing.sm,
    maxWidth: 420,
    width: '100%' as const,
    alignSelf: 'center' as const,
  },
  titre: { fontFamily: p.titre, fontSize: 22, color: colors.text },
  texte: { fontFamily: p.corps, fontSize: 16, color: colors.text, lineHeight: 22 },
  erreur: { fontFamily: p.corps, fontSize: 14, color: colors.warning },
  attente: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.sm },
  bouton: {
    minHeight: 48,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.accent,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingHorizontal: spacing.md,
  },
  boutonPrincipal: { backgroundColor: colors.accent },
  boutonTexte: { fontFamily: p.gras, fontSize: 16, color: colors.accent },
  boutonTextePrincipal: { color: colors.background },
});
