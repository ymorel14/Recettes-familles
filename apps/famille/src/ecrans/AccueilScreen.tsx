import React, { useCallback, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { obtenirMonPrenom, useAuth } from '@apps-famille/famille';
import { accepterTrajet } from '../modules/quotidien/services/quotidien';
import { anniversaires, rappelAutoFait, validerRealisation, type Anniversaire } from '../modules/quotidien/services/maison';
import {
  aPrevoir,
  actionsAFaire,
  ajouterJours,
  dansCombien,
  dateEnClair,
  elementsAgenda,
  heureEnClair,
  isoDu,
  jeMEnOccuper,
  souvenirsDuJour,
  tachesAFaireAujourdhui,
  type ActionAFaire,
  type ElementAgenda,
  type ElementAPrevoir,
} from '../services/journee';
import { usePreferences } from '../contexts/PreferencesContext';
import { listeDe } from '../modules/cadeaux/services/wishlist';
import { ilYA } from '../services/notifications';
import { useNotifications } from '../contexts/NotificationsContext';
import { ResumeMatin } from '../composants/ResumeMatin';
import { libelleRecetteEnCours, useRecettesEnCours } from '../modules/recettes/hooks/useRecettesEnCours';
import { useFamillesVues } from '../services/familles';
import { resumeDuJour, type PhraseResume } from '../services/resumeMatin';
import { useToast } from '../composants/Toast';
import {
  BoutonPilule,
  Carte,
  Compteur,
  EtatVide,
  Icone,
  LigneListe,
  Pastille,
  PastilleModule,
  Section,
} from '../composants/ui';
import { MODULES, couleurs, couleursModule, creerStyles, espaces, margePage, polices, texte, useEcranLarge, type IdModule } from '../theme/theme';
import { ouvrirCible, ouvrirModule, ouvrirOngletModule } from '../navigation/navigationRef';
import type { TacheDuJour } from '../modules/quotidien/services/maison';
import type { Souvenir } from '../modules/souvenirs/services/souvenirs';

// Accueil (spécification § 2.4, charte § 8.1) : la journée d'un coup d'œil.
// Ordre : bonjour, résumé du matin (assistant), À faire pour vous,
// Aujourd'hui, modules, Bientôt, Nouveautés de la famille, Il y a un an.

export function ouvrirElement(module: IdModule, cible: ElementAgenda['cible']) {
  if (cible.onglet) ouvrirOngletModule(module, cible.onglet);
  else if (cible.ecran) ouvrirModule(module, cible.ecran, cible.params);
  else ouvrirModule(module);
}

export default function AccueilScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  // Tablette (G-5) : deux colonnes, « pour vous » à gauche, la famille à droite.
  const large = useEcranLarge();
  const { session, famille, foyer, foyersFamille } = useAuth();
  // Toutes les familles du foyer (vue unique, G-2).
  const famillesVues = useFamillesVues();
  const { notifications, nonLuesParModule, marquerLue, marquerActionFaite, rafraichir } = useNotifications();
  const { afficher } = useToast();
  const [prenom, setPrenom] = useState<string | null>(null);
  const [actions, setActions] = useState<ActionAFaire[]>([]);
  const [faites, setFaites] = useState<Set<string>>(new Set());
  const [aujourdhui, setAujourdhui] = useState<ElementAgenda[]>([]);
  const [taches, setTaches] = useState<TacheDuJour[]>([]);
  // Rappels automatiques du jour (anniversaires) : « C'est fait » directement.
  const [annivsDuJour, setAnnivsDuJour] = useState<Anniversaire[]>([]);
  const [bientot, setBientot] = useState<ElementAgenda[]>([]);
  // « À prévoir » (retour de test G-3) : horizon réglable dans Moi.
  const { horizonAPrevoir } = usePreferences();
  const [prevoir, setPrevoir] = useState<ElementAPrevoir[]>([]);
  const [souvenirs, setSouvenirs] = useState<Souvenir[]>([]);
  const [resume, setResume] = useState<PhraseResume[]>([]);
  const [chargement, setChargement] = useState(true);
  const [actualisation, setActualisation] = useState(false);

  const charger = useCallback(async () => {
    if (!session || !famille || !foyer) return;
    const ctx = { familleId: famillesVues, foyerId: foyer.id, foyersFamille };
    const jour = isoDu(new Date());
    const [p, a, elements, t, s, ap, an] = await Promise.all([
      obtenirMonPrenom(session.user.id).catch(() => null),
      actionsAFaire(ctx, {
        prendreTrajet: (idTrajet) => jeMEnOccuper(idTrajet, foyer.id, session.user.id),
        accepterTrajet,
        validerRealisation,
      }),
      elementsAgenda(jour, ajouterJours(jour, 30), ctx),
      tachesAFaireAujourdhui(),
      souvenirsDuJour(famillesVues),
      aPrevoir(ctx, horizonAPrevoir, session.user.id).catch(() => [] as ElementAPrevoir[]),
      anniversaires(jour, jour).catch(() => [] as Anniversaire[]),
    ]);
    setPrenom(p);
    setActions(a);
    // Les anniversaires du jour sont des rappels automatiques (avec « C'est fait »).
    setAnnivsDuJour(an.filter((x) => !x.moi && !x.fait));
    setAujourdhui(elements.filter((e) => e.date === jour && !e.cle.startsWith('anniv-')));
    // « Bientôt » garde les grands événements ; les tâches à venir sont
    // dans « À prévoir ».
    setBientot(elements.filter((e) => e.date > jour && !e.cle.startsWith('tache-')).slice(0, 12));
    setPrevoir(ap);
    setTaches(t);
    setSouvenirs(s);
    setChargement(false);
    // Résumé du matin : à part, il ne retarde pas le reste de l'accueil.
    resumeDuJour().then(setResume).catch(() => {});
  }, [session, famille?.id, foyer?.id, foyersFamille, famillesVues, horizonAPrevoir]);

  useFocusEffect(
    useCallback(() => {
      charger();
    }, [charger])
  );

  const actualiser = async () => {
    setActualisation(true);
    await Promise.all([charger(), rafraichir()]);
    setActualisation(false);
  };

  // « À faire pour vous » : actions de la base (notifications à action) et
  // actions directes calculées (trajets sans conducteur, tâches à valider).
  const aFaireNotifs = notifications.filter((n) => n.action && !n.action_faite_le).slice(0, 5);
  // Recettes commencées dans le mode assistant, sur ce téléphone (R-14).
  const recettesEnCours = useRecettesEnCours();
  const nouveautes = notifications.slice(0, 5);
  const aujourdHuiTexte = dateEnClair(isoDu(new Date()));

  const executerAction = async (a: ActionAFaire) => {
    try {
      await a.executer();
      setFaites((f) => new Set(f).add(a.cle));
      afficher(
        a.bouton === 'Je conduis' || a.bouton === 'Je m’en occupe'
          ? 'C’est noté : vous vous en occupez.'
          : a.bouton === 'Valider'
            ? 'Validé.'
            : a.bouton === 'Ajouter'
              ? 'Ajouté à la liste de courses.'
              : 'C’est noté.'
      );
    } catch {
      afficher('Impossible pour le moment. Réessayez.');
    }
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: couleurs.fond }}
      contentContainerStyle={{ paddingTop: insets.top + espaces.m, paddingBottom: espaces.xxxl * 2 }}
      refreshControl={<RefreshControl refreshing={actualisation} onRefresh={actualiser} tintColor={couleurs.encre} />}
    >
      <View style={styles.entete}>
        {/* Plus de « Famille Morel ▾ » (G-2) : l'accueil montre toutes les
            familles du foyer. Plus d'avatar non plus (G-1) : le profil est
            l'onglet « Moi » de la barre du bas, qui affiche la photo.
            Loupe : recherche dans toute l'app (P-2). */}
        <View style={styles.enteteLigne}>
          <Text style={[styles.bonjour, { flex: 1 }]} accessibilityRole="header">
            Bonjour{prenom ? ` ${prenom}` : ''}
          </Text>
          <Pressable
            onPress={() => navigation.navigate('Recherche')}
            accessibilityRole="button"
            accessibilityLabel="Rechercher dans toute l’app"
            hitSlop={8}
            style={styles.loupe}
          >
            <Icone nom="search-outline" taille={22} couleur={couleurs.encre} />
          </Pressable>
        </View>
        <Text style={styles.date}>{aujourdHuiTexte}</Text>
      </View>

      {resume.length > 0 ? (
        <View style={[styles.colonne, { marginTop: espaces.xl }]}>
          <ResumeMatin phrases={resume} />
        </View>
      ) : null}

      <View style={large ? styles.deuxColonnes : undefined}>
      <View style={large ? styles.moitie : undefined}>
      {aFaireNotifs.length + actions.length + recettesEnCours.length > 0 ? (
        <Section titre="À faire pour vous">
          <View style={styles.colonne}>
            {recettesEnCours.map((r, i) => (
              <Carte key={`cuisine-${r.recetteId}`} style={[styles.carteAction, { backgroundColor: couleursModule('recettes').fond, borderWidth: 0 }]}>
                <PastilleModule module="recettes" />
                <Pressable
                  style={{ flex: 1, gap: 4 }}
                  onPress={() => ouvrirModule('recettes', 'AssistantRecette', { recetteId: r.recetteId })}
                  accessibilityRole="button"
                >
                  <Text style={styles.carteTitre} numberOfLines={2}>{r.titre}</Text>
                  <Text style={[styles.carteDetail, { color: couleursModule('recettes').encre }]}>En cuisine · {libelleRecetteEnCours(r)}</Text>
                  {r.etapesTotal > 0 ? (
                    <View style={[styles.progres, { backgroundColor: couleurs.surface }]}>
                      <View
                        style={[
                          styles.progres,
                          { width: `${Math.round((Math.min(r.etapesFaites, r.etapesTotal) / r.etapesTotal) * 100)}%`, backgroundColor: couleursModule('recettes').principal },
                        ]}
                      />
                    </View>
                  ) : null}
                </Pressable>
                <BoutonPilule
                  titre="Reprendre"
                  ton="doux"
                  module="recettes"
                  onPress={() => ouvrirModule('recettes', 'AssistantRecette', { recetteId: r.recetteId })}
                />
              </Carte>
            ))}
            {aFaireNotifs.map((n, i) => (
              <Carte key={n.id} style={styles.carteAction}>
                <PastilleModule module={n.module} />
                <Pressable style={{ flex: 1 }} onPress={() => { marquerLue(n.id); ouvrirCible(n.cible); }} accessibilityRole="button">
                  <Text style={styles.carteTitre} numberOfLines={2}>{n.message}</Text>
                  <Text style={styles.carteDetail}>{ilYA(n.cree_le)}</Text>
                </Pressable>
                <BoutonPilule
                  titre={libelleAction(n.action)}
                  ton={i === 0 && recettesEnCours.length === 0 ? 'accent' : 'encre'}
                  onPress={() => {
                    marquerActionFaite(n.id);
                    ouvrirCible(n.cible);
                  }}
                />
              </Carte>
            ))}
            {actions.map((a, i) => {
              const fait = faites.has(a.cle);
              const premier = aFaireNotifs.length === 0 && recettesEnCours.length === 0 && i === 0;
              return (
                <Carte key={a.cle} style={styles.carteAction}>
                  <PastilleModule module={a.module} />
                  <Pressable
                    style={{ flex: 1 }}
                    onPress={() => a.cible && ouvrirElement(a.module, a.cible)}
                    accessibilityRole="button"
                    accessibilityLabel={`${a.titre}. ${a.detail}`}
                  >
                    <Text style={styles.carteTitre} numberOfLines={2}>{a.titre}</Text>
                    <Text style={styles.carteDetail} numberOfLines={2}>{fait ? 'C’est fait.' : a.detail}</Text>
                  </Pressable>
                  {fait ? (
                    <Icone nom="checkmark-circle" taille={28} couleur={couleurs.succes} />
                  ) : (
                    <BoutonPilule titre={a.bouton} ton={premier ? 'accent' : 'encre'} onPress={() => executerAction(a)} />
                  )}
                </Carte>
              );
            })}
          </View>
        </Section>
      ) : null}

      <Section titre="Aujourd’hui" action="Agenda" onAction={() => navigation.navigate('Agenda')}>
        <View style={styles.colonne}>
          {aujourdhui.length === 0 && taches.length === 0 && annivsDuJour.length === 0 ? (
            <EtatVide texte={chargement ? 'Je regarde votre journée…' : 'Rien de prévu aujourd’hui.'} />
          ) : (
            <Carte style={{ paddingVertical: espaces.xs }}>
              {aujourdhui.map((e, i) => (
                <LigneElement
                  key={e.cle}
                  e={e}
                  dernier={i === aujourdhui.length - 1 && taches.length === 0 && annivsDuJour.length === 0}
                />
              ))}
              {annivsDuJour.map((a, i) => (
                <LigneListe
                  key={a.cle}
                  gauche={<PastilleModule module="quotidien" taille={36} icone="gift-outline" />}
                  titre={`Souhaiter l’anniversaire de ${a.prenom}`}
                  sousTitre={`Automatique · ${a.age} ans`}
                  droite={
                    <BoutonPilule
                      titre="C’est fait"
                      ton="encre"
                      onPress={() =>
                        rappelAutoFait(a.cle)
                          .then(() => {
                            setAnnivsDuJour((l) => l.filter((x) => x.cle !== a.cle));
                            afficher('C’est noté.');
                          })
                          .catch(() => afficher('Impossible pour le moment. Réessayez.'))
                      }
                    />
                  }
                  dernier={i === annivsDuJour.length - 1 && taches.length === 0}
                />
              ))}
              {taches.length > 0 ? (
                <LigneListe
                  gauche={<PastilleModule module="quotidien" taille={36} icone="checkbox-outline" />}
                  titre={taches.length === 1 ? `1 tâche de la maison` : `${taches.length} tâches de la maison`}
                  sousTitre={taches.slice(0, 3).map((t) => t.libelle).join(' · ')}
                  onPress={() => ouvrirOngletModule('quotidien', 'Taches')}
                  dernier
                />
              ) : null}
            </Carte>
          )}
        </View>
      </Section>

      {prevoir.length > 0 ? (
        <Section titre="À prévoir">
          <View style={styles.colonne}>
            <Carte style={{ paddingVertical: espaces.xs }}>
              {prevoir.map((e, i) =>
                e.personneId ? (
                  <LigneElement
                    key={e.cle}
                    e={e}
                    dernier={i === prevoir.length - 1}
                    onPress={() =>
                      listeDe(e.personneId!)
                        .then((listeId) => ouvrirModule('cadeaux', 'Liste', { listeId }))
                        .catch(() => ouvrirElement(e.module, e.cible))
                    }
                  />
                ) : (
                  <LigneElement key={e.cle} e={e} dernier={i === prevoir.length - 1} />
                )
              )}
            </Carte>
          </View>
        </Section>
      ) : null}

      </View>
      <View style={large ? styles.moitie : undefined}>
      <View style={styles.tuiles}>
        {MODULES.map((m) => {
          const c = couleursModule(m.id);
          return (
            <Pressable
              key={m.id}
              onPress={() => ouvrirModule(m.id)}
              accessibilityRole="button"
              accessibilityLabel={nonLuesParModule[m.id] ? `${m.nom}, ${nonLuesParModule[m.id]} nouveautés` : m.nom}
              style={({ pressed }) => [styles.tuile, { backgroundColor: c.fond }, pressed && { opacity: 0.85 }]}
            >
              <Icone nom={m.icone} taille={28} couleur={c.encre} />
              <Text style={[styles.tuileNom, { color: c.encre }]} numberOfLines={1}>
                {m.nom}
              </Text>
              <Compteur nombre={nonLuesParModule[m.id]} style={styles.tuileCompteur} />
            </Pressable>
          );
        })}
      </View>

      {bientot.length > 0 ? (
        <Section titre="Bientôt">
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.defilement}>
            {bientot.map((e) => {
              const c = couleursModule(e.module);
              return (
                <Carte key={e.cle} style={styles.carteBientot} onPress={() => ouvrirElement(e.module, e.cible)} accessibilityLabel={`${e.titre}, ${dansCombien(e.date)}`}>
                  <View style={[styles.bandeau, { backgroundColor: c.encre }]} />
                  <Text style={[styles.bientotQuand, { color: c.encre }]}>
                    {dansCombien(e.date)}
                    {e.heure ? ` · ${heureEnClair(e.heure)}` : ''}
                  </Text>
                  <Text style={styles.carteTitre} numberOfLines={2}>{e.titre}</Text>
                  {e.detail ? <Text style={styles.carteDetail} numberOfLines={1}>{e.detail}</Text> : null}
                </Carte>
              );
            })}
          </ScrollView>
        </Section>
      ) : null}

      {nouveautes.length > 0 ? (
        <Section titre="Nouveautés de la famille" action="Tout voir" onAction={() => navigation.navigate('Activite')}>
          <View style={styles.colonne}>
            <Carte style={{ paddingVertical: espaces.xs }}>
              {nouveautes.map((n, i) => (
                <LigneListe
                  key={n.id}
                  gauche={<PastilleModule module={n.module} taille={36} />}
                  titre={n.message}
                  sousTitre={ilYA(n.cree_le)}
                  gras={!n.lue_le}
                  dernier={i === nouveautes.length - 1}
                  onPress={() => {
                    marquerLue(n.id);
                    ouvrirCible(n.cible);
                  }}
                />
              ))}
            </Carte>
          </View>
        </Section>
      ) : null}

      {souvenirs.length > 0 ? (
        <Section titre="Il y a un an">
          <View style={styles.colonne}>
            {souvenirs.slice(0, 3).map((s) => {
              const annees = s.date_debut ? new Date().getFullYear() - Number(s.date_debut.slice(0, 4)) : null;
              return (
                <Carte key={s.id} style={styles.carteAction} onPress={() => ouvrirModule('souvenirs', 'Souvenir', { id: s.id })}>
                  <PastilleModule module="souvenirs" />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.carteTitre} numberOfLines={2}>{s.titre}</Text>
                    <Text style={styles.carteDetail}>
                      {annees ? `Il y a ${annees} an${annees > 1 ? 's' : ''}` : 'Ce jour-là'}
                      {s.lieu ? ` · ${s.lieu}` : ''}
                    </Text>
                  </View>
                  <Icone nom="chevron-forward" taille={18} couleur={couleurs.encreDouce} />
                </Carte>
              );
            })}
          </View>
        </Section>
      ) : null}
      </View>
      </View>
    </ScrollView>
  );
}

