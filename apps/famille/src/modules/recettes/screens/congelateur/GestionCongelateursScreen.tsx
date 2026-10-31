import React, { useCallback, useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, ActivityIndicator } from 'react-native';
import { Icone, IconeGlyphe, PastilleModifier } from '../../../../composants/ui';
import { useFocusEffect } from '@react-navigation/native';
import { alerte } from '../../utils/alerte';
import { theme, creerStylesThemes } from '../../theme/theme';
import { useAuth } from '../../contexts/AuthContext';
import {
  listerCongelateurs,
  listerAliments,
  creerCongelateur,
  renommerCongelateur,
  supprimerCongelateur,
  GENRES_LIEU,
  genreLieu,
} from '../../services/congelateur';
import ZoneClavier from '../../components/ZoneClavier';
import type { Congelateur, GenreLieu } from '../../types/models';

// Emplacements du garde-manger (retour de test C-1) : congélateurs, frigo,
// placards, cave… En ajouter, les renommer, changer leur genre, les
// supprimer (avec leur contenu).
export default function GestionCongelateursScreen() {
  const { foyer, session } = useAuth();
  const [congelateurs, setCongelateurs] = useState<Congelateur[]>([]);
  const [nombreParCongelateur, setNombreParCongelateur] = useState<Map<string, number>>(new Map());
  const [chargement, setChargement] = useState(true);
  const [enEdition, setEnEdition] = useState<string | null>(null);
  const [nomEdite, setNomEdite] = useState('');
  const [nouveauNom, setNouveauNom] = useState('');
  const [nouveauGenre, setNouveauGenre] = useState<GenreLieu>('placard');
  const [ajout, setAjout] = useState(false);

  const charger = useCallback(async () => {
    if (!foyer) return;
    try {
      const [c, a] = await Promise.all([listerCongelateurs(foyer.id), listerAliments(foyer.id)]);
      const compte = new Map<string, number>();
      a.forEach((x) => compte.set(x.congelateur_id, (compte.get(x.congelateur_id) ?? 0) + 1));
      setCongelateurs(c);
      setNombreParCongelateur(compte);
    } finally {
      setChargement(false);
    }
  }, [foyer]);

  useFocusEffect(
    useCallback(() => {
      charger();
    }, [charger])
  );

  const ajouter = async () => {
    if (!foyer || !session || !nouveauNom.trim()) return;
    setAjout(true);
    try {
      await creerCongelateur(foyer.id, session.user.id, nouveauNom, nouveauGenre);
      setNouveauNom('');
      await charger();
    } catch (e) {
      alerte("Échec de l'ajout", e instanceof Error ? e.message : 'Veuillez réessayer.');
    } finally {
      setAjout(false);
    }
  };

  const validerRenommage = async () => {
    if (!enEdition) return;
    const id = enEdition;
    setEnEdition(null);
    if (!nomEdite.trim()) return;
    try {
      await renommerCongelateur(id, nomEdite);
      await charger();
    } catch (e) {
      alerte('Échec du renommage', e instanceof Error ? e.message : 'Veuillez réessayer.');
    }
  };

  const changerGenre = async (id: string, genre: GenreLieu) => {
    try {
      await renommerCongelateur(id, nomEdite || (congelateurs.find((c) => c.id === id)?.nom ?? ''), genre);
      await charger();
    } catch (e) {
      alerte('Échec de la modification', e instanceof Error ? e.message : 'Veuillez réessayer.');
    }
  };

  const demanderSuppression = (c: Congelateur) => {
    const n = nombreParCongelateur.get(c.id) ?? 0;
    const detail =
      n === 0
        ? `"${c.nom}" est vide et sera supprimé.`
        : `"${c.nom}" et la liste de son contenu (${n} aliment${n > 1 ? 's' : ''}) seront définitivement supprimés.`;
    alerte('Supprimer cet emplacement ?', detail, [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: async () => {
          try {
            await supprimerCongelateur(c.id);
            await charger();
          } catch (e) {
            alerte('Échec de la suppression', e instanceof Error ? e.message : 'Veuillez réessayer.');
          }
        },
      },
    ]);
  };

  if (chargement) {
    return (
      <View style={styles.centre}>
        <ActivityIndicator color={theme.colors.accent} />
      </View>
    );
  }

  return (
    <ZoneClavier>
      <ScrollView style={styles.container} contentContainerStyle={styles.contenuScroll} keyboardShouldPersistTaps="handled">
        {congelateurs.map((c) => {
          const n = nombreParCongelateur.get(c.id) ?? 0;
          return (
            <View key={c.id} style={styles.carte}>
              <Icone nom={genreLieu(c.genre).icone} taille={22} couleur={theme.colors.accent} />
              {enEdition === c.id ? (
                <View style={{ flex: 1, gap: theme.spacing.sm }}>
                <TextInput
                  style={[styles.champ, styles.champLigne]}
                  value={nomEdite}
                  onChangeText={setNomEdite}
                  autoFocus
                  onSubmitEditing={validerRenommage}
                  onBlur={validerRenommage}
                />
                <ChoixGenre valeur={c.genre ?? 'congelateur'} onChoisir={(g) => changerGenre(c.id, g)} />
                </View>
              ) : (
                <View style={styles.carteTextes}>
                  <Text style={styles.carteNom}>{c.nom}</Text>
                  <Text style={styles.carteDetail}>
                    {genreLieu(c.genre).libelle} · {n === 0 ? 'Vide' : `${n} aliment${n > 1 ? 's' : ''}`}
                  </Text>
                </View>
              )}
              <View style={styles.carteActions}>
                {enEdition !== c.id && (
                  <Pressable
                    hitSlop={8}
                    onPress={() => {
                      setEnEdition(c.id);
                      setNomEdite(c.nom);
                    }}
                  >
                    <PastilleModifier couleur={theme.colors.accent} petite />
                  </Pressable>
                )}
                <Pressable hitSlop={8} onPress={() => demanderSuppression(c)}>
                  <IconeGlyphe nom="close" style={[styles.carteActionTexte, { color: theme.colors.warning }]} />
                </Pressable>
              </View>
            </View>
          );
        })}

        <Text style={styles.label}>Ajouter un emplacement</Text>
        <ChoixGenre valeur={nouveauGenre} onChoisir={setNouveauGenre} />
        <View style={styles.ligneAjout}>
          <TextInput
            style={[styles.champ, styles.champLigne]}
            placeholder={`Ex. ${EXEMPLES[nouveauGenre]}`}
            placeholderTextColor={theme.colors.textMuted}
            value={nouveauNom}
            onChangeText={setNouveauNom}
            onSubmitEditing={ajouter}
          />
          <Pressable style={styles.boutonAjout} onPress={ajouter} disabled={ajout || !nouveauNom.trim()}>
            {ajout ? (
              <ActivityIndicator color={theme.colors.background} />
            ) : (
              <Text style={styles.boutonAjoutTexte}>Ajouter</Text>
            )}
          </Pressable>
        </View>
      </ScrollView>
    </ZoneClavier>
  );
}

