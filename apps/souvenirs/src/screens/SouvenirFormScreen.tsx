import React, { useEffect, useLayoutEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, KeyboardAvoidingView, Platform } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { theme, creerStylesThemes } from '../theme/theme';
import { useAuth } from '../contexts/AuthContext';
import { useFamilleDonnees } from '../contexts/FamilleDonneesContext';
import { extraireMessageErreur } from '@apps-famille/famille';
import {
  ajouterAuxAlbums,
  creerSouvenir,
  modifierSouvenir,
  obtenirSouvenir,
  peutModifierSouvenir,
  supprimerSouvenir,
  VISIBILITES,
  type FormulaireSouvenir,
  type PersonneDuSouvenir,
  type RolePersonne,
} from '../services/souvenirs';
import { Aide, CarteChoix, Champ, Erreur, Libelle, Puces } from '../components/formulaire';
import { Bouton, Chargement } from '../components/ui';
import { alerte } from '../utils/alerte';
import { lireDateSaisie, PRECISIONS, versSaisie, type PrecisionDate } from '../utils/dates';

const VIDE: FormulaireSouvenir = {
  titre: '',
  categorie: 'evenement',
  precision_date: 'jour',
  date_debut: null,
  date_fin: null,
  lieu: '',
  pays: '',
  recit: '',
  etiquettes: [],
  autres_personnes: [],
  visibilite: 'famille',
  personnes: [],
};

