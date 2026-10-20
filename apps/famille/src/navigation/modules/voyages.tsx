import { creerModule } from '../creerModule';
import VoyagesScreen from '../../modules/voyages/screens/VoyagesScreen';
import CalendrierScreen from '../../modules/voyages/screens/CalendrierScreen';
import NouveauVoyageScreen from '../../modules/voyages/screens/NouveauVoyageScreen';
import VoyageScreen from '../../modules/voyages/screens/VoyageScreen';
import DisponibiliteScreen from '../../modules/voyages/screens/DisponibiliteScreen';
import DatesScreen from '../../modules/voyages/screens/DatesScreen';
import HebergementsScreen from '../../modules/voyages/screens/HebergementsScreen';
import HebergementFormScreen from '../../modules/voyages/screens/HebergementFormScreen';
import BudgetScreen from '../../modules/voyages/screens/BudgetScreen';
import PosteFormScreen from '../../modules/voyages/screens/PosteFormScreen';
import TransportScreen from '../../modules/voyages/screens/TransportScreen';
import TrajetFormScreen from '../../modules/voyages/screens/TrajetFormScreen';
import OptionTrajetFormScreen from '../../modules/voyages/screens/OptionTrajetFormScreen';
import ActivitesScreen from '../../modules/voyages/screens/ActivitesScreen';
import ActiviteFormScreen from '../../modules/voyages/screens/ActiviteFormScreen';
import VehiculeFormScreen from '../../modules/voyages/screens/VehiculeFormScreen';
import NotificationsScreen from '../../modules/voyages/screens/NotificationsScreen';
import ProgrammeScreen from '../../modules/voyages/screens/ProgrammeScreen';
import MenuScreen from '../../modules/voyages/screens/MenuScreen';
import RepasScreen from '../../modules/voyages/screens/RepasScreen';
import RepasFormScreen from '../../modules/voyages/screens/RepasFormScreen';
import PlatFormScreen from '../../modules/voyages/screens/PlatFormScreen';
import ListesCadeauxScreen from '../../modules/voyages/screens/ListesCadeauxScreen';
import SurpriseScreen from '../../modules/voyages/screens/SurpriseScreen';

// Module Voyages (ancienne app VoyageCommun, apps/voyage). Qui voit un voyage
// privé ou surprise reste garanti par les règles RLS du schéma voyage.
export default creerModule({
  id: 'voyages',
  onglets: [
    { nom: 'Voyages', titre: 'Voyages & repas', composant: VoyagesScreen },
    { nom: 'Calendrier', titre: 'Calendrier', composant: CalendrierScreen },
  ],
  ecrans: [
    { nom: 'NouveauVoyage', composant: NouveauVoyageScreen, options: { title: 'Proposer' } },
    { nom: 'Voyage', composant: VoyageScreen, options: { title: 'Voyage' } },
    { nom: 'Disponibilite', composant: DisponibiliteScreen, options: { title: 'Période' } },
    { nom: 'Dates', composant: DatesScreen, options: { title: 'Dates' } },
    { nom: 'Hebergements', composant: HebergementsScreen, options: { title: 'Hébergement' } },
    { nom: 'Hebergement', composant: HebergementFormScreen, options: { title: 'Hébergement' } },
    { nom: 'Budget', composant: BudgetScreen, options: { title: 'Budget' } },
    { nom: 'Poste', composant: PosteFormScreen, options: { title: 'Dépense' } },
    { nom: 'Transport', composant: TransportScreen, options: { title: 'Transport' } },
    { nom: 'Trajet', composant: TrajetFormScreen, options: { title: 'Trajet' } },
    { nom: 'OptionTrajet', composant: OptionTrajetFormScreen, options: { title: 'Une façon d’y aller' } },
    { nom: 'Activites', composant: ActivitesScreen, options: { title: 'Activités' } },
    { nom: 'Activite', composant: ActiviteFormScreen, options: { title: 'Activité' } },
    { nom: 'Vehicule', composant: VehiculeFormScreen, options: { title: 'Véhicule' } },
    { nom: 'Notifications', composant: NotificationsScreen, options: { title: 'Nouveautés des voyages' } },
    { nom: 'Programme', composant: ProgrammeScreen, options: { title: 'Programme' } },
    { nom: 'Menu', composant: MenuScreen, options: { title: 'Menu' } },
    { nom: 'Repas', composant: RepasScreen, options: { title: 'Repas' } },
    { nom: 'RepasForm', composant: RepasFormScreen, options: { title: 'Repas' } },
    { nom: 'Plat', composant: PlatFormScreen, options: { title: 'Plat' } },
    { nom: 'ListesCadeaux', composant: ListesCadeauxScreen, options: { title: 'Listes de cadeaux' } },
    { nom: 'Surprise', composant: SurpriseScreen, options: { title: 'Surprise' } },
  ],
});
