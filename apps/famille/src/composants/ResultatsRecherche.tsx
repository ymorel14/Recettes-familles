import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { useAuth } from '@apps-famille/famille';
import { Carte, LigneListe, PastilleModule, ICONES_MODULES } from './ui';
import { couleurs, creerStyles, espaces, polices, texte as styleTexte } from '../theme/theme';
import { rechercherPartout, type GroupeRecherche, type ResultatRecherche } from '../services/recherche';
import { useFamillesVues } from '../services/familles';
import { ouvrirModule, ouvrirOngletModule } from '../navigation/navigationRef';

// Résultats de la recherche globale (retour de test P-2), groupés par
// module, pendant la frappe (dès 2 lettres, après une courte pause).
// Utilisé par la feuille ⊕ et l'écran Recherche (loupe de l'accueil).
export function ouvrirResultat(r: ResultatRecherche): void {
  if (r.onglet) ouvrirOngletModule(r.module, r.onglet);
  else if (r.ecran) ouvrirModule(r.module, r.ecran, r.params);
  else ouvrirModule(r.module);
}

export function ResultatsRecherche({ texte, onOuvrir }: { texte: string; onOuvrir: (r: ResultatRecherche) => void }) {
  const { foyer, foyersFamille } = useAuth();
  const familles = useFamillesVues();
  const [groupes, setGroupes] = useState<GroupeRecherche[] | null>(null);
  const [enCours, setEnCours] = useState(false);
  const numero = useRef(0);

  useEffect(() => {
    const q = texte.trim();
    if (q.length < 2 || !foyer) {
      setGroupes(null);
      return;
    }
    const n = ++numero.current;
    const minuteur = setTimeout(() => {
      setEnCours(true);
      rechercherPartout(q, { foyerId: foyer.id, foyersFamille, familles })
        .then((g) => n === numero.current && setGroupes(g))
        .catch(() => n === numero.current && setGroupes([]))
        .finally(() => n === numero.current && setEnCours(false));
    }, 250);
    return () => clearTimeout(minuteur);
  }, [texte, foyer?.id, foyersFamille, familles]);

  if (texte.trim().length < 2) return null;
  if (!groupes) return <ActivityIndicator color={couleurs.encre} style={{ marginVertical: espaces.m }} />;
  if (!groupes.length) {
    return <Text style={styles.vide}>{enCours ? 'Je cherche…' : `Rien trouvé pour « ${texte.trim()} ».`}</Text>;
  }
  return (
    <View style={{ gap: espaces.m }}>
      {groupes.map((g) => (
        <View key={g.module} style={{ gap: espaces.s }}>
          <Text style={styles.titreGroupe}>{g.nom}</Text>
          <Carte style={{ paddingVertical: espaces.xs }}>
            {g.resultats.map((r, i) => (
              <LigneListe
                key={r.cle}
                gauche={<PastilleModule module={r.module} taille={36} icone={ICONES_MODULES[r.module]} />}
                titre={r.titre}
                sousTitre={r.detail ?? undefined}
                onPress={() => onOuvrir(r)}
                dernier={i === g.resultats.length - 1}
              />
            ))}
          </Carte>
        </View>
      ))}
    </View>
  );
}

const styles = creerStyles(() => ({
  titreGroupe: { ...styleTexte.libelleSection() },
  vide: { fontFamily: polices.texte, fontSize: 14, color: couleurs.encreDouce, textAlign: 'center', marginVertical: espaces.m },
}));
