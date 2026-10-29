import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { useAuth } from '../../contexts/AuthContext';
import { listerRecettes } from '../../services/recettes';
import { ajouterCategories, proposerCategories, type Proposition } from '../../services/classement';
import SelecteurCategories from '../../components/SelecteurCategories';
import { Bouton, Icone } from '../../../../composants/ui';
import { BandeauBrouillon, MessageAssistant } from '../../../../composants/assistant';
import { useToast } from '../../../../composants/Toast';
import { messageErreurAssistant } from '../../../../services/assistant';
import { couleurs, couleursModule, creerStyles, espaces, margePage, polices, arrondis } from '../../../../theme/theme';
import type { RecetteComplete } from '../../types/models';

// Classement automatique (retour de test R-4) : l'assistant propose 1 à 3
// catégories par recette ; on relit groupe par groupe, on corrige si besoin,
// puis « Valider la catégorie » ou « Tout valider ». Rien n'est enregistré
// avant. Ouvert depuis la vignette « Sans catégorie », la fin d'un import
// My Recipe Box ou la sélection de plusieurs recettes (R-13).
// Paramètres : recetteIds (sinon toutes les recettes sans catégorie du foyer).

type Ligne = { recette: RecetteComplete; categories: string[]; nouvelles: string[] };

export default function ClassementRecettesScreen({ navigation, route }: any) {
  const { foyer } = useAuth();
  const { afficher } = useToast();
  const idsDemandes: string[] | undefined = route?.params?.recetteIds;
  const encre = couleursModule('recettes').encre;
  const [etape, setEtape] = useState<'chargement' | 'lecture' | 'revue' | 'fini'>('chargement');
  const [progression, setProgression] = useState({ faites: 0, total: 0 });
  const [lignes, setLignes] = useState<Ligne[]>([]);
  const [sansProposition, setSansProposition] = useState<string[]>([]);
  const [validees, setValidees] = useState<Set<string>>(new Set());
  const [enEdition, setEnEdition] = useState<string | null>(null);
  const [enCours, setEnCours] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    if (!foyer) return;
    let actif = true;
    (async () => {
      try {
        const toutes = await listerRecettes(foyer.id, 'foyer');
        const choisies = idsDemandes
          ? toutes.filter((r) => idsDemandes.includes(r.id))
          : toutes.filter((r) => r.categories.length === 0);
        if (!actif) return;
        if (!choisies.length) {
          setEtape('fini');
          return;
        }
        setEtape('lecture');
        setProgression({ faites: 0, total: choisies.length });
        const propositions = await proposerCategories(choisies, {
          surProgression: (faites, total) => actif && setProgression({ faites, total }),
        });
        if (!actif) return;
        const parId = new Map<string, Proposition>(propositions.map((p) => [p.recetteId, p]));
        setLignes(
          choisies
            .filter((r) => parId.has(r.id))
            .map((r) => ({ recette: r, categories: parId.get(r.id)!.categories, nouvelles: parId.get(r.id)!.nouvelles }))
        );
        setSansProposition(choisies.filter((r) => !parId.has(r.id)).map((r) => r.titre));
        setEtape('revue');
      } catch (e) {
        if (!actif) return;
        setErreur(messageErreurAssistant(e));
        setEtape('revue');
      }
    })();
    return () => {
      actif = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [foyer?.id]);

  // Groupes par première catégorie proposée, les plus fournis d'abord.
  const groupes = useMemo(() => {
    const parNom = new Map<string, Ligne[]>();
    lignes
      .filter((l) => !validees.has(l.recette.id))
      .forEach((l) => {
        const nom = l.categories[0] ?? 'Sans proposition';
        parNom.set(nom, [...(parNom.get(nom) ?? []), l]);
      });
    return [...parNom.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0], 'fr'));
  }, [lignes, validees]);

  const restantes = lignes.filter((l) => !validees.has(l.recette.id) && l.categories.length > 0);

  const valider = async (aValider: Ligne[], cle: string) => {
    const avecCategories = aValider.filter((l) => l.categories.length > 0);
    if (!avecCategories.length) return;
    setEnCours(cle);
    try {
      // Une écriture par jeu de catégories identique (souvent toute la catégorie).
      const parJeu = new Map<string, Ligne[]>();
      avecCategories.forEach((l) => {
        const k = l.categories.join('|');
        parJeu.set(k, [...(parJeu.get(k) ?? []), l]);
      });
      for (const [, ls] of parJeu) {
        await ajouterCategories(ls.map((l) => l.recette.id), ls[0].categories);
      }
      const faites = new Set(validees);
      avecCategories.forEach((l) => faites.add(l.recette.id));
      setValidees(faites);
      setEnEdition(null);
      const n = avecCategories.length;
      afficher(n === 1 ? '1 recette classée' : `${n} recettes classées`);
      if (lignes.every((l) => faites.has(l.recette.id) || l.categories.length === 0)) setEtape('fini');
    } catch (e) {
      afficher(e instanceof Error ? e.message : 'Enregistrement impossible. Réessayez.');
    } finally {
      setEnCours(null);
    }
  };

  const changer = (id: string, categories: string[]) =>
    setLignes((ls) => ls.map((l) => (l.recette.id === id ? { ...l, categories } : l)));

  if (etape === 'chargement' || etape === 'lecture') {
    return (
      <View style={[styles.racine, styles.centre]}>
        <ActivityIndicator color={encre} size="large" />
        <Text style={styles.titre}>
          {etape === 'chargement' ? 'Je regarde vos recettes…' : `Je range ${progression.total} recette${progression.total > 1 ? 's' : ''}…`}
        </Text>
        {etape === 'lecture' && progression.total > 25 ? (
          <Text style={styles.aide}>
            {Math.min(progression.faites + 25, progression.total)} sur {progression.total}
          </Text>
        ) : null}
      </View>
    );
  }

  if (etape === 'fini') {
    return (
      <View style={[styles.racine, styles.centre]}>
        <Icone nom="checkmark-circle" taille={48} couleur={couleurs.succes} />
        <Text style={styles.titre}>{validees.size ? 'Recettes classées' : 'Rien à classer'}</Text>
        <Text style={styles.aide}>
          {validees.size
            ? `${validees.size} recette${validees.size > 1 ? 's ont' : ' a'} maintenant ${validees.size > 1 ? 'leurs' : 'sa'} catégorie${validees.size > 1 ? 's' : ''}.`
            : 'Toutes vos recettes ont déjà une catégorie.'}
        </Text>
        <Bouton titre="Retour aux recettes" module="recettes" onPress={() => navigation.goBack()} />
      </View>
    );
  }

  return (
    <View style={styles.racine}>
      <ScrollView contentContainerStyle={styles.contenu} keyboardShouldPersistTaps="handled">
        {erreur ? <MessageAssistant message={erreur} /> : null}
        {lignes.length ? (
          <>
            <BandeauBrouillon />
            <Text style={styles.titre}>
              {lignes.length} recette{lignes.length > 1 ? 's' : ''} classée{lignes.length > 1 ? 's' : ''} automatiquement
            </Text>
            <Text style={styles.aide}>Touchez une recette pour changer ses catégories. Rien n’est enregistré avant de valider.</Text>
          </>
        ) : null}
        {sansProposition.length ? (
          <Text style={styles.aide}>Sans proposition : {sansProposition.join(', ')}.</Text>
        ) : null}

        {groupes.map(([nom, ls]) => (
          <View key={nom} style={styles.groupe}>
            <View style={styles.groupeEntete}>
              <Text style={[styles.groupeTitre, { color: encre }]}>
                {nom} ({ls.length})
              </Text>
              <Bouton
                titre="Valider la catégorie"
                variante="secondaire"
                petit
                enCours={enCours === nom}
                desactive={enCours !== null}
                onPress={() => valider(ls, nom)}
              />
            </View>
            {ls.map((l) => (
              <View key={l.recette.id} style={styles.ligne}>
                <Pressable
                  onPress={() => setEnEdition(enEdition === l.recette.id ? null : l.recette.id)}
                  accessibilityRole="button"
                  accessibilityLabel={`${l.recette.titre} : ${l.categories.join(', ') || 'aucune catégorie'}. Modifier`}
                >
                  <Text style={styles.recette}>{l.recette.titre}</Text>
                  <View style={styles.puces}>
                    {l.categories.map((c) => (
                      <View key={c} style={styles.puce}>
                        <Text style={styles.puceTexte}>
                          {c}
                          {l.nouvelles.includes(c) ? ' · nouvelle' : ''}
                        </Text>
                      </View>
                    ))}
                    <Icone nom={enEdition === l.recette.id ? 'chevron-up' : 'create-outline'} taille={18} couleur={couleurs.encreDouce} />
                  </View>
                </Pressable>
                {enEdition === l.recette.id ? (
                  <SelecteurCategories selection={l.categories} onChange={(c) => changer(l.recette.id, c)} />
                ) : null}
              </View>
            ))}
          </View>
        ))}
      </ScrollView>
      {restantes.length ? (
        <View style={styles.bas}>
          <Bouton
            titre={`Tout valider (${restantes.length})`}
            module="recettes"
            enCours={enCours === 'tout'}
            desactive={enCours !== null}
            onPress={() => valider(restantes, 'tout')}
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = creerStyles(() => ({
  racine: { flex: 1, backgroundColor: couleurs.fond },
  centre: { alignItems: 'center', justifyContent: 'center', gap: espaces.m, padding: margePage },
  contenu: { padding: margePage, gap: espaces.m, paddingBottom: 120 },
  titre: { fontFamily: polices.titre, fontSize: 22, color: couleurs.encre, textAlign: 'center' },
  aide: { fontFamily: polices.texte, fontSize: 14, lineHeight: 20, color: couleurs.encreDouce },
  groupe: { gap: espaces.s, marginTop: espaces.s },
  groupeEntete: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: espaces.m },
  groupeTitre: { flex: 1, fontFamily: polices.texteGras, fontSize: 17 },
  ligne: {
    gap: espaces.s,
    padding: espaces.m,
    borderRadius: arrondis.carte,
    borderWidth: 1,
    borderColor: couleurs.ligneCarte,
    backgroundColor: couleurs.surface,
  },
  recette: { fontFamily: polices.texteDemiGras, fontSize: 15, color: couleurs.encre },
  puces: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: 6 },
  puce: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: arrondis.pilule, backgroundColor: couleurs.segment },
  puceTexte: { fontFamily: polices.texteMoyen, fontSize: 13, color: couleurs.encre },
  bas: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: margePage,
    backgroundColor: couleurs.fond,
    borderTopWidth: 1,
    borderTopColor: couleurs.ligne,
  },
}));
