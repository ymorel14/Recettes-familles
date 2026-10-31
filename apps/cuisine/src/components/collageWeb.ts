import { tableauMarkdown } from './editionTexte';

// Collage dans un navigateur : ce qui est copié depuis une page web (réponse
// de Gemini sélectionnée à la souris…) ou depuis Excel contient aussi une
// version HTML. On la transforme en Markdown pour garder listes, tableaux,
// titres et gras. null si le HTML n'apporte rien de plus que le texte brut.

type Noeud = any; // nœud DOM (le paquet ne charge pas les types du navigateur)

function enLigne(n: Noeud): string {
  if (n.nodeType === 3) return (n.textContent ?? '').replace(/\s+/g, ' ');
  if (n.nodeType !== 1) return '';
  const tag = n.tagName.toLowerCase();
  if (tag === 'br') return ' ';
  if (['ul', 'ol', 'table', 'style', 'script'].includes(tag)) return '';
  const interieur = Array.from(n.childNodes as Noeud[]).map(enLigne).join('');
  const style = (n.getAttribute?.('style') ?? '').toLowerCase();
  if (tag === 'strong' || tag === 'b' || /font-weight:\s*(bold|[6-9]00)/.test(style)) {
    return interieur.trim() ? `**${interieur.trim()}** ` : '';
  }
  if (tag === 'em' || tag === 'i') return interieur.trim() ? `*${interieur.trim()}* ` : '';
  return interieur;
}

function propre(t: string): string {
  // (Les espaces avant « : ; ! ? » sont gardés : typographie française.)
  return t.replace(/\s+/g, ' ').replace(/\s+([,.)])/g, '$1').trim();
}

function blocs(n: Noeud, niveau: number, sortie: string[]) {
  for (const enfant of Array.from(n.childNodes as Noeud[])) {
    if (enfant.nodeType === 3) {
      const t = propre(enfant.textContent ?? '');
      if (t) sortie.push(t);
      continue;
    }
    if (enfant.nodeType !== 1) continue;
    const tag = enfant.tagName.toLowerCase();
    if (tag === 'style' || tag === 'script' || tag === 'meta' || tag === 'title') continue;
    if (/^h[1-6]$/.test(tag)) {
      sortie.push('', `${tag === 'h1' ? '#' : '##'} ${propre(enLigne(enfant))}`, '');
    } else if (tag === 'ul' || tag === 'ol') {
      let numero = 0;
      for (const li of Array.from(enfant.children as Noeud[])) {
        if (li.tagName.toLowerCase() !== 'li') continue;
        numero += 1;
        const texte = propre(enLigne(li));
        if (texte) sortie.push(`${'  '.repeat(niveau)}${tag === 'ol' ? `${numero}.` : '-'} ${texte}`);
        for (const sous of Array.from(li.children as Noeud[])) {
          const t = sous.tagName.toLowerCase();
          if (t === 'ul' || t === 'ol') blocs({ childNodes: [sous] }, Math.min(niveau + 1, 2), sortie);
        }
      }
      if (niveau === 0) sortie.push('');
    } else if (tag === 'table') {
      const rangees: string[][] = [];
      for (const tr of Array.from(enfant.querySelectorAll('tr') as Noeud[])) {
        const cellules = Array.from(tr.children as Noeud[])
          .filter((c) => ['td', 'th'].includes(c.tagName.toLowerCase()))
          .map((c) => propre(enLigne(c)).replace(/\|/g, '/'));
        if (cellules.some((c) => c)) rangees.push(cellules);
      }
      if (rangees.length) sortie.push('', tableauMarkdown(rangees), '');
    } else if (['p', 'div', 'section', 'article', 'blockquote', 'li', 'body', 'main'].includes(tag)) {
      const aDesBlocs = enfant.querySelector?.('p,div,ul,ol,table,h1,h2,h3,h4,h5,h6');
      if (aDesBlocs) blocs(enfant, niveau, sortie);
      else {
        const t = propre(enLigne(enfant));
        if (t) sortie.push(t, '');
      }
    } else if (tag === 'br') {
      sortie.push('');
    } else {
      const t = propre(enLigne(enfant));
      if (t) sortie.push(t);
    }
  }
}

export function htmlVersMarkdown(html: string): string | null {
  const Parseur = (globalThis as any).DOMParser;
  if (!Parseur || !/<(ul|ol|table|h[1-6]|strong|b)\b/i.test(html)) return null;
  const doc = new Parseur().parseFromString(html, 'text/html');
  const sortie: string[] = [];
  blocs(doc.body, 0, sortie);
  const texte = sortie.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  return texte || null;
}
