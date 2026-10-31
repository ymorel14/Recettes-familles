import { creerModule } from '../creerModule';
import CategoriesScreen from '../../modules/recettes/screens/CategoriesScreen';
import RecettesCategorieScreen from '../../modules/recettes/screens/recettes/RecettesCategorieScreen';
import RecetteDetailScreen from '../../modules/recettes/screens/recettes/RecetteDetailScreen';
import EssaiFormScreen from '../../modules/recettes/screens/recettes/EssaiFormScreen';
import RecetteFormScreen from '../../modules/recettes/screens/recettes/RecetteFormScreen';
import ScanRecetteScreen from '../../modules/recettes/screens/recettes/ScanRecetteScreen';
import ImportWebScreen from '../../modules/recettes/screens/recettes/ImportWebScreen';
import ImportMyRecipeBoxScreen from '../../modules/recettes/screens/recettes/ImportMyRecipeBoxScreen';
import ClassementRecettesScreen from '../../modules/recettes/screens/recettes/ClassementRecettesScreen';
import ListeDeCoursesScreen from '../../modules/recettes/screens/ListeDeCoursesScreen';
import SelectionRecettesScreen from '../../modules/recettes/screens/courses/SelectionRecettesScreen';
import DeroulementAssistantScreen from '../../modules/recettes/screens/assistant/DeroulementAssistantScreen';
import AideMemoireScreen from '../../modules/recettes/screens/aideMemoire/AideMemoireScreen';
import NoteUtileFormScreen from '../../modules/recettes/screens/aideMemoire/NoteUtileFormScreen';
import CongelateurScreen from '../../modules/recettes/screens/congelateur/CongelateurScreen';
import AlimentCongeleFormScreen from '../../modules/recettes/screens/congelateur/AlimentCongeleFormScreen';
import GestionCongelateursScreen from '../../modules/recettes/screens/congelateur/GestionCongelateursScreen';

// Module Recettes (ancienne app « Recettes familiales », dossier apps/cuisine).
// Plus d'onglet « Assistant » (retour de test A-1) : les recettes en cours se
// reprennent par le bandeau « Reprendre » (onglet Recettes, accueil), et on
// lance une recette par « Commencer à cuisiner » sur sa fiche.
export default creerModule({
  id: 'recettes',
  actions: [{ libelle: 'Courses', icone: 'cart-outline', onPress: (n) => n.navigate('ListeDeCourses') }],
  onglets: [
    { nom: 'Recettes', titre: 'Recettes', composant: CategoriesScreen },
    { nom: 'Congelateur', titre: 'Garde-manger', composant: CongelateurScreen },
    { nom: 'AideMemoire', titre: 'Aide-mémoire', composant: AideMemoireScreen },
  ],
  ecrans: [
    {
      nom: 'RecettesCategorie',
      composant: RecettesCategorieScreen,
      options: ({ route }) => ({ title: route.params?.categorieNom ?? 'Recettes' }),
    },
    { nom: 'DetailRecette', composant: RecetteDetailScreen, options: { title: '' } },
    {
      nom: 'EssaiRecette',
      composant: EssaiFormScreen,
      options: ({ route }) => ({ title: route.params?.essaiId ? 'Mon essai' : 'Raconter mon essai' }),
    },
    {
      nom: 'CreationRecette',
      composant: RecetteFormScreen,
      options: ({ route }) => ({ title: route.params?.recetteId ? 'Modifier la recette' : 'Nouvelle recette' }),
    },
    { nom: 'ScanRecette', composant: ScanRecetteScreen, options: { title: 'Scanner une recette' } },
    { nom: 'ImportWeb', composant: ImportWebScreen, options: { title: 'Importer depuis le web' } },
    { nom: 'ImportMyRecipeBox', composant: ImportMyRecipeBoxScreen, options: { title: 'Importer My Recipe Box' } },
    { nom: 'ClassementRecettes', composant: ClassementRecettesScreen, options: { title: 'Classer les recettes' } },
    { nom: 'ListeDeCourses', composant: ListeDeCoursesScreen, options: { title: 'Liste de courses' } },
    { nom: 'SelectionRecettes', composant: SelectionRecettesScreen, options: { title: 'Ajouter des recettes' } },
    { nom: 'AssistantRecette', composant: DeroulementAssistantScreen, options: { title: 'Mode assistant' } },
    {
      nom: 'FormulaireAlimentCongele',
      composant: AlimentCongeleFormScreen,
      options: ({ route }) => ({ title: route.params?.alimentId ? "Modifier l'aliment" : 'Ajouter au congélateur' }),
    },
    { nom: 'GestionCongelateurs', composant: GestionCongelateursScreen, options: { title: 'Emplacements' } },
    {
      nom: 'FormulaireNoteUtile',
      composant: NoteUtileFormScreen,
      options: ({ route }) => ({ title: route.params?.noteId ? 'Modifier la fiche' : 'Nouvelle fiche' }),
    },
  ],
});
