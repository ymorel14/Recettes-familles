import { motsNormalises } from '../utils/texte';

// Rayons de départ (mêmes identifiants que la migration
// supabase/migrations/20261017100000_courses.sql) et dictionnaire qui devine
// le rayon d'un article d'après son libellé.

export type Rayon = { id: string; nom: string; icone: string; ordre: number };

export const RAYONS_DEPART: Rayon[] = [
  { id: 'fruits_legumes', nom: 'Fruits et légumes', icone: 'nutrition-outline', ordre: 10 },
  { id: 'boulangerie', nom: 'Boulangerie', icone: 'storefront-outline', ordre: 20 },
  { id: 'boucherie', nom: 'Boucherie, poissonnerie, traiteur', icone: 'fish-outline', ordre: 30 },
  { id: 'cremerie', nom: 'Crèmerie et fromages', icone: 'egg-outline', ordre: 40 },
  { id: 'epicerie_salee', nom: 'Épicerie salée', icone: 'basket-outline', ordre: 50 },
  { id: 'epicerie_sucree', nom: 'Épicerie sucrée et petit-déjeuner', icone: 'cafe-outline', ordre: 60 },
  { id: 'boissons', nom: 'Boissons', icone: 'wine-outline', ordre: 70 },
  { id: 'surgeles', nom: 'Surgelés', icone: 'snow-outline', ordre: 80 },
  { id: 'hygiene', nom: 'Hygiène et beauté', icone: 'water-outline', ordre: 90 },
  { id: 'entretien', nom: 'Entretien et maison', icone: 'home-outline', ordre: 100 },
  { id: 'bebe', nom: 'Bébé', icone: 'happy-outline', ordre: 110 },
  { id: 'animaux', nom: 'Animaux', icone: 'paw-outline', ordre: 120 },
  { id: 'autres', nom: 'Autres', icone: 'ellipsis-horizontal-circle-outline', ordre: 130 },
];

export const RAYON_AUTRES = 'autres';

