import React, { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { DarkTheme, DefaultTheme, NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { obtenirMonPrenom, useAuth } from '@apps-famille/famille';
import { navigationRef } from './navigationRef';
import { liens } from './liens';
import { BarreDuBas } from './BarreDuBas';
import { optionsDetail } from './creerModule';
import { usePreferences } from '../contexts/PreferencesContext';
import { couleurs, polices } from '../theme/theme';
import { Bouton, Chargement } from '../composants/ui';
import { FeuilleAjouter } from '../ecrans/FeuilleAjouter';
import AccueilScreen from '../ecrans/AccueilScreen';
import AgendaScreen from '../ecrans/AgendaScreen';
import ActiviteScreen from '../ecrans/ActiviteScreen';
import MoiScreen from '../ecrans/MoiScreen';
import ChangerMotDePasseScreen from '../compte/screens/ChangerMotDePasseScreen';
import VehiculeFormScreen from '../modules/voyages/screens/VehiculeFormScreen';
import ConnexionScreen from '../compte/screens/ConnexionScreen';
import BienvenueScreen from '../compte/screens/BienvenueScreen';
import PrenomScreen from '../compte/screens/PrenomScreen';
import ModuleRecettes from './modules/recettes';
import ModuleCourses from './modules/courses';
import ModuleQuotidien from './modules/quotidien';
import ModuleCadeaux from './modules/cadeaux';
import ModuleVoyages from './modules/voyages';
import ModuleSouvenirs from './modules/souvenirs';

const Racine = createNativeStackNavigator();
const Onglets = createBottomTabNavigator();
const PileMoi = createNativeStackNavigator();

function Moi() {
  return (
    <PileMoi.Navigator screenOptions={{ ...optionsDetail('quotidien'), headerTintColor: couleurs.encre }}>
      <PileMoi.Screen name="MoiAccueil" component={MoiScreen} options={{ headerShown: false, title: 'Moi' }} />
      <PileMoi.Screen name="MotDePasse" component={ChangerMotDePasseScreen} options={{ title: 'Mot de passe' }} />
      <PileMoi.Screen name="Vehicule" component={VehiculeFormScreen} options={{ title: 'Véhicule' }} />
    </PileMoi.Navigator>
  );
}

// Barre du bas à 5 entrées ; les six modules sont des onglets cachés, pour
// que la barre reste visible quand on y entre. « Retour » ramène d'où l'on
// vient (historique des onglets).
function Principal() {
  const [ajout, setAjout] = useState(false);
  return (
    <>
      <Onglets.Navigator
        backBehavior="history"
        tabBar={(props) => <BarreDuBas {...props} onAjouter={() => setAjout(true)} />}
        screenOptions={{ headerShown: false, lazy: true, sceneStyle: { backgroundColor: couleurs.fond } }}
      >
        <Onglets.Screen name="Accueil" component={AccueilScreen} options={{ title: 'Accueil' }} />
        <Onglets.Screen name="Agenda" component={AgendaScreen} options={{ title: 'Agenda' }} />
        <Onglets.Screen name="Activite" component={ActiviteScreen} options={{ title: 'Activité' }} />
        <Onglets.Screen name="Moi" component={Moi} options={{ title: 'Moi' }} />
        <Onglets.Screen name="Recettes" component={ModuleRecettes} options={{ title: 'Recettes' }} />
        <Onglets.Screen name="Courses" component={ModuleCourses} options={{ title: 'Courses' }} />
        <Onglets.Screen name="Quotidien" component={ModuleQuotidien} options={{ title: 'Quotidien' }} />
        <Onglets.Screen name="Cadeaux" component={ModuleCadeaux} options={{ title: 'Cadeaux' }} />
        <Onglets.Screen name="Voyages" component={ModuleVoyages} options={{ title: 'Voyages' }} />
        <Onglets.Screen name="Souvenirs" component={ModuleSouvenirs} options={{ title: 'Souvenirs' }} />
      </Onglets.Navigator>
      <FeuilleAjouter visible={ajout} onFermer={() => setAjout(false)} />
    </>
  );
}

export default function Navigation() {
  const { session, chargement, famille, foyer, chargementFoyer, erreurFoyer, rafraichirFoyer, deconnexion } = useAuth();
  const { mode } = usePreferences();
  const [prenomRenseigne, setPrenomRenseigne] = useState<boolean | null>(null);
  // Écran en cours, gardé quand un changement d'apparence redessine tout.
  const etatNavigation = useRef<any>(undefined);
  const utilisateurId = session?.user.id ?? null;

  useEffect(() => {
    setPrenomRenseigne(null);
    if (!utilisateurId || !famille || !foyer) return;
    let actif = true;
    obtenirMonPrenom(utilisateurId)
      .then((p) => actif && setPrenomRenseigne(!!p?.trim()))
      .catch(() => actif && setPrenomRenseigne(true));
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
      <View style={{ flex: 1, backgroundColor: couleurs.fond, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 16 }}>
        <Text style={{ fontFamily: polices.titre, fontSize: 24, color: couleurs.encre, textAlign: 'center' }}>Connexion interrompue</Text>
        <Text style={{ fontFamily: polices.texte, fontSize: 15, color: couleurs.encreDouce, textAlign: 'center' }}>
          Impossible de charger votre famille pour le moment. Vérifiez votre connexion internet puis réessayez.
        </Text>
        <Bouton titre="Réessayer" onPress={() => rafraichirFoyer()} />
        <Bouton variante="lien" titre="Se déconnecter" onPress={deconnexion} />
      </View>
    );
  }

  const base = mode === 'sombre' ? DarkTheme : DefaultTheme;
  const themeNavigation = {
    ...base,
    colors: {
      ...base.colors,
      background: couleurs.fond,
      card: couleurs.surface,
      text: couleurs.encre,
      border: couleurs.ligne,
      primary: couleurs.encre,
      notification: couleurs.accent,
    },
  };

  return (
    <NavigationContainer
      key={mode}
      ref={navigationRef}
      theme={themeNavigation}
      linking={liens}
      initialState={etatNavigation.current}
      onStateChange={(etat) => {
        etatNavigation.current = etat;
      }}
      documentTitle={{ formatter: (options, route) => `${options?.title || route?.name || ''} · Famille`.replace(/^ · /, '') }}
    >
      <Racine.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: couleurs.fond } }}>
        {!session ? (
          <Racine.Screen name="Connexion" component={ConnexionScreen} />
        ) : !famille || !foyer ? (
          <Racine.Screen name="Bienvenue" component={BienvenueScreen} />
        ) : (
          <Racine.Screen name="Principal" component={Principal} />
        )}
      </Racine.Navigator>
    </NavigationContainer>
  );
}
