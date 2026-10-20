import { normaliserPhrase, extraireDuree } from './durees';
import { normaliserTexte } from '../utils/texte';

// Commandes vocales du mode assistant (étape 1 : sans IA). Une phrase
// reconnue par le micro est ramenée à une commande simple, reconnue par
// mots-clés : c'est instantané, gratuit et fonctionne sans connexion à un
// modèle d'IA. Tout ce qui n'est pas reconnu est ignoré (bruits de cuisine,
// conversations…), sans réponse vocale.

export type CommandeVocale =
  | { type: 'suivant' }
  | { type: 'precedent' }
  | { type: 'allerEtape'; numero: number }
  | { type: 'repeter' }
  | { type: 'pause' }
  | { type: 'reprendre' }
  | { type: 'arreter' }
  | { type: 'position' }
  | { type: 'ingredients' }
  | { type: 'quantite'; recherche: string }
  | { type: 'minuteur'; dureeMs: number; nom: string | null }
  | { type: 'tempsRestant'; nom: string | null }
  | { type: 'annulerMinuteur'; nom: string | null }
  | { type: 'acquitter' }
  | { type: 'aide' }
  | { type: 'inconnue' };

// Mots donnés au moteur de reconnaissance pour l'aider à les reconnaître
// (iOS : contextualStrings).
export const MOTS_COMMANDES = [
  'suivant', 'étape suivante', 'précédent', 'répète', 'pause', 'reprends', 'stop',
  'minuteur', 'combien de temps', 'annule le minuteur', "c'est bon", 'ingrédients', 'aide',
];

// Aide lue à voix haute (commande « aide »).
export const TEXTE_AIDE =
  'Vous pouvez dire : suivant, précédent, répète, pause, reprends, stop, ' +
  'étape 3, où j’en suis, les ingrédients, combien de beurre, ' +
  'minuteur 10 minutes pour les pâtes, combien de temps il reste, annule le minuteur, ' +
  'et c’est bon pour arrêter une sonnerie.';

// « Stop » sous toutes ses formes (la reconnaissance vocale écrit souvent
// « stoppe », « stopper », « arrête-toi »…).
const MOTS_ARRET = / (stop|stope|stoppe|stopper|stoppez|stoppes|arrete|arreter|arretez|arretes|arrete toi|tais toi|taisez vous|silence|chut|ca suffit|coupe la voix|coupe le son) /;
const MOTS_PAUSE = / (pause|attends|attend|attendez|patiente|1 seconde|1 instant|minute papillon) /;

// Pendant que l'application lit une étape, le micro entend aussi sa voix :
// la phrase reconnue mélange alors la commande et l'écho de la lecture
// ("…la farine et les œufs stop"). On y cherche seulement un ordre
// d'arrêt ou de pause, où qu'il soit dans la phrase.
export function commandeInterruption(texte: string): CommandeVocale | null {
  const a = ` ${normaliserPhrase(texte)} `;
  if (MOT_MINUTEUR.test(a)) return null;
  if (MOTS_ARRET.test(a)) return { type: 'arreter' };
  if (MOTS_PAUSE.test(a)) return { type: 'pause' };
  return null;
}

const MOT_MINUTEUR = /\b(minuteur|minuteurs|minuterie|chrono|chronometre|timer|compte a rebours|rappelle moi|previens moi|sonne)\b/;