// Produits courants, par rayon. Écrits naturellement : accents, majuscules
// et pluriels simples sont ignorés à la comparaison. Une expression de
// plusieurs mots (« lait de coco ») l'emporte sur ses mots pris seuls
// (« lait »).
const PRODUITS: Record<string, string[]> = {
  fruits_legumes: [
    'pomme', 'poire', 'banane', 'orange', 'clementine', 'mandarine', 'citron', 'citron vert', 'pamplemousse',
    'kiwi', 'ananas', 'mangue', 'fraise', 'framboise', 'myrtille', 'mure', 'cerise', 'abricot', 'peche',
    'nectarine', 'prune', 'mirabelle', 'raisin', 'melon', 'pasteque', 'figue', 'grenade', 'litchi', 'avocat',
    'tomate', 'tomate cerise', 'concombre', 'courgette', 'aubergine', 'poivron', 'carotte', 'pomme de terre',
    'patate', 'patate douce', 'oignon', 'echalote', 'ail', 'gousse d ail', 'poireau', 'celeri', 'fenouil',
    'salade', 'laitue', 'mache', 'roquette', 'epinard', 'chou', 'chou fleur', 'brocoli', 'chou de bruxelles',
    'haricot vert', 'petit pois frais', 'radis', 'navet', 'betterave', 'endive', 'artichaut', 'asperge',
    'champignon', 'champignon de paris', 'potiron', 'potimarron', 'butternut', 'courge', 'panais',
    'topinambour', 'mais doux', 'gingembre', 'persil', 'ciboulette', 'coriandre', 'basilic', 'menthe',
    'aneth', 'thym frais', 'romarin frais', 'herbes fraiches', 'fruit', 'legume', 'pousse', 'germe',
  ],
  boulangerie: [
    'pain', 'baguette', 'pain de mie', 'pain complet', 'pain aux cereales', 'brioche', 'croissant',
    'pain au chocolat', 'chocolatine', 'viennoiserie', 'pain burger', 'pain hot dog', 'pain pita', 'tortilla',
    'wrap', 'galette de ble', 'biscotte', 'pain grille', 'muffin anglais', 'bagel', 'focaccia', 'fougasse',
  ],
  boucherie: [
    'viande', 'boeuf', 'steak', 'steak hache', 'bavette', 'entrecote', 'roti', 'roti de porc', 'roti de boeuf',
    'veau', 'escalope', 'porc', 'cote de porc', 'filet mignon', 'agneau', 'gigot', 'poulet', 'blanc de poulet',
    'cuisse de poulet', 'dinde', 'canard', 'magret', 'lapin', 'saucisse', 'merguez', 'chipolata', 'chair a saucisse',
    'jambon', 'jambon blanc', 'jambon cru', 'lardon', 'bacon', 'saucisson', 'chorizo', 'pate de campagne', 'pate en croute', 'foie gras', 'rillette',
    'terrine', 'boudin', 'andouillette', 'poisson', 'saumon', 'saumon fume', 'cabillaud', 'colin', 'merlu',
    'thon frais', 'truite', 'dorade', 'bar', 'sole', 'crevette', 'moule', 'huitre', 'coquille saint jacques',
    'surimi', 'traiteur', 'quiche', 'pizza fraiche', 'taboule', 'salade composee', 'hachis parmentier',
    'cordon bleu', 'nugget', 'knack', 'aiguillette',
  ],
  cremerie: [
    'lait', 'lait demi ecreme', 'lait entier', 'lait ecreme', 'beurre', 'beurre doux', 'beurre demi sel',
    'creme', 'creme fraiche', 'creme liquide', 'oeuf', 'yaourt', 'yogourt', 'fromage blanc', 'faisselle',
    'petit suisse', 'skyr', 'dessert lacte', 'creme dessert', 'flan', 'mousse au chocolat', 'riz au lait',
    'fromage', 'emmental', 'gruyere', 'comte', 'camembert', 'brie', 'roquefort', 'bleu', 'chevre', 'feta',
    'mozzarella', 'parmesan', 'ricotta', 'mascarpone', 'raclette', 'reblochon', 'cantal', 'mimolette',
    'tomme', 'fromage rape', 'cancoillotte', 'boursin', 'kiri', 'babybel', 'vache qui rit', 'pate feuilletee',
    'pate brisee', 'pate sablee', 'pate a pizza', 'margarine', 'lait vegetal', 'lait d avoine',
    'lait d amande', 'lait de soja', 'tofu',
  ],
  epicerie_salee: [
    'pates', 'pate', 'spaghetti', 'tagliatelle', 'penne', 'coquillette', 'macaroni', 'lasagne', 'ravioli',
    'riz', 'riz basmati', 'semoule', 'couscous', 'boulgour', 'quinoa', 'lentille', 'pois chiche',
    'haricot rouge', 'haricot blanc', 'flageolet', 'petit pois', 'mais', 'conserve', 'thon', 'sardine',
    'maquereau', 'sauce tomate', 'coulis de tomate', 'concentre de tomate', 'tomate pelee', 'pesto', 'ketchup',
    'mayonnaise', 'moutarde', 'vinaigre', 'vinaigre balsamique', 'huile', 'huile d olive', 'huile de tournesol',
    'sel', 'poivre', 'epice', 'curry', 'paprika', 'cumin', 'curcuma', 'cannelle', 'muscade', 'herbes de provence',
    'thym', 'laurier', 'origan', 'bouillon', 'cube de bouillon', 'fond de veau', 'sauce soja', 'nuoc mam',
    'olive', 'cornichon', 'capre', 'chips', 'cacahuete', 'pistache', 'noix de cajou', 'biscuit aperitif',
    'crackers', 'soupe', 'veloute', 'puree', 'chapelure', 'farine', 'fecule', 'maizena', 'levure',
    'levure boulangere', 'lait de coco', 'creme de coco', 'nouille', 'vermicelle', 'galette de riz',
    'plat cuisine', 'cassoulet', 'choucroute', 'raviolis', 'gnocchi', 'noix', 'noisette', 'amande', 'graine',
  ],
  epicerie_sucree: [
    'sucre', 'sucre glace', 'sucre roux', 'cassonade', 'sucre vanille', 'miel', 'confiture', 'pate a tartiner',
    'nutella', 'chocolat', 'chocolat noir', 'chocolat au lait', 'chocolat patissier', 'cacao', 'chocolat en poudre',
    'cereale', 'muesli', 'flocon d avoine', 'biscuit', 'gateau', 'madeleine', 'brownie', 'cookie', 'gaufre',
    'crepe', 'pain d epice', 'compote', 'fruit au sirop', 'fruit sec', 'raisin sec', 'pruneau', 'datte',
    'bonbon', 'chewing gum', 'barre de cereale', 'cafe', 'cafe moulu', 'capsule', 'dosette', 'the', 'tisane',
    'infusion', 'chicoree', 'sirop d erable', 'levure chimique', 'vanille', 'gousse de vanille', 'arome',
    'pepite de chocolat', 'poudre d amande', 'noix de coco rapee', 'lait concentre', 'creme de marron',
    'gelatine', 'agar agar', 'praline', 'caramel', 'speculoos', 'pain au lait', 'quatre quart',
  ],
  boissons: [
    'eau', 'eau gazeuse', 'eau petillante', 'jus', 'jus d orange', 'jus de pomme', 'nectar', 'soda', 'coca',
    'limonade', 'sirop', 'ice tea', 'the glace', 'biere', 'vin', 'vin rouge', 'vin blanc', 'rose', 'champagne',
    'cidre', 'cremant', 'aperitif', 'pastis', 'whisky', 'rhum', 'vodka', 'gin', 'porto', 'muscat',
    'boisson', 'smoothie', 'lait de poule', 'diabolo', 'orangina', 'schweppes', 'perrier',
  ],
  surgeles: [
    'surgele', 'glace', 'creme glacee', 'sorbet', 'esquimau', 'cone', 'buche glacee', 'frite', 'pizza surgelee',
    'legume surgele', 'poelee', 'epinard surgele', 'haricot vert surgele', 'poisson pane', 'pane',
    'nugget surgele', 'cordon bleu surgele', 'glacon', 'fruit rouge surgele', 'potatoe', 'galette de pomme de terre',
  ],
  hygiene: [
    'papier toilette', 'mouchoir', 'coton', 'coton tige', 'dentifrice', 'brosse a dent', 'fil dentaire',
    'bain de bouche', 'shampoing', 'apres shampoing', 'gel douche', 'savon', 'deodorant', 'rasoir',
    'mousse a raser', 'creme hydratante', 'creme solaire', 'maquillage', 'demaquillant', 'vernis',
    'serviette hygienique', 'tampon', 'protege slip', 'lingette demaquillante', 'pansement', 'paracetamol',
    'doliprane', 'serum physiologique', 'laque', 'gel coiffant', 'elastique', 'lime a ongle', 'parfum',
  ],
  entretien: [
    'liquide vaisselle', 'pastille lave vaisselle', 'tablette lave vaisselle', 'sel lave vaisselle',
    'liquide de rincage', 'lessive', 'adoucissant', 'detachant', 'javel', 'eau de javel', 'nettoyant',
    'produit menager', 'vinaigre blanc', 'bicarbonate', 'savon noir', 'eponge', 'serpilliere', 'balai',
    'sac poubelle', 'poubelle', 'essuie tout', 'sopalin', 'papier aluminium', 'film alimentaire',
    'papier cuisson', 'sac congelation', 'boite', 'ampoule', 'pile', 'allumette', 'bougie', 'desodorisant',
    'anticalcaire', 'gant menage', 'lingette menagere', 'insecticide', 'filtre a cafe', 'sac aspirateur',
  ],
  bebe: [
    'couche', 'lingette', 'lait infantile', 'lait bebe', 'petit pot', 'compote bebe', 'liniment',
    'creme change', 'biberon', 'tetine', 'cereale bebe', 'gourde bebe',
  ],
  animaux: [
    'croquette', 'patee', 'litiere', 'friandise chat', 'friandise chien', 'nourriture chat', 'nourriture chien',
    'graine oiseau', 'os a macher', 'antiparasitaire', 'aliment poisson',
  ],
};

