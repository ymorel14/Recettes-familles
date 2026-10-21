import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, Linking, Pressable, Image } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Avatar, NomAvecAvatar, prenomsDe } from '@apps-famille/famille';
import { theme, creerStylesThemes } from '../theme/theme';
import { useAuth } from '../contexts/AuthContext';
import { alerte } from '../utils/alerte';
import { listerPersonnesParIds } from '../services/personnes';
import {
  AVIS,
  donnerAvis,
  formaterEuros,
  listerHebergements,
  prixSejour,
  remettreEnJeu,
  retenirHebergement,
  TYPES_HEBERGEMENT,
  type Avis,
  type Hebergement,
} from '../services/hebergements';
import {
  estOrganisateur,
  libelle,
  messageErreurVoyage,
  obtenirVoyage,
  type VoyageAvecParticipants,
} from '../services/voyage';
import { Aide, Champ, Erreur, Puces } from '../components/formulaire';
import { Bouton, Chargement, MessageVide, Pastille } from '../components/ui';
import { MentionAssistant } from '../../../composants/assistant';
import { proposesParAssistant } from '../../../services/brouillonVoyage';

const LIBELLES_AVIS_PLURIEL: Record<Avis, [string, string]> = {
  coup_de_coeur: ['coup de cœur', 'coups de cœur'],
  pourquoi_pas: ['pourquoi pas', 'pourquoi pas'],
  bof: ['bof', 'bof'],
  non: ['non', 'non'],
};

type Donnees = {
  voyage: VoyageAvecParticipants;
  hebergements: Hebergement[];
  prenoms: Map<string, string>;
  maPersonneId: string | null;
  foyers: Map<string, string>; // foyers des invités (« à la charge de … »)
};

