import React, { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { NavigationContainer, DefaultTheme, DarkTheme } from '@react-navigation/native';
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
import EvenementsScreen from '../screens/EvenementsScreen';
import EvenementFormScreen from '../screens/EvenementFormScreen';
import EvenementScreen from '../screens/EvenementScreen';
import ListeScreen from '../screens/ListeScreen';
import SouhaitFormScreen from '../screens/SouhaitFormScreen';
import AOffrirScreen from '../screens/AOffrirScreen';
import MesEnviesScreen from '../screens/MesEnviesScreen';
import ProfilScreen from '../screens/ProfilScreen';

const Pile = createNativeStackNavigator();
const Onglets = createBottomTabNavigator();

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

function BarreOnglets({ navigation }: any) {
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
            Evenements: 'calendar-outline',
            AOffrir: 'gift-outline',
            MesEnvies: 'heart-outline',
          };
          return <Ionicons name={icones[route.name] ?? 'ellipse-outline'} size={size} color={color} />;
        },
        headerRight: () => (
          <Pressable
            onPress={() => navigation.navigate('Profil')}
            accessibilityRole="button"
            accessibilityLabel="Profil"
            style={{ paddingHorizontal: theme.spacing.md, minHeight: 44, justifyContent: 'center' }}
          >
            <Ionicons name="person-circle-outline" size={28} color={theme.colors.accent} />
          </Pressable>
        ),
      })}
    >
      <Onglets.Screen
        name="Evenements"
        component={EvenementsScreen}
        options={{ title: 'Événements', headerTitle: () => <TitreFamille titre="Événements" /> }}
      />
      <Onglets.Screen
        name="AOffrir"
        component={AOffrirScreen}
        options={{ title: 'À offrir', headerTitle: () => <TitreFamille titre="À offrir" /> }}
      />
      <Onglets.Screen
        name="MesEnvies"
        component={MesEnviesScreen}
        options={{ title: 'Mes envies', headerTitle: () => <TitreFamille titre="Mes envies" /> }}
      />
    </Onglets.Navigator>
  );
}

export default function AppNavigator() {
  const { session, chargement, famille, foyer, chargementFoyer, erreurFoyer, rafraichirFoyer, deconnexion } = useAuth();
  const { themeId } = usePreferences();

  if (chargement || (session && chargementFoyer)) return <Chargement />;

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
      documentTitle={{ formatter: (options, route) => `${options?.title ?? route?.name ?? ''} · CadeauCommun` }}
    >
      <Pile.Navigator screenOptions={optionsEntete()}>
        {!session ? (
          <Pile.Screen name="Connexion" component={ConnexionScreen} options={{ headerShown: false }} />
        ) : !famille || !foyer ? (
          <Pile.Screen name="Bienvenue" component={BienvenueScreen} options={{ headerShown: false }} />
        ) : (
          <>
            <Pile.Screen name="Onglets" component={BarreOnglets} options={{ headerShown: false }} />
            <Pile.Screen name="NouvelEvenement" component={EvenementFormScreen} options={{ title: 'Nouvel événement' }} />
            <Pile.Screen name="Evenement" component={EvenementScreen} options={{ title: 'Événement' }} />
            <Pile.Screen name="Liste" component={ListeScreen} options={{ title: 'Liste de souhaits' }} />
            <Pile.Screen name="Souhait" component={SouhaitFormScreen} options={{ title: 'Souhait' }} />
            <Pile.Screen name="Profil" component={ProfilScreen} options={{ title: 'Profil' }} />
          </>
        )}
      </Pile.Navigator>
    </NavigationContainer>
  );
}