const EXEMPLES: Record<GenreLieu, string> = {
  congelateur: 'Congélateur du garage',
  frigo: 'Frigo de la cuisine',
  placard: 'Placard à épices',
  cave: 'Cave',
  autre: 'Cellier',
};

function ChoixGenre({ valeur, onChoisir }: { valeur: GenreLieu; onChoisir: (g: GenreLieu) => void }) {
  return (
    <View style={styles.genres}>
      {GENRES_LIEU.map((g) => {
        const actif = g.cle === valeur;
        return (
          <Pressable
            key={g.cle}
            onPress={() => onChoisir(g.cle)}
            style={[styles.genre, actif && styles.genreActif]}
            accessibilityRole="button"
            accessibilityState={{ selected: actif }}
          >
            <Icone nom={g.icone} taille={16} couleur={actif ? theme.colors.background : theme.colors.text} />
            <Text style={[styles.genreTexte, actif && styles.genreTexteActif]}>{g.libelle}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = creerStylesThemes(() => ({
  genres: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.xs },
  genre: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: theme.colors.surface,
  },
  genreActif: { backgroundColor: theme.colors.accent, borderColor: theme.colors.accent },
  genreTexte: { fontFamily: theme.fontBodyBold, fontSize: 13, color: theme.colors.text },
  genreTexteActif: { color: theme.colors.background },
  container: { flex: 1, backgroundColor: theme.colors.background },
  centre: { flex: 1, backgroundColor: theme.colors.background, alignItems: 'center', justifyContent: 'center' },
  contenuScroll: { padding: theme.spacing.md, gap: theme.spacing.sm },
  carte: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radii.md,
    padding: theme.spacing.md,
  },
  carteTextes: { flex: 1, gap: 2 },
  carteNom: { fontFamily: theme.fontBodyBold, color: theme.colors.text, fontSize: 17 },
  carteDetail: { fontFamily: theme.fontBody, color: theme.colors.textMuted, fontSize: 13 },
  carteActions: { flexDirection: 'row', gap: theme.spacing.md },
  carteActionTexte: { color: theme.colors.textMuted, fontSize: 18, paddingHorizontal: 2 },
  label: { fontFamily: theme.fontBodyBold, color: theme.colors.textMuted, fontSize: 13, marginTop: theme.spacing.md },
  ligneAjout: { flexDirection: 'row', gap: theme.spacing.sm, alignItems: 'center' },
  champ: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radii.md,
    padding: theme.spacing.sm,
    color: theme.colors.text,
    fontFamily: theme.fontBody,
    fontSize: 16,
  },
  champLigne: { flex: 1 },
  boutonAjout: {
    backgroundColor: theme.colors.accent,
    borderRadius: theme.radii.md,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    alignItems: 'center',
  },
  boutonAjoutTexte: { fontFamily: theme.fontBodyBold, color: theme.colors.background, fontSize: 15 },
}));
