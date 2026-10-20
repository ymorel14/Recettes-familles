import { CommonActions, createNavigationContainerRef } from '@react-navigation/native';
import { infosModule, type IdModule } from '../theme/jetons';

// Référence de la navigation, pour ouvrir un module depuis n'importe où
// (accueil, Agenda, Activité, ⊕, liens entre modules).
export const navigationRef = createNavigationContainerRef<any>();

// Ouvre un module, sur son accueil ou sur un écran précis (noms d'écrans de
// l'ancienne app : 'Liste', 'Voyage', 'DetailRecette'…).
export function ouvrirModule(id: IdModule, ecran?: string, params?: Record<string, any>): void {
  if (!navigationRef.isReady()) return;
  const route = infosModule(id).route;
  if (!ecran) {
    navigationRef.dispatch(CommonActions.navigate({ name: route, params: { screen: 'Onglets' } }));
    return;
  }
  navigationRef.dispatch(
    CommonActions.navigate({ name: route, params: { screen: ecran, params, initial: false } })
  );
}

// Ouvre un onglet du haut d'un module (ex. Quotidien › Tâches).
export function ouvrirOngletModule(id: IdModule, onglet: string): void {
  if (!navigationRef.isReady()) return;
  navigationRef.dispatch(
    CommonActions.navigate({ name: infosModule(id).route, params: { screen: 'Onglets', params: { screen: onglet } } })
  );
}

// Chemin interne d'une notification (« courses/liste/<id> », « voyages/voyage/<id> »…)
// → écran à ouvrir.
export function ouvrirCible(cible: string): void {
  const [module, ...reste] = cible.replace(/^\//, '').split('/');
  const id = (
    { cuisine: 'recettes', recettes: 'recettes', courses: 'courses', quotidien: 'quotidien', cadeaux: 'cadeaux', voyages: 'voyages', voyage: 'voyages', souvenirs: 'souvenirs' } as Record<string, IdModule>
  )[module];
  if (!id) return;
  const [type, ident, sous] = reste;
  if (id === 'voyages' && type === 'voyage' && ident) {
    const sousEcrans: Record<string, string> = {
      dates: 'Dates',
      hebergement: 'Hebergements',
      transport: 'Transport',
      activites: 'Activites',
      programme: 'Programme',
      budget: 'Budget',
      menu: 'Menu',
      cadeaux: 'ListesCadeaux',
      surprise: 'Surprise',
    };
    return ouvrirModule('voyages', (sous && sousEcrans[sous]) || 'Voyage', { voyageId: ident });
  }
  if (id === 'courses' && type === 'liste' && ident) return ouvrirModule('courses', 'Liste', { listeId: ident });
  if (id === 'cadeaux' && type === 'liste' && ident) return ouvrirModule('cadeaux', 'Liste', { listeId: ident });
  if (id === 'recettes' && type === 'recette' && ident) return ouvrirModule('recettes', 'DetailRecette', { recetteId: ident });
  if (id === 'souvenirs' && type === 'souvenir' && ident) return ouvrirModule('souvenirs', 'Souvenir', { id: ident });
  if (id === 'quotidien' && type === 'groupe' && ident) return ouvrirModule('quotidien', 'Groupe', { id: ident });
  if (id === 'quotidien' && type === 'taches') return ouvrirOngletModule('quotidien', 'Taches');
  if (id === 'quotidien' && type === 'trajets') return ouvrirOngletModule('quotidien', 'Trajets');
  ouvrirModule(id);
}
