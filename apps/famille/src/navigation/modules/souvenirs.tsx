import { creerModule } from '../creerModule';
import { FamilleDonneesProvider } from '../../modules/souvenirs/contexts/FamilleDonneesContext';
import SouvenirsScreen from '../../modules/souvenirs/screens/SouvenirsScreen';
import AlbumsScreen from '../../modules/souvenirs/screens/AlbumsScreen';
import RechercheScreen from '../../modules/souvenirs/screens/RechercheScreen';
import SouvenirScreen from '../../modules/souvenirs/screens/SouvenirScreen';
import SouvenirFormScreen from '../../modules/souvenirs/screens/SouvenirFormScreen';
import MediaScreen from '../../modules/souvenirs/screens/MediaScreen';
import GalerieScreen from '../../modules/souvenirs/screens/GalerieScreen';
import DiaporamaScreen from '../../modules/souvenirs/screens/DiaporamaScreen';
import AnneeScreen from '../../modules/souvenirs/screens/AnneeScreen';
import AlbumScreen from '../../modules/souvenirs/screens/AlbumScreen';
import AlbumFormScreen from '../../modules/souvenirs/screens/AlbumFormScreen';
import AlbumChoixScreen from '../../modules/souvenirs/screens/AlbumChoixScreen';
import DepuisVoyageScreen from '../../modules/souvenirs/screens/DepuisVoyageScreen';

// Module Souvenirs (ancienne app SouvenirsFamille, apps/souvenirs). Les
// photos restent servies par adresses signées (espace privé souvenirs-medias).
export default creerModule({
  id: 'souvenirs',
  enveloppe: FamilleDonneesProvider,
  onglets: [
    { nom: 'Souvenirs', titre: 'Souvenirs', composant: SouvenirsScreen },
    { nom: 'Albums', titre: 'Albums', composant: AlbumsScreen },
    { nom: 'Rechercher', titre: 'Rechercher', composant: RechercheScreen },
  ],
  ecrans: [
    { nom: 'Souvenir', composant: SouvenirScreen, options: { title: 'Souvenir' } },
    { nom: 'SouvenirForm', composant: SouvenirFormScreen, options: { title: 'Nouveau souvenir' } },
    { nom: 'Media', composant: MediaScreen, options: { title: 'Média' } },
    { nom: 'Galerie', composant: GalerieScreen, options: { title: 'Album' } },
    {
      nom: 'Diaporama',
      composant: DiaporamaScreen,
      options: {
        headerShown: false,
        presentation: 'fullScreenModal',
        animation: 'fade',
        contentStyle: { backgroundColor: '#000000' },
        title: 'Photos',
      },
    },
    { nom: 'Annee', composant: AnneeScreen, options: { title: 'Année' } },
    { nom: 'Album', composant: AlbumScreen, options: { title: 'Album' } },
    { nom: 'AlbumForm', composant: AlbumFormScreen, options: { title: 'Nouvel album' } },
    { nom: 'AlbumChoix', composant: AlbumChoixScreen, options: { title: 'Ajouter à l’album' } },
    { nom: 'DepuisVoyage', composant: DepuisVoyageScreen, options: { title: 'Depuis un voyage' } },
  ],
});
