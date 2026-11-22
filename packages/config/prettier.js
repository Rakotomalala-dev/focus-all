// Preset Prettier partagé, référencé par `"prettier": "@focus/config/prettier"`
// dans le package.json racine (doc 04 §10.4 : formatage homogène, LF partout).
/** @type {import("prettier").Config} */
module.exports = {
  semi: true,
  singleQuote: false,
  trailingComma: "all",
  printWidth: 100,
  tabWidth: 2,
  useTabs: false,
  arrowParens: "always",
  bracketSpacing: true,
  endOfLine: "lf",
  overrides: [{ files: "*.md", options: { proseWrap: "preserve" } }],
};
