import { creerModule } from '../creerModule';
import ListesScreen from '../../modules/courses/screens/ListesScreen';
import HabituelsScreen from '../../modules/courses/screens/HabituelsScreen';
import ProduitScreen from '../../modules/courses/screens/ProduitScreen';
import ListeScreen from '../../modules/courses/screens/ListeScreen';
import ArticleScreen from '../../modules/courses/screens/ArticleScreen';
import ListeFormScreen from '../../modules/courses/screens/ListeFormScreen';
import MagasinScreen from '../../modules/courses/screens/MagasinScreen';
import ChecklistScreen from '../../modules/courses/screens/ChecklistScreen';
import VerificationScreen from '../../modules/courses/screens/VerificationScreen';
import HistoriqueScreen from '../../modules/courses/screens/HistoriqueScreen';

// Module Courses (ancienne app apps/courses).
export default creerModule({
  id: 'courses',
  onglets: [
    { nom: 'Listes', titre: 'Mes listes', composant: ListesScreen },
    { nom: 'Habituels', titre: 'Habituels', composant: HabituelsScreen },
  ],
  ecrans: [
    { nom: 'Liste', composant: ListeScreen, options: { title: 'Liste' } },
    { nom: 'Article', composant: ArticleScreen, options: { title: 'Article' } },
    { nom: 'ListeForm', composant: ListeFormScreen, options: { title: 'Liste' } },
    { nom: 'Magasin', composant: MagasinScreen, options: { title: 'Je suis au magasin' } },
    { nom: 'Preparer', composant: VerificationScreen, options: { title: 'À la maison' } },
    { nom: 'Historique', composant: HistoriqueScreen, options: { title: 'Historique' } },
    { nom: 'Checklist', composant: ChecklistScreen, options: { title: 'Checklist du foyer' } },
    { nom: 'Produit', composant: ProduitScreen, options: { title: 'Produit' } },
  ],
});
