import React, { useCallback, useState } from 'react';
import { View, Text, TextInput, ScrollView, Pressable, Share } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { theme, creerStylesThemes, THEMES } from '../theme/theme';
import { useAuth } from '../contexts/AuthContext';
import { usePreferences } from '../contexts/PreferencesContext';
import {
  definirMonPrenom,
  extraireMessageErreur,
  formaterExpiration,
  listerMembresFoyer,
  obtenirCodeInvitation,
  obtenirMonPrenom,
  quitterFoyer,
  retirerDuFoyer,
  type MembreFoyer,
} from '@apps-famille/famille';
import { Avatar, PhotosProfil } from '@apps-famille/famille';
import { alerte } from '../utils/alerte';
import {
  ajouterPersonneSansCompte,
  formaterDate,
  lireDateSaisie,
  listerPersonnes,
  supprimerPersonne,
  type Personne,
} from '../services/wishlist';
import { Bouton } from '../components/ui';

// Profil : famille affichée (commune à toutes les apps), code d'invitation,
// personnes sans compte du foyer, thème de couleurs, déconnexion.
export default function ProfilScreen() {
  const { session, famille, familles, foyer, changerFamille, deconnexion, rafraichirFoyer } = useAuth();
  const { themeId, definirTheme } = usePreferences();
  const [personnes, setPersonnes] = useState<Personne[]>([]);
  const [prenom, setPrenom] = useState('');
  const [naissance, setNaissance] = useState('');
  const [enCours, setEnCours] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [monPrenom, setMonPrenom] = useState('');
  const [prenomEnregistre, setPrenomEnregistre] = useState<string | null>(null);
  const [membres, setMembres] = useState<MembreFoyer[]>([]);

  const charger = useCallback(async () => {
    if (!foyer || !session) return;
    try {
      const [p, moi, m] = await Promise.all([
        listerPersonnes([foyer.id]),
        obtenirMonPrenom(session.user.id),
        listerMembresFoyer(foyer.id),
      ]);
      setPersonnes(p);
      setMembres(m);
      setPrenomEnregistre(moi);
      setMonPrenom(moi ?? '');
    } catch {
      setPersonnes([]);
    }
  }, [foyer, session]);

  useFocusEffect(
    useCallback(() => {
      charger();
    }, [charger])
  );

  const executer = async (cle: string, action: () => Promise<unknown>, erreur: string) => {
    setMessage(null);
    setEnCours(cle);
    try {
      await action();
    } catch (e) {
      setMessage(extraireMessageErreur(e, erreur));
    } finally {
      setEnCours(null);
    }
  };

  const partagerCode = () =>
    executer(
      'code',
      async () => {
        const invitation = await obtenirCodeInvitation('famille');
        await Share.share({
          message: `Rejoins la famille "${famille?.nom}" sur CadeauCommun (ou Recettes familiales) avec le code : ${invitation.code} (${formaterExpiration(invitation.expire_le)}).`,
        });
      },
      'Code indisponible.'
    );

  const ajouterPersonne = () => {
    if (!foyer || !prenom.trim()) return;
    const iso = naissance.trim() ? lireDateSaisie(naissance) : null;
    if (naissance.trim() && !iso) {
      setMessage('Date de naissance attendue au format JJ/MM/AAAA.');
      return;
    }
    executer(
      'personne',
      async () => {
        await ajouterPersonneSansCompte(foyer.id, prenom, iso);
        setPrenom('');
        setNaissance('');
        await charger();
      },
      'Ajout impossible.'
    );
  };

  const sansCompte = personnes.filter((p) => !p.utilisateur_id);
  const avecCompte = personnes.filter((p) => p.utilisateur_id && p.utilisateur_id !== session?.user.id);

  // Mêmes règles que la base (famille.retirer_du_foyer) : un administrateur
  // ou le créateur retire un autre membre avec compte, jamais le créateur.
  const moiMembre = membres.find((m) => m.utilisateur_id === session?.user.id);
  const peutRetirerMembres = !!foyer && (foyer.cree_par === session?.user.id || moiMembre?.role === 'administrateur');
  const dernierMembre = membres.length <= 1;

  const retirerMembre = (p: Personne) =>
    alerte(
      `Retirer ${p.prenom} du foyer ?`,
      `${p.prenom} restera dans la famille, avec ses listes, et choisira un autre foyer (ou créera le sien) à sa prochaine ouverture de l'app.`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Retirer',
          style: 'destructive',
          onPress: () =>
            executer(
              p.id,
              async () => {
                await retirerDuFoyer(p.utilisateur_id!);
                await charger();
              },
              'Impossible de retirer cette personne.'
            ),
        },
      ]
    );

  const quitterMonFoyer = () =>
    alerte(
      `Quitter le foyer « ${foyer?.nom} » ?`,
      dernierMembre
        ? 'Vous êtes le dernier membre : le foyer restera vide et pourra être rejoint de nouveau. Vous restez dans la famille, avec vos listes, et choisirez ensuite un autre foyer ou créerez le vôtre.'
        : 'Vous restez dans la famille, avec vos listes, et choisirez ensuite un autre foyer ou créerez le vôtre.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Quitter',
          style: 'destructive',
          onPress: () =>
            executer(
              'quitter-foyer',
              async () => {
                await quitterFoyer();
                await rafraichirFoyer();
              },
              'Impossible de quitter le foyer.'
            ),
        },
      ]
    );

  const enregistrerPrenom = () =>
    executer(
      'prenom',
      async () => {
        await definirMonPrenom(session!.user.id, monPrenom);
        setPrenomEnregistre(monPrenom.trim());
      },
      'Impossible d’enregistrer le prénom.'
    );

  const retirerPersonne = (p: Personne) =>
    alerte(`Retirer ${p.prenom} du foyer ?`, 'Ses listes de souhaits seront supprimées.', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Retirer',
        style: 'destructive',
        onPress: () =>
          executer(
            p.id,
            async () => {
              await supprimerPersonne(p.id);
              await charger();
            },
            'Impossible de retirer cette personne.'
          ),
      },
    ]);

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.contenu} keyboardShouldPersistTaps="handled">
      <View>
        <Text style={styles.titre}>{prenomEnregistre || 'Mon profil'}</Text>
        <Text style={styles.detail}>
          Connecté en tant que {prenomEnregistre || 'utilisateur sans prénom'} · {session?.user.email}
        </Text>
        {foyer && <Text style={styles.detail}>Foyer : {foyer.nom}</Text>}
        {famille && <Text style={styles.detail}>Famille affichée : {famille.nom}</Text>}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitre}>Mon prénom</Text>
        <Text style={styles.aide}>
          Affiché sur vos listes (« La liste de … ») et vos idées, dans toutes les apps de la famille.
        </Text>
        <TextInput
          style={styles.champ}
          value={monPrenom}
          onChangeText={setMonPrenom}
          placeholder="Prénom ou surnom"
          placeholderTextColor={theme.colors.textMuted}
          accessibilityLabel="Mon prénom"
        />
        {monPrenom.trim() !== (prenomEnregistre ?? '') && monPrenom.trim().length > 0 && (
          <Bouton titre="Enregistrer" onPress={enregistrerPrenom} enCours={enCours === 'prenom'} />
        )}
      </View>

      {foyer && (
        <View style={styles.section}>
          <PhotosProfil polices={{ titre: theme.fontTitle, corps: theme.fontBody, gras: theme.fontBodyBold }} />
        </View>
      )}

      <View style={styles.section}>
        <Text style={styles.sectionTitre}>{familles.length > 1 ? 'Famille affichée' : 'Ma famille'}</Text>
        {familles.length > 1 && (
          <Text style={styles.aide}>Le choix vaut aussi pour l'app Recettes familiales.</Text>
        )}
        {familles.map((f) => (
          <Pressable
            key={f.id}
            style={[styles.choix, f.active && familles.length > 1 && styles.choixActif]}
            onPress={() => !f.active && executer(f.id, () => changerFamille(f.id), 'Changement impossible.')}
            disabled={f.active || enCours !== null}
            accessibilityRole="radio"
            accessibilityState={{ selected: f.active }}
          >
            <Text style={styles.choixTexte}>Famille {f.nom}</Text>
            {f.active && familles.length > 1 && <Ionicons name="checkmark" size={20} color={theme.colors.accent} />}
          </Pressable>
        ))}
        {famille && (
          <Bouton variante="contour" titre="Inviter un proche (code famille)" onPress={partagerCode} enCours={enCours === 'code'} />
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitre}>{foyer ? `Mon foyer : ${foyer.nom}` : 'Mon foyer'}</Text>
        <Text style={styles.aide}>
          Un adulte (votre conjoint…) crée son propre compte puis saisit le code famille (« Inviter un proche »
          ci-dessus) et choisit votre foyer. Un enfant ou un bébé sans compte s'ajoute ici : vous remplirez ses listes à
          sa place.
        </Text>
        {session && (
          <View style={styles.lignePersonne}>
            <Avatar utilisateurId={session.user.id} prenom={prenomEnregistre} taille={28} />
            <Text style={styles.personne}>{prenomEnregistre || 'Vous'}</Text>
            <Text style={styles.aide}>vous</Text>
          </View>
        )}
        {avecCompte.map((p) => (
          <View key={p.id} style={styles.lignePersonne}>
            <Avatar personneId={p.id} prenom={p.prenom} taille={28} />
            <Text style={styles.personne}>{p.prenom || 'Sans prénom'}</Text>
            {peutRetirerMembres && p.utilisateur_id !== foyer?.cree_par ? (
              <Pressable
                onPress={() => retirerMembre(p)}
                disabled={enCours !== null}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={`Retirer ${p.prenom} du foyer`}
              >
                <Text style={styles.lienDiscret}>Retirer</Text>
              </Pressable>
            ) : (
              <Text style={styles.aide}>a son compte</Text>
            )}
          </View>
        ))}
        {sansCompte.map((p) => (
          <View key={p.id} style={styles.lignePersonne}>
            <Avatar personneId={p.id} prenom={p.prenom} taille={28} />
            <Text style={styles.personne}>
              {p.prenom}
              {p.date_naissance ? ` · ${formaterDate(p.date_naissance)}` : ''}
            </Text>
            <Pressable onPress={() => retirerPersonne(p)} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Retirer ${p.prenom}`}>
              <Text style={styles.lienDiscret}>Retirer</Text>
            </Pressable>
          </View>
        ))}
        {familles.length > 0 && (
          <Text style={styles.aide}>
            {familles.length > 1 ? 'Fait partie des familles ' : 'Fait partie de la famille '}
            {familles.map((f) => f.nom).join(' et ')}.
          </Text>
        )}
        <Text style={styles.sousSection}>Ajouter une personne sans compte</Text>
        <TextInput
          style={styles.champ}
          value={prenom}
          onChangeText={setPrenom}
          placeholder="Prénom"
          placeholderTextColor={theme.colors.textMuted}
          accessibilityLabel="Prénom de la personne"
        />
        <TextInput
          style={styles.champ}
          value={naissance}
          onChangeText={setNaissance}
          placeholder="Date de naissance (JJ/MM/AAAA, facultatif)"
          placeholderTextColor={theme.colors.textMuted}
          keyboardType="numbers-and-punctuation"
          accessibilityLabel="Date de naissance"
        />
        <Bouton titre="Ajouter" onPress={ajouterPersonne} enCours={enCours === 'personne'} desactive={!prenom.trim()} />
        {foyer && (
          <Pressable onPress={quitterMonFoyer} disabled={enCours !== null} accessibilityRole="button" style={styles.lienQuitter}>
            <Text style={styles.lienDiscret}>{enCours === 'quitter-foyer' ? 'Départ en cours…' : 'Quitter ce foyer'}</Text>
          </Pressable>
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitre}>Thème de couleurs</Text>
        <Text style={styles.aide}>Les mêmes que dans Recettes familiales. Propre à ce téléphone.</Text>
        {THEMES.map((t) => {
          const actif = t.id === themeId;
          return (
            <Pressable
              key={t.id}
              style={[styles.choix, actif && styles.choixActif]}
              onPress={() => definirTheme(t.id)}
              accessibilityRole="radio"
              accessibilityState={{ selected: actif }}
            >
              <View style={[styles.apercu, { backgroundColor: t.palette.background, borderColor: t.palette.border }]}>
                <View style={[styles.pastille, { backgroundColor: t.palette.surface }]} />
                <View style={[styles.pastille, { backgroundColor: t.palette.accent }]} />
                <View style={[styles.pastille, { backgroundColor: t.palette.selection }]} />
              </View>
              <View style={styles.themeTextes}>
                <Text style={styles.choixTexte}>{t.nom}</Text>
                <Text style={styles.aide} numberOfLines={1}>{t.ambiance}</Text>
              </View>
              {actif && <Ionicons name="checkmark" size={20} color={theme.colors.accent} />}
            </Pressable>
          );
        })}
      </View>

      {message && <Text style={styles.erreur}>{message}</Text>}
      <Bouton variante="contour" titre="Se déconnecter" onPress={deconnexion} />
    </ScrollView>
  );
}

const styles = creerStylesThemes(() => ({
  flex: { flex: 1, backgroundColor: theme.colors.background },
  contenu: { padding: theme.spacing.md, gap: theme.spacing.md, paddingBottom: theme.spacing.xl },
  titre: { fontFamily: theme.fontTitle, fontSize: 28, color: theme.colors.accent },
  detail: { fontFamily: theme.fontBody, fontSize: 14, color: theme.colors.textMuted },
  section: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radii.lg,
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  sectionTitre: { fontFamily: theme.fontBodyBold, fontSize: 17, color: theme.colors.text },
  aide: { fontFamily: theme.fontBody, fontSize: 13, color: theme.colors.textMuted },
  choix: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 6,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  choixActif: { borderColor: theme.colors.accent, backgroundColor: theme.colors.selectionTransparent },
  choixTexte: { flex: 1, fontFamily: theme.fontBody, fontSize: 15, color: theme.colors.text },
  themeTextes: { flex: 1, gap: 2 },
  apercu: { flexDirection: 'row', gap: 3, padding: 5, borderRadius: 4, borderWidth: 1 },
  pastille: { width: 12, height: 24, borderRadius: 3 },
  personne: { flex: 1, fontFamily: theme.fontBodyBold, fontSize: 15, color: theme.colors.text },
  lignePersonne: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, minHeight: 36 },
  sousSection: { fontFamily: theme.fontBodyBold, fontSize: 14, color: theme.colors.text, marginTop: theme.spacing.sm },
  lienDiscret: { fontFamily: theme.fontBody, fontSize: 14, color: theme.colors.textMuted, textDecorationLine: 'underline' },
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
  lienQuitter: { alignSelf: 'center', marginTop: theme.spacing.sm },
  erreur: { fontFamily: theme.fontBody, fontSize: 14, color: theme.colors.warning },
}));
