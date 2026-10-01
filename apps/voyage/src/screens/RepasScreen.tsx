import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { theme, creerStylesThemes } from '../theme/theme';
import { useAuth } from '../contexts/AuthContext';
import { formaterDate, listerPersonnesParIds, type Personne } from '../services/personnes';
import {
  confierEtape,
  ETAPES_REPAS,
  libelleMoment,
  listerRepas,
  retirerEtape,
  type EtapeRepas,
  type Repas,
} from '../services/repas';
import {
  estOrganisateur,
  mesPersonnes,
  messageErreurVoyage,
  obtenirVoyage,
  type VoyageAvecParticipants,
} from '../services/voyage';
import { CaseACocher, Erreur } from '../components/formulaire';
import { Bouton, Chargement, MessageVide } from '../components/ui';

// Un repas, étape par étape (apéritif → boissons) : qui s'occupe de l'étape,
// les plats prévus (avec leur recette et qui les prépare), et de quoi
// ajouter un plat ou se porter volontaire.
export default function RepasScreen({ route, navigation }: any) {
  const voyageId: string = route.params?.voyageId;
  const repasId: string = route.params?.repasId;
  const { session, foyer } = useAuth();
  const moiId = session?.user.id ?? '';

  const [donnees, setDonnees] = useState<{
    voyage: VoyageAvecParticipants;
    repas: Repas;
    personnes: Personne[];
  } | null>(null);
  const [erreurChargement, setErreurChargement] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [confierOuvert, setConfierOuvert] = useState<EtapeRepas | null>(null);

  const charger = useCallback(async () => {
    try {
      const [voyage, tous] = await Promise.all([obtenirVoyage(voyageId), listerRepas(voyageId)]);
      const repas = tous.find((r) => r.id === repasId);
      if (!repas) throw new Error('Ce repas n’existe plus.');
      const attendus = voyage.participants.filter((p) => p.reponse !== 'decline').map((p) => p.personne_id);
      const personnes = await listerPersonnesParIds(attendus);
      setDonnees({ voyage, repas, personnes });
      navigation.setOptions({ title: repas.titre });
    } catch (e) {
      setErreurChargement(messageErreurVoyage(e));
    }
  }, [voyageId, repasId, navigation]);

  useFocusEffect(
    useCallback(() => {
      charger();
    }, [charger])
  );

  const miennes = useMemo(
    () => (donnees ? mesPersonnes(donnees.personnes, moiId, foyer?.id ?? null) : []),
    [donnees, moiId, foyer]
  );

  if (erreurChargement) return <MessageVide titre="Repas introuvable" texte={erreurChargement} />;
  if (!donnees) return <Chargement />;
  const { voyage, repas, personnes } = donnees;
  const moi = miennes.find((p) => p.utilisateur_id === moiId) ?? null;
  const organisateur = estOrganisateur(voyage, moiId, moi?.id ?? null);
  const nom = (id: string) => personnes.find((p) => p.id === id)?.prenom ?? '?';

  const agir = async (action: () => Promise<void>) => {
    setErreur(null);
    try {
      await action();
      await charger();
    } catch (e) {
      setErreur(messageErreurVoyage(e));
    }
  };

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.contenu}>
      <View style={styles.entete}>
        <Text style={styles.titre}>{repas.titre}</Text>
        <Text style={styles.detail}>
          {libelleMoment(repas.moment)}
          {repas.jour ? ` · ${formaterDate(repas.jour)}` : ' · jour à préciser'} · {personnes.length} convive
          {personnes.length > 1 ? 's' : ''}
        </Text>
        {repas.notes ? <Text style={styles.notes}>{repas.notes}</Text> : null}
        {organisateur && (
          <Bouton
            titre="Modifier le repas"
            variante="discret"
            onPress={() => navigation.navigate('RepasForm', { voyageId, repas })}
            style={styles.gauche}
          />
        )}
      </View>
      <Erreur texte={erreur} />

      {ETAPES_REPAS.map((etape) => {
        const plats = repas.plats.filter((p) => p.etape === etape.id);
        const responsables = repas.responsables.filter((x) => x.etape === etape.id).map((x) => x.personne_id);
        const jeMenOccupe = moi !== null && responsables.includes(moi.id);
        return (
          <View key={etape.id} style={styles.etape}>
            <View style={styles.etapeHaut}>
              <Ionicons name={etape.icone as any} size={20} color={theme.colors.accent} />
              <Text style={styles.etapeTitre}>{etape.libelle}</Text>
              {moi && (
                <Pressable
                  onPress={() =>
                    agir(() => (jeMenOccupe ? retirerEtape(repas.id, etape.id, moi.id) : confierEtape(repas.id, etape.id, moi.id)))
                  }
                  accessibilityRole="button"
                  accessibilityLabel={jeMenOccupe ? `Ne plus m’occuper de : ${etape.libelle}` : `Je m’occupe de : ${etape.libelle}`}
                  style={[styles.volontaire, jeMenOccupe && styles.volontaireActif]}
                >
                  <Text style={[styles.volontaireTexte, jeMenOccupe && styles.volontaireTexteActif]}>
                    {jeMenOccupe ? '✓ Je m’en occupe' : 'Je m’en occupe'}
                  </Text>
                </Pressable>
              )}
            </View>

            {responsables.length > 0 ? (
              <Text style={styles.responsables}>S’en occupe{responsables.length > 1 ? 'nt' : ''} : {responsables.map(nom).join(', ')}</Text>
            ) : (
              <Text style={styles.personne}>Personne pour l’instant</Text>
            )}
            {organisateur && (
              <Pressable
                onPress={() => setConfierOuvert(confierOuvert === etape.id ? null : etape.id)}
                accessibilityRole="button"
                hitSlop={6}
              >
                <Text style={styles.lien}>{confierOuvert === etape.id ? 'Fermer' : 'Confier à…'}</Text>
              </Pressable>
            )}
            {confierOuvert === etape.id &&
              personnes.map((p) => (
                <CaseACocher
                  key={p.id}
                  coche={responsables.includes(p.id)}
                  onChange={(c) => agir(() => (c ? confierEtape(repas.id, etape.id, p.id) : retirerEtape(repas.id, etape.id, p.id)))}
                  libelle={p.prenom}
                  aide={p.foyer_nom ?? undefined}
                />
              ))}

            {plats.map((p) => {
              const modifiable = p.propose_par === moiId || organisateur;
              const contenu = (
                <>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={styles.platTitre}>
                      {p.titre}
                      {p.quantite ? <Text style={styles.detail}> · {p.quantite}</Text> : null}
                    </Text>
                    {p.recette && (
                      <View style={styles.recette}>
                        <Ionicons name="book-outline" size={14} color={theme.colors.accent} />
                        <Text style={styles.recetteTexte}>Recette : {p.recette.titre}</Text>
                      </View>
                    )}
                    {p.responsables.length > 0 && (
                      <Text style={styles.detail}>Par {p.responsables.map((x) => nom(x.personne_id)).join(', ')}</Text>
                    )}
                    {p.notes ? <Text style={styles.detail}>{p.notes}</Text> : null}
                  </View>
                  {modifiable && <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />}
                </>
              );
              return modifiable ? (
                <Pressable
                  key={p.id}
                  style={styles.plat}
                  onPress={() => navigation.navigate('Plat', { voyageId, repasId: repas.id, plat: p })}
                  accessibilityRole="button"
                  accessibilityLabel={`Modifier ${p.titre}`}
                >
                  {contenu}
                </Pressable>
              ) : (
                <View key={p.id} style={styles.plat}>
                  {contenu}
                </View>
              );
            })}
            <Pressable
              onPress={() => navigation.navigate('Plat', { voyageId, repasId: repas.id, etape: etape.id })}
              accessibilityRole="button"
              accessibilityLabel={`Ajouter : ${etape.libelle}`}
              style={styles.ajouter}
            >
              <Ionicons name="add-circle-outline" size={18} color={theme.colors.accent} />
              <Text style={styles.lien}>Ajouter {etape.id === 'boissons' ? 'une boisson' : 'un plat'}</Text>
            </Pressable>
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = creerStylesThemes(() => ({
  flex: { flex: 1, backgroundColor: theme.colors.background },
  contenu: { padding: theme.spacing.md, gap: theme.spacing.sm, paddingBottom: theme.spacing.xl },
  entete: { gap: 4, marginBottom: theme.spacing.xs },
  titre: { fontFamily: theme.fontTitle, fontSize: 26, color: theme.colors.text },
  detail: { fontFamily: theme.fontBody, fontSize: 14, color: theme.colors.textMuted },
  notes: { fontFamily: theme.fontManuscrit, fontSize: 15, color: theme.colors.text },
  gauche: { alignSelf: 'flex-start' },
  etape: {
    gap: 6,
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radii.lg,
    padding: theme.spacing.md,
  },
  etapeHaut: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
  etapeTitre: { flex: 1, fontFamily: theme.fontTitle, fontSize: 18, color: theme.colors.text },
  volontaire: {
    minHeight: 36,
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.colors.accent,
  },
  volontaireActif: { backgroundColor: theme.colors.accent },
  volontaireTexte: { fontFamily: theme.fontBodyBold, fontSize: 13, color: theme.colors.accent },
  volontaireTexteActif: { color: theme.colors.background },
  responsables: { fontFamily: theme.fontBodyBold, fontSize: 14, color: theme.colors.success },
  personne: { fontFamily: theme.fontManuscrit, fontSize: 14, color: theme.colors.textMuted },
  lien: { fontFamily: theme.fontBodyBold, fontSize: 14, color: theme.colors.accent },
  plat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.sm,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  platTitre: { fontFamily: theme.fontBodyBold, fontSize: 15, color: theme.colors.text },
  recette: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  recetteTexte: { fontFamily: theme.fontBody, fontSize: 13, color: theme.colors.accent },
  ajouter: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 36, alignSelf: 'flex-start' },
}));
