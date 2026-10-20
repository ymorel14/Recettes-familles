import { creerModule } from '../creerModule';
import AujourdhuiScreen from '../../modules/quotidien/screens/AujourdhuiScreen';
import TrajetsScreen from '../../modules/quotidien/screens/TrajetsScreen';
import TachesScreen from '../../modules/quotidien/screens/TachesScreen';
import ArgentPocheScreen from '../../modules/quotidien/screens/ArgentPocheScreen';
import GroupeScreen from '../../modules/quotidien/screens/GroupeScreen';
import GroupeFormScreen from '../../modules/quotidien/screens/GroupeFormScreen';
import ActiviteFormScreen from '../../modules/quotidien/screens/ActiviteFormScreen';
import TacheFormScreen from '../../modules/quotidien/screens/TacheFormScreen';
import DomainesScreen from '../../modules/quotidien/screens/DomainesScreen';
import TirelireScreen from '../../modules/quotidien/screens/TirelireScreen';
import InventairesScreen from '../../modules/quotidien/screens/InventairesScreen';
import InventaireScreen from '../../modules/quotidien/screens/InventaireScreen';
import InventaireFormScreen from '../../modules/quotidien/screens/InventaireFormScreen';
import ObjetScreen from '../../modules/quotidien/screens/ObjetScreen';
import ObjetFormScreen from '../../modules/quotidien/screens/ObjetFormScreen';
import RangementsScreen from '../../modules/quotidien/screens/RangementsScreen';
import RangementScreen from '../../modules/quotidien/screens/RangementScreen';
import RangementFormScreen from '../../modules/quotidien/screens/RangementFormScreen';
import ImportPlanning from '../../ecrans/ImportPlanning';

// Module Quotidien (ancienne app apps/quotidien).
export default creerModule({
  id: 'quotidien',
  onglets: [
    { nom: 'Aujourdhui', titre: 'Aujourd’hui', composant: AujourdhuiScreen },
    { nom: 'Trajets', titre: 'Trajets', composant: TrajetsScreen },
    { nom: 'Taches', titre: 'Tâches', composant: TachesScreen },
    { nom: 'ArgentPoche', titre: 'Argent de poche', composant: ArgentPocheScreen },
    { nom: 'Inventaires', titre: 'Inventaires', composant: InventairesScreen },
  ],
  ecrans: [
    { nom: 'Groupe', composant: GroupeScreen, options: { title: 'Groupe' } },
    { nom: 'GroupeForm', composant: GroupeFormScreen, options: { title: 'Créer ou rejoindre un groupe' } },
    { nom: 'ActiviteForm', composant: ActiviteFormScreen, options: { title: 'Nouvelle activité' } },
    { nom: 'ImportPlanning', composant: ImportPlanning, options: { title: 'Importer un planning' } },
    { nom: 'TacheForm', composant: TacheFormScreen, options: { title: 'Tâche' } },
    { nom: 'Domaines', composant: DomainesScreen, options: { title: 'Domaines des tâches' } },
    { nom: 'Tirelire', composant: TirelireScreen, options: { title: 'Tirelire' } },
    { nom: 'Inventaire', composant: InventaireScreen, options: { title: 'Inventaire' } },
    { nom: 'InventaireForm', composant: InventaireFormScreen, options: { title: 'Inventaire' } },
    { nom: 'Objet', composant: ObjetScreen, options: { title: 'Objet' } },
    { nom: 'ObjetForm', composant: ObjetFormScreen, options: { title: 'Objet' } },
    { nom: 'Rangements', composant: RangementsScreen, options: { title: 'Lieux et contenants' } },
    { nom: 'Rangement', composant: RangementScreen, options: { title: 'Rangement' } },
    { nom: 'RangementForm', composant: RangementFormScreen, options: { title: 'Rangement' } },
  ],
});
