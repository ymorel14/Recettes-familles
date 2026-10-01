// Crochets de chargement pour tester le code du paquet sous Node : les
// modules React Native sont remplacés par de petites doublures (simul.mjs),
// et les imports relatifs sans extension retrouvent leur fichier .ts.
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const DOUBLURES = new Set(['react-native', '@react-native-async-storage/async-storage']);

export async function resolve(specifier, context, next) {
  if (DOUBLURES.has(specifier)) {
    return { url: new URL('./simul.mjs', import.meta.url).href + '#' + encodeURIComponent(specifier), shortCircuit: true };
  }
  if (specifier.startsWith('.') && !specifier.includes('#') && context.parentURL && !/\.[cm]?[jt]sx?$/.test(specifier)) {
    const candidat = new URL(specifier + '.ts', context.parentURL);
    if (existsSync(fileURLToPath(candidat))) return { url: candidat.href, shortCircuit: true };
  }
  return next(specifier, context);
}