// Créer ou modifier un souvenir. Paramètres facultatifs : id (modification),
// albumId (nouveau souvenir créé depuis un album, qui y est rangé).
export default function SouvenirFormScreen({ route, navigation }: any) {
  const id: string | undefined = route.params?.id;
  const albumId: string | undefined = route.params?.albumId;
  const { session, famille, foyer } = useAuth();
  const { categories, personnes, completer, personne } = useFamilleDonnees();
  const [form, setForm] = useState<FormulaireSouvenir>(VIDE);
  const [saisieDebut, setSaisieDebut] = useState('');
  const [saisieFin, setSaisieFin] = useState('');
  const [saisieEtiquettes, setSaisieEtiquettes] = useState('');
  const [saisieAutres, setSaisieAutres] = useState('');
  const [chargement, setChargement] = useState(!!id);
  const [auteur, setAuteur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState<'enregistrer' | 'supprimer' | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  useLayoutEffect(() => {
    navigation.setOptions({ title: id ? 'Modifier le souvenir' : 'Nouveau souvenir' });
  }, [navigation, id]);

  useEffect(() => {
    if (!id) return;
    obtenirSouvenir(id)
      .then((s) => {
        if (!s) {
          setErreur('Souvenir introuvable.');
          return;
        }
        completer(s.personnes.map((p) => p.personne_id)).catch(() => {});
        setAuteur(s.cree_par);
        setForm({
          titre: s.titre,
          categorie: s.categorie,
          precision_date: s.precision_date,
          date_debut: s.date_debut,
          date_fin: s.date_fin,
          lieu: s.lieu ?? '',
          pays: s.pays ?? '',
          recit: s.recit ?? '',
          etiquettes: s.etiquettes,
          autres_personnes: s.autres_personnes,
          visibilite: s.visibilite,
          personnes: s.personnes,
        });
        setSaisieDebut(versSaisie(s.date_debut, s.precision_date));
        setSaisieFin(versSaisie(s.date_fin, s.precision_date));
        setSaisieEtiquettes(s.etiquettes.join(', '));
        setSaisieAutres(s.autres_personnes.join(', '));
        if (!peutModifierSouvenir(s, session?.user.id, foyer?.id)) {
          setErreur('Seuls son auteur et les membres de son foyer peuvent modifier ce souvenir.');
        }
      })
      .catch((e) => setErreur(extraireMessageErreur(e, 'Impossible de charger le souvenir.')))
      .finally(() => setChargement(false));
  }, [id]);

  const changer = (champs: Partial<FormulaireSouvenir>) => setForm((f) => ({ ...f, ...champs }));

  const changerPrecision = (p: PrecisionDate) => {
    // On garde la date déjà saisie, convertie à la nouvelle précision.
    const debut = lireDateSaisie(saisieDebut, form.precision_date);
    const fin = lireDateSaisie(saisieFin, form.precision_date);
    setSaisieDebut(debut ? versSaisie(debut, p) : saisieDebut);
    setSaisieFin(fin && (p === 'jour' || p === 'mois') ? versSaisie(fin, p) : '');
    changer({ precision_date: p });
  };

  // Personnes : toucher un prénom le fait passer de « absent » à « présent »,
  // puis « concerné » (la personne dont on parle), puis à nouveau absent.
  const roleDe = (personneId: string): RolePersonne | null =>
    form.personnes.find((p) => p.personne_id === personneId)?.role ?? null;
  const basculer = (personneId: string) => {
    const actuel = roleDe(personneId);
    const autres = form.personnes.filter((p) => p.personne_id !== personneId);
    const suivant: RolePersonne | null = actuel === null ? 'present' : actuel === 'present' ? 'principal' : null;
    changer({ personnes: suivant ? [...autres, { personne_id: personneId, role: suivant } as PersonneDuSouvenir] : autres });
  };

  // Personnes déjà citées mais hors de la famille active (autre famille…).
  const horsFamille = form.personnes
    .map((p) => p.personne_id)
    .filter((pid) => !personnes.some((p) => p.id === pid))
    .map((pid) => personne(pid))
    .filter(Boolean) as typeof personnes;

  const enregistrer = async () => {
    if (!session || !famille) return;
    setErreur(null);
    if (!form.titre.trim()) return setErreur('Donnez un titre au souvenir.');
    const debut = saisieDebut.trim() ? lireDateSaisie(saisieDebut, form.precision_date) : null;
    if (saisieDebut.trim() && !debut) {
      const exemple = PRECISIONS.find((p) => p.id === form.precision_date)?.exemple;
      return setErreur(`Date attendue au format ${exemple}.`);
    }
    const avecFin = form.precision_date === 'jour' || form.precision_date === 'mois';
    const fin = avecFin && saisieFin.trim() ? lireDateSaisie(saisieFin, form.precision_date) : null;
    if (avecFin && saisieFin.trim() && !fin) return setErreur('Date de fin invalide.');
    if (fin && debut && fin < debut) return setErreur('La date de fin est avant la date de début.');
    if (fin && !debut) return setErreur('Indiquez aussi la date de début.');

    const donnees: FormulaireSouvenir = {
      ...form,
      date_debut: debut,
      date_fin: fin,
      etiquettes: saisieEtiquettes
        .split(/[,;#\n]/)
        .map((e) => e.trim())
        .filter(Boolean),
      autres_personnes: saisieAutres
        .split(/[,;\n]/)
        .map((e) => e.trim())
        .filter(Boolean),
    };
    setEnCours('enregistrer');
    try {
      if (id) {
        await modifierSouvenir(id, donnees);
        navigation.goBack();
      } else {
        const nouveau = await creerSouvenir(famille.id, session.user.id, donnees);
        if (albumId) {
          try {
            await ajouterAuxAlbums([albumId], [nouveau], session.user.id);
          } catch {
            // Le souvenir est créé ; il pourra être rangé depuis sa fiche.
          }
        }
        navigation.replace('Souvenir', { id: nouveau });
      }
    } catch (e) {
      setErreur(extraireMessageErreur(e, 'Enregistrement impossible.'));
    } finally {
      setEnCours(null);
    }
  };

  const supprimer = () =>
    alerte('Supprimer ce souvenir ?', 'Ses photos, vidéos et commentaires seront supprimés pour toute la famille.', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: async () => {
          setEnCours('supprimer');
          try {
            await supprimerSouvenir(id!);
            navigation.popToTop();
          } catch (e) {
            setErreur(extraireMessageErreur(e, 'Suppression impossible.'));
            setEnCours(null);
          }
        },
      },
    ]);

  if (chargement) return <Chargement />;

  const precision = PRECISIONS.find((p) => p.id === form.precision_date)!;
  const avecFin = form.precision_date === 'jour' || form.precision_date === 'mois';
  // Rendre privé : réservé à l'auteur (règle de la base).
  const visibilites = VISIBILITES.filter(
    (v) => v.id !== 'prive' || !id || auteur === session?.user.id || form.visibilite === 'prive'
  );

  const pucePersonne = (p: (typeof personnes)[number]) => {
    const role = roleDe(p.id);
    return (
      <Pressable
        key={p.id}
        onPress={() => basculer(p.id)}
        style={[styles.puce, role === 'present' && styles.pucePresent, role === 'principal' && styles.pucePrincipal]}
        accessibilityRole="button"
        accessibilityLabel={`${p.prenom} : ${role === 'principal' ? 'concerné' : role === 'present' ? 'présent' : 'absent'}`}
      >
        {role === 'principal' && <Ionicons name="star" size={13} color={theme.colors.background} />}
        {role === 'present' && <Ionicons name="checkmark" size={14} color={theme.colors.accent} />}
        <Text style={[styles.puceTexte, role === 'principal' && styles.puceTextePrincipal]}>{p.prenom}</Text>
      </Pressable>
    );
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
      <ScrollView contentContainerStyle={styles.contenu} keyboardShouldPersistTaps="handled">
        <Libelle>Titre</Libelle>
        <Champ
          value={form.titre}
          onChangeText={(t) => changer({ titre: t })}
          placeholder="Ex. Les premiers pas de Sybille, Vacances à Galway"
          accessibilityLabel="Titre"
        />

        <Libelle>Catégorie</Libelle>
        <View style={styles.categories}>
          {categories.map((c) => {
            const actif = c.code === form.categorie;
            return (
              <Pressable
                key={c.code}
                onPress={() => changer({ categorie: c.code })}
                style={[styles.categorie, actif && styles.categorieActive]}
                accessibilityRole="radio"
                accessibilityState={{ selected: actif }}
              >
                <Ionicons name={c.icone as any} size={16} color={actif ? theme.colors.background : theme.colors.accent} />
                <Text style={[styles.categorieTexte, actif && styles.categorieTexteActif]}>{c.libelle}</Text>
              </Pressable>
            );
          })}
        </View>

        <Libelle>Date</Libelle>
        <Puces options={PRECISIONS.map((p) => ({ id: p.id, libelle: p.libelle }))} valeur={form.precision_date} onChange={changerPrecision} />
        <View style={styles.dates}>
          <Champ
            style={styles.date}
            value={saisieDebut}
            onChangeText={setSaisieDebut}
            placeholder={precision.exemple}
            keyboardType="numbers-and-punctuation"
            accessibilityLabel={avecFin ? 'Date de début' : 'Date'}
          />
          {avecFin && (
            <>
              <Text style={styles.au}>au</Text>
              <Champ
                style={styles.date}
                value={saisieFin}
                onChangeText={setSaisieFin}
                placeholder="(facultatif)"
                keyboardType="numbers-and-punctuation"
                accessibilityLabel="Date de fin"
              />
            </>
          )}
        </View>
        <Aide>
          {avecFin
            ? 'Date de fin pour un voyage ou une période ; laissez-la vide pour un seul jour.'
            : 'Pour un souvenir ancien dont on ne connaît que l’année.'}
        </Aide>

        <Libelle>Lieu</Libelle>
        <View style={styles.dates}>
          <Champ
            style={styles.lieu}
            value={form.lieu}
            onChangeText={(t) => changer({ lieu: t })}
            placeholder="Ville, lieu-dit, maison…"
            accessibilityLabel="Lieu"
          />
          <Champ
            style={styles.pays}
            value={form.pays}
            onChangeText={(t) => changer({ pays: t })}
            placeholder="Pays"
            accessibilityLabel="Pays"
          />
        </View>

        <Libelle>Qui ?</Libelle>
        <Aide>Touchez un prénom : une fois pour « était là », deux fois pour « c'est son souvenir » (★), trois fois pour retirer.</Aide>
        <View style={styles.puces}>
          {personnes.map(pucePersonne)}
          {horsFamille.map(pucePersonne)}
        </View>

        <Libelle>Autres personnes</Libelle>
        <Champ
          value={saisieAutres}
          onChangeText={setSaisieAutres}
          placeholder="Hors de la famille : enfants gardés, amis… (ex. Léo, Inès)"
          accessibilityLabel="Autres personnes, hors de la famille"
        />
        <Aide>Des prénoms séparés par des virgules ; ils sont retrouvés par la recherche.</Aide>

        <Libelle>Récit</Libelle>
        <Champ
          value={form.recit}
          onChangeText={(t) => changer({ recit: t })}
          placeholder="Ce qui s'est passé, ce qu'on a ressenti, les petites phrases à ne pas oublier…"
          multiline
          style={styles.recit}
          accessibilityLabel="Récit"
        />

        <Libelle>Étiquettes</Libelle>
        <Champ
          value={saisieEtiquettes}
          onChangeText={setSaisieEtiquettes}
          placeholder="Ex. plage, cousins, pluie (séparées par des virgules)"
          accessibilityLabel="Étiquettes"
        />

        <Libelle>Qui peut le voir ?</Libelle>
        <View style={styles.choix}>
          {visibilites.map((v) => (
            <CarteChoix
              key={v.id}
              actif={form.visibilite === v.id}
              onPress={() => changer({ visibilite: v.id })}
              titre={v.titre}
              aide={v.aide}
            />
          ))}
        </View>

        <Erreur texte={erreur} />
        <Bouton titre={id ? 'Enregistrer' : 'Créer le souvenir'} onPress={enregistrer} enCours={enCours === 'enregistrer'} />
        {!id && <Aide>Vous ajouterez les photos juste après{albumId ? ' ; le souvenir sera rangé dans l’album' : ''}.</Aide>}
        {id && (
          <Bouton variante="discret" titre="Supprimer ce souvenir" onPress={supprimer} enCours={enCours === 'supprimer'} />
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = creerStylesThemes(() => ({
  flex: { flex: 1, backgroundColor: theme.colors.background },
  contenu: { padding: theme.spacing.md, gap: theme.spacing.sm, paddingBottom: theme.spacing.xl * 2 },
  categories: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.xs },
  categorie: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    minHeight: 38,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  categorieActive: { backgroundColor: theme.colors.accent, borderColor: theme.colors.accent },
  categorieTexte: { fontFamily: theme.fontBody, fontSize: 14, color: theme.colors.text },
  categorieTexteActif: { fontFamily: theme.fontBodyBold, color: theme.colors.background },
  dates: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
  date: { flex: 1, minWidth: 0 },
  au: { fontFamily: theme.fontBody, fontSize: 15, color: theme.colors.textMuted },
  lieu: { flex: 2, minWidth: 0 },
  pays: { flex: 1, minWidth: 0 },
  puces: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.xs },
  puce: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minHeight: 40,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  pucePresent: { borderColor: theme.colors.accent, backgroundColor: theme.colors.accentTransparent },
  pucePrincipal: { borderColor: theme.colors.accent, backgroundColor: theme.colors.accent },
  puceTexte: { fontFamily: theme.fontBody, fontSize: 14, color: theme.colors.text },
  puceTextePrincipal: { fontFamily: theme.fontBodyBold, color: theme.colors.background },
  recit: { minHeight: 140 },
  choix: { gap: theme.spacing.xs },
}));
