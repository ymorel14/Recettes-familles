import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { theme, creerStylesThemes } from '../theme/theme';
import { useAuth } from '../contexts/AuthContext';
import { Bouton, Chargement } from '../components/ui';
import { alerte } from '../utils/alerte';
import { cleProduit, normaliserTexte } from '../utils/texte';
import { Vignette } from '../components/Photo';
import {
  EMPLACEMENT_AUTRE,
  ENDROITS,
  ajouterAVerifier,
  ajouterEmplacement,
  grouperParEmplacement,
  listerChecklist,
  listerEmplacements,
  photosDuFoyer,
  modifierAVerifier,
  ordonnerEmplacements,
  renommerEmplacement,
  supprimerAVerifier,
  supprimerEmplacement,
  type AVerifier,
} from '../services/courses';

// Checklist du foyer : les articles à contrôler à la maison avant chaque
// course, une seule pour toutes les listes du foyer, rangés par endroit
// (frigo, placards…) pour faire le tour une seule fois. Les emplacements
// sont propres au foyer : on en ajoute, renomme, supprime et range.
export default function ChecklistScreen() {
  const { foyer } = useAuth();
  const [articles, setArticles] = useState<AVerifier[] | null>(null);
  const [libelle, setLibelle] = useState('');
  const [endroit, setEndroit] = useState<string>('Frigo');
  const [deplace, setDeplace] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [emplacements, setEmplacements] = useState<string[]>([...ENDROITS]);
  const [photos, setPhotos] = useState<Map<string, string>>(new Map());
  const [gererEmplacements, setGererEmplacements] = useState(false);
  const [nouvelEmplacement, setNouvelEmplacement] = useState('');
  const [renomme, setRenomme] = useState<{ ancien: string; nom: string } | null>(null);

  const charger = useCallback(async () => {
    if (!foyer) return;
    try {
      const [a, e, ph] = await Promise.all([
        listerChecklist(foyer.id),
        listerEmplacements(foyer.id),
        photosDuFoyer(foyer.id).catch(() => new Map<string, string>()),
      ]);
      setPhotos(ph);
      setArticles(a);
      setEmplacements(e);
      setEndroit((actuel) => (e.includes(actuel) ? actuel : e[0] ?? EMPLACEMENT_AUTRE));
    } catch {
      setMessage('Chargement impossible. Vérifiez votre connexion.');
      setArticles((a) => a ?? []);
    }
  }, [foyer]);

  useFocusEffect(
    useCallback(() => {
      charger();
    }, [charger])
  );

  const parEndroit = useMemo(() => grouperParEmplacement(articles ?? [], emplacements), [articles, emplacements]);
  const nbDans = (e: string) => (articles ?? []).filter((a) => a.endroit === e).length;

  const ajouterUnEmplacement = async () => {
    if (!foyer || !nouvelEmplacement.trim()) return;
    setMessage(null);
    try {
      const nom = await ajouterEmplacement(foyer.id, nouvelEmplacement, emplacements);
      setNouvelEmplacement('');
      setEndroit(nom);
      await charger();
    } catch {
      setMessage('Ajout de l’emplacement impossible.');
    }
  };

  const validerRenommage = async () => {
    if (!foyer || !renomme) return;
    const nom = renomme.nom.trim();
    if (!nom || nom === renomme.ancien) {
      setRenomme(null);
      return;
    }
    if (emplacements.some((e) => e !== renomme.ancien && normaliserTexte(e) === normaliserTexte(nom))) {
      setMessage(`L’emplacement « ${nom} » existe déjà.`);
      return;
    }
    setMessage(null);
    try {
      const propre = await renommerEmplacement(foyer.id, renomme.ancien, nom);
      if (endroit === renomme.ancien) setEndroit(propre);
      setRenomme(null);
      await charger();
    } catch {
      setMessage('Renommage impossible.');
    }
  };

  const supprimerUnEmplacement = (e: string) => {
    const n = nbDans(e);
    alerte(
      `Supprimer l’emplacement « ${e} » ?`,
      n > 0 ? `${n > 1 ? `Ses ${n} articles passent` : 'Son article passe'} dans « ${EMPLACEMENT_AUTRE} ».` : undefined,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: async () => {
            if (!foyer) return;
            try {
              await supprimerEmplacement(foyer.id, e);
              await charger();
            } catch {
              setMessage('Suppression impossible.');
            }
          },
        },
      ]
    );
  };

  const deplacerEmplacement = async (e: string, sens: -1 | 1) => {
    if (!foyer) return;
    const liste = emplacements.filter((x) => x !== EMPLACEMENT_AUTRE);
    const i = liste.indexOf(e);
    const j = i + sens;
    if (i < 0 || j < 0 || j >= liste.length) return;
    [liste[i], liste[j]] = [liste[j], liste[i]];
    const nouvelOrdre = [...liste, EMPLACEMENT_AUTRE];
    setEmplacements(nouvelOrdre);
    await ordonnerEmplacements(foyer.id, liste).catch(() => setMessage('Ordre non enregistré.'));
  };

  const ajouter = async () => {
    if (!foyer || !libelle.trim()) return;
    setEnCours(true);
    setMessage(null);
    try {
      await ajouterAVerifier(foyer.id, libelle, endroit);
      setLibelle('');
      await charger();
    } catch {
      setMessage('Ajout impossible.');
    } finally {
      setEnCours(false);
    }
  };

  const changerEndroit = async (a: AVerifier, nouvel: string) => {
    setDeplace(null);
    setArticles((liste) => (liste ?? []).map((x) => (x.id === a.id ? { ...x, endroit: nouvel } : x)));
    await modifierAVerifier(a.id, { endroit: nouvel }).catch(() => setMessage('Modification non enregistrée.'));
  };

  const retirer = (a: AVerifier) =>
    alerte(`Retirer « ${a.libelle} » de la checklist ?`, undefined, [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Retirer',
        style: 'destructive',
        onPress: async () => {
          setArticles((liste) => (liste ?? []).filter((x) => x.id !== a.id));
          await supprimerAVerifier(a.id).catch(() => setMessage('Suppression impossible.'));
        },
      },
    ]);

  if (articles === null) return <Chargement />;

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.contenu} keyboardShouldPersistTaps="handled">
      <Text style={styles.intro}>
        Avant chaque course, « À la maison » (sur une liste) vous fait passer cette liste article par article : ce qui
        manque s’ajoute à la liste de courses. Une seule checklist pour tout le foyer {foyer?.nom ?? ''}.
      </Text>

      <View style={styles.section}>
        <Text style={styles.titreSection}>Ajouter un article à vérifier</Text>
        <TextInput
          style={styles.champ}
          value={libelle}
          onChangeText={setLibelle}
          onSubmitEditing={ajouter}
          placeholder="Lait, papier toilette, croquettes…"
          placeholderTextColor={theme.colors.textMuted}
          accessibilityLabel="Article à vérifier"
        />
        <View style={styles.puces}>
          {emplacements.map((e) => (
            <Pressable
              key={e}
              onPress={() => setEndroit(e)}
              style={[styles.puce, e === endroit && styles.puceActive]}
              accessibilityRole="radio"
              accessibilityState={{ selected: e === endroit }}
            >
              <Text style={[styles.puceTexte, e === endroit && styles.puceTexteActive]}>{e}</Text>
            </Pressable>
          ))}
        </View>
        <Bouton titre="Ajouter" onPress={ajouter} enCours={enCours} desactive={!libelle.trim()} />
      </View>

      {message && <Text style={styles.erreur}>{message}</Text>}

      {articles.length === 0 && (
        <Text style={styles.aide}>
          La checklist est vide. Ajoutez les produits qu’il faut toujours vérifier : lait, œufs, beurre, papier
          toilette, liquide vaisselle…
        </Text>
      )}

      {parEndroit.map(([nom, liste]) => (
        <View key={nom} style={styles.section}>
          <Text style={styles.endroit}>{nom}</Text>
          {liste.map((a) => (
            <View key={a.id}>
              <View style={styles.ligne}>
                {photos.get(cleProduit(a.libelle)) && (
                  <Vignette chemin={photos.get(cleProduit(a.libelle))} taille={36} legende={a.libelle} />
                )}
                <Text style={styles.libelle}>{a.libelle}</Text>
                <Pressable
                  onPress={() => setDeplace(deplace === a.id ? null : a.id)}
                  hitSlop={8}
                  style={styles.icone}
                  accessibilityRole="button"
                  accessibilityLabel={`Changer l’endroit de ${a.libelle}`}
                >
                  <Ionicons name="swap-horizontal-outline" size={20} color={theme.colors.accent} />
                </Pressable>
                <Pressable
                  onPress={() => retirer(a)}
                  hitSlop={8}
                  style={styles.icone}
                  accessibilityRole="button"
                  accessibilityLabel={`Retirer ${a.libelle}`}
                >
                  <Ionicons name="trash-outline" size={20} color={theme.colors.textMuted} />
                </Pressable>
              </View>
              {deplace === a.id && (
                <View style={[styles.puces, styles.deplacement]}>
                  {emplacements.filter((e) => e !== a.endroit).map((e) => (
                    <Pressable key={e} onPress={() => changerEndroit(a, e)} style={styles.puce} accessibilityRole="button">
                      <Text style={styles.puceTexte}>{e}</Text>
                    </Pressable>
                  ))}
                </View>
              )}
            </View>
          ))}
        </View>
      ))}

      <View style={styles.section}>
        <Pressable
          onPress={() => setGererEmplacements(!gererEmplacements)}
          style={styles.ligne}
          accessibilityRole="button"
          accessibilityState={{ expanded: gererEmplacements }}
        >
          <Ionicons name="home-outline" size={20} color={theme.colors.accent} />
          <Text style={[styles.titreSection, styles.libelle]}>Emplacements ({emplacements.length})</Text>
          <Ionicons name={gererEmplacements ? 'chevron-up' : 'chevron-down'} size={20} color={theme.colors.textMuted} />
        </Pressable>
        {gererEmplacements && (
          <>
            <Text style={styles.aide}>Dans l’ordre où vous faites le tour de la maison.</Text>
            {emplacements.map((e, i) => {
              const fixe = e === EMPLACEMENT_AUTRE;
              const dernier = i === emplacements.filter((x) => x !== EMPLACEMENT_AUTRE).length - 1;
              if (renomme?.ancien === e) {
                return (
                  <View key={e} style={styles.ligne}>
                    <TextInput
                      style={[styles.champ, styles.libelle]}
                      value={renomme.nom}
                      onChangeText={(nom) => setRenomme({ ancien: e, nom })}
                      onSubmitEditing={validerRenommage}
                      autoFocus
                      accessibilityLabel={`Nouveau nom de ${e}`}
                    />
                    <Pressable onPress={validerRenommage} hitSlop={8} style={styles.icone} accessibilityRole="button" accessibilityLabel="Valider le nom">
                      <Ionicons name="checkmark" size={22} color={theme.colors.accent} />
                    </Pressable>
                    <Pressable onPress={() => setRenomme(null)} hitSlop={8} style={styles.icone} accessibilityRole="button" accessibilityLabel="Annuler">
                      <Ionicons name="close" size={22} color={theme.colors.textMuted} />
                    </Pressable>
                  </View>
                );
              }
              return (
                <View key={e} style={styles.ligne}>
                  <Text style={styles.libelle}>
                    {e}
                    <Text style={styles.aide}>{nbDans(e) > 0 ? `  · ${nbDans(e)}` : ''}</Text>
                  </Text>
                  {!fixe && (
                    <>
                      <Pressable
                        onPress={() => deplacerEmplacement(e, -1)}
                        disabled={i === 0}
                        hitSlop={4}
                        style={[styles.icone, i === 0 && styles.inactif]}
                        accessibilityRole="button"
                        accessibilityLabel={`Monter ${e}`}
                      >
                        <Ionicons name="arrow-up" size={18} color={theme.colors.accent} />
                      </Pressable>
                      <Pressable
                        onPress={() => deplacerEmplacement(e, 1)}
                        disabled={dernier}
                        hitSlop={4}
                        style={[styles.icone, dernier && styles.inactif]}
                        accessibilityRole="button"
                        accessibilityLabel={`Descendre ${e}`}
                      >
                        <Ionicons name="arrow-down" size={18} color={theme.colors.accent} />
                      </Pressable>
                      <Pressable
                        onPress={() => setRenomme({ ancien: e, nom: e })}
                        hitSlop={4}
                        style={styles.icone}
                        accessibilityRole="button"
                        accessibilityLabel={`Renommer ${e}`}
                      >
                        <Ionicons name="create-outline" size={18} color={theme.colors.accent} />
                      </Pressable>
                      <Pressable
                        onPress={() => supprimerUnEmplacement(e)}
                        hitSlop={4}
                        style={styles.icone}
                        accessibilityRole="button"
                        accessibilityLabel={`Supprimer l’emplacement ${e}`}
                      >
                        <Ionicons name="trash-outline" size={18} color={theme.colors.textMuted} />
                      </Pressable>
                    </>
                  )}
                </View>
              );
            })}
            <View style={styles.ligne}>
              <TextInput
                style={[styles.champ, styles.libelle]}
                value={nouvelEmplacement}
                onChangeText={setNouvelEmplacement}
                onSubmitEditing={ajouterUnEmplacement}
                placeholder="Nouvel emplacement : garage, cave…"
                placeholderTextColor={theme.colors.textMuted}
                accessibilityLabel="Nouvel emplacement"
              />
              <Pressable
                onPress={ajouterUnEmplacement}
                disabled={!nouvelEmplacement.trim()}
                hitSlop={8}
                style={[styles.icone, !nouvelEmplacement.trim() && styles.inactif]}
                accessibilityRole="button"
                accessibilityLabel="Ajouter l’emplacement"
              >
                <Ionicons name="add-circle" size={30} color={theme.colors.accent} />
              </Pressable>
            </View>
          </>
        )}
      </View>
    </ScrollView>
  );
}

