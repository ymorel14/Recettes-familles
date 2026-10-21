import React, { useCallback, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Avatar, obtenirMonPrenom, useAuth } from '@apps-famille/famille';
import { accepterTrajet, prendreTrajet } from '../modules/quotidien/services/quotidien';
import { validerRealisation } from '../modules/quotidien/services/maison';
import {
  actionsAFaire,
  ajouterJours,
  dansCombien,
  dateEnClair,
  elementsAgenda,
  heureEnClair,
  isoDu,
  souvenirsDuJour,
  tachesAFaireAujourdhui,
  type ActionAFaire,
  type ElementAgenda,
} from '../services/journee';
import { ilYA } from '../services/notifications';
import { useNotifications } from '../contexts/NotificationsContext';
import { ChoixFamille } from '../composants/ChoixFamille';
import { ResumeMatin } from '../composants/ResumeMatin';
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
import { MODULES, couleurs, couleursModule, creerStyles, espaces, margePage, polices, texte, type IdModule } from '../theme/theme';
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
  const { session, famille, foyer, foyersFamille } = useAuth();
  const { notifications, nonLuesParModule, marquerLue, marquerActionFaite, rafraichir } = useNotifications();
  const { afficher } = useToast();
  const [prenom, setPrenom] = useState<string | null>(null);
  const [actions, setActions] = useState<ActionAFaire[]>([]);
  const [faites, setFaites] = useState<Set<string>>(new Set());
  const [aujourdhui, setAujourdhui] = useState<ElementAgenda[]>([]);
  const [taches, setTaches] = useState<TacheDuJour[]>([]);
  const [bientot, setBientot] = useState<ElementAgenda[]>([]);
  const [souvenirs, setSouvenirs] = useState<Souvenir[]>([]);
  const [resume, setResume] = useState<PhraseResume[]>([]);
  const [chargement, setChargement] = useState(true);
  const [actualisation, setActualisation] = useState(false);

  const charger = useCallback(async () => {
    if (!session || !famille || !foyer) return;
    const ctx = { familleId: famille.id, foyerId: foyer.id, foyersFamille };
    const jour = isoDu(new Date());
    const [p, a, elements, t, s] = await Promise.all([
      obtenirMonPrenom(session.user.id).catch(() => null),
      actionsAFaire(ctx, { prendreTrajet, accepterTrajet, validerRealisation }),
      elementsAgenda(jour, ajouterJours(jour, 30), ctx),
      tachesAFaireAujourdhui(),
      souvenirsDuJour(famille.id),
    ]);
    setPrenom(p);
    setActions(a);
    setAujourdhui(elements.filter((e) => e.date === jour));
    setBientot(elements.filter((e) => e.date > jour).slice(0, 12));
    setTaches(t);
    setSouvenirs(s);
    setChargement(false);
    // Résumé du matin : à part, il ne retarde pas le reste de l'accueil.
    resumeDuJour().then(setResume).catch(() => {});
  }, [session, famille?.id, foyer?.id, foyersFamille]);

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
  const nouveautes = notifications.slice(0, 5);
  const aujourdHuiTexte = dateEnClair(isoDu(new Date()));

  const executerAction = async (a: ActionAFaire) => {
    try {
      await a.executer();
      setFaites((f) => new Set(f).add(a.cle));
      afficher(
        a.bouton === 'Je conduis'
          ? 'C’est noté : vous conduisez.'
          : a.bouton === 'Valider'
            ? 'Tâche validée, points versés.'
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
        <View style={styles.enteteLigne}>
          <ChoixFamille />
          <Pressable onPress={() => navigation.navigate('Moi')} accessibilityRole="button" accessibilityLabel="Mon profil" hitSlop={8}>
            {session ? <Avatar utilisateurId={session.user.id} prenom={prenom} taille={40} /> : null}
          </Pressable>
        </View>
        <Text style={styles.bonjour} accessibilityRole="header">
          Bonjour{prenom ? ` ${prenom}` : ''}
        </Text>
        <Text style={styles.date}>{aujourdHuiTexte}</Text>
      </View>

      {resume.length > 0 ? (
        <View style={[styles.colonne, { marginTop: espaces.xl }]}>
          <ResumeMatin phrases={resume} />
        </View>
      ) : null}

      {aFaireNotifs.length + actions.length > 0 ? (
        <Section titre="À faire pour vous">
          <View style={styles.colonne}>
            {aFaireNotifs.map((n, i) => (
              <Carte key={n.id} style={styles.carteAction}>
                <PastilleModule module={n.module} />
                <Pressable style={{ flex: 1 }} onPress={() => { marquerLue(n.id); ouvrirCible(n.cible); }} accessibilityRole="button">
                  <Text style={styles.carteTitre} numberOfLines={2}>{n.message}</Text>
                  <Text style={styles.carteDetail}>{ilYA(n.cree_le)}</Text>
                </Pressable>
                <BoutonPilule
                  titre={libelleAction(n.action)}
                  ton={i === 0 ? 'accent' : 'encre'}
                  onPress={() => {
                    marquerActionFaite(n.id);
                    ouvrirCible(n.cible);
                  }}
                />
              </Carte>
            ))}
            {actions.map((a, i) => {
              const fait = faites.has(a.cle);
              const premier = aFaireNotifs.length === 0 && i === 0;
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
          {aujourdhui.length === 0 && taches.length === 0 ? (
            <EtatVide texte={chargement ? 'Je regarde votre journée…' : 'Rien de prévu aujourd’hui.'} />
          ) : (
            <Carte style={{ paddingVertical: espaces.xs }}>
              {aujourdhui.map((e, i) => (
                <LigneElement key={e.cle} e={e} dernier={i === aujourdhui.length - 1 && taches.length === 0} />
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

export function LigneElement({ e, dernier }: { e: ElementAgenda; dernier?: boolean }) {
  return (
    <Pressable
      onPress={() => ouvrirElement(e.module, e.cible)}
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
  enteteLigne: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: espaces.l },
  bonjour: texte.titreAccueil(),
  date: { ...texte.secondaire(), fontSize: 15 },
  colonne: { paddingHorizontal: margePage, gap: espaces.s },
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