function libelleAction(action: string | null): string {
  switch (action) {
    case 'valider':
      return 'Valider';
    case 'voter':
      return 'Voter';
    case 'conduire':
      return 'Je conduis';
    case 'repondre':
      return 'Répondre';
    default:
      return 'Voir';
  }
}

export function LigneElement({ e, dernier, onPress }: { e: ElementAgenda; dernier?: boolean; onPress?: () => void }) {
  return (
    <Pressable
      onPress={onPress ?? (() => ouvrirElement(e.module, e.cible))}
      accessibilityRole="button"
      accessibilityLabel={[e.heure ? heureEnClair(e.heure) : '', e.titre, e.detail, e.statut?.texte].filter(Boolean).join(', ')}
      style={({ pressed }) => [styles.ligneElement, !dernier && styles.ligneSeparee, pressed && { opacity: 0.7 }]}
    >
      <View style={styles.heureColonne}>
        {e.heure ? <Text style={styles.heure}>{heureEnClair(e.heure)}</Text> : <PastilleModule module={e.module} taille={36} />}
      </View>
      <View style={{ flex: 1, gap: 3 }}>
        <Text style={styles.ligneTitre} numberOfLines={2}>{e.titre}</Text>
        {e.detail ? <Text style={styles.carteDetail} numberOfLines={2}>{e.detail}</Text> : null}
        {e.statut ? <Pastille texte={e.statut.texte} ton={e.statut.ton} /> : null}
      </View>
      <Icone nom="chevron-forward" taille={18} couleur={couleurs.encreDouce} />
    </Pressable>
  );
}

