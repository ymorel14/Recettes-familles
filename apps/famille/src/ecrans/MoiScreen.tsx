import React, { useCallback, useState } from 'react';
import { Pressable, ScrollView, Share, Text, TextInput, View } from 'react-native';
import { ChampDate } from '../composants/ChampDate';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Avatar,
  PhotosProfil,
  VisibiliteEnfants,
  definirMonPrenom,
  extraireMessageErreur,
  formaterExpiration,
  listerMembresFoyer,
  obtenirCodeInvitation,
  obtenirMonPrenom,
  quitterFoyer,
  retirerDuFoyer,
  useAuth,
  type MembreFoyer,
} from '@apps-famille/famille';
import {
  ajouterPersonneSansCompte,
  formaterDate,
  lireDateSaisie,
  listerPersonnes,
  supprimerPersonne,
  type Personne,
} from '../modules/cadeaux/services/wishlist';
import { jetonRappels, rappelsPossibles } from '../modules/quotidien/services/notifications';
import { definirReglageAnniversaires, lireReglageAnniversaires } from '../modules/quotidien/services/maison';
import {
  activerNotificationsTelephone,
  desactiverNotificationsTelephone,
  messageNotifications,
  reglerModuleTelephone,
} from '../services/notificationsTelephone';
import VehiculesFoyer from '../modules/voyages/components/VehiculesFoyer';
import { alerte } from '../modules/cadeaux/utils/alerte';
import { usePreferences, type Apparence } from '../contexts/PreferencesContext';
import { JaugeAssistant } from './JaugeAssistant';
import { useToast } from '../composants/Toast';
import { nomFamille } from '../composants/ChoixFamille';
import {
  Bouton,
  Carte,
  ControleSegmente,
  Icone,
  Interrupteur,
  LibelleSection,
  LigneListe,
  PastilleModule,
} from '../composants/ui';
import { MODULES, arrondis, couleurs, creerStyles, espaces, margePage, polices, texte } from '../theme/theme';

// Moi (spécification § 2.2, charte § 8.5) : remplace le Profil de chacune des
// six apps. FAMILLE, NOTIFICATIONS PAR MODULE, PRÉFÉRENCES, COMPTE.
// La jauge de l'assistant arrivera avec le socle IA.

