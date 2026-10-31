import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { theme, creerStylesThemes } from '../theme/theme';
import { Carte, TitreSection } from '../components/elements';
import { Bouton, Chargement, MessageVide, Pastille } from '../components/ui';
import { Recherche, stylesFormulaire as sf } from '../components/formulaire';
import { LigneObjet } from '../components/LigneObjet';
import { useInventaires } from '../hooks/useInventaires';
import { formaterDate } from '../services/personnes';
import { correspond, emplacement, pretEnRetard } from '../services/inventaires';

// Onglet Inventaires : chercher un objet dans toute la maison (« où est la
// ponceuse ? »), voir ce qui est prêté, ouvrir un inventaire, gérer les
// lieux et contenants de rangement.
export default function InventairesScreen({ navigation }: any) {
  const { donnees } = useInventaires();
  const [recherche, setRecherche] = useState('');

  const resultats = useMemo(() => {
    if (!donnees || !recherche.trim()) return [];
    return donnees.objets.filter((o) => {
      const inv = donnees.inventaires.find((i) => i.id === o.inventaire_id)?.nom ?? '';
      return correspond(o, recherche, `${inv} ${emplacement(o, donnees.lieux, donnees.contenants)}`);
    });
  }, [donnees, recherche]);

  if (!donnees) return <Chargement />;

  const ouvrirObjet = (id: string) => navigation.navigate('Objet', { id });
  const prets = [...donnees.pretsEnCours].sort(
    (a, b) => Number(pretEnRetard(b)) - Number(pretEnRetard(a)) || a.prete_le.localeCompare(b.prete_le)
  );

  return (
    <ScrollView style={sf.flex} contentContainerStyle={sf.contenu} keyboardShouldPersistTaps="handled">
      <Recherche valeur={recherche} onChange={setRecherche} placeholder="Où est… ? (nom, boîte, lieu)" />

      {recherche.trim() ? (
        <>
          <TitreSection titre="Résultats" detail={`${resultats.length} objet${resultats.length > 1 ? 's' : ''}`} />
          {resultats.length === 0 ? (
            <MessageVide titre="Rien trouvé" texte="Essayez un autre mot, ou le numéro d’une boîte." />
          ) : (
            resultats.map((o) => (
              <LigneObjet key={o.id} objet={o} donnees={donnees} avecInventaire onPress={() => ouvrirObjet(o.id)} />
            ))
          )}
        </>
      ) : (
        <>
          {prets.length > 0 && (
            <>
              <TitreSection titre="Prêtés" detail={`${prets.length} en cours`} />
              {prets.map((p) => {
                const objet = donnees.objets.find((o) => o.id === p.objet_id);
                if (!objet) return null;
                const retard = pretEnRetard(p);
                return (
                  <Pressable key={p.id} onPress={() => ouvrirObjet(objet.id)} accessibilityRole="button">
                    <Carte accent={retard}>
                      <View style={sf.ligne}>
                        <Ionicons name="swap-horizontal-outline" size={20} color={theme.colors.accent} />
                        <Text style={[sf.nom, { flex: 1 }]} numberOfLines={1}>
                          {objet.nom}
                          {p.quantite > 1 ? ` ×${p.quantite}` : ''}
                        </Text>
                        {retard && <Pastille texte="En retard" />}
                      </View>
                      <Text style={sf.detail}>
                        À {p.emprunteur} depuis le {formaterDate(p.prete_le)}
                        {p.retour_prevu ? ` · retour prévu le ${formaterDate(p.retour_prevu)}` : ''}
                      </Text>
                    </Carte>
                  </Pressable>
                );
              })}
            </>
          )}

          <TitreSection titre="Mes inventaires" />
          {donnees.inventaires.length === 0 && (
            <MessageVide
              titre="Aucun inventaire"
              texte="Créez un inventaire par domaine : outils, livres, cave à vin, camping…"
            />
          )}
          {donnees.inventaires.map((inv) => {
            const objets = donnees.objets.filter((o) => o.inventaire_id === inv.id);
            const pretes = new Set(donnees.pretsEnCours.map((p) => p.objet_id));
            const nbPretes = objets.filter((o) => pretes.has(o.id)).length;
            return (
              <Pressable
                key={inv.id}
                onPress={() => navigation.navigate('Inventaire', { id: inv.id })}
                accessibilityRole="button"
                accessibilityLabel={`${inv.nom}, ${objets.length} objets`}
              >
                <Carte>
                  <View style={sf.ligne}>
                    <Ionicons name={(inv.icone as any) || 'file-tray-stacked-outline'} size={22} color={theme.colors.accent} />
                    <Text style={[styles.inventaire, { flex: 1 }]}>{inv.nom}</Text>
                    <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />
                  </View>
                  <Text style={sf.detail}>
                    {objets.length} objet{objets.length > 1 ? 's' : ''}
                    {nbPretes ? ` · ${nbPretes} prêté${nbPretes > 1 ? 's' : ''}` : ''}
                  </Text>
                </Carte>
              </Pressable>
            );
          })}
          <Bouton variante="pointille" titre="+ Nouvel inventaire" onPress={() => navigation.navigate('InventaireForm')} />

          <TitreSection titre="Rangements" />
          <Pressable onPress={() => navigation.navigate('Rangements')} accessibilityRole="button">
            <Carte>
              <View style={sf.ligne}>
                <Ionicons name="home-outline" size={22} color={theme.colors.accent} />
                <Text style={[styles.inventaire, { flex: 1 }]}>Lieux et contenants</Text>
                <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />
              </View>
              <Text style={sf.detail}>
                {donnees.lieux.length} lieu{donnees.lieux.length > 1 ? 'x' : ''} (garage, cave…) ·{' '}
                {donnees.contenants.length} contenant{donnees.contenants.length > 1 ? 's' : ''} (boîtes, placards…)
              </Text>
            </Carte>
          </Pressable>
        </>
      )}
    </ScrollView>
  );
}

const styles = creerStylesThemes(() => ({
  inventaire: { fontFamily: theme.fontTitle, fontSize: 18, color: theme.colors.text },
}));
