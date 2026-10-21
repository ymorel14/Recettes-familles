import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { KeyboardAvoidingView, Platform, Pressable, SectionList, Text, TextInput, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Avatar } from '@apps-famille/famille';
import { theme, creerStylesThemes } from '../theme/theme';
import { Bouton, Chargement } from '../components/ui';
import { useAuth } from '../contexts/AuthContext';
import { alerte } from '../utils/alerte';
import { useListe } from '../hooks/useListe';
import { Vignette } from '../components/Photo';
import {
  ajouterArticle,
  ajouterAVerifier,
  endroitPropose,
  listerEmplacements,
  ajoutsDeRecettes,
  fusionnerArticles,
  retirerRecette,
  suggestionsFusion,
  epinglerProduit,
  listerHabituels,
  listerARacheter,
  listerNonDoublons,
  noterNonDoublon,
  pairesDeCles,
  rythmeAchat,
  masquerProduit,
  modifierArticle,
  supprimerArticle,
  suggestions as chercherSuggestions,
  type Article,
  type ARacheter,
  type Habituel,
  type Produit,
} from '../services/courses';
import { formaterQuantite, lireSaisie } from '../services/saisie';
import { cleProduit } from '../utils/texte';
import { formaterDateCourte } from '../utils/dates';
import { FeuilleBas } from '../../../composants/FeuilleBas';
import { BandeauBrouillon, ChargementAssistant, Etincelle, MessageAssistant, PastilleAVerifier } from '../../../composants/assistant';
import { signatureGroupe, verdictConnu, verdictsDoublons, type VerdictDoublon } from '../../../services/doublonsAssistant';
import { appelerAssistant, ErreurAssistant, messageErreurAssistant } from '../../../services/assistant';
import { phraseDeCourses, type ArticlePropose } from '../../../services/actionsAssistant';

// Une liste : ajout rapide en haut (« 2 lait », « pain »…), articles rangés
// par rayon dans MON ordre des rayons, prénom de qui a ajouté chaque
// article, articles habituels en un appui. « À la maison » passe la checklist
// du foyer ; « Je suis au magasin » ouvre le mode magasin.

