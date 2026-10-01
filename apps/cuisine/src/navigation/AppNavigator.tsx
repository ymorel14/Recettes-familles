import React, { useRef } from 'react';
import {
  NavigationContainer,
  DarkTheme,
  DefaultTheme,
  Theme as NavTheme,
  LinkingOptions,
  getStateFromPath,
  getPathFromState,
} from '@react-navigation/native';
import { baseWeb } from '@apps-famille/famille';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ActivityIndicator, View, Text, Pressable } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { theme, themeActuel, EST_WEB } from '../theme/theme';
import { useAuth } from '../contexts/AuthContext';
import { usePreferences } from '../contexts/PreferencesContext';
import EnTeteFamille from '../components/EnTeteFamille';

import AuthScreen from '../screens/auth/AuthScreen';
import BienvenueScreen from '../screens/foyer/BienvenueScreen';
import FoyerScreen from '../screens/foyer/FoyerScreen';
import ProfilScreen from '../screens/foyer/ProfilScreen';
import ChangerMotDePasseScreen from '../screens/foyer/ChangerMotDePasseScreen';
import CategoriesScreen from '../screens/CategoriesScreen';
import RecettesCategorieScreen from '../screens/recettes/RecettesCategorieScreen';
import RecetteDetailScreen from '../screens/recettes/RecetteDetailScreen';
import EssaiFormScreen from '../screens/recettes/EssaiFormScreen';
import RecetteFormScreen from '../screens/recettes/RecetteFormScreen';
import ScanRecetteScreen from '../screens/recettes/ScanRecetteScreen';
import ImportWebScreen from '../screens/recettes/ImportWebScreen';
import ListeDeCoursesScreen from '../screens/ListeDeCoursesScreen';
import SelectionRecettesScreen from '../screens/courses/SelectionRecettesScreen';
import ChoixRecetteAssistantScreen from '../screens/assistant/ChoixRecetteAssistantScreen';
import DeroulementAssistantScreen from '../screens/assistant/DeroulementAssistantScreen';
import AideMemoireScreen from '../screens/aideMemoire/AideMemoireScreen';
import NoteUtileFormScreen from '../screens/aideMemoire/NoteUtileFormScreen';
import CongelateurScreen from '../screens/congelateur/CongelateurScreen';
import AlimentCongeleFormScreen from '../screens/congelateur/AlimentCongeleFormScreen';
import GestionCongelateursScreen from '../screens/congelateur/GestionCongelateursScreen';

const Tab = createBottomTabNavigator();
const RootStack = createNativeStackNavigator();

// Thème de navigation aligné sur le thème de couleurs choisi (cahier des
// charges §14). Calculé au rendu (et non une fois pour toutes) pour suivre
// les changements de thème.
function creerThemeNavigation(): NavTheme {
  const base = themeActuel().sombre ? DarkTheme : DefaultTheme;
  return {
    ...base,
    colors: {
      ...base.colors,
      background: theme.colors.background,
      card: theme.colors.surface,
      text: theme.colors.text,
      border: theme.colors.border,
      primary: theme.colors.accent,
    },
  };
}

// Version web : chaque écran a sa propre adresse (URL), ce qui branche la
// navigation sur l'historique du navigateur — bouton « retour » du navigateur,
// liens partageables, rechargement de la page sans revenir à l'accueil.
// Sans effet sur téléphone (enabled: EST_WEB).
//
// Les paramètres complexes (objets, listes) restent en mémoire mais ne sont
// pas mis dans l'adresse : `stringify` renvoie 'undefined', valeur que React
// Navigation retire de l'URL. Après un rechargement de page, ces écrans
// repartent donc de leur état par défaut (formulaire vide, quantités d'origine).
const sansURL = () => 'undefined';
const versBooleen = (valeur: string) => valeur === 'true';

