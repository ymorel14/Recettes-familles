import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, Platform } from 'react-native';
import {
  NavigationContainer,
  DefaultTheme,
  DarkTheme,
  getPathFromState,
  getStateFromPath,
  type LinkingOptions,
} from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import Ionicons from '@expo/vector-icons/Ionicons';
import { theme, themeActuel } from '../theme/theme';
import { useAuth } from '../contexts/AuthContext';
import { usePreferences } from '../contexts/PreferencesContext';
import SelecteurFamilleModal from '../components/SelecteurFamilleModal';
import { Bouton, Chargement } from '../components/ui';
import ConnexionScreen from '../screens/ConnexionScreen';
import BienvenueScreen from '../screens/BienvenueScreen';
import PrenomScreen from '../screens/PrenomScreen';
import ProfilScreen from '../screens/ProfilScreen';
import ListesScreen from '../screens/ListesScreen';
import ListeScreen from '../screens/ListeScreen';
import ArticleScreen from '../screens/ArticleScreen';
import ListeFormScreen from '../screens/ListeFormScreen';
import MagasinScreen from '../screens/MagasinScreen';
import ChecklistScreen from '../screens/ChecklistScreen';
import VerificationScreen from '../screens/VerificationScreen';
import HistoriqueScreen from '../screens/HistoriqueScreen';
import { obtenirMonPrenom, BoutonAppsFamille, baseWeb, etatDepuisCheminWeb } from '@apps-famille/famille';

const Pile = createNativeStackNavigator();
const Onglets = createBottomTabNavigator();

// Adresses web sous le chemin de l'app sur le site commun (/courses/…) :
// recharger une page ou partager un lien rouvre le bon écran.
const liens: LinkingOptions<any> = {
  enabled: Platform.OS === 'web',
  prefixes: [],
  config: {
    initialRouteName: 'Onglets',
    screens: {
      Connexion: 'connexion',
      Bienvenue: 'bienvenue',
      Onglets: { screens: { Listes: '', Profil: 'profil' } },
      Liste: 'liste/:listeId',
      ListeForm: 'nouvelle-liste',
      Article: 'liste/:listeId/article/:articleId',
      Magasin: 'liste/:listeId/magasin',
      Preparer: 'liste/:listeId/preparer',
      Historique: 'liste/:listeId/historique',
      Checklist: 'checklist',
    },
  },
  getStateFromPath: (chemin, options) => etatDepuisCheminWeb(chemin, (c) => getStateFromPath(c, options)),
  getPathFromState: (etat, options) => `${baseWeb()}${getPathFromState(etat, options)}`,
};

function optionsEntete() {
  return {
    headerStyle: { backgroundColor: theme.colors.background },
    headerTintColor: theme.colors.accent,
    headerTitleStyle: { fontFamily: theme.fontTitle, color: theme.colors.text },
    headerShadowVisible: false,
    contentStyle: { backgroundColor: theme.colors.background },
  };
}

// Titre des onglets : "Famille Morel ▾" au-dessus du nom de l'onglet ; avec
// plusieurs familles, toucher le nom ouvre le choix de la famille affichée.
function TitreFamille({ titre }: { titre: string }) {
  const { famille, familles } = useAuth();
  const [ouvert, setOuvert] = useState(false);
  const plusieurs = familles.length > 1;
  const libelle = famille ? (/^famille\b/i.test(famille.nom) ? famille.nom : `Famille ${famille.nom}`) : '';
  return (
    <View style={{ alignItems: 'center' }}>
      <Pressable
        onPress={() => plusieurs && setOuvert(true)}
        disabled={!plusieurs}
        accessibilityRole={plusieurs ? 'button' : undefined}
        accessibilityLabel={plusieurs ? 'Changer de famille' : undefined}
        hitSlop={8}
      >
        <Text style={{ fontFamily: theme.fontManuscrit, fontSize: 14, color: theme.colors.textMuted }}>
          {libelle}
          {plusieurs ? ' ▾' : ''}
        </Text>
      </Pressable>
      <Text style={{ fontFamily: theme.fontTitle, fontSize: 19, color: theme.colors.text }}>{titre}</Text>
      {plusieurs && <SelecteurFamilleModal visible={ouvert} onFermer={() => setOuvert(false)} />}
    </View>
  );
}

