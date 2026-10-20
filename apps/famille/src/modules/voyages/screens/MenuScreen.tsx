import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { theme, creerStylesThemes } from '../theme/theme';
import { lienVoyage, partagerSurWhatsApp, texteAvecLien } from '../services/partage';
import { useAuth } from '../contexts/AuthContext';
import { formaterDate, listerPersonnesParIds, type Personne } from '../services/personnes';
import { ETAPES_REPAS, libelleMoment, listerRepas, type Repas } from '../services/repas';
import { estOrganisateur, messageErreurVoyage, obtenirVoyage, type VoyageAvecParticipants } from '../services/voyage';
import { Aide } from '../components/formulaire';
import { Bouton, Chargement, MessageVide } from '../components/ui';
import { GroupeNoms } from '@apps-famille/famille';

// Menu d'un repas de famille : les repas (réveillon, déjeuner…), avec pour
// chacun ce qui est prévu et qui s'en occupe.
export default function MenuScreen({ route, navigation }: any) {
  const voyageId: string = route.params?.voyageId;
  const { session } = useAuth();
  const moiId = session?.user.id ?? '';
  const [donnees, setDonnees] = useState<{
    voyage: VoyageAvecParticipants;
    repas: Repas[];
    personnes: Map<string, Personne>;
  } | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  const charger = useCallback(async () => {
    try {
      const [voyage, repas] = await Promise.all([obtenirVoyage(voyageId), listerRepas(voyageId)]);
      const liste = await listerPersonnesParIds(voyage.participants.map((p) => p.personne_id));
      setDonnees({ voyage, repas, personnes: new Map(liste.map((p) => [p.id, p])) });
    } catch (e) {
      setErreur(messageErreurVoyage(e));
    }
  }, [voyageId]);

  useFocusEffect(
    useCallback(() => {
      charger();
    }, [charger])
  );

  if (erreur) return <MessageVide titre="Menu indisponible" texte={erreur} />;
  if (!donnees) return <Chargement />;
  const { voyage, repas, personnes } = donnees;
  const maPersonne = [...personnes.values()].find((p) => p.utilisateur_id === moiId) ?? null;
  const organisateur = estOrganisateur(voyage, moiId, maPersonne?.id ?? null);
  const nom = (id: string) => personnes.get(id)?.prenom ?? '?';

  // Ce dont je m'occupe, tous repas confondus.
  const mesTaches = maPersonne
    ? repas.flatMap((r) => [
        ...r.responsables
          .filter((x) => x.personne_id === maPersonne.id)
          .map((x) => `${ETAPES_REPAS.find((e) => e.id === x.etape)?.libelle} — ${r.titre}`),
        ...r.plats
          .filter((p) => p.responsables.some((x) => x.personne_id === maPersonne.id))
          .map((p) => `${p.titre} — ${r.titre}`),
      ])
    : [];

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.contenu}>
      {mesTaches.length > 0 && (
        <View style={[styles.carte, styles.mesTaches]}>
          <Text style={styles.carteTitre}>Vous vous occupez de</Text>
          {mesTaches.map((t) => (
            <Text key={t} style={styles.detail}>
              • {t}
            </Text>
          ))}
        </View>
      )}

      {repas.length === 0 && (
        <MessageVide
          titre="Aucun repas défini"
          texte={
            organisateur
              ? 'Ajoutez les repas principaux : réveillon, déjeuner, brunch du lendemain…'
              : 'Les organisateurs n’ont pas encore défini les repas.'
          }
        />
      )}

      {repas.map((r) => {
        const etapesRemplies = ETAPES_REPAS.filter(
          (e) => r.plats.some((p) => p.etape === e.id) || r.responsables.some((x) => x.etape === e.id)
        );
        return (
          <Pressable
            key={r.id}
            style={styles.carte}
            onPress={() => navigation.navigate('Repas', { voyageId, repasId: r.id })}
            accessibilityRole="button"
            accessibilityLabel={`Ouvrir ${r.titre}`}
          >
            <View style={styles.haut}>
              <Text style={styles.carteTitre}>{r.titre}</Text>
              <Ionicons name="chevron-forward" size={20} color={theme.colors.textMuted} />
            </View>
            <Text style={styles.detail}>
              {libelleMoment(r.moment)}
              {r.jour ? ` · ${formaterDate(r.jour)}` : ' · jour à préciser'}
            </Text>
            {etapesRemplies.length === 0 ? (
              <Text style={styles.vide}>Menu à composer</Text>
            ) : (
              etapesRemplies.map((e) => {
                const plats = r.plats.filter((p) => p.etape === e.id);
                const qui = r.responsables
                  .filter((x) => x.etape === e.id)
                  .map((x) => ({ personneId: x.personne_id, prenom: nom(x.personne_id) }));
                return (
                  <View key={e.id} style={styles.ligne}>
                    <Ionicons name={e.icone as any} size={16} color={theme.colors.accent} />
                    <View style={styles.ligneColonne}>
                      <Text style={styles.ligneTexte}>
                        <Text style={styles.gras}>{e.libelle}</Text>
                        {plats.length ? ` : ${plats.map((p) => p.titre).join(', ')}` : ''}
                      </Text>
                      <GroupeNoms personnes={qui} taille={18} styleTexte={styles.detail} />
                    </View>
                  </View>
                );
              })
            )}
          </Pressable>
        );
      })}

      {repas.length > 0 && (
        <Bouton
          titre="Partager le menu sur WhatsApp"
          variante="contour"
          onPress={() => {
            // Ce qui est prévu (et par qui), puis les étapes que personne n'a prises.
            const lignes = repas.map((r) => {
              const prevus = r.plats.map(
                (p) => `${p.titre}${p.responsables.length ? ` (${p.responsables.map((x) => nom(x.personne_id)).join(', ')})` : ''}`
              );
              const libres = ETAPES_REPAS.filter(
                (e) => !r.responsables.some((x) => x.etape === e.id) && !r.plats.some((p) => p.etape === e.id)
              ).map((e) => e.libelle.toLowerCase());
              return [
                `*${r.titre}*`,
                prevus.length ? `Prévu : ${prevus.join(', ')}` : null,
                libres.length ? `À prendre : ${libres.join(', ')}` : null,
              ]
                .filter(Boolean)
                .join('\n');
            });
            partagerSurWhatsApp(
              texteAvecLien(
                `Menu de « ${voyage.titre} »\n\n${lignes.join('\n\n')}\n\nQui s’occupe de quoi ? Inscrivez-vous ici :`,
                lienVoyage(voyage.id, 'Menu')
              ),
              voyage,
              (id) => personnes.get(id)?.prenom ?? 'quelqu’un'
            );
          }}
        />
      )}
      {organisateur && (
        <Bouton titre="+ Ajouter un repas" variante="pointille" onPress={() => navigation.navigate('RepasForm', { voyageId })} />
      )}
      <Aide>Chaque repas se compose de l’apéritif aux boissons ; chacun peut proposer un plat et dire ce qu’il prend en charge.</Aide>
    </ScrollView>
  );
}

const styles = creerStylesThemes(() => ({
  flex: { flex: 1, backgroundColor: theme.colors.background },
  contenu: { padding: theme.spacing.md, gap: theme.spacing.sm, paddingBottom: theme.spacing.xl },
  carte: {
    gap: 4,
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radii.lg,
    padding: theme.spacing.md,
  },
  mesTaches: { borderColor: theme.colors.accent, borderWidth: 2 },
  haut: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  carteTitre: { fontFamily: theme.fontTitle, fontSize: 20, color: theme.colors.text },
  detail: { fontFamily: theme.fontBody, fontSize: 14, color: theme.colors.textMuted },
  vide: { fontFamily: theme.fontManuscrit, fontSize: 14, color: theme.colors.textMuted },
  ligne: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  ligneTexte: { flex: 1, fontFamily: theme.fontBody, fontSize: 14, color: theme.colors.text },
  ligneColonne: { flex: 1, gap: 2 },
  gras: { fontFamily: theme.fontBodyBold },
}));
