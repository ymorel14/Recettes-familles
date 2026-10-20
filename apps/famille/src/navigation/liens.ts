import { getPathFromState, getStateFromPath, type LinkingOptions } from '@react-navigation/native';
import { Platform } from 'react-native';
import { BASE_WEB } from '../services/supabase';

// Adresses web (spécification § 2.3) : mêmes chemins que le site commun
// actuel, sous le chemin de l'app (/famille) : /famille/courses/liste/12,
// /famille/voyages/voyage/8… Recharger une page ou partager un lien rouvre le
// bon écran. Sans effet sur téléphone.

// Les paramètres qui ne sont pas de simples valeurs (fiches en cours de
// modification) ne vont pas dans l'adresse.
function paramsSimples(etat: any): any {
  if (!etat?.routes) return etat;
  return {
    ...etat,
    routes: etat.routes.map((r: any) => ({
      ...r,
      params: r.params
        ? Object.fromEntries(Object.entries(r.params).filter(([, v]) => v === null || typeof v !== 'object'))
        : r.params,
      state: r.state ? paramsSimples(r.state) : r.state,
    })),
  };
}

function sansBase(chemin: string): string {
  if (!BASE_WEB || !chemin.startsWith(BASE_WEB)) return chemin;
  const reste = chemin.slice(BASE_WEB.length);
  return reste.startsWith('/') ? reste : `/${reste}`;
}

const versBooleen = (v: string) => v === 'true';

export const liens: LinkingOptions<any> = {
  enabled: Platform.OS === 'web',
  prefixes: ['famille://'],
  getStateFromPath: (chemin, options) => getStateFromPath(sansBase(chemin), options),
  getPathFromState: (etat, options) => `${BASE_WEB}${getPathFromState(paramsSimples(etat), options)}`,
  config: <any>{
    screens: {
      Connexion: 'connexion',
      Bienvenue: 'bienvenue',
      Principal: {
        initialRouteName: 'Accueil',
        screens: {
          Accueil: '',
          Agenda: 'agenda',
          Activite: 'activite',
          Moi: { initialRouteName: 'MoiAccueil', screens: { MoiAccueil: 'moi', MotDePasse: 'moi/mot-de-passe' } },
          Recettes: {
            path: 'cuisine',
            initialRouteName: 'Onglets',
            screens: {
              Onglets: {
                path: '',
                screens: { Recettes: '', Congelateur: 'congelateur', Assistant: 'assistant', AideMemoire: 'aide-memoire' },
              },
              RecettesCategorie: 'categorie/:categorieId',
              DetailRecette: 'recette/:recetteId',
              EssaiRecette: { path: 'recette/:recetteId/essai', parse: { depuisAssistant: versBooleen } },
              CreationRecette: 'recette-edition',
              ScanRecette: 'scanner',
              ImportWeb: 'importer',
              ListeDeCourses: 'liste-de-courses',
              SelectionRecettes: 'ajouter-aux-courses',
              AssistantRecette: { path: 'assistant/:recetteId', parse: { sousRecette: versBooleen } },
              FormulaireNoteUtile: 'aide-memoire/fiche',
              FormulaireAlimentCongele: 'congelateur/aliment',
              GestionCongelateurs: 'congelateur/gerer',
            },
          },
          Courses: {
            path: 'courses',
            initialRouteName: 'Onglets',
            screens: {
              Onglets: { path: '', screens: { Listes: '', Habituels: 'habituels' } },
              Liste: 'liste/:listeId',
              ListeForm: 'nouvelle-liste',
              Article: 'liste/:listeId/article/:articleId',
              Magasin: 'liste/:listeId/magasin',
              Preparer: 'liste/:listeId/preparer',
              Historique: 'liste/:listeId/historique',
              Checklist: 'checklist',
              Produit: 'habituels/:cle',
            },
          },
          Quotidien: {
            path: 'quotidien',
            initialRouteName: 'Onglets',
            screens: {
              Onglets: {
                path: '',
                screens: { Aujourdhui: '', Trajets: 'trajets', Taches: 'taches', ArgentPoche: 'argent-de-poche', Inventaires: 'inventaires' },
              },
              Groupe: 'groupe/:id',
              GroupeForm: 'groupe-nouveau',
              ActiviteForm: 'activite',
              ImportPlanning: 'importer-planning',
              TacheForm: 'tache',
              Domaines: 'domaines',
              Tirelire: 'tirelire/:personneId',
              Inventaire: 'inventaire/:id',
              Objet: 'objet/:id',
              Rangements: 'rangements',
              Rangement: 'rangement/:type/:id',
            },
          },
          Cadeaux: {
            path: 'cadeaux',
            initialRouteName: 'Onglets',
            screens: {
              Onglets: { path: '', screens: { Famille: '', AOffrir: 'a-offrir', MesEnvies: 'mes-envies' } },
              Liste: 'liste/:listeId',
              ListeCommune: 'liste-commune',
              Souhait: 'souhait',
              Participation: 'pot-commun',
              ImportLettre: 'lettre-pere-noel',
            },
          },
          Voyages: {
            path: 'voyages',
            initialRouteName: 'Onglets',
            screens: {
              Onglets: { path: '', screens: { Voyages: '', Calendrier: 'calendrier' } },
              NouveauVoyage: 'proposer',
              Voyage: 'voyage/:voyageId',
              Dates: 'voyage/:voyageId/dates',
              Hebergements: 'voyage/:voyageId/hebergement',
              Transport: 'voyage/:voyageId/transport',
              Activites: 'voyage/:voyageId/activites',
              Programme: 'voyage/:voyageId/programme',
              Budget: 'voyage/:voyageId/budget',
              Menu: 'voyage/:voyageId/menu',
              Repas: 'voyage/:voyageId/repas/:repasId',
              ListesCadeaux: 'voyage/:voyageId/cadeaux',
              Surprise: 'voyage/:voyageId/surprise',
              Notifications: 'nouveautes',
            },
          },
          Souvenirs: {
            path: 'souvenirs',
            initialRouteName: 'Onglets',
            screens: {
              Onglets: { path: '', screens: { Souvenirs: '', Albums: 'albums', Rechercher: 'rechercher' } },
              Souvenir: 'souvenir/:id',
              SouvenirForm: 'nouveau',
              Album: 'album/:id',
            },
          },
        },
      },
    },
  },
};
