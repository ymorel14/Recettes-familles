import React, { useEffect, useRef, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { PanneauPhotos } from '../composants/PanneauPhotos';
import { Bouton, Carte, LibelleSection, PuceFiltre } from '../composants/ui';
import { CaseACocher, Champ } from '../composants/formulaire';
import { BandeauBrouillon, ChargementAssistant, Etincelle, MessageAssistant, PastilleAVerifier } from '../composants/assistant';
import { useAppelAssistant } from '../composants/useAppelAssistant';
import { useToast } from '../composants/Toast';
import { choisirPdf, ErreurPhoto, photosPourAssistant, type FichierAssistant, type PhotoChoisie } from '../services/photosAssistant';
import { ajouterHeures, creerSeancesDatees, type ActiviteLue, type PlanningLu } from '../services/planningAssistant';
import { JOURS, listerGroupes, lireHeureSaisie, type Groupe } from '../modules/quotidien/services/quotidien';
import { couleurs, couleursModule, creerStyles, espaces, margePage, polices } from '../theme/theme';

// « Importer un planning » (Quotidien › Groupe, et ⊕ photo) : photo ou PDF
// du planning du club, du calendrier des matchs, du mot de l'école →
// brouillon (spécification § 4.3.1). Activités de chaque semaine : ouvertes
// dans le formulaire habituel, pré-rempli. Dates précises (matchs) : liste à
// cocher, puis « Ajouter » crée les séances et leurs trajets.

type LigneSeance = {
  cochee: boolean;
  date: string;
  debut: string;
  fin: string;
  lieu: string;
  note: string;
  aVerifier: boolean;
};

function dateCourte(iso: string): string {
  const [a, m, j] = iso.split('-').map(Number);
  const t = new Date(a, m - 1, j).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function noteDe(adversaire: string | null, domicile: boolean | null): string {
  if (!adversaire) return '';
  return `Contre ${adversaire}${domicile === false ? ' (extérieur)' : domicile === true ? ' (domicile)' : ''}`;
}

export default function ImportPlanning({ navigation, route }: any) {
  const c = couleursModule('quotidien');
  const { afficher } = useToast();
  const [groupes, setGroupes] = useState<Groupe[]>([]);
  const [groupeId, setGroupeId] = useState<string | null>(route?.params?.groupeId ?? null);
  const [photos, setPhotos] = useState<PhotoChoisie[]>(route?.params?.photos ?? []);
  const [pdf, setPdf] = useState<{ nom: string; fichier: FichierAssistant } | null>(null);
  const [precision, setPrecision] = useState('');
  const [planning, setPlanning] = useState<PlanningLu | null>(null);
  const [nom, setNom] = useState('');
  const [lignes, setLignes] = useState<LigneSeance[]>([]);
  const [enregistrement, setEnregistrement] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const { lecture, message, setMessage, lancer, annuler } = useAppelAssistant();
  const dejaLancee = useRef(false);

  const groupe = groupes.find((g) => g.id === groupeId) ?? null;

  useEffect(() => {
    listerGroupes()
      .then((g) => {
        setGroupes(g);
        if (!groupeId && g.length === 1) setGroupeId(g[0].id);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const lire = async (liste = photos) => {
    const fichiers = async () => ({
      fichiers: pdf ? [pdf.fichier] : await photosPourAssistant(liste),
      ...(precision.trim() ? { precision: precision.trim() } : {}),
    });
    const r = await lancer<PlanningLu>('planning-photo', fichiers, 120000);
    if (!r) return;
    setPlanning(r);
    setNom(r.titre ?? '');
    setLignes(
      r.seances.map((s) => ({
        cochee: true,
        date: s.date,
        debut: s.heure_debut ?? '',
        fin: s.heure_fin ?? (s.heure_debut ? ajouterHeures(s.heure_debut, 2) : ''),
        lieu: s.lieu ?? '',
        note: noteDe(s.adversaire, s.domicile),
        aVerifier: s.a_verifier || !s.heure_fin,
      }))
    );
  };

  // Arrivée depuis le ⊕ avec une photo : lecture immédiate.
  useEffect(() => {
    if (route?.params?.photos?.length && !dejaLancee.current) {
      dejaLancee.current = true;
      lire(route.params.photos);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const prendrePdf = async () => {
    setMessage(null);
    try {
      const p = await choisirPdf();
      if (p) {
        setPdf(p);
        setPhotos([]);
      }
    } catch (e) {
      setMessage({ texte: e instanceof ErreurPhoto ? e.message : 'PDF illisible.' });
    }
  };

  const ouvrirActivite = (a: ActiviteLue) => {
    if (!groupe) return setErreur('Choisissez d’abord le groupe.');
    navigation.navigate('ActiviteForm', { groupeId: groupe.id, zone: groupe.zone_vacances, brouillon: a });
  };

  const cochees = lignes.filter((l) => l.cochee);

  const ajouterSeances = async () => {
    setErreur(null);
    if (!groupe) return setErreur('Choisissez d’abord le groupe.');
    if (!nom.trim()) return setErreur('Donnez un nom à ces dates (ex. Matchs U11).');
    const seances = [];
    for (const l of cochees) {
      const debut = lireHeureSaisie(l.debut);
      const fin = lireHeureSaisie(l.fin);
      if (!debut || !fin || fin <= debut) {
        return setErreur(`Vérifiez les horaires du ${dateCourte(l.date)} (ex. 14:00 et 16:00).`);
      }
      seances.push({ date: l.date, heure_debut: debut, heure_fin: fin, lieu: l.lieu.trim() || null, note: l.note.trim() || null });
    }
    setEnregistrement(true);
    try {
      const n = await creerSeancesDatees(groupe.id, nom, seances);
      afficher(`${n} séance${n > 1 ? 's' : ''} ajoutée${n > 1 ? 's' : ''}, avec leurs trajets`);
      navigation.goBack();
    } catch (e: any) {
      setErreur(e?.message ? `Enregistrement impossible : ${e.message}` : 'Enregistrement impossible.');
    } finally {
      setEnregistrement(false);
    }
  };

  const changer = (i: number, champs: Partial<LigneSeance>) => setLignes((ls) => ls.map((l, j) => (j === i ? { ...l, ...champs } : l)));

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.contenu} keyboardShouldPersistTaps="handled">
      {!route?.params?.groupeId && groupes.length > 1 ? (
        <View style={{ gap: espaces.s }}>
          <LibelleSection>Pour quel groupe ?</LibelleSection>
          <View style={styles.puces}>
            {groupes.map((g) => (
              <PuceFiltre key={g.id} libelle={g.nom} actif={g.id === groupeId} onPress={() => setGroupeId(g.id)} />
            ))}
          </View>
        </View>
      ) : null}
      {groupes.length === 0 && !route?.params?.groupeId ? (
        <Text style={styles.aide}>Créez ou rejoignez d’abord un groupe (Quotidien › Trajets) pour y importer un planning.</Text>
      ) : null}

      {!planning ? (
        <>
          <View style={styles.titreLigne}>
            <Etincelle couleur={c.encre} taille={18} />
            <Text style={styles.titre}>Importer un planning</Text>
          </View>
          <Text style={styles.aide}>
            Photo ou PDF du planning du club, du calendrier des matchs ou du mot de l’école. L’assistant prépare les
            séances ; vous vérifiez avant d’ajouter.
          </Text>
          {lecture ? (
            <ChargementAssistant
              couleur={c.encre}
              etapes={['Je lis le planning…', 'Je relève les dates…', 'Je vérifie les horaires…', 'Presque fini…']}
              onAnnuler={annuler}
            />
          ) : (
            <>
              <PanneauPhotos photos={photos} onChange={(p) => { setPhotos(p); setPdf(null); }} max={3} module="quotidien" onPdf={prendrePdf} nomPdf={pdf?.nom} />
              {pdf ? <Bouton titre="Changer de fichier" variante="lien" onPress={() => setPdf(null)} /> : null}
              {photos.length || pdf ? (
                <>
                  <Champ
                    libelle="Précision (facultatif)"
                    value={precision}
                    onChangeText={setPrecision}
                    placeholder="ex. Seulement l’équipe U11"
                  />
                  <Bouton titre="✦ Lire le planning" module="quotidien" onPress={() => lire()} />
                </>
              ) : null}
              {message ? (
                <MessageAssistant
                  message={message.texte}
                  pause={message.pause}
                  onReessayer={!message.pause && (photos.length || pdf) ? () => lire() : undefined}
                  onRemplirALaMain={groupe ? () => navigation.navigate('ActiviteForm', { groupeId: groupe.id, zone: groupe.zone_vacances }) : undefined}
                />
              ) : null}
            </>
          )}
        </>
      ) : (
        <>
          <BandeauBrouillon couleur={c.encre} />
          {planning.question ? (
            <View style={styles.question}>
              <Etincelle couleur={c.encre} />
              <Text style={styles.questionTexte}>{planning.question}</Text>
            </View>
          ) : null}

          {planning.activites.length ? (
            <View style={{ gap: espaces.s }}>
              <LibelleSection>Chaque semaine</LibelleSection>
              {planning.activites.map((a, i) => (
                <Carte key={`${a.nom}-${i}`} style={{ gap: espaces.s }}>
                  <Text style={styles.nom}>{a.nom}</Text>
                  <Text style={styles.aide}>
                    Le {JOURS[a.jour - 1]} de {a.heure_debut}
                    {a.heure_fin ? ` à ${a.heure_fin}` : ''}
                    {a.lieu ? ` · ${a.lieu}` : ''}
                  </Text>
                  <Bouton titre="Vérifier et ajouter" variante="secondaire" petit onPress={() => ouvrirActivite(a)} />
                </Carte>
              ))}
            </View>
          ) : null}

          {lignes.length ? (
            <View style={{ gap: espaces.s }}>
              <LibelleSection>{`Dates précises (${lignes.length})`}</LibelleSection>
              <Champ libelle="Nom" value={nom} onChangeText={setNom} placeholder="ex. Matchs U11" />
              {lignes.map((l, i) => (
                <Carte key={`${l.date}-${i}`} style={[styles.ligne, !l.cochee && { opacity: 0.55 }]}>
                  <View style={styles.ligneHaut}>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={styles.date}>{dateCourte(l.date)}</Text>
                      {l.note ? <Text style={styles.aide}>{l.note}</Text> : null}
                    </View>
                    {l.aVerifier ? <PastilleAVerifier /> : null}
                    <CaseACocher cochee={l.cochee} onChange={(v) => changer(i, { cochee: v })} libelle={dateCourte(l.date)} />
                  </View>
                  {l.cochee ? (
                    <View style={styles.horaires}>
                      <Champ style={{ flex: 1 }} libelle="Début" value={l.debut} onChangeText={(v) => changer(i, { debut: v })} aVerifier={l.aVerifier && !l.debut} />
                      <Champ style={{ flex: 1 }} libelle="Fin" value={l.fin} onChangeText={(v) => changer(i, { fin: v })} aVerifier={l.aVerifier} />
                      <Champ style={{ flex: 2 }} libelle="Lieu" value={l.lieu} onChangeText={(v) => changer(i, { lieu: v })} />
                    </View>
                  ) : null}
                </Carte>
              ))}
              {erreur ? <Text style={styles.erreur}>{erreur}</Text> : null}
              <Bouton
                titre={`Ajouter ${cochees.length > 1 ? `les ${cochees.length} séances` : 'la séance'}`}
                module="quotidien"
                desactive={!cochees.length || !groupe}
                enCours={enregistrement}
                onPress={ajouterSeances}
              />
              <Text style={styles.aide}>Les trajets aller et retour de chaque séance sont créés, comme pour une activité.</Text>
            </View>
          ) : erreur ? (
            <Text style={styles.erreur}>{erreur}</Text>
          ) : null}

          <Bouton titre="Recommencer avec un autre document" variante="lien" onPress={() => setPlanning(null)} />
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
  puces: { flexDirection: 'row', flexWrap: 'wrap', gap: espaces.s },
  question: { flexDirection: 'row', gap: espaces.s, padding: espaces.l, borderRadius: 14, backgroundColor: couleurs.segment },
  questionTexte: { flex: 1, fontFamily: polices.texteDemiGras, fontSize: 15, lineHeight: 21, color: couleurs.encre },
  nom: { fontFamily: polices.texteGras, fontSize: 16, color: couleurs.encre },
  ligne: { gap: espaces.s },
  ligneHaut: { flexDirection: 'row', alignItems: 'center', gap: espaces.s },
  date: { fontFamily: polices.texteGras, fontSize: 15, color: couleurs.encre },
  horaires: { flexDirection: 'row', gap: espaces.s },
  erreur: { fontFamily: polices.texteDemiGras, fontSize: 14, color: couleurs.attention },
}));
