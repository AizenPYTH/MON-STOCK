// Metro : l'application mobile importe les modules métier PURS du dépôt (`@/domain/…`,
// `@/features/…/*.pure.ts`, contrat de l'API…) directement depuis ../../src, sans les copier.
// tests/unit/shared-boundary.test.ts (racine) garantit que ces modules restent sans dépendance web/serveur.
const path = require("node:path");
const { getDefaultConfig } = require("expo/metro-config");

const projectRoot = __dirname;
const repoRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

// Seul le dossier src/ partagé est surveillé (pas le node_modules web : React 19.3 de Next.js).
config.watchFolders = [path.join(repoRoot, "src")];
// Les dépendances des fichiers partagés (zod…) sont résolues dans le node_modules du mobile,
// y compris sur EAS Build où seules les dépendances de apps/mobile sont installées.
config.resolver.nodeModulesPaths = [path.join(projectRoot, "node_modules")];
config.resolver.disableHierarchicalLookup = false;

module.exports = config;
