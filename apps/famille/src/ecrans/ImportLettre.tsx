import React, { useEffect, useRef, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useAuth } from '@apps-famille/famille';
import { PanneauPhotos } from '../composants/PanneauPhotos';
import { ChampAssistant } from '../composants/ChampAssistant';
import { Bouton, Carte, ControleSegmente, LibelleSection } from '../composants/ui';
import { CaseACocher, Champ } from '../composants/formulaire';
import { BandeauBrouillon, ChargementAssistant, Etincelle, MessageAssistant, PastilleAVerifier } from '../composants/assistant';
import { useAppelAssistant } from '../composants/useAppelAssistant';
import { useToast } from '../composants/Toast';
import { photosPourAssistant, type PhotoChoisie } from '../services/photosAssistant';
import { creerSouhait, type FormulaireSouhait } from '../modules/cadeaux/services/wishlist';
import { couleurs, couleursModule, creerStyles, espaces, margePage, polices } from '../theme/theme';

// « Importer une lettre au Père Noël » (Cadeaux, liste d'un enfant gérée par
// son parent ; spécification § 4.4.3) : photo de la lettre ou du dessin, ou
// dictée de l'enfant → une ligne par cadeau, que le parent coche et corrige
// avant « Ajouter ». Seul le prénom de l'enfant est envoyé à l'assistant.

type SouhaitLu = { nom: string; details: string | null; a_verifier: boolean };
type Ligne = SouhaitLu & { cochee: boolean };

function formulaire(nom: string, details: string): FormulaireSouhait {
  return {
    titre: nom.trim(),
    description: details.trim(),
    lien: '',
    image: null,
    photoLocale: null,
    prix: '',
    typePrix: 'estime',
    taille: '',
    priorite: 2,
    quantite: 1,
    potCommun: false,
    modeOptions: null,
    options: [],
  };
}

