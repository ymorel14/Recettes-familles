import { Alert, Platform, type AlertButton } from 'react-native';

// Remplace Alert.alert, qui ne fait RIEN dans un navigateur (retour
// utilisateur : "en mode web, je ne peux pas ajouter de photo" — le choix
// appareil photo / galerie ne s'ouvrait jamais). Sur téléphone : Alert.alert
// inchangé. Dans un navigateur : fenêtres du navigateur (alert / confirm).
export function alerte(titre: string, message?: string, boutons?: AlertButton[]) {
  if (Platform.OS !== 'web') {
    Alert.alert(titre, message, boutons);
    return;
  }
  const texte = message ? `${titre}\n\n${message}` : titre;
  const actions = (boutons ?? []).filter((b) => b.style !== 'cancel');

  // Simple information (un seul bouton "OK" au plus).
  if (!boutons || boutons.length <= 1) {
    window.alert(texte);
    boutons?.[0]?.onPress?.();
    return;
  }
  // Confirmation : "Annuler" / une action.
  if (actions.length === 1) {
    if (window.confirm(texte)) actions[0].onPress?.();
    return;
  }
  // Plusieurs actions : proposées l'une après l'autre.
  for (const action of actions) {
    if (window.confirm(`${texte}\n\n${action.text} ?`)) {
      action.onPress?.();
      return;
    }
  }
}
