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
// Évite qu'une dépendance soit résolue deux fois (unespace pnpm non plat).
config.resolver.disableHierarchicalLookup = true;

module.exports = config;