// Sur le site web commun, l'app vit sous /cuisine (voir baseWeb) : ce
// préfixe est retiré de l'adresse avant de chercher l'écran, et remis
// devant l'adresse de chaque écran.
function sansBase(chemin: string): string {
  const base = baseWeb();
  if (!base || !chemin.startsWith(base)) return chemin;
  const reste = chemin.slice(base.length);
  return reste.startsWith('/') ? reste : `/${reste}`;
}

const liens: LinkingOptions<any> = {
  enabled: EST_WEB,
  prefixes: [],
  getStateFromPath: (chemin, options) => getStateFromPath(sansBase(chemin), options),
  getPathFromState: (etat, options) => `${baseWeb()}${getPathFromState(etat, options)}`,
  config: {
    // Un lien direct vers une recette (ou un rechargement de page) place
    // toujours les onglets en dessous : la flèche « retour » de l'en-tête
    // reste disponible.
    initialRouteName: 'Onglets',
    screens: {
      Connexion: 'connexion',
      Bienvenue: 'bienvenue',
      Foyer: 'foyer',
      Onglets: {
        screens: {
          Recettes: '',
          Courses: 'courses',
          Congelateur: 'congelateur',
          Assistant: 'assistant',
          AideMemoire: 'aide-memoire',
          Profil: 'profil',
        },
      },
      RecettesCategorie: 'categorie/:categorieId',
      DetailRecette: 'recette/:recetteId',
      EssaiRecette: {
        path: 'recette/:recetteId/essai',
        parse: { depuisAssistant: versBooleen },
      },
      CreationRecette: {
        path: 'recette-edition',
        stringify: { formulaireInitial: sansURL },
      },
      ScanRecette: 'scanner',
      ImportWeb: 'importer',
      SelectionRecettes: {
        path: 'courses/ajouter',
        stringify: { preselection: sansURL },
      },
      AssistantRecette: {
        path: 'assistant/:recetteId',
        parse: { sousRecette: versBooleen },
        stringify: { ajustement: sansURL },
      },
      ChangerMotDePasse: 'profil/mot-de-passe',
      FormulaireNoteUtile: 'aide-memoire/fiche',
      FormulaireAlimentCongele: 'congelateur/aliment',
      GestionCongelateurs: 'congelateur/gerer',
    },
  },
};

const optionsEcran = () => ({
  headerStyle: { backgroundColor: theme.colors.surface },
  headerTitleStyle: { fontFamily: theme.fontTitle, color: theme.colors.accent },
  headerTintColor: theme.colors.accent,
  // En-tête centré : libellé manuscrit "Famille … · Foyer" au-dessus du
  // titre de l'écran (voir components/EnTeteFamille.tsx). Le titre propre à
  // chaque écran (option `title`) arrive dans `children`.
  headerTitleAlign: 'center' as const,
  headerTitle: ({ children }: { children: string }) => <EnTeteFamille titre={children} />,
});

// Pour les écrans qui affichent déjà leur titre dans leur contenu : pas de
// titre répété dans l'en-tête, seulement le libellé manuscrit (centré).
// (L'option `title` reste renseignée : elle sert au libellé de l'onglet.)
const enTeteSansTitre = {
  headerTitle: () => <EnTeteFamille />,
};

// Icônes de la barre d'onglets (jeu Ionicons, fourni par @expo/vector-icons) :
// version pleine pour l'onglet actif, version contour pour les autres.
type NomIcone = keyof typeof Ionicons.glyphMap;
const ICONES_ONGLETS: Record<string, { actif: NomIcone; inactif: NomIcone }> = {
  Recettes: { actif: 'book', inactif: 'book-outline' },
  Courses: { actif: 'basket', inactif: 'basket-outline' },
  Congelateur: { actif: 'snow', inactif: 'snow-outline' },
  Assistant: { actif: 'restaurant', inactif: 'restaurant-outline' },
  AideMemoire: { actif: 'bookmarks', inactif: 'bookmarks-outline' },
  Profil: { actif: 'person-circle', inactif: 'person-circle-outline' },
};

