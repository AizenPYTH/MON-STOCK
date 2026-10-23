import { defineConfig } from "vitest/config";
import path from "node:path";

// Q-20 : `import.meta.dirname` (module ESM natif) plutôt que `__dirname` (avertissement de Vite).
const root = import.meta.dirname;

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(root, "src"),
      // `server-only` lève une erreur hors environnement React Server : neutralisé pour les tests.
      "server-only": path.resolve(root, "tests/stubs/server-only.ts"),
    },
  },
  test: {
    // Tests de composants (W-16) : fichiers `.test.tsx`, environnement DOM déclaré en tête de fichier
    // (`// @vitest-environment happy-dom`) ; tout le reste tourne sous Node.
    include: ["tests/unit/**/*.test.{ts,tsx}", "tests/integration/**/*.test.ts"],
    environment: "node",
    testTimeout: 20_000,
    hookTimeout: 60_000,
    coverage: {
      // Q-23 : `npm run test:coverage` (tests unitaires). Seuils = plancher anti-régression, mesurés
      // le 23/10/2026 (lignes 47,9 %, instructions 46,7 %, fonctions 45,4 %, branches 41,1 %) et
      // arrondis à l'entier inférieur moins 2 points : à relever au fil des ajouts de tests.
      provider: "v8",
      include: ["src/**/*.{ts,tsx}", "server/**/*.ts"],
      exclude: ["src/db/database.types.ts", "**/*.d.ts"],
      reporter: ["text-summary", "json-summary"],
      reportsDirectory: path.resolve(root, "node_modules/.cache/coverage"),
      thresholds: { lines: 45, statements: 44, functions: 43, branches: 39 },
    },
  },
});
