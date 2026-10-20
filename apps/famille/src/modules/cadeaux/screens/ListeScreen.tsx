import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, Pressable, Linking } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { theme, creerStylesThemes } from '../theme/theme';
import { useAuth } from '../contexts/AuthContext';
import { Avatar, extraireMessageErreur } from '@apps-famille/famille';
import { alerte } from '../utils/alerte';
import {
  annulerReservation,
  changerStatutListe,
  droitsSurListe,
  etatReservations,
  etatPots,
  etatOptions,
  listerOptions,
  reserverOption,
  annulerReservationOption,
  formaterDate,
  formaterPrix,
  libellePrix,
  libellePriorite,
  libelleCompteARebours,
  listerPersonnes,
  listerSouhaits,
  obtenirListe,
  reserver,
  retirerSouhait,
  supprimerIdee,
  cadeauxOfferts,
  type EtatReservation,
  type EtatPot,
  type EtatOption,
  type OptionSouhait,
  type Evenement,
  type Liste,
  type Personne,
  type Souhait,
  dateCle,
  libelleDates,
  estListeCommune,
  joindrePrenoms,
} from '../services/wishlist';
import { Bouton, Chargement, Pastille } from '../components/ui';
import JaugePot from '../components/JaugePot';
import PhotoAgrandie from '../components/PhotoAgrandie';

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
//    par qui) et ce qu'il offre lui-même ; pour un pot commun, la somme
//    réunie et sa propre participation (jamais celle des autres) ;
//  - gestionnaire (parent d'un enfant sans compte) : comme un donateur, et il
//    remplit aussi la liste à la place de l'enfant.
// Une seule liste par personne, permanente. Un cadeau disparaît de la liste
// quand son donateur le coche "offert" (onglet À offrir).
// Liste commune (plusieurs destinataires, cachée à eux) : toujours vue en
// donateur ; on n'y trouve que des idées de la famille.
export default function ListeScreen({ route, navigation }: any) {
  const { listeId } = route.params as { listeId: string };
  const { session, foyersFamille } = useAuth();
  const [liste, setListe] = useState<(Liste & { evenement: Evenement | null }) | null>(null);
  const [mode, setMode] = useState<Mode | null>(null);
  const [souhaits, setSouhaits] = useState<Souhait[]>([]);
  const [etat, setEtat] = useState<Map<string, EtatReservation>>(new Map());
  const [pots, setPots] = useState<Map<string, EtatPot>>(new Map());
  // Options des souhaits (modèles, figurines…) et leur état pour un donateur.
  const [options, setOptions] = useState<Map<string, OptionSouhait[]>>(new Map());
  const [etatOpt, setEtatOpt] = useState<Map<string, EtatOption>>(new Map());
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
      // Cadeaux déjà offerts (cochés par leur donateur) : retirés de la liste.
      const offerts = await cadeauxOfferts(listeId);
      const restants = s.filter((x) => !offerts.souhaits.has(x.id));
      setListe(l);
      setMode(m);
      setSouhaits(restants);
      setPersonnes(p);
      const opts = (await listerOptions(restants.filter((x) => x.mode_options).map((x) => x.id))).filter(
        (o) => !offerts.options.has(o.id)
      );
      const parSouhait = new Map<string, OptionSouhait[]>();
      opts.forEach((o) => parSouhait.set(o.souhait_id, [...(parSouhait.get(o.souhait_id) ?? []), o]));
      setOptions(parSouhait);
      // Jamais demandé pour le destinataire (la base le refuserait de toute façon).
      if (m === 'destinataire') {
        setEtat(new Map());
        setPots(new Map());
        setEtatOpt(new Map());
      } else {
        const [r, pt, eo] = await Promise.all([etatReservations(listeId), etatPots(listeId), etatOptions(listeId)]);
        setEtat(r);
        setPots(pt);
        setEtatOpt(eo);
      }
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

  const commune = estListeCommune(liste);
  const destinataire = personnes.find((p) => p.id === liste.destinataire_id);
  const destinatairesCommuns = (liste.destinataires ?? [])
    .map((d) => personnes.find((p) => p.id === d.personne_id))
    .filter((p): p is Personne => !!p)
    .sort((a, b) => a.prenom.localeCompare(b.prenom));
  const prenom = commune
    ? joindrePrenoms(destinatairesCommuns.map((p) => p.prenom)) || 'ces personnes'
    : destinataire?.prenom || 'cette personne';
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
    (s) =>
      !s.secret &&
      (!s.supprime_le ||
        (mode !== 'destinataire' && (etat.get(s.id)?.reserve_par_moi || pots.get(s.id)?.ma_participation != null)))
  );
  const idees = souhaits.filter((s) => s.secret && !s.supprime_le);

  const titre = commune
    ? liste.titre ?? 'Liste commune'
    : mode === 'destinataire'
      ? `Ma liste${destinataire?.prenom ? ` · ${destinataire.prenom}` : ''}`
      : `La liste de ${prenom}`;

  // Rappel du rôle de l'utilisateur sur cette liste, et de ce qui reste caché.
  const role = commune
    ? {
        icone: 'eye-off-outline' as const,
        texte: `Liste commune pour ${prenom}. ${
          destinatairesCommuns.length > 1 ? 'Ils ne la voient pas' : 'Cette liste lui est invisible'
        } : ni son titre, ni les idées, ni ce qui est réservé. Le reste de la famille peut y ajouter des idées et les réserver.`,
      }
    : mode === 'destinataire'
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

  // Un souhait est complet quand plus rien n'y est à réserver : une option
  // choisie (un au choix), toutes les options prises, ou la quantité atteinte.
  function estComplet(s: Souhait): boolean {
    const nb = etat.get(s.id)?.nb_reserves ?? 0;
    if (s.mode_options === 'un_au_choix') return nb >= 1;
    if (s.mode_options === 'toutes') return nb >= Math.max(1, (options.get(s.id) ?? []).length);
    return nb >= s.quantite;
  }

  // Liste des options d'un souhait. Le destinataire les voit sans aucun état
  // de réservation ; un donateur réserve option par option.
  const blocOptions = (s: Souhait, opts: OptionSouhait[], complet: boolean) => (
    <View style={styles.options}>
      {opts.length === 0 && <Text style={styles.carteDetail}>Pas encore d’options.</Text>}
      {opts.map((o) => {
        const eo = etatOpt.get(o.id);
        const moi = !!eo?.reservee_par_moi;
        const prise = !!eo?.reservee && !moi;
        const cle = `option-${o.id}`;
        let droite: React.ReactNode = null;
        // Pot commun : on participe au pot, les modèles ne se réservent pas.
        if (mode !== 'destinataire' && !s.supprime_le && !s.pot_commun) {
          if (moi) {
            droite = (
              <Bouton
                variante="discret"
                titre="Annuler"
                onPress={() => executer(cle, () => annulerReservationOption(o.id, moiId), 'Annulation impossible.')}
                enCours={enCours === cle}
                accessibilityLabel={`Annuler ma réservation de ${o.titre}`}
              />
            );
          } else if (prise) {
            droite = <Text style={styles.statutReserve}>Réservé</Text>;
          } else if (!complet) {
            droite = (
              <Bouton
                variante="contour"
                titre={s.mode_options === 'un_au_choix' ? 'Choisir' : 'Réserver'}
                onPress={() => executer(cle, () => reserverOption(s.id, o.id, moiId), 'Réservation impossible.')}
                enCours={enCours === cle}
                style={styles.optionBouton}
                accessibilityLabel={`${s.mode_options === 'un_au_choix' ? 'Choisir' : 'Réserver'} ${o.titre}`}
              />
            );
          }
        }
        return (
          <View key={o.id} style={[styles.option, moi && styles.optionMoi]}>
            <View style={styles.carteTextes}>
              <Text style={[styles.optionTitre, prise && styles.texteAttenue]}>
                {moi ? '✓ ' : ''}
                {o.titre}
                {o.prix != null ? ` · ${formaterPrix(o.prix)}` : ''}
              </Text>
              {o.lien ? (
                <Pressable onPress={() => Linking.openURL(o.lien!)} accessibilityRole="link" hitSlop={6}>
                  <Text style={styles.lienOption}>Voir sur {nomSite(o.lien)}</Text>
                </Pressable>
              ) : null}
            </View>
            {droite}
          </View>
        );
      })}
    </View>
  );

  // Carte d'un souhait ou d'une idée.
  const carte = (s: Souhait) => {
    const e = etat.get(s.id);
    const nbReserves = e?.nb_reserves ?? 0;
    const opts = options.get(s.id) ?? [];
    const avecOptions = !!s.mode_options;
    const complet = estComplet(s);
    const mesOptions = opts.filter((o) => etatOpt.get(o.id)?.reservee_par_moi);
    const parMoi = avecOptions ? mesOptions.length > 0 : !!e?.reserve_par_moi;
    const pot = pots.get(s.id);
    // Pot commun, ou ancien pot où j'ai encore une participation.
    const estPot = s.pot_commun || pot?.ma_participation != null;
    const jeParticipe = pot?.ma_participation != null;
    const infos = [
      s.pot_commun ? (s.prix != null ? `À réunir : ${formaterPrix(s.prix)}` : 'Pot commun') : libellePrix(s.prix, s.type_prix),
      s.taille,
      !s.pot_commun && !avecOptions && s.quantite > 1 ? `${s.quantite} souhaités` : null,
      avecOptions ? (s.mode_options === 'un_au_choix' ? `${opts.length} modèles au choix` : `${opts.length} à offrir séparément`) : null,
      s.priorite === 3 ? libellePriorite(s.priorite, s.secret) : null,
    ].filter(Boolean);

    let statut: React.ReactNode = null;
    let action: React.ReactNode = null;
    if (estPot && mode === 'destinataire') {
      statut = (
        <View style={styles.cache}>
          <Ionicons name="people-outline" size={14} color={theme.colors.accent} />
          <Text style={styles.cacheTexte}>Pot commun : la famille peut participer à plusieurs</Text>
        </View>
      );
    } else if (estPot) {
      statut = (
        <View style={styles.pot}>
          <JaugePot total={pot?.total ?? 0} objectif={s.pot_commun ? s.prix : null} compact />
          {jeParticipe && (
            <Text style={styles.statutMoi}>Vous participez : {formaterPrix(pot!.ma_participation)} (vous seul le voyez)</Text>
          )}
        </View>
      );
      action = (
        <Bouton
          titre={jeParticipe ? 'Modifier' : 'Participer'}
          variante={jeParticipe ? 'contour' : 'plein'}
          onPress={() => navigation.navigate('Participation', { listeId, souhaitId: s.id, prenom })}
          accessibilityLabel={`${jeParticipe ? 'Modifier ma participation à' : 'Participer à'} ${s.titre}`}
        />
      );
    } else if (avecOptions && mode !== 'destinataire') {
      // Options : l'action se fait option par option, dans le bloc dessous.
      if (s.mode_options === 'un_au_choix') {
        statut = parMoi ? (
          <Text style={styles.statutMoi}>Vous offrez : {mesOptions[0].titre}</Text>
        ) : complet ? (
          <Text style={styles.statutReserve}>Réservé par un proche</Text>
        ) : (
          <Text style={styles.statutPartiel}>Choisissez le modèle que vous offrez</Text>
        );
      } else if (nbReserves > 0) {
        statut = (
          <Text style={parMoi ? styles.statutMoi : styles.statutPartiel}>
            {`${Math.min(nbReserves, opts.length)} sur ${opts.length} réservé${nbReserves > 1 ? 's' : ''}`}
            {parMoi ? ` · dont ${mesOptions.length} par vous` : ''}
          </Text>
        );
      }
      if (complet && !parMoi) {
        action = <Ionicons name="lock-closed-outline" size={22} color={theme.colors.textMuted} accessibilityLabel="Réservé" />;
      }
    } else if (mode !== 'destinataire') {
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
          (parMoi || jeParticipe) && styles.carteMoi,
          !estPot && complet && !parMoi && mode !== 'destinataire' && styles.carteReservee,
        ]}
      >
        <View style={styles.carteLigne}>
          {s.image ? <PhotoAgrandie uri={s.image} style={styles.vignette} libelle={s.titre} /> : null}
          <View style={styles.carteTextes}>
            <Text style={[styles.carteTitre, !estPot && complet && !parMoi && mode !== 'destinataire' && styles.texteAttenue]}>
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
        {avecOptions && blocOptions(s, opts, complet)}
        <View style={styles.liens}>
          {s.lien ? (
            <Pressable onPress={() => Linking.openURL(s.lien!)} accessibilityRole="link" hitSlop={8}>
              <Text style={styles.lien}>Voir sur {nomSite(s.lien)}</Text>
            </Pressable>
          ) : null}
          {estPot && parMoi && mode !== 'destinataire' && (
            <Pressable
              onPress={() => executer(s.id, () => annulerReservation(s.id, moiId), 'Annulation impossible.')}
              hitSlop={8}
            >
              <Text style={styles.lienDiscret}>Annuler ma réservation d’avant le pot</Text>
            </Pressable>
          )}
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

  const aCompter = commune ? idees : souhaitsVisibles;
  const nbSouhaitsActifs = aCompter.filter((s) => !s.supprime_le).length;
  const nbReservesActifs = aCompter.filter((s) => !s.supprime_le && !s.pot_commun && estComplet(s)).length;

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.contenu}>
      <View style={styles.entete}>
        <View style={styles.titreLigne}>
          {commune ? (
            <View style={styles.avatars}>
              {destinatairesCommuns.slice(0, 4).map((p, i) => (
                <View key={p.id} style={i > 0 && styles.avatarSuivant}>
                  <Avatar personneId={p.id} prenom={p.prenom} taille={32} />
                </View>
              ))}
            </View>
          ) : (
            <Avatar personneId={liste.destinataire_id!} prenom={destinataire?.prenom} taille={40} />
          )}
          <Text style={[styles.titre, styles.titreTexte]}>{titre}</Text>
        </View>
        {commune && <Text style={styles.pourQui}>Pour {prenom}</Text>}
        <View style={styles.role}>
          <Ionicons name={role.icone} size={20} color={theme.colors.accent} />
          <Text style={styles.roleTexte}>{role.texte}</Text>
        </View>
        {mode !== 'destinataire' && (
          <Text style={styles.sousTitre}>
            {nbSouhaitsActifs} {commune ? 'idée' : 'souhait'}
            {nbSouhaitsActifs > 1 ? 's' : ''}, {nbReservesActifs} déjà réservé{commune ? 'e' : ''}
            {nbReservesActifs > 1 ? 's' : ''}
          </Text>
        )}
        {commune && liste.cree_par === moiId && (
          <Pressable
            onPress={() => navigation.navigate('ListeCommune', { listeId })}
            hitSlop={8}
            accessibilityRole="button"
          >
            <Text style={styles.lien}>Modifier le titre ou les personnes</Text>
          </Pressable>
        )}
      </View>

      {!commune && peutRemplir && liste.statut === 'brouillon' && (
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

      {commune ? null : souhaitsVisibles.length === 0 ? (
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
      {mode === 'gestionnaire' && !commune && (
        <Bouton
          variante="pointille"
          titre="✦ Importer une lettre au Père Noël"
          onPress={() => navigation.navigate('ImportLettre', { listeId, prenom })}
        />
      )}

      {mode !== 'destinataire' && (
        <>
          <View style={[styles.sectionIdees, commune && styles.sectionIdeesCommune]}>
            <Ionicons name="eye-off-outline" size={18} color={theme.colors.accent} />
            <Text style={styles.section}>{commune ? 'Idées de cadeaux' : 'Idées de la famille'}</Text>
            <Text style={styles.aide}>
              {prenom} ne {commune && destinatairesCommuns.length > 1 ? 'les voient' : 'les voit'} pas
            </Text>
          </View>
          {idees.length === 0 ? (
            <Text style={styles.aide}>Une idée de cadeau pour {prenom} ? Ajoutez-la, elle restera secrète.</Text>
          ) : (
            idees.map(carte)
          )}
          <Bouton
            variante="pointille"
            titre={commune ? '+ Ajouter une idée' : '+ Ajouter une idée cachée'}
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
  titreLigne: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
  titreTexte: { flexShrink: 1 },
  avatars: { flexDirection: 'row' },
  avatarSuivant: { marginLeft: -10 },
  pourQui: { fontFamily: theme.fontManuscrit, fontSize: 16, color: theme.colors.textMuted },
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
  pot: { gap: 4, marginTop: 4 },
  options: { gap: 6, marginTop: 2 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingVertical: 6,
    paddingHorizontal: theme.spacing.sm,
    borderRadius: theme.radii.md,
    backgroundColor: theme.colors.background,
    minHeight: 44,
  },
  optionMoi: { borderWidth: 1.5, borderColor: theme.colors.success },
  optionTitre: { fontFamily: theme.fontBodyBold, fontSize: 15, color: theme.colors.text },
  optionBouton: { minHeight: 36, paddingHorizontal: theme.spacing.sm },
  lienOption: { fontFamily: theme.fontBody, fontSize: 13, color: theme.colors.accent, textDecorationLine: 'underline' },
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
  sectionIdeesCommune: { marginTop: 0 },
  section: { fontFamily: theme.fontTitle, fontSize: 19, color: theme.colors.text },
  aide: { fontFamily: theme.fontBody, fontSize: 14, color: theme.colors.textMuted },
  pourEvenement: { fontFamily: theme.fontBody, fontSize: 13, color: theme.colors.success },
  pourEvenementManquant: { fontFamily: theme.fontBodyBold, fontSize: 13, color: theme.colors.warning },
  changer: { textDecorationLine: 'underline' },
  erreur: { fontFamily: theme.fontBody, fontSize: 14, color: theme.colors.warning, padding: theme.spacing.sm },
}));
