import React, { useEffect, useRef, useState } from 'react';
import { ScrollView, Text } from 'react-native';
import { theme } from '../theme/theme';
import { useAuth } from '../contexts/AuthContext';
import { Bouton, Chargement } from '../components/ui';
import { Champ, Puce, Puces, stylesFormulaire as sf } from '../components/formulaire';
import { ChampPhoto } from '../components/PhotoInventaire';
import { useInventaires } from '../hooks/useInventaires';
import { alerte } from '../utils/alerte';
import { extraireMessageErreur } from '@apps-famille/famille';
import {
  avecPhoto,
  enregistrerContenant,
  enregistrerLieu,
  etatPhoto,
  lieuDeObjet,
  numeroSuivant,
  supprimerContenant,
  supprimerLieu,
  SUGGESTIONS_CONTENANTS,
  SUGGESTIONS_LIEUX,
  type EtatPhoto,
} from '../services/inventaires';

// Créer ou modifier un lieu (garage, cave…) ou un contenant (boîte
// numérotée, placard…), avec sa photo.
// Paramètres : type ('lieu' | 'contenant'), id (modification), lieuId
// (lieu proposé pour un contenant), retour ('ObjetForm' : on y revient avec
// le nouveau rangement choisi).
export default function RangementFormScreen({ route, navigation }: any) {
  const type: 'lieu' | 'contenant' = route.params?.type ?? 'lieu';
  const id: string | undefined = route.params?.id;
  const retour: string | undefined = route.params?.retour;
  const { foyer } = useAuth();
  const { donnees } = useInventaires();
  const initialise = useRef(false);
  const [rempli, setRempli] = useState(false);

  const [nom, setNom] = useState('');
  const [numero, setNumero] = useState('');
  const [numeroTouche, setNumeroTouche] = useState(false);
  const [lieuId, setLieuId] = useState<string | null>(route.params?.lieuId ?? null);
  const [photo, setPhoto] = useState<EtatPhoto>(etatPhoto(null));
  const [enCours, setEnCours] = useState(false);

  useEffect(() => {
    const quoi = type === 'lieu' ? 'lieu' : 'contenant';
    navigation.setOptions({ title: id ? `Modifier le ${quoi}` : `Nouveau ${quoi}` });
  }, [id, type, navigation]);

  useEffect(() => {
    if (!donnees || initialise.current) return;
    initialise.current = true;
    setRempli(true);
    if (!id) return;
    if (type === 'lieu') {
      const l = donnees.lieux.find((x) => x.id === id);
      if (!l) return;
      setNom(l.nom);
      setPhoto(etatPhoto(l.photo));
    } else {
      const c = donnees.contenants.find((x) => x.id === id);
      if (!c) return;
      setNom(c.nom);
      setNumero(c.numero != null ? String(c.numero) : '');
      setNumeroTouche(true);
      setLieuId(c.lieu_id);
      setPhoto(etatPhoto(c.photo));
    }
  }, [donnees, id, type]);

  if (!donnees || !rempli) return <Chargement />;

  // Nouveau contenant : numéro suivant proposé d'après le nom (« Boîte » → 13).
  const choisirNom = (v: string) => {
    setNom(v);
    if (type === 'contenant' && !id && !numeroTouche) {
      const deja = donnees.contenants.some((c) => c.nom.trim().toLowerCase() === v.trim().toLowerCase() && c.numero != null);
      setNumero(deja || /^bo[iî]te|carton|caisse/i.test(v.trim()) ? String(numeroSuivant(v, donnees.contenants)) : '');
    }
  };

  const enregistrer = async () => {
    if (!foyer) return;
    if (!nom.trim()) return alerte('Nom', type === 'lieu' ? 'ex. Garage, Cave, Atelier' : 'ex. Boîte, Placard, Étagère');
    const n = numero.trim() ? Number(numero) : null;
    if (n !== null && (!Number.isInteger(n) || n < 0)) return alerte('Numéro', 'Indiquez un nombre.');
    if (
      type === 'contenant' &&
      n !== null &&
      donnees.contenants.some((c) => c.id !== id && c.numero === n && c.nom.trim().toLowerCase() === nom.trim().toLowerCase())
    ) {
      return alerte('Numéro déjà pris', `Il existe déjà « ${nom.trim()} n° ${n} ». Choisissez un autre numéro.`);
    }
    setEnCours(true);
    try {
      const enregistre = await avecPhoto(foyer.id, photo, (chemin) =>
        type === 'lieu'
          ? enregistrerLieu(foyer.id, id ?? null, { nom, photo: chemin })
          : enregistrerContenant(foyer.id, id ?? null, { nom, numero: n, lieu_id: lieuId, photo: chemin })
      );
      if (retour && !id) navigation.popTo(retour, { choisi: { type, id: enregistre } }, { merge: true });
      else navigation.goBack();
    } catch (e) {
      alerte('Enregistrement impossible', extraireMessageErreur(e, 'Veuillez réessayer.'));
    } finally {
      setEnCours(false);
    }
  };

  const supprimer = () => {
    if (type === 'lieu') {
      const l = donnees.lieux.find((x) => x.id === id);
      if (!l) return;
      const nbContenants = donnees.contenants.filter((c) => c.lieu_id === l.id).length;
      const nbObjets = donnees.objets.filter((o) => lieuDeObjet(o, donnees.contenants) === l.id).length;
      const details = [
        nbContenants ? `${nbContenants} contenant${nbContenants > 1 ? 's' : ''} (gardé${nbContenants > 1 ? 's' : ''}, sans lieu)` : '',
        nbObjets ? `${nbObjets} objet${nbObjets > 1 ? 's' : ''} (gardés dans leur inventaire)` : '',
      ].filter(Boolean);
      return alerte(
        `Supprimer « ${l.nom} » ?`,
        details.length ? `Il contient ${details.join(' et ')}.` : 'Il est vide.',
        [
          { text: 'Annuler', style: 'cancel' },
          { text: 'Supprimer', style: 'destructive', onPress: () => executer(() => supprimerLieu(l)) },
        ]
      );
    }
    const c = donnees.contenants.find((x) => x.id === id);
    if (!c) return;
    const nb = donnees.objets.filter((o) => o.contenant_id === c.id).length;
    alerte(
      'Supprimer ce contenant ?',
      nb ? `Ses ${nb} objet${nb > 1 ? 's' : ''} restent dans leur inventaire, sans emplacement.` : 'Il est vide.',
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Supprimer', style: 'destructive', onPress: () => executer(() => supprimerContenant(c)) },
      ]
    );
  };

  const executer = async (action: () => Promise<void>) => {
    try {
      await action();
      navigation.navigate('Rangements');
    } catch (e) {
      alerte('Suppression impossible', extraireMessageErreur(e, 'Veuillez réessayer.'));
    }
  };

  const suggestions = type === 'lieu' ? SUGGESTIONS_LIEUX : SUGGESTIONS_CONTENANTS;

  return (
    <ScrollView style={sf.flex} contentContainerStyle={sf.contenu} keyboardShouldPersistTaps="handled">
      <Champ
        libelle="Nom"
        value={nom}
        onChangeText={choisirNom}
        placeholder={type === 'lieu' ? 'ex. Garage' : 'ex. Boîte'}
      />
      {!id && (
        <Puces>
          {suggestions.map((s) => (
            <Puce key={s} texte={s} role="button" actif={nom === s} onPress={() => choisirNom(s)} />
          ))}
        </Puces>
      )}

      {type === 'contenant' && (
        <>
          <Champ
            libelle="Numéro (facultatif)"
            value={numero}
            onChangeText={(v) => {
              setNumero(v.replace(/[^0-9]/g, ''));
              setNumeroTouche(true);
            }}
            keyboardType="number-pad"
            placeholder="ex. 12"
            aide="Écrivez-le aussi sur la boîte : on retrouve ensuite son contenu en cherchant « boîte 12 »."
          />
          <Text style={sf.libelle}>Rangé dans</Text>
          <Puces>
            <Puce texte="Aucun lieu" actif={!lieuId} onPress={() => setLieuId(null)} />
            {donnees.lieux.map((l) => (
              <Puce key={l.id} texte={l.nom} icone="home-outline" actif={lieuId === l.id} onPress={() => setLieuId(l.id)} />
            ))}
          </Puces>
          {id && <Text style={sf.aide}>Changer de lieu déplace aussi tout ce qu’il contient.</Text>}
        </>
      )}

      <ChampPhoto
        valeur={photo}
        onChange={setPhoto}
        libelle={type === 'lieu' ? 'Photo du lieu' : 'Photo du contenant'}
      />

      <Bouton titre="Enregistrer" onPress={enregistrer} enCours={enCours} style={{ marginTop: theme.spacing.md }} />
      {id && <Bouton variante="discret" titre={type === 'lieu' ? 'Supprimer le lieu' : 'Supprimer le contenant'} onPress={supprimer} />}
    </ScrollView>
  );
}
