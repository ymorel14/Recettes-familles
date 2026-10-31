import React, { useEffect, useState } from 'react';
import { View, ScrollView, Image } from 'react-native';
import { theme, creerStylesThemes } from '../theme/theme';
import { alerte } from '../utils/alerte';
import {
  lireEntier,
  lireMontant,
  modifierHebergement,
  proposerHebergement,
  supprimerHebergement,
  typeDepuisLien,
  TYPES_HEBERGEMENT,
  type Hebergement,
  type TypeHebergement,
} from '../services/hebergements';
import { messageErreurVoyage, obtenirVoyage } from '../services/voyage';
import { listerPersonnesParIds } from '../services/personnes';
import { lireAnnonce } from '../services/annonces';
import { formaterEuros } from '../services/hebergements';
import { Aide, CaseACocher, Champ, Erreur, Libelle, Puces } from '../components/formulaire';
import { Bouton } from '../components/ui';
import { BandeauBrouillon, ChargementAssistant, MessageAssistant, PastilleAVerifier } from '../../../composants/assistant';
import { useAppelAssistant } from '../../../composants/useAppelAssistant';

// Annonce lue par l'assistant (route ia/annonce-hebergement, § 4.5.2).
type AnnonceLue = {
  nom: string | null;
  ville: string | null;
  adresse: string | null;
  couchages: number | null;
  chambres: number | null;
  prix_total: number | null;
  prix_nuit: number | null;
  prix_semaine: number | null;
  frais: number | null;
  detail_frais: string | null;
  description: string | null;
  image: string | null;
  a_verifier: string[];
};
const NOMS_CHAMPS: Record<string, string> = {
  nom: 'nom', ville: 'ville', adresse: 'adresse', couchages: 'couchages', chambres: 'chambres',
  prix_total: 'prix', prix_nuit: 'prix', prix_semaine: 'prix', frais: 'frais',
};

const texte = (n: number | null | undefined) => (n == null ? '' : String(n).replace('.', ','));

