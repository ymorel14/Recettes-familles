// Repérage des ingrédients cités dans une étape (retour de test R-12).
// Lancer depuis la racine du dépôt :  npx tsx --test tests/recettes/ingredients-cites.test.ts
//
// Chaque cas : une étape, les ingrédients de la recette, ceux qu'on attend.
// À compléter avec les recettes réelles où des oublis ont été constatés.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detecterIngredientsCites, ingredientsDeLEtape } from '../../apps/famille/src/modules/recettes/services/ingredientsCites';

const cas: { nom: string; etape: string; ingredients: string[]; attendus: string[] }[] = [
  {
    nom: 'mot exact, accents et pluriel en s',
    etape: 'Mélangez la farine et les oeufs.',
    ingredients: ['250 g de farine', 'Œufs', 'Lait'],
    attendus: ['250 g de farine', 'Œufs'],
  },
  {
    nom: 'verbes : salez, poivrez',
    etape: 'Salez et poivrez généreusement.',
    ingredients: ['Sel', 'Poivre noir', 'Beurre'],
    attendus: ['Sel', 'Poivre noir'],
  },
  {
    nom: 'verbes : beurrez et farinez le moule',
    etape: 'Beurrez et farinez un moule à manqué.',
    ingredients: ['Beurre doux', 'Farine T55', 'Sucre'],
    attendus: ['Beurre doux', 'Farine T55'],
  },
  {
    nom: 'verbe : sucrez',
    etape: 'Sucrez selon votre goût.',
    ingredients: ['Sucre en poudre', 'Sel'],
    attendus: ['Sucre en poudre'],
  },
  {
    nom: 'famille : ajoutez les épices',
    etape: 'Ajoutez les épices et laissez revenir 2 minutes.',
    ingredients: ['Cumin', 'Paprika fumé', "Piment d'Espelette", 'Oignon', 'Ras el hanout'],
    attendus: ['Cumin', 'Paprika fumé', "Piment d'Espelette", 'Ras el hanout'],
  },
  {
    nom: 'famille : assaisonnez',
    etape: "Rectifiez l'assaisonnement.",
    ingredients: ['Sel', 'Poivre', 'Curry', 'Crème fraîche'],
    attendus: ['Sel', 'Poivre', 'Curry'],
  },
  {
    nom: 'famille : les herbes',
    etape: 'Parsemez de fines herbes ciselées.',
    ingredients: ['Thym', 'Persil plat', 'Ciboulette', 'Tomates'],
    attendus: ['Thym', 'Persil plat', 'Ciboulette'],
  },
  {
    nom: 'pluriels en -eaux et -oux',
    etape: 'Émincez les poireaux et coupez les choux en lanières.',
    ingredients: ['1 poireau', 'Chou vert', 'Carottes'],
    attendus: ['1 poireau', 'Chou vert'],
  },
  {
    nom: 'singulier dans l’étape, pluriel dans la liste',
    etape: 'Ajoutez la carotte râpée.',
    ingredients: ['2 carottes', 'Oignons'],
    attendus: ['2 carottes'],
  },
  {
    nom: 'pas de faux positif sur les unités',
    etape: 'Ajoutez une pincée de sel.',
    ingredients: ['1 pincée de muscade', 'Sel'],
    attendus: ['Sel'],
  },
  {
    nom: 'pas de faux positif : salade n’est pas saler',
    etape: 'Servez avec une salade verte.',
    ingredients: ['Sel', 'Salade'],
    attendus: ['Salade'],
  },
];

for (const c of cas) {
  test(c.nom, () => {
    const trouves = detecterIngredientsCites(
      c.etape,
      c.ingredients.map((libelle) => ({ libelle }))
    ).map((i) => i.libelle);
    assert.deepEqual(trouves, c.attendus);
  });
}

test('lien de l’assistant utilisé tant que le texte de l’étape n’a pas changé', () => {
  const ingredients = [
    { id: '1', libelle: 'Sel' },
    { id: '2', libelle: 'Cumin' },
    { id: '3', libelle: 'Oignons' },
  ];
  const lien = { texte: 'Assaisonnez.', libelles: ['Cumin'] };
  assert.deepEqual(ingredientsDeLEtape({ texte: 'Assaisonnez.', ingredients_cites: lien }, ingredients).map((i) => i.id), ['2']);
  // Texte modifié depuis : retour au repérage par mots.
  assert.deepEqual(
    ingredientsDeLEtape({ texte: 'Ajoutez les oignons.', ingredients_cites: lien }, ingredients).map((i) => i.id),
    ['3']
  );
});
