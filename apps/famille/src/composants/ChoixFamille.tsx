import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { extraireMessageErreur, useAuth } from '@apps-famille/famille';
import { FeuilleBas } from './FeuilleBas';
import { Icone } from './ui';
import { arrondis, couleurs, creerStyles, espaces, polices } from '../theme/theme';
import { useToast } from './Toast';

export function nomFamille(nom: string | undefined | null): string {
  if (!nom) return '';
  return /^famille\b/i.test(nom) ? nom : `Famille ${nom}`;
}

// « Famille Morel ▾ » en haut de l'accueil : choix de la famille affichée
// (commune à toute l'app et aux anciennes apps).
export function ChoixFamille() {
  const { famille, familles, changerFamille } = useAuth();
  const { afficher } = useToast();
  const [ouvert, setOuvert] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const plusieurs = familles.length > 1;

  return (
    <>
      <Pressable
        onPress={() => plusieurs && setOuvert(true)}
        disabled={!plusieurs}
        accessibilityRole={plusieurs ? 'button' : 'text'}
        accessibilityLabel={plusieurs ? `${nomFamille(famille?.nom)}, changer de famille` : nomFamille(famille?.nom)}
        style={styles.bouton}
        hitSlop={6}
      >
        <Text style={styles.texte} numberOfLines={1}>
          {nomFamille(famille?.nom)}
        </Text>
        {plusieurs ? <Icone nom="chevron-down" taille={16} couleur={couleurs.encre} /> : null}
      </Pressable>
      <FeuilleBas visible={ouvert} titre="Famille affichée" onFermer={() => setOuvert(false)}>
        <Text style={styles.aide}>Les listes, voyages et souvenirs affichés sont ceux de cette famille.</Text>
        {familles.map((f) => (
          <Pressable
            key={f.id}
            onPress={async () => {
              if (f.active) return setOuvert(false);
              try {
                await changerFamille(f.id);
                setOuvert(false);
                afficher(`C’est noté : ${nomFamille(f.nom)}.`);
              } catch (e) {
                setErreur(extraireMessageErreur(e, 'Changement impossible.'));
              }
            }}
            accessibilityRole="radio"
            accessibilityState={{ selected: f.active }}
            style={[styles.choix, f.active && styles.choixActif]}
          >
            <Text style={styles.choixTexte}>{nomFamille(f.nom)}</Text>
            {f.active ? <Icone nom="checkmark-circle" taille={22} couleur={couleurs.succes} /> : null}
          </Pressable>
        ))}
        {erreur ? <Text style={styles.erreur}>{erreur}</Text> : null}
        <View style={{ height: espaces.s }} />
      </FeuilleBas>
    </>
  );
}

const styles = creerStyles(() => ({
  bouton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    minHeight: 36,
    paddingHorizontal: 12,
    borderRadius: arrondis.pilule,
    backgroundColor: couleurs.surface,
    borderWidth: 1,
    borderColor: couleurs.ligneCarte,
    maxWidth: 260,
  },
  texte: { fontFamily: polices.texteGras, fontSize: 14, color: couleurs.encre },
  aide: { fontFamily: polices.texte, fontSize: 14, color: couleurs.encreDouce },
  choix: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 56,
    paddingHorizontal: espaces.l,
    borderRadius: arrondis.champ,
    borderWidth: 1,
    borderColor: couleurs.ligne,
  },
  choixActif: { borderColor: couleurs.encre, borderWidth: 1.5 },
  choixTexte: { flex: 1, fontFamily: polices.texteDemiGras, fontSize: 16, color: couleurs.encre },
  erreur: { fontFamily: polices.texteDemiGras, fontSize: 14, color: couleurs.alerte },
}));
