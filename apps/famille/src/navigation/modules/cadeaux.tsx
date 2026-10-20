import { creerModule } from '../creerModule';
import FamilleScreen from '../../modules/cadeaux/screens/FamilleScreen';
import AOffrirScreen from '../../modules/cadeaux/screens/AOffrirScreen';
import MesEnviesScreen from '../../modules/cadeaux/screens/MesEnviesScreen';
import ListeScreen from '../../modules/cadeaux/screens/ListeScreen';
import ListeCommuneFormScreen from '../../modules/cadeaux/screens/ListeCommuneFormScreen';
import SouhaitFormScreen from '../../modules/cadeaux/screens/SouhaitFormScreen';
import ParticipationScreen from '../../modules/cadeaux/screens/ParticipationScreen';

// Module Cadeaux (ancienne app CadeauCommun, apps/cadeaucommun). La surprise
// reste garantie par les règles RLS du schéma wishlist.
export default creerModule({
  id: 'cadeaux',
  onglets: [
    { nom: 'Famille', titre: 'Les listes', composant: FamilleScreen },
    { nom: 'AOffrir', titre: 'À offrir', composant: AOffrirScreen },
    { nom: 'MesEnvies', titre: 'Mes envies', composant: MesEnviesScreen },
  ],
  ecrans: [
    { nom: 'Liste', composant: ListeScreen, options: { title: 'Liste de souhaits' } },
    { nom: 'ListeCommune', composant: ListeCommuneFormScreen, options: { title: 'Liste commune' } },
    { nom: 'Souhait', composant: SouhaitFormScreen, options: { title: 'Souhait' } },
    { nom: 'Participation', composant: ParticipationScreen, options: { title: 'Pot commun' } },
  ],
});
