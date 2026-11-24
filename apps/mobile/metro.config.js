// Metro doit connaître la racine du monorepo (doc 01 ADR-001) : sans cela,
// les paquets @focus/* et les dépendances hissées ne sont pas résolus.
const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];
// La résolution hiérarchique doit rester active : avec le layout pnpm isolé,
// les dépendances internes d'expo-router vivent à côté de lui dans le store
// virtuel (node_modules/.pnpm/...), hors de nodeModulesPaths.

module.exports = config;