// Hébergements d'un voyage : propositions de chacun, avis, et le choix d'un
// organisateur.
export default function HebergementsScreen({ route, navigation }: any) {
  const voyageId: string = route.params?.voyageId;
  const { session } = useAuth();
  const moiId = session?.user.id ?? '';

  const [donnees, setDonnees] = useState<Donnees | null>(null);
  const [erreurChargement, setErreurChargement] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [commentaires, setCommentaires] = useState<Record<string, string>>({});

  // Hébergements proposés par l'assistant (brouillon de voyage).
  const [parAssistant, setParAssistant] = useState<Set<string>>(new Set());

  const charger = useCallback(async () => {
    proposesParAssistant(voyageId).then(setParAssistant);
    try {
      const [voyage, hebergements] = await Promise.all([obtenirVoyage(voyageId), listerHebergements(voyageId)]);
      const auteurs = new Set<string>();
      for (const h of hebergements) {
        auteurs.add(h.propose_par);
        for (const a of h.avis) auteurs.add(a.utilisateur_id);
      }
      const [prenoms, invites] = await Promise.all([
        prenomsDe([...auteurs]),
        listerPersonnesParIds(voyage.participants.map((p) => p.personne_id)),
      ]);
      const maPersonneId = invites.find((p) => p.utilisateur_id === moiId)?.id ?? null;
      const foyers = new Map(invites.filter((p) => p.foyer_id && p.foyer_nom).map((p) => [p.foyer_id!, p.foyer_nom!]));
      setDonnees({ voyage, hebergements, prenoms, maPersonneId, foyers });
    } catch (e) {
      setErreurChargement(messageErreurVoyage(e));
    }
  }, [voyageId, moiId]);

  useFocusEffect(
    useCallback(() => {
      charger();
    }, [charger])
  );

  if (erreurChargement) return <MessageVide titre="Hébergements indisponibles" texte={erreurChargement} />;
  if (!donnees) return <Chargement />;
  const { voyage, hebergements, prenoms, maPersonneId, foyers } = donnees;

  const organisateur = estOrganisateur(voyage, moiId, maPersonneId);
  const attendus = voyage.participants.filter((p) => p.reponse !== 'decline').length;
  const nuits = voyage.nb_nuits;
  const prenom = (id: string) => (id === moiId ? 'Vous' : prenoms.get(id) || 'Quelqu’un');

  const agir = async (action: () => Promise<void>) => {
    setErreur(null);
    try {
      await action();
      await charger();
    } catch (e) {
      setErreur(messageErreurVoyage(e));
    }
  };

  const retenus = hebergements.filter((h) => h.statut === 'retenu');
  const proposes = hebergements.filter((h) => h.statut === 'propose');
  const ecartes = hebergements.filter((h) => h.statut === 'ecarte');

  // Comparaison (§ 4.5.2) : le moins cher par personne et par nuit, parmi
  // les hébergements non écartés assez grands pour tout le monde.
  const coutParPersonne = (h: Hebergement) => {
    const p = prixSejour(h, nuits);
    return p !== null && nuits && attendus ? p / nuits / attendus : null;
  };
  const comparables = hebergements.filter(
    (h) => h.statut !== 'ecarte' && coutParPersonne(h) !== null && (h.capacite == null || h.capacite >= attendus)
  );
  const moinsCher =
    comparables.length > 1 ? comparables.reduce((a, b) => (coutParPersonne(b)! < coutParPersonne(a)! ? b : a)).id : null;

  const carte = (h: Hebergement) => {
    const prix = prixSejour(h, nuits);
    const parPersonneNuit = coutParPersonne(h);
    const monAvis = h.avis.find((a) => a.utilisateur_id === moiId);
    const compte = AVIS.map((a) => ({ ...a, n: h.avis.filter((x) => x.avis === a.id).length })).filter((a) => a.n > 0);
    const peutModifier = h.propose_par === moiId || organisateur;
    const commentaire = commentaires[h.id] ?? monAvis?.commentaire ?? '';
    const commentaireModifie = commentaire !== (monAvis?.commentaire ?? '');

    return (
      <View key={h.id} style={[styles.carte, h.statut === 'retenu' && styles.carteRetenue, h.statut === 'ecarte' && styles.carteEcartee]}>
        {h.image ? <Image source={{ uri: h.image }} style={styles.photo} accessibilityLabel={`Photo : ${h.nom}`} /> : null}
        <View style={styles.carteHaut}>
          <Text style={styles.type}>{libelle(TYPES_HEBERGEMENT, h.type)}</Text>
          {h.statut === 'retenu' && <Pastille texte="Retenu" ton="succes" />}
          {h.statut === 'ecarte' && <Pastille texte="Écarté" ton="neutre" />}
          {h.id === moinsCher && <Pastille texte="Le moins cher / pers." ton="succes" />}
        </View>
        <Text style={styles.nom}>{h.nom}</Text>
        {parAssistant.has(h.id) && <MentionAssistant />}
        {h.ville || h.adresse ? <Text style={styles.detail}>{[h.adresse, h.ville].filter(Boolean).join(', ')}</Text> : null}
        <Text style={styles.prix}>
          {prix !== null ? `${formaterEuros(prix)} le séjour` : 'Prix à préciser'}
          {parPersonneNuit !== null ? ` · ${formaterEuros(parPersonneNuit)} / pers. / nuit` : ''}
        </Text>
        {(h.pour_foyers ?? []).length > 0 && (
          <Text style={styles.detail}>
            À la charge de {(h.pour_foyers ?? []).map((f) => foyers.get(f) ?? 'un autre foyer').join(', ')}
          </Text>
        )}
        {h.prix_total == null && h.prix_nuit != null && (
          <Text style={styles.detail}>
            {formaterEuros(Number(h.prix_nuit))} la nuit × {nuits ?? '?'} nuit{(nuits ?? 0) > 1 ? 's' : ''}
            {h.frais_annexes ? ` + ${formaterEuros(Number(h.frais_annexes))} de frais` : ''}
          </Text>
        )}
        {h.capacite != null && (
          <Text style={[styles.detail, h.capacite < attendus && styles.alerte]}>
            {h.capacite} couchage{h.capacite > 1 ? 's' : ''}
            {h.nb_chambres != null ? ` · ${h.nb_chambres} chambre${h.nb_chambres > 1 ? 's' : ''}` : ''}
            {h.capacite < attendus ? ` · trop petit pour ${attendus} personnes` : attendus ? ` · pour ${attendus} invité${attendus > 1 ? 's' : ''}` : ''}
          </Text>
        )}
        {h.description ? <Text style={styles.description}>{h.description}</Text> : null}
        <NomAvecAvatar utilisateurId={h.propose_par} prenom={prenoms.get(h.propose_par)} taille={22} styleTexte={styles.auteur}>
          Proposé par {prenom(h.propose_par)}
        </NomAvecAvatar>
        {h.lien ? (
          <Pressable onPress={() => Linking.openURL(h.lien!)} accessibilityRole="link" style={styles.lien} hitSlop={6}>
            <Ionicons name="open-outline" size={16} color={theme.colors.accent} />
            <Text style={styles.lienTexte}>Voir l’annonce</Text>
          </Pressable>
        ) : null}

        {/* Avis */}
        <View style={styles.avis}>
          {compte.length > 0 && (
            <Text style={styles.detail}>
              {compte.map((a) => `${a.n} ${LIBELLES_AVIS_PLURIEL[a.id][a.n > 1 ? 1 : 0]}`).join(' · ')}
            </Text>
          )}
          {h.avis
            .filter((a) => a.commentaire)
            .map((a) => (
              <View key={a.utilisateur_id} style={styles.commentaireLigne}>
                <Avatar utilisateurId={a.utilisateur_id} prenom={prenoms.get(a.utilisateur_id)} taille={22} />
                <Text style={[styles.commentaire, styles.commentaireTexte]}>
                  <Text style={styles.commentaireAuteur}>{prenom(a.utilisateur_id)} : </Text>« {a.commentaire} »
                </Text>
              </View>
            ))}
          {h.statut !== 'ecarte' && (
            <>
              <Puces
                options={AVIS}
                valeur={monAvis?.avis ?? null}
                onChange={(a) => agir(() => donnerAvis(h.id, moiId, a, commentaire.trim() || null))}
              />
              <Champ
                value={commentaire}
                onChangeText={(t) => setCommentaires((c) => ({ ...c, [h.id]: t }))}
                placeholder="Un commentaire ? (facultatif)"
                accessibilityLabel={`Commentaire sur ${h.nom}`}
              />
              {commentaireModifie && (
                <Bouton
                  titre={monAvis ? 'Envoyer le commentaire' : 'Choisissez d’abord un avis ci-dessus'}
                  variante="contour"
                  desactive={!monAvis}
                  onPress={() =>
                    agir(async () => {
                      await donnerAvis(h.id, moiId, monAvis!.avis, commentaire.trim() || null);
                      setCommentaires((c) => {
                        const { [h.id]: _, ...reste } = c;
                        return reste;
                      });
                    })
                  }
                />
              )}
            </>
          )}
        </View>

        <View style={styles.actions}>
          {peutModifier && (
            <Bouton
              titre="Modifier"
              variante="discret"
              onPress={() => navigation.navigate('Hebergement', { voyageId: voyage.id, hebergement: h })}
            />
          )}
          {organisateur && h.statut !== 'retenu' && (
            <Bouton
              titre="Retenir"
              onPress={() =>
                alerte(`Retenir « ${h.nom} » ?`, 'Les autres propositions seront écartées (toujours consultables).', [
                  { text: 'Annuler', style: 'cancel' },
                  { text: 'Retenir', onPress: () => agir(() => retenirHebergement(h.id)) },
                ])
              }
            />
          )}
          {organisateur && h.statut !== 'propose' && (
            <Bouton titre="Remettre en jeu" variante="contour" onPress={() => agir(() => remettreEnJeu(h.id))} />
          )}
        </View>
      </View>
    );
  };

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.contenu} keyboardShouldPersistTaps="handled">
      <Text style={styles.intro}>
        {attendus} personne{attendus > 1 ? 's' : ''} attendue{attendus > 1 ? 's' : ''} ·{' '}
        {nuits != null ? `${nuits} nuit${nuits > 1 ? 's' : ''}${voyage.date_debut ? '' : ' (estimation)'}` : 'nuits à préciser'}
      </Text>
      <Bouton
        titre="+ Proposer un hébergement"
        onPress={() => navigation.navigate('Hebergement', { voyageId: voyage.id })}
      />
      <Erreur texte={erreur} />

      {hebergements.length === 0 && (
        <MessageVide
          titre="Aucune proposition"
          texte="Collez le lien d’une annonce (Airbnb, Gîtes de France…) ou décrivez un logement : chacun pourra donner son avis."
        />
      )}
      {retenus.map(carte)}
      {proposes.length > 0 && retenus.length > 0 && <Text style={styles.section}>Autres propositions</Text>}
      {proposes.map(carte)}
      {ecartes.length > 0 && <Text style={styles.section}>Écartés</Text>}
      {ecartes.map(carte)}
      {!organisateur && hebergements.length > 0 && (
        <Aide>Un organisateur choisira l’hébergement en tenant compte des avis.</Aide>
      )}
    </ScrollView>
  );
}

