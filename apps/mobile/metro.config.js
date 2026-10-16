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

// APERÇU VISUEL (jamais dans une build) : MONSTOCK_PREVIEW=1 remplace Supabase et l'API par la base
// de démonstration en mémoire de preview/ pour contrôler les écrans dans un navigateur.
// MONSTOCK_PREVIEW_MODULES : dossier node_modules contenant react-native-web (non installé ici).
if (process.env.MONSTOCK_PREVIEW === "1") {
  const swaps = {
    [path.join(projectRoot, "src/lib/supabase.ts")]: path.join(projectRoot, "preview/mock-supabase.ts"),
    [path.join(projectRoot, "src/lib/api.ts")]: path.join(projectRoot, "preview/mock-api.ts"),
  };
  if (process.env.MONSTOCK_PREVIEW_MODULES) {
    config.resolver.nodeModulesPaths.push(process.env.MONSTOCK_PREVIEW_MODULES);
    config.watchFolders.push(process.env.MONSTOCK_PREVIEW_MODULES);
  }
  const upstream = config.resolver.resolveRequest;
  config.resolver.resolveRequest = (context, moduleName, platform) => {
    const res = upstream ? upstream(context, moduleName, platform) : context.resolveRequest(context, moduleName, platform);
    const swap = res && res.type === "sourceFile" ? swaps[res.filePath] : undefined;
    return swap ? { type: "sourceFile", filePath: swap } : res;
  };
}

module.exports = config;
