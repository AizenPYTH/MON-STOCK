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
      // Q-23 : `npm run test:coverage` (tests unitaires, src/ et server/ entiers, fichiers non testés
      // compris). Seuils = plancher anti-régression, mesuré le 23/10/2026 (instructions 58,7 %, branches
      // 44,1 %, fonctions 51,8 %, lignes 60,3 %) moins ~3 points de marge : à relever avec les tests.
      provider: "v8",
      include: ["src/**/*.{ts,tsx}", "server/**/*.ts"],
      exclude: ["src/db/database.types.ts", "**/*.d.ts"],
      reporter: ["text-summary", "json-summary"],
      reportsDirectory: path.resolve(root, "node_modules/.cache/coverage"),
      thresholds: { lines: 57, statements: 55, functions: 48, branches: 41 },
    },
  },
});
