import React, { useCallback, useState } from 'react';
import { Pressable, ScrollView, Share, Text, TextInput, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { theme, creerStylesThemes } from '../theme/theme';
import { Carte, TitreSection } from '../components/elements';
import { Bouton, Chargement } from '../components/ui';
import { alerte } from '../utils/alerte';
import { extraireMessageErreur } from '@apps-famille/famille';
import { adresseEnfant } from '../services/quotidien';
import {
  creerAccesEnfant,
  definirTirelire,
  eurosEnCentimes,
  formaterCentimes,
  lienAccesEnfant,
  listerTirelires,
  retirerAccesEnfant,
  tachesDeEnfant,
  type Tache,
  type Tirelire,
} from '../services/maison';
import { libelleJours } from '../utils/semaine';

// « Tâches de [prénom] » (refonte Quotidien § 4.4) : montant d'argent de poche
// par semaine, toutes les tâches de l'enfant (obligatoires, coups de main, en
// pause) et son espace (lien). La création passe par le bouton « + ».
export default function TachesEnfantScreen({ route, navigation }: any) {
  const { personneId, prenom } = route.params as { personneId: string; prenom: string };
  const [taches, setTaches] = useState<Tache[] | null>(null);
  const [tirelire, setTirelire] = useState<Tirelire | null>(null);
  const [lien, setLien] = useState<string | null>(null);
  const [edition, setEdition] = useState(false);
  const [montant, setMontant] = useState('');
  const [enCours, setEnCours] = useState<string | null>(null);

  const charger = useCallback(async () => {
    navigation.setOptions({ title: `Tâches de ${prenom}` });
    try {
      const [ts, tirelires, jeton] = await Promise.all([tachesDeEnfant(personneId), listerTirelires(), lienAccesEnfant(personneId)]);
      setTaches(ts);
      setTirelire(tirelires.find((t) => t.personne_id === personneId) ?? null);
      setLien(jeton);
    } catch (e) {
      alerte('Chargement impossible', extraireMessageErreur(e, 'Veuillez réessayer.'));
      setTaches([]);
    }
  }, [personneId, prenom, navigation]);

  useFocusEffect(
    useCallback(() => {
      charger();
    }, [charger])
  );

  const agir = async (cle: string, action: () => Promise<void>) => {
    setEnCours(cle);
    try {
      await action();
      await charger();
    } catch (e) {
      alerte('Action impossible', extraireMessageErreur(e, 'Veuillez réessayer.'));
    } finally {
      setEnCours(null);
    }
  };

  if (!taches) return <Chargement />;

  const commencerEdition = () => {
    const c = tirelire?.hebdomadaire ?? 0;
    setMontant(c > 0 ? String(c / 100).replace('.', ',') : '');
    setEdition(true);
  };

  const enregistrerMontant = () => {
    const vide = montant.trim() === '';
    const c = vide ? 0 : eurosEnCentimes(montant);
    if (c === null) return alerte('Montant', 'Indiquez un montant en euros, par exemple 5 ou 2,50.');
    if (c > 10000) return alerte('Montant', 'Le montant par semaine ne peut pas dépasser 100 €.');
    agir('montant', async () => {
      await definirTirelire(personneId, {
        hebdomadaire: c,
        jour: tirelire?.jour_versement ?? 7,
        objectif: tirelire?.objectif_libelle ?? null,
        objectifPoints: tirelire?.objectif_points ?? null,
      });
      setEdition(false);
    });
  };

  const envoyerLien = (jeton: string) =>
    Share.share({
      message: `${prenom}, voici ton espace Quotidien : tes tâches du jour et ta tirelire. Garde ce lien pour toi : ${adresseEnfant(jeton)}`,
    });

  const nouveauLien = () =>
    agir('lien', async () => {
      const jeton = await creerAccesEnfant(personneId);
      await envoyerLien(jeton);
    });

  const retirerLien = () =>
    alerte(`Retirer l’accès de ${prenom} ?`, 'Son lien ne fonctionnera plus. Vous pourrez en créer un autre.', [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Retirer', style: 'destructive', onPress: () => agir('lien', () => retirerAccesEnfant(personneId)) },
    ]);

  const obligatoires = taches.filter((t) => t.active && t.type === 'obligatoire');
  const aides = taches.filter((t) => t.active && t.type === 'coup_de_main');
  const enPause = taches.filter((t) => !t.active);
  const totalAides = aides.reduce((n, t) => n + (t.fois_par_semaine ?? 0), 0);
  const ouvrir = (t: Tache) => navigation.navigate('TacheEnfantForm', { tache: t });

  const ligne = (t: Tache, grise = false) => (
    <Pressable
      key={t.id}
      onPress={() => ouvrir(t)}
      accessibilityRole="button"
      accessibilityLabel={`${t.libelle}, modifier`}
      style={[styles.ligneTache, grise && { opacity: 0.55 }]}
    >
      <View style={{ flex: 1 }}>
        <Text style={styles.nom}>{t.libelle}</Text>
        <Text style={styles.detail}>
          {t.type === 'obligatoire'
            ? libelleJours(t.jours)
            : `${t.fois_par_semaine} fois par semaine${t.max_un_par_jour ? ' · pas plus d’une fois par jour' : ''}`}
          {t.validation_parent ? ' · un parent valide' : ''}
          {t.attribution === 'tour' ? ' · à tour de rôle (ancien)' : ''}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />
    </Pressable>
  );

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.contenu} keyboardShouldPersistTaps="handled">
      <Carte accent>
        <Text style={styles.sousTitre}>Argent de poche</Text>
        {edition ? (
          <>
            <View style={styles.ligne}>
              <TextInput
                style={[styles.champ, { flex: 1 }]}
                value={montant}
                onChangeText={setMontant}
                keyboardType="decimal-pad"
                placeholder="ex. 5"
                placeholderTextColor={theme.colors.textMuted}
                accessibilityLabel={`Euros par semaine pour ${prenom}`}
                autoFocus
              />
              <Text style={styles.detail}>€ par semaine</Text>
            </View>
            <View style={styles.ligne}>
              <View style={{ flex: 1 }}>
                <Bouton titre="Annuler" variante="contour" onPress={() => setEdition(false)} />
              </View>
              <View style={{ flex: 1 }}>
                <Bouton titre="Enregistrer" onPress={enregistrerMontant} enCours={enCours === 'montant'} />
              </View>
            </View>
          </>
        ) : (
          <>
            <Text style={styles.montant}>
              {tirelire && tirelire.hebdomadaire > 0 ? `${formaterCentimes(tirelire.hebdomadaire)} par semaine` : 'Pas de montant réglé'}
            </Text>
            <Text style={styles.detail}>Versé le dimanche soir si la semaine est complète, après votre validation du bilan.</Text>
            <Bouton titre="Modifier" variante="discret" onPress={commencerEdition} />
          </>
        )}
      </Carte>

      <TitreSection titre={`Obligatoires (${obligatoires.length})`} />
      <Carte>
        {obligatoires.length === 0 ? <Text style={styles.detail}>Aucune obligatoire.</Text> : obligatoires.map((t) => ligne(t))}
      </Carte>

      <TitreSection titre="Coups de main" detail={`${totalAides} par semaine`} />
      <Carte>{aides.length === 0 ? <Text style={styles.detail}>Aucun coup de main.</Text> : aides.map((t) => ligne(t))}</Carte>

      {enPause.length > 0 ? (
        <>
          <TitreSection titre="En pause" />
          <Carte>{enPause.map((t) => ligne(t, true))}</Carte>
        </>
      ) : null}

      <Text style={styles.detail}>Pour ajouter une tâche, utilisez le bouton + en bas.</Text>

      <TitreSection titre={`Espace de ${prenom}`} />
      <Carte>
        <Text style={styles.detail}>
          Un lien personnel, sans compte ni email : {prenom} y voit ses tâches du jour, appuie sur « J’ai fini » (vous validez
          ensuite) et suit sa tirelire. Rien d’autre de la famille n’y apparaît.
        </Text>
        {lien ? (
          <>
            <Bouton titre="Envoyer son lien" onPress={() => envoyerLien(lien)} />
            <View style={styles.ligne}>
              <View style={{ flex: 1 }}>
                <Bouton variante="contour" titre="Nouveau lien" onPress={nouveauLien} enCours={enCours === 'lien'} />
              </View>
              <View style={{ flex: 1 }}>
                <Bouton variante="contour" titre="Retirer l’accès" onPress={retirerLien} desactive={enCours !== null} />
              </View>
            </View>
          </>
        ) : (
          <Bouton titre={`Créer le lien de ${prenom}`} onPress={nouveauLien} enCours={enCours === 'lien'} />
        )}
      </Carte>

      <Bouton
        titre="Historique de la tirelire"
        variante="discret"
        onPress={() => navigation.navigate('Tirelire', { personneId, prenom })}
      />
    </ScrollView>
  );
}

const styles = creerStylesThemes(() => ({
  flex: { flex: 1, backgroundColor: theme.colors.background },
  contenu: { padding: theme.spacing.md, gap: theme.spacing.sm, paddingBottom: theme.spacing.xl },
  ligne: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
  ligneTache: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, minHeight: 48 },
  sousTitre: { fontFamily: theme.fontBodyBold, fontSize: 14, color: theme.colors.textMuted },
  montant: { fontFamily: theme.fontTitle, fontSize: 26, color: theme.colors.accent },
  nom: { fontFamily: theme.fontBodyBold, fontSize: 16, color: theme.colors.text },
  detail: { fontFamily: theme.fontBody, fontSize: 14, color: theme.colors.textMuted },
  champ: {
    minHeight: 44,
    backgroundColor: theme.colors.background,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radii.md,
    paddingHorizontal: theme.spacing.sm,
    color: theme.colors.text,
    fontFamily: theme.fontBody,
    fontSize: 16,
  },
}));