const styles = creerStylesThemes(() => ({
  flex: { flex: 1, backgroundColor: theme.colors.background },
  contenu: { padding: theme.spacing.md, gap: theme.spacing.md, paddingBottom: theme.spacing.xl },
  intro: { fontFamily: theme.fontBody, fontSize: 15, color: theme.colors.text, lineHeight: 21 },
  section: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radii.lg,
    padding: theme.spacing.md,
    gap: theme.spacing.xs,
  },
  titreSection: { fontFamily: theme.fontBodyBold, fontSize: 16, color: theme.colors.text },
  endroit: { fontFamily: theme.fontBodyBold, fontSize: 14, color: theme.colors.accent, textTransform: 'uppercase', letterSpacing: 0.5 },
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
  puces: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  deplacement: { paddingBottom: theme.spacing.sm },
  puce: {
    minHeight: 34,
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.sm,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.background,
  },
  puceActive: { backgroundColor: theme.colors.accent, borderColor: theme.colors.accent },
  puceTexte: { fontFamily: theme.fontBody, fontSize: 14, color: theme.colors.text },
  puceTexteActive: { color: theme.colors.background, fontFamily: theme.fontBodyBold },
  ligne: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, minHeight: 44 },
  libelle: { flex: 1, fontFamily: theme.fontBody, fontSize: 16, color: theme.colors.text },
  icone: { minWidth: 40, minHeight: 40, alignItems: 'center', justifyContent: 'center' },
  inactif: { opacity: 0.3 },
  aide: { fontFamily: theme.fontBody, fontSize: 14, color: theme.colors.textMuted },
  erreur: { fontFamily: theme.fontBody, fontSize: 14, color: theme.colors.warning },
}));
