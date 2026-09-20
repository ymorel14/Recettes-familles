import React from 'react';
import { NavigationContainer, DarkTheme, Theme as NavTheme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ActivityIndicator, View } from 'react-native';
import { theme } from '../theme/theme';
import { useAuth } from '../contexts/AuthContext';

import AuthScreen from '../screens/auth/AuthScreen';
import FoyerScreen from '../screens/foyer/FoyerScreen';
import ProfilScreen from '../screens/foyer/ProfilScreen';
import RecettesScreen from '../screens/RecettesScreen';
import RecetteDetailScreen from '../screens/recettes/RecetteDetailScreen';
import RecetteFormScreen from '../screens/recettes/RecetteFormScreen';
import ListeDeCoursesScreen from '../screens/ListeDeCoursesScreen';
import SelectionRecettesScreen from '../screens/courses/SelectionRecettesScreen';
import ChoixRecetteAssistantScreen from '../screens/assistant/ChoixRecetteAssistantScreen';
import DeroulementAssistantScreen from '../screens/assistant/DeroulementAssistantScreen';

const Tab = createBottomTabNavigator();
const RootStack = createNativeStackNavigator();

// Thème de navigation aligné sur la charte graphique "Sceau" (cahier des charges §14).
const navigationTheme: NavTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: theme.colors.background,
    card: theme.colors.surface,
    text: theme.colors.text,
    border: theme.colors.border,
    primary: theme.colors.accent,
  },
};

const optionsEcran = {
  headerStyle: { backgroundColor: theme.colors.surface },
  headerTitleStyle: { fontFamily: theme.fontTitle, color: theme.colors.accent },
  headerTintColor: theme.colors.accent,
};

function Onglets() {
  return (
    <Tab.Navigator
      screenOptions={{
        ...optionsEcran,
        tabBarStyle: { backgroundColor: theme.colors.surface, borderTopColor: theme.colors.border },
        tabBarActiveTintColor: theme.colors.accent,
        tabBarInactiveTintColor: theme.colors.textMuted,
        tabBarLabelStyle: { fontFamily: theme.fontBody, fontSize: 12 },
      }}
    >
      <Tab.Screen name="Recettes" component={RecettesScreen} options={{ title: 'Recettes' }} />
      <Tab.Screen name="Courses" component={ListeDeCoursesScreen} options={{ title: 'Liste de courses' }} />
      <Tab.Screen name="Assistant" component={ChoixRecetteAssistantScreen} options={{ title: 'Assistant' }} />
      <Tab.Screen name="Profil" component={ProfilScreen} options={{ title: 'Profil' }} />
    </Tab.Navigator>
  );
}

export default function AppNavigator() {
  const { session, chargement, foyer, chargementFoyer } = useAuth();

  if (chargement || (session && chargementFoyer)) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.background, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={theme.colors.accent} />
      </View>
    );
  }

  return (
    <NavigationContainer theme={navigationTheme}>
      <RootStack.Navigator screenOptions={optionsEcran}>
        {!session ? (
          <RootStack.Screen name="Connexion" component={AuthScreen} options={{ headerShown: false }} />
        ) : !foyer ? (
          <RootStack.Screen name="Foyer" component={FoyerScreen} options={{ headerShown: false }} />
        ) : (
          <>
            <RootStack.Screen name="Onglets" component={Onglets} options={{ headerShown: false }} />
            <RootStack.Screen
              name="DetailRecette"
              component={RecetteDetailScreen}
              options={{ title: 'Recette' }}
            />
            <RootStack.Screen
              name="CreationRecette"
              component={RecetteFormScreen}
              options={{ title: 'Nouvelle recette' }}
            />
            <RootStack.Screen
              name="SelectionRecettes"
              component={SelectionRecettesScreen}
              options={{ title: 'Ajouter des recettes' }}
            />
            <RootStack.Screen
              name="AssistantRecette"
              component={DeroulementAssistantScreen}
              options={{ title: 'Mode assistant' }}
            />
          </>
        )}
      </RootStack.Navigator>
    </NavigationContainer>
  );
}