// Retire les mots de liaison autour d'un nom ("pour les pâtes" → "pates").
function nettoyerNom(texte: string): string | null {
  const nom = texte
    .replace(/\b(pour|sur|de|du|des|le|la|les|l|d|un|une|mon|ma|mes|ce|cette|minuteur|minuteurs|chrono|timer|dans|au|aux|en|s il te plait|stp|merci)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return nom.length >= 2 ? nom : null;
}

function nombreDeMots(phrase: string): number {
  return phrase.split(' ').filter(Boolean).length;
}

export function nombreDeMotsPhrase(texte: string): number {
  return nombreDeMots(normaliserPhrase(texte));
}

export function analyserCommande(texte: string): CommandeVocale {
  const p = normaliserPhrase(texte);
  if (!p) return { type: 'inconnue' };
  const a = ` ${p} `;

  if (/ (aide|au secours|qu est ce que je peux dire|quelles commandes|liste des commandes) /.test(a)) {
    return { type: 'aide' };
  }

  // --- Minuteurs -----------------------------------------------------------
  if (/ (c est bon|ok c est bon|j ai entendu|merci c est bon|coupe la sonnerie|arrete la sonnerie|stop la sonnerie) /.test(a)) {
    return { type: 'acquitter' };
  }
  if (MOT_MINUTEUR.test(p) || / (sonnerie) /.test(a)) {
    if (/ (annule|annuler|supprime|supprimer|enleve|efface|arrete|arreter|stop|stoppe|stopper|coupe) /.test(a)) {
      const reste = p.replace(/\b(annule|annuler|supprime|supprimer|enleve|efface|arrete|arreter|stop|stoppe|stopper|coupe)\b/g, ' ');
      return { type: 'annulerMinuteur', nom: nettoyerNom(reste) };
    }
    if (/ (combien|reste|restant|ou en est|ou en sont) /.test(a)) {
      const reste = p.replace(/\b(combien|de|temps|il|t|reste|restant|restent|ou|en|est|sont|encore|sur|pour|le|la|les)\b/g, ' ');
      return { type: 'tempsRestant', nom: nettoyerNom(reste) };
    }
  }
  if (/ combien de temps /.test(a) || / (temps restant|il reste combien|reste combien) /.test(a)) {
    const reste = p.replace(/\b(combien|de|temps|il|t|reste|restant|restent|encore|pour|sur|le|la|les|minuteur|chrono)\b/g, ' ');
    return { type: 'tempsRestant', nom: nettoyerNom(reste) };
  }
  const duree = extraireDuree(p);
  if (duree != null && (MOT_MINUTEUR.test(p) || / (lance|mets|met|demarre|programme|compte) /.test(a) || / dans \d/.test(a))) {
    // Nom : ce qui reste une fois la durée et les verbes retirés
    // ("minuteur 10 minutes pour les pâtes" → "pates").
    const sansDuree = p
      .replace(/\b\d+h\d*\b/g, ' ')
      .replace(/\b\d+(\.\d+)?\s*(heures?|h|minutes?|min|mn|secondes?|sec|s)\b/g, ' ')
      .replace(/\b(\d+ )?quarts? d heure\b|\bdemi heure\b|\bet demie?\b|\b\d+\b/g, ' ')
      .replace(/\b(lance|lancer|mets|met|mettre|demarre|demarrer|programme|compte|rappelle moi|previens moi|dans|sonne|moi|stp|s il te plait)\b/g, ' ');
    return { type: 'minuteur', dureeMs: duree, nom: nettoyerNom(sansDuree) };
  }

  // --- Navigation dans les étapes -----------------------------------------
  const etape = a.match(/ (?:etape|numero) (\d+) /);
  if (etape) return { type: 'allerEtape', numero: Number(etape[1]) };

  if (/ (ou j en suis|ou on en est|ou en est on|on en est ou|j en suis ou|quelle etape) /.test(a)) {
    return { type: 'position' };
  }

  if (/ (suivant|suivante|next|etape d apres|d apres|c est fait|j ai fait|j ai fini|fini|termine|valide|valider|coche|on continue|la suite|passe a la suite|ok suivant) /.test(a)) {
    return { type: 'suivant' };
  }
  if (/ (precedent|precedente|d avant|en arriere|retour|reviens|revenir|recule|reculer) /.test(a)) {
    return { type: 'precedent' };
  }

  // --- Ingrédients ----------------------------------------------------------
  const quantite = a.match(/ (?:combien (?:de |d )?|quelle quantite (?:de |d )?|quantite (?:de |d )?|il faut combien (?:de |d )?|je mets combien (?:de |d )?|on met combien (?:de |d )?)(.+) /);
  if (quantite && !/^(temps|minutes?)\b/.test(quantite[1])) {
    const recherche = quantite[1].replace(/\b(il faut|faut il|je mets|on met|j en mets|en faut il|dedans|pour la recette)\b/g, ' ').trim();
    if (recherche) return { type: 'quantite', recherche };
  }
  if (/ (ingredient|ingredients) /.test(a)) return { type: 'ingredients' };

  // --- Lecture ---------------------------------------------------------------
  if (/ (repete|repeter|repetes|redis|redire|relis|relire|encore une fois|pardon|j ai pas compris|je n ai pas compris|hein) /.test(a)) {
    return { type: 'repeter' };
  }
  // (Les nombres sont déjà en chiffres : "une seconde" → "1 seconde".)
  if (MOTS_PAUSE.test(a) || / 2 secondes /.test(a)) {
    return { type: 'pause' };
  }
  if (/ (reprends|reprend|reprendre|continue|continuer|vas y|va y|lis|lire|lecture) /.test(a)) {
    return { type: 'reprendre' };
  }
  if (MOTS_ARRET.test(a)) {
    return { type: 'arreter' };
  }

  return { type: 'inconnue' };
}

// Commandes assez sûres pour être exécutées dès un résultat provisoire du
// micro (réaction plus rapide), sans attendre la fin de la phrase. Les
// autres ("arrête…" qui peut devenir "arrête le minuteur", "étape…"
// qui attend son numéro…) attendent le résultat définitif.
export function commandeSureEnProvisoire(commande: CommandeVocale, minuteursEnCours: boolean): boolean {
  if (commande.type === 'suivant' || commande.type === 'pause' || commande.type === 'repeter') return true;
  // « Stop » tout de suite, sauf s'il peut s'agir d'un « stop… le minuteur ».
  return commande.type === 'arreter' && !minuteursEnCours;
}

// Retrouve l'ingrédient dont parle la personne ("combien de beurre" →
// "Beurre doux"), accents, casse et pluriel simple ignorés.
export function trouverIngredient<T extends { libelle: string }>(recherche: string, ingredients: T[]): T | null {
  const motsRecherche = normaliserPhrase(recherche)
    .split(' ')
    .map((m) => m.replace(/s$/, ''))
    .filter((m) => m.length >= 3);
  if (motsRecherche.length === 0) return null;

  let meilleur: T | null = null;
  let meilleurScore = 0;
  for (const ingredient of ingredients) {
    const motsIngredient = normaliserTexte(ingredient.libelle)
      .replace(/[œ]/g, 'oe')
      .split(/[^a-z0-9]+/)
      .map((m) => m.replace(/s$/, ''))
      .filter((m) => m.length >= 3);
    const communs = motsRecherche.filter((m) => motsIngredient.includes(m)).length;
    if (communs === 0) continue;
    // Priorité aux ingrédients dont le nom est entièrement couvert.
    const score = communs * 10 - (motsIngredient.length - communs);
    if (score > meilleurScore) {
      meilleurScore = score;
      meilleur = ingredient;
    }
  }
  return meilleur;
}

// Retrouve un minuteur par son nom ("les pâtes" → minuteur "Pâtes").
export function trouverParNom<T extends { nom: string }>(nom: string | null, elements: T[]): T | null {
  if (!nom) return null;
  const cible = normaliserPhrase(nom).replace(/s\b/g, '');
  return (
    elements.find((e) => {
      const n = normaliserPhrase(e.nom).replace(/s\b/g, '');
      return n.includes(cible) || cible.includes(n);
    }) ?? null
  );
}