export default function ImportLettre({ navigation, route }: any) {
  const { listeId, prenom } = route.params as { listeId: string; prenom?: string; photos?: PhotoChoisie[] };
  const { session } = useAuth();
  const { afficher } = useToast();
  const c = couleursModule('cadeaux');
  const [maniere, setManiere] = useState<'photo' | 'dictee'>('photo');
  const [photos, setPhotos] = useState<PhotoChoisie[]>(route.params?.photos ?? []);
  const [texte, setTexte] = useState('');
  const [lignes, setLignes] = useState<Ligne[] | null>(null);
  const [question, setQuestion] = useState<string | null>(null);
  const [enregistrement, setEnregistrement] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const { lecture, message, lancer, annuler } = useAppelAssistant();
  const dejaLancee = useRef(false);

  const lire = async (liste = photos) => {
    const r = await lancer<{ souhaits: SouhaitLu[]; question: string | null }>('lettre-noel', async () =>
      maniere === 'dictee' && texte.trim()
        ? { texte: texte.trim(), prenom: prenom ?? '' }
        : { fichiers: await photosPourAssistant(liste), prenom: prenom ?? '' }
    );
    if (!r) return;
    setLignes(r.souhaits.map((s) => ({ ...s, cochee: true })));
    setQuestion(r.question);
  };

  useEffect(() => {
    if (route.params?.photos?.length && !dejaLancee.current) {
      dejaLancee.current = true;
      lire(route.params.photos);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const changer = (i: number, champs: Partial<Ligne>) => setLignes((ls) => (ls ? ls.map((l, j) => (j === i ? { ...l, ...champs } : l)) : ls));
  const cochees = (lignes ?? []).filter((l) => l.cochee && l.nom.trim());

  const ajouter = async () => {
    if (!session || !cochees.length) return;
    setErreur(null);
    setEnregistrement(true);
    let faits = 0;
    try {
      for (const l of cochees) {
        await creerSouhait(listeId, session.user.id, formulaire(l.nom, l.details ?? ''), false);
        faits += 1;
      }
      afficher(`${faits} envie${faits > 1 ? 's' : ''} ajoutée${faits > 1 ? 's' : ''} à la liste${prenom ? ` de ${prenom}` : ''}`);
      navigation.goBack();
    } catch (e: any) {
      setErreur(`${faits ? `${faits} ajoutée${faits > 1 ? 's' : ''}, puis ` : ''}enregistrement impossible${e?.message ? ` : ${e.message}` : ''}.`);
    } finally {
      setEnregistrement(false);
    }
  };

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.contenu} keyboardShouldPersistTaps="handled">
      {!lignes ? (
        <>
          <View style={styles.titreLigne}>
            <Etincelle couleur={c.encre} taille={18} />
            <Text style={styles.titre}>La lettre{prenom ? ` de ${prenom}` : ''}</Text>
          </View>
          <Text style={styles.aide}>
            Photographiez la lettre ou le dessin, ou notez ce que l’enfant dicte. L’assistant fait la liste des cadeaux ;
            vous validez chaque ligne.
          </Text>
          <ControleSegmente
            valeur={maniere}
            onChange={setManiere}
            options={[
              { id: 'photo', libelle: 'Photo' },
              { id: 'dictee', libelle: 'Dictée' },
            ]}
          />
          {lecture ? (
            <ChargementAssistant
              couleur={c.encre}
              etapes={['Je lis la lettre…', 'Je déchiffre les mots…', 'Je fais la liste…']}
              onAnnuler={annuler}
            />
          ) : (
            <>
              {maniere === 'photo' ? (
                <PanneauPhotos photos={photos} onChange={setPhotos} max={3} module="cadeaux" />
              ) : (
                <ChampAssistant
                  valeur={texte}
                  onChange={setTexte}
                  placeholder="Ce que l’enfant demande…"
                  exemples={['Un vélo rouge, des Lego et un livre de dinosaures']}
                />
              )}
              {(maniere === 'photo' && photos.length) || (maniere === 'dictee' && texte.trim()) ? (
                <Bouton titre="✦ Faire la liste" module="cadeaux" onPress={() => lire()} />
              ) : null}
              {message ? (
                <MessageAssistant message={message.texte} pause={message.pause} onRemplirALaMain={() => navigation.goBack()} />
              ) : null}
            </>
          )}
        </>
      ) : (
        <>
          <BandeauBrouillon couleur={c.encre} />
          {question ? (
            <View style={styles.question}>
              <Etincelle couleur={c.encre} />
              <Text style={styles.questionTexte}>{question}</Text>
            </View>
          ) : null}
          <LibelleSection>{`Cadeaux demandés (${lignes.length})`}</LibelleSection>
          {lignes.map((l, i) => (
            <Carte key={i} style={[styles.ligne, !l.cochee && { opacity: 0.55 }]}>
              <View style={styles.ligneHaut}>
                <Champ style={{ flex: 1 }} value={l.nom} onChangeText={(v) => changer(i, { nom: v })} aVerifier={l.a_verifier} accessibilityLabel={`Cadeau ${i + 1}`} />
                <CaseACocher cochee={l.cochee} onChange={(v) => changer(i, { cochee: v })} libelle={l.nom} />
              </View>
              {l.a_verifier ? <PastilleAVerifier raison="mot difficile à lire" /> : null}
              {l.cochee ? (
                <Champ value={l.details ?? ''} onChangeText={(v) => changer(i, { details: v })} placeholder="Précision (couleur, taille…)" />
              ) : null}
            </Carte>
          ))}
          {erreur ? <Text style={styles.erreur}>{erreur}</Text> : null}
          <Bouton
            titre={`Ajouter ${cochees.length > 1 ? `les ${cochees.length} envies` : 'l’envie'}`}
            module="cadeaux"
            desactive={!cochees.length}
            enCours={enregistrement}
            onPress={ajouter}
          />
          <Bouton titre="Recommencer" variante="lien" onPress={() => setLignes(null)} />
        </>
      )}
    </ScrollView>
  );
}

const styles = creerStyles(() => ({
  page: { flex: 1, backgroundColor: couleurs.fond },
  contenu: { padding: margePage, gap: espaces.l, paddingBottom: 48 },
  titreLigne: { flexDirection: 'row', alignItems: 'center', gap: espaces.s },
  titre: { fontFamily: polices.titre, fontSize: 24, color: couleurs.encre },
  aide: { fontFamily: polices.texte, fontSize: 14, lineHeight: 20, color: couleurs.encreDouce },
  question: { flexDirection: 'row', gap: espaces.s, padding: espaces.l, borderRadius: 14, backgroundColor: couleurs.segment },
  questionTexte: { flex: 1, fontFamily: polices.texteDemiGras, fontSize: 15, lineHeight: 21, color: couleurs.encre },
  ligne: { gap: espaces.s },
  ligneHaut: { flexDirection: 'row', alignItems: 'center', gap: espaces.s },
  erreur: { fontFamily: polices.texteDemiGras, fontSize: 14, color: couleurs.attention },
}));
