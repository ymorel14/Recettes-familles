import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Avatar } from '@apps-famille/famille';
import { theme, creerStylesThemes } from '../theme/theme';
import { useAuth } from '../contexts/AuthContext';
import { Bouton, Chargement } from '../components/ui';
import { alerte } from '../utils/alerte';
import {
  COULEURS_LISTE,
  ICONES_LISTE,
  creerListe,
  enregistrerMonOrdre,
  inviter,
  listerOrdresRayons,
  listerPersonnesAvecCompte,
  listerRayons,
  modifierListe,
  obtenirListe,
  retirerInvite,
  supprimerListe,
  viderListe,
  type ListeResume,
  type OrdreRayons,
  type PersonneCompte,
  type Portee,
} from '../services/courses';
import { RAYONS_DEPART, ordonnerRayons, type Rayon } from '../services/rayons';

// Créer une liste, ou régler une liste existante : nom, icône, couleur,
// portée, invités choisis un par un (jamais toute la famille d'un coup), et
// MON ordre des rayons (propre à chacun, ne change rien pour les autres).
export default function ListeFormScreen({ route, navigation }: any) {
  const listeId: string | undefined = route.params?.listeId;
  const creation = !listeId;
  const { foyer, session } = useAuth();
  const moi = session?.user.id ?? '';
  const [liste, setListe] = useState<ListeResume | null>(null);
  const [nom, setNom] = useState('');
  const [icone, setIcone] = useState<string>(ICONES_LISTE[0]);
  const [couleur, setCouleur] = useState<string>(COULEURS_LISTE[0]);
  const [portee, setPortee] = useState<Portee>('foyer');
  const [personnes, setPersonnes] = useState<PersonneCompte[]>([]);
  const [rayons, setRayons] = useState<Rayon[]>(RAYONS_DEPART);
  const [ordres, setOrdres] = useState<OrdreRayons[]>([]);
  const [choixInvite, setChoixInvite] = useState(false);
  const [enCours, setEnCours] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pret, setPret] = useState(creation);
  // Champs remplis une seule fois depuis la base (pas à chaque retour sur l'écran).
  const champsRemplis = useRef(false);

  const charger = useCallback(async () => {
    try {
      const [p, r] = await Promise.all([listerPersonnesAvecCompte().catch(() => []), listerRayons()]);
      setPersonnes(p);
      setRayons(r);
      if (listeId) {
        const [l, o] = await Promise.all([obtenirListe(listeId), listerOrdresRayons(listeId).catch(() => [])]);
        setListe(l);
        setOrdres(o);
        if (l && !champsRemplis.current) {
          champsRemplis.current = true;
          setNom(l.nom);
          setIcone(l.icone);
          setCouleur(l.couleur ?? COULEURS_LISTE[0]);
          setPortee(l.portee);
        }
      }
    } catch {
      setMessage('Chargement impossible. Vérifiez votre connexion.');
    } finally {
      setPret(true);
    }
  }, [listeId]);

  useFocusEffect(
    useCallback(() => {
      charger();
    }, [charger])
  );

  useEffect(() => {
    navigation.setOptions({ title: creation ? 'Nouvelle liste' : 'Réglages de la liste' });
  }, [navigation, creation]);

  const parUtilisateur = useMemo(() => new Map(personnes.map((p) => [p.utilisateurId, p])), [personnes]);
  const peutGerer = creation || (!!liste && (liste.cree_par === moi || (liste.portee === 'foyer' && liste.foyer_id === foyer?.id)));
  const suisInvite = !!liste && liste.invites.includes(moi);
  const monOrdre = ordres.find((o) => o.utilisateurId === moi)?.rayons ?? null;
  const rayonsOrdonnes = useMemo(() => ordonnerRayons(rayons, monOrdre), [rayons, monOrdre]);

  // Personnes qu'on peut encore inviter : avec compte, pas moi, pas déjà
  // invitées, et (portée foyer) pas déjà membres du foyer de la liste.
  const invitables = useMemo(() => {
    if (!liste) return [];
    return personnes.filter(
      (p) =>
        p.utilisateurId !== moi &&
        !liste.invites.includes(p.utilisateurId) &&
        !(liste.portee === 'foyer' && p.foyerId === liste.foyer_id)
    );
  }, [personnes, liste, moi]);

  const executer = async (cle: string, action: () => Promise<unknown>, erreur: string) => {
    setEnCours(cle);
    setMessage(null);
    try {
      await action();
    } catch {
      setMessage(erreur);
    } finally {
      setEnCours(null);
    }
  };

  const enregistrer = () => {
    if (!nom.trim()) {
      setMessage('Donnez un nom à la liste (ex. « Marché », « Bricolage »).');
      return;
    }
    executer(
      'enregistrer',
      async () => {
        if (creation) {
          if (!foyer) return;
          const id = await creerListe(foyer.id, { nom, icone, couleur, portee });
          navigation.replace('Liste', { listeId: id });
        } else if (liste) {
          await modifierListe(liste.id, liste.principale ? { nom, icone, couleur } : { nom, icone, couleur, portee });
          navigation.goBack();
        }
      },
      'Enregistrement impossible.'
    );
  };

  const ajouterInvite = (p: PersonneCompte) =>
    executer(
      p.utilisateurId,
      async () => {
        await inviter(liste!.id, p.utilisateurId);
        setChoixInvite(false);
        await charger();
      },
      'Invitation impossible.'
    );

  const enleverInvite = (utilisateurId: string) =>
    executer(
      utilisateurId,
      async () => {
        await retirerInvite(liste!.id, utilisateurId);
        await charger();
      },
      'Impossible de retirer cette personne.'
    );

  const quitter = () =>
    alerte('Quitter cette liste ?', 'Elle disparaîtra de votre téléphone. On pourra vous y inviter de nouveau.', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Quitter',
        style: 'destructive',
        onPress: () =>
          executer(
            'quitter',
            async () => {
              await retirerInvite(liste!.id, moi);
              navigation.popToTop();
            },
            'Impossible de quitter la liste.'
          ),
      },
    ]);

  const supprimer = () =>
    alerte(`Supprimer la liste « ${liste?.nom} » ?`, 'Ses articles seront perdus, pour tout le monde.', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: () =>
          executer(
            'supprimer',
            async () => {
              await supprimerListe(liste!.id);
              navigation.popToTop();
            },
            'Suppression impossible.'
          ),
      },
    ]);

  const vider = () =>
    alerte(`Vider la liste « ${liste?.nom} » ?`, 'Tous ses articles seront retirés, pour tout le monde.', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Vider',
        style: 'destructive',
        onPress: () =>
          executer(
            'vider',
            async () => {
              await viderListe(liste!.id);
              navigation.goBack();
            },
            'Impossible de vider la liste.'
          ),
      },
    ]);

  // Mon ordre des rayons : chaque déplacement est enregistré aussitôt.
  const changerOrdre = (nouvelOrdre: string[]) => {
    if (!liste) return;
    setOrdres((actuels) => [...actuels.filter((o) => o.utilisateurId !== moi), { utilisateurId: moi, rayons: nouvelOrdre }]);
    enregistrerMonOrdre(liste.id, nouvelOrdre).catch(() => setMessage('Ordre des rayons non enregistré.'));
  };
  const deplacer = (index: number, sens: -1 | 1) => {
    const ids = rayonsOrdonnes.map((r) => r.id);
    const cible = index + sens;
    if (cible < 0 || cible >= ids.length) return;
    [ids[index], ids[cible]] = [ids[cible], ids[index]];
    changerOrdre(ids);
  };
  const autresOrdres = ordres.filter((o) => o.utilisateurId !== moi && o.rayons.length > 0);

  if (!pret) return <Chargement />;
  if (!creation && !liste) {
    return (
      <View style={styles.centre}>
        <Text style={styles.aide}>Cette liste n’existe plus ou ne vous est plus partagée.</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.contenu} keyboardShouldPersistTaps="handled">
      {peutGerer && (
        <View style={styles.section}>
          <Text style={styles.titreSection}>Nom</Text>
          <TextInput
            style={styles.champ}
            value={nom}
            onChangeText={setNom}
            placeholder="Marché, Bricolage, Pharmacie…"
            placeholderTextColor={theme.colors.textMuted}
            accessibilityLabel="Nom de la liste"
          />
          <Text style={styles.titreSection}>Icône et couleur</Text>
          <View style={styles.puces}>
            {ICONES_LISTE.map((i) => (
              <Pressable
                key={i}
                onPress={() => setIcone(i)}
                style={[styles.rond, { borderColor: i === icone ? couleur : theme.colors.border }]}
                accessibilityRole="radio"
                accessibilityState={{ selected: i === icone }}
                accessibilityLabel={i}
              >
                <Ionicons name={i as any} size={22} color={i === icone ? couleur : theme.colors.textMuted} />
              </Pressable>
            ))}
          </View>
          <View style={styles.puces}>
            {COULEURS_LISTE.map((c) => (
              <Pressable
                key={c}
                onPress={() => setCouleur(c)}
                style={[styles.couleur, { backgroundColor: c }, c === couleur && styles.couleurActive]}
                accessibilityRole="radio"
                accessibilityState={{ selected: c === couleur }}
                accessibilityLabel={`Couleur ${c}`}
              />
            ))}
          </View>

          {!liste?.principale && (
            <>
              <Text style={styles.titreSection}>Qui voit cette liste</Text>
              {(['foyer', 'moi'] as Portee[]).map((p) => (
                <Pressable
                  key={p}
                  onPress={() => setPortee(p)}
                  style={[styles.choix, portee === p && styles.choixActif]}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: portee === p }}
                >
                  <Ionicons
                    name={portee === p ? 'radio-button-on' : 'radio-button-off'}
                    size={20}
                    color={theme.colors.accent}
                  />
                  <View style={styles.flexTexte}>
                    <Text style={styles.choixTexte}>{p === 'foyer' ? 'Tout mon foyer' : 'Rien que moi'}</Text>
                    <Text style={styles.aide}>
                      {p === 'foyer'
                        ? `Les membres du foyer ${foyer?.nom ?? ''} la voient et la remplissent.`
                        : 'Vous seul la voyez (pratique pour une surprise).'}
                    </Text>
                  </View>
                </Pressable>
              ))}
            </>
          )}
          {liste?.principale && (
            <Text style={styles.aide}>Liste principale du foyer : visible de tout le foyer, elle ne se supprime pas.</Text>
          )}
          <Bouton titre={creation ? 'Créer la liste' : 'Enregistrer'} onPress={enregistrer} enCours={enCours === 'enregistrer'} />
        </View>
      )}

      {!creation && liste && (
        <View style={styles.section}>
          <Text style={styles.titreSection}>Partagée avec</Text>
          <Text style={styles.aide}>
            {liste.portee === 'foyer' ? 'Tout le foyer, et ' : 'Vous, et '}
            les personnes invitées une par une. Elles ajoutent, cochent et modifient les articles, sans pouvoir
            renommer ni supprimer la liste.
          </Text>
          {liste.invites.length === 0 && <Text style={styles.aide}>Personne d’autre pour l’instant.</Text>}
          {liste.invites.map((u) => {
            const p = parUtilisateur.get(u);
            return (
              <View key={u} style={styles.lignePersonne}>
                <Avatar utilisateurId={u} prenom={p?.prenom} taille={30} />
                <View style={styles.flexTexte}>
                  <Text style={styles.choixTexte}>{p?.prenom ?? 'Personne de la famille'}</Text>
                  {p?.foyerNom && <Text style={styles.aide}>Foyer {p.foyerNom}</Text>}
                </View>
                {peutGerer && (
                  <Pressable onPress={() => enleverInvite(u)} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Retirer ${p?.prenom ?? ''}`}>
                    <Text style={styles.lien}>{enCours === u ? '…' : 'Retirer'}</Text>
                  </Pressable>
                )}
              </View>
            );
          })}
          {peutGerer && !choixInvite && (
            <Bouton variante="contour" titre="Inviter une personne" onPress={() => setChoixInvite(true)} />
          )}
          {peutGerer && choixInvite && (
            <View style={styles.choixInvite}>
              <Text style={styles.titreSection}>Choisir une personne</Text>
              {invitables.length === 0 && (
                <Text style={styles.aide}>Personne d’autre avec un compte dans vos familles.</Text>
              )}
              {invitables.map((p) => (
                <Pressable
                  key={p.utilisateurId}
                  onPress={() => ajouterInvite(p)}
                  style={({ pressed }) => [styles.lignePersonne, styles.ligneChoix, pressed && styles.appuye]}
                  accessibilityRole="button"
                  accessibilityLabel={`Inviter ${p.prenom}`}
                >
                  <Avatar personneId={p.personneId} prenom={p.prenom} taille={30} />
                  <View style={styles.flexTexte}>
                    <Text style={styles.choixTexte}>{p.prenom}</Text>
                    {p.foyerNom && <Text style={styles.aide}>Foyer {p.foyerNom}</Text>}
                  </View>
                  <Ionicons name="person-add-outline" size={20} color={theme.colors.accent} />
                </Pressable>
              ))}
              <Bouton variante="discret" titre="Annuler" onPress={() => setChoixInvite(false)} />
            </View>
          )}
        </View>
      )}

      {!creation && liste && (
        <View style={styles.section}>
          <Text style={styles.titreSection}>Mon ordre des rayons</Text>
          <Text style={styles.aide}>
            Rangez les rayons dans l’ordre où vous parcourez le magasin. Cet ordre est le vôtre : il ne change rien
            pour les autres.
          </Text>
          {autresOrdres.length > 0 && (
            <View style={styles.puces}>
              {autresOrdres.map((o) => (
                <Pressable
                  key={o.utilisateurId}
                  onPress={() => changerOrdre(o.rayons)}
                  style={({ pressed }) => [styles.puce, pressed && styles.appuye]}
                  accessibilityRole="button"
                >
                  <Avatar utilisateurId={o.utilisateurId} prenom={parUtilisateur.get(o.utilisateurId)?.prenom} taille={20} />
                  <Text style={styles.puceTexte}>Utiliser l’ordre de {parUtilisateur.get(o.utilisateurId)?.prenom ?? 'quelqu’un'}</Text>
                </Pressable>
              ))}
            </View>
          )}
          {rayonsOrdonnes.map((r, i) => (
            <View key={r.id} style={styles.ligneRayon}>
              <Text style={styles.numero}>{i + 1}</Text>
              <Ionicons name={r.icone as any} size={18} color={theme.colors.accent} />
              <Text style={styles.nomRayon}>{r.nom}</Text>
              <Pressable
                onPress={() => deplacer(i, -1)}
                disabled={i === 0}
                style={[styles.fleche, i === 0 && styles.inactif]}
                accessibilityRole="button"
                accessibilityLabel={`Monter ${r.nom}`}
              >
                <Ionicons name="chevron-up" size={22} color={theme.colors.accent} />
              </Pressable>
              <Pressable
                onPress={() => deplacer(i, 1)}
                disabled={i === rayonsOrdonnes.length - 1}
                style={[styles.fleche, i === rayonsOrdonnes.length - 1 && styles.inactif]}
                accessibilityRole="button"
                accessibilityLabel={`Descendre ${r.nom}`}
              >
                <Ionicons name="chevron-down" size={22} color={theme.colors.accent} />
              </Pressable>
            </View>
          ))}
          {monOrdre && monOrdre.length > 0 && (
            <Bouton variante="discret" titre="Revenir à l’ordre de départ" onPress={() => changerOrdre([])} />
          )}
        </View>
      )}

      {message && <Text style={styles.erreur}>{message}</Text>}

      {!creation && liste && peutGerer && liste.principale && (
        <Bouton variante="contour" titre="Vider la liste" onPress={vider} enCours={enCours === 'vider'} />
      )}
      {!creation && liste && peutGerer && !liste.principale && (
        <Bouton variante="contour" titre="Supprimer la liste" onPress={supprimer} enCours={enCours === 'supprimer'} />
      )}
      {!creation && liste && suisInvite && !peutGerer && (
        <Bouton variante="contour" titre="Quitter cette liste" onPress={quitter} enCours={enCours === 'quitter'} />
      )}
    </ScrollView>
  );
}

const styles = creerStylesThemes(() => ({
  flex: { flex: 1, backgroundColor: theme.colors.background },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: theme.spacing.lg, backgroundColor: theme.colors.background },
  contenu: { padding: theme.spacing.md, gap: theme.spacing.md, paddingBottom: theme.spacing.xl },
  section: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radii.lg,
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  titreSection: { fontFamily: theme.fontBodyBold, fontSize: 16, color: theme.colors.text },
  aide: { fontFamily: theme.fontBody, fontSize: 13, color: theme.colors.textMuted },
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
  puces: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  rond: { width: 44, height: 44, borderRadius: 22, borderWidth: 2, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.background },
  couleur: { width: 36, height: 36, borderRadius: 18 },
  couleurActive: { borderWidth: 3, borderColor: theme.colors.text },
  choix: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    minHeight: 52,
    padding: theme.spacing.sm,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  choixActif: { borderColor: theme.colors.accent, backgroundColor: theme.colors.selectionTransparent },
  choixTexte: { fontFamily: theme.fontBodyBold, fontSize: 15, color: theme.colors.text },
  flexTexte: { flex: 1, gap: 2 },
  lignePersonne: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, minHeight: 44 },
  ligneChoix: { paddingHorizontal: theme.spacing.sm, borderRadius: theme.radii.md, backgroundColor: theme.colors.background },
  choixInvite: { gap: theme.spacing.xs, marginTop: theme.spacing.xs },
  appuye: { opacity: 0.6 },
  lien: { fontFamily: theme.fontBody, fontSize: 14, color: theme.colors.textMuted, textDecorationLine: 'underline' },
  puce: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 36,
    paddingHorizontal: theme.spacing.sm,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.background,
  },
  puceTexte: { fontFamily: theme.fontBody, fontSize: 14, color: theme.colors.text },
  ligneRayon: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, minHeight: 44 },
  numero: { width: 22, fontFamily: theme.fontBodyBold, fontSize: 14, color: theme.colors.textMuted, textAlign: 'right' },
  nomRayon: { flex: 1, fontFamily: theme.fontBody, fontSize: 15, color: theme.colors.text },
  fleche: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 20, backgroundColor: theme.colors.background },
  inactif: { opacity: 0.25 },
  erreur: { fontFamily: theme.fontBody, fontSize: 14, color: theme.colors.warning },
}));