// Proposer ou modifier un hébergement.
export default function HebergementFormScreen({ route, navigation }: any) {
  const voyageId: string = route.params?.voyageId;
  const existant: Hebergement | undefined = route.params?.hebergement;

  const [lien, setLien] = useState(existant?.lien ?? '');
  const [nom, setNom] = useState(existant?.nom ?? '');
  const [type, setType] = useState<TypeHebergement>(existant?.type ?? 'airbnb');
  const [ville, setVille] = useState(existant?.ville ?? '');
  const [adresse, setAdresse] = useState(existant?.adresse ?? '');
  const [capacite, setCapacite] = useState(texte(existant?.capacite));
  const [chambres, setChambres] = useState(texte(existant?.nb_chambres));
  const [modePrix, setModePrix] = useState<'total' | 'nuit'>(existant?.prix_total == null && existant?.prix_nuit != null ? 'nuit' : 'total');
  const [prix, setPrix] = useState(texte(existant?.prix_total ?? existant?.prix_nuit));
  const [frais, setFrais] = useState(texte(existant?.frais_annexes));
  const [description, setDescription] = useState(existant?.description ?? '');
  const [image, setImage] = useState<string | null>(existant?.image ?? null);
  const [lecture, setLecture] = useState(false);
  const [trouve, setTrouve] = useState<string | null>(null);
  const assistant = useAppelAssistant();
  const [parAssistant, setParAssistant] = useState<string[] | null>(null);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  // Qui paie : vide = frais communs ; sinon les foyers cochés.
  const [payeurs, setPayeurs] = useState<Set<string>>(new Set(existant?.pour_foyers ?? []));
  const [parFoyers, setParFoyers] = useState((existant?.pour_foyers ?? []).length > 0);
  const [foyers, setFoyers] = useState<{ id: string; nom: string }[]>([]);

  useEffect(() => {
    navigation.setOptions({ title: existant ? 'Modifier l’hébergement' : 'Proposer un hébergement' });
  }, [existant, navigation]);

  // Foyers des invités (pour « Qui paie ? »).
  useEffect(() => {
    obtenirVoyage(voyageId)
      .then((v) => listerPersonnesParIds(v.participants.filter((p) => p.reponse !== 'decline').map((p) => p.personne_id)))
      .then((liste) => {
        const vus = new Map<string, string>();
        for (const p of liste) if (p.foyer_id && p.foyer_nom) vus.set(p.foyer_id, p.foyer_nom);
        setFoyers([...vus].map(([id, nom]) => ({ id, nom })));
      })
      .catch(() => {});
  }, [voyageId]);

  const changerLien = (l: string) => {
    setLien(l);
    const t = typeDepuisLien(l);
    if (t) setType(t);
  };

  // Lecture incomplète (prix, couchages ou chambres manquants, ou site qui
  // bloque) : l'assistant lit le texte de l'annonce et complète les champs
  // encore vides (§ 4.5.2). Les valeurs déjà là ne sont jamais écrasées.
  const completerAvecAssistant = async (deja: { prix: boolean; capacite: boolean; chambres: boolean }) => {
    const a = await assistant.lancer<AnnonceLue>('annonce-hebergement', () => ({ lien: lien.trim() }), 60000);
    if (!a) return;
    if (a.nom) setNom((v) => v.trim() || a.nom!.slice(0, 120));
    if (a.ville) setVille((v) => v.trim() || a.ville!);
    if (a.adresse) setAdresse((v) => v.trim() || a.adresse!);
    if (a.couchages && !deja.capacite) setCapacite((v) => v.trim() || String(a.couchages));
    if (a.chambres && !deja.chambres) setChambres((v) => v.trim() || String(a.chambres));
    if (!deja.prix && (a.prix_total || a.prix_nuit)) {
      setModePrix(a.prix_total ? 'total' : 'nuit');
      setPrix(texte(a.prix_total ?? a.prix_nuit));
    }
    if (a.frais) setFrais((v) => v.trim() || texte(a.frais));
    if (a.description) setDescription((v) => v.trim() || a.description!);
    if (a.image) setImage((v) => v ?? a.image);
    const notes = [
      a.prix_semaine && !a.prix_total && !a.prix_nuit ? `prix à la semaine : ${formaterEuros(a.prix_semaine)}` : '',
      a.detail_frais ? `frais : ${a.detail_frais}` : '',
    ].filter(Boolean);
    setTrouve((t) => [t, notes.length ? `Lu par l’assistant · ${notes.join(' · ')}.` : ''].filter(Boolean).join(' '));
    setParAssistant(a.a_verifier.map((c) => NOMS_CHAMPS[c] ?? c).filter((c, i, l) => l.indexOf(c) === i));
  };

  // Remplit les champs encore vides à partir de la page de l'annonce.
  const remplirDepuisLien = async () => {
    setErreur(null);
    setTrouve(null);
    setParAssistant(null);
    if (!/^https?:\/\//i.test(lien.trim())) return setErreur('Collez d’abord le lien de l’annonce.');
    setLecture(true);
    let deja = { prix: !!prix.trim(), capacite: !!capacite.trim(), chambres: !!chambres.trim() };
    try {
      const a = await lireAnnonce(lien.trim());
      if (a.titre && !nom.trim()) setNom(a.titre.slice(0, 120));
      if (a.ville && !ville.trim()) setVille(a.ville);
      if (a.adresse && !adresse.trim()) setAdresse(a.adresse.replace(/,?\s*\d{5}\s+[^,]+$/, '') || a.adresse);
      if (a.capacite && !capacite.trim()) setCapacite(String(a.capacite));
      if (a.chambres && !chambres.trim()) setChambres(String(a.chambres));
      if (a.description && !description.trim()) setDescription(a.description);
      if (a.image) setImage(a.image);
      const infos = [a.site ? `Lu sur ${a.site}` : 'Annonce lue'];
      if (a.prix) infos.push(`prix affiché : ${formaterEuros(a.prix)} (à reporter selon qu’il s’agit du séjour ou d’une nuit)`);
      setTrouve(infos.join(' · ') + '. Vérifiez et complétez.');
      deja = { prix: deja.prix || !!a.prix, capacite: deja.capacite || !!a.capacite, chambres: deja.chambres || !!a.chambres };
    } catch {
      // Site bloqué ou page illisible : l'assistant tente sa chance.
    } finally {
      setLecture(false);
    }
    if (!deja.prix || !deja.capacite || !deja.chambres) await completerAvecAssistant(deja);
  };

  const valider = async () => {
    setErreur(null);
    if (!nom.trim()) return setErreur('Donnez un nom (ex. « Gîte des Tilleuls »).');
    const lienNet = lien.trim();
    if (lienNet && !/^https?:\/\//i.test(lienNet)) return setErreur('Le lien doit commencer par http:// ou https://');
    const montant = prix.trim() ? lireMontant(prix) : null;
    if (prix.trim() && montant === null) return setErreur('Prix invalide.');
    const montantFrais = frais.trim() ? lireMontant(frais) : null;
    if (frais.trim() && montantFrais === null) return setErreur('Frais invalides.');
    const cap = capacite.trim() ? lireEntier(capacite) : null;
    if (capacite.trim() && (cap === null || cap === 0)) return setErreur('Nombre de couchages invalide.');
    const ch = chambres.trim() ? lireEntier(chambres) : null;
    if (chambres.trim() && ch === null) return setErreur('Nombre de chambres invalide.');

    const donnees = {
      voyage_id: voyageId,
      nom: nom.trim(),
      type,
      lien: lienNet || null,
      ville: ville.trim() || null,
      adresse: adresse.trim() || null,
      capacite: cap,
      nb_chambres: ch,
      prix_total: modePrix === 'total' ? montant : null,
      prix_nuit: modePrix === 'nuit' ? montant : null,
      frais_annexes: montantFrais,
      description: description.trim() || null,
      image,
      // Envoyé seulement s'il y a quelque chose à dire (base plus ancienne).
      ...(parFoyers || (existant?.pour_foyers ?? []).length
        ? { pour_foyers: parFoyers && payeurs.size ? [...payeurs] : null }
        : {}),
    };
    setEnCours(true);
    try {
      if (existant) await modifierHebergement(existant.id, donnees);
      else await proposerHebergement(donnees);
      navigation.goBack();
    } catch (e) {
      setErreur(messageErreurVoyage(e));
      setEnCours(false);
    }
  };

  const supprimer = () =>
    alerte('Retirer cette proposition ?', 'Les avis donnés dessus seront supprimés.', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Retirer',
        style: 'destructive',
        onPress: async () => {
          try {
            await supprimerHebergement(existant!.id);
            navigation.goBack();
          } catch (e) {
            setErreur(messageErreurVoyage(e));
          }
        },
      },
    ]);

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.contenu} keyboardShouldPersistTaps="handled">
      <Libelle nativeID="libelle-lien">Lien de l’annonce (facultatif)</Libelle>
      <Champ
        value={lien}
        onChangeText={changerLien}
        placeholder="https://…"
        autoCapitalize="none"
        keyboardType="url"
        accessibilityLabelledBy="libelle-lien"
      />

      {assistant.lecture ? (
        <ChargementAssistant
          couleur={theme.colors.accent}
          etapes={['J’ouvre l’annonce…', 'Je cherche le prix et les couchages…', 'Presque fini…']}
          onAnnuler={assistant.annuler}
        />
      ) : (
        <Bouton titre="Remplir depuis le lien" variante="contour" onPress={remplirDepuisLien} enCours={lecture} desactive={!lien.trim()} />
      )}
      {trouve && <Aide>{trouve}</Aide>}
      {parAssistant ? (
        <View style={{ gap: theme.spacing.xs }}>
          <BandeauBrouillon couleur={theme.colors.accent} />
          {parAssistant.length ? <PastilleAVerifier raison={parAssistant.join(', ')} /> : null}
        </View>
      ) : null}
      {assistant.message && !trouve ? <MessageAssistant message={assistant.message.texte} pause={assistant.message.pause} /> : null}
      {image ? <Image source={{ uri: image }} style={styles.photo} accessibilityLabel="Photo de l’annonce" /> : null}

      <Libelle nativeID="libelle-nom">Nom</Libelle>
      <Champ value={nom} onChangeText={setNom} placeholder="Ex. Gîte des Tilleuls" accessibilityLabelledBy="libelle-nom" />

      <Libelle>Type</Libelle>
      <Puces options={TYPES_HEBERGEMENT} valeur={type} onChange={setType} />

      <View style={styles.ligne}>
        <View style={styles.colonne}>
          <Libelle nativeID="libelle-ville">Ville</Libelle>
          <Champ value={ville} onChangeText={setVille} accessibilityLabelledBy="libelle-ville" />
        </View>
        <View style={styles.colonne}>
          <Libelle nativeID="libelle-adresse">Adresse</Libelle>
          <Champ value={adresse} onChangeText={setAdresse} accessibilityLabelledBy="libelle-adresse" />
        </View>
      </View>

      <View style={styles.ligne}>
        <View style={styles.colonne}>
          <Libelle nativeID="libelle-capacite">Couchages</Libelle>
          <Champ value={capacite} onChangeText={setCapacite} keyboardType="number-pad" accessibilityLabelledBy="libelle-capacite" />
        </View>
        <View style={styles.colonne}>
          <Libelle nativeID="libelle-chambres">Chambres</Libelle>
          <Champ value={chambres} onChangeText={setChambres} keyboardType="number-pad" accessibilityLabelledBy="libelle-chambres" />
        </View>
      </View>

      <Libelle>Prix</Libelle>
      <Puces
        options={[
          { id: 'total', libelle: 'Pour tout le séjour' },
          { id: 'nuit', libelle: 'Par nuit' },
        ]}
        valeur={modePrix}
        onChange={setModePrix}
      />
      <View style={styles.ligne}>
        <View style={styles.colonne}>
          <Libelle nativeID="libelle-prix">{modePrix === 'total' ? 'Prix du séjour (€)' : 'Prix par nuit (€)'}</Libelle>
          <Champ value={prix} onChangeText={setPrix} keyboardType="decimal-pad" accessibilityLabelledBy="libelle-prix" />
        </View>
        <View style={styles.colonne}>
          <Libelle nativeID="libelle-frais">Frais annexes (€)</Libelle>
          <Champ value={frais} onChangeText={setFrais} keyboardType="decimal-pad" accessibilityLabelledBy="libelle-frais" />
        </View>
      </View>
      <Aide>Frais annexes : ménage, taxe de séjour… (la caution n’est pas un coût).</Aide>

      <Libelle nativeID="libelle-description">Pourquoi celui-ci ? (facultatif)</Libelle>
      <Champ
        value={description}
        onChangeText={setDescription}
        multiline
        placeholder="Ex. Piscine, grand jardin, à 20 min du parc…"
        accessibilityLabelledBy="libelle-description"
      />

      {foyers.length > 1 && (
        <>
          <Libelle>Qui paie ?</Libelle>
          <Puces
            options={[
              { id: 'commun', libelle: 'En commun' },
              { id: 'foyers', libelle: 'Certains foyers' },
            ]}
            valeur={parFoyers ? 'foyers' : 'commun'}
            onChange={(v) => setParFoyers(v === 'foyers')}
          />
          {parFoyers ? (
            <>
              {foyers.map((f) => (
                <CaseACocher
                  key={f.id}
                  coche={payeurs.has(f.id)}
                  onChange={(c) =>
                    setPayeurs((s) => {
                      const n = new Set(s);
                      if (c) n.add(f.id);
                      else n.delete(f.id);
                      return n;
                    })
                  }
                  libelle={f.nom}
                />
              ))}
              <Aide>Ex. une nuit d’étape où seuls certains dorment. Partagé entre ces foyers selon la règle du voyage.</Aide>
            </>
          ) : (
            <Aide>Partagé entre tous selon la règle du voyage (par défaut : par adulte, enfants gratuits).</Aide>
          )}
        </>
      )}

      <Erreur texte={erreur} />
      <Bouton titre={existant ? 'Enregistrer' : 'Proposer'} onPress={valider} enCours={enCours} style={styles.bouton} />
      {existant && <Bouton titre="Retirer cette proposition" variante="discret" onPress={supprimer} />}
    </ScrollView>
  );
}

const styles = creerStylesThemes(() => ({
  flex: { flex: 1, backgroundColor: theme.colors.background },
  contenu: { padding: theme.spacing.md, gap: theme.spacing.sm, paddingBottom: theme.spacing.xl },
  ligne: { flexDirection: 'row', gap: theme.spacing.md },
  colonne: { flex: 1, gap: theme.spacing.sm },
  bouton: { marginTop: theme.spacing.md },
  photo: { width: '100%', height: 180, borderRadius: theme.radii.lg, backgroundColor: theme.colors.surface },
}));
