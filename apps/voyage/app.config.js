// Configuration Expo : celle d'app.json, plus, pour le site web commun aux
// apps de la famille, le chemin de l'app sur ce site (ex. /voyages), passé
// par la variable EXPO_PUBLIC_BASE_WEB (voir scripts/construire-site.mjs à
// la racine). Sans cette variable (développement, téléphones), rien ne
// change.
module.exports = ({ config }) => {
  const base = process.env.EXPO_PUBLIC_BASE_WEB;
  if (!base) return config;
  return { ...config, experiments: { ...(config.experiments ?? {}), baseUrl: base } };
};