function Onglets() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        ...optionsEcran(),
        tabBarStyle: { backgroundColor: theme.colors.surface, borderTopColor: theme.colors.border },
        tabBarActiveTintColor: theme.colors.accent,
        tabBarInactiveTintColor: theme.colors.textMuted,
        // 6 onglets : libellés un peu plus petits pour tenir sans être coupés.
        tabBarLabelStyle: { fontFamily: theme.fontBody, fontSize: 11 },
        tabBarItemStyle: { paddingHorizontal: 0 },
        tabBarIcon: ({ focused, color, size }) => {
          const icone = ICONES_ONGLETS[route.name];
          return icone ? <Ionicons name={focused ? icone.actif : icone.inactif} size={size} color={color} /> : null;
        },
        // Cache la barre d'onglets quand le clavier est ouvert (plus de place
        // pour le champ en cours de saisie).
        tabBarHideOnKeyboard: true,
      })}
    >
      <Tab.Screen name="Recettes" component={CategoriesScreen} options={{ title: 'Recettes', ...enTeteSansTitre }} />
      {/* Libellé d'onglet court : « Liste de courses » ne tient pas à 5 onglets. */}
      <Tab.Screen
        name="Courses"
        component={ListeDeCoursesScreen}
        options={{ title: 'Liste de courses', tabBarLabel: 'Courses', ...enTeteSansTitre }}
      />
      <Tab.Screen
        name="Congelateur"
        component={CongelateurScreen}
        options={{ title: 'Congélateur', ...enTeteSansTitre }}
      />
      <Tab.Screen name="Assistant" component={ChoixRecetteAssistantScreen} options={{ title: 'Assistant', ...enTeteSansTitre }} />
      <Tab.Screen name="AideMemoire" component={AideMemoireScreen} options={{ title: 'Aide-mémoire', ...enTeteSansTitre }} />
      <Tab.Screen name="Profil" component={ProfilScreen} options={{ title: 'Profil' }} />
    </Tab.Navigator>
  );
}

