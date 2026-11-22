// Config plate ESLint racine : consomme le preset partagé de @focus/config.
// Les paquets exécutent `eslint .` et remontent jusqu'à ce fichier.
const preset = require("@focus/config/eslint-preset");

module.exports = [...preset, { ignores: ["docs/**", "**/*.md"] }];
