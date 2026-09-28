import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, Pressable, Linking, Image } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { theme, creerStylesThemes } from '../theme/theme';
import { useAuth } from '../contexts/AuthContext';
import { extraireMessageErreur } from '@apps-famille/famille';
import { alerte } from '../utils/alerte';
import {
  annulerReservation,
  changerStatutListe,
  droitsSurListe,
  etatReservations,
  formaterDate,
  libellePrix,
  libelleCompteARebours,
  listerPersonnes,
  listerSouhaits,
  obtenirListe,
  reserver,
  retirerSouhait,
  supprimerIdee,
  type EtatReservation,
  type Evenement,
  type Liste,
  type Personne,
  type Souhait,
} from '../services/wishlist';
import { Bouton, Chargement, Pastille } from '../components/ui';

type Mode = 'destinataire' | 'gestionnaire' | 'donateur';

// "https://www.fnac.com/a123" → "fnac.com"
function nomSite(lien: string): string {
  const m = lien.match(/^https?:\/\/(?:www\.)?([^/?#]+)/i);
  return m ? m[1] : 'le site';
}

// Une liste de souhaits. Trois façons de la voir :
//  - destinataire : ses propres souhaits, rien d'autre (ni idées cachées, ni
//    réservations — la base ne les lui envoie même pas) ;
//  - donateur : souhaits et idées de la famille, avec "Réservé" (sans savoir
//    par qui) et ce qu'il offre lui-même ;
//  - gestionnaire (parent d'un enfant sans compte) : comme un donateur, et il
//    remplit aussi la liste à la place de l'enfant.
export default function ListeScreen({ route, navigation }: any) {
  const { listeId } = route.params;
  const { session, foyersFamille } = useAuth();
  const [liste, setListe] = useState<(Liste & { evenement: Evenement }) | null>(null);
  const [mode, setMode] = useState<Mode | null>(null);
  const [souhaits, setSouhaits] = useState<Souhait[]>([]);
  const [etat, setEtat] = useState<Map<string, EtatReservation>>(new Map());
  const [personnes, setPersonnes] = useState<Personne[]>([]);
  const [enCours, setEnCours] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  const moiId = session?.user.id ?? '';

  const charger = useCallback(async () => {
    try {
      setErreur(null);
      const [l, droits, s, p] = await Promise.all([
        obtenirListe(listeId),
        droitsSurListe(listeId),
        listerSouhaits(listeId),
        listerPersonnes(foyersFamille),
      ]);
      const m: Mode = droits.estDestinataire ? 'destinataire' : droits.peutGerer ? 'gestionnaire' : 'donateur';
      setListe(l);
      setMode(m);
      setSouhaits(s);
      setPersonnes(p);
      // Jamais demandé pour le destinataire (la base le refuserait de toute façon).
      setEtat(m === 'destinataire' ? new Map() : await etatReservations(listeId));
    } catch (e) {
      setErreur(extraireMessageErreur(e, 'Chargement impossible.'));
    }
  }, [listeId, foyersFamille]);

  useFocusEffect(
    useCallback(() => {
      charger();
    }, [charger])
  );

  if (!liste || !mode) return erreur ? <Text style={styles.erreur}>{erreur}</Text> : <Chargement />;

  const destinataire = personnes.find((p) => p.id === liste.destinataire_id);
  const prenom = destinataire?.prenom || 'cette personne';
  const prenomAuteur = (utilisateurId: string) =>
    utilisateurId === moiId ? 'vous' : personnes.find((p) => p.utilisateur_id === utilisateurId)?.prenom || 'un proche';

  const executer = async (cle: string, action: () => Promise<unknown>, message: string) => {
    setErreur(null);
    setEnCours(cle);
    try {
      await action();
      await charger();
    } catch (e) {
      setErreur(extraireMessageErreur(e, message));
    } finally {
      setEnCours(null);
    }
  };

  const peutRemplir = mode === 'destinataire' || mode === 'gestionnaire';
  const souhaitsVisibles = souhaits.filter(
    (s) => !s.secret && (!s.supprime_le || (mode !== 'destinataire' && etat.get(s.id)?.reserve_par_moi))
  );
  const idees = souhaits.filter((s) => s.secret && !s.supprime_le);

  const titre =
    mode === 'destinataire' ? `Ma liste${destinataire?.prenom ? ` · ${destinataire.prenom}` : ''}` : `La liste de ${prenom}`;

  // Rappel du rôle de l'utilisateur sur cette liste, et de ce qui reste caché.
  const role =
    mode === 'destinataire'
      ? {
          icone: 'heart-outline' as const,
          texte:
            'C’est votre liste : la famille voit vos souhaits. Vous ne verrez jamais ce qui est réservé, ni les idées ajoutées par la famille.',
        }
      : mode === 'gestionnaire'
        ? {
            icone: 'people-outline' as const,
            texte: `${prenom} n’a pas de compte : vous remplissez sa liste à sa place. Vous voyez aussi les réservations et les idées de la famille.`,
          }
        : {
            icone: 'eye-off-outline' as const,
            texte: `Vous êtes un proche de ${prenom}. Ce que vous réservez et les idées que vous ajoutez restent cachés à ${prenom}, qui ne voit que ses propres souhaits.`,
          };

  const confirmerRetrait = (s: Souhait) =>
    alerte(`Retirer « ${s.titre} » ?`, undefined, [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Retirer',
        style: 'destructive',
        onPress: () => executer(s.id, () => retirerSouhait(s.id), 'Impossible de retirer ce souhait.'),
      },
    ]);

  const confirmerSuppressionIdee = (s: Souhait) =>
    alerte(`Supprimer l'idée « ${s.titre} » ?`, undefined, [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: () => executer(s.id, () => supprimerIdee(s.id), 'Impossible de supprimer cette idée.'),
      },
    ]);

  // Carte d'un souhait ou d'une idée.
  const carte = (s: Souhait) => {
    const e = etat.get(s.id);
    const nbReserves = e?.nb_reserves ?? 0;
    const complet = nbReserves >= s.quantite;
    const parMoi = !!e?.reserve_par_moi;
    const infos = [
      libellePrix(s.prix, s.type_prix),
      s.taille,
      s.quantite > 1 ? `${s.quantite} souhaités` : null,
      s.priorite === 3 ? 'Très envie' : null,
    ].filter(Boolean);

    let statut: React.ReactNode = null;
    let action: React.ReactNode = null;
    if (mode !== 'destinataire') {
      if (parMoi) {
        statut = <Text style={styles.statutMoi}>Vous l'offrez</Text>;
        action = (
          <Bouton
            variante="discret"
            titre="Annuler"
            onPress={() => executer(s.id, () => annulerReservation(s.id, moiId), 'Annulation impossible.')}
            enCours={enCours === s.id}
            accessibilityLabel={`Annuler ma réservation de ${s.titre}`}
          />
        );
      } else if (complet) {
        statut = <Text style={styles.statutReserve}>Réservé par un proche</Text>;
        action = <Ionicons name="lock-closed-outline" size={22} color={theme.colors.textMuted} accessibilityLabel="Réservé" />;
      } else {
        if (s.quantite > 1 && nbReserves > 0) {
          statut = <Text style={styles.statutPartiel}>{`${nbReserves} sur ${s.quantite} réservé${nbReserves > 1 ? 's' : ''}`}</Text>;
        }
        action = (
          <Bouton
            titre="Réserver"
            variante={s.priorite === 3 ? 'plein' : 'contour'}
            onPress={() => executer(s.id, () => reserver(s.id, moiId), 'Réservation impossible.')}
            enCours={enCours === s.id}
            accessibilityLabel={`Réserver ${s.titre}`}
          />
        );
      }
    }

    const modifiable = s.secret ? s.cree_par === moiId : peutRemplir;

    return (
      <View
        key={s.id}
        style={[
          styles.carte,
          s.secret && styles.carteIdee,
          parMoi && styles.carteMoi,
          complet && !parMoi && mode !== 'destinataire' && styles.carteReservee,
        ]}
      >
        <View style={styles.carteLigne}>
          {s.image ? <Image source={{ uri: s.image }} style={styles.vignette} accessibilityLabel={s.titre} /> : null}
          <View style={styles.carteTextes}>
            <Text style={[styles.carteTitre, complet && !parMoi && mode !== 'destinataire' && styles.texteAttenue]}>
              {s.titre}
            </Text>
            {infos.length > 0 && <Text style={styles.carteDetail}>{infos.join(' · ')}</Text>}
            {s.secret && (
              <Text style={styles.carteDetail}>
                {s.cree_par === moiId ? 'Votre idée' : `Idée de ${prenomAuteur(s.cree_par)}`}
              </Text>
            )}
            {s.secret && (
              <View style={styles.cache}>
                <Ionicons name="eye-off-outline" size={14} color={theme.colors.accent} />
                <Text style={styles.cacheTexte}>Invisible pour {prenom}</Text>
              </View>
            )}
            {s.supprime_le && <Text style={styles.statutReserve}>Retiré de la liste par {prenom}</Text>}
            {statut}
          </View>
          {action}
        </View>
        {s.description ? <Text style={styles.description}>{s.description}</Text> : null}
        <View style={styles.liens}>
          {s.lien ? (
            <Pressable onPress={() => Linking.openURL(s.lien!)} accessibilityRole="link" hitSlop={8}>
              <Text style={styles.lien}>Voir sur {nomSite(s.lien)}</Text>
            </Pressable>
          ) : null}
          {modifiable && !s.supprime_le && (
            <Pressable onPress={() => navigation.navigate('Souhait', { listeId, souhaitId: s.id, idee: s.secret, prenom })} hitSlop={8}>
              <Text style={styles.lien}>Modifier</Text>
            </Pressable>
          )}
          {modifiable && !s.secret && !s.supprime_le && (
            <Pressable onPress={() => confirmerRetrait(s)} hitSlop={8}>
              <Text style={styles.lienDiscret}>Retirer</Text>
            </Pressable>
          )}
          {modifiable && s.secret && (
            <Pressable onPress={() => confirmerSuppressionIdee(s)} hitSlop={8}>
              <Text style={styles.lienDiscret}>Supprimer</Text>
            </Pressable>
          )}
        </View>
      </View>
    );
  };

  const nbSouhaitsActifs = souhaitsVisibles.filter((s) => !s.supprime_le).length;
  const nbReservesActifs = souhaitsVisibles.filter(
    (s) => !s.supprime_le && (etat.get(s.id)?.nb_reserves ?? 0) >= s.quantite
  ).length;

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.contenu}>
      <View style={styles.entete}>
        <View style={styles.enteteLigne}>
          <Text style={styles.evenement}>
            {liste.evenement.titre} · {formaterDate(liste.evenement.date_evenement)}
          </Text>
          <Pastille texte={libelleCompteARebours(liste.evenement.date_evenement)} />
        </View>
        <Text style={styles.titre}>{titre}</Text>
        <View style={styles.role}>
          <Ionicons name={role.icone} size={20} color={theme.colors.accent} />
          <Text style={styles.roleTexte}>{role.texte}</Text>
        </View>
        {mode !== 'destinataire' && (
          <Text style={styles.sousTitre}>
            {nbSouhaitsActifs} souhait{nbSouhaitsActifs > 1 ? 's' : ''}, {nbReservesActifs} déjà réservé
            {nbReservesActifs > 1 ? 's' : ''}
          </Text>
        )}
      </View>

      {peutRemplir && liste.statut === 'brouillon' && (
        <View style={styles.bandeau}>
          <Text style={styles.bandeauTexte}>
            Brouillon : la famille ne voit pas encore cette liste.
          </Text>
          <Bouton
            titre="Publier la liste"
            onPress={() => executer('publier', () => changerStatutListe(liste.id, 'publiee'), 'Publication impossible.')}
            enCours={enCours === 'publier'}
          />
        </View>
      )}

      {souhaitsVisibles.length === 0 ? (
        <Text style={styles.aide}>
          {peutRemplir ? 'Ajoutez vos premiers souhaits.' : `${prenom} n'a pas encore ajouté de souhait.`}
        </Text>
      ) : (
        souhaitsVisibles.map(carte)
      )}
      {peutRemplir && (
        <Bouton
          variante="pointille"
          titre="+ Ajouter un souhait"
          onPress={() => navigation.navigate('Souhait', { listeId, idee: false, prenom })}
        />
      )}

      {mode !== 'destinataire' && (
        <>
          <View style={styles.sectionIdees}>
            <Ionicons name="eye-off-outline" size={18} color={theme.colors.accent} />
            <Text style={styles.section}>Idées de la famille</Text>
            <Text style={styles.aide}>{prenom} ne les voit pas</Text>
          </View>
          {idees.length === 0 ? (
            <Text style={styles.aide}>Une idée de cadeau pour {prenom} ? Ajoutez-la, elle restera secrète.</Text>
          ) : (
            idees.map(carte)
          )}
          <Bouton
            variante="pointille"
            titre="+ Ajouter une idée cachée"
            onPress={() => navigation.navigate('Souhait', { listeId, idee: true, prenom })}
          />
        </>
      )}

      {erreur && <Text style={styles.erreur}>{erreur}</Text>}
    </ScrollView>
  );
}

