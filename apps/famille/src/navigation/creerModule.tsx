import React from 'react';
import { createNativeStackNavigator, type NativeStackNavigationOptions } from '@react-navigation/native-stack';
import { creerOngletsModule, type ActionModule } from './OngletsModule';
import { couleurs, couleursModule, polices, type IdModule } from '../theme/theme';

// Fabrique d'un module : une pile d'écrans (spécification § 2.3, « chaque
// module exporte une pile d'écrans sans container »), dont le premier écran
// porte les onglets du haut. Les autres écrans gardent les noms de
// l'ancienne app, si bien que les navigation.navigate('Liste', …) du code
// repris fonctionnent sans changement.

export type DefinitionOnglet = { nom: string; titre: string; composant: React.ComponentType<any> };
export type DefinitionEcran = {
  nom: string;
  composant: React.ComponentType<any>;
  options?: NativeStackNavigationOptions | ((p: { route: any; navigation: any }) => NativeStackNavigationOptions);
};

export function optionsDetail(id: IdModule): NativeStackNavigationOptions {
  const c = couleursModule(id);
  return {
    headerStyle: { backgroundColor: couleurs.fond },
    headerTintColor: c.encre,
    headerTitleStyle: { fontFamily: polices.titre, fontSize: 20, color: couleurs.encre } as any,
    headerBackTitleStyle: { fontFamily: polices.texteDemiGras, fontSize: 15 } as any,
    headerShadowVisible: false,
    headerTitleAlign: 'left',
    contentStyle: { backgroundColor: couleurs.fond },
  };
}

export function creerModule({
  id,
  onglets,
  ecrans,
  actions,
  enveloppe: Enveloppe,
}: {
  id: IdModule;
  onglets: DefinitionOnglet[];
  ecrans: DefinitionEcran[];
  actions?: ActionModule[];
  enveloppe?: React.ComponentType<{ children: React.ReactNode }>;
}) {
  const Pile = createNativeStackNavigator();
  const Onglets = creerOngletsModule();

  function AccueilModule() {
    return (
      <Onglets.Navigator module={id} actions={actions}>
        {onglets.map((o) => (
          <Onglets.Screen key={o.nom} name={o.nom} component={o.composant} options={{ title: o.titre }} />
        ))}
      </Onglets.Navigator>
    );
  }

  function Module() {
    const pile = (
      <Pile.Navigator screenOptions={optionsDetail(id)}>
        <Pile.Screen name="Onglets" component={AccueilModule} options={{ headerShown: false, title: '' }} />
        {ecrans.map((e) => (
          <Pile.Screen key={e.nom} name={e.nom} component={e.composant} options={e.options as any} />
        ))}
      </Pile.Navigator>
    );
    return Enveloppe ? <Enveloppe>{pile}</Enveloppe> : pile;
  }
  return Module;
}
