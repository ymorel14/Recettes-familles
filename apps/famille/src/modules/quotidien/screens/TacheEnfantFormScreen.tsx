import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { theme, creerStylesThemes } from '../theme/theme';
import { useAuth } from '../contexts/AuthContext';
import { Carte } from '../components/elements';
import { Bouton, Chargement } from '../components/ui';
import { Champ, Puce, Puces } from '../components/formulaire';
import CompteurFois from '../components/CompteurFois';
import { alerte } from '../utils/alerte';
import { extraireMessageErreur } from '@apps-famille/famille';
import { listerPersonnes, type Personne } from '../services/personnes';
import { creerTache, modifierTache, supprimerTache, lundiDe, type Tache, type TypeTache } from '../services/maison';
import { ajouterJoursIso, aujourdhuiIso, JOURS_COURTS } from '../utils/semaine';

// Formulaire « Tâche d'enfant » (refonte Quotidien § 4.5). Deux types :
//   - Obligatoire : des jours précis, à faire chaque fois ;
//   - Coup de main : N fois dans la semaine, n'importe quel jour.
// Avec plusieurs enfants, CHACUN doit la faire (attribution « chacun »).
export default function TacheEnfantFormScreen({ route, navigation }: any) {
  const { foyer } = useAuth();
  const tache = route.params?.tache as Tache | undefined;
  const personneInitiale = route.params?.personneId as string | undefined;

  const [enfants, setEnfants] = useState<Personne[] | null>(null);
  const [libelle, setLibelle] = useState(tache?.libelle ?? '');
  const [pour, setPour] = useState<string[]>(tache?.personnes ?? (personneInitiale ? [personneInitiale] : []));
  const [type, setType] = useState<Exclude<TypeTache, 'maison'>>(
    tache && tache.type !== 'maison' ? tache.type : 'obligatoire'
  );
  const [jours, setJours] = useState<number[]>(tache && tache.jours.length ? tache.jours : [1, 2, 3, 4, 5, 6, 7]);
  const [fois, setFois] = useState(tache?.fois_par_semaine ?? 3);
  const [maxUnParJour, setMaxUnParJour] = useState(tache?.max_un_par_jour ?? true);
  const [validation, setValidation] = useState(tache?.validation_parent ?? true);
  const [desCetteSemaine, setDesCetteSemaine] = useState(false);
  const [enCours, setEnCours] = useState<string | null>(null);

  useEffect(() => {
    navigation.setOptions({ title: tache ? 'Tâche d’enfant' : 'Nouvelle tâche d’enfant' });
    if (!foyer) return;
    listerPersonnes([foyer.id])
      .then((ps) => {
        const kids = ps.filter((p) => !p.utilisateur_id);
        setEnfants(kids);
        // Un seul enfant dans le foyer : choisi d'office.
        setPour((actuel) => (actuel.length === 0 && kids.length === 1 ? [kids[0].id] : actuel));
      })
      .catch((e) => {
        alerte('Chargement impossible', extraireMessageErreur(e, 'Veuillez réessayer.'));
        setEnfants([]);
      });
  }, [foyer, navigation, tache]);

  const maxFois = maxUnParJour ? 7 : 14;
  const foisEffectif = Math.min(fois, maxFois);

  const basculer = <T,>(liste: T[], valeur: T): T[] =>
    liste.includes(valeur) ? liste.filter((v) => v !== valeur) : [...liste, valeur];

  const recap = useMemo(() => {
    if (pour.length === 0) return 'Choisissez au moins un enfant.';
    const qui = pour.length > 1 ? 'Chacun doit' : 'Il ou elle doit';
    if (type === 'obligatoire') {
      return jours.length === 7
        ? `${qui} le faire tous les jours pour toucher son argent de poche.`
        : `${qui} le faire ${jours.length} jour${jours.length > 1 ? 's' : ''} par semaine pour toucher son argent de poche. Un seul jour oublié et la semaine n’est pas complète.`;
    }
    return `${qui} le faire ${foisEffectif} fois d’ici dimanche pour toucher son argent de poche.`;
  }, [pour, type, jours, foisEffectif]);

  if (!enfants || !foyer) return <Chargement />;

  const enregistrer = async () => {
    if (!libelle.trim()) return alerte('Tâche', 'Donnez un nom à la tâche, par exemple « Faire son lit ».');
    if (pour.length === 0) return alerte('Pour qui', 'Choisissez au moins un enfant.');
    if (type === 'obligatoire' && jours.length === 0) return alerte('Jours', 'Choisissez au moins un jour.');

    const aujourdhui = aujourdhuiIso();
    // Obligatoire : à partir de demain. Coup de main : dès lundi prochain,
    // sauf « dès cette semaine ». En modification, la date de début reste.
    const dateDebut =
      tache?.date_debut ??
      (type === 'obligatoire'
        ? ajouterJoursIso(aujourdhui, 1)
        : desCetteSemaine
          ? lundiDe(aujourdhui)
          : ajouterJoursIso(lundiDe(aujourdhui), 7));

    const donnees = {
      libelle: libelle.trim(),
      points: 0,
      recurrence: type === 'obligatoire' ? ('hebdomadaire' as const) : ('aucune' as const),
      jours: type === 'obligatoire' ? [...jours].sort((a, b) => a - b) : [],
      personnes: pour,
      domaine_id: null,
      planif: 'libre' as const,
      periode_debut: null,
      periode_fin: null,
      type,
      fois_par_semaine: type === 'coup_de_main' ? foisEffectif : null,
      max_un_par_jour: type === 'coup_de_main' ? maxUnParJour : true,
      validation_parent: validation,
      attribution: 'chacun' as const,
      date_debut: dateDebut,
    };

    setEnCours('enregistrer');
    try {
      if (tache) await modifierTache(tache.id, donnees);
      else await creerTache(foyer.id, donnees);
      navigation.goBack();
    } catch (e) {
      alerte('Enregistrement impossible', extraireMessageErreur(e, 'Veuillez réessayer.'));
    } finally {
      setEnCours(null);
    }
  };

  const pause = async () => {
    if (!tache) return;
    setEnCours('pause');
    try {
      await modifierTache(tache.id, { active: !tache.active });
      navigation.goBack();
    } catch (e) {
      alerte('Action impossible', extraireMessageErreur(e, 'Veuillez réessayer.'));
    } finally {
      setEnCours(null);
    }
  };

  const supprimer = () => {
    if (!tache) return;
    alerte('Supprimer cette tâche ?', 'Ses réalisations de la semaine sont aussi supprimées. Les bilans déjà validés ne changent pas.', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: async () => {
          setEnCours('supprimer');
          try {
            await supprimerTache(tache.id);
            navigation.goBack();
          } catch (e) {
            alerte('Suppression impossible', extraireMessageErreur(e, 'Veuillez réessayer.'));
          } finally {
            setEnCours(null);
          }
        },
      },
    ]);
  };

  const carteType = (valeur: Exclude<TypeTache, 'maison'>, titre: string, texte: string) => (
    <Pressable
      key={valeur}
      onPress={() => setType(valeur)}
      accessibilityRole="radio"
      accessibilityState={{ selected: type === valeur }}
      accessibilityLabel={`${titre}. ${texte}`}
      style={[styles.carteType, type === valeur && styles.carteTypeActive]}
    >
      <Text style={styles.titreType}>{titre}</Text>
      <Text style={styles.detail}>{texte}</Text>
    </Pressable>
  );

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.contenu} keyboardShouldPersistTaps="handled">
      <Champ
        libelle="Tâche"
        value={libelle}
        onChangeText={setLibelle}
        placeholder="ex. Faire son lit, Vider le lave-vaisselle"
        maxLength={120}
      />

      <Text style={styles.etiquette}>Pour qui</Text>
      <Puces>
        {enfants.map((p) => (
          <Puce key={p.id} texte={p.prenom} role="checkbox" actif={pour.includes(p.id)} onPress={() => setPour(basculer(pour, p.id))} />
        ))}
      </Puces>

      <Text style={styles.etiquette}>Type</Text>
      <View style={{ gap: theme.spacing.sm }}>
        {carteType('obligatoire', 'Obligatoire', 'Des jours précis, à chaque fois')}
        {carteType('coup_de_main', 'Coup de main', 'X fois dans la semaine, quand on veut')}
      </View>

      {type === 'obligatoire' ? (
        <>
          <Text style={styles.etiquette}>Les jours</Text>
          <Puces>
            {JOURS_COURTS.map((j, i) => (
              <Puce key={j} texte={j} role="checkbox" actif={jours.includes(i + 1)} onPress={() => setJours(basculer(jours, i + 1))} />
            ))}
          </Puces>
          <Text style={styles.detail}>Un seul jour oublié et la semaine n’est pas complète.</Text>
        </>
      ) : (
        <>
          <Text style={styles.etiquette}>Combien de fois par semaine ?</Text>
          <CompteurFois valeur={foisEffectif} onChange={setFois} max={maxFois} libelle="Fois par semaine" />
          <Puce
            texte="Pas plus d’une fois par jour"
            role="checkbox"
            actif={maxUnParJour}
            onPress={() => {
              setMaxUnParJour(!maxUnParJour);
              if (!maxUnParJour) setFois(Math.min(fois, 7));
            }}
          />
          {!tache ? (
            <Puce
              texte="Compter dès cette semaine"
              role="checkbox"
              actif={desCetteSemaine}
              onPress={() => setDesCetteSemaine(!desCetteSemaine)}
            />
          ) : null}
          {!tache ? (
            <Text style={styles.detail}>
              Par défaut, un coup de main compte à partir de lundi prochain.
            </Text>
          ) : null}
        </>
      )}

      <Puce
        texte="Un parent valide quand c’est fait"
        role="checkbox"
        actif={validation}
        onPress={() => setValidation(!validation)}
      />

      <Carte accent>
        <Text style={styles.recap}>{recap}</Text>
      </Carte>

      <Bouton titre="Enregistrer" onPress={enregistrer} enCours={enCours === 'enregistrer'} />
      {tache ? (
        <>
          <Bouton
            titre={tache.active ? 'Mettre en pause' : 'Reprendre'}
            variante="contour"
            onPress={pause}
            enCours={enCours === 'pause'}
          />
          <Bouton titre="Supprimer" variante="pointille" onPress={supprimer} enCours={enCours === 'supprimer'} />
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = creerStylesThemes(() => ({
  flex: { flex: 1, backgroundColor: theme.colors.background },
  contenu: { padding: theme.spacing.md, gap: theme.spacing.sm, paddingBottom: theme.spacing.xl },
  etiquette: { fontFamily: theme.fontBodyBold, fontSize: 14, color: theme.colors.text, marginTop: theme.spacing.sm },
  detail: { fontFamily: theme.fontBody, fontSize: 13, color: theme.colors.textMuted },
  recap: { fontFamily: theme.fontBody, fontSize: 15, color: theme.colors.text },
  carteType: {
    minHeight: 64,
    gap: 2,
    padding: theme.spacing.md,
    borderRadius: theme.radii.lg,
    borderWidth: 1.5,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  carteTypeActive: { borderColor: theme.colors.accent, backgroundColor: theme.colors.accentTransparent },
  titreType: { fontFamily: theme.fontBodyBold, fontSize: 16, color: theme.colors.text },
}));