export default function MoiScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const { session, famille, familles, foyer, changerFamille, deconnexion, rafraichirFoyer } = useAuth();
  const prefs = usePreferences();
  const { afficher } = useToast();
  const [personnes, setPersonnes] = useState<Personne[]>([]);
  const [membres, setMembres] = useState<MembreFoyer[]>([]);
  const [monPrenom, setMonPrenom] = useState('');
  const [prenomEnregistre, setPrenomEnregistre] = useState<string | null>(null);
  const [prenom, setPrenom] = useState('');
  const [naissance, setNaissance] = useState('');
  const [enCours, setEnCours] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [rappelsActifs, setRappelsActifs] = useState(false);
  // Rappels automatiques d'anniversaires (Quotidien) : activés par défaut.
  const [anniversairesActifs, setAnniversairesActifs] = useState(true);
  const [ajoutOuvert, setAjoutOuvert] = useState(false);

  const charger = useCallback(async () => {
    if (!foyer || !session) return;
    try {
      const [p, moi, m] = await Promise.all([
        listerPersonnes([foyer.id]),
        obtenirMonPrenom(session.user.id),
        listerMembresFoyer(foyer.id),
      ]);
      setPersonnes(p);
      setMembres(m);
      setPrenomEnregistre(moi);
      setMonPrenom(moi ?? '');
      if (rappelsPossibles()) setRappelsActifs(!!(await jetonRappels()));
      setAnniversairesActifs(await lireReglageAnniversaires().catch(() => true));
    } catch {
      // Hors ligne : on garde l'affichage.
    }
  }, [foyer, session]);

  useFocusEffect(
    useCallback(() => {
      charger();
    }, [charger])
  );

  const executer = async (cle: string, action: () => Promise<unknown>, erreur: string, succes?: string) => {
    setMessage(null);
    setEnCours(cle);
    try {
      await action();
      if (succes) afficher(succes);
    } catch (e) {
      setMessage(extraireMessageErreur(e, erreur));
    } finally {
      setEnCours(null);
    }
  };

  const partagerCode = () =>
    executer(
      'code',
      async () => {
        const invitation = await obtenirCodeInvitation('famille');
        await Share.share({
          message: `Rejoins la famille « ${famille?.nom} » sur l'app Famille avec le code : ${invitation.code} (${formaterExpiration(invitation.expire_le)}).`,
        });
      },
      'Code indisponible.'
    );

  const ajouterPersonne = () => {
    if (!foyer || !prenom.trim()) return;
    const iso = naissance.trim() ? lireDateSaisie(naissance) : null;
    if (naissance.trim() && !iso) {
      setMessage('Choisissez la date de naissance au calendrier.');
      return;
    }
    executer(
      'personne',
      async () => {
        await ajouterPersonneSansCompte(foyer.id, prenom, iso);
        setPrenom('');
        setNaissance('');
        setAjoutOuvert(false);
        await charger();
      },
      'Ajout impossible.',
      `C’est noté : ${prenom.trim()} fait partie du foyer.`
    );
  };

  const sansCompte = personnes.filter((p) => !p.utilisateur_id);
  const avecCompte = personnes.filter((p) => p.utilisateur_id && p.utilisateur_id !== session?.user.id);
  const moiMembre = membres.find((m) => m.utilisateur_id === session?.user.id);
  const peutRetirerMembres = !!foyer && (foyer.cree_par === session?.user.id || moiMembre?.role === 'administrateur');

  const retirerMembre = (p: Personne) =>
    alerte(`Retirer ${p.prenom} du foyer ?`, `${p.prenom} restera dans la famille et choisira un autre foyer à sa prochaine connexion.`, [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Retirer',
        style: 'destructive',
        onPress: () =>
          executer(
            p.id,
            async () => {
              await retirerDuFoyer(p.utilisateur_id!);
              await charger();
            },
            'Impossible de retirer cette personne.'
          ),
      },
    ]);

  const retirerPersonne = (p: Personne) =>
    alerte(`Retirer ${p.prenom} du foyer ?`, 'Ses listes de souhaits seront supprimées.', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Retirer',
        style: 'destructive',
        onPress: () =>
          executer(
            p.id,
            async () => {
              await supprimerPersonne(p.id);
              await charger();
            },
            'Impossible de retirer cette personne.'
          ),
      },
    ]);

  const quitterMonFoyer = () =>
    alerte(`Quitter le foyer « ${foyer?.nom} » ?`, 'Vous restez dans la famille et choisirez ensuite un autre foyer ou créerez le vôtre.', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Quitter',
        style: 'destructive',
        onPress: () =>
          executer(
            'quitter-foyer',
            async () => {
              await quitterFoyer();
              await rafraichirFoyer();
            },
            'Impossible de quitter le foyer.'
          ),
      },
    ]);

  const basculerRappels = () =>
    executer(
      'rappels',
      async () => {
        if (rappelsActifs) {
          await desactiverNotificationsTelephone();
          setRappelsActifs(false);
        } else {
          const r = await activerNotificationsTelephone();
          setRappelsActifs(r === 'ok');
          if (r !== 'ok') setMessage(messageNotifications(r));
        }
      },
      'Impossible de changer les notifications.'
    );

  const seDeconnecter = () =>
    alerte('Se déconnecter ?', 'Vous devrez saisir à nouveau votre email et votre mot de passe.', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Se déconnecter',
        style: 'destructive',
        onPress: async () => {
          await desactiverNotificationsTelephone().catch(() => {});
          await deconnexion();
        },
      },
    ]);

  const policesFamille = { titre: polices.titre, corps: polices.texte, gras: polices.texteGras };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: couleurs.fond }}
      contentContainerStyle={{ paddingTop: insets.top + espaces.l, paddingBottom: espaces.xxxl * 2 }}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.entete}>
        {session ? <Avatar utilisateurId={session.user.id} prenom={prenomEnregistre} taille={64} /> : null}
        <View style={{ flex: 1 }}>
          <Text style={texte.titreEcran()} accessibilityRole="header" numberOfLines={1}>
            {prenomEnregistre || 'Moi'}
          </Text>
          <Text style={texte.secondaire()} numberOfLines={1}>
            {session?.user.email}
          </Text>
        </View>
      </View>

      {message ? (
        <View style={[styles.colonne, { marginTop: espaces.l }]}>
          <Text style={styles.erreur}>{message}</Text>
        </View>
      ) : null}

      <LibelleSection>Famille</LibelleSection>
      <View style={styles.colonne}>
        <Carte style={styles.carte}>
          <Text style={styles.titreCarte}>Mon prénom</Text>
          <Text style={styles.aide}>Affiché à la famille dans tous les modules.</Text>
          <TextInput
            style={styles.champ}
            value={monPrenom}
            onChangeText={setMonPrenom}
            placeholder="Prénom ou surnom"
            placeholderTextColor={couleurs.encreDouce}
            accessibilityLabel="Mon prénom"
          />
          {monPrenom.trim() !== (prenomEnregistre ?? '') && monPrenom.trim().length > 0 ? (
            <Bouton
              titre="Enregistrer"
              petit
              onPress={() =>
                executer(
                  'prenom',
                  async () => {
                    await definirMonPrenom(session!.user.id, monPrenom);
                    setPrenomEnregistre(monPrenom.trim());
                  },
                  'Impossible d’enregistrer le prénom.',
                  'Prénom enregistré.'
                )
              }
              enCours={enCours === 'prenom'}
            />
          ) : null}
        </Carte>

        {foyer ? (
          <Carte style={styles.carte}>
            <PhotosProfil polices={policesFamille} />
          </Carte>
        ) : null}

        <Carte style={styles.carte}>
          <Text style={styles.titreCarte}>{familles.length > 1 ? 'Mes familles' : 'Ma famille'}</Text>
          {familles.length > 1 ? (
            // Vue unique (retour de test G-2) : l'app montre toutes les
            // familles ; la famille cochée reçoit ce que l'on crée.
            <Text style={styles.aide}>
              L’app montre tout ce que partagent vos familles. Les nouveaux voyages, souvenirs, albums et listes communes sont partagés avec la famille cochée.
            </Text>
          ) : null}
          {familles.map((f) => (
            <Pressable
              key={f.id}
              style={[styles.choix, f.active && familles.length > 1 && styles.choixActif]}
              onPress={() => !f.active && executer(f.id, () => changerFamille(f.id), 'Changement impossible.', `C’est noté : ${nomFamille(f.nom)}.`)}
              disabled={f.active || enCours !== null}
              accessibilityRole="radio"
              accessibilityState={{ selected: f.active }}
            >
              <Text style={styles.choixTexte}>{nomFamille(f.nom)}</Text>
              {f.active && familles.length > 1 ? <Icone nom="checkmark-circle" taille={22} couleur={couleurs.succes} /> : null}
            </Pressable>
          ))}
          {famille ? (
            <Bouton variante="secondaire" icone="share-outline" titre="Inviter un proche" petit onPress={partagerCode} enCours={enCours === 'code'} />
          ) : null}
        </Carte>

        <Carte style={[styles.carte, { paddingBottom: espaces.s }]}>
          <Text style={styles.titreCarte}>{foyer ? `Mon foyer : ${foyer.nom}` : 'Mon foyer'}</Text>
          <Text style={styles.aide}>
            Un adulte crée son compte puis saisit le code famille (« Inviter un proche »). Un enfant sans compte s’ajoute ici.
          </Text>
          {session ? (
            <LigneListe
              gauche={<Avatar utilisateurId={session.user.id} prenom={prenomEnregistre} taille={32} />}
              titre={prenomEnregistre || 'Vous'}
              sousTitre="vous"
            />
          ) : null}
          {avecCompte.map((p) => (
            <LigneListe
              key={p.id}
              gauche={<Avatar personneId={p.id} prenom={p.prenom} taille={32} />}
              titre={p.prenom}
              sousTitre="a son compte"
              droite={
                peutRetirerMembres && p.utilisateur_id !== foyer?.cree_par ? (
                  <Pressable onPress={() => retirerMembre(p)} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Retirer ${p.prenom} du foyer`}>
                    <Text style={styles.lienDanger}>Retirer</Text>
                  </Pressable>
                ) : undefined
              }
            />
          ))}
          {sansCompte.map((p, i) => (
            <LigneListe
              key={p.id}
              gauche={<Avatar personneId={p.id} prenom={p.prenom} taille={32} />}
              titre={p.prenom}
              sousTitre={p.date_naissance ? `Né(e) le ${formaterDate(p.date_naissance)} · sans compte` : 'sans compte'}
              dernier={i === sansCompte.length - 1 && !ajoutOuvert}
              droite={
                <Pressable onPress={() => retirerPersonne(p)} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Retirer ${p.prenom}`}>
                  <Text style={styles.lienDanger}>Retirer</Text>
                </Pressable>
              }
            />
          ))}
          {ajoutOuvert ? (
            <View style={{ gap: espaces.s, paddingVertical: espaces.s }}>
              <TextInput
                style={styles.champ}
                value={prenom}
                onChangeText={setPrenom}
                placeholder="Prénom"
                placeholderTextColor={couleurs.encreDouce}
                accessibilityLabel="Prénom de la personne"
                autoFocus
              />
              <ChampDate
                style={styles.champ}
                value={naissance}
                onChangeText={setNaissance}
                placeholder="Date de naissance (facultatif)"
                accessibilityLabel="Date de naissance"
              />
              <Bouton titre="Ajouter" petit onPress={ajouterPersonne} enCours={enCours === 'personne'} desactive={!prenom.trim()} />
            </View>
          ) : (
            <Bouton variante="ajout" petit titre="Ajouter une personne sans compte" onPress={() => setAjoutOuvert(true)} style={{ marginVertical: espaces.s }} />
          )}
          {foyer ? (
            <Bouton variante="lien" titre={enCours === 'quitter-foyer' ? 'Départ en cours…' : 'Quitter ce foyer'} onPress={quitterMonFoyer} petit />
          ) : null}
        </Carte>

        {foyer ? (
          <Carte style={styles.carte}>
            <VisibiliteEnfants polices={policesFamille} version={personnes.length} />
          </Carte>
        ) : null}
      </View>

      <LibelleSection>Notifications par module</LibelleSection>
      <View style={styles.colonne}>
        <Carte style={{ paddingVertical: espaces.xs }}>
          {MODULES.map((m, i) => (
            <LigneListe
              key={m.id}
              gauche={<PastilleModule module={m.id} taille={36} />}
              titre={m.nom}
              sousTitre={
                prefs.notificationsModules[m.id]
                  ? rappelsActifs
                    ? 'Nouveautés affichées et sur ce téléphone'
                    : 'Nouveautés affichées'
                  : 'Nouveautés masquées'
              }
              dernier={false}
              droite={
                <Interrupteur
                  libelle={`Nouveautés ${m.nom}`}
                  valeur={prefs.notificationsModules[m.id]}
                  onChange={(v) => {
                    prefs.definirNotificationModule(m.id, v);
                    reglerModuleTelephone(m.id, v).catch(() => {});
                  }}
                />
              }
            />
          ))}
          {rappelsPossibles() ? (
            <LigneListe
              gauche={<PastilleModule module="quotidien" taille={36} icone="alarm-outline" />}
              titre="Notifications sur ce téléphone"
              sousTitre="Les nouveautés de la famille, et les rappels de vos trajets la veille"
              droite={<Interrupteur libelle="Notifications sur ce téléphone" valeur={rappelsActifs} onChange={basculerRappels} />}
            />
          ) : null}
          <LigneListe
            gauche={<PastilleModule module="quotidien" taille={36} icone="gift-outline" />}
            titre="Anniversaires"
            sousTitre="Un rappel pour souhaiter l’anniversaire des personnes de la famille"
            dernier
            droite={
              <Interrupteur
                libelle="Rappels d’anniversaires"
                valeur={anniversairesActifs}
                onChange={(v) => {
                  setAnniversairesActifs(v);
                  definirReglageAnniversaires(v).catch(() => {
                    setAnniversairesActifs(!v);
                    afficher('Impossible pour le moment. Réessayez.');
                  });
                }}
              />
            }
          />
        </Carte>
      </View>

      <JaugeSection />

      <LibelleSection>Préférences</LibelleSection>
      <View style={styles.colonne}>
        <Carte style={styles.carte}>
          <Text style={styles.titreCarte}>Apparence</Text>
          <ControleSegmente<Apparence>
            options={[
              { id: 'auto', libelle: 'Automatique' },
              { id: 'clair', libelle: 'Clair' },
              { id: 'sombre', libelle: 'Sombre' },
            ]}
            valeur={prefs.apparence}
            onChange={prefs.definirApparence}
          />
          <Text style={styles.aide}>« Automatique » suit le réglage du téléphone.</Text>
        </Carte>
        <Carte style={styles.carte}>
          <Text style={styles.titreCarte}>À prévoir sur l’accueil</Text>
          <ControleSegmente<'7' | '14'>
            options={[
              { id: '7', libelle: '7 jours' },
              { id: '14', libelle: '14 jours' },
            ]}
            valeur={String(prefs.horizonAPrevoir) as '7' | '14'}
            onChange={(v) => prefs.definirHorizonAPrevoir(v === '14' ? 14 : 7)}
          />
          <Text style={styles.aide}>Tâches à venir sur cette période. Les rappels de cadeaux arrivent 3 semaines avant un anniversaire.</Text>
        </Carte>
        <Carte style={{ paddingVertical: espaces.xs }}>
          <LigneListe
            gauche={<PastilleModule module="recettes" taille={36} icone="volume-high-outline" />}
            titre="Lire les étapes à voix haute"
            sousTitre="Dans le mode assistant des recettes"
            dernier
            droite={
              <Interrupteur
                libelle="Lire les étapes à voix haute"
                valeur={prefs.lectureAutoAssistant}
                onChange={prefs.definirLectureAutoAssistant}
              />
            }
          />
        </Carte>
        <Carte style={styles.carte}>
          <VehiculesFoyer />
        </Carte>
      </View>

      <LibelleSection>Compte</LibelleSection>
      <View style={styles.colonne}>
        <Carte style={{ paddingVertical: espaces.xs }}>
          <LigneListe
            gauche={<Icone nom="key-outline" taille={22} couleur={couleurs.encre} />}
            titre="Changer de mot de passe"
            onPress={() => navigation.navigate('MotDePasse')}
            dernier
          />
        </Carte>
        <Bouton variante="danger" titre="Se déconnecter" onPress={seDeconnecter} />
      </View>
    </ScrollView>
  );
}