// Index : expression normalisée (mots séparés par une espace) → rayon.
const INDEX = new Map<string, string>();
let longueurMax = 1;
Object.entries(PRODUITS).forEach(([rayon, produits]) => {
  produits.forEach((p) => {
    const cle = motsNormalises(p).join(' ');
    if (!cle) return;
    // Premier rayon déclaré gagnant (évite qu'un doublon ne déplace un
    // produit déjà classé).
    if (!INDEX.has(cle)) INDEX.set(cle, rayon);
    longueurMax = Math.max(longueurMax, cle.split(' ').length);
  });
});

// Mots vides ignorés pour la recherche par mot seul (« de », « à »…).
const MOTS_VIDES = new Set(['de', 'du', 'des', 'la', 'le', 'les', 'un', 'une', 'et', 'a', 'au', 'aux', 'en', 'd', 'l', 'pour', 'avec', 'sans']);

// Rayon devinée par le dictionnaire, ou null si rien ne correspond.
//  1. l'expression la plus longue présente dans le libellé, en partant du
//     début (« lait de coco » avant « lait ») ;
//  2. sinon le premier mot connu (« jus d'orange » → boissons, grâce à
//     « jus »).
export function devinerRayonDictionnaire(libelle: string): string | null {
  const mots = motsNormalises(libelle);
  if (mots.length === 0) return null;
  for (let taille = Math.min(longueurMax, mots.length); taille >= 2; taille--) {
    for (let debut = 0; debut + taille <= mots.length; debut++) {
      const rayon = INDEX.get(mots.slice(debut, debut + taille).join(' '));
      if (rayon) return rayon;
    }
  }
  for (const mot of mots) {
    if (MOTS_VIDES.has(mot)) continue;
    const rayon = INDEX.get(mot);
    if (rayon) return rayon;
  }
  return null;
}

// Nombre de produits du dictionnaire (affiché dans l'aide, testé).
export const TAILLE_DICTIONNAIRE = INDEX.size;

export function nomRayon(rayons: Rayon[], id: string): string {
  return rayons.find((r) => r.id === id)?.nom ?? 'Autres';
}

// Ordre d'affichage des rayons pour une personne : son ordre enregistré
// d'abord, puis les rayons qu'il ne cite pas, dans l'ordre de départ.
export function ordonnerRayons(rayons: Rayon[], ordrePerso: string[] | null): Rayon[] {
  const parDefaut = [...rayons].sort((a, b) => a.ordre - b.ordre);
  if (!ordrePerso || ordrePerso.length === 0) return parDefaut;
  const position = new Map(ordrePerso.map((id, i) => [id, i]));
  return parDefaut
    .map((r, i) => ({ r, cle: position.has(r.id) ? position.get(r.id)! : ordrePerso.length + i }))
    .sort((a, b) => a.cle - b.cle)
    .map((x) => x.r);
}
