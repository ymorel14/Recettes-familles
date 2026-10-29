import React, { useEffect, useRef, useState } from 'react';
import { ScrollView, Text } from 'react-native';
import { ChampDate } from '../../../composants/ChampDate';
import { theme } from '../theme/theme';
import { useAuth } from '../contexts/AuthContext';
import { Bouton, Chargement } from '../components/ui';
import { Champ, Puce, Puces, stylesFormulaire as sf } from '../components/formulaire';
import { ChampPhoto } from '../components/PhotoInventaire';
import { useInventaires } from '../hooks/useInventaires';
import { alerte } from '../utils/alerte';
import { extraireMessageErreur } from '@apps-famille/famille';
import { lireDateSaisie } from '../services/personnes';
import {
  aujourdhuiIso,
  avecPhoto,
  dateSaisie,
  enregistrerObjet,
  etatPhoto,
  lieuDeObjet,
  nomContenant,
  supprimerObjet,
  type EtatPhoto,
} from '../services/inventaires';

// Ajouter ou modifier un objet : photo, nom, quantité, où il est rangé
// (lieu puis contenant) et depuis quand.
// Paramètres : inventaireId, id (modification), lieuId / contenantId
// (emplacement proposé), choisi (lieu ou contenant tout juste créé).
export default function ObjetFormScreen({ route, navigation }: any) {
  const id: string | undefined = route.params?.id;
  const { foyer } = useAuth();
  const { donnees } = useInventaires();
  const initialise = useRef(false);
  const [rempli, setRempli] = useState(false);

  const [inventaireId, setInventaireId] = useState<string>(route.params?.inventaireId ?? '');
  const [nom, setNom] = useState('');
  const [description, setDescription] = useState('');
  const [quantite, setQuantite] = useState('1');
  const [lieuId, setLieuId] = useState<string | null>(route.params?.lieuId ?? null);
  const [contenantId, setContenantId] = useState<string | null>(route.params?.contenantId ?? null);
  const [rangeDepuis, setRangeDepuis] = useState(dateSaisie(aujourdhuiIso()));
  const [possedeDepuis, setPossedeDepuis] = useState('');
  const [photo, setPhoto] = useState<EtatPhoto>(etatPhoto(null));
  const [emplacementInitial, setEmplacementInitial] = useState<{ lieu: string | null; contenant: string | null }>({
    lieu: null,
    contenant: null,
  });
  const [enCours, setEnCours] = useState(false);

  useEffect(() => {
    navigation.setOptions({ title: id ? 'Modifier l’objet' : 'Nouvel objet' });
  }, [id, navigation]);

  // Remplit le formulaire une seule fois (les données sont relues à chaque
  // retour sur l'écran, après la création d'un lieu par exemple).
  useEffect(() => {
    if (!donnees || initialise.current) return;
    initialise.current = true;
    setRempli(true);
    if (contenantId) setLieuId(donnees.contenants.find((c) => c.id === contenantId)?.lieu_id ?? null);
    if (!id && !inventaireId && donnees.inventaires.length === 1) setInventaireId(donnees.inventaires[0].id);
    if (!id) return;
    const o = donnees.objets.find((x) => x.id === id);
    if (!o) return;
    setInventaireId(o.inventaire_id);
    setNom(o.nom);
    setDescription(o.description ?? '');
    setQuantite(String(o.quantite));
    const lieu = lieuDeObjet(o, donnees.contenants);
    setLieuId(lieu);
    setContenantId(o.contenant_id);
    setEmplacementInitial({ lieu: o.contenant_id ? null : o.lieu_id, contenant: o.contenant_id });
    setRangeDepuis(dateSaisie(o.range_depuis));
    setPossedeDepuis(dateSaisie(o.possede_depuis));
    setPhoto(etatPhoto(o.photo));
  }, [donnees, id, contenantId, inventaireId]);

  // Lieu ou contenant créé depuis ce formulaire : choisi d'office.
  const choisi = route.params?.choisi as { type: 'lieu' | 'contenant'; id: string } | undefined;
  useEffect(() => {
    if (!choisi || !donnees) return;
    if (choisi.type === 'lieu') {
      setLieuId(choisi.id);
      setContenantId(null);
    } else {
      setContenantId(choisi.id);
      setLieuId(donnees.contenants.find((c) => c.id === choisi.id)?.lieu_id ?? null);
    }
    navigation.setParams({ choisi: undefined });
  }, [choisi, donnees, navigation]);

  if (!donnees || !rempli) return <Chargement />;

  // Changer de place : « rangé depuis » repart d'aujourd'hui (modifiable).
  const deplacer = (lieu: string | null, contenant: string | null) => {
    setLieuId(lieu);
    setContenantId(contenant);
    const bouge = !id || lieu !== emplacementInitial.lieu || contenant !== emplacementInitial.contenant;
    if (id && bouge) setRangeDepuis(dateSaisie(aujourdhuiIso()));
  };

  const contenantsAffiches = donnees.contenants.filter((c) => (lieuId ? c.lieu_id === lieuId : true));

  const enregistrer = async () => {
    if (!foyer) return;
    if (!nom.trim()) return alerte('Objet', 'Indiquez ce que c’est.');
    if (!inventaireId) return alerte('Inventaire', 'Choisissez l’inventaire de cet objet.');
    const q = Number(quantite.trim() || '0');
    if (!Number.isInteger(q) || q < 0) return alerte('Quantité', 'Indiquez un nombre (0 ou plus).');
    const range = rangeDepuis.trim() ? lireDateSaisie(rangeDepuis) : null;
    if (rangeDepuis.trim() && !range) return alerte('Rangé depuis', 'Choisissez une date.');
    const possede = possedeDepuis.trim() ? lireDateSaisie(possedeDepuis) : null;
    if (possedeDepuis.trim() && !possede) return alerte('Possédé depuis', 'Choisissez une date.');
    setEnCours(true);
    try {
      const enregistre = await avecPhoto(foyer.id, photo, (chemin) =>
        enregistrerObjet(foyer.id, id ?? null, {
          inventaire_id: inventaireId,
          nom,
          description,
          quantite: q,
          lieu_id: contenantId ? null : lieuId,
          contenant_id: contenantId,
          range_depuis: lieuId || contenantId ? range : null,
          possede_depuis: possede,
          photo: chemin,
        })
      );
      if (id) navigation.goBack();
      else navigation.replace('Objet', { id: enregistre });
    } catch (e) {
      alerte('Enregistrement impossible', extraireMessageErreur(e, 'Veuillez réessayer.'));
    } finally {
      setEnCours(false);
    }
  };

  const supprimer = () =>
    alerte('Supprimer cet objet ?', 'Sa photo et l’historique de ses prêts disparaissent aussi.', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: async () => {
          const o = donnees.objets.find((x) => x.id === id);
          if (!o) return;
          try {
            await supprimerObjet(o);
            navigation.pop(2);
          } catch (e) {
            alerte('Suppression impossible', extraireMessageErreur(e, 'Veuillez réessayer.'));
          }
        },
      },
    ]);

  return (
    <ScrollView style={sf.flex} contentContainerStyle={sf.contenu} keyboardShouldPersistTaps="handled">
      <ChampPhoto valeur={photo} onChange={setPhoto} libelle="Photo de l’objet" />
      <Champ libelle="Objet" value={nom} onChangeText={setNom} placeholder="ex. Perceuse à percussion" />
      <Champ
        libelle="Description (facultatif)"
        value={description}
        onChangeText={setDescription}
        placeholder="Marque, modèle, taille, état…"
        multiline
      />
      <Champ
        libelle="Quantité"
        value={quantite}
        onChangeText={(v) => setQuantite(v.replace(/[^0-9]/g, ''))}
        keyboardType="number-pad"
      />

      {(id || !route.params?.inventaireId) && donnees.inventaires.length > 1 && (
        <>
          <Text style={sf.libelle}>Inventaire</Text>
          <Puces>
            {donnees.inventaires.map((i) => (
              <Puce key={i.id} texte={i.nom} actif={inventaireId === i.id} onPress={() => setInventaireId(i.id)} />
            ))}
          </Puces>
        </>
      )}

      <Text style={sf.libelle}>Où est-il rangé ?</Text>
      <Puces>
        <Puce texte="Nulle part" actif={!lieuId && !contenantId} onPress={() => deplacer(null, null)} />
        {donnees.lieux.map((l) => (
          <Puce
            key={l.id}
            texte={l.nom}
            icone="home-outline"
            actif={lieuId === l.id}
            onPress={() => deplacer(l.id, contenantId && donnees.contenants.find((c) => c.id === contenantId)?.lieu_id === l.id ? contenantId : null)}
          />
        ))}
        <Puce
          texte="Nouveau lieu"
          icone="add"
          role="button"
          onPress={() => navigation.navigate('RangementForm', { type: 'lieu', retour: 'ObjetForm' })}
        />
      </Puces>

      {(lieuId || contenantsAffiches.length > 0) && (
        <>
          <Text style={sf.libelle}>Dans quoi ?</Text>
          <Puces>
            {lieuId && (
              <Puce texte="Directement dans le lieu" actif={!contenantId} onPress={() => deplacer(lieuId, null)} />
            )}
            {contenantsAffiches.map((c) => (
              <Puce
                key={c.id}
                texte={lieuId ? nomContenant(c) : `${nomContenant(c)}${c.lieu_id ? ` (${donnees.lieux.find((l) => l.id === c.lieu_id)?.nom ?? '…'})` : ''}`}
                icone="cube-outline"
                actif={contenantId === c.id}
                onPress={() => deplacer(c.lieu_id, c.id)}
              />
            ))}
            <Puce
              texte="Nouveau contenant"
              icone="add"
              role="button"
              onPress={() => navigation.navigate('RangementForm', { type: 'contenant', lieuId, retour: 'ObjetForm' })}
            />
          </Puces>
        </>
      )}

      {(lieuId || contenantId) && (
        <ChampDate libelle="Rangé là depuis le" value={rangeDepuis} onChangeText={setRangeDepuis} couleur={theme.colors.accent} />
      )}
      <ChampDate
        libelle="Possédé depuis le (facultatif)"
        value={possedeDepuis}
        onChangeText={setPossedeDepuis}
        placeholder="Date d’achat, de cadeau…"
        couleur={theme.colors.accent}
      />

      <Bouton titre="Enregistrer" onPress={enregistrer} enCours={enCours} style={{ marginTop: theme.spacing.md }} />
      {id && <Bouton variante="discret" titre="Supprimer l’objet" onPress={supprimer} />}
    </ScrollView>
  );
}
