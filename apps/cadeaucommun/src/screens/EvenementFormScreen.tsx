import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, ScrollView, Pressable } from 'react-native';
import { theme, creerStylesThemes } from '../theme/theme';
import { useAuth } from '../contexts/AuthContext';
import { extraireMessageErreur } from '@apps-famille/famille';
import {
  creerEvenement,
  creerListe,
  estEvenementPersonnel,
  lireDateSaisie,
  listerPersonnes,
  modifierEvenement,
  obtenirEvenement,
  obtenirMaPersonne,
  versSaisie,
  prochainAnniversaire,
  TYPES_EVENEMENT,
  type Personne,
  type TypeEvenement,
} from '../services/wishlist';
import { Bouton } from '../components/ui';

// Prochaine date d'un jour/mois fixe (Noël : 25/12) au format JJ/MM/AAAA.
function prochaineDate(jour: number, mois: number): string {
  const aujourdHui = new Date();
  let annee = aujourdHui.getFullYear();
  if (new Date(annee, mois - 1, jour) < new Date(annee, aujourdHui.getMonth(), aujourdHui.getDate())) annee += 1;
  return `${String(jour).padStart(2, '0')}/${String(mois).padStart(2, '0')}/${annee}`;
}

// Titre proposé selon le type et la personne fêtée.
function titrePropose(type: TypeEvenement, personne: Personne | null, date: string): string {
  const prenom = personne?.prenom_renseigne ? personne.prenom : null;
  switch (type) {
    case 'noel':
      return `Noël ${date.slice(-4)}`;
    case 'anniversaire':
      return prenom ? `Anniversaire de ${prenom}` : 'Anniversaire';
    case 'naissance':
      return prenom ? `Naissance de ${prenom}` : 'Naissance';
    case 'mariage':
      return prenom ? `Mariage de ${prenom}` : 'Mariage';
    case 'fete_des_meres':
      return prenom ? `Fête des mères · ${prenom}` : 'Fête des mères';
    case 'fete_des_peres':
      return prenom ? `Fête des pères · ${prenom}` : 'Fête des pères';
    default:
      return '';
  }
}

