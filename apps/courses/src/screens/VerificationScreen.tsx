import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Avatar } from '@apps-famille/famille';
import { theme, creerStylesThemes } from '../theme/theme';
import { useAuth } from '../contexts/AuthContext';
import { Bouton, Chargement } from '../components/ui';
import { useListe } from '../hooks/useListe';
import {
  ENDROITS,
  ajouterArticle,
  annulerReponse,
  listerChecklist,
  listerVerifications,
  preparationEnCours,
  repondre,
  suivreVerifications,
  terminerPreparation,
  type AVerifier,
  type Reponse,
  type Verification,
} from '../services/courses';
import { cleProduit } from '../utils/texte';

// « Préparer les courses » : on passe la checklist du foyer, endroit par
// endroit. « À acheter » ajoute aussitôt l'article à cette liste ; un
// article déjà sur la liste est marqué « déjà prévu ». À plusieurs, chacun
// voit en direct ce que l'autre a déjà vérifié.
export default function VerificationScreen({ route, navigation }: any) {
  const listeId: string = route.params.listeId;
  const { foyer } = useAuth();
  const { liste, articles, setArticles, produits, parUtilisateur, chargement, moi } = useListe(listeId);
  const [preparation, setPreparation] = useState<string | null>(null);
  const [checklist, setChecklist] = useState<AVerifier[] | null>(null);
  const [verifications, setVerifications] = useState<Verification[]>([]);
  const [ajoutes, setAjoutes] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [enCours, setEnCours] = useState<string | null>(null);

  const listeDuFoyer = !!liste && !!foyer && liste.foyer_id === foyer.id;

  const chargerVerifications = useCallback(async (id: string) => {
    try {
      setVerifications(await listerVerifications(id));
    } catch {
      // réseau momentané
    }
  }, []);

  useEffect(() => {
    if (!listeDuFoyer || !foyer) return;
    let actif = true;
    (async () => {
      try {
        const [id, c] = await Promise.all([preparationEnCours(listeId), listerChecklist(foyer.id)]);
        if (!actif) return;
        setPreparation(id);
        setChecklist(c);
        await chargerVerifications(id);
      } catch {
        if (actif) {
          setChecklist([]);
          setMessage('Impossible de commencer la préparation. Vérifiez votre connexion.');
        }
      }
    })();
    return () => {
      actif = false;
    };
  }, [listeDuFoyer, foyer, listeId, chargerVerifications]);

  // Vérification partagée en direct.
  useEffect(() => {
    if (!preparation) return;
    return suivreVerifications(preparation, () => chargerVerifications(preparation));
  }, [preparation, chargerVerifications]);

  useEffect(() => {
    navigation.setOptions({ title: liste ? `Préparer · ${liste.nom}` : 'Préparer les courses' });
  }, [navigation, liste]);

  const surLaListe = useMemo(
    () => new Set(articles.filter((a) => a.etat !== 'caddie').map((a) => cleProduit(a.libelle))),
    [articles]
  );
  const parId = useMemo(() => new Map(verifications.map((v) => [v.a_verifier_id, v])), [verifications]);

  const groupes = useMemo(() => {
    const ordre = [...ENDROITS] as string[];
    const map = new Map<string, AVerifier[]>();
    (checklist ?? []).forEach((a) => map.set(a.endroit, [...(map.get(a.endroit) ?? []), a]));
    return Array.from(map.entries()).sort(
      ([a], [b]) => (ordre.indexOf(a) === -1 ? 99 : ordre.indexOf(a)) - (ordre.indexOf(b) === -1 ? 99 : ordre.indexOf(b))
    );
  }, [checklist]);

  const total = checklist?.length ?? 0;
  const faits = (checklist ?? []).filter((a) => parId.has(a.id) || surLaListe.has(cleProduit(a.libelle))).length;

  const choisir = async (a: AVerifier, reponse: Reponse) => {
    if (!preparation) return;
    setEnCours(a.id);
    setMessage(null);
    const avant = verifications;
    setVerifications((v) => [...v.filter((x) => x.a_verifier_id !== a.id), { a_verifier_id: a.id, reponse, par: moi, le: new Date().toISOString() }]);
    try {
      await repondre(preparation, a.id, reponse);
      if (reponse === 'a_acheter' && !surLaListe.has(cleProduit(a.libelle))) {
        const { article, fusionne } = await ajouterArticle(listeId, { libelle: a.libelle, quantite: null, unite: null }, produits, articles);
        if (!fusionne) {
          setArticles((actuels) => [...actuels, article]);
          setAjoutes((n) => n + 1);
        }
      }
    } catch {
      setVerifications(avant);
      setMessage('Pas enregistré (réseau ?). Réessayez.');
    } finally {
      setEnCours(null);
    }
  };

  const defaire = async (a: AVerifier) => {
    if (!preparation) return;
    setVerifications((v) => v.filter((x) => x.a_verifier_id !== a.id));
    await annulerReponse(preparation, a.id).catch(() => chargerVerifications(preparation));
  };

  const partir = async () => {
    if (!preparation) return;
    setEnCours('partir');
    try {
      await terminerPreparation(preparation);
      navigation.replace('Magasin', { listeId });
    } catch {
      setMessage('Impossible de terminer la préparation (réseau ?).');
    } finally {
      setEnCours(null);
    }
  };

  if (chargement) return <Chargement />;
  if (liste && !listeDuFoyer) {
    return (
      <View style={styles.centre}>
        <Text style={styles.aide}>
          La checklist « avant de partir » est celle du foyer de la liste : elle n’est pas disponible pour une liste
          qu’on vous a partagée.
        </Text>
      </View>
    );
  }
  if (checklist === null) return <Chargement />;

  if (checklist.length === 0) {
    return (
      <View style={styles.centre}>
        <Ionicons name="list-outline" size={44} color={theme.colors.textMuted} />
        <Text style={styles.titreVide}>La checklist du foyer est vide</Text>
        <Text style={styles.aide}>Ajoutez les produits à vérifier avant chaque course (lait, œufs, papier toilette…).</Text>
        <Bouton titre="Remplir la checklist" onPress={() => navigation.navigate('Checklist')} />
      </View>
    );
  }

  return (
    <View style={styles.flex}>
      <ScrollView style={styles.flex} contentContainerStyle={styles.contenu}>
        <View style={styles.progression}>
          <View style={[styles.barre, { width: `${total ? Math.round((faits / total) * 100) : 0}%` }]} />
        </View>
        <Text style={styles.aide}>
          {faits} sur {total} vérifié{faits > 1 ? 's' : ''}
          {ajoutes > 0 ? ` · ${ajoutes} ajouté${ajoutes > 1 ? 's' : ''} à la liste` : ''}
        </Text>
        {message && <Text style={styles.erreur}>{message}</Text>}

        {groupes.map(([endroit, liste]) => (
          <View key={endroit} style={styles.section}>
            <Text style={styles.endroit}>{endroit}</Text>
            {liste.map((a) => {
              const v = parId.get(a.id);
              const dejaPrevu = !v && surLaListe.has(cleProduit(a.libelle));
              const qui = v?.par ? parUtilisateur.get(v.par) : undefined;
              return (
                <View key={a.id} style={[styles.ligne, (v || dejaPrevu) && styles.ligneFaite]}>
                  <View style={styles.textes}>
                    <Text style={styles.libelle}>{a.libelle}</Text>
                    {dejaPrevu && <Text style={styles.etat}>Déjà prévu sur la liste</Text>}
                    {v && (
                      <View style={styles.qui}>
                        {v.par && <Avatar utilisateurId={v.par} prenom={qui?.prenom} taille={18} />}
                        <Text style={[styles.etat, v.reponse === 'a_acheter' && styles.etatAcheter]}>
                          {v.reponse === 'en_stock' ? 'Il en reste' : 'Ajouté à la liste'}
                        </Text>
                      </View>
                    )}
                  </View>
                  {v ? (
                    <Pressable onPress={() => defaire(a)} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Revoir ${a.libelle}`}>
                      <Text style={styles.lien}>Revoir</Text>
                    </Pressable>
                  ) : dejaPrevu ? (
                    <Ionicons name="checkmark-circle" size={26} color={theme.colors.success} />
                  ) : (
                    <View style={styles.choix}>
                      <Pressable
                        onPress={() => choisir(a, 'en_stock')}
                        disabled={enCours === a.id}
                        style={({ pressed }) => [styles.bouton, styles.boutonStock, pressed && styles.appuye]}
                        accessibilityRole="button"
                        accessibilityLabel={`${a.libelle} : j’en ai`}
                      >
                        <Text style={styles.boutonStockTexte}>J’en ai</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => choisir(a, 'a_acheter')}
                        disabled={enCours === a.id}
                        style={({ pressed }) => [styles.bouton, styles.boutonAcheter, pressed && styles.appuye]}
                        accessibilityRole="button"
                        accessibilityLabel={`${a.libelle} : à acheter`}
                      >
                        <Text style={styles.boutonAcheterTexte}>À acheter</Text>
                      </Pressable>
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        ))}
        <Bouton variante="discret" titre="Modifier la checklist du foyer" onPress={() => navigation.navigate('Checklist')} />
      </ScrollView>
      <View style={styles.pied}>
        <Text style={styles.resume}>
          {ajoutes} article{ajoutes > 1 ? 's' : ''} ajouté{ajoutes > 1 ? 's' : ''}, {faits} vérifié{faits > 1 ? 's' : ''}
        </Text>
        <Bouton titre="Partir au magasin" onPress={partir} enCours={enCours === 'partir'} />
      </View>
    </View>
  );
}

const styles = creerStylesThemes(() => ({
  flex: { flex: 1, backgroundColor: theme.colors.background },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: theme.spacing.md, padding: theme.spacing.lg, backgroundColor: theme.colors.background },
  contenu: { padding: theme.spacing.md, gap: theme.spacing.md, paddingBottom: theme.spacing.xl },
  progression: { height: 8, borderRadius: 4, backgroundColor: theme.colors.surface, overflow: 'hidden' },
  barre: { height: 8, backgroundColor: theme.colors.success },
  section: { gap: 6 },
  endroit: { fontFamily: theme.fontBodyBold, fontSize: 14, color: theme.colors.accent, textTransform: 'uppercase', letterSpacing: 0.5 },
  ligne: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    padding: theme.spacing.md,
    minHeight: 60,
    borderRadius: theme.radii.md,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  ligneFaite: { opacity: 0.7 },
  textes: { flex: 1, gap: 2 },
  libelle: { fontFamily: theme.fontBodyBold, fontSize: 17, color: theme.colors.text },
  qui: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  etat: { fontFamily: theme.fontBody, fontSize: 13, color: theme.colors.textMuted },
  etatAcheter: { color: theme.colors.success, fontFamily: theme.fontBodyBold },
  choix: { flexDirection: 'row', gap: 6 },
  bouton: { minHeight: 44, paddingHorizontal: 12, borderRadius: theme.radii.md, alignItems: 'center', justifyContent: 'center' },
  boutonStock: { borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.background },
  boutonStockTexte: { fontFamily: theme.fontBodyBold, fontSize: 14, color: theme.colors.text },
  boutonAcheter: { backgroundColor: theme.colors.accent },
  boutonAcheterTexte: { fontFamily: theme.fontBodyBold, fontSize: 14, color: theme.colors.background },
  appuye: { opacity: 0.6 },
  lien: { fontFamily: theme.fontBody, fontSize: 14, color: theme.colors.textMuted, textDecorationLine: 'underline' },
  titreVide: { fontFamily: theme.fontTitle, fontSize: 20, color: theme.colors.text, textAlign: 'center' },
  aide: { fontFamily: theme.fontBody, fontSize: 14, color: theme.colors.textMuted, textAlign: 'center' },
  erreur: { fontFamily: theme.fontBody, fontSize: 14, color: theme.colors.warning },
  pied: { padding: theme.spacing.md, gap: theme.spacing.xs, borderTopWidth: 1, borderTopColor: theme.colors.border, backgroundColor: theme.colors.surface },
  resume: { fontFamily: theme.fontBody, fontSize: 14, color: theme.colors.textMuted, textAlign: 'center' },
}));
