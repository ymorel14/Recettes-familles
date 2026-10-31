// Petites transformations du texte Markdown des fiches « Aide-mémoire »,
// utilisées par la barre d'outils du formulaire (sans dépendance à React,
// pour être testées à part).

export type Selection = { start: number; end: number };
export type Resultat = { texte: string; curseur: number };

const PREFIXE_LISTE = /^(\s*)([-*•]|\d+[.)])\s+/;

// Début et fin des lignes touchées par la sélection.
function bornesLignes(texte: string, sel: Selection) {
  const debut = texte.lastIndexOf('\n', Math.max(0, sel.start - 1)) + 1;
  const finBrute = texte.indexOf('\n', sel.end);
  const fin = finBrute === -1 ? texte.length : finBrute;
  return { debut, fin };
}

// Ajoute un préfixe (« - », « 1. », « ## ») à chaque ligne sélectionnée ;
// retire celui qui y était (autre type de liste, titre).
export function prefixerLignes(texte: string, sel: Selection, type: 'puce' | 'numero' | 'titre'): Resultat {
  const { debut, fin } = bornesLignes(texte, sel);
  const lignes = texte.slice(debut, fin).split('\n');
  const dejaFait = lignes.every((l) =>
    type === 'titre' ? /^##\s/.test(l) : type === 'puce' ? /^\s*[-*•]\s/.test(l) : /^\s*\d+[.)]\s/.test(l)
  );
  let n = 0;
  const nouvelles = lignes.map((l) => {
    const nu = l.replace(/^#{1,3}\s+/, '').replace(PREFIXE_LISTE, '$1');
    if (dejaFait) return nu;
    if (type === 'titre') return `## ${nu.trimStart()}`;
    n += 1;
    const indent = nu.match(/^\s*/)?.[0] ?? '';
    return `${indent}${type === 'puce' ? '-' : `${n}.`} ${nu.trimStart()}`;
  });
  const bloc = nouvelles.join('\n');
  return { texte: texte.slice(0, debut) + bloc + texte.slice(fin), curseur: debut + bloc.length };
}

// Entoure la sélection de ** (gras) ; sans sélection, insère un exemple.
export function mettreEnGras(texte: string, sel: Selection): Resultat {
  const choisi = texte.slice(sel.start, sel.end);
  const milieu = choisi || 'texte en gras';
  const insere = `**${milieu}**`;
  return { texte: texte.slice(0, sel.start) + insere + texte.slice(sel.end), curseur: sel.start + insere.length };
}

// Insère un tableau vide (en-tête + lignes) sur ses propres lignes.
export function insererTableau(texte: string, sel: Selection, colonnes = 2, lignes = 3): Resultat {
  const entete = `| ${Array.from({ length: colonnes }, (_, i) => `Colonne ${i + 1}`).join(' | ')} |`;
  const separateur = `|${Array(colonnes).fill('---').join('|')}|`;
  const vide = `| ${Array(colonnes).fill(' ').join(' | ')} |`;
  const tableau = [entete, separateur, ...Array(lignes).fill(vide)].join('\n');
  const avant = texte.slice(0, sel.start);
  const apres = texte.slice(sel.end);
  const debut = avant && !avant.endsWith('\n') ? '\n\n' : avant && !avant.endsWith('\n\n') ? '\n' : '';
  const fin = apres.startsWith('\n') ? '\n' : '\n\n';
  const insere = debut + tableau + fin;
  return { texte: avant + insere + apres, curseur: avant.length + insere.length };
}

// Après la frappe d'un retour à la ligne : continue la liste (« - », « 2. »)
// ou, sur un élément vide, sort de la liste. null si rien à faire.
export function continuerListe(ancien: string, nouveau: string): Resultat | null {
  if (nouveau.length !== ancien.length + 1) return null;
  let p = 0;
  while (p < ancien.length && ancien[p] === nouveau[p]) p += 1;
  if (nouveau[p] !== '\n' || nouveau.slice(p + 1) !== ancien.slice(p)) return null;
  const debutLigne = ancien.lastIndexOf('\n', p - 1) + 1;
  const ligne = ancien.slice(debutLigne, p);
  const m = ligne.match(/^(\s*)([-*•]|(\d+)([.)]))\s+(.*)$/);
  if (!m) return null;
  if (!m[5].trim()) {
    // Élément vide : on retire la puce et on sort de la liste.
    const texte = ancien.slice(0, debutLigne) + ancien.slice(p);
    return { texte, curseur: debutLigne };
  }
  const suite = m[3] ? `${m[1]}${Number(m[3]) + 1}${m[4]} ` : `${m[1]}${m[2]} `;
  const texte = nouveau.slice(0, p + 1) + suite + nouveau.slice(p + 1);
  return { texte, curseur: p + 1 + suite.length };
}

