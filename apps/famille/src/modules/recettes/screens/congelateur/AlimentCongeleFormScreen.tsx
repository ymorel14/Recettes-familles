import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, ActivityIndicator } from 'react-native';
import { alerte } from '../../utils/alerte';
import { theme, creerStylesThemes } from '../../theme/theme';
import { useAuth } from '../../contexts/AuthContext';
import {
  TYPES_ALIMENTS,
  typeAliment,
  devinerType,
  listerCongelateurs,
  obtenirAliment,
  creerAliment,
  mettreAJourAliment,
  retirerAliment,
  aujourdhui,
  ajouterMois,
  versIso,
  versDate,
  formaterDate,
  lireDateSaisie,
  etatConservation,
} from '../../services/congelateur';
import ZoneClavier from '../../components/ZoneClavier';
import type { Congelateur } from '../../types/models';

// Raccourcis de date : pour un aliment qu'on vient de congeler (aujourd'hui)
// ou pour l'inventaire d'un congélateur déjà plein, où l'on ne connaît
// souvent la date qu'approximativement.
const RACCOURCIS_DATE: { libelle: string; mois: number }[] = [
  { libelle: "Aujourd'hui", mois: 0 },
  { libelle: 'Il y a 1 mois', mois: 1 },
  { libelle: '3 mois', mois: 3 },
  { libelle: '6 mois', mois: 6 },
  { libelle: '1 an', mois: 12 },
  { libelle: '2 ans', mois: 24 },
];