// Nouvel événement dans la famille active. Un anniversaire, une naissance…
// concerne une personne ("Pour qui ?") : sa liste est créée tout de suite.
// Noël est collectif : chacun y crée sa liste.
// Avec `evenementId` : modification (nom et dates) d'un événement existant.
export default function EvenementFormScreen({ navigation, route }: any) {
  const evenementId: string | undefined = route?.params?.evenementId;
  const modification = !!evenementId;
  const { famille, session, foyersFamille } = useAuth();
  const [type, setType] = useState<TypeEvenement>('noel');
  const [personnes, setPersonnes] = useState<Personne[]>([]);
  const [moi, setMoi] = useState<Personne | null>(null);
  const [pourQui, setPourQui] = useState<Personne | null>(null);
  const [date, setDate] = useState(prochaineDate(25, 12));
  const [titre, setTitre] = useState(`Noël ${prochaineDate(25, 12).slice(-4)}`);
  // Tant que l'utilisateur n'a pas retouché le titre, il suit le type et la personne.
  const titreAuto = useRef(true);
  // Jour où les cadeaux sont offerts (repas…) ; vide = le jour même.
  const [dateRemise, setDateRemise] = useState('');
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  // Modification : on reprend le nom et les dates de l'événement.
  useEffect(() => {
    if (!evenementId) return;
    navigation.setOptions({ title: 'Modifier l’événement' });
    titreAuto.current = false;
    obtenirEvenement(evenementId)
      .then((e) => {
        setType(e.type);
        setTitre(e.titre);
        setDate(versSaisie(e.date_evenement));
        setDateRemise(versSaisie(e.date_remise));
      })
      .catch((err) => setErreur(extraireMessageErreur(err, 'Chargement impossible.')));
  }, [evenementId, navigation]);

  useEffect(() => {
    if (!session) return;
    Promise.all([listerPersonnes(foyersFamille), obtenirMaPersonne(session.user.id)])
      .then(([p, m]) => {
        setPersonnes(p);
        setMoi(m);
      })
      .catch(() => {});
  }, [foyersFamille, session]);

  const personnel = estEvenementPersonnel(type);

  const appliquer = (t: TypeEvenement, p: Personne | null) => {
    let nouvelleDate = date;
    if (t === 'noel') nouvelleDate = prochaineDate(25, 12);
    else if (t === 'anniversaire' && p?.date_naissance) nouvelleDate = prochainAnniversaire(p.date_naissance) ?? date;
    else if (type === 'noel') nouvelleDate = '';
    setDate(nouvelleDate);
    if (titreAuto.current) setTitre(titrePropose(t, estEvenementPersonnel(t) ? p : null, nouvelleDate));
  };

  const choisirType = (t: TypeEvenement) => {
    setType(t);
    const p = estEvenementPersonnel(t) ? pourQui : null;
    if (!estEvenementPersonnel(t)) setPourQui(null);
    appliquer(t, p);
  };

  const choisirPersonne = (p: Personne) => {
    setPourQui(p);
    appliquer(type, p);
  };

  const enregistrer = async () => {
    setErreur(null);
    const iso = lireDateSaisie(date);
    const isoRemise = dateRemise.trim() ? lireDateSaisie(dateRemise) : null;
    if (!modification && personnel && !pourQui) return setErreur('Choisissez la personne fêtée.');
    if (!titre.trim()) return setErreur('Donnez un nom à l’événement.');
    if (!iso) return setErreur('Date attendue au format JJ/MM/AAAA, par exemple 25/12/2026.');
    if (dateRemise.trim() && !isoRemise) return setErreur('Date de remise attendue au format JJ/MM/AAAA.');
    if (!famille || !session) return;
    setEnCours(true);
    try {
      if (evenementId) {
        await modifierEvenement(evenementId, { titre, date: iso, dateRemise: isoRemise });
        navigation.goBack();
        return;
      }
      const id = await creerEvenement({
        familleId: famille.id,
        type,
        titre,
        date: iso,
        auteurId: session.user.id,
        destinataireId: personnel ? pourQui!.id : null,
        dateRemise: isoRemise,
      });
      if (personnel && pourQui) {
        // Sa propre liste démarre en brouillon ; celle d'un proche est
        // publiée tout de suite pour que la famille puisse y proposer des idées.
        const pourMoi = pourQui.id === moi?.id;
        const listeId = await creerListe(id, pourQui.id, session.user.id, pourMoi ? 'brouillon' : 'publiee');
        navigation.replace('Liste', { listeId });
      } else {
        navigation.replace('Evenement', { evenementId: id });
      }
    } catch (e) {
      setErreur(extraireMessageErreur(e, 'Impossible de créer l’événement.'));
    } finally {
      setEnCours(false);
    }
  };

  const nomAffiche = (p: Personne) => (p.id === moi?.id ? `${p.prenom_renseigne ? p.prenom : 'Moi'} (moi)` : p.prenom);

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.contenu} keyboardShouldPersistTaps="handled">
      {!modification && (
      <>
      <Text style={styles.libelle}>Type</Text>
      <View style={styles.puces}>
        {TYPES_EVENEMENT.map((t) => (
          <Pressable
            key={t.id}
            onPress={() => choisirType(t.id)}
            style={[styles.puce, type === t.id && styles.puceActive]}
            accessibilityRole="radio"
            accessibilityState={{ selected: type === t.id }}
          >
            <Text style={[styles.puceTexte, type === t.id && styles.puceTexteActive]}>{t.libelle}</Text>
          </Pressable>
        ))}
      </View>

      {personnel ? (
        <>
          <Text style={styles.libelle}>Pour qui ?</Text>
          <View style={styles.puces}>
            {personnes.map((p) => (
              <Pressable
                key={p.id}
                onPress={() => choisirPersonne(p)}
                style={[styles.puce, pourQui?.id === p.id && styles.puceActive]}
                accessibilityRole="radio"
                accessibilityState={{ selected: pourQui?.id === p.id }}
              >
                <Text style={[styles.puceTexte, pourQui?.id === p.id && styles.puceTexteActive]}>{nomAffiche(p)}</Text>
              </Pressable>
            ))}
          </View>
          {pourQui && (
            <Text style={styles.aide}>
              {pourQui.id === moi?.id
                ? 'Votre liste sera créée en brouillon : ajoutez vos souhaits puis publiez-la.'
                : pourQui.utilisateur_id
                  ? `La liste de ${pourQui.prenom} sera créée et visible par la famille. ${pourQui.prenom} pourra y ajouter ses souhaits ; ce que vous y ajouterez restera caché à ${pourQui.prenom}.`
                  : `${pourQui.prenom} n'a pas de compte : vous remplirez sa liste à sa place, et la famille pourra y réserver des cadeaux.`}
            </Text>
          )}
          {personnes.length === 0 && (
            <Text style={styles.aide}>Personne dans la famille pour l'instant.</Text>
          )}
        </>
      ) : (
        <Text style={styles.aide}>
          Événement collectif : chacun pourra y créer sa liste, et vous pourrez aussi créer celle d'un proche.
        </Text>
      )}
      </>
      )}

      <Text style={styles.libelle} nativeID="libelle-titre">Nom</Text>
      <TextInput
        style={styles.champ}
        value={titre}
        onChangeText={(t) => {
          titreAuto.current = false;
          setTitre(t);
        }}
        placeholder="Ex. Anniversaire de Léa"
        placeholderTextColor={theme.colors.textMuted}
        accessibilityLabelledBy="libelle-titre"
      />

      <Text style={styles.libelle} nativeID="libelle-date">
        {type === 'anniversaire' ? "Date de l'anniversaire" : type === 'naissance' ? 'Date de naissance' : 'Date'}
      </Text>
      <TextInput
        style={styles.champ}
        value={date}
        onChangeText={setDate}
        placeholder="JJ/MM/AAAA"
        placeholderTextColor={theme.colors.textMuted}
        keyboardType="numbers-and-punctuation"
        accessibilityLabelledBy="libelle-date"
      />

      <Text style={styles.libelle} nativeID="libelle-remise">Remise des cadeaux (facultatif)</Text>
      <TextInput
        style={styles.champ}
        value={dateRemise}
        onChangeText={setDateRemise}
        placeholder="JJ/MM/AAAA — le jour du repas, si différent"
        placeholderTextColor={theme.colors.textMuted}
        keyboardType="numbers-and-punctuation"
        accessibilityLabelledBy="libelle-remise"
      />
      <Text style={styles.aide}>
        Le jour où la famille offrira les cadeaux, autour d'un repas par exemple. Le compte à rebours et « À offrir » se
        baseront sur cette date. Vous pourrez la fixer plus tard en modifiant l'événement.
      </Text>
      <Text style={styles.aide}>Visible par toute la famille {famille?.nom}.</Text>

      {erreur && <Text style={styles.erreur}>{erreur}</Text>}
      <Bouton titre={modification ? 'Enregistrer' : 'Créer l’événement'} onPress={enregistrer} enCours={enCours} />
    </ScrollView>
  );
}

const styles = creerStylesThemes(() => ({
  flex: { flex: 1, backgroundColor: theme.colors.background },
  contenu: { padding: theme.spacing.md, gap: theme.spacing.sm, paddingBottom: theme.spacing.xl },
  libelle: { fontFamily: theme.fontBodyBold, fontSize: 15, color: theme.colors.text, marginTop: theme.spacing.sm },
  puces: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.xs },
  puce: {
    minHeight: 40,
    justifyContent: 'center',
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  puceActive: { backgroundColor: theme.colors.accent, borderColor: theme.colors.accent },
  puceTexte: { fontFamily: theme.fontBody, fontSize: 14, color: theme.colors.text },
  puceTexteActive: { fontFamily: theme.fontBodyBold, color: theme.colors.background },
  champ: {
    minHeight: 44,
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radii.md,
    paddingHorizontal: theme.spacing.sm,
    color: theme.colors.text,
    fontFamily: theme.fontBody,
    fontSize: 16,
  },
  aide: { fontFamily: theme.fontBody, fontSize: 13, color: theme.colors.textMuted, lineHeight: 18 },
  erreur: { fontFamily: theme.fontBody, fontSize: 14, color: theme.colors.warning },
}));
