import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { FeuilleBas } from '../../../composants/FeuilleBas';
import { Bouton, ControleSegmente, Icone } from '../../../composants/ui';
import { couleurs, couleursModule, creerStyles, espaces, polices } from '../../../theme/theme';
import SelecteurCategories from './SelecteurCategories';
import type { RecetteComplete } from '../types/models';

export type ActionCategories = { mode: 'ajouter' | 'remplacer'; noms: string[] } | { mode: 'retirer'; ids: string[] };

// Catégories de plusieurs recettes à la fois (retour de test R-13) :
// ajouter, retirer ou remplacer. Les recettes des autres foyers ne sont pas
// modifiées (l'écran ne les passe pas).
export default function FeuilleCategoriesMasse({
  visible,
  recettes,
  onFermer,
  onValider,
  enCours,
}: {
  visible: boolean;
  recettes: RecetteComplete[];
  onFermer: () => void;
  onValider: (action: ActionCategories) => void;
  enCours: boolean;
}) {
  const [mode, setMode] = useState<'ajouter' | 'retirer' | 'remplacer'>('ajouter');
  const [noms, setNoms] = useState<string[]>([]);
  const [aRetirer, setARetirer] = useState<Set<string>>(new Set());
  const encre = couleursModule('recettes').encre;

  useEffect(() => {
    if (!visible) return;
    setMode('ajouter');
    setNoms([]);
    setARetirer(new Set());
  }, [visible]);

  // Catégories présentes dans la sélection, avec leur nombre de recettes.
  const presentes = useMemo(() => {
    const m = new Map<string, { id: string; nom: string; n: number }>();
    recettes.forEach((r) =>
      r.categories.forEach((c) => m.set(c.id, { id: c.id, nom: c.nom, n: (m.get(c.id)?.n ?? 0) + 1 }))
    );
    return [...m.values()].sort((a, b) => b.n - a.n || a.nom.localeCompare(b.nom, 'fr'));
  }, [recettes]);

  const pret = mode === 'retirer' ? aRetirer.size > 0 : noms.length > 0;
  const n = recettes.length;

  return (
    <FeuilleBas visible={visible} titre={`Catégories de ${n} recette${n > 1 ? 's' : ''}`} onFermer={onFermer}>
      <ControleSegmente
        options={[
          { id: 'ajouter', libelle: 'Ajouter' },
          { id: 'retirer', libelle: 'Retirer' },
          { id: 'remplacer', libelle: 'Remplacer' },
        ]}
        valeur={mode}
        onChange={setMode}
      />
      {mode === 'retirer' ? (
        presentes.length ? (
          <View>
            {presentes.map((c) => {
              const coche = aRetirer.has(c.id);
              return (
                <Pressable
                  key={c.id}
                  style={styles.ligne}
                  onPress={() =>
                    setARetirer((avant) => {
                      const apres = new Set(avant);
                      if (apres.has(c.id)) apres.delete(c.id);
                      else apres.add(c.id);
                      return apres;
                    })
                  }
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: coche }}
                >
                  <Icone nom={coche ? 'checkbox' : 'square-outline'} taille={24} couleur={coche ? encre : couleurs.encreDouce} />
                  <Text style={styles.libelle}>{c.nom}</Text>
                  <Text style={styles.nombre}>{c.n}</Text>
                </Pressable>
              );
            })}
          </View>
        ) : (
          <Text style={styles.aide}>Ces recettes n’ont pas de catégorie.</Text>
        )
      ) : (
        <>
          <Text style={styles.aide}>
            {mode === 'ajouter'
              ? 'Ces catégories s’ajoutent à celles que les recettes ont déjà.'
              : 'Les recettes n’auront plus que ces catégories.'}
          </Text>
          <SelecteurCategories selection={noms} onChange={setNoms} />
        </>
      )}
      <Bouton
        titre={mode === 'ajouter' ? 'Ajouter' : mode === 'retirer' ? 'Retirer' : 'Remplacer'}
        module="recettes"
        desactive={!pret}
        enCours={enCours}
        onPress={() => onValider(mode === 'retirer' ? { mode, ids: [...aRetirer] } : { mode, noms })}
      />
    </FeuilleBas>
  );
}

const styles = creerStyles(() => ({
  aide: { fontFamily: polices.texte, fontSize: 14, color: couleurs.encreDouce },
  ligne: { flexDirection: 'row', alignItems: 'center', gap: espaces.m, minHeight: 48, borderBottomWidth: 1, borderBottomColor: couleurs.ligne },
  libelle: { flex: 1, fontFamily: polices.texte, fontSize: 16, color: couleurs.encre },
  nombre: { fontFamily: polices.texteDemiGras, fontSize: 13, color: couleurs.encreDouce },
}));