const styles = creerStylesThemes(() => ({
  flex: { flex: 1, backgroundColor: theme.colors.background },
  contenu: { padding: theme.spacing.md, gap: theme.spacing.sm, paddingBottom: theme.spacing.xl },
  intro: { fontFamily: theme.fontBody, fontSize: 15, color: theme.colors.textMuted },
  section: { fontFamily: theme.fontTitle, fontSize: 18, color: theme.colors.text, marginTop: theme.spacing.md },
  carte: {
    gap: 4,
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radii.lg,
    padding: theme.spacing.md,
  },
  photo: { width: '100%', height: 160, borderRadius: theme.radii.md, marginBottom: theme.spacing.xs },
  carteRetenue: { borderColor: theme.colors.success, borderWidth: 2 },
  carteEcartee: { opacity: 0.7 },
  carteHaut: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  type: {
    fontFamily: theme.fontBodyBold,
    fontSize: 12,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: theme.colors.textMuted,
  },
  nom: { fontFamily: theme.fontTitle, fontSize: 21, color: theme.colors.text },
  prix: { fontFamily: theme.fontBodyBold, fontSize: 16, color: theme.colors.text },
  detail: { fontFamily: theme.fontBody, fontSize: 14, color: theme.colors.textMuted },
  alerte: { color: theme.colors.warning, fontFamily: theme.fontBodyBold },
  description: { fontFamily: theme.fontBody, fontSize: 15, color: theme.colors.text },
  auteur: { fontFamily: theme.fontManuscrit, fontSize: 13, color: theme.colors.textMuted },
  lien: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', minHeight: 32 },
  lienTexte: { fontFamily: theme.fontBodyBold, fontSize: 15, color: theme.colors.accent },
  avis: {
    gap: theme.spacing.xs,
    marginTop: theme.spacing.xs,
    paddingTop: theme.spacing.sm,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  commentaire: { fontFamily: theme.fontBody, fontSize: 14, color: theme.colors.text },
  commentaireLigne: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  commentaireTexte: { flex: 1 },
  commentaireAuteur: { fontFamily: theme.fontBodyBold },
  actions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: theme.spacing.sm, marginTop: theme.spacing.xs },
}));
