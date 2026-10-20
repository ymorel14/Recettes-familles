import React, { useEffect, useRef, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { useAuth } from '@apps-famille/famille';
import { FeuilleBas } from '../composants/FeuilleBas';
import { Bouton, Icone, PastilleModule, PuceFiltre } from '../composants/ui';
import { BandeauBrouillon, ChargementAssistant, Etincelle, MessageAssistant } from '../composants/assistant';
import { ChampAssistant } from '../composants/ChampAssistant';
import { useToast } from '../composants/Toast';
import { arrondis, couleurs, couleursModule, creerStyles, espaces, polices, texte, type IdModule } from '../theme/theme';
import { ouvrirModule, ouvrirOngletModule } from '../navigation/navigationRef';
import { appelerAssistant, ErreurAssistant, messageErreurAssistant } from '../services/assistant';
import {
  ajouterArticles,
  creerEnvieProposee,
  creerSouvenirPropose,
  creerTacheProposee,
  listeVisee,
  retirerArticles,
  retirerSouvenir,
  retirerTache,
  tacheVersLigne,
  type ActionProposee,
  type ReponsePlus,
} from '../services/actionsAssistant';
import { listerListes, type ListeResume } from '../modules/courses/services/courses';
import { listerPersonnes } from '../modules/quotidien/services/personnes';
import { libellePlanif } from '../modules/quotidien/services/maison';

// Feuille « ⊕ Ajouter » (spécification § 4.6.1, charte § 7.1 et § 7.4) :
// on dit ou écrit ce qu'on veut ajouter ; l'assistant propose une carte par
// action (couleur du module, case cochée, « Modifier ») ; RIEN n'est créé
// avant « Tout ajouter ». Puis un toast « 3 ajouts : … » avec « Annuler ».
// En dessous, les 6 raccourcis de création, sans assistant.

const RACCOURCIS: { module: IdModule; titre: string; icone: string; ouvrir: () => void }[] = [
  { module: 'recettes', titre: 'Une recette', icone: 'restaurant-outline', ouvrir: () => ouvrirModule('recettes', 'CreationRecette') },
  { module: 'courses', titre: 'Une liste de courses', icone: 'cart-outline', ouvrir: () => ouvrirModule('courses', 'ListeForm') },
  { module: 'quotidien', titre: 'Une tâche', icone: 'checkbox-outline', ouvrir: () => ouvrirModule('quotidien', 'TacheForm') },
  { module: 'cadeaux', titre: 'Une envie', icone: 'heart-outline', ouvrir: () => ouvrirOngletModule('cadeaux', 'MesEnvies') },
  { module: 'voyages', titre: 'Un voyage ou un repas', icone: 'briefcase-outline', ouvrir: () => ouvrirModule('voyages', 'NouveauVoyage') },
  { module: 'souvenirs', titre: 'Un souvenir', icone: 'images-outline', ouvrir: () => ouvrirModule('souvenirs', 'SouvenirForm') },
];

const MODULE_DE: Record<ActionProposee['type'], IdModule> = {
  courses: 'courses',
  tache: 'quotidien',
  envie: 'cadeaux',
  souvenir: 'souvenirs',
  recette: 'recettes',
};
const NOM_MODULE: Record<IdModule, string> = {
  recettes: 'Recettes',
  courses: 'Courses',
  quotidien: 'Quotidien',
  cadeaux: 'Cadeaux',
  voyages: 'Voyages',
  souvenirs: 'Souvenirs',
};

type Carte = {
  cle: string;
  action: ActionProposee;
  cochee: boolean;
  articlesCoches: boolean[];
  listeId: string | null;
  titre: string; // modifiable (tâche, envie, souvenir)
  edition: boolean;
  probleme: string | null; // tâche qui ne peut pas être créée telle quelle
};

type Etape = 'saisie' | 'lecture' | 'confirmation';

function dateCourte(iso: string | null): string {
  if (!iso) return '';
  const [a, m, j] = iso.split('-').map(Number);
  return new Date(a, m - 1, j).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
}

export function FeuilleAjouter({ visible, onFermer }: { visible: boolean; onFermer: () => void }) {
  const { session, foyer, famille } = useAuth();
  const { afficher } = useToast();
  const [etape, setEtape] = useState<Etape>('saisie');
  const [saisie, setSaisie] = useState('');
  const [cartes, setCartes] = useState<Carte[]>([]);
  const [question, setQuestion] = useState<string | null>(null);
  const [erreur, setErreur] = useState<ErreurAssistant | null>(null);
  const [listes, setListes] = useState<ListeResume[]>([]);
  const [personnes, setPersonnes] = useState<{ id: string; prenom: string }[]>([]);
  const [enCours, setEnCours] = useState(false);
  const annulation = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!visible || !foyer) return;
    listerListes().then(setListes).catch(() => setListes([]));
    listerPersonnes([foyer.id])
      .then((ps) => setPersonnes(ps.map((p) => ({ id: p.id, prenom: p.prenom }))))
      .catch(() => setPersonnes([]));
  }, [visible, foyer?.id]);

  const recommencer = () => {
    setEtape('saisie');
    setCartes([]);
    setQuestion(null);
    setErreur(null);
  };

  const fermer = () => {
    annulation.current?.abort();
    onFermer();
    setTimeout(() => {
      recommencer();
      setSaisie('');
    }, 300);
  };

  const envoyer = async () => {
    const texteSaisi = saisie.trim();
    if (!texteSaisi) return;
    setErreur(null);
    setQuestion(null);
    setEtape('lecture');
    const controle = new AbortController();
    annulation.current = controle;
    try {
      const r = await appelerAssistant<ReponsePlus>('plus', { texte: texteSaisi }, { signal: controle.signal });
      if (controle.signal.aborted) return;
      if (!r.actions.length) {
        setQuestion(r.question ?? 'Je n’ai pas compris quoi ajouter. Pouvez-vous préciser ?');
        setEtape('saisie');
        return;
      }
      setQuestion(r.question);
      setCartes(
        r.actions.map((a, i) => {
          const probleme = a.type === 'tache' && a.tache ? tacheVersLigne(a.tache, personnes) : null;
          return {
            cle: `${i}-${a.type}`,
            action: a,
            cochee: !a.incertain && typeof probleme !== 'string',
            articlesCoches: a.articles.map((x) => !x.suggestion),
            listeId: a.type === 'courses' ? listeVisee(listes, a.liste)?.id ?? null : null,
            titre: a.tache?.libelle ?? a.envie?.titre ?? a.souvenir?.titre ?? a.resume,
            edition: false,
            probleme: typeof probleme === 'string' ? probleme : null,
          };
        })
      );
      setEtape('confirmation');
    } catch (e) {
      if (controle.signal.aborted) return;
      setErreur(e instanceof ErreurAssistant ? e : new ErreurAssistant('indisponible', messageErreurAssistant(e)));
      setEtape('saisie');
    }
  };

  const changer = (cle: string, maj: Partial<Carte>) => setCartes((cs) => cs.map((c) => (c.cle === cle ? { ...c, ...maj } : c)));

  const aAjouter = cartes.filter(
    (c) => c.cochee && (c.action.type !== 'courses' || (c.listeId && c.articlesCoches.some(Boolean)))
  );

  const toutAjouter = async () => {
    if (!session || !foyer || !famille) return;
    setEnCours(true);
    const annulations: (() => Promise<void>)[] = [];
    const faits: IdModule[] = [];
    const ratees: string[] = [];
    let recetteAOuvrir: string | null = null;
    for (const c of aAjouter) {
      const a = c.action;
      try {
        if (a.type === 'courses' && c.listeId) {
          const ids = await ajouterArticles(c.listeId, foyer.id, a.articles.filter((_x, i) => c.articlesCoches[i]));
          annulations.push(() => retirerArticles(ids));
        } else if (a.type === 'tache' && a.tache) {
          const id = await creerTacheProposee({ ...a.tache, libelle: c.titre }, foyer.id, personnes);
          annulations.push(() => retirerTache(id));
        } else if (a.type === 'envie' && a.envie) {
          await creerEnvieProposee({ ...a.envie, titre: c.titre }, session.user.id);
        } else if (a.type === 'souvenir' && a.souvenir) {
          const id = await creerSouvenirPropose({ ...a.souvenir, titre: c.titre }, famille.id, session.user.id, personnes);
          annulations.push(() => retirerSouvenir(id));
        } else if (a.type === 'recette' && a.lien) {
          recetteAOuvrir = a.lien;
        }
        faits.push(MODULE_DE[a.type]);
      } catch {
        ratees.push(c.titre);
      }
    }
    setEnCours(false);
    fermer();
    const modules = [...new Set(faits.filter((m) => m !== 'recettes'))].map((m) => NOM_MODULE[m]);
    const nb = faits.filter((m) => m !== 'recettes').length;
    if (ratees.length) {
      afficher(`Pas pu ajouter : ${ratees.join(', ')}. Réessayez dans un instant.`);
    } else if (nb > 0) {
      afficher(`${nb === 1 ? '1 ajout' : `${nb} ajouts`} : ${modules.join(', ')}`, annulations.length ? { annuler: () => annulations.forEach((f) => f()) } : undefined);
    }
    if (recetteAOuvrir) ouvrirModule('recettes', 'ImportWeb', { url: recetteAOuvrir });
  };

  // Ajout aux courses sans assistant (pas de réseau, pause du plafond…).
  const ajouterTelQuel = async () => {
    if (!foyer) return;
    const liste = listeVisee(listes, null);
    if (!liste) return;
    const morceaux = saisie.split(/,(?!\d)|;|\n| et /).map((s) => s.trim()).filter(Boolean);
    setEnCours(true);
    try {
      const ids = await ajouterArticles(
        liste.id,
        foyer.id,
        morceaux.map((m) => ({ libelle: m, quantite: null, unite: null, suggestion: false }))
      );
      fermer();
      afficher(`${morceaux.length === 1 ? 'Ajouté' : `${morceaux.length} articles ajoutés`} à « ${liste.nom} ».`, {
        annuler: () => retirerArticles(ids),
      });
    } catch {
      afficher('Pas de connexion. Réessayez dans un instant.');
    } finally {
      setEnCours(false);
    }
  };

  const modifierTache = (c: Carte) => {
    if (!c.action.tache) return;
    setCartes((cs) => cs.filter((x) => x.cle !== c.cle));
    if (cartes.length <= 1) fermer();
    else onFermer();
    ouvrirModule('quotidien', 'TacheForm', { brouillon: { ...c.action.tache, libelle: c.titre } });
  };

  return (
    <FeuilleBas visible={visible} titre={etape === 'confirmation' ? 'Vérifiez avant d’ajouter' : 'Ajouter'} onFermer={fermer}>
      {etape === 'lecture' ? (
        <ChargementAssistant
          etapes={['Je lis votre demande…', 'Je range par module…', 'Presque fini…']}
          onAnnuler={() => {
            annulation.current?.abort();
            setEtape('saisie');
          }}
        />
      ) : null}

      {etape === 'saisie' ? (
        <>
          <ChampAssistant
            valeur={saisie}
            onChange={setSaisie}
            onValider={envoyer}
            placeholder="Dites ou écrivez ce que vous voulez ajouter"
            exemples={['Ajoute du lait et des œufs', 'Rappelle-moi le dentiste jeudi', 'Note que Léo a gagné son match']}
          />
          {question ? (
            <View style={styles.question}>
              <Etincelle />
              <Text style={styles.questionTexte}>{question}</Text>
            </View>
          ) : null}
          {erreur ? (
            <MessageAssistant
              message={erreur.message}
              pause={erreur.code === 'plafond'}
              onReessayer={erreur.code === 'reseau' || erreur.code === 'indisponible' ? envoyer : undefined}
            />
          ) : null}
          {erreur && listes.length ? (
            <Bouton variante="secondaire" petit icone="cart-outline" titre="Ajouter aux courses tel quel" onPress={ajouterTelQuel} enCours={enCours} />
          ) : null}
          <Bouton
            titre="Envoyer à l’assistant"
            icone="arrow-up"
            onPress={envoyer}
            desactive={!saisie.trim()}
          />

          <Text style={styles.sousTitre}>Créer</Text>
          <View style={styles.grille}>
            {RACCOURCIS.map((r) => (
              <Pressable
                key={r.titre}
                onPress={() => {
                  fermer();
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
        </>
      ) : null}

      {etape === 'confirmation' ? (
        <>
          <BandeauBrouillon />
          <Text style={styles.rappel} numberOfLines={2}>
            « {saisie.trim()} »
          </Text>
          {cartes.map((c) => (
            <CarteAction
              key={c.cle}
              carte={c}
              listes={listes}
              onChanger={(maj) => changer(c.cle, maj)}
              onModifierTache={() => modifierTache(c)}
            />
          ))}
          {question ? (
            <View style={styles.question}>
              <Etincelle />
              <Text style={styles.questionTexte}>{question}</Text>
            </View>
          ) : null}
          <Bouton
            titre={aAjouter.length > 1 ? `Tout ajouter (${aAjouter.length})` : aAjouter.length === 1 ? 'Ajouter' : 'Rien à ajouter'}
            onPress={toutAjouter}
            enCours={enCours}
            desactive={aAjouter.length === 0}
          />
          <Bouton variante="secondaire" titre="Modifier ma phrase" onPress={recommencer} />
        </>
      ) : null}
    </FeuilleBas>
  );
}

// Une carte par action proposée (charte § 7.4).
function CarteAction({
  carte: c,
  listes,
  onChanger,
  onModifierTache,
}: {
  carte: Carte;
  listes: ListeResume[];
  onChanger: (maj: Partial<Carte>) => void;
  onModifierTache: () => void;
}) {
  const a = c.action;
  const module = MODULE_DE[a.type];
  const m = couleursModule(module);
  const liste = listes.find((l) => l.id === c.listeId);

  let entete = NOM_MODULE[module];
  let detail: string | null = null;
  if (a.type === 'courses') entete = `Courses · ${liste?.nom ?? 'liste à choisir'}`;
  if (a.type === 'tache' && a.tache) {
    const ligne = tacheVersLigne({ ...a.tache, libelle: c.titre || 'x' }, []);
    detail = typeof ligne === 'string' ? ligne : libellePlanif({ planif: ligne.planif, recurrence: ligne.recurrence, debut: ligne.periode_debut, fin: ligne.periode_fin }) || 'Une fois, sans date';
    if (a.tache.pour.length) detail += ` · pour ${a.tache.pour.join(', ')}`;
  }
  if (a.type === 'envie') entete = 'Cadeaux · Mes envies';
  if (a.type === 'envie' && a.envie?.prix != null) detail = `≈ ${a.envie.prix.toLocaleString('fr-FR')} €`;
  if (a.type === 'souvenir' && a.souvenir) detail = [dateCourte(a.souvenir.date) || 'Aujourd’hui', a.souvenir.personnes.join(', ')].filter(Boolean).join(' · ');
  if (a.type === 'recette') {
    entete = 'Recettes · importer';
    detail = a.lien;
  }
  const aVerifier = a.type === 'tache' && (a.tache?.a_verifier.length ?? 0) > 0;

  return (
    <View style={[styles.carte, !c.cochee && styles.carteDecochee]}>
      <View style={styles.carteLigne}>
        <PastilleModule module={module} taille={40} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={[styles.carteEntete, { color: m.encre }]}>{entete}</Text>
          {a.type !== 'courses' ? (
            c.edition ? (
              <TextInput
                value={c.titre}
                onChangeText={(t) => onChanger({ titre: t })}
                style={styles.carteChamp}
                autoFocus
                onBlur={() => onChanger({ edition: false })}
                accessibilityLabel="Modifier"
              />
            ) : (
              <Text style={styles.carteTitre}>{a.type === 'recette' ? a.resume : c.titre}</Text>
            )
          ) : null}
          {detail ? <Text style={[styles.carteDetail, (c.probleme || aVerifier) && { color: couleurs.attention }]}>{detail}</Text> : null}
          {a.incertain ? <Text style={styles.incertain}>Suggestion de l’assistant : à vous de voir</Text> : null}
        </View>
        <Pressable
          onPress={() => onChanger({ cochee: !c.cochee })}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: c.cochee }}
          accessibilityLabel={`${entete} ${c.titre}`}
          hitSlop={8}
          style={[styles.caseACocher, c.cochee && { backgroundColor: couleurs.succes, borderColor: couleurs.succes }]}
        >
          {c.cochee ? <Icone nom="checkmark" taille={18} couleur="#FFFFFF" /> : null}
        </Pressable>
      </View>

      {a.type === 'courses' ? (
        <View style={styles.articles}>
          {a.articles.map((x, i) => {
            const coche = c.articlesCoches[i];
            const libelle = [x.quantite != null ? `${x.quantite}${x.unite ? ` ${x.unite}` : ''}` : '', x.libelle].filter(Boolean).join(' ');
            return (
              <Pressable
                key={`${x.libelle}-${i}`}
                onPress={() => onChanger({ articlesCoches: c.articlesCoches.map((v, j) => (j === i ? !v : v)) })}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: coche }}
                style={[styles.article, coche ? { backgroundColor: m.fond, borderColor: m.fond } : null]}
              >
                <Icone nom={coche ? 'checkmark-circle' : 'ellipse-outline'} taille={16} couleur={coche ? m.encre : couleurs.encreDouce} />
                <Text style={[styles.articleTexte, coche && { color: m.encre }]}>{libelle}</Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      {a.type === 'courses' && c.edition && listes.length > 1 ? (
        <View style={styles.articles}>
          {listes.map((l) => (
            <PuceFiltre key={l.id} libelle={l.nom} actif={l.id === c.listeId} onPress={() => onChanger({ listeId: l.id, edition: false })} />
          ))}
        </View>
      ) : null}

      {a.type !== 'recette' && !(a.type === 'courses' && listes.length < 2) ? (
        <Pressable
          onPress={() => (a.type === 'tache' ? onModifierTache() : onChanger({ edition: !c.edition }))}
          accessibilityRole="button"
          hitSlop={6}
          style={styles.modifier}
        >
          <Text style={styles.modifierTexte}>
            {a.type === 'tache' ? 'Modifier dans le formulaire' : a.type === 'courses' ? (listes.length > 1 ? 'Changer de liste' : '') : 'Modifier'}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = creerStyles(() => ({
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
  question: {
    flexDirection: 'row',
    gap: espaces.s,
    alignItems: 'flex-start',
    padding: espaces.l,
    borderRadius: arrondis.champ,
    backgroundColor: couleurs.segment,
  },
  questionTexte: { flex: 1, fontFamily: polices.texteDemiGras, fontSize: 15, lineHeight: 21, color: couleurs.encre },
  rappel: { fontFamily: polices.texte, fontSize: 14, fontStyle: 'italic', color: couleurs.encreDouce },
  carte: {
    gap: espaces.m,
    padding: espaces.l,
    borderRadius: arrondis.carte,
    borderWidth: 1,
    borderColor: couleurs.ligneCarte,
    backgroundColor: couleurs.surface,
  },
  carteDecochee: { opacity: 0.75, borderStyle: 'dashed' },
  carteLigne: { flexDirection: 'row', alignItems: 'center', gap: espaces.m },
  carteEntete: { fontFamily: polices.texteGras, fontSize: 12, letterSpacing: 0.3, textTransform: 'uppercase' },
  carteTitre: { fontFamily: polices.texteGras, fontSize: 15, lineHeight: 20, color: couleurs.encre },
  carteChamp: {
    fontFamily: polices.texteGras,
    fontSize: 15,
    color: couleurs.encre,
    borderBottomWidth: 1.5,
    borderBottomColor: couleurs.encre,
    paddingVertical: 4,
  },
  carteDetail: { fontFamily: polices.texteMoyen, fontSize: 13, color: couleurs.encreDouce },
  incertain: { fontFamily: polices.texteDemiGras, fontSize: 12, color: couleurs.attention },
  caseACocher: {
    width: 28,
    height: 28,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: couleurs.ligne,
    alignItems: 'center',
    justifyContent: 'center',
  },
  articles: { flexDirection: 'row', flexWrap: 'wrap', gap: espaces.s },
  article: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 36,
    paddingHorizontal: 12,
    borderRadius: arrondis.pilule,
    borderWidth: 1,
    borderColor: couleurs.ligne,
  },
  articleTexte: { fontFamily: polices.texteDemiGras, fontSize: 14, color: couleurs.encreDouce },
  modifier: { alignSelf: 'flex-start' },
  modifierTexte: { fontFamily: polices.texteGras, fontSize: 13, color: couleurs.encre, textDecorationLine: 'underline' },
}));
