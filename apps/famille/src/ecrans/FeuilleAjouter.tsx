import React, { useEffect, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { useAuth } from '@apps-famille/famille';
import { FeuilleBas } from '../composants/FeuilleBas';
import { Bouton, Icone, PastilleModule, PuceFiltre } from '../composants/ui';
import { useToast } from '../composants/Toast';
import { arrondis, couleurs, couleursModule, creerStyles, espaces, polices, texte, type IdModule } from '../theme/theme';
import { ouvrirModule, ouvrirOngletModule } from '../navigation/navigationRef';
import {
  ajouterArticle,
  listerArticles,
  listerListes,
  listerProduits,
  supprimerArticle,
  type ListeResume,
} from '../modules/courses/services/courses';
import { lireSaisie } from '../modules/courses/services/saisie';

// Feuille « ⊕ Ajouter » (spécification § 2.4, charte § 7.1) : ajout rapide
// aux courses, puis les 6 raccourcis de création. Le champ « Dites ou
// écrivez ce que vous voulez ajouter » (assistant) viendra avec le socle IA ;
// en attendant, le champ ajoute aux courses, comme l'ajout rapide de Courses
// (« 2 lait, 500 g farine »), sans IA.

const RACCOURCIS: { module: IdModule; titre: string; icone: string; ouvrir: () => void }[] = [
  { module: 'recettes', titre: 'Une recette', icone: 'restaurant-outline', ouvrir: () => ouvrirModule('recettes', 'CreationRecette') },
  { module: 'courses', titre: 'Une liste de courses', icone: 'cart-outline', ouvrir: () => ouvrirModule('courses', 'ListeForm') },
  { module: 'quotidien', titre: 'Une tâche', icone: 'checkbox-outline', ouvrir: () => ouvrirModule('quotidien', 'TacheForm') },
  { module: 'cadeaux', titre: 'Une envie', icone: 'heart-outline', ouvrir: () => ouvrirOngletModule('cadeaux', 'MesEnvies') },
  { module: 'voyages', titre: 'Un voyage ou un repas', icone: 'briefcase-outline', ouvrir: () => ouvrirModule('voyages', 'NouveauVoyage') },
  { module: 'souvenirs', titre: 'Un souvenir', icone: 'images-outline', ouvrir: () => ouvrirModule('souvenirs', 'SouvenirForm') },
];

export function FeuilleAjouter({ visible, onFermer }: { visible: boolean; onFermer: () => void }) {
  const { foyer } = useAuth();
  const { afficher } = useToast();
  const [saisie, setSaisie] = useState('');
  const [listes, setListes] = useState<ListeResume[]>([]);
  const [listeId, setListeId] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setErreur(null);
    listerListes()
      .then((l) => {
        setListes(l);
        setListeId((actuelle) => actuelle && l.some((x) => x.id === actuelle) ? actuelle : (l.find((x) => x.principale) ?? l[0])?.id ?? null);
      })
      .catch(() => setListes([]));
  }, [visible]);

  const lignes = saisie
    .split(/,(?!\d)|;|\n/)
    .map((s) => s.trim())
    .filter(Boolean);

  const ajouter = async () => {
    if (!listeId || !foyer || lignes.length === 0) return;
    setEnCours(true);
    setErreur(null);
    try {
      const [produits, articles] = await Promise.all([listerProduits(foyer.id), listerArticles(listeId)]);
      const crees: string[] = [];
      for (const ligne of lignes) {
        const lu = lireSaisie(ligne);
        if (!lu.libelle) continue;
        const { article, fusionne } = await ajouterArticle(listeId, lu, produits, articles);
        if (!fusionne) crees.push(article.id);
        articles.push(article);
      }
      const liste = listes.find((l) => l.id === listeId);
      setSaisie('');
      onFermer();
      afficher(
        `${lignes.length === 1 ? 'Ajouté' : `${lignes.length} articles ajoutés`} à « ${liste?.nom ?? 'Courses'} ».`,
        crees.length ? { annuler: () => crees.forEach((id) => supprimerArticle(id).catch(() => {})) } : undefined
      );
    } catch {
      setErreur('Pas de connexion. Réessayez dans un instant.');
    } finally {
      setEnCours(false);
    }
  };

  const c = couleursModule('courses');

  return (
    <FeuilleBas visible={visible} titre="Ajouter" onFermer={onFermer}>
      <View style={styles.bloc}>
        <View style={styles.ligneTitre}>
          <Icone nom="cart-outline" taille={18} couleur={c.encre} />
          <Text style={[styles.libelle, { color: c.encre }]}>Aux courses</Text>
        </View>
        <TextInput
          value={saisie}
          onChangeText={setSaisie}
          placeholder="2 lait, 500 g farine, pain"
          placeholderTextColor={couleurs.encreDouce}
          style={styles.champ}
          returnKeyType="done"
          onSubmitEditing={ajouter}
          accessibilityLabel="Articles à ajouter aux courses, séparés par des virgules"
        />
        {listes.length > 1 ? (
          <View style={styles.listes}>
            {listes.map((l) => (
              <PuceFiltre key={l.id} libelle={l.nom} actif={l.id === listeId} onPress={() => setListeId(l.id)} />
            ))}
          </View>
        ) : null}
        {erreur ? <Text style={styles.erreur}>{erreur}</Text> : null}
        <Bouton
          titre={lignes.length > 1 ? `Tout ajouter (${lignes.length})` : 'Ajouter'}
          module="courses"
          onPress={ajouter}
          enCours={enCours}
          desactive={lignes.length === 0 || !listeId}
        />
      </View>

      <Text style={styles.sousTitre}>Créer</Text>
      <View style={styles.grille}>
        {RACCOURCIS.map((r) => (
          <Pressable
            key={r.titre}
            onPress={() => {
              onFermer();
              r.ouvrir();
            }}
            accessibilityRole="button"
            style={({ pressed }) => [styles.raccourci, pressed && { opacity: 0.8 }]}
          >
            <PastilleModule module={r.module} icone={r.icone} taille={40} />
            <Text style={styles.raccourciTexte} numberOfLines={2}>
              {r.titre}
            </Text>
          </Pressable>
        ))}
      </View>
    </FeuilleBas>
  );
}

const styles = creerStyles(() => ({
  bloc: {
    gap: espaces.m,
    padding: espaces.l,
    borderRadius: arrondis.carte,
    backgroundColor: couleurs.fond,
  },
  ligneTitre: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  libelle: { fontFamily: polices.texteGras, fontSize: 14 },
  champ: {
    minHeight: 50,
    borderRadius: arrondis.champ,
    borderWidth: 1,
    borderColor: couleurs.ligne,
    backgroundColor: couleurs.surface,
    paddingHorizontal: espaces.l,
    fontFamily: polices.texte,
    fontSize: 16,
    color: couleurs.encre,
  },
  listes: { flexDirection: 'row', flexWrap: 'wrap', gap: espaces.s },
  erreur: { fontFamily: polices.texteDemiGras, fontSize: 14, color: couleurs.alerte },
  sousTitre: { ...texte.libelleSection(), marginTop: espaces.s },
  grille: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  raccourci: {
    flexBasis: '47%',
    flexGrow: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaces.m,
    minHeight: 64,
    padding: espaces.m,
    borderRadius: arrondis.champ,
    borderWidth: 1,
    borderColor: couleurs.ligneCarte,
    backgroundColor: couleurs.surface,
  },
  raccourciTexte: { flex: 1, fontFamily: polices.texteDemiGras, fontSize: 14, color: couleurs.encre },
}));