// Section « Assistant » : n'apparaît que si la jauge est lisible (migration
// famille_ia passée).
function JaugeSection() {
  return (
    <View style={styles.colonne}>
      <View style={{ height: espaces.xxl }} />
      <JaugeAssistant />
    </View>
  );
}

const styles = creerStyles(() => ({
  entete: { flexDirection: 'row', alignItems: 'center', gap: espaces.l, paddingHorizontal: margePage },
  colonne: { paddingHorizontal: margePage, gap: 10 },
  carte: { gap: espaces.m },
  titreCarte: { fontFamily: polices.texteGras, fontSize: 16, color: couleurs.encre },
  aide: { fontFamily: polices.texte, fontSize: 13, lineHeight: 18, color: couleurs.encreDouce },
  champ: {
    minHeight: 48,
    borderRadius: arrondis.champ,
    borderWidth: 1,
    borderColor: couleurs.ligne,
    backgroundColor: couleurs.surface,
    paddingHorizontal: espaces.l,
    fontFamily: polices.texte,
    fontSize: 16,
    color: couleurs.encre,
  },
  choix: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 50,
    paddingHorizontal: espaces.l,
    borderRadius: arrondis.champ,
    borderWidth: 1,
    borderColor: couleurs.ligne,
  },
  choixActif: { borderColor: couleurs.encre, borderWidth: 1.5 },
  choixTexte: { flex: 1, fontFamily: polices.texteDemiGras, fontSize: 15, color: couleurs.encre },
  lienDanger: { fontFamily: polices.texteGras, fontSize: 14, color: couleurs.danger },
  erreur: { fontFamily: polices.texteDemiGras, fontSize: 14, color: couleurs.alerte },
}));