// ---------------------------------------------------------------------------
// Collage depuis d'autres applis (Excel, Gemini, une page web…)
// ---------------------------------------------------------------------------

function celluleTableau(c: string): string {
  let v = c.trim();
  // Excel entoure de guillemets une cellule qui contient un retour à la ligne.
  if (v.length >= 2 && v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1).replace(/""/g, '"');
  return v.replace(/\r?\n/g, ' ').replace(/\|/g, '/');
}

// Lignes d'un tableau → tableau Markdown (la première ligne sert d'en-tête).
export function tableauMarkdown(rangees: string[][]): string {
  const nb = Math.max(...rangees.map((r) => r.length), 1);
  const ligne = (r: string[]) =>
    `| ${[...r, ...Array(Math.max(0, nb - r.length)).fill('')].map((c) => c || ' ').join(' | ')} |`;
  return [ligne(rangees[0]), `|${Array(nb).fill('---').join('|')}|`, ...rangees.slice(1).map(ligne)].join('\n');
}

// Met au propre un texte collé :
//  - tableau copié depuis Excel / Numbers / Google Sheets (cellules séparées
//    par des tabulations) → tableau ;
//  - puces « • ◦ ▪ – » (Word, pages web, Gemini) → « - » ;
//  - retraits par tabulation ou 4 espaces → sous-éléments ;
//  - le Markdown (bouton « Copier » de Gemini ou ChatGPT) est gardé tel quel.
export function normaliserCollage(texte: string): string {
  const lignes = texte.replace(/\r\n?/g, '\n').replace(/ /g, ' ').split('\n');
  const sortie: string[] = [];
  let i = 0;
  while (i < lignes.length) {
    if (lignes[i].includes('\t') && lignes[i].split('\t').length >= 2) {
      const rangees: string[][] = [];
      while (i < lignes.length && lignes[i].includes('\t')) {
        rangees.push(lignes[i].split('\t').map(celluleTableau));
        i += 1;
      }
      // Excel ajoute souvent une dernière colonne vide : on la retire.
      while (rangees.every((r) => r.length > 1 && !r[r.length - 1])) rangees.forEach((r) => r.pop());
      if (sortie.length && sortie[sortie.length - 1].trim()) sortie.push('');
      sortie.push(tableauMarkdown(rangees), '');
      continue;
    }
    const m = lignes[i].match(/^([ \t]*)[•◦▪▫‣⁃–—·]\s*(.*)$/);
    if (m) {
      const retrait = Math.round(m[1].replace(/\t/g, '    ').length / 4);
      // « ◦ » marque souvent un sous-élément, même sans retrait.
      const niveau = Math.min(2, Math.max(retrait, /^[ \t]*[◦▫]/.test(lignes[i]) ? 1 : 0));
      sortie.push(`${'  '.repeat(niveau)}- ${m[2].trim()}`);
    } else {
      // Retraits de 4 espaces (Markdown de Gemini) → 2 espaces par niveau.
      sortie.push(
        lignes[i].replace(/^([ \t]+)(?=([-*+]|\d+[.)])\s)/, (r) => '  '.repeat(Math.round(r.replace(/\t/g, '    ').length / 4)))
      );
    }
    i += 1;
  }
  return sortie.join('\n').replace(/\n{3,}/g, '\n\n').replace(/^\n+|\n+$/g, '');
}

// Repère un collage dans onChangeText (le texte inséré d'un coup) et le
// remplace par sa version mise au propre. null si ce n'est pas un collage
// à transformer.
export function traiterCollage(ancien: string, nouveau: string): Resultat | null {
  if (nouveau.length - ancien.length < 2) return null;
  let debut = 0;
  while (debut < ancien.length && ancien[debut] === nouveau[debut]) debut += 1;
  let finA = ancien.length;
  let finN = nouveau.length;
  while (finA > debut && finN > debut && ancien[finA - 1] === nouveau[finN - 1]) {
    finA -= 1;
    finN -= 1;
  }
  const insere = nouveau.slice(debut, finN);
  if (!/\t|[•◦▪▫‣⁃]|^ {4,}[-*+]\s/m.test(insere)) return null;
  let propre = normaliserCollage(insere);
  const avant = nouveau.slice(0, debut);
  const apres = nouveau.slice(finN);
  // Un tableau doit commencer sur sa propre ligne.
  if (propre.startsWith('|') && avant && !avant.endsWith('\n')) propre = `\n\n${propre}`;
  if (/\|\s*$/.test(propre) && apres && !apres.startsWith('\n')) propre = `${propre}\n\n`;
  return { texte: avant + propre + apres, curseur: avant.length + propre.length };
}
