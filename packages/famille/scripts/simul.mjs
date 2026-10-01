// Doublures de react-native et AsyncStorage pour les tests sous Node.
export const journal = { ouverts: [], refuserOuverture: false };
export const Platform = { OS: 'android' };
export const Linking = {
  async openURL(url) {
    if (journal.refuserOuverture) throw new Error('No activity found');
    journal.ouverts.push(url);
  },
};
const memoire = new Map();
const AsyncStorage = {
  async getItem(k) { return memoire.has(k) ? memoire.get(k) : null; },
  async setItem(k, v) { memoire.set(k, String(v)); },
  async removeItem(k) { memoire.delete(k); },
};
export default AsyncStorage;