// Ajout / modification d'un aliment du congélateur : nom, type (deviné
// d'après le nom tant qu'on ne l'a pas choisi soi-même), congélateur (s'il y
// en a plusieurs) et date de mise au congélateur.
export default function AlimentCongeleFormScreen({ route, navigation }: any) {
  const alimentId: string | undefined = route.params?.alimentId;
  const congelateurInitial: string | undefined = route.params?.congelateurId;
  const { foyer, session } = useAuth();

  const [congelateurs, setCongelateurs] = useState<Congelateur[]>([]);
  const [nom, setNom] = useState('');
  const [type, setType] = useState('autre');
  const [typeChoisiALaMain, setTypeChoisiALaMain] = useState(false);
  const [congelateurId, setCongelateurId] = useState<string | undefined>(congelateurInitial);
  const [dateIso, setDateIso] = useState(versIso(aujourdhui()));
  const [saisieDate, setSaisieDate] = useState(formaterDate(versIso(aujourdhui())));
  const [chargement, setChargement] = useState(true);
  const [enregistrement, setEnregistrement] = useState(false);
  const [dernierAjout, setDernierAjout] = useState<string | null>(null);
  const champNom = useRef<TextInput>(null);

  useEffect(() => {
    navigation.setOptions?.({ title: alimentId ? "Modifier l'aliment" : 'Ajouter au congélateur' });
  }, [navigation, alimentId]);

  useEffect(() => {
    if (!foyer) return;
    (async () => {
      try {
        const liste = await listerCongelateurs(foyer.id);
        setCongelateurs(liste);
        if (alimentId) {
          const aliment = await obtenirAliment(alimentId);
          setNom(aliment.nom);
          setType(aliment.type);
          setTypeChoisiALaMain(true);
          setCongelateurId(aliment.congelateur_id);
          setDateIso(aliment.date_stockage);
          setSaisieDate(formaterDate(aliment.date_stockage));
        } else if (!congelateurInitial || !liste.some((c) => c.id === congelateurInitial)) {
          setCongelateurId(liste[0]?.id);
        }
      } catch (e) {
        alerte('Chargement impossible', e instanceof Error ? e.message : 'Veuillez réessayer.');
      } finally {
        setChargement(false);
      }
    })();
  }, [foyer, alimentId, congelateurInitial]);

  const changerNom = (texte: string) => {
    setNom(texte);
    if (!typeChoisiALaMain) setType(devinerType(texte) ?? 'autre');
  };

  const choisirType = (cle: string) => {
    setType(cle);
    setTypeChoisiALaMain(true);
  };

  const choisirDate = (iso: string) => {
    setDateIso(iso);
    setSaisieDate(formaterDate(iso));
  };

  const changerSaisieDate = (texte: string) => {
    setSaisieDate(texte);
    const lue = lireDateSaisie(texte);
    if (lue) setDateIso(lue);
  };

  const dateSaisieValide = lireDateSaisie(saisieDate) !== null;
  const dateFuture = versDate(dateIso) > aujourdhui();

  const conseil = useMemo(() => {
    const t = typeAliment(type);
    const limite = ajouterMois(versDate(dateIso), t.mois);
    const etat = etatConservation({ type, date_stockage: dateIso });
    return { mois: t.mois, limite: formaterDate(versIso(limite)), etat };
  }, [type, dateIso]);

  const enregistrer = async (enchainer: boolean) => {
    if (!nom.trim()) {
      alerte('Aliment manquant', "Indiquez ce que vous mettez au congélateur.");
      return;
    }
    if (!dateSaisieValide || dateFuture) {
      alerte('Date invalide', 'Saisissez une date passée, par ex. 12/03/2024 ou 03/2024.');
      return;
    }
    if (!foyer || !session || !congelateurId) return;
    setEnregistrement(true);
    try {
      const form = { nom, type, congelateurId, dateStockage: dateIso };
      if (alimentId) {
        await mettreAJourAliment(alimentId, form);
      } else {
        await creerAliment(foyer.id, session.user.id, form);
      }
      if (enchainer) {
        // Inventaire à la chaîne : on garde congélateur et date, on vide le nom.
        setDernierAjout(nom.trim());
        setNom('');
        setType('autre');
        setTypeChoisiALaMain(false);
        champNom.current?.focus();
      } else {
        navigation.goBack();
      }
    } catch (e) {
      alerte("Échec de l'enregistrement", e instanceof Error ? e.message : 'Veuillez réessayer.');
    } finally {
      setEnregistrement(false);
    }
  };

  const demanderRetrait = () => {
    if (!alimentId) return;
    alerte('Retirer du congélateur ?', `"${nom}" sera retiré de la liste (consommé ou jeté).`, [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Retirer',
        style: 'destructive',
        onPress: async () => {
          try {
            await retirerAliment(alimentId);
            navigation.goBack();
          } catch (e) {
            alerte('Échec du retrait', e instanceof Error ? e.message : 'Veuillez réessayer.');
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

  const couleurConseil =
    conseil.etat === 'depasse' ? theme.colors.warning : conseil.etat === 'bientot' ? theme.colors.accent : theme.colors.textMuted;

  return (
    <ZoneClavier>
      <ScrollView style={styles.container} contentContainerStyle={styles.contenuScroll} keyboardShouldPersistTaps="handled">
        {dernierAjout && <Text style={styles.confirmation}>✓ « {dernierAjout} » ajouté. Aliment suivant :</Text>}

        <Text style={styles.label}>Aliment</Text>
        <TextInput
          ref={champNom}
          style={styles.champ}
          placeholder="Ex. Steak haché, Soupe de potiron..."
          placeholderTextColor={theme.colors.textMuted}
          value={nom}
          onChangeText={changerNom}
          autoFocus={!alimentId}
          autoCapitalize="sentences"
        />

        <Text style={styles.label}>Type</Text>
        <View style={styles.puces}>
          {TYPES_ALIMENTS.map((t) => {
            const actif = type === t.cle;
            return (
              <Pressable key={t.cle} style={[styles.puce, actif && styles.puceActive]} onPress={() => choisirType(t.cle)}>
                <Text style={[styles.puceTexte, actif && styles.puceTexteActif]}>{t.libelle}</Text>
              </Pressable>
            );
          })}
        </View>

        {congelateurs.length > 1 && (
          <>
            <Text style={styles.label}>Congélateur</Text>
            <View style={styles.puces}>
              {congelateurs.map((c) => {
                const actif = congelateurId === c.id;
                return (
                  <Pressable key={c.id} style={[styles.puce, actif && styles.puceActive]} onPress={() => setCongelateurId(c.id)}>
                    <Text style={[styles.puceTexte, actif && styles.puceTexteActif]}>{c.nom}</Text>
                  </Pressable>
                );
              })}
            </View>
          </>
        )}

        <Text style={styles.label}>Mis au congélateur le</Text>
        <View style={styles.puces}>
          {RACCOURCIS_DATE.map((r) => {
            const iso = versIso(ajouterMois(aujourdhui(), -r.mois));
            const actif = iso === dateIso;
            return (
              <Pressable key={r.libelle} style={[styles.puce, actif && styles.puceActive]} onPress={() => choisirDate(iso)}>
                <Text style={[styles.puceTexte, actif && styles.puceTexteActif]}>{r.libelle}</Text>
              </Pressable>
            );
          })}
        </View>
        <TextInput
          style={[styles.champ, (!dateSaisieValide || dateFuture) && styles.champErreur]}
          placeholder="JJ/MM/AAAA ou MM/AAAA"
          placeholderTextColor={theme.colors.textMuted}
          value={saisieDate}
          onChangeText={changerSaisieDate}
          keyboardType="numbers-and-punctuation"
        />
        {!dateSaisieValide ? (
          <Text style={[styles.conseil, { color: theme.colors.warning }]}>
            Date non reconnue. Exemples : 12/03/2024, ou 03/2024 si vous ne connaissez que le mois.
          </Text>
        ) : dateFuture ? (
          <Text style={[styles.conseil, { color: theme.colors.warning }]}>Cette date est dans le futur.</Text>
        ) : (
          <Text style={[styles.conseil, { color: couleurConseil }]}>
            Conservation conseillée : {conseil.mois} mois, soit jusqu'au {conseil.limite}
            {conseil.etat === 'depasse' ? ' — déjà dépassée : plus consommable.' : '.'}
          </Text>
        )}

        <Pressable style={styles.boutonEnregistrer} onPress={() => enregistrer(false)} disabled={enregistrement}>
          {enregistrement ? (
            <ActivityIndicator color={theme.colors.background} />
          ) : (
            <Text style={styles.boutonEnregistrerTexte}>Enregistrer</Text>
          )}
        </Pressable>

        {alimentId ? (
          <Pressable style={styles.boutonSecondaire} onPress={demanderRetrait}>
            <Text style={[styles.boutonSecondaireTexte, { color: theme.colors.warning }]}>Retirer du congélateur</Text>
          </Pressable>
        ) : (
          <Pressable style={styles.boutonSecondaire} onPress={() => enregistrer(true)} disabled={enregistrement}>
            <Text style={styles.boutonSecondaireTexte}>Enregistrer et en ajouter un autre</Text>
          </Pressable>
        )}
      </ScrollView>
    </ZoneClavier>
  );
}

const styles = creerStylesThemes(() => ({
  container: { flex: 1, backgroundColor: theme.colors.background },
  centre: { flex: 1, backgroundColor: theme.colors.background, alignItems: 'center', justifyContent: 'center' },
  contenuScroll: { padding: theme.spacing.md, gap: theme.spacing.xs },
  confirmation: { fontFamily: theme.fontBodyBold, color: theme.colors.success, fontSize: 14 },
  label: { fontFamily: theme.fontBodyBold, color: theme.colors.textMuted, fontSize: 13, marginTop: theme.spacing.sm },
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
  champErreur: { borderColor: theme.colors.warning },
  puces: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.xs },
  puce: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radii.lg,
    paddingVertical: 6,
    paddingHorizontal: theme.spacing.sm,
  },
  puceActive: { backgroundColor: theme.colors.selection, borderColor: theme.colors.accent },
  puceTexte: { fontFamily: theme.fontBody, color: theme.colors.textMuted, fontSize: 13 },
  puceTexteActif: { color: theme.colors.accent, fontFamily: theme.fontBodyBold },
  conseil: { fontFamily: theme.fontBody, fontSize: 14, marginTop: theme.spacing.xs },
  boutonEnregistrer: {
    backgroundColor: theme.colors.accent,
    borderRadius: theme.radii.md,
    paddingVertical: theme.spacing.sm,
    alignItems: 'center',
    marginTop: theme.spacing.lg,
  },
  boutonEnregistrerTexte: { fontFamily: theme.fontBodyBold, color: theme.colors.background, fontSize: 16 },
  boutonSecondaire: {
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radii.md,
    paddingVertical: theme.spacing.sm,
    alignItems: 'center',
    marginTop: theme.spacing.sm,
    marginBottom: theme.spacing.xl,
  },
  boutonSecondaireTexte: { fontFamily: theme.fontBodyBold, color: theme.colors.accent, fontSize: 15 },
}));