export default function AppNavigator() {
  const { session, chargement, famille, foyer, chargementFoyer, erreurFoyer, rafraichirFoyer, deconnexion } =
    useAuth();
  const { themeId } = usePreferences();
  // Écran en cours, mémorisé pour y revenir quand un changement de thème
  // redessine toute la navigation (clé `themeId` ci-dessous).
  const etatNavigation = useRef<any>(undefined);

  if (chargement || (session && chargementFoyer)) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.background, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={theme.colors.accent} />
      </View>
    );
  }

  // Famille/foyer impossibles à charger : on propose de réessayer plutôt que
  // d'afficher à tort l'écran de bienvenue ou de création du foyer.
  if (session && erreurFoyer && !foyer) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: theme.colors.background,
          alignItems: 'center',
          justifyContent: 'center',
          padding: theme.spacing.lg,
          gap: theme.spacing.md,
        }}
      >
        <Text style={{ fontFamily: theme.fontTitle, fontSize: 22, color: theme.colors.accent, textAlign: 'center' }}>
          Connexion interrompue
        </Text>
        <Text style={{ fontFamily: theme.fontBody, fontSize: 15, color: theme.colors.textMuted, textAlign: 'center' }}>
          Impossible de charger votre foyer pour le moment. Vérifiez votre connexion internet puis réessayez.
        </Text>
        <Pressable
          onPress={() => rafraichirFoyer()}
          style={{
            backgroundColor: theme.colors.accent,
            borderRadius: theme.radii.md,
            paddingVertical: theme.spacing.md,
            paddingHorizontal: theme.spacing.xl,
          }}
        >
          <Text style={{ fontFamily: theme.fontBodyBold, fontSize: 16, color: theme.colors.background }}>Réessayer</Text>
        </Pressable>
        <Pressable onPress={deconnexion}>
          <Text style={{ fontFamily: theme.fontBody, color: theme.colors.textMuted, textDecorationLine: 'underline' }}>
            Se déconnecter
          </Text>
        </Pressable>
      </View>
    );
  }

  return (
    <NavigationContainer
      key={themeId}
      theme={creerThemeNavigation()}
      linking={liens}
      documentTitle={{
        formatter: (options, route) =>
          `${options?.title ?? route?.name ?? ''} · Recettes familiales`.replace(/^ · /, ''),
      }}
      initialState={etatNavigation.current}
      onStateChange={(etat) => {
        etatNavigation.current = etat;
      }}
    >
      <RootStack.Navigator screenOptions={optionsEcran()}>
        {!session ? (
          <RootStack.Screen name="Connexion" component={AuthScreen} options={{ headerShown: false }} />
        ) : !famille ? (
          // Première connexion : code d'invitation ou création de la famille.
          <RootStack.Screen name="Bienvenue" component={BienvenueScreen} options={{ headerShown: false }} />
        ) : !foyer ? (
          // Membre d'une famille, sans foyer : création du foyer (ou code foyer).
          <RootStack.Screen name="Foyer" component={FoyerScreen} options={{ headerShown: false }} />
        ) : (
          <>
            <RootStack.Screen name="Onglets" component={Onglets} options={{ headerShown: false }} />
            <RootStack.Screen
              name="RecettesCategorie"
              component={RecettesCategorieScreen}
              options={({ route }) => ({ title: (route.params as any)?.categorieNom ?? 'Recettes' })}
            />
            <RootStack.Screen
              name="DetailRecette"
              component={RecetteDetailScreen}
              options={{ title: 'Recette', ...enTeteSansTitre }}
            />
            <RootStack.Screen
              name="EssaiRecette"
              component={EssaiFormScreen}
              options={({ route }) => ({
                title: (route.params as any)?.essaiId ? 'Mon essai' : 'Raconter mon essai',
              })}
            />
            <RootStack.Screen
              name="CreationRecette"
              component={RecetteFormScreen}
              options={({ route }) => ({
                title: (route.params as any)?.recetteId ? 'Modifier la recette' : 'Nouvelle recette',
              })}
            />
            <RootStack.Screen
              name="ScanRecette"
              component={ScanRecetteScreen}
              options={{ title: 'Scanner une recette' }}
            />
            <RootStack.Screen
              name="ImportWeb"
              component={ImportWebScreen}
              options={{ title: 'Importer depuis le web' }}
            />
            <RootStack.Screen
              name="SelectionRecettes"
              component={SelectionRecettesScreen}
              options={{ title: 'Ajouter des recettes', ...enTeteSansTitre }}
            />
            <RootStack.Screen
              name="AssistantRecette"
              component={DeroulementAssistantScreen}
              options={{ title: 'Mode assistant' }}
            />
            <RootStack.Screen
              name="ChangerMotDePasse"
              component={ChangerMotDePasseScreen}
              options={{ title: 'Mot de passe' }}
            />
            <RootStack.Screen
              name="FormulaireAlimentCongele"
              component={AlimentCongeleFormScreen}
              options={({ route }) => ({
                title: (route.params as any)?.alimentId ? "Modifier l'aliment" : 'Ajouter au congélateur',
              })}
            />
            <RootStack.Screen
              name="GestionCongelateurs"
              component={GestionCongelateursScreen}
              options={{ title: 'Mes congélateurs' }}
            />
            <RootStack.Screen
              name="FormulaireNoteUtile"
              component={NoteUtileFormScreen}
              options={({ route }) => ({
                title: (route.params as any)?.noteId ? 'Modifier la fiche' : 'Nouvelle fiche',
              })}
            />
          </>
        )}
      </RootStack.Navigator>
    </NavigationContainer>
  );
}
