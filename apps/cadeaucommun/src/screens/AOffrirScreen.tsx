import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, Pressable, RefreshControl } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { theme, creerStylesThemes } from '../theme/theme';
import { useAuth } from '../contexts/AuthContext';
import { Avatar, extraireMessageErreur } from '@apps-famille/famille';
import { alerte } from '../utils/alerte';
import {
  formaterPrix,
  joindrePrenoms,
  libellePrix,
  listerPersonnes,
  marquerAchete,
  marquerOffert,
  marquerPotOffert,
  marquerVerse,
  mesParticipations,
  mesReservations,
  type MaParticipation,
  type MaReservation,
  type Personne,
} from '../services/wishlist';
import { Chargement, MessageVide } from '../components/ui';

// Onglet "À offrir" : tout ce que j'ai réservé et mes participations aux
// pots communs, regroupés par personne, avec ce qui reste à acheter ou à
// verser et le budget. Une fois le cadeau remis, je le coche "Offert" : il
// disparaît alors de la liste de la personne. Personne d'autre ne voit cet
// écran.
export default function AOffrirScreen({ navigation }: any) {
  const { foyersFamille } = useAuth();
  const [reservations, setReservations] = useState<MaReservation[] | null>(null);
  const [participations, setParticipations] = useState<MaParticipation[]>([]);
  const [personnes, setPersonnes] = useState<Personne[]>([]);
  const [rechargement, setRechargement] = useState(false);
  const [voirOfferts, setVoirOfferts] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const charger = useCallback(async () => {
    try {
      setErreur(null);
      const [r, pa, p] = await Promise.all([mesReservations(), mesParticipations(), listerPersonnes(foyersFamille)]);
      setReservations(r);
      setParticipations(pa);
      setPersonnes(p);
    } catch (e) {
      setErreur(extraireMessageErreur(e, 'Chargement impossible.'));
      setReservations([]);
    }
  }, [foyersFamille]);

  useFocusEffect(
    useCallback(() => {
      charger();
    }, [charger])
  );

  if (reservations === null) return <Chargement />;

  const prenomDe = (personneId?: string | null) => personnes.find((p) => p.id === personneId)?.prenom || 'un proche';

  // Pour qui est un cadeau : la personne de la liste, ou les destinataires
  // d'une liste commune ("Mamie et Papi"), avec le titre de cette liste.
  type ListeDuCadeau = NonNullable<NonNullable<MaReservation['souhait']>['liste']>;
  const pourQui = (l: ListeDuCadeau | null | undefined) => {
    if (!l) return { cle: 'inconnu', personneId: null as string | null, prenom: 'un proche', titre: null as string | null };
    if (l.destinataire_id) return { cle: l.destinataire_id, personneId: l.destinataire_id, prenom: prenomDe(l.destinataire_id), titre: null };
    const noms = (l.destinataires ?? [])
      .map((d) => personnes.find((p) => p.id === d.personne_id)?.prenom)
      .filter((x): x is string => !!x)
      .sort((a, b) => a.localeCompare(b));
    return { cle: `liste-${l.id}`, personneId: null, prenom: joindrePrenoms(noms) || 'plusieurs proches', titre: l.titre };
  };

  const enregistrer = async (action: () => Promise<unknown>) => {
    try {
      await action();
    } catch (e) {
      setErreur(extraireMessageErreur(e, 'Enregistrement impossible.'));
    }
    charger();
  };

  const basculerAchat = (r: MaReservation) => {
    // Mise à jour immédiate à l'écran, puis enregistrement.
    setReservations((liste) => liste?.map((x) => (x.id === r.id ? { ...x, achete: !r.achete } : x)) ?? null);
    enregistrer(() => marquerAchete(r.id, !r.achete));
  };

  const basculerVerse = (p: MaParticipation) => {
    setParticipations((liste) => liste.map((x) => (x.id === p.id ? { ...x, verse: !p.verse } : x)));
    enregistrer(() => marquerVerse(p.id, !p.verse));
  };

  // "Offert" retire le cadeau de la liste du destinataire : on confirme.
  const confirmerOffert = (titre: string, pour: string, action: () => Promise<unknown>) =>
    alerte(`${titre} a été offert à ${pour} ?`, `Le cadeau disparaîtra de la liste de ${pour}.`, [
      { text: 'Pas encore', style: 'cancel' },
      { text: 'Oui, offert', onPress: () => enregistrer(action) },
    ]);

  const enCours = {
    lignes: reservations.filter((r) => !r.offert_le),
    pots: participations.filter((p) => !p.offert_le),
  };
  const offerts = {
    lignes: reservations.filter((r) => r.offert_le),
    pots: participations.filter((p) => p.offert_le),
  };

  // Regroupement par personne (destinataire), par ordre alphabétique.
  // Une liste commune forme son propre groupe.
  type Groupe = {
    cle: string;
    personneId: string | null;
    prenom: string;
    titre: string | null;
    lignes: MaReservation[];
    pots: MaParticipation[];
  };
  const grouper = (lignes: MaReservation[], pots: MaParticipation[]) => {
    const groupes = new Map<string, Groupe>();
    const groupeDe = (l: ListeDuCadeau | null | undefined) => {
      const q = pourQui(l);
      if (!groupes.has(q.cle)) groupes.set(q.cle, { ...q, lignes: [], pots: [] });
      return groupes.get(q.cle)!;
    };
    lignes.forEach((r) => groupeDe(r.souhait?.liste).lignes.push(r));
    pots.forEach((p) => groupeDe(p.souhait?.liste).pots.push(p));
    return [...groupes.values()].sort((a, b) => a.prenom.localeCompare(b.prenom));
  };

  const ligneReservation = (r: MaReservation, offert: boolean) => {
    const titre = `${r.souhait?.titre ?? 'Cadeau'}${r.option ? ` · ${r.option.titre}` : ''}`;
    const pour = pourQui(r.souhait?.liste).prenom;
    return (
      <View key={r.id} style={styles.ligne}>
        {!offert && (
          <Pressable
            onPress={() => basculerAchat(r)}
            style={styles.case}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: r.achete }}
            accessibilityLabel={`${titre} acheté`}
            hitSlop={8}
          >
            <Ionicons
              name={r.achete ? 'checkbox' : 'square-outline'}
              size={26}
              color={r.achete ? theme.colors.success : theme.colors.textMuted}
            />
          </Pressable>
        )}
        <Pressable
          style={styles.ligneTextes}
          onPress={() => r.souhait?.liste && navigation.navigate('Liste', { listeId: r.souhait.liste.id })}
          accessibilityRole="button"
        >
          <Text style={[styles.ligneTitre, (r.achete || offert) && styles.attenue]}>
            {titre}
            {r.quantite > 1 ? ` ×${r.quantite}` : ''}
          </Text>
          <Text style={styles.detail}>
            {offert ? 'Offert' : r.achete ? 'Acheté' : 'À acheter'}
            {r.option?.prix != null
              ? ` · ${formaterPrix(r.option.prix)}`
              : r.souhait?.prix != null
                ? ` · ${libellePrix(r.souhait.prix, r.souhait.type_prix)}`
                : ''}
            {r.souhait?.secret ? ' · idée de la famille' : ''}
          </Text>
          {!offert && r.souhait?.supprime_le && (
            <Text style={styles.alerte}>Retiré de sa liste depuis : vérifiez avant d'acheter.</Text>
          )}
        </Pressable>
        {offert ? (
          <Pressable onPress={() => enregistrer(() => marquerOffert(r.id, false))} hitSlop={8} accessibilityRole="button">
            <Text style={styles.lienDiscret}>Annuler</Text>
          </Pressable>
        ) : (
          <Pressable
            onPress={() => confirmerOffert(titre, pour, () => marquerOffert(r.id, true))}
            style={styles.boutonOffert}
            accessibilityRole="button"
            accessibilityLabel={`${titre} offert`}
          >
            <Ionicons name="gift-outline" size={16} color={theme.colors.accent} />
            <Text style={styles.boutonOffertTexte}>Offert</Text>
          </Pressable>
        )}
      </View>
    );
  };

  const lignePot = (p: MaParticipation, offert: boolean) => {
    const titre = p.souhait?.titre ?? 'Pot commun';
    const pour = pourQui(p.souhait?.liste).prenom;
    return (
      <View key={p.id} style={styles.ligne}>
        {!offert && (
          <Pressable
            onPress={() => basculerVerse(p)}
            style={styles.case}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: p.verse }}
            accessibilityLabel={`Participation à ${titre} versée`}
            hitSlop={8}
          >
            <Ionicons
              name={p.verse ? 'checkbox' : 'square-outline'}
              size={26}
              color={p.verse ? theme.colors.success : theme.colors.textMuted}
            />
          </Pressable>
        )}
        <Pressable
          style={styles.ligneTextes}
          onPress={() =>
            p.souhait?.liste &&
            navigation.navigate('Participation', { listeId: p.souhait.liste.id, souhaitId: p.souhait_id, prenom: pour })
          }
          accessibilityRole="button"
        >
          <Text style={[styles.ligneTitre, (p.verse || offert) && styles.attenue]}>
            {titre} · {formaterPrix(p.montant)}
          </Text>
          <Text style={styles.detail}>
            Pot commun · {offert ? 'offert' : p.verse ? 'versé' : 'à verser'}
          </Text>
          {!offert && p.souhait?.supprime_le && (
            <Text style={styles.alerte}>Retiré de sa liste depuis : voyez avec la famille.</Text>
          )}
        </Pressable>
        {offert ? (
          <Pressable onPress={() => enregistrer(() => marquerPotOffert(p.id, false))} hitSlop={8} accessibilityRole="button">
            <Text style={styles.lienDiscret}>Annuler</Text>
          </Pressable>
        ) : (
          <Pressable
            onPress={() => confirmerOffert(titre, pour, () => marquerPotOffert(p.id, true))}
            style={styles.boutonOffert}
            accessibilityRole="button"
            accessibilityLabel={`${titre} offert`}
          >
            <Ionicons name="gift-outline" size={16} color={theme.colors.accent} />
            <Text style={styles.boutonOffertTexte}>Offert</Text>
          </Pressable>
        )}
      </View>
    );
  };

  const groupesEnCours = grouper(enCours.lignes, enCours.pots);
  const nbOfferts = offerts.lignes.length + offerts.pots.length;

  return (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={styles.contenu}
      refreshControl={
        <RefreshControl
          refreshing={rechargement}
          onRefresh={async () => {
            setRechargement(true);
            await charger();
            setRechargement(false);
          }}
          tintColor={theme.colors.accent}
        />
      }
    >
      {erreur && <Text style={styles.erreur}>{erreur}</Text>}
      {groupesEnCours.length === 0 ? (
        <MessageVide
          titre="Rien à offrir pour l'instant"
          texte="Réservez un cadeau ou participez à un pot commun dans la liste d'un proche : il apparaîtra ici. Vous seul le voyez."
        />
      ) : (
        <>
          <Text style={styles.intro}>
            Une fois le cadeau remis, touchez « Offert » : il disparaîtra de la liste de la personne.
          </Text>
          {groupesEnCours.map((g) => {
            const total =
              g.lignes.reduce((s, r) => s + (r.option?.prix ?? r.souhait?.prix ?? 0) * r.quantite, 0) +
              g.pots.reduce((s, p) => s + p.montant, 0);
            const restants = g.lignes.filter((r) => !r.achete).length;
            const aVerser = g.pots.filter((p) => !p.verse).length;
            const resume = [
              restants > 0 ? `${restants} à acheter` : null,
              aVerser > 0 ? `${aVerser} participation${aVerser > 1 ? 's' : ''} à verser` : null,
            ].filter(Boolean);
            return (
              <View key={g.cle} style={styles.groupe}>
                <View style={styles.groupeEntete}>
                  {g.personneId ? (
                    <Avatar personneId={g.personneId} prenom={g.prenom} taille={36} />
                  ) : (
                    <View style={styles.iconeCommune}>
                      <Ionicons name="gift-outline" size={20} color={theme.colors.accent} />
                    </View>
                  )}
                  <View style={styles.groupeTextes}>
                    <Text style={styles.groupeTitre}>Pour {g.prenom}</Text>
                    {g.titre ? <Text style={styles.detail}>Liste commune · {g.titre}</Text> : null}
                    <Text style={styles.detail}>
                      {resume.length === 0 ? 'Tout est prêt' : resume.join(' · ')}
                      {total > 0 ? ` · budget ${formaterPrix(total)}` : ''}
                    </Text>
                  </View>
                </View>
                {g.lignes.map((r) => ligneReservation(r, false))}
                {g.pots.map((p) => lignePot(p, false))}
              </View>
            );
          })}
        </>
      )}

      {nbOfferts > 0 && (
        <View style={styles.offerts}>
          <Pressable onPress={() => setVoirOfferts(!voirOfferts)} style={styles.offertsEntete} accessibilityRole="button">
            <Text style={styles.section}>Déjà offerts ({nbOfferts})</Text>
            <Ionicons name={voirOfferts ? 'chevron-up' : 'chevron-down'} size={20} color={theme.colors.textMuted} />
          </Pressable>
          {voirOfferts &&
            grouper(offerts.lignes, offerts.pots).map((g) => (
              <View key={g.cle} style={[styles.groupe, styles.groupeOffert]}>
                <Text style={styles.groupeTitreOffert}>Pour {g.prenom}</Text>
                {g.lignes.map((r) => ligneReservation(r, true))}
                {g.pots.map((p) => lignePot(p, true))}
              </View>
            ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = creerStylesThemes(() => ({
  flex: { flex: 1, backgroundColor: theme.colors.background },
  contenu: { padding: theme.spacing.md, gap: theme.spacing.md, paddingBottom: theme.spacing.xl },
  intro: { fontFamily: theme.fontBody, fontSize: 14, color: theme.colors.textMuted },
  groupe: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radii.lg,
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  groupeOffert: { backgroundColor: theme.colors.background },
  groupeEntete: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
  groupeTextes: { flex: 1, gap: 2 },
  iconeCommune: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.accentTransparent,
  },
  groupeTitre: { fontFamily: theme.fontTitle, fontSize: 20, color: theme.colors.text },
  groupeTitreOffert: { fontFamily: theme.fontBodyBold, fontSize: 15, color: theme.colors.textMuted },
  ligne: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingTop: theme.spacing.sm,
    borderTopWidth: 1,
    borderStyle: 'dashed',
    borderColor: theme.colors.border,
  },
  case: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  ligneTextes: { flex: 1, gap: 2, minHeight: 44, justifyContent: 'center' },
  ligneTitre: { fontFamily: theme.fontBodyBold, fontSize: 16, color: theme.colors.text },
  attenue: { color: theme.colors.textMuted },
  detail: { fontFamily: theme.fontBody, fontSize: 13, color: theme.colors.textMuted },
  alerte: { fontFamily: theme.fontBodyBold, fontSize: 13, color: theme.colors.warning },
  boutonOffert: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minHeight: 36,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: theme.colors.accent,
  },
  boutonOffertTexte: { fontFamily: theme.fontBodyBold, fontSize: 13, color: theme.colors.accent },
  lienDiscret: { fontFamily: theme.fontBody, fontSize: 13, color: theme.colors.textMuted, textDecorationLine: 'underline' },
  offerts: { gap: theme.spacing.sm },
  offertsEntete: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44 },
  section: { fontFamily: theme.fontTitle, fontSize: 18, color: theme.colors.textMuted },
  erreur: { fontFamily: theme.fontBody, fontSize: 14, color: theme.colors.warning },
}));