// Deux onglets (cahier des charges, « Écrans et navigation ») : Listes et
// Profil ; le reste s'ouvre depuis une liste.
function BarreOnglets() {
  return (
    <Onglets.Navigator
      screenOptions={({ route }) => ({
        ...optionsEntete(),
        headerTitleAlign: 'center',
        tabBarActiveTintColor: theme.colors.accent,
        tabBarInactiveTintColor: theme.colors.textMuted,
        tabBarStyle: { backgroundColor: theme.colors.surface, borderTopColor: theme.colors.border },
        tabBarLabelStyle: { fontFamily: theme.fontBodyBold, fontSize: 12 },
        tabBarIcon: ({ color, size }) => {
          const icones: Record<string, keyof typeof Ionicons.glyphMap> = {
            Listes: 'cart-outline',
            Profil: 'person-circle-outline',
          };
          return <Ionicons name={icones[route.name] ?? 'ellipse-outline'} size={size} color={color} />;
        },
        // Site web : bouton « Apps » pour revenir au choix des apps de la
        // famille sans se reconnecter (rien sur téléphone).
        headerLeft: () => <BoutonAppsFamille couleur={theme.colors.accent} police={theme.fontBodyBold} />,
      })}
    >
      <Onglets.Screen
        name="Listes"
        component={ListesScreen}
        options={{ title: 'Listes', headerTitle: () => <TitreFamille titre="Mes listes" /> }}
      />
      <Onglets.Screen
        name="Profil"
        component={ProfilScreen}
        options={{ title: 'Profil', headerTitle: () => <TitreFamille titre="Profil" /> }}
      />
    </Onglets.Navigator>
  );
}

export default function AppNavigator() {
  const { session, chargement, famille, foyer, chargementFoyer, erreurFoyer, rafraichirFoyer, deconnexion } = useAuth();
  const { themeId } = usePreferences();
  // Prénom de l'utilisateur : demandé une fois s'il manque (null = pas encore vérifié).
  const [prenomRenseigne, setPrenomRenseigne] = useState<boolean | null>(null);
  const utilisateurId = session?.user.id ?? null;

  useEffect(() => {
    setPrenomRenseigne(null);
    if (!utilisateurId || !famille || !foyer) return;
    let actif = true;
    obtenirMonPrenom(utilisateurId)
      .then((p) => actif && setPrenomRenseigne(!!p?.trim()))
      .catch(() => actif && setPrenomRenseigne(true)); // en cas de doute, on ne bloque pas l'app
    return () => {
      actif = false;
    };
  }, [utilisateurId, famille?.id, foyer?.id]);

  if (chargement || (session && chargementFoyer)) return <Chargement />;
  if (session && famille && foyer && prenomRenseigne === null) return <Chargement />;
  if (session && famille && foyer && prenomRenseigne === false) {
    return <PrenomScreen onTermine={() => setPrenomRenseigne(true)} />;
  }

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
          Impossible de charger votre famille pour le moment. Vérifiez votre connexion internet puis réessayez.
        </Text>
        <Bouton titre="Réessayer" onPress={() => rafraichirFoyer()} />
        <Bouton variante="discret" titre="Se déconnecter" onPress={deconnexion} />
      </View>
    );
  }

  const sombre = themeActuel().sombre;
  const base = sombre ? DarkTheme : DefaultTheme;
  const themeNavigation = {
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

  return (
    <NavigationContainer
      key={themeId}
      theme={themeNavigation}
      linking={liens}
      documentTitle={{ formatter: (options, route) => `${options?.title ?? route?.name ?? ''} · Courses` }}
    >
      <Pile.Navigator screenOptions={optionsEntete()}>
        {!session ? (
          <Pile.Screen name="Connexion" component={ConnexionScreen} options={{ headerShown: false }} />
        ) : !famille || !foyer ? (
          <Pile.Screen name="Bienvenue" component={BienvenueScreen} options={{ headerShown: false }} />
        ) : (
          <>
            <Pile.Screen name="Onglets" component={BarreOnglets} options={{ headerShown: false }} />
            <Pile.Screen name="Liste" component={ListeScreen} options={{ title: 'Liste' }} />
            <Pile.Screen name="Article" component={ArticleScreen} options={{ title: 'Article' }} />
            <Pile.Screen name="ListeForm" component={ListeFormScreen} options={{ title: 'Liste' }} />
            <Pile.Screen name="Magasin" component={MagasinScreen} options={{ title: 'Au magasin' }} />
            <Pile.Screen name="Preparer" component={VerificationScreen} options={{ title: 'Préparer les courses' }} />
            <Pile.Screen name="Historique" component={HistoriqueScreen} options={{ title: 'Historique' }} />
            <Pile.Screen name="Checklist" component={ChecklistScreen} options={{ title: 'Checklist du foyer' }} />
          </>
        )}
      </Pile.Navigator>
    </NavigationContainer>
  );
}