export default function ListeScreen({ route, navigation }: any) {
  const listeId: string = route.params.listeId;
  const donnees = useListe(listeId);
  const { liste, articles, setArticles, rayonsOrdonnes, parUtilisateur, produits, chargement, erreur, horsLigne, enAttente, contributions, rechargerArticles, photos } = donnees;
  const [voirRecettes, setVoirRecettes] = useState(false);
  // Rapprochements refusés pendant cette visite (« ce n'est pas le même produit »).
  const [refuses, setRefuses] = useState<Set<string>>(new Set());
  const { foyer } = useAuth();
  const duFoyer = !!liste && !!foyer && liste.foyer_id === foyer.id;
  const [habituels, setHabituels] = useState<Habituel[]>([]);
  const [voirHabituels, setVoirHabituels] = useState(false);
  // Produits sans doute à racheter (spécification § 4.2.2).
  const [aRacheter, setARacheter] = useState<ARacheter[]>([]);
  // « Ce n'est pas le même produit », mémorisé par le foyer (§ 4.2.3).
  const [nonDoublons, setNonDoublons] = useState<Set<string>>(new Set());
  // Réponses de l'assistant sur les doublons possibles, par groupe.
  const [verdicts, setVerdicts] = useState<Map<string, VerdictDoublon | 'erreur'>>(new Map());

  useFocusEffect(
    useCallback(() => {
      listerHabituels(listeId).then(setHabituels);
      listerARacheter().then(setARacheter);
      listerNonDoublons().then(setNonDoublons);
    }, [listeId])
  );
  const [saisie, setSaisie] = useState('');
  const [enCours, setEnCours] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  // Ajout en phrase avec l'assistant (spécification § 4.2.1).
  const [phrase, setPhrase] = useState<{
    texte: string;
    lecture: boolean;
    articles: ArticlePropose[];
    coches: boolean[];
    question: string | null;
    erreur: ErreurAssistant | null;
  } | null>(null);
  const annulationPhrase = useRef<AbortController | null>(null);
  // Dernier article retiré d'un appui sur ×, qu'on peut remettre.
  const [retire, setRetire] = useState<Article | null>(null);
  const minuterieRetire = useRef<ReturnType<typeof setTimeout> | null>(null);
  const champ = useRef<TextInput>(null);

  useLayoutEffect(() => {
    navigation.setOptions({
      title: liste?.nom ?? 'Liste',
      headerRight: () =>
        liste ? (
          <View style={styles.entete}>
            {duFoyer && (
              <Pressable
                onPress={() => navigation.navigate('Historique', { listeId })}
                accessibilityRole="button"
                accessibilityLabel="Historique des courses"
                hitSlop={8}
                style={styles.boutonEntete}
              >
                <Ionicons name="time-outline" size={24} color={theme.colors.accent} />
              </Pressable>
            )}
            <Pressable
              onPress={() => navigation.navigate('ListeForm', { listeId })}
              accessibilityRole="button"
              accessibilityLabel="Réglages de la liste"
              hitSlop={8}
              style={styles.boutonEntete}
            >
              <Ionicons name="settings-outline" size={24} color={theme.colors.accent} />
            </Pressable>
          </View>
        ) : null,
    });
  }, [navigation, liste, listeId, duFoyer]);

  const aAcheter = useMemo(() => articles.filter((a) => a.etat !== 'caddie'), [articles]);
  const dansCaddie = articles.length - aAcheter.length;

  const sections = useMemo(
    () =>
      rayonsOrdonnes
        .map((r) => ({ rayon: r, data: aAcheter.filter((a) => a.rayon_id === r.id) }))
        .concat(
          // Article d'un rayon inconnu (ajouté par un autre foyer) : avec « Autres ».
          [{ rayon: { id: '?', nom: 'Autres rayons', icone: 'ellipsis-horizontal-outline', ordre: 999 }, data: aAcheter.filter((a) => !rayonsOrdonnes.some((r) => r.id === a.rayon_id)) }]
        )
        .filter((s) => s.data.length > 0),
    [rayonsOrdonnes, aAcheter]
  );

  const clesSurLaListe = useMemo(() => new Set(aAcheter.map((a) => cleProduit(a.libelle))), [aAcheter]);
  const propositions = useMemo(
    () => chercherSuggestions(produits, saisie, clesSurLaListe),
    [produits, saisie, clesSurLaListe]
  );

  // « Du lait, des œufs pour la tarte et de quoi faire un apéro » : plusieurs
  // articles ou mots de liaison → l'assistant lit la phrase et propose les
  // articles, cochés (les suggestions vagues décochées). Sinon, ajout rapide
  // habituel, sans IA.
  const lirePhrase = async (texte: string) => {
    const controle = new AbortController();
    annulationPhrase.current = controle;
    setPhrase({ texte, lecture: true, articles: [], coches: [], question: null, erreur: null });
    try {
      const r = await appelerAssistant<{ articles: ArticlePropose[]; question: string | null }>(
        'courses-phrase',
        { texte },
        { signal: controle.signal }
      );
      if (controle.signal.aborted) return;
      setPhrase({ texte, lecture: false, articles: r.articles, coches: r.articles.map((a) => !a.suggestion), question: r.question, erreur: null });
    } catch (e) {
      if (controle.signal.aborted) return;
      setPhrase({
        texte,
        lecture: false,
        articles: [],
        coches: [],
        question: null,
        erreur: e instanceof ErreurAssistant ? e : new ErreurAssistant('indisponible', messageErreurAssistant(e)),
      });
    }
  };

  const ajouterPlusieurs = async (liste: { libelle: string; quantite: number | null; unite: string | null }[]) => {
    setEnCours(true);
    setMessage(null);
    try {
      let actuels = articles;
      for (const a of liste) {
        const saisieArticle = a.quantite == null && a.unite == null ? lireSaisie(a.libelle) : a;
        if (!saisieArticle.libelle) continue;
        const { article, fusionne } = await ajouterArticle(listeId, saisieArticle, produits, actuels);
        actuels = fusionne ? actuels.map((x) => (x.id === article.id ? article : x)) : [...actuels, article];
      }
      setArticles(actuels);
      setSaisie('');
      setPhrase(null);
    } catch {
      setMessage('Ajout impossible. Vérifiez votre connexion.');
    } finally {
      setEnCours(false);
    }
  };

  const ajouter = async (texte: string) => {
    if (phraseDeCourses(texte) && texte.trim()) return lirePhrase(texte.trim());
    const lu = lireSaisie(texte);
    if (!lu.libelle || enCours) return;
    setEnCours(true);
    setMessage(null);
    try {
      const { article, fusionne } = await ajouterArticle(listeId, lu, produits, articles);
      setArticles((actuels) =>
        fusionne ? actuels.map((a) => (a.id === article.id ? article : a)) : [...actuels, article]
      );
      if (fusionne) setMessage(`« ${article.libelle} » était déjà sur la liste.`);
      setSaisie('');
    } catch {
      setMessage('Ajout impossible. Vérifiez votre connexion.');
    } finally {
      setEnCours(false);
      champ.current?.focus();
    }
  };

  const ajouterProduit = (p: Produit) => ajouter(p.libelle);

  // Habituels pas encore sur la liste, épinglés en tête.
  const habituelsProposes = useMemo(() => habituels.filter((h) => !clesSurLaListe.has(h.cle)), [habituels, clesSurLaListe]);
  // À racheter : seulement pour une liste de mon foyer, et pas déjà dessus.
  const aRacheterProposes = useMemo(
    () => (duFoyer ? aRacheter.filter((r) => r.foyer_id === liste?.foyer_id && !clesSurLaListe.has(r.cle)).slice(0, 6) : []),
    [aRacheter, clesSurLaListe, duFoyer, liste?.foyer_id]
  );

  const ajouterARacheter = async (r: ARacheter) => {
    setMessage(null);
    try {
      const { article, fusionne } = await ajouterArticle(listeId, { libelle: r.libelle, quantite: r.quantite, unite: r.unite }, produits, articles);
      setArticles((actuels) => (fusionne ? actuels.map((a) => (a.id === article.id ? article : a)) : [...actuels, article]));
      setARacheter((liste) => liste.filter((x) => x.cle !== r.cle));
    } catch {
      setMessage('Ajout impossible. Vérifiez votre connexion.');
    }
  };

  const reglerARacheter = (r: ARacheter) => {
    if (!foyer) return;
    alerte(r.libelle, `Acheté ${r.nb_achats} fois, ${rythmeAchat(r)}.`, [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Ne plus proposer',
        style: 'destructive',
        onPress: async () => {
          setARacheter((liste) => liste.filter((x) => x.cle !== r.cle));
          setHabituels((liste) => liste.filter((x) => x.cle !== r.cle));
          await masquerProduit(foyer.id, r).catch(() => {});
        },
      },
    ]);
  };

  const ajouterHabituel = async (h: Habituel) => {
    setMessage(null);
    try {
      const { article, fusionne } = await ajouterArticle(
        listeId,
        { libelle: h.libelle, quantite: h.quantite, unite: h.unite },
        produits,
        articles
      );
      setArticles((actuels) => (fusionne ? actuels.map((a) => (a.id === article.id ? article : a)) : [...actuels, article]));
    } catch {
      setMessage('Ajout impossible. Vérifiez votre connexion.');
    }
  };

  const reglerHabituel = (h: Habituel) => {
    if (!foyer) return;
    alerte(h.libelle, h.nb_achats > 0 ? `Acheté ${h.nb_achats} fois avec cette liste.` : 'Épinglé dans les habituels.', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: h.epingle ? 'Ne plus épingler' : 'Épingler en tête',
        onPress: async () => {
          await epinglerProduit(foyer.id, h, !h.epingle).catch(() => {});
          setHabituels(await listerHabituels(listeId));
        },
      },
      {
        text: 'Ne plus proposer',
        style: 'destructive',
        onPress: async () => {
          setHabituels((liste) => liste.filter((x) => x.cle !== h.cle));
          await masquerProduit(foyer.id, h).catch(() => {});
        },
      },
    ]);
  };

  // Recettes envoyées depuis l'app Recettes, retirables une par une.
  const recettesAjoutees = useMemo(() => ajoutsDeRecettes(contributions), [contributions]);
  const retirer = (ajoutId: string, titre: string) =>
    alerte(`Retirer « ${titre} » de la liste ?`, 'Seuls les ingrédients apportés par cette recette sont retirés.', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Retirer',
        style: 'destructive',
        onPress: async () => {
          try {
            await retirerRecette(listeId, ajoutId);
            await donnees.recharger();
          } catch {
            setMessage('Impossible de retirer la recette (réseau ?).');
          }
        },
      },
    ]);

  // Rapprochement proposé (« Oeufs » et « Oeufs entiers ») : le code repère
  // les articles qui ont un mot en commun, l'assistant dit si c'est le même
  // produit et additionne les quantités (spécification § 4.2.3). Groupes
  // déjà refusés par le foyer (« pas le même produit ») : plus proposés.
  // Assistant indisponible : la question simple, comme avant.
  const candidats = useMemo(
    () =>
      suggestionsFusion(aAcheter).filter((sg) => {
        if (refuses.has(sg.articles.map((a) => a.id).sort().join(','))) return false;
        const paires = pairesDeCles(sg.articles.map((a) => cleProduit(a.libelle)));
        return paires.length > 0 && !paires.every((p) => nonDoublons.has(p));
      }),
    [aAcheter, refuses, nonDoublons]
  );
  // Une demande partie n'est jamais annulée (elle serait payée quand même) :
  // on note seulement les groupes en cours pour ne pas les redemander.
  const doublonsEnCours = useRef<Set<string>>(new Set());
  useEffect(() => {
    const inconnus = candidats.filter((sg) => {
      const signature = signatureGroupe(sg.articles);
      return !verdicts.has(signature) && !doublonsEnCours.current.has(signature);
    });
    if (!inconnus.length) return;
    // Déjà connus sur ce téléphone : sans appel.
    const connus = new Map(verdicts);
    const manquants = inconnus
      .filter((sg) => {
        const signature = signatureGroupe(sg.articles);
        const v = verdictConnu(signature);
        if (v) connus.set(signature, v);
        return !v;
      })
      .slice(0, 6); // 6 groupes par appel ; les suivants au passage d'après
    if (connus.size !== verdicts.size) setVerdicts(connus);
    if (!manquants.length) return;
    const minuterie = setTimeout(() => {
      const signatures = manquants.map((sg) => signatureGroupe(sg.articles));
      signatures.forEach((sig) => doublonsEnCours.current.add(sig));
      verdictsDoublons(manquants.map((sg) => sg.articles))
        .then((lus) =>
          setVerdicts((actuels) => {
            const suite = new Map(actuels);
            signatures.forEach((sig) => suite.set(sig, lus.get(sig) ?? 'erreur'));
            return suite;
          })
        )
        .catch(() =>
          setVerdicts((actuels) => {
            const suite = new Map(actuels);
            signatures.forEach((sig) => suite.set(sig, 'erreur'));
            return suite;
          })
        )
        .finally(() => signatures.forEach((sig) => doublonsEnCours.current.delete(sig)));
    }, 800);
    return () => clearTimeout(minuterie);
  }, [candidats, verdicts]);

  const suggestion = useMemo(() => {
    for (const sg of candidats) {
      const v = verdicts.get(signatureGroupe(sg.articles));
      if (v === 'erreur') return { ...sg, verdict: null as VerdictDoublon | null };
      if (v && v.meme_produit) return { ...sg, verdict: v };
    }
    return null;
  }, [candidats, verdicts]);

  const refuserSuggestion = async () => {
    if (!suggestion) return;
    setRefuses((r) => new Set(r).add(suggestion.articles.map((a) => a.id).sort().join(',')));
    const cles = suggestion.articles.map((a) => cleProduit(a.libelle));
    if (foyer) {
      setNonDoublons((n) => new Set([...n, ...pairesDeCles(cles)]));
      await noterNonDoublon(foyer.id, cles).catch(() => {});
    }
  };
  const accepterSuggestion = async () => {
    if (!suggestion) return;
    const v = suggestion.verdict;
    try {
      await fusionnerArticles(
        listeId,
        suggestion.articles,
        v ? { libelle: v.libelle, quantite: v.quantite, unite: v.unite, note: v.quantite == null ? v.explication : null } : undefined
      );
      await rechargerArticles();
    } catch {
      setMessage('Fusion impossible (réseau ?).');
    }
  };

  // × sur une ligne : retirer l'article de la liste sans ouvrir sa fiche
  // (on peut le remettre quelques secondes avec « Annuler »).
  const retirerArticle = async (a: Article) => {
    setMessage(null);
    setArticles((liste) => liste.filter((x) => x.id !== a.id));
    if (minuterieRetire.current) clearTimeout(minuterieRetire.current);
    setRetire(a);
    minuterieRetire.current = setTimeout(() => setRetire(null), 8000);
    try {
      await supprimerArticle(a.id);
    } catch {
      setRetire(null);
      setMessage('Impossible de retirer l’article. Vérifiez votre connexion.');
      await rechargerArticles();
    }
  };

  const annulerRetrait = async () => {
    const a = retire;
    if (!a) return;
    setRetire(null);
    if (minuterieRetire.current) clearTimeout(minuterieRetire.current);
    try {
      const { article } = await ajouterArticle(listeId, { libelle: a.libelle, quantite: a.quantite, unite: a.unite }, produits, articles);
      if (a.note || article.rayon_id !== a.rayon_id) {
        await modifierArticle(article.id, { note: a.note, rayon_id: a.rayon_id });
      }
      await rechargerArticles();
    } catch {
      setMessage('Impossible de remettre l’article.');
    }
  };

  // Appui long sur un article : l'ajouter à la checklist du foyer.
  const versChecklist = (a: Article) => {
    if (!foyer || !duFoyer) return;
    alerte(`Vérifier « ${a.libelle} » avant chaque course ?`, 'Il sera ajouté à la checklist du foyer.', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Ajouter à la checklist',
        onPress: async () => {
          try {
            const emplacements = await listerEmplacements(foyer.id).catch(() => undefined);
            await ajouterAVerifier(foyer.id, a.libelle, endroitPropose(a.rayon_id, emplacements));
            setMessage(`« ${a.libelle} » ajouté à la checklist du foyer.`);
          } catch {
            setMessage('Ajout à la checklist impossible.');
          }
        },
      },
    ]);
  };

  if (chargement) return <Chargement />;
  if (!liste) {
    return (
      <View style={styles.centre}>
        <Text style={styles.vide}>{erreur ?? 'Liste introuvable.'}</Text>
      </View>
    );
  }

  const ligne = ({ item }: { item: Article }) => {
    const auteur = item.ajoute_par ? parUtilisateur.get(item.ajoute_par) : undefined;
    const quantite = formaterQuantite(item.quantite, item.unite);
    return (
      <Pressable
        style={({ pressed }) => [styles.ligne, pressed && styles.appuye]}
        onPress={() => navigation.navigate('Article', { listeId, articleId: item.id })}
        onLongPress={() => versChecklist(item)}
        accessibilityRole="button"
        accessibilityLabel={`${item.libelle}${quantite ? `, ${quantite}` : ''}`}
      >
        <Vignette chemin={photos.get(cleProduit(item.libelle))} taille={40} legende={item.libelle} />
        <View style={styles.ligneTextes}>
          <Text style={styles.libelle}>
            {item.libelle}
            {quantite ? <Text style={styles.quantite}>{`  ${quantite}`}</Text> : null}
          </Text>
          {item.note ? <Text style={styles.note}>{item.note}</Text> : null}
          {item.etat === 'introuvable' && (
            <View style={styles.introuvable}>
              <Ionicons name="alert-circle-outline" size={14} color={theme.colors.warning} />
              <Text style={styles.introuvableTexte}>Introuvable la dernière fois</Text>
            </View>
          )}
        </View>
        {item.ajoute_par && (
          <View style={styles.auteur} accessibilityLabel={`Ajouté par ${auteur?.prenom ?? 'quelqu’un'}`}>
            <Avatar utilisateurId={item.ajoute_par} prenom={auteur?.prenom} taille={22} />
            <View>
              <Text style={styles.auteurTexte} numberOfLines={1}>
                {auteur?.prenom ?? ''}
              </Text>
              <Text style={styles.auteurTexte} numberOfLines={1}>
                {formaterDateCourte(item.ajoute_le)}
              </Text>
            </View>
          </View>
        )}
        <Pressable
          onPress={() => retirerArticle(item)}
          hitSlop={6}
          style={({ pressed }) => [styles.retirer, pressed && styles.appuye]}
          accessibilityRole="button"
          accessibilityLabel={`Retirer ${item.libelle} de la liste`}
        >
          <Ionicons name="close" size={20} color={theme.colors.textMuted} />
        </Pressable>
      </Pressable>
    );
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.saisie}>
        <View style={styles.saisieLigne}>
          <TextInput
            ref={champ}
            style={styles.champ}
            value={saisie}
            onChangeText={setSaisie}
            onSubmitEditing={() => ajouter(saisie)}
            placeholder="Ajouter : « pain », « 2 lait », « 500 g farine »"
            placeholderTextColor={theme.colors.textMuted}
            returnKeyType="done"
            blurOnSubmit={false}
            accessibilityLabel="Ajouter un article"
          />
          <Pressable
            onPress={() => ajouter(saisie)}
            disabled={!saisie.trim() || enCours}
            style={({ pressed }) => [styles.boutonAjout, (!saisie.trim() || pressed) && styles.appuye]}
            accessibilityRole="button"
            accessibilityLabel="Ajouter"
          >
            <Ionicons name="add" size={28} color={theme.colors.background} />
          </Pressable>
        </View>
        {propositions.length > 0 && (
          <View style={styles.suggestions}>
            {propositions.map((p) => (
              <Pressable
                key={p.cle}
                onPress={() => ajouterProduit(p)}
                style={({ pressed }) => [styles.suggestion, pressed && styles.appuye]}
                accessibilityRole="button"
                accessibilityLabel={`Ajouter ${p.libelle}`}
              >
                <Ionicons name="add-circle-outline" size={16} color={theme.colors.accent} />
                <Text style={styles.suggestionTexte}>{p.libelle}</Text>
              </Pressable>
            ))}
          </View>
        )}
        {aRacheterProposes.length > 0 && (
          <View style={styles.aRacheter}>
            <View style={styles.habituelsEntete}>
              <Ionicons name="time-outline" size={18} color={theme.colors.accent} />
              <Text style={styles.habituelsTitre}>Sans doute à racheter</Text>
            </View>
            <View style={styles.suggestions}>
              {aRacheterProposes.map((r) => (
                <Pressable
                  key={r.cle}
                  onPress={() => ajouterARacheter(r)}
                  onLongPress={() => reglerARacheter(r)}
                  style={({ pressed }) => [styles.suggestion, styles.epingle, pressed && styles.appuye]}
                  accessibilityRole="button"
                  accessibilityLabel={`Ajouter ${r.libelle}, acheté ${rythmeAchat(r)}`}
                  accessibilityHint="Appui long : ne plus proposer"
                >
                  <Ionicons name="add-circle-outline" size={15} color={theme.colors.accent} />
                  <Text style={styles.suggestionTexte}>{r.libelle}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}
        {duFoyer && habituelsProposes.length > 0 && (
          <Pressable
            onPress={() => setVoirHabituels((v) => !v)}
            style={styles.habituelsEntete}
            accessibilityRole="button"
            accessibilityState={{ expanded: voirHabituels }}
          >
            <Ionicons name="repeat-outline" size={18} color={theme.colors.accent} />
            <Text style={styles.habituelsTitre}>Habituels ({habituelsProposes.length})</Text>
            <Ionicons name={voirHabituels ? 'chevron-up' : 'chevron-down'} size={18} color={theme.colors.textMuted} />
          </Pressable>
        )}
        {duFoyer && voirHabituels && (
          <View style={styles.suggestions}>
            {habituelsProposes.map((h) => {
              const q = formaterQuantite(h.quantite, h.unite);
              return (
                <Pressable
                  key={h.cle}
                  onPress={() => ajouterHabituel(h)}
                  onLongPress={() => reglerHabituel(h)}
                  style={({ pressed }) => [styles.suggestion, h.epingle && styles.epingle, pressed && styles.appuye]}
                  accessibilityRole="button"
                  accessibilityLabel={`Ajouter ${h.libelle}${q ? `, ${q}` : ''}`}
                  accessibilityHint="Appui long : épingler ou ne plus proposer"
                >
                  <Ionicons name={h.epingle ? 'pin' : 'add-circle-outline'} size={15} color={theme.colors.accent} />
                  <Text style={styles.suggestionTexte}>
                    {h.libelle}
                    {q ? <Text style={styles.quantite}>{` ${q}`}</Text> : null}
                  </Text>
                </Pressable>
              );
            })}
            <Text style={styles.message}>Appui long sur un habituel : l’épingler en tête, ou ne plus le proposer.</Text>
          </View>
        )}
        {(horsLigne || enAttente > 0) && (
          <Text style={styles.horsLigne}>Pas de réseau : version gardée sur le téléphone.</Text>
        )}
        {message && <Text style={styles.message}>{message}</Text>}
        {retire && (
          <View style={styles.bandeauRetire}>
            <Text style={[styles.message, styles.texteBandeau]} numberOfLines={1}>
              « {retire.libelle} » retiré de la liste.
            </Text>
            <Pressable onPress={annulerRetrait} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Remettre ${retire.libelle} sur la liste`}>
              <Text style={styles.annuler}>Annuler</Text>
            </Pressable>
          </View>
        )}
      </View>

      <SectionList
        style={styles.flex}
        contentContainerStyle={styles.listeContenu}
        sections={sections}
        keyExtractor={(a) => a.id}
        renderItem={ligne}
        renderSectionHeader={({ section }) => (
          <View style={styles.rayon}>
            <Ionicons name={section.rayon.icone as any} size={18} color={theme.colors.accent} />
            <Text style={styles.rayonNom}>{section.rayon.nom}</Text>
            <Text style={styles.rayonNombre}>{section.data.length}</Text>
          </View>
        )}
        ListHeaderComponent={
          <View style={styles.entetesListe}>
            {suggestion && (
              <View style={styles.carteSuggestion}>
                <Text style={styles.suggestionQuestion}>
                  {suggestion.articles
                    .map((a) => `« ${a.libelle}${a.quantite != null ? ` ${formaterQuantite(a.quantite, a.unite)}` : ''} »`)
                    .join(' et ')}{' '}
                  : le même produit ?
                </Text>
                {suggestion.verdict ? (
                  <View style={styles.propositionFusion}>
                    <Etincelle couleur={theme.colors.accent} />
                    <Text style={styles.propositionTexte}>
                      Fusionner en « {suggestion.verdict.libelle ?? suggestion.articles[0].libelle}
                      {suggestion.verdict.quantite != null
                        ? ` ${formaterQuantite(suggestion.verdict.quantite, suggestion.verdict.unite)}`
                        : ''}{' '}
                      »
                    </Text>
                  </View>
                ) : null}
                {suggestion.verdict?.quantite == null && suggestion.verdict?.explication ? (
                  <View style={styles.propositionFusion}>
                    <PastilleAVerifier raison={suggestion.verdict.explication} />
                  </View>
                ) : null}
                <View style={styles.boutons}>
                  <Bouton variante="contour" titre="Pas le même" onPress={refuserSuggestion} style={styles.boutonPied} />
                  <Bouton titre="Fusionner" onPress={accepterSuggestion} style={styles.boutonPied} />
                </View>
              </View>
            )}
            {recettesAjoutees.length > 0 && (
              <View style={styles.carteRecettes}>
                <Pressable
                  onPress={() => setVoirRecettes((v) => !v)}
                  style={styles.habituelsEntete}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: voirRecettes }}
                >
                  <Ionicons name="restaurant-outline" size={18} color={theme.colors.accent} />
                  <Text style={styles.habituelsTitre}>Recettes ajoutées ({recettesAjoutees.length})</Text>
                  <Ionicons name={voirRecettes ? 'chevron-up' : 'chevron-down'} size={18} color={theme.colors.textMuted} />
                </Pressable>
                {voirRecettes &&
                  recettesAjoutees.map((r) => (
                    <View key={r.ajoutId} style={styles.ligneRecette}>
                      <Text style={styles.recetteTitre} numberOfLines={1}>
                        {r.titre}
                        <Text style={styles.message}>{`  ${r.parts} part${r.parts > 1 ? 's' : ''}`}</Text>
                      </Text>
                      <Pressable onPress={() => retirer(r.ajoutId, r.titre)} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Retirer ${r.titre}`}>
                        <Text style={styles.lienRetirer}>Retirer</Text>
                      </Pressable>
                    </View>
                  ))}
              </View>
            )}
          </View>
        }
        stickySectionHeadersEnabled={false}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          <View style={styles.videBloc}>
            <Ionicons name="cart-outline" size={40} color={theme.colors.textMuted} />
            <Text style={styles.vide}>Rien à acheter pour l’instant.</Text>
            <Text style={styles.videAide}>Tapez un article ci-dessus : son rayon est trouvé tout seul.</Text>
          </View>
        }
      />

      <View style={styles.pied}>
        {dansCaddie > 0 && (
          <Text style={styles.caddieEnCours}>
            {dansCaddie} article{dansCaddie > 1 ? 's' : ''} déjà dans le caddie
          </Text>
        )}
        <View style={styles.boutons}>
          {duFoyer && (
            <Bouton
              variante="contour"
              titre="À la maison"
              onPress={() => navigation.navigate('Preparer', { listeId })}
              style={styles.boutonPied}
              accessibilityLabel="À la maison : vérifier la checklist du foyer avant de partir"
            />
          )}
          <Bouton
            titre={dansCaddie > 0 ? 'Reprendre les courses' : 'Je suis au magasin'}
            onPress={() => navigation.navigate('Magasin', { listeId })}
            desactive={aAcheter.length === 0 && dansCaddie === 0}
            style={styles.boutonPied}
          />
        </View>
      </View>

      <FeuilleBas
        visible={!!phrase}
        titre="Ajouter à la liste"
        onFermer={() => {
          annulationPhrase.current?.abort();
          setPhrase(null);
        }}
      >
        {phrase?.lecture ? (
          <ChargementAssistant
            etapes={['Je lis votre phrase…', 'Je range les articles…', 'Presque fini…']}
            couleur={theme.colors.accent}
            onAnnuler={() => {
              annulationPhrase.current?.abort();
              setPhrase(null);
            }}
          />
        ) : phrase?.erreur ? (
          <>
            <MessageAssistant message={phrase.erreur.message} pause={phrase.erreur.code === 'plafond'} />
            <Bouton
              variante="contour"
              titre="Ajouter tel quel"
              enCours={enCours}
              onPress={() =>
                ajouterPlusieurs(
                  phrase.texte
                    .split(/,(?!\d)|;| et /)
                    .map((m) => m.trim())
                    .filter(Boolean)
                    .map((m) => ({ libelle: m, quantite: null, unite: null }))
                )
              }
            />
          </>
        ) : phrase ? (
          <>
            <BandeauBrouillon couleur={theme.colors.accent} />
            <Text style={styles.phraseRappel}>« {phrase.texte} »</Text>
            {phrase.articles.map((a, i) => {
              const coche = phrase.coches[i];
              const quantite = a.quantite != null ? formaterQuantite(a.quantite, a.unite) : '';
              return (
                <Pressable
                  key={`${a.libelle}-${i}`}
                  onPress={() => setPhrase({ ...phrase, coches: phrase.coches.map((v, j) => (j === i ? !v : v)) })}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: coche }}
                  style={styles.phraseLigne}
                >
                  <Ionicons
                    name={coche ? 'checkbox' : 'square-outline'}
                    size={26}
                    color={coche ? theme.colors.accent : theme.colors.textMuted}
                  />
                  <Text style={[styles.phraseLibelle, !coche && { color: theme.colors.textMuted }]}>
                    {quantite ? `${quantite} ` : ''}
                    {a.libelle}
                  </Text>
                  {a.suggestion ? <Text style={styles.phraseSuggestion}>suggestion</Text> : null}
                </Pressable>
              );
            })}
            {phrase.question ? (
              <View style={styles.phraseQuestion}>
                <Etincelle couleur={theme.colors.accent} />
                <Text style={styles.phraseLibelle}>{phrase.question}</Text>
              </View>
            ) : null}
            {phrase.articles.length ? (
              <Bouton
                titre={`Tout ajouter (${phrase.coches.filter(Boolean).length})`}
                enCours={enCours}
                desactive={!phrase.coches.some(Boolean)}
                onPress={() => ajouterPlusieurs(phrase.articles.filter((_a, i) => phrase.coches[i]))}
              />
            ) : null}
          </>
        ) : null}
      </FeuilleBas>
    </KeyboardAvoidingView>
  );
}

