import React, { useCallback, useLayoutEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { theme, creerStylesThemes } from '../theme/theme';
import { useAuth } from '../contexts/AuthContext';
import { Carte, TitreSection } from '../components/elements';
import { Bouton, Chargement, MessageVide, Pastille } from '../components/ui';
import { Champ, Puce, Puces, stylesFormulaire as sf } from '../components/formulaire';
import { GrandePhoto, Vignette } from '../components/PhotoInventaire';
import { useInventaires } from '../hooks/useInventaires';
import { alerte } from '../utils/alerte';
import { extraireMessageErreur } from '@apps-famille/famille';
import { formaterDate, joursAvant, lireDateSaisie, listerPersonnes, type Personne } from '../services/personnes';
import {
  annulerRendu,
  aujourdhuiIso,
  dateSaisie,
  listerPretsObjet,
  marquerRendu,
  nomContenant,
  preter,
  pretEnRetard,
  supprimerPret,
  type Pret,
} from '../services/inventaires';

// « Il y a 3 semaines », « aujourd'hui »…
function depuis(iso: string): string {
  const j = -joursAvant(iso);
  if (j <= 0) return 'aujourd’hui';
  if (j === 1) return 'hier';
  if (j < 14) return `il y a ${j} jours`;
  if (j < 60) return `il y a ${Math.round(j / 7)} semaines`;
  if (j < 730) return `il y a ${Math.round(j / 30.4)} mois`;
  return `il y a ${Math.floor(j / 365.25)} ans`;
}

// Fiche d'un objet : photo, où il est rangé et depuis quand, prêts en cours
// (« Rendu ») et historique ; prêter à quelqu'un de la famille ou à un nom
// libre (voisin, ami…).
export default function ObjetScreen({ route, navigation }: any) {
  const id: string = route.params.id;
  const { foyer, foyersFamille } = useAuth();
  const { donnees, recharger } = useInventaires();
  const [prets, setPrets] = useState<Pret[] | null>(null);
  const [personnes, setPersonnes] = useState<Personne[]>([]);
  const [formulaire, setFormulaire] = useState(false);
  const [enCours, setEnCours] = useState<string | null>(null);

  // Formulaire de prêt.
  const [personneId, setPersonneId] = useState<string | null>(null);
  const [autre, setAutre] = useState('');
  const [quantite, setQuantite] = useState('1');
  const [preteLe, setPreteLe] = useState(dateSaisie(aujourdhuiIso()));
  const [retour, setRetour] = useState('');
  const [note, setNote] = useState('');

  const chargerPrets = useCallback(async () => {
    try {
      setPrets(await listerPretsObjet(id));
    } catch (e) {
      alerte('Chargement impossible', extraireMessageErreur(e, 'Veuillez réessayer.'));
      setPrets([]);
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      chargerPrets();
      const foyers = Array.from(new Set([...(foyer ? [foyer.id] : []), ...(foyersFamille ?? [])]));
      listerPersonnes(foyers)
        .then(setPersonnes)
        .catch(() => setPersonnes([]));
    }, [chargerPrets, foyer, foyersFamille])
  );

  const objet = donnees?.objets.find((o) => o.id === id);

  useLayoutEffect(() => {
    navigation.setOptions({
      title: objet?.nom ?? 'Objet',
      headerRight: () =>
        objet ? (
          <Pressable
            onPress={() => navigation.navigate('ObjetForm', { id, inventaireId: objet.inventaire_id })}
            accessibilityRole="button"
            accessibilityLabel="Modifier l’objet"
            hitSlop={8}
            style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: theme.spacing.xs }}
          >
            <Ionicons name="create-outline" size={24} color={theme.colors.accent} />
          </Pressable>
        ) : null,
    });
  }, [navigation, objet, id]);

  if (!donnees || !prets) return <Chargement />;
  if (!objet) return <MessageVide titre="Objet introuvable" texte="Il a peut-être été supprimé." />;

  const inventaire = donnees.inventaires.find((i) => i.id === objet.inventaire_id);
  const contenant = objet.contenant_id ? donnees.contenants.find((c) => c.id === objet.contenant_id) : undefined;
  const idLieu = contenant ? contenant.lieu_id : objet.lieu_id;
  const lieu = idLieu ? donnees.lieux.find((l) => l.id === idLieu) : undefined;
  const enCoursDePret = prets.filter((p) => !p.rendu_le);
  const rendus = prets.filter((p) => p.rendu_le);
  const qtePretee = enCoursDePret.reduce((s, p) => s + p.quantite, 0);

  const agir = async (cle: string, action: () => Promise<void>) => {
    setEnCours(cle);
    try {
      await action();
      await Promise.all([chargerPrets(), recharger()]);
    } catch (e) {
      alerte('Action impossible', extraireMessageErreur(e, 'Veuillez réessayer.'));
    } finally {
      setEnCours(null);
    }
  };

  const ouvrirFormulaire = () => {
    setPersonneId(null);
    setAutre('');
    setQuantite(String(Math.max(1, objet.quantite - qtePretee)));
    setPreteLe(dateSaisie(aujourdhuiIso()));
    setRetour('');
    setNote('');
    setFormulaire(true);
  };

  const validerPret = () => {
    if (!foyer) return;
    const personne = personnes.find((p) => p.id === personneId);
    const emprunteur = personne ? personne.prenom : autre.trim();
    if (!emprunteur) return alerte('Prêt', 'Choisissez à qui vous le prêtez, ou tapez son nom.');
    const le = lireDateSaisie(preteLe);
    if (!le) return alerte('Date du prêt', 'Date attendue au format JJ/MM/AAAA.');
    const prevu = retour.trim() ? lireDateSaisie(retour) : null;
    if (retour.trim() && !prevu) return alerte('Retour prévu', 'Date attendue au format JJ/MM/AAAA.');
    if (prevu && prevu < le) return alerte('Retour prévu', 'Le retour doit suivre la date du prêt.');
    const q = objet.quantite > 1 ? Number(quantite || '1') : 1;
    if (!Number.isInteger(q) || q < 1) return alerte('Quantité', 'Indiquez combien vous en prêtez.');
    agir('preter', async () => {
      await preter(foyer.id, objet.id, {
        personne_id: personne?.id ?? null,
        emprunteur,
        quantite: q,
        prete_le: le,
        retour_prevu: prevu,
        note: note || null,
      });
      setFormulaire(false);
    });
  };

  const supprimerLigne = (p: Pret) =>
    alerte('Effacer ce prêt de l’historique ?', undefined, [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Effacer', style: 'destructive', onPress: () => agir(p.id, () => supprimerPret(p.id)) },
    ]);

  // Personnes de mon foyer d'abord, puis le reste de la famille.
  const choix = [...personnes].sort(
    (a, b) => Number(b.foyer_id === foyer?.id) - Number(a.foyer_id === foyer?.id) || a.prenom.localeCompare(b.prenom, 'fr')
  );

  return (
    <ScrollView style={sf.flex} contentContainerStyle={sf.contenu} keyboardShouldPersistTaps="handled">
      <GrandePhoto chemin={objet.photo} legende={objet.nom} />
      <Text style={sf.titre}>
        {objet.nom}
        {objet.quantite !== 1 ? <Text style={styles.quantite}>{`  ×${objet.quantite}`}</Text> : null}
      </Text>
      {inventaire && <Text style={sf.detail}>Inventaire {inventaire.nom}</Text>}
      {objet.description ? <Text style={sf.texte}>{objet.description}</Text> : null}

      <TitreSection titre="Rangement" />
      <Carte>
        {!lieu && !contenant ? (
          <Text style={sf.detail}>Pas encore d’emplacement. Touchez le crayon pour indiquer où il est rangé.</Text>
        ) : (
          <View style={{ gap: theme.spacing.sm }}>
            {lieu && (
              <Pressable
                style={sf.ligne}
                onPress={() => navigation.navigate('Rangement', { type: 'lieu', id: lieu.id })}
                accessibilityRole="button"
                accessibilityLabel={`Lieu : ${lieu.nom}`}
              >
                <Vignette chemin={lieu.photo} taille={64} icone="home-outline" />
                <View style={{ flex: 1 }}>
                  <Text style={sf.detail}>Lieu</Text>
                  <Text style={sf.nom}>{lieu.nom}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />
              </Pressable>
            )}
            {contenant && (
              <Pressable
                style={sf.ligne}
                onPress={() => navigation.navigate('Rangement', { type: 'contenant', id: contenant.id })}
                accessibilityRole="button"
                accessibilityLabel={`Contenant : ${nomContenant(contenant)}`}
              >
                <Vignette chemin={contenant.photo} taille={64} icone="cube-outline" />
                <View style={{ flex: 1 }}>
                  <Text style={sf.detail}>Dans</Text>
                  <Text style={sf.nom}>{nomContenant(contenant)}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />
              </Pressable>
            )}
            {objet.range_depuis && (
              <Text style={sf.detail}>
                Rangé là depuis le {formaterDate(objet.range_depuis)} ({depuis(objet.range_depuis)})
              </Text>
            )}
          </View>
        )}
        {objet.possede_depuis && (
          <Text style={[sf.detail, { marginTop: theme.spacing.xs }]}>
            Possédé depuis le {formaterDate(objet.possede_depuis)} ({depuis(objet.possede_depuis)})
          </Text>
        )}
      </Carte>

      <TitreSection
        titre="Prêts"
        detail={objet.quantite > 1 && qtePretee ? `${qtePretee} prêté${qtePretee > 1 ? 's' : ''} sur ${objet.quantite}` : undefined}
      />
      {enCoursDePret.length === 0 && !formulaire && <Text style={sf.detail}>Il est à la maison.</Text>}
      {enCoursDePret.map((p) => {
        const retard = pretEnRetard(p);
        return (
          <Carte key={p.id} accent={retard}>
            <View style={sf.ligne}>
              <Ionicons name="swap-horizontal-outline" size={20} color={theme.colors.accent} />
              <Text style={[sf.nom, { flex: 1 }]}>
                Prêté à {p.emprunteur}
                {p.quantite > 1 ? ` (×${p.quantite})` : ''}
              </Text>
              {retard && <Pastille texte="En retard" />}
            </View>
            <Text style={sf.detail}>
              Depuis le {formaterDate(p.prete_le)} ({depuis(p.prete_le)})
              {p.retour_prevu ? ` · retour prévu le ${formaterDate(p.retour_prevu)}` : ''}
            </Text>
            {p.note ? <Text style={sf.texte}>{p.note}</Text> : null}
            <Bouton
              variante="contour"
              titre="Rendu aujourd’hui"
              onPress={() => agir(p.id, () => marquerRendu(p.id))}
              enCours={enCours === p.id}
              desactive={enCours !== null}
              style={{ marginTop: theme.spacing.xs }}
            />
          </Carte>
        );
      })}

      {formulaire ? (
        <Carte>
          <Text style={styles.titreCarte}>Prêter {objet.nom}</Text>
          <Text style={sf.libelle}>À qui ?</Text>
          <Puces>
            {choix.map((p) => (
              <Puce
                key={p.id}
                texte={p.foyer_id !== foyer?.id && p.foyer_nom ? `${p.prenom} (${p.foyer_nom})` : p.prenom}
                actif={personneId === p.id}
                onPress={() => {
                  setPersonneId(personneId === p.id ? null : p.id);
                  setAutre('');
                }}
              />
            ))}
          </Puces>
          <Champ
            libelle="Ou quelqu’un d’autre"
            value={autre}
            onChangeText={(v) => {
              setAutre(v);
              if (v.trim()) setPersonneId(null);
            }}
            placeholder="ex. Jean (voisin)"
          />
          {objet.quantite > 1 && (
            <Champ
              libelle="Combien ?"
              value={quantite}
              onChangeText={(v) => setQuantite(v.replace(/[^0-9]/g, ''))}
              keyboardType="number-pad"
            />
          )}
          <Champ libelle="Prêté le" value={preteLe} onChangeText={setPreteLe} placeholder="JJ/MM/AAAA" keyboardType="numbers-and-punctuation" />
          <Champ
            libelle="Retour prévu le (facultatif)"
            value={retour}
            onChangeText={setRetour}
            placeholder="JJ/MM/AAAA"
            keyboardType="numbers-and-punctuation"
          />
          <Champ libelle="Note (facultatif)" value={note} onChangeText={setNote} placeholder="ex. avec la mallette d’embouts" />
          <View style={[sf.ligne, { marginTop: theme.spacing.sm }]}>
            <View style={{ flex: 1 }}>
              <Bouton variante="contour" titre="Annuler" onPress={() => setFormulaire(false)} desactive={enCours !== null} />
            </View>
            <View style={{ flex: 1 }}>
              <Bouton titre="Prêter" onPress={validerPret} enCours={enCours === 'preter'} />
            </View>
          </View>
        </Carte>
      ) : (
        (objet.quantite > 1 ? qtePretee < objet.quantite : enCoursDePret.length === 0) && (
          <Bouton titre="Prêter…" variante="contour" onPress={ouvrirFormulaire} />
        )
      )}

      {rendus.length > 0 && (
        <>
          <TitreSection titre="Historique" />
          {rendus.map((p) => (
            <View key={p.id} style={[sf.ligne, styles.historique]}>
              <Ionicons name="checkmark-circle-outline" size={20} color={theme.colors.success} />
              <View style={{ flex: 1 }}>
                <Text style={sf.texte}>
                  {p.emprunteur}
                  {p.quantite > 1 ? ` (×${p.quantite})` : ''}
                </Text>
                <Text style={sf.detail}>
                  du {formaterDate(p.prete_le)} au {formaterDate(p.rendu_le!)}
                </Text>
              </View>
              <Pressable
                onPress={() => agir(p.id, () => annulerRendu(p.id))}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={`Pas encore rendu par ${p.emprunteur}`}
              >
                <Text style={styles.lien}>Pas rendu</Text>
              </Pressable>
              <Pressable onPress={() => supprimerLigne(p)} hitSlop={8} accessibilityRole="button" accessibilityLabel="Effacer">
                <Ionicons name="trash-outline" size={18} color={theme.colors.textMuted} />
              </Pressable>
            </View>
          ))}
        </>
      )}
    </ScrollView>
  );
}

const styles = creerStylesThemes(() => ({
  quantite: { fontFamily: theme.fontBody, fontSize: 18, color: theme.colors.textMuted },
  titreCarte: { fontFamily: theme.fontTitle, fontSize: 18, color: theme.colors.text },
  historique: { paddingVertical: theme.spacing.xs, borderBottomWidth: 1, borderBottomColor: theme.colors.border },
  lien: { fontFamily: theme.fontBody, fontSize: 14, color: theme.colors.accent, textDecorationLine: 'underline' },
}));