const styles = creerStylesThemes(() => ({
  flex: { flex: 1, backgroundColor: theme.colors.background },
  contenu: { padding: theme.spacing.md, gap: theme.spacing.sm, paddingBottom: theme.spacing.xl },
  entete: {
    gap: 6,
    paddingBottom: theme.spacing.md,
    marginBottom: theme.spacing.xs,
    borderBottomWidth: 1,
    borderStyle: 'dashed',
    borderColor: theme.colors.border,
  },
  enteteLigne: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: theme.spacing.sm },
  evenement: {
    flex: 1,
    fontFamily: theme.fontBodyBold,
    fontSize: 12,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: theme.colors.textMuted,
  },
  titre: { fontFamily: theme.fontTitle, fontSize: 32, color: theme.colors.text },
  sousTitre: { fontFamily: theme.fontBody, fontSize: 14, color: theme.colors.textMuted },
  role: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    alignItems: 'flex-start',
    backgroundColor: theme.colors.accentTransparent,
    borderRadius: theme.radii.md,
    padding: theme.spacing.sm,
  },
  roleTexte: { flex: 1, fontFamily: theme.fontBody, fontSize: 14, color: theme.colors.text, lineHeight: 19 },
  cache: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  cacheTexte: { fontFamily: theme.fontBodyBold, fontSize: 12, color: theme.colors.accent },
  bandeau: {
    backgroundColor: theme.colors.accentTransparent,
    borderRadius: theme.radii.lg,
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  bandeauTexte: { fontFamily: theme.fontBody, fontSize: 14, color: theme.colors.text },
  carte: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radii.lg,
    padding: theme.spacing.md,
    gap: theme.spacing.xs,
  },
  carteIdee: { borderStyle: 'dashed', borderColor: theme.colors.accent },
  carteMoi: { borderWidth: 2, borderColor: theme.colors.success },
  carteReservee: { backgroundColor: theme.colors.background },
  carteLigne: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
  carteTextes: { flex: 1, gap: 2 },
  vignette: { width: 56, height: 56, borderRadius: theme.radii.md, backgroundColor: theme.colors.background },
  carteTitre: { fontFamily: theme.fontBodyBold, fontSize: 16, color: theme.colors.text },
  texteAttenue: { color: theme.colors.textMuted },
  carteDetail: { fontFamily: theme.fontBody, fontSize: 13, color: theme.colors.textMuted },
  description: { fontFamily: theme.fontBody, fontSize: 14, color: theme.colors.text },
  statutMoi: { fontFamily: theme.fontBodyBold, fontSize: 13, color: theme.colors.success },
  statutReserve: { fontFamily: theme.fontBody, fontSize: 13, color: theme.colors.textMuted },
  statutPartiel: { fontFamily: theme.fontBodyBold, fontSize: 13, color: theme.colors.accent },
  liens: { flexDirection: 'row', gap: theme.spacing.md, flexWrap: 'wrap' },
  lien: { fontFamily: theme.fontBodyBold, fontSize: 14, color: theme.colors.accent, textDecorationLine: 'underline' },
  lienDiscret: { fontFamily: theme.fontBody, fontSize: 14, color: theme.colors.textMuted, textDecorationLine: 'underline' },
  sectionIdees: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.lg,
    flexWrap: 'wrap',
  },
  section: { fontFamily: theme.fontTitle, fontSize: 19, color: theme.colors.text },
  aide: { fontFamily: theme.fontBody, fontSize: 14, color: theme.colors.textMuted },
  erreur: { fontFamily: theme.fontBody, fontSize: 14, color: theme.colors.warning, padding: theme.spacing.sm },
}));