const styles = creerStylesThemes(() => ({
  phraseRappel: { fontFamily: theme.fontBody, fontSize: 14, fontStyle: 'italic', color: theme.colors.textMuted },
  phraseLigne: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    minHeight: 52,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  phraseLibelle: { flex: 1, fontFamily: theme.fontBodyBold, fontSize: 16, color: theme.colors.text },
  phraseSuggestion: { fontFamily: theme.fontBodyBold, fontSize: 12, color: theme.colors.textMuted },
  phraseQuestion: { flexDirection: 'row', gap: theme.spacing.sm, alignItems: 'flex-start' },
  flex: { flex: 1, backgroundColor: theme.colors.background },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: theme.spacing.lg, backgroundColor: theme.colors.background },
  entete: { flexDirection: 'row', alignItems: 'center' },
  entetesListe: { gap: theme.spacing.sm },
  carteSuggestion: {
    gap: theme.spacing.sm,
    padding: theme.spacing.md,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    borderColor: theme.colors.accent,
    backgroundColor: theme.colors.selectionTransparent,
  },
  suggestionQuestion: { fontFamily: theme.fontBodyBold, fontSize: 15, color: theme.colors.text },
  propositionFusion: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs, flexWrap: 'wrap' },
  propositionTexte: { flex: 1, fontFamily: theme.fontBody, fontSize: 15, color: theme.colors.text },
  aRacheter: { gap: theme.spacing.xs },
  carteRecettes: { paddingHorizontal: theme.spacing.md, paddingVertical: 4, borderRadius: theme.radii.md, backgroundColor: theme.colors.surface },
  ligneRecette: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, minHeight: 40 },
  recetteTitre: { flex: 1, fontFamily: theme.fontBody, fontSize: 15, color: theme.colors.text },
  lienRetirer: { fontFamily: theme.fontBody, fontSize: 14, color: theme.colors.textMuted, textDecorationLine: 'underline' },
  habituelsEntete: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 36 },
  habituelsTitre: { flex: 1, fontFamily: theme.fontBodyBold, fontSize: 14, color: theme.colors.accent },
  epingle: { borderColor: theme.colors.accent },
  horsLigne: { fontFamily: theme.fontBody, fontSize: 13, color: theme.colors.warning },
  boutons: { flexDirection: 'row', gap: theme.spacing.sm },
  boutonPied: { flex: 1, minWidth: 0 },
  boutonEntete: { minHeight: 44, minWidth: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: theme.spacing.sm },
  saisie: {
    padding: theme.spacing.md,
    paddingBottom: theme.spacing.sm,
    gap: theme.spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    backgroundColor: theme.colors.background,
  },
  saisieLigne: { flexDirection: 'row', gap: theme.spacing.sm, alignItems: 'center' },
  champ: {
    flex: 1,
    minHeight: 48,
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radii.md,
    paddingHorizontal: theme.spacing.sm,
    color: theme.colors.text,
    fontFamily: theme.fontBody,
    fontSize: 16,
  },
  boutonAjout: {
    width: 48,
    height: 48,
    borderRadius: theme.radii.md,
    backgroundColor: theme.colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  suggestions: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.xs },
  suggestion: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: theme.spacing.sm,
    minHeight: 34,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  suggestionTexte: { fontFamily: theme.fontBody, fontSize: 14, color: theme.colors.text },
  message: { fontFamily: theme.fontBody, fontSize: 13, color: theme.colors.textMuted },
  listeContenu: { padding: theme.spacing.md, paddingTop: theme.spacing.sm, paddingBottom: theme.spacing.xl },
  rayon: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs, marginTop: theme.spacing.md, marginBottom: theme.spacing.xs },
  rayonNom: { flex: 1, fontFamily: theme.fontBodyBold, fontSize: 14, color: theme.colors.accent, textTransform: 'uppercase', letterSpacing: 0.5 },
  rayonNombre: { fontFamily: theme.fontBody, fontSize: 13, color: theme.colors.textMuted },
  ligne: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    marginBottom: 6,
    minHeight: 52,
  },
  appuye: { opacity: 0.6 },
  retirer: { width: 36, height: 40, alignItems: 'center', justifyContent: 'center', marginRight: -6 },
  texteBandeau: { flex: 1 },
  bandeauRetire: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, minHeight: 32 },
  annuler: { fontFamily: theme.fontBodyBold, fontSize: 14, color: theme.colors.accent, textDecorationLine: 'underline' },
  ligneTextes: { flex: 1, gap: 2 },
  libelle: { fontFamily: theme.fontBodyBold, fontSize: 16, color: theme.colors.text },
  quantite: { fontFamily: theme.fontBody, fontSize: 15, color: theme.colors.accent },
  note: { fontFamily: theme.fontBody, fontSize: 13, color: theme.colors.textMuted },
  introuvable: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  introuvableTexte: { fontFamily: theme.fontBody, fontSize: 12, color: theme.colors.warning },
  auteur: { flexDirection: 'row', alignItems: 'center', gap: 6, maxWidth: 130 },
  auteurTexte: { fontFamily: theme.fontBody, fontSize: 11, color: theme.colors.textMuted, lineHeight: 14 },
  videBloc: { alignItems: 'center', gap: theme.spacing.sm, paddingTop: theme.spacing.xl },
  vide: { fontFamily: theme.fontBodyBold, fontSize: 16, color: theme.colors.text, textAlign: 'center' },
  videAide: { fontFamily: theme.fontBody, fontSize: 14, color: theme.colors.textMuted, textAlign: 'center' },
  pied: {
    padding: theme.spacing.md,
    gap: theme.spacing.xs,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    backgroundColor: theme.colors.background,
  },
  caddieEnCours: { fontFamily: theme.fontBody, fontSize: 13, color: theme.colors.textMuted, textAlign: 'center' },
}));
