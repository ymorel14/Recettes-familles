// Consigne de la lettre au Père Noël → liste d'envies d'un enfant
// (spécification § 4.4.3). La liste est gérée par un parent, qui valide
// chaque ligne. Seul le prénom de l'enfant est envoyé.
export const VERSION = 1;

export const CONSIGNE = `Tu lis la lettre au Père Noël d'un enfant (photo d'une lettre ou d'un dessin, ou texte dicté) pour préparer sa liste d'envies. Un parent validera chaque ligne.

Règles :
- Une ligne par cadeau demandé, dans l'ordre de la lettre.
- L'écriture d'enfant est attendue : lis les mots déformés d'après le sens (« un véllo rouje » → « Vélo rouge ») et corrige l'orthographe.
- nom : le cadeau en quelques mots, avec une majuscule au début (« Lego Ninjago », « Poupée qui parle »). Garde la marque ou le personnage s'il est nommé.
- details : une précision donnée par l'enfant (couleur, taille, « le grand ») ou null. Recopie le mot tel qu'il l'a écrit seulement s'il est utile pour comprendre.
- a_verifier : true si tu n'es pas sûr d'avoir bien lu ce mot ou de quel objet il s'agit.
- Ignore les formules (« Cher Père Noël », « J'ai été sage », « Bisous »), les dessins qui ne désignent pas un cadeau, et les personnes sur la photo.
- question : si la lettre est illisible ou ne contient aucun cadeau, une phrase courte pour le parent ; sinon null.
- N'invente pas de cadeau. Français, pas d'émoji.`;
