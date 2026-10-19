import React, { useCallback, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { theme, creerStylesThemes } from '../theme/theme';
import { useAuth } from '../contexts/AuthContext';
import { Carte } from '../components/elements';
import { Bouton, Chargement, MessageVide } from '../components/ui';
import { alerte } from '../utils/alerte';
import { extraireMessageErreur } from '@apps-famille/famille';
import {
  creerDomaine,
  ICONE_DOMAINE_PAR_DEFAUT,
  listerDomaines,
  listerTaches,
  modifierDomaine,
  SUGGESTIONS_DOMAINES,
  supprimerDomaine,
  type Domaine,
} from '../services/maison';

const ICONES = Array.from(
  new Set([...SUGGESTIONS_DOMAINES.map((s) => s.icone), 'construct-outline', 'water-outline', 'flash-outline', 'bicycle-outline', 'cart-outline', ICONE_DOMAINE_PAR_DEFAUT])
);

// Domaines des tâches du foyer (Potager, Entretien maison, Voiture…) :
// ajouter, renommer, changer l'icône, supprimer (les tâches restent).
export default function DomainesScreen() {
  const { foyer } = useAuth();
  const [domaines, setDomaines] = useState<Domaine[] | null>(null);
  const [nbTaches, setNbTaches] = useState<Map<string, number>>(new Map());
  const [ouvert, setOuvert] = useState<string | null>(null);
  const [nom, setNom] = useState('');
  const [icone, setIcone] = useState<string>(ICONE_DOMAINE_PAR_DEFAUT);
  const [nouveau, setNouveau] = useState('');
  const [enCours, setEnCours] = useState<string | null>(null);

  const charger = useCallback(async () => {
    try {
      const [ds, ts] = await Promise.all([listerDomaines(), listerTaches()]);
      const n = new Map<string, number>();
      ts.forEach((t) => t.domaine_id && n.set(t.domaine_id, (n.get(t.domaine_id) ?? 0) + 1));
      setDomaines(ds);
      setNbTaches(n);
    } catch (e) {
      alerte('Chargement impossible', extraireMessageErreur(e, 'Veuillez réessayer.'));
      setDomaines([]);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      charger();
    }, [charger])
  );

  if (!domaines) return <Chargement />;

  const agir = async (cle: string, action: () => Promise<unknown>) => {
    setEnCours(cle);
    try {
      await action();
      await charger();
      return true;
    } catch (e) {
      alerte('Action impossible', extraireMessageErreur(e, 'Veuillez réessayer.'));
      return false;
    } finally {
      setEnCours(null);
    }
  };

  const ouvrir = (d: Domaine) => {
    setOuvert(ouvert === d.id ? null : d.id);
    setNom(d.nom);
    setIcone(d.icone || ICONE_DOMAINE_PAR_DEFAUT);
  };

  const supprimer = (d: Domaine) => {
    const n = nbTaches.get(d.id) ?? 0;
    alerte(`Supprimer « ${d.nom} » ?`, n ? `Ses ${n} tâche${n > 1 ? 's' : ''} restent, sans domaine.` : undefined, [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Supprimer', style: 'destructive', onPress: () => agir(d.id, () => supprimerDomaine(d.id)).then(() => setOuvert(null)) },
    ]);
  };

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.contenu} keyboardShouldPersistTaps="handled">
      {domaines.length === 0 && (
        <MessageVide titre="Aucun domaine" texte="Regroupez vos tâches : potager, entretien de la maison, voiture…" />
      )}
      {domaines.map((d) => {
        const n = nbTaches.get(d.id) ?? 0;
        return (
          <Carte key={d.id} accent={ouvert === d.id}>
            <Pressable onPress={() => ouvrir(d)} style={styles.ligne} accessibilityRole="button" accessibilityLabel={`Modifier ${d.nom}`}>
              <Ionicons name={(d.icone || ICONE_DOMAINE_PAR_DEFAUT) as any} size={22} color={theme.colors.accent} />
              <Text style={[styles.nom, { flex: 1 }]}>{d.nom}</Text>
              <Text style={styles.detail}>
                {n} tâche{n > 1 ? 's' : ''}
              </Text>
              <Ionicons name={ouvert === d.id ? 'chevron-up' : 'chevron-down'} size={18} color={theme.colors.textMuted} />
            </Pressable>
            {ouvert === d.id && (
              <View style={{ gap: theme.spacing.sm, marginTop: theme.spacing.sm }}>
                <TextInput
                  style={styles.champ}
                  value={nom}
                  onChangeText={setNom}
                  accessibilityLabel="Nom du domaine"
                  placeholderTextColor={theme.colors.textMuted}
                />
                <View style={styles.icones}>
                  {ICONES.map((i) => (
                    <Pressable
                      key={i}
                      onPress={() => setIcone(i)}
                      style={[styles.icone, icone === i && styles.iconeActive]}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: icone === i }}
                      accessibilityLabel={i.replace('-outline', '')}
                    >
                      <Ionicons name={i as any} size={22} color={icone === i ? theme.colors.background : theme.colors.accent} />
                    </Pressable>
                  ))}
                </View>
                <View style={styles.ligne}>
                  <View style={{ flex: 1 }}>
                    <Bouton variante="contour" titre="Supprimer" onPress={() => supprimer(d)} desactive={enCours !== null} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Bouton
                      titre="Enregistrer"
                      enCours={enCours === d.id}
                      onPress={() => {
                        if (!nom.trim()) return alerte('Domaine', 'Donnez-lui un nom.');
                        agir(d.id, () => modifierDomaine(d.id, nom, icone)).then((ok) => ok && setOuvert(null));
                      }}
                    />
                  </View>
                </View>
              </View>
            )}
          </Carte>
        );
      })}

      <Text style={styles.libelle}>Nouveau domaine</Text>
      <View style={styles.ligne}>
        <TextInput
          style={[styles.champ, { flex: 1 }]}
          value={nouveau}
          onChangeText={setNouveau}
          placeholder="ex. Potager"
          placeholderTextColor={theme.colors.textMuted}
          accessibilityLabel="Nouveau domaine"
        />
        <Bouton
          titre="Ajouter"
          enCours={enCours === 'nouveau'}
          onPress={() => {
            if (!foyer || !nouveau.trim()) return;
            agir('nouveau', () => creerDomaine(foyer.id, nouveau)).then((ok) => ok && setNouveau(''));
          }}
        />
      </View>
    </ScrollView>
  );
}

const styles = creerStylesThemes(() => ({
  flex: { flex: 1, backgroundColor: theme.colors.background },
  contenu: { padding: theme.spacing.md, gap: theme.spacing.sm, paddingBottom: theme.spacing.xl },
  ligne: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, minHeight: 40 },
  nom: { fontFamily: theme.fontBodyBold, fontSize: 16, color: theme.colors.text },
  detail: { fontFamily: theme.fontBody, fontSize: 13, color: theme.colors.textMuted },
  libelle: { fontFamily: theme.fontBodyBold, fontSize: 14, color: theme.colors.text, marginTop: theme.spacing.md },
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
  icones: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.xs },
  icone: {
    width: 44,
    height: 44,
    borderRadius: theme.radii.md,
    borderWidth: 1.5,
    borderColor: theme.colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconeActive: { backgroundColor: theme.colors.accent },
}));
