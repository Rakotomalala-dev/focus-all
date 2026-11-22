// Preset ESLint partagé (config plate ESLint 9) — doc 04.
// Consommé par le `eslint.config.js` racine et par les paquets du monorepo.
const js = require("@eslint/js");
const tseslint = require("typescript-eslint");
const react = require("eslint-plugin-react");
const reactHooks = require("eslint-plugin-react-hooks");
const prettier = require("eslint-config-prettier");

/** Motifs ignorés partout : artefacts de build, caches, dépendances, générés. */
const IGNORES = [
  "**/node_modules/**",
  "**/dist/**",
  "**/build/**",
  "**/out/**",
  "**/.expo/**",
  "**/.turbo/**",
  "**/coverage/**",
  "**/generated/**",
  "**/playwright-report/**",
  "**/test-results/**",
];

module.exports = [
  { ignores: IGNORES },

  js.configs.recommended,

  // Fichiers JavaScript de configuration (CJS) : globals Node explicites.
  {
    files: ["**/*.{js,cjs,mjs}"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "commonjs",
      globals: {
        require: "readonly",
        module: "writable",
        exports: "writable",
        process: "readonly",
        __dirname: "readonly",
        __filename: "readonly",
        console: "readonly",
      },
    },
  },

  // TypeScript / TSX — règles TS-1..TS-8 et R6/R7 du doc 04.
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parser: tseslint.parser,
      ecmaVersion: 2022,
      sourceType: "module",
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { "@typescript-eslint": tseslint.plugin },
    rules: {
      ...tseslint.configs.recommended.reduce(
        (acc, config) => ({ ...acc, ...(config.rules ?? {}) }),
        {},
      ),
      "no-undef": "off",
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-non-null-assertion": "error",
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports", fixStyle: "separate-type-imports" },
      ],
      "@typescript-eslint/no-import-type-side-effects": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "axios",
              message:
                "Appel HTTP interdit hors d'un client encapsulé (src/data/http) — doc 04 R7 / ADR-008.",
            },
          ],
          patterns: [
            {
              group: ["@focus/*/src/*"],
              message:
                "Import profond interdit : passer par la surface `exports` du paquet — doc 01 R6.",
            },
          ],
        },
      ],
    },
  },

  // React (web + React Native) — règles RC-1..RC-10.
  {
    files: ["**/*.tsx"],
    plugins: { react, "react-hooks": reactHooks },
    settings: { react: { version: "detect" } },
    rules: {
      ...react.configs.recommended.rules,
      "react/react-in-jsx-scope": "off",
      "react/jsx-uses-react": "off",
      "react/prop-types": "off",
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "error",
    },
  },

  // Seul le client HTTP encapsulé peut importer Axios (ADR-008).
  {
    files: ["**/src/data/http/**/*.{ts,tsx}"],
    rules: { "no-restricted-imports": "off" },
  },

  // Règles transverses (doc 04 §3 et §7).
  {
    rules: {
      eqeqeq: ["error", "always"],
      "prefer-const": "error",
      "no-var": "error",
      "no-console": ["error", { allow: ["warn", "error"] }],
      "no-debugger": "error",
    },
  },

  // Toujours en dernier : désactive les règles de formatage couvertes par Prettier.
  prettier,
];
