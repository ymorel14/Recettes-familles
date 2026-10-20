import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@apps-famille/famille';
import {
  ajouterJours,
  dateDe,
  dateEnClair,
  elementsAgenda,
  isoDu,
  type ElementAgenda,
} from '../services/journee';
import { Carte, EtatVide, Icone, LibelleSection } from '../composants/ui';
import { LigneElement } from './AccueilScreen';
import { arrondis, couleurs, creerStyles, espaces, margePage, polices, texte } from '../theme/theme';

// Agenda (spécification § 2.4, charte § 8.4) : la semaine en 7 cases, un
// point sous les jours occupés, le programme du jour choisi, puis « Plus
// tard ». Trajets, tâches datées, voyages et repas, anniversaires.

const JOURS_COURTS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
const NOMS_JOURS = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];

function lundiDe(iso: string): string {
  const d = dateDe(iso);
  const decalage = (d.getDay() + 6) % 7;
  return ajouterJours(iso, -decalage);
}

export default function AgendaScreen() {
  const insets = useSafeAreaInsets();
  const { famille, foyer, foyersFamille } = useAuth();
  const aujourdHui = isoDu(new Date());
  const [jour, setJour] = useState(aujourdHui);
  const [lundi, setLundi] = useState(lundiDe(aujourdHui));
  const [elements, setElements] = useState<ElementAgenda[]>([]);
  const [chargement, setChargement] = useState(true);
  const [actualisation, setActualisation] = useState(false);

  const finPeriode = ajouterJours(lundi, 7 + 45);

  const charger = useCallback(async () => {
    if (!famille || !foyer) return;
    setElements(await elementsAgenda(lundi, finPeriode, { familleId: famille.id, foyerId: foyer.id, foyersFamille }));
    setChargement(false);
  }, [famille?.id, foyer?.id, foyersFamille, lundi, finPeriode]);

  useFocusEffect(
    useCallback(() => {
      charger();
    }, [charger])
  );

  const semaine = useMemo(() => Array.from({ length: 7 }, (_, i) => ajouterJours(lundi, i)), [lundi]);
  const occupes = useMemo(() => new Set(elements.map((e) => e.date)), [elements]);
  const duJour = elements.filter((e) => e.date === jour);
  const finSemaine = ajouterJours(lundi, 6);
  const plusTard = elements.filter((e) => e.date > finSemaine).slice(0, 12);

  const changerSemaine = (sens: number) => {
    const nouveau = ajouterJours(lundi, 7 * sens);
    setLundi(nouveau);
    setJour(sens === 0 ? aujourdHui : nouveau <= aujourdHui && aujourdHui <= ajouterJours(nouveau, 6) ? aujourdHui : nouveau);
    setChargement(true);
  };

  const mois = dateDe(jour).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: couleurs.fond }}
      contentContainerStyle={{ paddingTop: insets.top + espaces.l, paddingBottom: espaces.xxxl * 2 }}
      refreshControl={
        <RefreshControl
          refreshing={actualisation}
          onRefresh={async () => {
            setActualisation(true);
            await charger();
            setActualisation(false);
          }}
          tintColor={couleurs.encre}
        />
      }
    >
      <View style={styles.entete}>
        <Text style={texte.titreEcran()} accessibilityRole="header">
          Agenda
        </Text>
        <View style={styles.navigationSemaine}>
          <Text style={styles.mois}>{mois.charAt(0).toUpperCase() + mois.slice(1)}</Text>
          <Pressable onPress={() => changerSemaine(-1)} accessibilityRole="button" accessibilityLabel="Semaine précédente" style={styles.fleche}>
            <Icone nom="chevron-back" taille={20} />
          </Pressable>
          {lundi !== lundiDe(aujourdHui) ? (
            <Pressable onPress={() => changerSemaine(0)} accessibilityRole="button" style={styles.cetteSemaine}>
              <Text style={styles.cetteSemaineTexte}>Aujourd’hui</Text>
            </Pressable>
          ) : null}
          <Pressable onPress={() => changerSemaine(1)} accessibilityRole="button" accessibilityLabel="Semaine suivante" style={styles.fleche}>
            <Icone nom="chevron-forward" taille={20} />
          </Pressable>
        </View>
      </View>

      <View style={styles.semaine} accessibilityRole="tablist">
        {semaine.map((iso, i) => {
          const choisi = iso === jour;
          const estAujourdhui = iso === aujourdHui;
          return (
            <Pressable
              key={iso}
              onPress={() => setJour(iso)}
              accessibilityRole="tab"
              accessibilityState={{ selected: choisi }}
              accessibilityLabel={`${NOMS_JOURS[i]} ${dateDe(iso).getDate()}${occupes.has(iso) ? ', occupé' : ''}`}
              style={[styles.case, choisi && styles.caseChoisie, !choisi && estAujourdhui && styles.caseAujourdhui]}
            >
              <Text style={[styles.caseJour, choisi && { color: couleurs.fond }]}>{JOURS_COURTS[i]}</Text>
              <Text style={[styles.caseNumero, choisi && { color: couleurs.fond }]}>{dateDe(iso).getDate()}</Text>
              <View style={[styles.point, { backgroundColor: occupes.has(iso) ? (choisi ? couleurs.fond : couleurs.accent) : 'transparent' }]} />
            </Pressable>
          );
        })}
      </View>

      <LibelleSection>{dateEnClair(jour)}</LibelleSection>
      <View style={styles.colonne}>
        {duJour.length === 0 ? (
          <EtatVide texte={chargement ? 'Je regarde l’agenda…' : 'Rien de prévu ce jour-là.'} />
        ) : (
          <Carte style={{ paddingVertical: espaces.xs }}>
            {duJour.map((e, i) => (
              <LigneElement key={e.cle} e={e} dernier={i === duJour.length - 1} />
            ))}
          </Carte>
        )}
      </View>

      {plusTard.length > 0 ? (
        <>
          <LibelleSection>Plus tard</LibelleSection>
          <View style={styles.colonne}>
            <Carte style={{ paddingVertical: espaces.xs }}>
              {plusTard.map((e, i) => (
                <LigneElement
                  key={e.cle}
                  e={{ ...e, detail: [dateEnClair(e.date), e.detail].filter(Boolean).join(' · ') }}
                  dernier={i === plusTard.length - 1}
                />
              ))}
            </Carte>
          </View>
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = creerStyles(() => ({
  entete: { paddingHorizontal: margePage, gap: espaces.m },
  navigationSemaine: { flexDirection: 'row', alignItems: 'center', gap: espaces.s },
  mois: { flex: 1, fontFamily: polices.texteGras, fontSize: 16, color: couleurs.encre },
  fleche: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: couleurs.surface,
    borderWidth: 1,
    borderColor: couleurs.ligneCarte,
  },
  cetteSemaine: { minHeight: 36, paddingHorizontal: 12, justifyContent: 'center' },
  cetteSemaineTexte: { fontFamily: polices.texteGras, fontSize: 14, color: couleurs.encre },
  semaine: { flexDirection: 'row', gap: 6, paddingHorizontal: margePage, marginTop: espaces.l },
  case: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
    paddingVertical: 10,
    borderRadius: arrondis.champ,
    backgroundColor: couleurs.surface,
    borderWidth: 1,
    borderColor: couleurs.ligneCarte,
  },
  caseChoisie: { backgroundColor: couleurs.encre, borderColor: couleurs.encre },
  caseAujourdhui: { borderColor: couleurs.encre },
  caseJour: { fontFamily: polices.texteDemiGras, fontSize: 12, color: couleurs.encreDouce },
  caseNumero: { fontFamily: polices.titre, fontSize: 20, color: couleurs.encre, fontVariant: ['tabular-nums'] },
  point: { width: 6, height: 6, borderRadius: 3 },
  colonne: { paddingHorizontal: margePage },
}));
