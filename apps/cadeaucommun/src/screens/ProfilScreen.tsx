import React, { useCallback, useState } from 'react';
import { View, Text, TextInput, ScrollView, Pressable, Share } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { theme, creerStylesThemes, THEMES } from '../theme/theme';
import { useAuth } from '../contexts/AuthContext';
import { usePreferences } from '../contexts/PreferencesContext';
import { extraireMessageErreur, formaterExpiration, obtenirCodeInvitation } from '@apps-famille/famille';
import {
  ajouterPersonneSansCompte,
  formaterDate,
  lireDateSaisie,
  listerPersonnes,
  type Personne,
} from '../services/wishlist';
import { Bouton } from '../components/ui';

// Profil : famille affichée (commune à toutes les apps), code d'invitation,
// personnes sans compte du foyer, thème de couleurs, déconnexion.
export default function ProfilScreen() {
  const { session, famille, familles, foyer, changerFamille, deconnexion } = useAuth();
  const { themeId, definirTheme } = usePreferences();
  const [personnes, setPersonnes] = useState<Personne[]>([]);
  const [prenom, setPrenom] = useState('');
  const [naissance, setNaissance] = useState('');
  const [enCours, setEnCours] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const charger = useCallback(async () => {
    if (!foyer) return;
    try {
      setPersonnes(await listerPersonnes([foyer.id]));
    } catch {
      setPersonnes([]);
    }
  }, [foyer]);

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

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.contenu} keyboardShouldPersistTaps="handled">
      <View>
        <Text style={styles.titre}>{foyer?.nom ?? 'Mon foyer'}</Text>
        <Text style={styles.detail}>{session?.user.email}</Text>
      </View>

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
        <Text style={styles.sectionTitre}>Personnes sans compte</Text>
        <Text style={styles.aide}>
          Un enfant, un bébé ou un grand-parent sans téléphone : ajoutez-le à votre foyer pour lui créer des listes.
        </Text>
        {sansCompte.map((p) => (
          <Text key={p.id} style={styles.personne}>
            {p.prenom}
            {p.date_naissance ? ` · né(e) le ${formaterDate(p.date_naissance)}` : ''}
          </Text>
        ))}
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
  personne: { fontFamily: theme.fontBodyBold, fontSize: 15, color: theme.colors.text },
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
  erreur: { fontFamily: theme.fontBody, fontSize: 14, color: theme.colors.warning },
}));