const styles = creerStyles(() => ({
  entete: { paddingHorizontal: margePage, gap: espaces.xs },
  enteteLigne: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: espaces.m },
  loupe: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: couleurs.surface },
  bonjour: texte.titreAccueil(),
  date: { ...texte.secondaire(), fontSize: 15 },
  colonne: { paddingHorizontal: margePage, gap: espaces.s },
  deuxColonnes: { flexDirection: 'row', alignItems: 'flex-start' },
  progres: { height: 6, borderRadius: 3, marginTop: 4 },
  moitie: { flex: 1, minWidth: 0 },
  carteAction: { flexDirection: 'row', alignItems: 'center', gap: espaces.m, paddingVertical: espaces.m },
  carteTitre: { fontFamily: polices.texteGras, fontSize: 15, lineHeight: 20, color: couleurs.encre },
  carteDetail: { ...texte.secondaire(), marginTop: 2 },
  tuiles: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    paddingHorizontal: margePage,
    marginTop: espaces.xxxl,
  },
  tuile: {
    flexBasis: '30%',
    flexGrow: 1,
    height: 108,
    borderRadius: 22,
    padding: 14,
    justifyContent: 'space-between',
  },
  tuileNom: { fontFamily: polices.texteGras, fontSize: 14 },
  tuileCompteur: { position: 'absolute', top: 10, right: 10 },
  defilement: { paddingHorizontal: margePage, gap: 10 },
  carteBientot: { width: 200, gap: 4, overflow: 'hidden', paddingTop: espaces.l + 4 },
  bandeau: { position: 'absolute', top: 0, left: 0, right: 0, height: 4 },
  bientotQuand: { fontFamily: polices.texteGras, fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5 },
  heureColonne: { width: 48, alignItems: 'flex-start', paddingTop: 1 },
  ligneElement: { flexDirection: 'row', alignItems: 'flex-start', gap: espaces.m, paddingVertical: 14 },
  ligneSeparee: { borderBottomWidth: 1, borderBottomColor: couleurs.separateur },
  ligneTitre: { fontFamily: polices.texteDemiGras, fontSize: 15, lineHeight: 20, color: couleurs.encre },
  heure: { fontFamily: polices.texteGras, fontSize: 14, color: couleurs.encre, fontVariant: ['tabular-nums'] },
}));
