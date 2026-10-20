import { Linking, Platform } from 'react-native';

// Partage d'un de ses propres commentaires sur WhatsApp : ouvre WhatsApp
// avec le message déjà rédigé, la personne choisit elle-même la
// conversation ou le groupe, puis envoie. Rien n'est publié
// automatiquement.
//
// L'adresse https://wa.me/?text=… ouvre l'app WhatsApp sur téléphone si
// elle est installée, et WhatsApp Web sinon (aucune déclaration
// particulière à faire dans app.json, contrairement à whatsapp://).

export function messageCommentaire(titreSouvenir: string, texte: string, surUnePhoto: boolean): string {
  const objet = surUnePhoto ? `une photo du souvenir « ${titreSouvenir} »` : `le souvenir « ${titreSouvenir} »`;
  return `💬 Mon commentaire sur ${objet} :\n« ${texte.trim()} »\n\n— partagé depuis SouvenirsFamille`;
}

export async function partagerSurWhatsApp(message: string): Promise<void> {
  const adresse = `https://wa.me/?text=${encodeURIComponent(message)}`;
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.open(adresse, '_blank', 'noopener');
    return;
  }
  await Linking.openURL(adresse);
}
