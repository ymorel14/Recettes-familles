import { Linking, Platform } from 'react-native';
import { BASE_WEB } from '../../../services/supabase';
import { alerte } from '../utils/alerte';
import type { VoyageAvecParticipants } from './voyage';

// Partage sur WhatsApp : ouvre WhatsApp avec un message déjà rédigé (et un
// lien vers la page de l'app) ; on choisit soi-même le groupe ou la personne.
// Rien ne part automatiquement, rien n'est envoyé par l'app elle-même.

// Adresse du site commun, pour les liens partagés depuis un téléphone
// (EXPO_PUBLIC_URL_SITE dans .env, ex. https://famille-morel.netlify.app).
// Sur le web, l'adresse de la page en cours suffit.
function racineSite(): string | null {
  if (Platform.OS === 'web' && typeof window !== 'undefined') return `${window.location.origin}${BASE_WEB}/voyages`;
  const site = (process.env.EXPO_PUBLIC_URL_SITE ?? '').trim().replace(/\/$/, '');
  return site ? `${site}/voyages` : null;
}

// Chemin web d'un écran (voir la configuration « liens » d'AppNavigator).
const CHEMINS: Record<string, string> = {
  Voyage: '',
  Dates: '/dates',
  Hebergements: '/hebergement',
  Transport: '/transport',
  Activites: '/activites',
  Programme: '/programme',
  Budget: '/budget',
  Menu: '/menu',
  ListesCadeaux: '/cadeaux',
};

export function lienVoyage(voyageId: string | null | undefined, ecran = 'Voyage'): string | null {
  const racine = racineSite();
  if (!racine) return null;
  if (!voyageId) return `${racine}/`;
  return `${racine}/voyage/${voyageId}${CHEMINS[ecran] ?? ''}`;
}

export function texteAvecLien(texte: string, lien: string | null): string {
  return lien ? `${texte}\n${lien}` : texte;
}

async function ouvrirWhatsApp(texte: string): Promise<void> {
  const encode = encodeURIComponent(texte);
  // Application WhatsApp si elle est installée, sinon WhatsApp Web.
  if (Platform.OS !== 'web') {
    try {
      await Linking.openURL(`whatsapp://send?text=${encode}`);
      return;
    } catch {
      // pas d'application : on passe par le lien web
    }
  }
  const url = `https://wa.me/?text=${encode}`;
  if (Platform.OS === 'web' && typeof window !== 'undefined') window.open(url, '_blank', 'noopener');
  else await Linking.openURL(url);
}

// Partage, avec une mise en garde quand l'événement est une surprise : le
// message ne doit pas arriver dans un groupe où se trouve la personne fêtée
// ou celle à qui on le cache.
export function partagerSurWhatsApp(
  texte: string,
  voyage?: Pick<VoyageAvecParticipants, 'secrets'> | null,
  nom?: (personneId: string) => string
): void {
  const secrets = voyage?.secrets ?? [];
  if (secrets.length === 0) {
    ouvrirWhatsApp(texte).catch(() => {});
    return;
  }
  const noms = secrets.map((s) => (nom ? nom(s.personne_id) : 'quelqu’un'));
  const liste = noms.length > 1 ? `${noms.slice(0, -1).join(', ')} et ${noms[noms.length - 1]}` : noms[0];
  alerte(
    'C’est une surprise',
    `${liste} ne doi${noms.length > 1 ? 'vent' : 't'} pas voir ce message. Envoyez-le seulement à des personnes dans la confidence, pas dans un groupe où ${noms.length > 1 ? 'ils se trouvent' : 'il ou elle se trouve'}.`,
    [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Choisir à qui l’envoyer', onPress: () => ouvrirWhatsApp(texte).catch(() => {}) },
    ]
  );
}
